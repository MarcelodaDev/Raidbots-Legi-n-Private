import fs from 'node:fs';
import { validateCustomItem, type CustomItem, type GearItem, type GearSlot } from '@rbl/shared';
import { paths } from '../config.js';
import { simcKnowsItem } from './itemdb.js';

/**
 * Catálogo de las piezas que SimulationCraft no conoce.
 *
 * Un servidor progresivo reparte equipo de parches posteriores a 7.3.5. El
 * motor no tiene sus datos, pero el cliente sí: el addon los lee del tooltip y
 * llegan en el export. Guardarlos aquí, y no dentro de cada personaje, es lo
 * que hace que describir una pieza sea una sola vez y no una por simulación:
 * la próxima importación —de este personaje o de otro— ya la encuentra.
 */
export interface CustomItemEntry {
  itemId: number;
  name: string;
  slot?: GearSlot;
  ilevel?: number;
  /** Estadísticas en formato simc, leídas del cliente. */
  stats: string;
  /** Texto literal del efecto, tal cual lo enseña el juego. Sin traducir. */
  effectText?: string;
  /** Efecto de «Uso» ya traducido al formato de simc, si alguien lo ha escrito. */
  use?: string;
  /** Efecto pasivo ya traducido. */
  equip?: string;
  /** Cuándo entró al catálogo. */
  addedAt: string;
  /** De qué personaje salió, solo para saber de dónde viene el dato. */
  seenOn?: string;
}

/**
 * Dos capas.
 *
 * `data/custom-items.json` va en el repositorio: es el catálogo compartido, lo
 * que alguien escaneó una vez para que no tenga que hacerlo nadie más. Encima
 * va el de esta instalación (`.rbl/custom-items.json`), con lo que haya añadido
 * o corregido quien la usa. Lo local manda, para poder arreglar una entrada
 * equivocada sin esperar a que se actualice el repositorio.
 */
let shipped = new Map<number, CustomItemEntry>();
let local = new Map<number, CustomItemEntry>();

function readCatalogue(file: string): Map<number, CustomItemEntry> {
  if (!fs.existsSync(file)) return new Map();
  try {
    const list = JSON.parse(fs.readFileSync(file, 'utf8')) as CustomItemEntry[];
    return new Map(list.map((entry) => [entry.itemId, entry]));
  } catch {
    // Un fichero corrupto no debe impedir arrancar: sin catálogo se sigue
    // pudiendo describir las piezas a mano.
    return new Map();
  }
}

export function loadCustomItems(): void {
  shipped = readCatalogue(paths.sharedCustomItems());
  local = readCatalogue(paths.customItems());
}

/** El catálogo efectivo: lo compartido con lo local encima. */
function merged(): Map<number, CustomItemEntry> {
  const all = new Map(shipped);
  for (const [id, entry] of local) all.set(id, entry);
  return all;
}

function persist(): void {
  fs.writeFileSync(paths.customItems(), JSON.stringify([...local.values()], null, 2));
}

export function listCustomItems(): CustomItemEntry[] {
  return [...merged().values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function customItemsStatus(): {
  available: boolean;
  items: number;
  withEffect: number;
  shipped: number;
  local: number;
} {
  const all = [...merged().values()];
  return {
    available: all.length > 0,
    items: all.length,
    withEffect: all.filter((entry) => entry.use || entry.equip).length,
    shipped: shipped.size,
    local: local.size,
  };
}

export function getCustomItem(itemId: number): CustomItemEntry | undefined {
  return local.get(itemId) ?? shipped.get(itemId);
}

/** Lo que hay que pasarle a simc para esta pieza, o nada si no está. */
export function customItemFor(itemId: number): CustomItem | undefined {
  const entry = getCustomItem(itemId);
  if (!entry?.stats) return undefined;
  return { stats: entry.stats, use: entry.use, equip: entry.equip };
}

export function upsertCustomItem(entry: CustomItemEntry): CustomItemEntry {
  const previous = getCustomItem(entry.itemId);
  // Lo que ha escrito una persona (la traducción del efecto) manda sobre lo que
  // vuelve a leer el addon, que solo sabe de estadísticas.
  const next: CustomItemEntry = {
    ...previous,
    ...entry,
    use: entry.use ?? previous?.use,
    equip: entry.equip ?? previous?.equip,
    addedAt: previous?.addedAt ?? entry.addedAt,
  };
  local.set(entry.itemId, next);
  persist();
  return next;
}

/**
 * Quita una entrada local. Lo que viene en el repositorio no se borra: para
 * cambiarlo se guarda una entrada local encima, que es la que manda.
 */
export function removeCustomItem(itemId: number): boolean {
  const had = local.delete(itemId);
  if (had) persist();
  return had;
}

/**
 * Guarda en el catálogo las piezas de un personaje que el motor no conoce y
 * de las que el addon sí leyó las estadísticas.
 *
 * @returns cuántas entradas nuevas se han añadido
 */
export function harvestFromGear(items: GearItem[], characterName?: string): number {
  let added = 0;
  for (const item of items) {
    if (simcKnowsItem(item.itemId)) continue;
    if (!item.scannedStats) continue;
    const known = getCustomItem(item.itemId);
    if (known?.stats === item.scannedStats) continue;
    if (!known) added++;
    upsertCustomItem({
      itemId: item.itemId,
      name: item.name ?? `Ítem ${item.itemId}`,
      slot: item.slot,
      ilevel: item.ilevel,
      stats: item.scannedStats,
      effectText: item.scannedEffect,
      addedAt: new Date().toISOString(),
      seenOn: characterName,
    });
  }
  return added;
}

/**
 * Rellena `custom` en las piezas que el motor no conoce y sí están en el
 * catálogo, para que se simulen sin que nadie tenga que describirlas otra vez.
 *
 * @returns los nombres de las piezas que siguen sin poder simularse
 */
export function applyCatalogue(items: GearItem[]): string[] {
  // Por id y no por texto: la misma pieza puede venir puesta (sin nombre, el
  // export del addon no lo escribe) y repetida en la bolsa (con nombre). Si se
  // deduplicara por la cadena saldría dos veces en el aviso.
  const pending = new Map<number, string>();
  for (const item of items) {
    if (item.custom) continue;
    if (simcKnowsItem(item.itemId)) continue;

    const custom = customItemFor(item.itemId);
    if (custom) {
      const entry = getCustomItem(item.itemId);
      item.custom = custom;
      // El export del addon no pone nombre en el equipo puesto, así que sin
      // esto la pieza saldría como `item_158311` en el perfil y en la tabla de
      // resultados. El catálogo sí lo sabe.
      item.name ??= entry?.name;
      item.ilevel ??= entry?.ilevel;
    } else if (item.name || !pending.has(item.itemId)) {
      // Gana la versión con nombre, la traiga la puesta o la de la bolsa.
      pending.set(
        item.itemId,
        item.name ? `${item.name} (id ${item.itemId})` : `id ${item.itemId}`,
      );
    }
  }
  return [...pending.values()];
}

/** INVTYPE del cliente -> slot de simc, para el volcado del escáner. */
const INVTYPE_SLOT: Record<string, GearSlot> = {
  INVTYPE_HEAD: 'head',
  INVTYPE_NECK: 'neck',
  INVTYPE_SHOULDER: 'shoulder',
  INVTYPE_CLOAK: 'back',
  INVTYPE_CHEST: 'chest',
  INVTYPE_ROBE: 'chest',
  INVTYPE_WRIST: 'wrist',
  INVTYPE_HAND: 'hands',
  INVTYPE_WAIST: 'waist',
  INVTYPE_LEGS: 'legs',
  INVTYPE_FEET: 'feet',
  INVTYPE_FINGER: 'finger1',
  INVTYPE_TRINKET: 'trinket1',
  INVTYPE_WEAPON: 'main_hand',
  INVTYPE_2HWEAPON: 'main_hand',
  INVTYPE_WEAPONMAINHAND: 'main_hand',
  INVTYPE_RANGED: 'main_hand',
  INVTYPE_RANGEDRIGHT: 'main_hand',
  INVTYPE_WEAPONOFFHAND: 'off_hand',
  INVTYPE_SHIELD: 'off_hand',
  INVTYPE_HOLDABLE: 'off_hand',
};

export interface ScanImport {
  entries: CustomItemEntry[];
  /** Piezas encontradas pero sin estadísticas: no se pueden simular. */
  withoutStats: string[];
}

/**
 * Lee el volcado de `/rbl escanear` y `/rbl botin`.
 *
 * Formato de cada pieza, en una línea:
 *   `# custom:<id>|<ilvl>|<calidad>|<INVTYPE>|<clase:subclase>|<stats>|<nombre>`
 * y su efecto, si tiene, en otra:
 *   `# effect:<id>=<texto tal cual lo enseña el juego>`
 *
 * El nombre va al final a propósito: es el único campo que puede contener casi
 * cualquier cosa, así que todo lo demás queda en posiciones fijas.
 */
export function parseScanDump(text: string): ScanImport {
  const entries = new Map<number, CustomItemEntry>();
  const effects = new Map<number, string>();
  const withoutStats: string[] = [];
  const now = new Date().toISOString();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    const effect = /^#\s*effect:(\d+)=(.+)$/.exec(line);
    if (effect) {
      effects.set(Number.parseInt(effect[1], 10), effect[2].trim());
      continue;
    }

    const match = /^#\s*custom:(\d+)\|(.*)$/.exec(line);
    if (!match) continue;

    const itemId = Number.parseInt(match[1], 10);
    // El nombre puede llevar barras verticales dentro; los seis primeros
    // campos no, así que se parte solo esas veces y el resto es el nombre.
    const fields = match[2].split('|');
    if (fields.length < 6) continue;
    const [ilevelRaw, , invType, , stats] = fields;
    // Todo lo que va del sexto campo en adelante es el nombre: si llevara una
    // barra dentro, quedarse solo con `fields[5]` lo cortaría por la mitad.
    const name = fields.slice(5).join('|');

    if (!Number.isFinite(itemId) || itemId <= 0) continue;

    if (!stats?.trim()) {
      withoutStats.push(`${name || itemId} (id ${itemId})`);
      continue;
    }

    entries.set(itemId, {
      itemId,
      name: (name || `Ítem ${itemId}`).trim(),
      slot: INVTYPE_SLOT[invType],
      ilevel: Number.parseInt(ilevelRaw, 10) || undefined,
      stats: stats.trim(),
      addedAt: now,
    });
  }

  for (const [itemId, text] of effects) {
    const entry = entries.get(itemId);
    if (entry) entry.effectText = text;
  }

  return { entries: [...entries.values()], withoutStats };
}

/** Comprueba una entrada antes de guardarla. Devuelve los problemas. */
export function validateEntry(entry: Partial<CustomItemEntry>): string[] {
  const errors: string[] = [];
  if (!entry.itemId || !Number.isFinite(entry.itemId) || entry.itemId <= 0) {
    errors.push('Falta el id del ítem.');
  }
  if (!entry.name?.trim()) errors.push('Falta el nombre.');
  errors.push(
    ...validateCustomItem({
      stats: entry.stats ?? '',
      use: entry.use,
      equip: entry.equip,
    }),
  );
  return errors;
}
