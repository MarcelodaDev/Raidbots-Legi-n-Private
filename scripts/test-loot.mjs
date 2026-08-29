#!/usr/bin/env node
/**
 * Pruebas del volcado de la tabla de botín.
 *
 * Lo que se guarda aquí es lo único que sabe la app sobre de dónde sale cada
 * pieza, así que si el lector se traga una línea a medias, el buscador de
 * mejoras manda al jugador al jefe equivocado sin dar ningún error.
 *
 *   npm run test:loot
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLootDump } from '../packages/server/src/data/loot.ts';

const DUMP = [
  '# Raidbots Legion · tabla de botín 1.0.0',
  '# 2026-08-29 20:00 · x5',
  '# 5 jefes, 8 piezas.',
  '#',
  '# Sale del Diario de Mazmorras del cliente.',
  '',
  '# drop:142124=Catedral de la Noche Eterna / Domatrax',
  '# drop:140894=Bastión Nocturno / Skorpyron',
  '# drop:134542=Corte de las Estrellas / Consejero Melandrus',
].join('\n');

test('lee las líneas de botín y se salta la cabecera', () => {
  const table = parseLootDump(DUMP);
  assert.deepEqual(table.sources[142124], ['Catedral de la Noche Eterna / Domatrax']);
  assert.deepEqual(table.sources[140894], ['Bastión Nocturno / Skorpyron']);
  assert.equal(Object.keys(table.sources).length, 3);
  assert.equal(table.bosses, 3);
});

test('una pieza que cae de dos jefes guarda los dos', () => {
  const table = parseLootDump(
    [
      '# drop:134542=Corte de las Estrellas / Consejero Melandrus',
      '# drop:134542=Bastión Nocturno / Botín extra',
    ].join('\n'),
  );
  assert.equal(table.sources[134542].length, 2);
  assert.equal(table.bosses, 2);
});

test('el mismo jefe repetido no se duplica', () => {
  // Pasa si se vuelca dos veces y se pega todo junto.
  const line = '# drop:134542=Corte de las Estrellas / Consejero Melandrus';
  const table = parseLootDump([line, line].join('\n'));
  assert.equal(table.sources[134542].length, 1);
  assert.equal(table.bosses, 1);
});

test('el nombre del jefe puede llevar barras y acentos', () => {
  const table = parseLootDump("# drop:1=Bastión Nocturno / Gul'dan / fase 2");
  assert.deepEqual(table.sources[1], ["Bastión Nocturno / Gul'dan / fase 2"]);
});

test('las líneas que no son botín se ignoran', () => {
  const table = parseLootDump(
    [
      'warrior="Marceloda"',
      '# stats:158311=1052str',
      '# racial:999001=Sangre haranir',
      '# drop:5=Sitio / Jefe',
      '# drop:=Sin id',
      '# drop:0=Id cero',
      '# drop:7=',
    ].join('\n'),
  );
  assert.deepEqual(Object.keys(table.sources), ['5']);
});

test('un volcado vacío devuelve una tabla vacía, no una rota', () => {
  const table = parseLootDump('');
  assert.deepEqual(table.sources, {});
  assert.equal(table.bosses, 0);
  assert.ok(table.importedAt);
});
