#!/usr/bin/env node
/**
 * Pruebas del catálogo de ids conocidos.
 *
 * Existe por un fallo real: un servidor privado repartió una pieza de un parche
 * posterior (id 158311), llegó a una simulación de 62 variantes y
 * SimulationCraft canceló el lote entero con un «unable to initialize item».
 * No se perdió esa variante: se perdieron las 62, y sin mensaje en la app.
 *
 * Lo que se comprueba aquí es la distinción que causó el fallo: "¿sale en el
 * buscador?" y "¿lo sabe construir simc?" son preguntas distintas, y el guardia
 * tiene que usar la segunda.
 *
 *   npm run test:itemdb
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { getItem, loadItemDb, simcKnowsItem } from '../packages/server/src/data/itemdb.ts';

loadItemDb();

/**
 * El catálogo se genera desde el DBC de simc y no va en el repositorio, así que
 * en una copia recién clonada todavía no existe. Sin él estas pruebas no tienen
 * nada que mirar: se saltan en vez de fallar.
 */
const built = { skip: simcKnowsItem(999999999) ? 'falta data/known-items.json: ejecuta `npm run build:itemdb`' : false };

/** Espadas de guerra de los Valarjar, el artefacto de furia. */
const ARTIFACT_MAIN_HAND = 128908;
const ARTIFACT_OFF_HAND = 134553;
/** Placas de esgrima disimuladas: no existe en 7.3.5. */
const LATER_PATCH_ITEM = 158311;
/** Destrero Ceann-Ar, legendaria de cabeza de Legion. */
const NORMAL_ITEM = 137088;

test('el catálogo se ha generado', built, () => {
  assert.ok(simcKnowsItem(NORMAL_ITEM));
});

test('una pieza de un parche posterior se detecta como desconocida', built, () => {
  assert.equal(simcKnowsItem(LATER_PATCH_ITEM), false);
});

test('los artefactos cuentan como conocidos aunque no salgan en el buscador', built, () => {
  // El buscador filtra por ilvl 800 y los artefactos tienen ilvl base 750, así
  // que no están en items.json. Usar esa ausencia como prueba de que simc no
  // los conoce rechazaría el arma de todo el mundo.
  assert.equal(getItem(ARTIFACT_MAIN_HAND), undefined);
  assert.equal(getItem(ARTIFACT_OFF_HAND), undefined);
  assert.equal(simcKnowsItem(ARTIFACT_MAIN_HAND), true);
  assert.equal(simcKnowsItem(ARTIFACT_OFF_HAND), true);
});

test('un id inventado es desconocido', built, () => {
  assert.equal(simcKnowsItem(999999999), false);
});
