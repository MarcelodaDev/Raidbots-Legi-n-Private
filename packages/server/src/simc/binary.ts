import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { SimcStatus } from '@rbl/shared';
import { ROOT, config } from '../config.js';

const execFileAsync = promisify(execFile);

/** Rutas donde buscamos simc si no se define SIMC_PATH. */
function candidatePaths(): string[] {
  const exe = process.platform === 'win32' ? 'simc.exe' : 'simc';
  const candidates: string[] = [];
  if (config.simcPath) candidates.push(config.simcPath);
  candidates.push(
    path.join(ROOT, 'vendor', 'simc', 'engine', exe),
    path.join(ROOT, 'vendor', 'simc', exe),
    path.join(ROOT, 'bin', exe),
  );
  return candidates;
}

let cached: SimcStatus | null = null;

export function resolveSimcPath(): string | undefined {
  for (const candidate of candidatePaths()) {
    try {
      // En Windows no hay permiso de ejecución que comprobar, así que basta
      // con que el fichero exista.
      const mode = process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK;
      fs.accessSync(candidate, mode);
      return candidate;
    } catch {
      // seguimos buscando
    }
  }
  return undefined;
}

/** Rutas probadas y si existe algo en cada una, para poder diagnosticar. */
export function simcSearchReport(): { path: string; exists: boolean }[] {
  return candidatePaths().map((candidate) => ({
    path: candidate,
    exists: fs.existsSync(candidate),
  }));
}

/**
 * Comprueba que el binario existe y extrae su versión.
 *
 * SimulationCraft imprime en la cabecera algo como:
 *   SimulationCraft 735-01 for World of Warcraft 7.3.5 26365 Live (hotfix ...)
 */
export async function getSimcStatus(force = false): Promise<SimcStatus> {
  if (cached && !force) return cached;

  const simcPath = resolveSimcPath();
  if (!simcPath) {
    // Decir dónde se ha buscado ahorra la mitad de los problemas de
    // instalación: casi siempre el binario está, pero una carpeta más adentro.
    const tried = simcSearchReport()
      .map((entry) => `  ${entry.exists ? '(existe pero no se pudo usar)' : 'no está'}  ${entry.path}`)
      .join('\n');
    cached = {
      available: false,
      searched: simcSearchReport(),
      error:
        'No se encontró el binario de SimulationCraft. Rutas probadas:\n' +
        tried +
        `\n\nCopia el binario a ${path.join(ROOT, 'bin')} (debe quedar como ` +
        `${path.join(ROOT, 'bin', process.platform === 'win32' ? 'simc.exe' : 'simc')}), ` +
        'o define la variable SIMC_PATH apuntando al binario.',
    };
    return cached;
  }

  try {
    // `simc` sin argumentos imprime la cabecera y sale.
    const { stdout, stderr } = await execFileAsync(simcPath, [], {
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    const header = `${stdout}\n${stderr}`;
    const match = header.match(
      /SimulationCraft\s+(\S+)\s+for\s+World\s+of\s+Warcraft\s+(\S+)/i,
    );
    cached = {
      available: true,
      path: simcPath,
      version: match?.[1] ?? 'desconocida',
      wowVersion: match?.[2] ?? 'desconocida',
    };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const header = `${e.stdout ?? ''}\n${e.stderr ?? ''}`;
    const match = header.match(
      /SimulationCraft\s+(\S+)\s+for\s+World\s+of\s+Warcraft\s+(\S+)/i,
    );
    if (match) {
      // simc devuelve código != 0 cuando no recibe perfil, pero ya nos ha
      // dicho su versión: es un binario válido.
      cached = {
        available: true,
        path: simcPath,
        version: match[1],
        wowVersion: match[2],
      };
    } else {
      cached = {
        available: false,
        path: simcPath,
        error:
          `El binario está en ${simcPath}, pero no arrancó.\n\n` +
          `${e.message ?? 'error desconocido'}\n\n` +
          'Pruébalo suelto desde una terminal en esa ruta: debe imprimir su ' +
          'versión y luego quejarse de que no le has dado nada que simular. ' +
          'Si no imprime nada, el binario no sirve para tu sistema.',
      };
    }
  }

  return cached;
}

export function invalidateSimcCache(): void {
  cached = null;
}
