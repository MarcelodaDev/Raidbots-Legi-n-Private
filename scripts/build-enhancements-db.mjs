#!/usr/bin/env node
/**
 * Genera data/enhancements.json: gemas y encantamientos de Legion.
 *
 * Dos fuentes, las dos del propio SimulationCraft:
 *
 *   - El catálogo completo sale de su DBC: las gemas de `sc_item_data.inc`
 *     (clase de ítem 3) y los encantamientos de `sc_item_data2.inc`
 *     (`__spell_item_ench_data`).
 *   - La lista *recomendada por slot* sale de los perfiles por tier: qué
 *     encantamiento y qué gema usa de verdad cada spec en cada hueco. Nadie
 *     quiere elegir entre 4000 encantamientos; quiere ver los cuatro que se
 *     ponen en un anillo.
 *
 * Validar contra este catálogo no es opcional: SimulationCraft ignora en
 * silencio un `enchant_id` que no conoce y devuelve el DPS sin encantar, que
 * parece un resultado legítimo. Comprobado con `enchant_id=999999`.
 *
 * Uso:
 *   node scripts/build-enhancements-db.mjs [--simc <ruta al repo de simc>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ITEM_CLASS_GEM = 3;

/** Slots que en Legion se pueden encantar o engarzar. */
const ENHANCEABLE_SLOTS = ['neck', 'back', 'finger1', 'finger2', 'main_hand', 'off_hand'];

function parseArgs(argv) {
  const args = { simc: null, minIlevel: 100 };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--simc') args.simc = argv[++i];
    else if (argv[i] === '--min-ilevel') args.minIlevel = Number(argv[++i]);
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('Uso: node scripts/build-enhancements-db.mjs [--simc <ruta>]');
      process.exit(0);
    }
  }
  return args;
}

function findSimcSource(explicit) {
  const candidates = [
    explicit,
    process.env.SIMC_SOURCE,
    path.join(ROOT, 'vendor/simc'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'engine/dbc/generated/sc_item_data.inc'))) {
      return candidate;
    }
  }
  return null;
}

function tokenize(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// --- Gemas -----------------------------------------------------------------

const ITEM_ROW = /^\s*\{\s*(\d+),\s*"((?:[^"\\]|\\.)*)"\s*,([^{]*)\{/;

function parseGems(text, minIlevel) {
  const gems = [];
  for (const line of text.split('\n')) {
    const match = ITEM_ROW.exec(line);
    if (!match) continue;

    const fields = match[3].split(',').map((f) => f.trim()).filter(Boolean);
    const itemClass = Number(fields[9]);
    if (itemClass !== ITEM_CLASS_GEM) continue;

    // Las gemas de Legion tienen ilvl 100+ pero nivel requerido 1, así que el
    // filtro va por ilvl. Filtrar por nivel requerido las dejaba todas fuera.
    const ilevel = Number(fields[3]);
    if (ilevel < minIlevel) continue;
    const reqLevel = Number(fields[4]);

    gems.push({
      id: Number(match[1]),
      name: match[2].replace(/\\"/g, '"'),
      ilevel,
      reqLevel,
      subclass: Number(fields[10]),
    });
  }
  return gems;
}

// --- Encantamientos --------------------------------------------------------

/**
 * Cada fila es:
 *   { id, slot, id_gem, id_scaling, min_scaling, max_scaling, req_skill,
 *     req_skill_value, {ench_type}, {ench_amount}, {ench_prop}, {ench_coeff},
 *     id_spell, "nombre" }
 *
 * Se leen los seis primeros escalares y el nombre del final.
 */
const ENCHANT_ROW =
  /^\s*\{\s*(\d+),\s*(-?\d+),\s*(\d+),\s*(-?\d+),\s*(\d+),\s*(\d+),.*?(\d+),\s*"((?:[^"\\]|\\.)*)"\s*\}/;

function parseEnchants(text, spellNames) {
  const enchants = [];
  for (const line of text.split('\n')) {
    const match = ENCHANT_ROW.exec(line);
    if (!match) continue;

    const id = Number(match[1]);
    if (id === 0) continue;

    const name = match[8].replace(/\\"/g, '"').trim();
    if (!name) continue;

    const spellId = Number(match[7]);
    const spellName = spellNames.get(spellId);
    // Si el nombre de la DBC lleva marcador de escalado, el bueno es el del
    // hechizo: "+$k1 Critical Strike" -> "Binding of Critical Strike".
    const display = name.includes('$') && spellName ? spellName : name;

    enchants.push({
      id,
      name,
      display,
      spellId,
      slotMask: Number(match[2]),
      maxScalingLevel: Number(match[6]),
    });
  }
  return enchants;
}

/**
 * Nombre de cada hechizo, para poder nombrar los encantamientos.
 *
 * Muchos encantamientos tienen en la DBC un nombre con marcador de escalado
 * ("+$k1 Critical Strike"), que no sirve ni para enseñar ni para buscar. El
 * nombre de verdad ("Binding of Critical Strike") está en el hechizo al que
 * apuntan, que es también contra el que compara SimulationCraft.
 */
const SPELL_ROW = /^\s*\{\s*"((?:[^"\\]|\\.)*)"\s*,\s*(\d+),/;

function parseSpellNames(text) {
  const names = new Map();
  for (const line of text.split('\n')) {
    const match = SPELL_ROW.exec(line);
    if (!match) continue;
    const id = Number(match[2]);
    if (id > 0 && !names.has(id)) names.set(id, match[1].replace(/\\"/g, '"'));
  }
  return names;
}

// --- Uso real por slot -----------------------------------------------------

/** Recorre los perfiles por tier y anota qué se usa en cada hueco. */
function scanProfiles(profilesDir, enchantsByToken, enchantsById) {
  const bySlot = {};
  const ensure = (slot) => {
    bySlot[slot] = bySlot[slot] ?? { enchants: new Set(), gems: new Set() };
    return bySlot[slot];
  };

  const dirs = ['PreRaids', 'Tier19', 'Tier20', 'Tier21']
    .map((name) => path.join(profilesDir, name))
    .filter((dir) => fs.existsSync(dir));

  for (const dir of dirs) {
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.simc')) continue;
      const text = fs.readFileSync(path.join(dir, file), 'utf8');

      for (const line of text.split('\n')) {
        const slotMatch = /^([a-z_0-9]+)=/.exec(line.trim());
        if (!slotMatch) continue;
        const slot = slotMatch[1];
        if (!ENHANCEABLE_SLOTS.includes(slot)) continue;

        const enchantId = /,enchant_id=(\d+)/.exec(line);
        if (enchantId && enchantsById.has(Number(enchantId[1]))) {
          ensure(slot).enchants.add(Number(enchantId[1]));
        }

        const enchantName = /,enchant=([a-z_0-9]+)/.exec(line);
        if (enchantName) {
          const found = enchantsByToken.get(enchantName[1]);
          if (found) ensure(slot).enchants.add(found);
        }

        const gemIds = /,gem_id=([\d/]+)/.exec(line);
        if (gemIds) {
          for (const raw of gemIds[1].split('/')) {
            const gemId = Number(raw);
            // El arma artefacto lleva reliquias en los huecos de gema: no son
            // gemas de verdad y no se comparan aquí.
            if (gemId > 0 && slot !== 'main_hand' && slot !== 'off_hand') {
              ensure(slot).gems.add(gemId);
            }
          }
        }
      }
    }
  }

  const out = {};
  for (const [slot, sets] of Object.entries(bySlot)) {
    out[slot] = {
      enchants: [...sets.enchants].sort((a, b) => a - b),
      gems: [...sets.gems].sort((a, b) => a - b),
    };
  }
  return out;
}

// --- Main ------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv);
  const source = findSimcSource(args.simc);

  if (!source) {
    console.error(
      'No se encontró el código de SimulationCraft.\n' +
        'Ejecuta antes `npm run setup:simc`, o pasa la ruta con --simc <repo de simc>.',
    );
    process.exit(1);
  }

  const itemFile = path.join(source, 'engine/dbc/generated/sc_item_data.inc');
  const enchantFile = path.join(source, 'engine/dbc/generated/sc_item_data2.inc');

  const gems = parseGems(fs.readFileSync(itemFile, 'utf8'), args.minIlevel);
  const spellNames = parseSpellNames(
    fs.readFileSync(path.join(source, 'engine/dbc/generated/sc_spell_data.inc'), 'utf8'),
  );
  const enchants = parseEnchants(fs.readFileSync(enchantFile, 'utf8'), spellNames);

  const enchantsById = new Map(enchants.map((e) => [e.id, e]));
  const enchantsByToken = new Map();
  for (const enchant of enchants) {
    // El nombre tokenizado es lo que acepta `enchant=` en un perfil.
    const token = tokenize(enchant.display);
    if (!enchantsByToken.has(token)) enchantsByToken.set(token, enchant.id);
  }

  const bySlot = scanProfiles(
    path.join(source, 'profiles'),
    enchantsByToken,
    enchantsById,
  );

  // Solo guardamos el catálogo completo de lo que puede interesar: gemas de
  // Legion y encantamientos que escalan a nivel 110.
  // Los encantamientos de arma de Legion (runas, aceites) no escalan, así que
  // el filtro por nivel los dejaría fuera: se añaden los que usan los perfiles.
  const usedInProfiles = new Set(
    Object.values(bySlot).flatMap((entry) => entry.enchants),
  );
  const legionEnchants = enchants
    .filter((enchant) => enchant.maxScalingLevel >= 110 || usedInProfiles.has(enchant.id))
    .map((enchant) => ({
      id: enchant.id,
      name: enchant.display,
      token: tokenize(enchant.display),
    }));

  const gemList = gems
    .map((gem) => ({ id: gem.id, name: gem.name, ilevel: gem.ilevel, reqLevel: gem.reqLevel }))
    .sort((a, b) => b.ilevel - a.ilevel || a.name.localeCompare(b.name));

  const outFile = path.join(ROOT, 'data/enhancements.json');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(
    outFile,
    JSON.stringify({ gems: gemList, enchants: legionEnchants, bySlot }, null, 1),
  );

  console.log(`Gemas (ilvl ${args.minIlevel}+):    ${gemList.length}`);
  console.log(`Encantamientos de 110:     ${legionEnchants.length}`);
  for (const [slot, entry] of Object.entries(bySlot)) {
    console.log(
      `  ${slot.padEnd(10)} ${entry.enchants.length} encantamientos · ${entry.gems.length} gemas (vistos en perfiles)`,
    );
  }
  console.log(`\nEscrito ${outFile}`);
}

main();
