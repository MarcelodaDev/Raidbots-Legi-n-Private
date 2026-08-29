#!/usr/bin/env node
/**
 * Pruebas de los ítems descritos a mano.
 *
 * Estas tres cadenas las escribe el jugador y acaban dentro de una línea de un
 * perfil .simc que la app ejecuta como proceso. Un salto de línea o una coma
 * mal colada no dan un error: dan una orden nueva al simulador. Por eso la
 * validación es lista blanca y por eso se prueba aquí.
 *
 *   npm run test:custom
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { customItemToken, validateCustomItem } from '../packages/shared/src/index.ts';

const ok = (custom) => validateCustomItem(custom).length === 0;

test('una pieza normal pasa', () => {
  assert.ok(ok({ stats: '1052str_654crit_436haste' }));
});

test('un abalorio con efecto de uso pasa', () => {
  assert.ok(ok({ stats: '0str', use: '4500str_20dur_120cd' }));
});

test('un abalorio con proc pasa, con barras y decimales', () => {
  assert.ok(ok({ stats: '900crit', equip: '3000crit_15dur_1.5rppm_procby/attack_procon/hit' }));
});

test('sin estadísticas no se acepta', () => {
  assert.equal(ok({ stats: '' }), false);
  assert.equal(ok({ stats: '   ' }), false);
});

test('una coma partiría la línea en dos opciones', () => {
  // ",use=..." sería una opción nueva del mismo ítem.
  assert.equal(ok({ stats: '100str,use=99999str_60dur_1cd' }), false);
});

test('un salto de línea abriría una orden nueva del perfil', () => {
  assert.equal(ok({ stats: '100str\niterations=1' }), false);
  assert.equal(ok({ stats: '100str\r\nthreads=64' }), false);
});

test('un igual dentro del valor no cuela', () => {
  assert.equal(ok({ stats: '100str_output=/etc/passwd' }), false);
});

test('las estadísticas inventadas se rechazan', () => {
  assert.equal(ok({ stats: '100dps' }), false);
  assert.equal(ok({ stats: '100str_500foo' }), false);
});

test('los tokens de efecto solo valen en los campos de efecto', () => {
  // "dur" y "cd" describen un efecto, no una estadística.
  assert.equal(ok({ stats: '100str_20dur' }), false);
  assert.ok(ok({ stats: '100str', use: '4000str_20dur_120cd' }));
});

test('el nombre se convierte en un identificador que simc acepta', () => {
  assert.equal(customItemToken('Placas de esgrima disimuladas', 0), 'placas_de_esgrima_disimuladas');
  assert.equal(customItemToken('Vértebras de Naj\'entus', 0), 'vertebras_de_naj_entus');
  assert.equal(customItemToken('  ', 158311), 'item_158311');
  assert.equal(customItemToken(undefined, 158311), 'item_158311');
});

test('un nombre que es solo símbolos no genera un identificador vacío', () => {
  // Un identificador vacío dejaría la línea como "wrist=,ilevel=..." y simc
  // leería el hueco como una pieza sin nombre.
  assert.equal(customItemToken('¡¿!?', 42), 'item_42');
});
