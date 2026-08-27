import fs from 'node:fs';
import {
  ARMOR_TYPED_INVTYPES,
  CLASS_ARMOR_TYPE,
  CLASS_BITS,
  type ConsumableDb,
  type GearSlot,
  type ItemRecord,
  type ItemSearchQuery,
} from '@rbl/shared';
import { paths } from '../config.js';

let items: ItemRecord[] = [];
let byId = new Map<number, ItemRecord>();
let consumables: ConsumableDb = {
  flasks: [],
  foods: [],
  potions: [],
  augmentations: [],
};

export function loadItemDb(): void {
  const itemPath = paths.itemDb();
  if (fs.existsSync(itemPath)) {
    items = JSON.parse(fs.readFileSync(itemPath, 'utf8')) as ItemRecord[];
    byId = new Map(items.map((item) => [item.id, item]));
  } else {
    items = [];
    byId = new Map();
  }

  const consumablePath = paths.consumableDb();
  if (fs.existsSync(consumablePath)) {
    consumables = JSON.parse(fs.readFileSync(consumablePath, 'utf8')) as ConsumableDb;
  }
}

export function itemDbStatus(): { available: boolean; items: number; consumables: number } {
  const consumableCount =
    consumables.flasks.length +
    consumables.foods.length +
    consumables.potions.length +
    consumables.augmentations.length;
  return {
    available: items.length > 0,
    items: items.length,
    consumables: consumableCount,
  };
}

export function getItem(id: number): ItemRecord | undefined {
  return byId.get(id);
}

export function getItemQuality(id: number): number | undefined {
  return byId.get(id)?.quality;
}

export function getItemName(id: number): string | undefined {
  return byId.get(id)?.name;
}

export function getConsumables(): ConsumableDb {
  return consumables;
}

/**
 * ¿Puede esta clase equipar el ítem?
 *
 * Importa acertar: si le pasamos a SimulationCraft una pieza que el personaje
 * no puede llevar, aborta la simulación entera («is of invalid type») y se
 * pierden todos los perfiles del lote.
 */
export function canClassEquip(item: ItemRecord, className: string): boolean {
  const bit = CLASS_BITS[className];
  if (bit && item.classMask && (item.classMask & bit) === 0) return false;

  if (item.itemClass === 4 && ARMOR_TYPED_INVTYPES.has(item.inventoryType)) {
    const armorType = CLASS_ARMOR_TYPE[className];
    if (armorType && item.itemSubclass !== armorType) return false;
  }

  return true;
}

/** Búsqueda simple por nombre/id con filtros de slot e ilvl. */
export function searchItems(query: ItemSearchQuery): ItemRecord[] {
  const limit = Math.min(query.limit ?? 50, 500);
  const term = query.q?.trim().toLowerCase();
  const termId = term ? Number.parseInt(term, 10) : Number.NaN;

  const results: ItemRecord[] = [];
  for (const item of items) {
    if (query.slot && !item.slots.includes(query.slot)) continue;
    if (query.class && !canClassEquip(item, query.class)) continue;
    if (query.minIlevel && item.ilevel < query.minIlevel) continue;
    if (query.maxIlevel && item.ilevel > query.maxIlevel) continue;
    if (query.quality !== undefined && item.quality !== query.quality) continue;
    if (term) {
      const nameMatch = item.name.toLowerCase().includes(term);
      const idMatch = Number.isFinite(termId) && item.id === termId;
      if (!nameMatch && !idMatch) continue;
    }
    results.push(item);
    if (results.length >= limit * 4) break;
  }

  // Los ítems de mayor nivel suelen ser los interesantes.
  results.sort((a, b) => b.ilevel - a.ilevel || a.name.localeCompare(b.name));
  return results.slice(0, limit);
}

/** Slots donde puede ir un ítem, resolviendo anillos y abalorios a sus dos huecos. */
export function slotsForItem(id: number): GearSlot[] {
  return byId.get(id)?.slots ?? [];
}
