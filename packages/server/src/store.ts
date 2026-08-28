import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Character, Job, ScaleFactor, SimResult } from '@rbl/shared';
import { config, paths } from './config.js';

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

/** Escritura atómica: primero a un temporal, luego rename. */
function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

export function newId(): string {
  return crypto.randomBytes(8).toString('hex');
}

// ---------------------------------------------------------------------------
// Personajes
// ---------------------------------------------------------------------------

export function listCharacters(): Character[] {
  return readJson<Character[]>(paths.characters(), []);
}

export function getCharacter(id: string): Character | undefined {
  return listCharacters().find((character) => character.id === id);
}

export function saveCharacter(character: Character): Character {
  const characters = listCharacters();
  const index = characters.findIndex((c) => c.id === character.id);
  const updated = { ...character, updatedAt: new Date().toISOString() };
  if (index >= 0) characters[index] = updated;
  else characters.push(updated);
  writeJson(paths.characters(), characters);
  return updated;
}

export function deleteCharacter(id: string): boolean {
  const characters = listCharacters();
  const next = characters.filter((character) => character.id !== id);
  if (next.length === characters.length) return false;
  writeJson(paths.characters(), next);
  return true;
}

// ---------------------------------------------------------------------------
// Trabajos
// ---------------------------------------------------------------------------

export function listJobs(): Job[] {
  return readJson<Job[]>(paths.jobs(), []);
}

export function saveJob(job: Job): void {
  const jobs = listJobs();
  const index = jobs.findIndex((j) => j.id === job.id);
  if (index >= 0) jobs[index] = job;
  else jobs.unshift(job);
  // Historial acotado: 200 trabajos.
  writeJson(paths.jobs(), jobs.slice(0, 200));
}

export function getJob(id: string): Job | undefined {
  return listJobs().find((job) => job.id === id);
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------

function resultPath(jobId: string): string {
  return path.join(paths.resultsDir(), `${jobId}.json`);
}

export function saveResult(result: SimResult): void {
  writeJson(resultPath(result.jobId), result);
}

export function getResult(jobId: string): SimResult | undefined {
  const file = resultPath(jobId);
  if (!fs.existsSync(file)) return undefined;
  return readJson<SimResult | undefined>(file, undefined);
}

export function runDir(jobId: string): string {
  return path.join(paths.runsDir(), jobId);
}

/** Borra los ficheros temporales de una ejecución (perfil, log, json crudo). */
export function cleanupRun(jobId: string): void {
  const dir = runDir(jobId);
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

export function stateSize(): number {
  try {
    return fs.readdirSync(paths.resultsDir()).length;
  } catch {
    return 0;
  }
}

export { config };

/**
 * Cuánto tarda una variante en este ordenador, en segundos.
 *
 * Se saca de lo que ya se ha simulado aquí en vez de usar una constante: el
 * ritmo depende del procesador, de los hilos y de la precisión pedida, así que
 * cualquier número fijo mentiría en la mitad de las máquinas. Sin historial
 * suficiente devuelve `undefined` y quien lo use debe callarse la estimación en
 * vez de inventarla.
 */
export function secondsPerProfile(): number | undefined {
  let seconds = 0;
  let profiles = 0;

  for (const job of listJobs()) {
    if (job.status !== 'done' || !job.profilesetCount) continue;
    const result = getResult(job.id);
    if (!result?.elapsedMs) continue;
    seconds += result.elapsedMs / 1000;
    profiles += job.profilesetCount;
  }

  if (profiles < 10) return undefined;
  return seconds / profiles;
}

/**
 * Los pesos de estadística más recientes de un personaje.
 *
 * El buscador de mejoras los necesita para ordenar candidatos. Salen de la
 * última simulación que los calculó, no de una tabla genérica por spec: los
 * pesos dependen del equipo que llevas puesto y cambian según te equipas.
 */
export function latestScaleFactors(characterId: string): ScaleFactor[] | undefined {
  for (const job of listJobs()) {
    if (job.characterId !== characterId || job.status !== 'done') continue;
    const result = getResult(job.id);
    if (result?.scaleFactors?.length) return result.scaleFactors;
  }
  return undefined;
}
