import { EventEmitter } from 'node:events';
import type { Job, SimRequest, SimResult } from '@rbl/shared';
import { config } from './config.js';
import { buildSim } from './sims/build.js';
import { runSimc } from './simc/runner.js';
import { extractWarnings, parseSimcJson } from './simc/parse.js';
import {
  getCharacter,
  newId,
  runDir,
  saveJob,
  saveResult,
} from './store.js';

interface QueueEntry {
  job: Job;
  request: SimRequest;
  controller: AbortController;
  log: string[];
}

const SIM_LABELS: Record<string, string> = {
  quick: 'Sim rápida',
  droptimizer: 'Droptimizer',
  topgear: 'Top Gear',
  talents: 'Talentos',
  consumables: 'Consumibles',
  relics: 'Reliquias',
  enchants: 'Encantamientos',
  gems: 'Gemas',
};

class SimQueue extends EventEmitter {
  private entries = new Map<string, QueueEntry>();
  private pending: string[] = [];
  private running = 0;

  /** Encola una simulación y devuelve el trabajo creado. */
  enqueue(request: SimRequest): Job {
    const character = getCharacter(request.characterId);
    if (!character) {
      throw new Error('No se encontró el personaje indicado.');
    }

    // Construimos aquí para fallar rápido si la configuración es inválida.
    const built = buildSim(character, request);

    const job: Job = {
      id: newId(),
      status: 'queued',
      type: request.config.type,
      label:
        request.label?.trim() ||
        `${SIM_LABELS[request.config.type] ?? request.config.type} · ${character.name}`,
      characterId: character.id,
      characterName: character.name,
      progress: 0,
      phase: 'En cola',
      createdAt: new Date().toISOString(),
      profilesetCount: built.profilesetCount,
    };

    this.entries.set(job.id, {
      job,
      request,
      controller: new AbortController(),
      log: [],
    });
    this.pending.push(job.id);
    saveJob(job);
    this.emit('job', job);
    queueMicrotask(() => this.drain());
    return job;
  }

  cancel(jobId: string): boolean {
    const entry = this.entries.get(jobId);
    if (!entry) return false;
    if (entry.job.status === 'done' || entry.job.status === 'error') return false;

    entry.controller.abort();
    this.pending = this.pending.filter((id) => id !== jobId);
    if (entry.job.status === 'queued') {
      this.update(entry, { status: 'cancelled', phase: 'Cancelada' });
    }
    return true;
  }

  getLog(jobId: string): string[] {
    return this.entries.get(jobId)?.log ?? [];
  }

  private update(entry: QueueEntry, patch: Partial<Job>): void {
    entry.job = { ...entry.job, ...patch };
    saveJob(entry.job);
    this.emit('job', entry.job);
  }

  private drain(): void {
    while (this.running < config.concurrency && this.pending.length) {
      const jobId = this.pending.shift();
      if (!jobId) break;
      const entry = this.entries.get(jobId);
      if (!entry) continue;
      this.running++;
      void this.run(entry).finally(() => {
        this.running--;
        this.drain();
      });
    }
  }

  private async run(entry: QueueEntry): Promise<void> {
    const character = getCharacter(entry.request.characterId);
    if (!character) {
      this.update(entry, {
        status: 'error',
        error: 'El personaje ya no existe.',
        finishedAt: new Date().toISOString(),
      });
      return;
    }

    this.update(entry, {
      status: 'running',
      startedAt: new Date().toISOString(),
      phase: 'Preparando perfil',
      progress: 0,
    });

    try {
      const built = buildSim(character, entry.request);

      const run = await runSimc({
        profileText: built.profileText,
        args: built.args,
        runDir: runDir(entry.job.id),
        signal: entry.controller.signal,
        onProgress: (update) => {
          this.update(entry, {
            progress: Math.min(99, Math.round(update.percent)),
            phase: update.phase,
          });
        },
        onLog: (line) => {
          entry.log.push(line);
          if (entry.log.length > 500) entry.log.shift();
          this.emit('log', { jobId: entry.job.id, line });
        },
      });

      const parsed = parseSimcJson(run.json, built.meta);

      // Si simc no devuelve los perfiles que le pedimos, algo se ha perdido por
      // el camino (una línea mal formada, por ejemplo) y el resultado engañaría.
      if (built.profilesetCount > 0 && !parsed.profilesets?.length) {
        throw new Error(
          `Se enviaron ${built.profilesetCount} perfiles pero SimulationCraft no ` +
            'devolvió ninguno. Revisa la salida del motor más abajo.',
        );
      }

      const result: SimResult = {
        jobId: entry.job.id,
        type: entry.request.config.type,
        label: entry.job.label,
        characterId: character.id,
        characterName: character.name,
        spec: parsed.spec || character.spec,
        class: character.class,
        simcVersion: parsed.simcVersion,
        wowVersion: parsed.wowVersion,
        options: entry.request.options,
        baseline: parsed.baseline,
        breakdown: parsed.breakdown,
        scaleFactors: parsed.scaleFactors,
        profilesets: parsed.profilesets,
        warnings: [...built.warnings, ...extractWarnings(run.log)],
        iterations: parsed.iterations,
        elapsedMs: run.elapsedMs,
        finishedAt: new Date().toISOString(),
      };

      saveResult(result);
      this.update(entry, {
        status: 'done',
        progress: 100,
        phase: 'Completada',
        finishedAt: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const cancelled = entry.controller.signal.aborted;
      this.update(entry, {
        status: cancelled ? 'cancelled' : 'error',
        phase: cancelled ? 'Cancelada' : 'Error',
        error: cancelled ? undefined : message,
        finishedAt: new Date().toISOString(),
      });
    }
  }
}

export const queue = new SimQueue();

/** Calcula cuántos perfiles generaría una petición, sin ejecutarla. */
export function planSim(request: SimRequest): {
  profilesetCount: number;
  warnings: string[];
} {
  const character = getCharacter(request.characterId);
  if (!character) throw new Error('No se encontró el personaje indicado.');
  const built = buildSim(character, request);
  return { profilesetCount: built.profilesetCount, warnings: built.warnings };
}
