#!/usr/bin/env node
/**
 * Pruebas del ordenador de candidatos.
 *
 * Este código decide qué se simula y qué no. Si se equivoca, la pieza buena
 * jamás llega a pelearse y el jugador nunca se entera: no hay error, solo una
 * lista peor de lo que podría ser. Por eso se comprueba aquí.
 *
 *   npm run test:upgrades
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  pickSlotCandidates,
  statScore,
  weightsByStat,
} from '../packages/shared/src/upgrades.ts';

/** Pesos de un mago escarcha: la versatilidad manda, la maestría es la peor. */
const FACTORS = [
  { stat: 'Int', value: 1, error: 0, normalized: 1 },
  { stat: 'Crit', value: 0.94, error: 0, normalized: 0.94 },
  { stat: 'Haste', value: 1.21, error: 0, normalized: 1.21 },
  { stat: 'Mastery', value: 0.79, error: 0, normalized: 0.79 },
  { stat: 'Vers', value: 1.4, error: 0, normalized: 1.4 },
];
const W = weightsByStat(FACTORS);

const item = (id, ilevel, stats) => ({
  id, name: `item${id}`, ilevel, quality: 4, inventoryType: 1,
  itemClass: 4, itemSubclass: 1, classMask: 0, slots: ['head'], stats,
});

// ITEM_MOD: 5 Int, 7 Sta, 32 Crit, 36 Haste, 40 Vers, 49 Mastery.
const VERS_HASTE = [7, 5, 40, 36];
const MASTERY_CRIT = [7, 5, 49, 32];

test('una pieza flexible cuenta como tu estadística principal', () => {
  assert.equal(W.Primary, 1);
  // 73 = agi/int flexible.
  assert.equal(statScore([73, 40], W), 1 + 1.4);
});

test('el aguante no puntúa: no da DPS', () => {
  assert.equal(statScore([7], W), 0);
  assert.equal(statScore([5, 7], W), statScore([5], W));
});

test('con el mismo ilvl gana la que lleva las estadísticas que te rentan', () => {
  const buenas = statScore(VERS_HASTE, W);
  const malas = statScore(MASTERY_CRIT, W);
  assert.ok(buenas > malas, `${buenas} debería superar a ${malas}`);
});

test('una estadística repetida no cuenta dos veces', () => {
  // La DBC repite entradas en algunas piezas (Ebonchill trae Int dos veces).
  assert.equal(statScore([5, 5, 40], W), statScore([5, 40], W));
});

test('entran las mejores por estadísticas y las mejores por ilvl', () => {
  const items = [
    item(1, 900, VERS_HASTE),   // buenas stats, ilvl bajo
    item(2, 970, MASTERY_CRIT), // stats malas, ilvl alto
    item(3, 910, MASTERY_CRIT), // mediocre por los dos lados
  ];
  const picked = pickSlotCandidates(items, W, 2);
  const ids = picked.map((p) => p.item.id).sort();

  // La 1 por estadísticas y la 2 por ilvl. La 3 no destaca en nada.
  assert.deepEqual(ids, [1, 2]);
  assert.equal(picked.find((p) => p.item.id === 1).reason, 'estadísticas');
  assert.equal(picked.find((p) => p.item.id === 2).reason, 'ilvl');
});

test('la mejor por ilvl nunca se queda fuera aunque tenga malas estadísticas', () => {
  // El caso que un orden solo por estadísticas se comería: una pieza muy por
  // encima de ilvl gana igualmente por presupuesto bruto.
  const items = [
    ...Array.from({ length: 10 }, (_, i) => item(100 + i, 900, VERS_HASTE)),
    item(999, 970, MASTERY_CRIT),
  ];
  const ids = pickSlotCandidates(items, W, 6).map((p) => p.item.id);
  assert.ok(ids.includes(999), `la de ilvl 970 no entró: ${ids}`);
});

test('no se devuelven más candidatos de los pedidos ni repetidos', () => {
  const items = Array.from({ length: 40 }, (_, i) =>
    item(i, 900 + i, i % 2 ? VERS_HASTE : MASTERY_CRIT),
  );
  const picked = pickSlotCandidates(items, W, 8);
  assert.equal(picked.length, 8);
  assert.equal(new Set(picked.map((p) => p.item.id)).size, 8);
});

test('si hay menos piezas que el cupo se devuelven todas', () => {
  const items = [item(1, 900, VERS_HASTE), item(2, 910, MASTERY_CRIT)];
  assert.equal(pickSlotCandidates(items, W, 8).length, 2);
});

test('sin piezas o sin cupo no revienta', () => {
  assert.deepEqual(pickSlotCandidates([], W, 5), []);
  assert.deepEqual(pickSlotCandidates([item(1, 900, VERS_HASTE)], W, 0), []);
});

test('una pieza sin estadísticas puntúa 0 pero sigue pudiendo entrar por ilvl', () => {
  // Los abalorios llevan su valor en el proc, no en las estadísticas.
  assert.equal(statScore(undefined, W), 0);
  assert.equal(statScore([], W), 0);
  const ids = pickSlotCandidates(
    [item(1, 900, VERS_HASTE), item(2, 970, [])], W, 2,
  ).map((p) => p.item.id);
  assert.ok(ids.includes(2));
});

test('el orden es estable: dos llamadas dan lo mismo', () => {
  const items = Array.from({ length: 20 }, (_, i) =>
    item(i, 930, i % 2 ? VERS_HASTE : MASTERY_CRIT),
  );
  const a = pickSlotCandidates(items, W, 6).map((p) => p.item.id);
  const b = pickSlotCandidates(items, W, 6).map((p) => p.item.id);
  assert.deepEqual(a, b);
});
