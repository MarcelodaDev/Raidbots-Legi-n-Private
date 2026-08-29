import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Raíz del repositorio (packages/server/src -> ../../..). */
export const ROOT = path.resolve(here, '..', '..', '..');

export const config = {
  port: Number(process.env.PORT ?? 7331),
  host: process.env.HOST ?? '127.0.0.1',

  /** Datos generados: base de ítems, consumibles. */
  dataDir: process.env.RBL_DATA_DIR ?? path.join(ROOT, 'data'),

  /** Estado de la app: personajes, trabajos, resultados. */
  stateDir: process.env.RBL_STATE_DIR ?? path.join(ROOT, '.rbl'),

  /** Dónde busca la app el binario de SimulationCraft. */
  simcPath: process.env.SIMC_PATH,

  /** Cuántas simulaciones se ejecutan a la vez (simc ya usa todos los hilos). */
  concurrency: Number(process.env.RBL_CONCURRENCY ?? 1),

  /** Tope duro de perfilesets por trabajo, para no colgar la máquina. */
  maxProfilesets: Number(process.env.RBL_MAX_PROFILESETS ?? 10000),

  /** Timeout por simulación en minutos. */
  timeoutMinutes: Number(process.env.RBL_TIMEOUT_MIN ?? 120),

  cpuCount: os.cpus().length,
};

export const paths = {
  characters: () => path.join(config.stateDir, 'characters.json'),
  jobs: () => path.join(config.stateDir, 'jobs.json'),
  resultsDir: () => path.join(config.stateDir, 'results'),
  runsDir: () => path.join(config.stateDir, 'runs'),
  lootTable: () => path.join(config.stateDir, 'loot.json'),
  itemDb: () => path.join(config.dataDir, 'items.json'),
  knownItemDb: () => path.join(config.dataDir, 'known-items.json'),
  consumableDb: () => path.join(config.dataDir, 'consumables.json'),
};

export function ensureDirs(): void {
  for (const dir of [
    config.stateDir,
    config.dataDir,
    paths.resultsDir(),
    paths.runsDir(),
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
