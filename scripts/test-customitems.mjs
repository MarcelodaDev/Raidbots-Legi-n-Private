#!/usr/bin/env node
/**
 * Pruebas del catálogo de piezas que el motor no conoce.
 *
 * Es el fichero que hace que describir una pieza sea una sola vez para todo el
 * mundo. Si el lector del volcado se equivoca de campo, el catálogo se llena de
 * entradas con el nombre en el ilvl y nadie se entera hasta que una simulación
 * da un número raro.
 *
 *   npm run test:customitems
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseScanDump } from '../packages/server/src/data/customitems.ts';

const LINE =
  '# custom:158311|885|4|INVTYPE_WRIST|4:6|1052str_654crit_436haste|Placas de esgrima disimuladas';

test('lee una pieza con todos sus campos', () => {
  const { entries } = parseScanDump(LINE);
  assert.equal(entries.length, 1);
  assert.deepEqual(
    { ...entries[0], addedAt: undefined },
    {
      itemId: 158311,
      name: 'Placas de esgrima disimuladas',
      slot: 'wrist',
      ilevel: 885,
      stats: '1052str_654crit_436haste',
      addedAt: undefined,
    },
  );
});

test('el INVTYPE se traduce al hueco de simc', () => {
  const dump = [
    '# custom:1|900|4|INVTYPE_TRINKET|4:6|100crit|Abalorio',
    '# custom:2|900|4|INVTYPE_FINGER|4:6|100crit|Anillo',
    '# custom:3|900|4|INVTYPE_2HWEAPON|2:5|100crit|Arma',
    '# custom:4|900|4|INVTYPE_ROBE|4:1|100crit|Tunica',
  ].join('\n');
  assert.deepEqual(
    parseScanDump(dump).entries.map((e) => e.slot),
    ['trinket1', 'finger1', 'main_hand', 'chest'],
  );
});

test('un nombre con barra no se corta por la mitad', () => {
  // El nombre es el último campo justamente porque puede contener casi de todo.
  const { entries } = parseScanDump('# custom:9|900|4|INVTYPE_HEAD|4:6|100crit|Yelmo | de prueba');
  assert.equal(entries[0].name, 'Yelmo | de prueba');
});

test('el efecto se pega a su pieza', () => {
  const { entries } = parseScanDump(
    [LINE, '# effect:158311=Uso: Aumenta tu Fuerza en 4500 durante 20 s.'].join('\n'),
  );
  assert.equal(entries[0].effectText, 'Uso: Aumenta tu Fuerza en 4500 durante 20 s.');
});

test('una pieza sin estadísticas no entra, pero se dice cuál es', () => {
  // Sin estadísticas no hay nada que simular: meterla en el catálogo daría una
  // pieza que se equipa y no aporta, que es peor que no tenerla.
  const { entries, withoutStats } = parseScanDump(
    '# custom:77|900|4|INVTYPE_HEAD|4:6||Yelmo sin datos',
  );
  assert.equal(entries.length, 0);
  assert.deepEqual(withoutStats, ['Yelmo sin datos (id 77)']);
});

test('las demás líneas del volcado se ignoran', () => {
  const dump = [
    '# Raidbots Legion · ítems para el catálogo 1.0.0',
    '# 3 piezas de 1000 ids mirados.',
    '# drop:158311=Mazmorra / Jefe',
    LINE,
  ].join('\n');
  assert.equal(parseScanDump(dump).entries.length, 1);
});

test('una línea a medias se descarta en vez de guardarse mal', () => {
  assert.equal(parseScanDump('# custom:5|900|4|INVTYPE_HEAD').entries.length, 0);
});

test('la misma pieza dos veces entra una sola vez', () => {
  assert.equal(parseScanDump([LINE, LINE].join('\n')).entries.length, 1);
});
