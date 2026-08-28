#!/usr/bin/env node
/**
 * Genera data/items.json y data/consumables.json a partir de la DBC que trae
 * SimulationCraft 7.3.5 (engine/dbc/generated/sc_item_data.inc).
 *
 * Usar la DBC del propio simc garantiza que cualquier ítem que aparezca en la
 * app existe también en el motor: no hay ids inventados ni desincronizados.
 *
 * Uso:
 *   node scripts/build-item-db.mjs [--simc <ruta al repo de simc>] [--min-ilvl 800]
 *
 * El ilvl mínimo por defecto es 800 porque es donde empieza el equipo de Legion.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// --- Enumeraciones de la DBC (engine/dbc/data_enums.hh) ---------------------

const ITEM_CLASS_CONSUMABLE = 0;
const ITEM_CLASS_WEAPON = 2;
const ITEM_CLASS_ARMOR = 4;

const SUBCLASS_POTION = 1;
const SUBCLASS_FLASK = 3;
const SUBCLASS_FOOD = 5;

/** INVTYPE -> slots de SimulationCraft. */
const INVTYPE_SLOTS = {
  1: ['head'],
  2: ['neck'],
  3: ['shoulder'],
  4: ['shirt'],
  5: ['chest'],
  6: ['waist'],
  7: ['legs'],
  8: ['feet'],
  9: ['wrist'],
  10: ['hands'],
  11: ['finger1', 'finger2'],
  12: ['trinket1', 'trinket2'],
  13: ['main_hand', 'off_hand'], // una mano
  14: ['off_hand'], // escudo
  15: ['main_hand'], // arco/arma a distancia
  16: ['back'],
  17: ['main_hand'], // dos manos
  19: ['tabard'],
  20: ['chest'], // túnica
  21: ['main_hand'],
  22: ['off_hand'],
  23: ['off_hand'], // sostenible
  26: ['main_hand'], // arma a distancia (derecha)
  // INVTYPE 28 (reliquias de artefacto) se omite: en simc no son un slot, van
  // dentro del arma con `relic_id=`. Aún no las optimizamos.
};

/**
 * Runas de aumento.
 *
 * SimulationCraft 7.3.5 no las resuelve por la DBC de ítems (ver
 * engine/player/sc_consumable.cpp, `augmentation_t::driver`): busca estas
 * subcadenas y aplica el hechizo directamente, así que las fijamos aquí.
 */
const AUGMENT_RUNES = [
  { id: 153023, name: 'Defiled Augment Rune', token: 'defiled', ilevel: 0, reqLevel: 110 },
  { id: 128482, name: 'Rune of Focus (Draenor)', token: 'focus', ilevel: 0, reqLevel: 100 },
  { id: 128475, name: 'Hyper Augment Rune (Draenor)', token: 'hyper', ilevel: 0, reqLevel: 100 },
  { id: 118630, name: 'Stout Augment Rune (Draenor)', token: 'stout', ilevel: 0, reqLevel: 100 },
];

function parseArgs(argv) {
  const args = { simc: null, minIlvl: 800, minQuality: 2 };
  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--simc') args.simc = argv[++i];
    else if (flag === '--min-ilvl') args.minIlvl = Number(argv[++i]);
    else if (flag === '--min-quality') args.minQuality = Number(argv[++i]);
    else if (flag === '--help' || flag === '-h') {
      console.log(
        'Uso: node scripts/build-item-db.mjs [--simc <ruta>] [--min-ilvl 800] [--min-quality 2]',
      );
      process.exit(0);
    }
  }
  return args;
}

function findItemDataFile(explicit) {
  const candidates = [];
  if (explicit) {
    candidates.push(
      path.join(explicit, 'engine/dbc/generated/sc_item_data.inc'),
      explicit,
    );
  }
  if (process.env.SIMC_SOURCE) {
    candidates.push(
      path.join(process.env.SIMC_SOURCE, 'engine/dbc/generated/sc_item_data.inc'),
    );
  }
  candidates.push(
    path.join(ROOT, 'vendor/simc/engine/dbc/generated/sc_item_data.inc'),
  );

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

/**
 * Cada fila tiene esta forma (los grupos entre llaves son arrays de stats):
 *   {  152163, "Nombre", 0x..., 0x..., 0x00, 940, 110, 0, 0, 4, 1, 4, 3, 1, 0,
 *      0.000000, 0.000000, 0xffff..., 0x0000ffff, { ... }, ... },
 *
 * Del primer grupo entre llaves salen los tipos de estadística (ITEM_MOD_*),
 * que es lo que permite ordenar candidatos sin simularlos. Los importes exactos
 * no se leen a propósito: dependen del presupuesto por ilvl y calcularlos aquí
 * sería reimplementar a simc, con el riesgo de que salgan números creíbles y
 * equivocados. Para ordenar basta con saber qué estadísticas lleva.
 */
const ROW_RE = /^\s*\{\s*(\d+),\s*"((?:[^"\\]|\\.)*)"\s*,([^{]*)\{([^}]*)\}/;

function parseItems(text, opts) {
  const items = [];
  const consumables = { flasks: [], foods: [], potions: [], augmentations: [] };

  let parsed = 0;
  for (const line of text.split('\n')) {
    const match = ROW_RE.exec(line);
    if (!match) continue;
    parsed++;

    const id = Number(match[1]);
    const name = match[2].replace(/\\"/g, '"');
    const fields = match[3]
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);

    // Tipos de estadística. -1 marca hueco vacío; se repiten a veces, así que
    // se deduplican conservando el orden (el primero es la principal).
    const stats = [
      ...new Set(
        match[4]
          .split(',')
          .map((value) => Number(value.trim()))
          .filter((value) => Number.isFinite(value) && value >= 0),
      ),
    ];

    // fields: flags1, flags2, type, level, reqLevel, reqSkill, reqSkillRank,
    //         quality, inventoryType, itemClass, itemSubclass, bindType,
    //         delay, dmgRange, modifier, raceMask, classMask
    const [, , , levelRaw, reqLevelRaw, , , qualityRaw, invTypeRaw, classRaw, subclassRaw] =
      fields;

    const ilevel = Number(levelRaw);
    const reqLevel = Number(reqLevelRaw);
    const quality = Number(qualityRaw);
    const inventoryType = Number(invTypeRaw);
    const itemClass = Number(classRaw);
    const itemSubclass = Number(subclassRaw);
    const classMask = Number(fields[16] ?? 0) || 0;

    if (!Number.isFinite(id) || !name) continue;

    if (itemClass === ITEM_CLASS_CONSUMABLE) {
      // Solo consumibles de Legion en adelante (requieren nivel 100+).
      if (reqLevel < 100) continue;
      const record = { id, name, token: tokenize(name), ilevel, reqLevel };
      if (itemSubclass === SUBCLASS_FLASK) consumables.flasks.push(record);
      else if (itemSubclass === SUBCLASS_FOOD) consumables.foods.push(record);
      else if (itemSubclass === SUBCLASS_POTION) consumables.potions.push(record);
      continue;
    }

    if (itemClass !== ITEM_CLASS_ARMOR && itemClass !== ITEM_CLASS_WEAPON) continue;

    const slots = INVTYPE_SLOTS[inventoryType];
    if (!slots) continue;
    if (slots[0] === 'shirt' || slots[0] === 'tabard') continue;
    if (ilevel < opts.minIlvl) continue;
    if (quality < opts.minQuality) continue;

    items.push({
      id,
      name,
      ilevel,
      quality,
      inventoryType,
      itemClass,
      itemSubclass,
      classMask,
      slots,
      stats,
    });
  }

  return { items, consumables, parsed };
}

function tokenize(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function dedupeConsumables(list) {
  // Nos quedamos con el id más alto por token: suele ser la versión vigente.
  const byToken = new Map();
  for (const record of list) {
    const existing = byToken.get(record.token);
    if (!existing || record.id > existing.id) byToken.set(record.token, record);
  }
  return [...byToken.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function main() {
  const args = parseArgs(process.argv);
  const file = findItemDataFile(args.simc);

  if (!file) {
    console.error(
      'No se encontró sc_item_data.inc.\n' +
        'Ejecuta antes `npm run setup:simc`, o pasa la ruta con --simc <repo de simc>.',
    );
    process.exit(1);
  }

  console.log(`Leyendo ${file}`);
  const text = fs.readFileSync(file, 'utf8');
  const { items, consumables, parsed } = parseItems(text, {
    minIlvl: args.minIlvl,
    minQuality: args.minQuality,
  });

  for (const key of Object.keys(consumables)) {
    consumables[key] = dedupeConsumables(consumables[key]);
  }
  consumables.augmentations = AUGMENT_RUNES;

  items.sort((a, b) => b.ilevel - a.ilevel || a.name.localeCompare(b.name));

  const dataDir = path.join(ROOT, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'items.json'), JSON.stringify(items));
  fs.writeFileSync(
    path.join(dataDir, 'consumables.json'),
    JSON.stringify(consumables, null, 2),
  );

  console.log(`Filas leídas:      ${parsed}`);
  console.log(`Ítems equipables:  ${items.length} (ilvl >= ${args.minIlvl})`);
  console.log(
    `Consumibles:       ${consumables.flasks.length} frascos, ` +
      `${consumables.foods.length} comidas, ${consumables.potions.length} pociones, ` +
      `${consumables.augmentations.length} runas`,
  );
  console.log(`Escrito en ${dataDir}`);
}

main();
