import fs from 'node:fs';
import path from 'node:path';
import type { EnhancementDb, GearSlot, SlotEnhancements } from '@rbl/shared';
import { config } from '../config.js';

let db: EnhancementDb = { gems: [], enchants: [], bySlot: {} };
let enchantsById = new Map<number, EnhancementDb['enchants'][number]>();
let gemsById = new Map<number, EnhancementDb['gems'][number]>();

export function loadEnhancements(): void {
  const file = path.join(config.dataDir, 'enhancements.json');
  if (!fs.existsSync(file)) {
    db = { gems: [], enchants: [], bySlot: {} };
  } else {
    try {
      db = JSON.parse(fs.readFileSync(file, 'utf8')) as EnhancementDb;
    } catch {
      db = { gems: [], enchants: [], bySlot: {} };
    }
  }
  enchantsById = new Map(db.enchants.map((entry) => [entry.id, entry]));
  gemsById = new Map(db.gems.map((entry) => [entry.id, entry]));
}

export function getEnhancements(): EnhancementDb {
  return db;
}

export function getEnchant(id: number) {
  return enchantsById.get(id);
}

export function getGem(id: number) {
  return gemsById.get(id);
}

/** Lo que suele ponerse en ese hueco, según los perfiles por tier de simc. */
export function slotSuggestions(slot: GearSlot): SlotEnhancements {
  return db.bySlot[slot] ?? { enchants: [], gems: [] };
}

export function enhancementsStatus(): {
  available: boolean;
  gems: number;
  enchants: number;
} {
  return {
    available: db.enchants.length > 0 || db.gems.length > 0,
    gems: db.gems.length,
    enchants: db.enchants.length,
  };
}
