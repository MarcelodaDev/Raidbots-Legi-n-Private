import fs from 'node:fs';
import { paths } from '../config.js';

/**
 * De dónde cae cada pieza.
 *
 * SimulationCraft no lo sabe: su DBC trae ítems, hechizos y escalados, pero no
 * la tabla de botín. El cliente sí, porque es lo que enseña el Diario de
 * Mazmorras, así que lo vuelca el addon y aquí se guarda.
 *
 * Una pieza puede caer de varios jefes, así que cada id lleva una lista.
 */
export interface LootTable {
  /** itemId -> ["Instancia / Jefe", ...] */
  sources: Record<number, string[]>;
  /** Cuándo se importó, para saber si está vieja. */
  importedAt: string;
  bosses: number;
}

let table: LootTable | null = null;

export function loadLoot(): void {
  const file = paths.lootTable();
  if (!fs.existsSync(file)) {
    table = null;
    return;
  }
  try {
    table = JSON.parse(fs.readFileSync(file, 'utf8')) as LootTable;
  } catch {
    // Un fichero corrupto no debe tumbar el arranque: sin tabla se sigue
    // funcionando igual, solo que sin decir de dónde cae cada pieza.
    table = null;
  }
}

export function lootStatus(): { available: boolean; items: number; bosses: number; importedAt?: string } {
  if (!table) return { available: false, items: 0, bosses: 0 };
  return {
    available: true,
    items: Object.keys(table.sources).length,
    bosses: table.bosses,
    importedAt: table.importedAt,
  };
}

/** De dónde cae este ítem. Lista vacía si no se sabe. */
export function lootSources(itemId: number): string[] {
  return table?.sources[itemId] ?? [];
}

/**
 * Lee el volcado del addon.
 *
 * Formato de cada línea: `# drop:<itemId>=<Instancia> / <Jefe>`. Todo lo demás
 * (cabecera, comentarios) se ignora.
 */
export function parseLootDump(text: string): LootTable {
  const sources: Record<number, string[]> = {};
  const bosses = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const match = /^#\s*drop:(\d+)=(.+)$/.exec(rawLine.trim());
    if (!match) continue;

    const itemId = Number.parseInt(match[1], 10);
    const source = match[2].trim();
    if (!Number.isFinite(itemId) || itemId <= 0 || !source) continue;

    bosses.add(source);
    const list = (sources[itemId] ??= []);
    // Un mismo jefe puede aparecer repetido si se escanea dos veces.
    if (!list.includes(source)) list.push(source);
  }

  return { sources, importedAt: new Date().toISOString(), bosses: bosses.size };
}

export function saveLoot(next: LootTable): LootTable {
  table = next;
  fs.writeFileSync(paths.lootTable(), JSON.stringify(next));
  return next;
}

export function clearLoot(): void {
  table = null;
  const file = paths.lootTable();
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
