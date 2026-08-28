#!/usr/bin/env node
/**
 * Pruebas de la cadena de Pawn.
 *
 * La cadena se pega dentro del juego, así que un fallo aquí no se ve en la app:
 * se ve cuando Pawn dice «cadena no válida» y el jugador no sabe por qué. Por
 * eso se comprueba el formato carácter a carácter, y no solo que salga algo.
 *
 *   node --test scripts/test-pawn.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPawnScale } from '../packages/shared/src/pawn.ts';

/** Los pesos reales de una sim de mago escarcha, tal y como los da simc. */
const MAGE_FROST = [
  { stat: 'Int', value: 1, error: 0, normalized: 1 },
  { stat: 'Crit', value: 0.9356248931355257, error: 0, normalized: 0.93 },
  { stat: 'Haste', value: 1.208078313225228, error: 0, normalized: 1.2 },
  { stat: 'Mastery', value: 0.7873996091802887, error: 0, normalized: 0.78 },
  { stat: 'Vers', value: 1.395288146779737, error: 0, normalized: 1.39 },
  { stat: 'SP', value: 0.7003547804822748, error: 0, normalized: 0.7 },
];

test('sale el formato que espera Pawn', () => {
  const scale = buildPawnScale('T21_Mage_Frost', 'mage', 'frost', MAGE_FROST);
  assert.equal(
    scale.text,
    '( Pawn: v1: "T21_Mage_Frost": Class=Mage, Spec=Frost, Intellect=1.00,' +
      ' CritRating=0.94, HasteRating=1.21, MasteryRating=0.79, Versatility=1.40 )',
  );
});

test('los decimales van con punto, nunca con coma', () => {
  const { text } = buildPawnScale('X', 'mage', 'frost', MAGE_FROST);
  // Las comas solo separan campos: nunca deben aparecer dentro de un número.
  assert.equal(/=\s*-?\d+,\d/.test(text), false, `hay comas decimales en: ${text}`);
  assert.match(text, /CritRating=0\.94/);
});

test('avisa de lo que Pawn no entiende en vez de callárselo', () => {
  const { skipped } = buildPawnScale('X', 'mage', 'frost', MAGE_FROST);
  assert.deepEqual(skipped, ['SP']);
});

test('la principal queda en 1 y las demás en proporción', () => {
  const { text } = buildPawnScale('X', 'warrior', 'fury', [
    { stat: 'Str', value: 4, error: 0, normalized: 1 },
    { stat: 'Crit', value: 2, error: 0, normalized: 0.5 },
  ]);
  assert.match(text, /Strength=1\.00/);
  assert.match(text, /CritRating=0\.50/);
});

test('las clases de dos palabras salen como las escribe Pawn', () => {
  const { text } = buildPawnScale('X', 'death_knight', 'frost', [
    { stat: 'Str', value: 1, error: 0, normalized: 1 },
  ]);
  assert.match(text, /Class=DeathKnight, Spec=Frost/);

  const hunter = buildPawnScale('X', 'hunter', 'beast_mastery', [
    { stat: 'Agi', value: 1, error: 0, normalized: 1 },
  ]);
  assert.match(hunter.text, /Spec=BeastMastery/);
});

test('la spec que da simc lleva la clase pegada y hay que quitarla', () => {
  // En los resultados la spec no llega como `frost`, sino como el nombre que
  // enseña simc. Sin limpiarlo saldría `Spec=FrostMage`, que Pawn no reconoce.
  const int = [{ stat: 'Int', value: 1, error: 0, normalized: 1 }];
  const str = [{ stat: 'Str', value: 1, error: 0, normalized: 1 }];
  const agi = [{ stat: 'Agi', value: 1, error: 0, normalized: 1 }];

  assert.match(buildPawnScale('X', 'mage', 'Frost Mage', int).text, /Spec=Frost,|Spec=Frost /);
  assert.match(
    buildPawnScale('X', 'death_knight', 'Unholy Death Knight', str).text,
    /Class=DeathKnight, Spec=Unholy,/,
  );
  assert.match(
    buildPawnScale('X', 'hunter', 'Beast Mastery Hunter', agi).text,
    /Spec=BeastMastery,/,
  );
  // Si ya viene limpia no se toca.
  assert.match(buildPawnScale('X', 'mage', 'frost', int).text, /Spec=Frost,/);
  // Y una spec que se llame como la clase no se queda vacía.
  assert.match(buildPawnScale('X', 'mage', 'Mage', int).text, /Spec=Mage,/);
});

test('un nombre con comillas no parte la cadena', () => {
  // Sin limpiar, la comilla cerraría el nombre antes de tiempo y Pawn
  // rechazaría la importación.
  const { text } = buildPawnScale('El "Mejor"', 'mage', 'fire', [
    { stat: 'Int', value: 1, error: 0, normalized: 1 },
  ]);
  assert.equal(text.split('"').length - 1, 2, `comillas de más en: ${text}`);
  assert.match(text, /"El Mejor"/);
});

test('sin ninguna estadística que Pawn entienda no se inventa una cadena', () => {
  const scale = buildPawnScale('X', 'mage', 'frost', [
    { stat: 'SP', value: 1, error: 0, normalized: 1 },
  ]);
  assert.equal(scale, null);
});

test('un peso principal de 0 no rompe el cálculo', () => {
  const { text } = buildPawnScale('X', 'mage', 'frost', [
    { stat: 'Int', value: 0, error: 0, normalized: 0 },
    { stat: 'Crit', value: 2, error: 0, normalized: 1 },
  ]);
  assert.equal(text.includes('NaN'), false, text);
  assert.match(text, /CritRating=1\.00/);
});
