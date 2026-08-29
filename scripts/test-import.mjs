#!/usr/bin/env node
/**
 * Pruebas del importador de perfiles.
 *
 * El addon escribe cada pieza de la bolsa en dos líneas: un rótulo con el
 * nombre y el ilvl, y debajo la línea de equipo comentada, que no lleva
 * ninguna de las dos cosas. Si el importador se queda solo con la segunda, las
 * piezas entran sin nombre y sin ilvl, y las que el buscador no conoce salen
 * como «Ítem 158311» sin que nada falle: por eso se prueba el par completo.
 *
 *   npm run test:import
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSimcProfile } from '../packages/server/src/simc/import.ts';
import { loadItemDb, simcKnowsItem } from '../packages/server/src/data/itemdb.ts';

// El aviso de ítems desconocidos necesita el catálogo del DBC, que se genera y
// no va en el repositorio. Sin él, `simcKnowsItem` da por buenos todos los ids
// a propósito, así que esa prueba concreta se salta en vez de fallar.
loadItemDb();
const built = { skip: simcKnowsItem(999999999) ? 'falta data/known-items.json: ejecuta `npm run build:itemdb`' : false };

const HEADER = [
  'warrior="Marceloda"',
  'level=110',
  'race=harronir',
  'spec=fury',
  'talents=2133212',
  'head=,id=138357,bonus_id=3516/3528/1487',
  '',
  '### Gear from Bags',
].join('\n');

const parse = (bagLines) => parseSimcProfile(`${HEADER}\n${bagLines.join('\n')}\n`);

test('el rótulo da nombre e ilvl a la pieza de la línea siguiente', () => {
  const { bag } = parse([
    '# Vértebras de Naj\'entus (940, bolsas)',
    '#waist=,id=137087,bonus_id=3459/3530',
  ]);
  assert.equal(bag.length, 1);
  assert.equal(bag[0].name, "Vértebras de Naj'entus");
  assert.equal(bag[0].ilevel, 940);
  assert.equal(bag[0].slot, 'waist');
});

test('cada pieza se queda con su propio rótulo', () => {
  const { bag } = parse([
    '# Kazzalax, Furia de Fujieda (940, bolsas)',
    '#back=,id=137053,bonus_id=3530',
    '# Prydaz, obra maestra de Xavaric (910, bolsas)',
    '#neck=,id=132444,bonus_id=3459/3529',
  ]);
  assert.deepEqual(
    bag.map((item) => [item.name, item.ilevel]),
    [
      ['Kazzalax, Furia de Fujieda', 940],
      ['Prydaz, obra maestra de Xavaric', 910],
    ],
  );
});

test('un rótulo suelto no se pega a una pieza que no es la suya', () => {
  // La nota final del addon no lleva pieza detrás; si se quedara pendiente,
  // bautizaría a la siguiente que apareciera.
  const { bag } = parse([
    '# Prydaz, obra maestra de Xavaric (910, bolsas)',
    '#neck=,id=132444,bonus_id=3459/3529',
    '# Nota: el banco no estaba abierto, así que no se ha incluido.',
    '#back=,id=137053,bonus_id=3530',
  ]);
  assert.equal(bag[1].name, undefined);
  assert.equal(bag[1].itemId, 137053);
});

test('el rótulo no pisa un nombre que ya venga en la propia línea', () => {
  const { bag } = parse([
    '# Nombre del rótulo (910, bolsas)',
    '#neck=Nombre de la línea,id=132444,bonus_id=3459/3529',
  ]);
  assert.equal(bag[0].name, 'Nombre de la línea');
});

test('avisa de las piezas que el simulador no conoce, con su nombre', built, () => {
  const { warnings } = parse([
    '# Placas de esgrima disimuladas (885, bolsas)',
    '#wrist=,id=158311,bonus_id=3535/3528/1537',
  ]);
  const aviso = warnings.find((w) => w.includes('158311'));
  assert.ok(aviso, 'debería avisar del id desconocido');
  assert.ok(
    aviso.includes('Placas de esgrima disimuladas'),
    'el aviso debería nombrar la pieza, no solo su id',
  );
});

test('las estadísticas leídas del cliente llegan a su pieza', () => {
  const { gear, bag } = parse([
    '# Destrero Ceann-Ar (940, bolsas)',
    '#head=,id=137088,bonus_id=3459/3530',
    '',
    '### Item Stats',
    '# stats:138357=1200str_700crit',
    '# stats:137088=1500str_900haste',
    '# effect:137088=Equipar: Tus ataques tienen la probabilidad de algo.',
  ]);
  assert.equal(gear.head.scannedStats, '1200str_700crit');
  assert.equal(bag[0].scannedStats, '1500str_900haste');
  assert.equal(bag[0].scannedEffect, 'Equipar: Tus ataques tienen la probabilidad de algo.');
});

test('lo leído del cliente es un dato, no convierte la pieza en una a mano', () => {
  // Si `custom` se rellenara solo, todas las piezas se simularían con una copia
  // aproximada en vez de con sus datos reales, que traen escalado y efectos.
  const { gear } = parse(['### Item Stats', '# stats:138357=1200str_700crit']);
  assert.equal(gear.head.custom, undefined);
});

test('los raciales entran con su descripción', () => {
  const { racials } = parse([
    '### Racials',
    '# racial:999001=Sangre de la montaña',
    '#   Aumenta el daño de golpe crítico un 3%.',
    '# racial:999002=Paso del bosque',
    '#   Aumenta la velocidad de movimiento un 4%.',
  ]);
  assert.equal(racials.length, 2);
  assert.deepEqual(racials[0], {
    id: 999001,
    name: 'Sangre de la montaña',
    description: 'Aumenta el daño de golpe crítico un 3%.',
  });
  assert.equal(racials[1].name, 'Paso del bosque');
});

test('un bloque de stats no bautiza a la pieza de bolsa siguiente', () => {
  // Las líneas de stats no son rótulos; si se trataran como tales, la siguiente
  // pieza heredaría un nombre inventado.
  const { bag } = parse([
    '### Item Stats',
    '# stats:137088=1500str',
    '#back=,id=137053,bonus_id=3530',
  ]);
  assert.equal(bag[0].name, undefined);
});

test('el equipo puesto no se confunde con el de la bolsa', () => {
  const { gear, bag } = parse([
    '# Destrero Ceann-Ar (940, bolsas)',
    '#head=,id=137088,bonus_id=3459/3530',
  ]);
  assert.equal(gear.head.itemId, 138357);
  assert.equal(bag.length, 1);
  assert.equal(bag[0].itemId, 137088);
});
