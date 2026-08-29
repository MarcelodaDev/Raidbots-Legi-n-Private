import type { ItemRecord, ScaleFactor } from './index.js';

/**
 * Elegir qué ítems merece la pena simular.
 *
 * En una fase cualquiera hay miles de piezas que tu clase puede llevar
 * (para un mago con tope 970 son unas 2.700). Simularlas todas llevaría horas,
 * así que primero se ordenan sin simular y solo se pelean las mejores de cada
 * hueco.
 *
 * Para ordenarlas se usan los tipos de estadística que trae la base de datos y
 * los pesos que calculó tu propia simulación. Importante: se mira **qué**
 * estadísticas lleva la pieza, no cuántas. Los importes dependen del
 * presupuesto por ilvl, y calcularlos aquí sería reimplementar a
 * SimulationCraft — con el riesgo de sacar números creíbles y equivocados. El
 * orden solo tiene que acertar a grandes rasgos: quien decide de verdad es la
 * simulación que viene después.
 */

/** ITEM_MOD_* de la DBC → nombre de estadística de simc. */
export const ITEM_MOD_STATS: Record<number, string> = {
  3: 'Agi',
  4: 'Str',
  5: 'Int',
  7: 'Sta',
  32: 'Crit',
  36: 'Haste',
  38: 'AP',
  40: 'Vers',
  45: 'SP',
  49: 'Mastery',
  50: 'BonusArmor',
  62: 'Leech',
  63: 'Avoidance',
  64: 'Speed',
  // Las piezas "flexibles" dan la principal que te toque por especialización.
  71: 'Primary',
  72: 'Primary',
  73: 'Primary',
  74: 'Primary',
};

/** Las que de verdad mueven el DPS. Aguante y armadura no pintan nada aquí. */
const SCORED = new Set(['Agi', 'Str', 'Int', 'Primary', 'Crit', 'Haste', 'Mastery', 'Vers', 'AP', 'SP']);

/** Los pesos por nombre de estadística, a partir de lo que devolvió simc. */
export function weightsByStat(factors: ScaleFactor[]): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const factor of factors) weights[factor.stat] = factor.value;

  // Una pieza flexible acaba dando tu principal, sea cual sea.
  const primary = ['Int', 'Str', 'Agi']
    .map((stat) => weights[stat])
    .find((value) => typeof value === 'number');
  if (primary !== undefined) weights.Primary = primary;

  return weights;
}

/**
 * Cuánto promete una pieza, sin simularla.
 *
 * Suma los pesos de las estadísticas que lleva. Casi todas las piezas tienen la
 * principal más dos secundarias, así que lo que separa a unas de otras es qué
 * dos secundarias son: justo lo que mide esto.
 */
export function statScore(
  stats: number[] | undefined,
  weights: Record<string, number>,
): number {
  if (!stats?.length) return 0;

  let score = 0;
  const counted = new Set<string>();
  for (const mod of stats) {
    const stat = ITEM_MOD_STATS[mod];
    if (!stat || !SCORED.has(stat) || counted.has(stat)) continue;
    counted.add(stat);
    score += weights[stat] ?? 0;
  }
  return score;
}

export interface ScoredItem {
  item: ItemRecord;
  score: number;
  /** Por qué entró en la lista. */
  reason: 'estadísticas' | 'ilvl';
}

/**
 * Los candidatos de un hueco: mitad por estadísticas, mitad por ilvl.
 *
 * Una pieza puede ser mejor por dos motivos distintos: porque lleva justo las
 * estadísticas que te rentan, o porque sencillamente tiene más ilvl y más de
 * todo. Ordenar solo por uno de los dos criterios pierde el otro, así que se
 * cogen las mejores de cada lista y se juntan.
 */
export function pickSlotCandidates(
  items: ItemRecord[],
  weights: Record<string, number>,
  limit: number,
): ScoredItem[] {
  if (limit <= 0 || !items.length) return [];

  const scored = items.map((item) => ({ item, score: statScore(item.stats, weights) }));

  const byStats = [...scored].sort(
    (a, b) => b.score - a.score || b.item.ilevel - a.item.ilevel || a.item.id - b.item.id,
  );
  const byIlevel = [...scored].sort(
    (a, b) => b.item.ilevel - a.item.ilevel || b.score - a.score || a.item.id - b.item.id,
  );

  const picked = new Map<number, ScoredItem>();
  const half = Math.max(1, Math.ceil(limit / 2));

  for (const entry of byStats.slice(0, half)) {
    picked.set(entry.item.id, { ...entry, reason: 'estadísticas' });
  }
  for (const entry of byIlevel) {
    if (picked.size >= limit) break;
    if (picked.has(entry.item.id)) continue;
    picked.set(entry.item.id, { ...entry, reason: 'ilvl' });
  }
  // Si el hueco por ilvl se agotó antes de llenar el cupo, se completa con las
  // siguientes por estadísticas.
  for (const entry of byStats) {
    if (picked.size >= limit) break;
    if (picked.has(entry.item.id)) continue;
    picked.set(entry.item.id, { ...entry, reason: 'estadísticas' });
  }

  return [...picked.values()];
}

/**
 * ¿Es una pieza de PvP?
 *
 * En Legion el equipo de PvP se reconoce por el nombre de temporada
 * (Gladiator, Combatant, Aspirant). Fuera de PvP funciona como cualquier otra
 * pieza, así que el motor la simula sin problema, pero para alguien que juega
 * bandas y mazmorras solo es ruido: son 156 de los 280 abalorios candidatos de
 * un guerrero en T19.
 *
 * Se detecta por nombre porque la base de datos no dice de dónde sale cada
 * pieza: la DBC que genera SimulationCraft no trae tabla de botín.
 */
const PVP_NAMES = /\b(gladiator|combatant|aspirant)('s)?\b/i;

export function isPvpItem(name: string): boolean {
  return PVP_NAMES.test(name);
}
