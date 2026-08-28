#!/usr/bin/env node
/**
 * Comprueba que la fuente de iconos responde y que la app entiende lo que
 * devuelve.
 *
 * Existe por un motivo concreto: el entorno donde se escribió esta parte no
 * tiene acceso a las webs de WoW, así que la llamada externa no se pudo probar
 * allí. En vez de dar por supuesto que el JSON tiene la forma esperada, este
 * comando la pide de verdad y enseña lo que llega, para que un fallo se vea en
 * un comando y no en una interfaz medio rota.
 *
 * Uso:
 *   npm run check:icons
 *   npm run check:icons -- 152138 154176
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_SOURCE =
  'https://nether.wowhead.com/tooltip/item/{id}?dataEnv=1&locale=0';

/** Ítems conocidos de Legion, para que el resultado sea reconocible. */
const DEFAULT_IDS = [152138, 154176, 128862];

const source = process.env.RBL_ICON_SOURCE || DEFAULT_SOURCE;
const ids = process.argv.slice(2).map(Number).filter(Boolean);
const targets = ids.length ? ids : DEFAULT_IDS;

/** La misma lectura que hace el servidor, para probar exactamente eso. */
function parseMediaResponse(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const icon =
    typeof payload.icon === 'string'
      ? payload.icon
      : typeof payload.iconName === 'string'
        ? payload.iconName
        : undefined;
  const name =
    typeof payload.name === 'string'
      ? payload.name
      : typeof payload.name_enus === 'string'
        ? payload.name_enus
        : undefined;
  if (!icon && !name) return null;
  return { name, icon };
}

console.log(`Fuente: ${source}\n`);

let ok = 0;
let failed = 0;

for (const id of targets) {
  const url = source.replace('{id}', String(id));
  process.stdout.write(`item ${id}  `);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      failed++;
      console.log(`✗ respondió ${response.status}`);
      continue;
    }

    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      failed++;
      console.log('✗ la respuesta no es JSON');
      console.log(`    empieza por: ${text.slice(0, 120)}`);
      continue;
    }

    const parsed = parseMediaResponse(payload);
    if (!parsed?.icon) {
      failed++;
      console.log('✗ respondió, pero no se encontró el icono');
      console.log(`    claves que trae: ${Object.keys(payload).join(', ')}`);
      console.log('    Si ahí hay algo que parezca el icono con otro nombre,');
      console.log('    dilo: se añade a la lectura en packages/server/src/data/media.ts');
      continue;
    }

    ok++;
    console.log(`✓ ${parsed.name ?? '(sin nombre)'}  ·  icono: ${parsed.icon}`);
    console.log(
      `    https://wow.zamimg.com/images/wow/icons/medium/${parsed.icon.toLowerCase()}.jpg`,
    );
  } catch (err) {
    failed++;
    console.log(`✗ no se pudo conectar: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

console.log(`\n${ok} correctos, ${failed} con problemas`);

if (failed) {
  console.log('\nLa app funciona igual sin iconos: enseña el nombre de la base de');
  console.log('datos y un recuadro con las iniciales. Para desactivar del todo la');
  console.log('conexión externa:  RBL_ICONS=off');
  console.log('Para usar otra fuente:  RBL_ICON_SOURCE="https://.../{id}"');
}

process.exit(failed && !ok ? 1 : 0);
