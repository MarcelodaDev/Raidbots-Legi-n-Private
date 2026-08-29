#!/usr/bin/env node
/**
 * Genera data/patches.json: las fases de contenido de Legion con el equipo de
 * referencia de cada spec en cada una.
 *
 * Los datos NO se inventan: salen de los perfiles por tier que trae el propio
 * SimulationCraft (profiles/PreRaids, Tier19, Tier20, Tier21), que son los que
 * mantiene la comunidad de simc para cada tier de banda. Cada perfil se carga
 * en el motor con una iteración para que sea él quien resuelva el ilvl efectivo
 * de cada pieza (los bonus_id cambian el ilvl y no queremos recalcularlos por
 * nuestra cuenta).
 *
 * De esos mismos datos se deducen, sin afirmar nada de memoria, el tope de ilvl
 * del equipo de la fase (sin contar el arma artefacto, que escala aparte) y
 * cuántas legendarias equipan sus perfiles.
 *
 * Ojo con el matiz: los perfiles están escritos sobre el juego final de 7.3.5,
 * así que su EQUIPO es el del tier pero sus MECÁNICAS son las de 7.3.5 (por eso
 * hay perfiles de T20 con datos de Crisol, que en su día no existía). Por eso
 * los números que salen de aquí son valores por defecto editables, no
 * afirmaciones sobre qué había en cada parche histórico.
 *
 * Uso:
 *   node scripts/build-patch-db.mjs [--simc <ruta al repo de simc>]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Las fases, en orden de progresión. `dir` es el directorio de perfiles de
 * simc; las etiquetas son editables sin tocar el código.
 */
const PHASES = [
  {
    id: 'preraid',
    dir: 'PreRaids',
    label: 'Pre-banda',
    description: 'Mazmorras y mundo, antes de abrir la primera banda.',
    legendaries: 1,
  },
  {
    id: 't19',
    dir: 'Tier19',
    label: 'T19 · Pesadilla Esmeralda → Bastión Nocturno',
    description: 'Primer tier de banda de Legion.',
    legendaries: 2,
  },
  {
    id: 't20',
    dir: 'Tier20',
    label: 'T20 · Tumba de Sargeras',
    description: 'Segundo tier de banda.',
    legendaries: 3,
  },
  {
    id: 't21',
    dir: 'Tier21',
    label: 'T21 · Antorus, el Trono Ardiente',
    description: 'Tier final de Legion, con Crisol de Luznether.',
    legendaries: 3,
  },
];

const SLOTS = [
  'head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist',
  'legs', 'feet', 'finger1', 'finger2', 'trinket1', 'trinket2',
  'main_hand', 'off_hand',
];

/**
 * El arma artefacto no cuenta para el tope de ilvl de la fase: su ilvl sale de
 * las reliquias y llega a 999 incluso en tiers tempranos, así que contaminaría
 * el filtro del buscador de ítems.
 */
const WEAPON_SLOTS = new Set(['main_hand', 'off_hand']);

function parseArgs(argv) {
  const args = { simc: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--simc') args.simc = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('Uso: node scripts/build-patch-db.mjs [--simc <ruta>]');
      process.exit(0);
    }
  }
  return args;
}

function findSimc(explicit) {
  const exe = process.platform === 'win32' ? 'simc.exe' : 'simc';
  const candidates = [
    process.env.SIMC_PATH,
    explicit && path.join(explicit, 'engine', exe),
    path.join(ROOT, 'vendor/simc/engine', exe),
    path.join(ROOT, 'bin', exe),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // seguimos
    }
  }
  return null;
}

function findProfiles(explicit) {
  const candidates = [
    explicit && path.join(explicit, 'profiles'),
    process.env.SIMC_SOURCE && path.join(process.env.SIMC_SOURCE, 'profiles'),
    path.join(ROOT, 'vendor/simc/profiles'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }
  return null;
}

const CLASS_LINE =
  /^(death_?knight|demon_?hunter|druid|hunter|mage|monk|paladin|priest|rogue|shaman|warlock|warrior)\s*=\s*"?([^"\n]*)"?/im;

function normalizeClass(key) {
  const clean = key.toLowerCase().replace(/_/g, '');
  if (clean === 'deathknight') return 'death_knight';
  if (clean === 'demonhunter') return 'demon_hunter';
  return clean;
}

/** Datos que solo están en el texto del perfil, no en el informe JSON. */
function readProfileMeta(file) {
  const text = fs.readFileSync(file, 'utf8');
  const classMatch = CLASS_LINE.exec(text);
  const specMatch = /^spec\s*=\s*(\S+)/im.exec(text);
  const talentsMatch = /^talents\s*=\s*(\S+)/im.exec(text);
  return {
    class: classMatch ? normalizeClass(classMatch[1]) : '',
    spec: specMatch ? specMatch[1] : '',
    talents: talentsMatch ? talentsMatch[1] : '',
    hasCrucible: /^crucible\s*=/im.test(text),
  };
}

/** Carga un perfil en el motor y devuelve lo que resuelve para el jugador. */
function loadProfile(simcPath, file, tmpDir) {
  const out = path.join(tmpDir, 'out.json');
  try {
    execFileSync(
      simcPath,
      [file, 'iterations=1', 'threads=1', 'max_time=10', `json2=${out}`],
      { stdio: ['ignore', 'ignore', 'ignore'], timeout: 120_000, cwd: path.dirname(file) },
    );
  } catch {
    // simc puede salir con código != 0 y aun así haber escrito el informe
  }
  if (!fs.existsSync(out)) return null;
  const json = JSON.parse(fs.readFileSync(out, 'utf8'));
  fs.rmSync(out, { force: true });
  return json?.sim?.players?.[0] ?? null;
}

function loadItemDb() {
  const file = path.join(ROOT, 'data/items.json');
  if (!fs.existsSync(file)) return new Map();
  const items = JSON.parse(fs.readFileSync(file, 'utf8'));
  return new Map(items.map((item) => [item.id, item]));
}

/** `runebound_collar,id=152138,bonus_id=3612/1502` -> id numérico. */
function itemIdOf(encoded) {
  const match = /(?:^|,)id=(\d+)/.exec(encoded ?? '');
  return match ? Number(match[1]) : 0;
}

function main() {
  const args = parseArgs(process.argv);
  const simcPath = findSimc(args.simc);
  const profilesDir = findProfiles(args.simc);

  if (!simcPath || !profilesDir) {
    console.error(
      'Faltan el binario de SimulationCraft o su carpeta profiles/.\n' +
        'Ejecuta antes `npm run setup:simc`, o pasa la ruta con --simc <repo de simc>.',
    );
    process.exit(1);
  }

  const itemDb = loadItemDb();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rbl-patches-'));
  const phases = [];

  for (const [order, phase] of PHASES.entries()) {
    const dir = path.join(profilesDir, phase.dir);
    if (!fs.existsSync(dir)) {
      console.warn(`  ${phase.dir}: no existe, se omite`);
      continue;
    }

    const files = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.simc'))
      .sort();

    const specs = {};
    const items = new Map();
    let ilevelCap = 0;
    let artifactIlevel = 0;
    let maxLegendaries = 0;
    let profilesUseCrucible = false;
    let loaded = 0;
    const skipped = [];

    for (const name of files) {
      const file = path.join(dir, name);
      const meta = readProfileMeta(file);
      if (!meta.class || !meta.spec) continue;

      const player = loadProfile(simcPath, file, tmpDir);
      if (!player) {
        // Pasa cuando el perfil usa un ítem que no está en la DBC de 7.3.5:
        // simc intenta bajarlo de la API de Blizzard y, sin red, cancela.
        skipped.push(name);
        console.warn(`  ${name}: el motor no pudo cargarlo, se omite`);
        continue;
      }
      loaded++;
      if (meta.hasCrucible) profilesUseCrucible = true;

      const gear = [];
      let legendaries = 0;

      for (const slot of SLOTS) {
        const entry = player.gear?.[slot];
        if (!entry) continue;
        const itemId = itemIdOf(entry.encoded_item);
        if (!itemId) continue;

        const ilevel = Number(entry.ilevel) || 0;
        const record = itemDb.get(itemId);
        const quality = record?.quality ?? 0;
        if (quality === 5) legendaries++;
        if (WEAPON_SLOTS.has(slot)) {
          if (ilevel > artifactIlevel) artifactIlevel = ilevel;
        } else if (ilevel > ilevelCap) {
          ilevelCap = ilevel;
        }

        gear.push({
          slot,
          itemId,
          name: record?.name ?? String(entry.name ?? '').replace(/_/g, ' '),
          ilevel,
          quality,
          encoded: entry.encoded_item,
        });

        const known = items.get(itemId);
        if (!known || ilevel > known.ilevel) {
          items.set(itemId, {
            id: itemId,
            name: record?.name ?? String(entry.name ?? '').replace(/_/g, ' '),
            ilevel,
            quality,
            slots: record?.slots ?? [slot],
          });
        }
      }

      if (legendaries > maxLegendaries) maxLegendaries = legendaries;


      const key = `${meta.class}_${meta.spec}`;
      const variant = name.replace(/\.simc$/, '');
      const existing = specs[key];

      // Hay specs con varias variantes (por ejemplo BoS o Demonic). Nos
      // quedamos con la de nombre más corto como principal y anotamos el resto.
      if (!existing || variant.length < existing.profile.length) {
        specs[key] = {
          class: meta.class,
          spec: meta.spec,
          profile: variant,
          talents: meta.talents,
          gear,
          variants: existing ? [...(existing.variants ?? []), existing.profile] : [],
        };
      } else {
        existing.variants = [...(existing.variants ?? []), variant];
      }
    }

    // Los ids de ítem se reparten por bloques según se va desarrollando el
    // contenido, así que el id más alto de una fase sirve de frontera razonable
    // con el contenido posterior. Es una heurística, no un dato de la DBC.
    const maxItemId = Math.max(0, ...[...items.keys()]);

    phases.push({
      ...phase,
      order,
      ilevelCap,
      maxItemId,
      artifactIlevel,
      /*
       * El tope de legendarias es una regla del juego, no algo que se pueda
       * deducir de los perfiles: los de T19 no llevan ninguna y salía 0, cuando
       * en Bastión Nocturno ya se llevaban dos. Se usa el valor histórico y el
       * deducido queda como suelo, por si un perfil trae más de las esperadas.
       * En un servidor privado esto cambia a menudo: es editable en la app.
       */
      maxLegendaries: Math.max(maxLegendaries, phase.legendaries ?? 0),
      profilesUseCrucible,
      skipped,
      profileCount: loaded,
      specCount: Object.keys(specs).length,
      items: [...items.values()].sort((a, b) => b.ilevel - a.ilevel),
      specs,
    });

    console.log(
      `${phase.id.padEnd(8)} ${String(loaded).padStart(3)} perfiles · ` +
        `${String(Object.keys(specs).length).padStart(2)} specs · ` +
        `ilvl equipo ${ilevelCap} · id máx ${maxItemId} · ` +
        // El tope final, no el deducido: si no, el mensaje contradice al JSON.
        `${Math.max(maxLegendaries, phase.legendaries ?? 0)} legendarias` +
        (skipped.length ? ` · ${skipped.length} sin cargar` : ''),
    );
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });

  const outFile = path.join(ROOT, 'data/patches.json');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({ phases }, null, 1));

  const size = (fs.statSync(outFile).size / 1024).toFixed(0);
  console.log(`\nEscrito ${outFile} (${size} KB)`);
}

main();
