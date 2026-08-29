#!/usr/bin/env node
/**
 * Convierte un volcado del escáner del addon en el catálogo compartido.
 *
 *   node scripts/build-custom-items.mjs volcado.txt [--merge]
 *
 * El resultado, `data/custom-items.json`, sí va en el repositorio: es lo que
 * hace que las piezas propias de un servidor las pueda simular cualquiera sin
 * tener que escanearlas él. Sin `--merge` reemplaza el fichero; con `--merge`
 * conserva lo que ya había y añade lo nuevo, respetando los efectos que alguien
 * haya traducido a mano (el escáner solo sabe de estadísticas).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseScanDump } from '../packages/server/src/data/customitems.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'custom-items.json');

function main() {
  const args = process.argv.slice(2);
  const merge = args.includes('--merge');
  const input = args.find((arg) => !arg.startsWith('--'));

  if (!input) {
    console.error('Uso: node scripts/build-custom-items.mjs <volcado.txt> [--merge]');
    process.exit(1);
  }
  if (!fs.existsSync(input)) {
    console.error(`No existe ${input}`);
    process.exit(1);
  }

  const { entries, withoutStats } = parseScanDump(fs.readFileSync(input, 'utf8'));

  const byId = new Map();
  if (merge && fs.existsSync(OUT)) {
    for (const entry of JSON.parse(fs.readFileSync(OUT, 'utf8'))) {
      byId.set(entry.itemId, entry);
    }
  }

  let added = 0;
  let updated = 0;
  for (const entry of entries) {
    const previous = byId.get(entry.itemId);
    if (previous) updated++;
    else added++;
    byId.set(entry.itemId, {
      ...entry,
      // La traducción del efecto la escribe una persona; el escáner solo lee
      // estadísticas, así que no debe borrarla al volver a pasar.
      use: previous?.use,
      equip: previous?.equip,
      addedAt: previous?.addedAt ?? entry.addedAt,
    });
  }

  const list = [...byId.values()].sort((a, b) => a.itemId - b.itemId);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(list, null, 2) + '\n');

  console.log(`Leídas:            ${entries.length} piezas con estadísticas`);
  if (withoutStats.length > 0) {
    console.log(`Sin estadísticas:  ${withoutStats.length} (no se pueden simular)`);
    for (const name of withoutStats.slice(0, 10)) console.log(`  - ${name}`);
    if (withoutStats.length > 10) console.log(`  ... y ${withoutStats.length - 10} más`);
  }
  console.log(`Nuevas:            ${added}`);
  console.log(`Actualizadas:      ${updated}`);
  console.log(`Total en catálogo: ${list.length}`);
  console.log(`Escrito en ${OUT}`);

  const pendingEffect = list.filter((entry) => entry.effectText && !entry.use && !entry.equip);
  if (pendingEffect.length > 0) {
    console.log(
      `\n${pendingEffect.length} pieza(s) tienen efecto sin traducir al formato de simc.` +
        '\nSe simularán solo por estadísticas hasta que alguien escriba su `use` o `equip`:',
    );
    for (const entry of pendingEffect.slice(0, 10)) {
      console.log(`  ${entry.itemId} ${entry.name}: ${entry.effectText}`);
    }
    if (pendingEffect.length > 10) console.log(`  ... y ${pendingEffect.length - 10} más`);
  }
}

main();
