import path from 'node:path';
import { tokenize, type ArtifactTrait, type Character } from '@rbl/shared';
import { config } from '../config.js';
import { gearItemToLine } from './import.js';
import { runSimc } from './runner.js';

export interface ArtifactProbe {
  traits: ArtifactTrait[];
  /** ilvl efectivo del arma artefacto, tal y como lo calcula el motor. */
  weaponIlevel?: number;
  /**
   * ilvl de reliquia equivalente: el valor uniforme que reproduce el ilvl real
   * del arma. Sirve como punto de partida para comparar subidas de reliquia.
   */
  estimatedRelicIlevel?: number;
  /** false si la estimación no cuadró exactamente con el ilvl del arma. */
  relicIlevelExact?: boolean;
}

/** Rango de búsqueda para el ilvl de reliquia (Legion se mueve dentro de esto). */
const RELIC_ILEVEL_MIN = 700;
const RELIC_ILEVEL_MAX = 1100;
const MAX_PROBES = 12;

function probeDir(character: Character): string {
  return path.join(config.stateDir, 'runs', `artifact-${character.id}`);
}

/** Ejecuta una simulación de una iteración y devuelve el informe JSON. */
async function probe(
  character: Character,
  extraLines: string[] = [],
): Promise<any> {
  const run = await runSimc({
    profileText: [character.profile, ...extraLines].join('\n') + '\n',
    args: ['iterations=1', 'threads=1', 'max_time=10'],
    runDir: probeDir(character),
  });
  return run.json;
}

function parseTraits(json: any): ArtifactTrait[] {
  const raw = json?.sim?.players?.[0]?.artifact;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry: any) => {
      const name = String(entry?.name ?? '');
      return {
        id: Number(entry?.id) || 0,
        name,
        token: tokenize(name),
        totalRank: Number(entry?.total_rank) || 0,
        purchasedRank: Number(entry?.purchased_rank) || 0,
        crucibleRank: Number(entry?.crucible_rank) || 0,
        relicRank: Number(entry?.relic_rank) || 0,
      } satisfies ArtifactTrait;
    })
    .filter((trait) => trait.id > 0 && trait.name.length > 0);
}

function weaponIlevelOf(json: any): number | undefined {
  const value = json?.sim?.players?.[0]?.gear?.main_hand?.ilevel;
  return typeof value === 'number' && value > 0 ? value : undefined;
}

/**
 * Despeja el ilvl de las reliquias del arma.
 *
 * El addon no lo exporta: va codificado en los bonus_id de cada reliquia. Pero
 * el motor sí publica el ilvl resultante del arma, y la relación entre ambos es
 * monótona, así que basta con buscar por bisección el valor uniforme de
 * `relic_ilevel` que reproduce ese ilvl. Cada sondeo es una simulación de una
 * iteración (~0,2 s), así que el proceso entero va sobrado.
 */
async function solveRelicIlevel(
  character: Character,
  targetWeaponIlevel: number,
): Promise<{ ilevel?: number; exact: boolean }> {
  const weapon = character.gear.main_hand;
  if (!weapon) return { exact: false };

  const measure = async (relicIlevel: number): Promise<number | undefined> => {
    const line = `${gearItemToLine(weapon, 'main_hand')},relic_ilevel=${relicIlevel}/${relicIlevel}/${relicIlevel}`;
    return weaponIlevelOf(await probe(character, [line]));
  };

  let low = RELIC_ILEVEL_MIN;
  let high = RELIC_ILEVEL_MAX;
  let best: { ilevel: number; distance: number } | undefined;

  for (let step = 0; step < MAX_PROBES && low <= high; step++) {
    const middle = Math.floor((low + high) / 2);
    const measured = await measure(middle);
    if (measured === undefined) return { exact: false };

    const distance = Math.abs(measured - targetWeaponIlevel);
    if (!best || distance < best.distance) best = { ilevel: middle, distance };
    if (measured === targetWeaponIlevel) return { ilevel: middle, exact: true };

    if (measured < targetWeaponIlevel) low = middle + 1;
    else high = middle - 1;
  }

  return { ilevel: best?.ilevel, exact: best?.distance === 0 };
}

/**
 * Lee los rasgos del artefacto preguntándoselos al motor.
 *
 * Podríamos parsear la cadena `artifact=` del addon, pero ahí solo vienen ids y
 * los rangos comprados: faltan los del Crisol y los que dan las reliquias, y no
 * hay nombres. El motor resuelve todo eso e incluye la lista completa en su
 * informe JSON, así que se la preguntamos a él en vez de mantener nuestra
 * propia copia de la DBC de artefactos.
 */
export async function readArtifactTraits(
  character: Character,
): Promise<ArtifactProbe> {
  const json = await probe(character);
  const traits = parseTraits(json);
  const weaponIlevel = weaponIlevelOf(json);

  if (!weaponIlevel || !character.gear.main_hand) {
    return { traits, weaponIlevel };
  }

  const solved = await solveRelicIlevel(character, weaponIlevel);
  return {
    traits,
    weaponIlevel,
    estimatedRelicIlevel: solved.ilevel,
    relicIlevelExact: solved.exact,
  };
}
