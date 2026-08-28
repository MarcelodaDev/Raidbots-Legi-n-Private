#!/usr/bin/env node
/**
 * Comprueba que la instalación está lista: binario de SimulationCraft, versión
 * correcta (7.3.5) y base de ítems generada.
 *
 *   npm run check:simc
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exe = process.platform === 'win32' ? 'simc.exe' : 'simc';

const candidates = [
  process.env.SIMC_PATH,
  path.join(ROOT, 'vendor/simc/engine', exe),
  path.join(ROOT, 'vendor/simc', exe),
  path.join(ROOT, 'bin', exe),
].filter(Boolean);

let ok = true;

const simcPath = candidates.find((candidate) => {
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
});

if (!simcPath) {
  ok = false;
  console.log('✗ SimulationCraft: no encontrado');
  console.log('  Rutas probadas:');
  for (const candidate of candidates) console.log(`    ${candidate}`);
  console.log('  Solución: npm run setup:simc   (o define SIMC_PATH)');
} else {
  let header = '';
  try {
    // simc sale con error cuando no recibe perfil, pero antes imprime su
    // cabecera: es justo lo que queremos leer.
    header = execFileSync(simcPath, [], {
      encoding: 'utf8',
      timeout: 30_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    header = `${err.stdout ?? ''}${err.stderr ?? ''}`;
  }
  const match = header.match(/SimulationCraft\s+(\S+)\s+for\s+World\s+of\s+Warcraft\s+(\S+)/i);
  if (!match) {
    ok = false;
    console.log(`✗ SimulationCraft: el binario de ${simcPath} no respondió.`);
    console.log('  El fichero está, pero al ejecutarlo no imprime su versión.');
    console.log('  Pruébalo suelto para ver el error real:');
    console.log(`    ${simcPath}`);
    if (header.trim()) {
      console.log('  Lo que sí imprimió:');
      for (const line of header.trim().split('\n').slice(0, 5)) {
        console.log(`    ${line}`);
      }
    } else {
      console.log('  No imprimió absolutamente nada.');
    }
  } else {
    const [, version, wow] = match;
    const legion = wow.startsWith('7.3');
    if (!legion) ok = false;
    console.log(
      `${legion ? '✓' : '✗'} SimulationCraft ${version} para WoW ${wow}` +
        (legion ? '' : '  ← se esperaba 7.3.5; usa la rama legion-dev'),
    );
    console.log(`  ${simcPath}`);
  }
}

const itemDb = path.join(ROOT, 'data/items.json');
if (fs.existsSync(itemDb)) {
  const items = JSON.parse(fs.readFileSync(itemDb, 'utf8'));
  console.log(`✓ Base de ítems: ${items.length} ítems`);
} else {
  ok = false;
  console.log('✗ Base de ítems: falta data/items.json');
  console.log('  Solución: npm run build:itemdb');
}

const consumables = path.join(ROOT, 'data/consumables.json');
if (fs.existsSync(consumables)) {
  const db = JSON.parse(fs.readFileSync(consumables, 'utf8'));
  console.log(
    `✓ Consumibles: ${db.flasks.length} frascos, ${db.foods.length} comidas, ` +
      `${db.potions.length} pociones, ${db.augmentations.length} runas`,
  );
} else {
  ok = false;
  console.log('✗ Consumibles: falta data/consumables.json');
}

process.exit(ok ? 0 : 1);
