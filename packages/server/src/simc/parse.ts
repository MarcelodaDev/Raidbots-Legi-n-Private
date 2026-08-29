import type {
  AbilityBreakdown,
  DpsValue,
  ProfilesetResult,
  ScaleFactor,
} from '@rbl/shared';

/** Estadísticas principales, en el orden en que las mostramos. */
const STAT_ORDER = [
  'Int',
  'Str',
  'Agi',
  'Crit',
  'Haste',
  'Mastery',
  'Vers',
  'WDps',
  'WOHDps',
  'Sta',
  'Ap',
  'Sp',
];

export interface ParsedSimc {
  simcVersion: string;
  wowVersion: string;
  playerName: string;
  spec: string;
  class: string;
  iterations: number;
  baseline: DpsValue;
  breakdown: AbilityBreakdown[];
  race: string;
  scaleFactors?: ScaleFactor[];
  profilesets?: ProfilesetResult[];
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function parseBreakdown(player: any): AbilityBreakdown[] {
  const stats: any[] = Array.isArray(player?.stats) ? player.stats : [];
  const fightLength = num(player?.collected_data?.fight_length?.mean, 0);

  const rows: AbilityBreakdown[] = [];
  for (const stat of stats) {
    if (stat?.type !== 'damage') continue;
    const amount = num(stat?.actual_amount?.mean);
    if (amount <= 0) continue;

    rows.push({
      name: String(stat.name ?? 'desconocido'),
      amount,
      // `portion_amount` ya viene normalizado a 1 por simc.
      pct: num(stat?.portion_amount) * 100,
      dps: num(stat?.portion_aps?.mean, fightLength > 0 ? amount / fightLength : 0),
      executes: num(stat?.num_executes?.mean),
      crit: num(stat?.total_intervals?.mean),
    });
  }

  rows.sort((a, b) => b.amount - a.amount);
  return rows;
}

function parseScaleFactors(player: any): ScaleFactor[] | undefined {
  const raw = player?.scale_factors;
  if (!raw || typeof raw !== 'object') return undefined;

  const entries = Object.entries(raw as Record<string, unknown>)
    .map(([stat, value]) => ({ stat, value: num(value), error: 0, normalized: 0 }))
    .filter((entry) => entry.value !== 0);

  if (!entries.length) return undefined;

  // simc ya normaliza contra la estadística principal (`normalize_scale_factors`),
  // así que la referencia es Int/Str/Agi cuando está presente.
  const primary = entries.find((entry) => ['Int', 'Str', 'Agi'].includes(entry.stat));
  const reference = primary
    ? Math.abs(primary.value)
    : Math.max(...entries.map((entry) => Math.abs(entry.value)));
  for (const entry of entries) {
    entry.normalized = reference > 0 ? entry.value / reference : 0;
  }

  entries.sort((a, b) => {
    const ia = STAT_ORDER.indexOf(a.stat);
    const ib = STAT_ORDER.indexOf(b.stat);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return b.value - a.value;
  });

  return entries;
}

function parseProfilesets(
  json: any,
  baselineMean: number,
  meta: Record<string, Record<string, unknown>>,
): ProfilesetResult[] | undefined {
  const results: any[] = json?.sim?.profilesets?.results;
  if (!Array.isArray(results) || !results.length) return undefined;

  const parsed = results.map((entry) => {
    const mean = num(entry?.mean);
    const delta = mean - baselineMean;
    return {
      name: String(entry?.name ?? ''),
      mean,
      stddev: num(entry?.stddev),
      delta,
      deltaPct: baselineMean > 0 ? (delta / baselineMean) * 100 : 0,
      meta: meta[String(entry?.name ?? '')],
    } satisfies ProfilesetResult;
  });

  parsed.sort((a, b) => b.mean - a.mean);
  return parsed;
}

export function parseSimcJson(
  json: any,
  meta: Record<string, Record<string, unknown>> = {},
): ParsedSimc {
  const sim = json?.sim;
  const players: any[] = Array.isArray(sim?.players) ? sim.players : [];
  const player = players[0];

  if (!player) {
    throw new Error('SimulationCraft no devolvió ningún jugador en el resultado.');
  }

  const dps = player?.collected_data?.dps ?? {};
  const baseline: DpsValue = {
    mean: num(dps.mean),
    error: num(dps.mean_std_dev),
    min: num(dps.min, undefined as unknown as number),
    max: num(dps.max, undefined as unknown as number),
  };

  return {
    simcVersion: String(json?.version ?? 'desconocida'),
    wowVersion: String(sim?.options?.dbc?.Live?.wow_version ?? '7.3.5'),
    playerName: String(player?.name ?? ''),
    race: String(player?.race ?? ''),
    spec: String(player?.specialization ?? ''),
    class: String(player?.dbc?.class ?? player?.specialization ?? ''),
    iterations: num(sim?.options?.iterations ?? dps.count),
    baseline,
    breakdown: parseBreakdown(player),
    scaleFactors: parseScaleFactors(player),
    profilesets: parseProfilesets(json, baseline.mean, meta),
  };
}

/** Extrae los avisos que simc imprime por consola. */
export function extractWarnings(log: string[]): string[] {
  const warnings: string[] = [];
  for (const line of log) {
    if (
      /^(ERROR|WARNING|Warning)/i.test(line) ||
      /\bignoring\b/i.test(line) ||
      /is of invalid type/i.test(line) ||
      /has been canceled/i.test(line) ||
      /Unable to initialize/i.test(line)
    ) {
      warnings.push(line);
    }
  }
  return warnings.slice(0, 50);
}

/**
 * Avisos que solo se ven comparando lo que se pidió con lo que se simuló.
 *
 * SimulationCraft acepta una raza que no conoce sin protestar y la deja en
 * `none`, que significa «sin ningún racial». El DPS sale creíble pero por
 * debajo del real: en un guerrero Furia son entre un 1% y un 2%. Esto pasa en
 * servidores privados con razas propias, así que es un caso normal aquí, no una
 * rareza. Por eso se compara la raza declarada con la que devuelve el motor.
 */
export function raceWarning(
  declared: string | undefined,
  reported: string | undefined,
): string | undefined {
  const wanted = declared?.trim().toLowerCase();
  if (!wanted || wanted === 'none') return undefined;
  if (reported && reported.toLowerCase() !== 'none') return undefined;

  return (
    `SimulationCraft no conoce la raza "${declared}", así que ha simulado sin ` +
    'ningún bonus racial. El DPS que ves es algo más bajo que el real (en las ' +
    'pruebas, entre un 1% y un 2%). Las comparaciones entre piezas siguen ' +
    'siendo válidas porque a todas les falta lo mismo.'
  );
}
