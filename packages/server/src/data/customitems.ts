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

let catalogue = new Map<number, CustomItemEntry>();

export function loadCustomItems(): void {
  const file = paths.customItems();
  if (!fs.existsSync(file)) {
    catalogue = new Map();
    return;
  }
  try {
    const list = JSON.parse(fs.readFileSync(file, 'utf8')) as CustomItemEntry[];
    catalogue = new Map(list.map((entry) => [entry.itemId, entry]));
  } catch {
    // Un fichero corrupto no debe impedir arrancar: sin catálogo se sigue
    // pudiendo describir las piezas a mano.
    catalogue = new Map();
  }
}

function persist(): void {
  fs.writeFileSync(paths.customItems(), JSON.stringify([...catalogue.values()], null, 2));
}

export function listCustomItems(): CustomItemEntry[] {
  return [...catalogue.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function customItemsStatus(): { available: boolean; items: number; withEffect: number } {
  const all = [...catalogue.values()];
  return {
    available: all.length > 0,
    items: all.length,
    withEffect: all.filter((entry) => entry.use || entry.equip).length,
  };
}

export function getCustomItem(itemId: number): CustomItemEntry | undefined {
  return catalogue.get(itemId);
}

/** Lo que hay que pasarle a simc para esta pieza, o nada si no está. */
export function customItemFor(itemId: number): CustomItem | undefined {
  const entry = catalogue.get(itemId);
  if (!entry?.stats) return undefined;
  return { stats: entry.stats, use: entry.use, equip: entry.equip };
}

export function upsertCustomItem(entry: CustomItemEntry): CustomItemEntry {
  const previous = catalogue.get(entry.itemId);
  // Lo que ha escrito una persona (la traducción del efecto) manda sobre lo que
  // vuelve a leer el addon, que solo sabe de estadísticas.
  const merged: CustomItemEntry = {
    ...previous,
    ...entry,
    use: entry.use ?? previous?.use,
    equip: entry.equip ?? previous?.equip,
    addedAt: previous?.addedAt ?? entry.addedAt,
  };
  catalogue.set(entry.itemId, merged);
  persist();
  return merged;
}

export function removeCustomItem(itemId: number): boolean {
  const had = catalogue.delete(itemId);
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
    if (catalogue.has(item.itemId) && catalogue.get(item.itemId)?.stats === item.scannedStats) {
      continue;
    }
    if (!catalogue.has(item.itemId)) added++;
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
  const pending: string[] = [];
  for (const item of items) {
    if (item.custom) continue;
    if (simcKnowsItem(item.itemId)) continue;

    const custom = customItemFor(item.itemId);
    if (custom) {
      item.custom = custom;
      // El catálogo también sabe el ilvl si el export no lo traía.
      item.ilevel ??= getCustomItem(item.itemId)?.ilevel;
    } else {
      pending.push(item.name ? `${item.name} (id ${item.itemId})` : `id ${item.itemId}`);
    }
  }
  return pending;
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
