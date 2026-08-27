import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config } from '../config.js';
import { getSimcStatus } from './binary.js';

export interface ProgressUpdate {
  /** 0-100 dentro de la fase actual. */
  percent: number;
  phase: string;
  line: string;
}

export interface RunSimcOptions {
  profileText: string;
  /** Argumentos extra en formato `opcion=valor`. */
  args?: string[];
  runDir: string;
  onProgress?: (update: ProgressUpdate) => void;
  onLog?: (line: string) => void;
  signal?: AbortSignal;
}

export interface SimcRunResult {
  json: any;
  log: string[];
  elapsedMs: number;
  jsonPath: string;
}

/**
 * `Profilesets (4*1): 12/240 [===>.....]`
 * `Generating Baseline: Nombre 1/2 [>........] 2405/60000 9sec`
 */
const PROFILESET_RE = /Profilesets\s*\([^)]*\):\s*(\d+)\/(\d+)/;
const BASELINE_RE = /(\d+)\/(\d+)\s+\d+\s*(?:sec|min)/;

function parseProgress(chunk: string): ProgressUpdate | null {
  const profileset = chunk.match(PROFILESET_RE);
  if (profileset) {
    const done = Number(profileset[1]);
    const total = Number(profileset[2]);
    return {
      percent: total > 0 ? (done / total) * 100 : 0,
      phase: `Simulando perfiles ${done}/${total}`,
      line: chunk,
    };
  }

  const baseline = chunk.match(BASELINE_RE);
  if (baseline) {
    const done = Number(baseline[1]);
    const total = Number(baseline[2]);
    return {
      percent: total > 0 ? (done / total) * 100 : 0,
      phase: `Perfil base: ${done}/${total} iteraciones`,
      line: chunk,
    };
  }

  return null;
}

/** Errores de simc que merecen llegar al usuario tal cual. */
const ERROR_RE = /^(ERROR|Error|error)[!:]?\s+(.*)$/;

export async function runSimc(opts: RunSimcOptions): Promise<SimcRunResult> {
  const status = await getSimcStatus();
  if (!status.available || !status.path) {
    throw new Error(status.error ?? 'SimulationCraft no está disponible.');
  }

  fs.mkdirSync(opts.runDir, { recursive: true });
  const profilePath = path.join(opts.runDir, 'profile.simc');
  const jsonPath = path.join(opts.runDir, 'result.json');
  fs.writeFileSync(profilePath, opts.profileText, 'utf8');

  const args = [profilePath, `json2=${jsonPath}`, ...(opts.args ?? [])];

  const started = Date.now();
  const log: string[] = [];

  const child = spawn(status.path, args, {
    cwd: opts.runDir,
    // Sin shell: los argumentos van tal cual, nada de expansión.
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const timeout = setTimeout(
    () => child.kill('SIGKILL'),
    config.timeoutMinutes * 60_000,
  );

  const onAbort = () => child.kill('SIGTERM');
  opts.signal?.addEventListener('abort', onAbort, { once: true });

  let pending = '';
  const handleData = (data: Buffer) => {
    pending += data.toString('utf8');
    // simc reescribe la barra de progreso con \r; tratamos ambos como salto.
    const chunks = pending.split(/[\r\n]/);
    pending = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const line = chunk.trimEnd();
      if (!line) continue;

      const progress = parseProgress(line);
      if (progress) {
        opts.onProgress?.(progress);
        continue;
      }

      log.push(line);
      opts.onLog?.(line);
      // Nos quedamos con las últimas 500 líneas útiles.
      if (log.length > 500) log.shift();
    }
  };

  child.stdout.on('data', handleData);
  child.stderr.on('data', handleData);

  const exitCode: number = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? -1));
  });

  clearTimeout(timeout);
  opts.signal?.removeEventListener('abort', onAbort);

  fs.writeFileSync(path.join(opts.runDir, 'simc.log'), log.join('\n'), 'utf8');

  if (opts.signal?.aborted) {
    throw new Error('Simulación cancelada.');
  }

  if (!fs.existsSync(jsonPath)) {
    const errorLines = log.filter((l) => ERROR_RE.test(l));
    const detail = errorLines.length ? errorLines.join('\n') : log.slice(-15).join('\n');
    throw new Error(
      `SimulationCraft terminó con código ${exitCode} y no generó resultados.\n${detail}`,
    );
  }

  const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  return { json, log, elapsedMs: Date.now() - started, jsonPath };
}
