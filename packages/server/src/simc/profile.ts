import {
  customItemToken,
  type Character,
  type CustomItem,
  type GearItem,
  type GearSlot,
  type SimOptions,
} from '@rbl/shared';

/** Opciones globales de la simulación, en formato .simc. */
export function buildSimOptions(options: SimOptions): string[] {
  const lines = [
    `max_time=${options.fightLength}`,
    `vary_combat_length=${options.varyCombatLength}`,
    `fight_style=${options.fightStyle}`,
    `desired_targets=${Math.max(1, options.targets)}`,
    'optimal_raid=1',
  ];

  if (options.extraOptions) {
    for (const line of options.extraOptions.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) lines.push(trimmed);
    }
  }

  return lines;
}

/** Opciones de consumibles a nivel de jugador (van tras la línea de clase). */
export function buildConsumableOptions(options: SimOptions): string[] {
  const lines: string[] = [];
  const add = (key: string, value?: string) => {
    if (!value || value === 'default') return;
    lines.push(`${key}=${value}`);
  };
  add('flask', options.flask);
  add('food', options.food);
  add('potion', options.potion);
  add('augmentation', options.augmentation);
  return lines;
}

/**
 * Perfil base del personaje: el .simc importado más las opciones de
 * consumibles que haya elegido el usuario.
 */
export function buildCharacterProfile(
  character: Character,
  options: SimOptions,
): string {
  const consumables = buildConsumableOptions(options);
  // Raza de sustitución. Va después del perfil a propósito: en simc gana la
  // última asignación, así que esto pisa el `race=` que trae el import sin
  // tener que reescribirlo.
  const race = character.raceOverride ? [`race=${character.raceOverride}`] : [];
  return [character.profile, ...race, ...consumables].join('\n');
}

/**
 * Argumentos de línea de comandos.
 *
 * `target_error` manda sobre `iterations` en simc: si es > 0, simc itera hasta
 * alcanzar ese error, así que enviamos `iterations` como tope superior.
 */
export function buildCliArgs(
  options: SimOptions,
  extra: { profilesets: boolean; scaleFactors?: boolean; scaleStats?: string[] },
): string[] {
  const args: string[] = [];
  const threads = options.threads > 0 ? options.threads : 0;
  if (threads > 0) args.push(`threads=${threads}`);

  if (options.targetError > 0) {
    args.push(`target_error=${options.targetError}`);
    args.push(`iterations=${Math.max(options.iterations, 100000)}`);
  } else {
    args.push(`iterations=${options.iterations}`);
  }

  if (extra.profilesets) {
    // Necesario para que los profilesets se simulen de forma independiente.
    args.push('single_actor_batch=1');
    args.push('profileset_metric=dps');
  }

  if (extra.scaleFactors) {
    args.push('calculate_scale_factors=1');
    args.push('normalize_scale_factors=1');
    if (extra.scaleStats?.length) {
      args.push(`scale_only=${extra.scaleStats.join(',')}`);
    }
  }

  return args;
}

/**
 * Sanea el nombre de un profileset.
 *
 * Además de comillas y saltos de línea hay que quitar la almohadilla: en un
 * fichero .simc abre un comentario y se comería el resto de la línea.
 */
export function profilesetName(name: string): string {
  return name
    .replace(/["\r\n#\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export interface ProfilesetSpec {
  /** Nombre único; se usa como clave al leer los resultados. */
  name: string;
  /** Opciones .simc que definen la variante, en orden. */
  options: string[];
  /** Datos para pintar el resultado en la interfaz. */
  meta?: Record<string, unknown>;
}

/** Convierte un profileset en las líneas `profileset."x"=...` correspondientes. */
export function renderProfileset(spec: ProfilesetSpec): string[] {
  const name = profilesetName(spec.name);
  return spec.options.map((option, index) =>
    index === 0
      ? `profileset."${name}"=${option}`
      : `profileset."${name}"+=${option}`,
  );
}

/**
 * Línea de equipo para un candidato, heredando encantamiento y gemas de la
 * pieza que ocupa ese slot ahora mismo.
 *
 * Al sustituir un slot completo simc pierde el encantamiento anterior, igual
 * que en Raidbots; por eso lo reinyectamos salvo que el usuario lo desactive.
 */
export function gearOverrideLine(
  slot: GearSlot,
  item: {
    itemId: number;
    name?: string;
    bonusIds?: number[];
    ilevel?: number;
    gemIds?: number[];
    custom?: CustomItem;
  },
  equipped: GearItem | undefined,
  keepEnchants: boolean,
): string {
  // Los ítems descritos a mano se escriben con el nombre delante y sin id: no
  // están en la DBC, así que no hay nada que buscar por id.
  const parts = item.custom
    ? [
        `${slot}=${customItemToken(item.name, item.itemId)}`,
        ...(item.ilevel ? [`ilevel=${item.ilevel}`] : []),
        `stats=${item.custom.stats}`,
        ...(item.custom.use ? [`use=${item.custom.use}`] : []),
        ...(item.custom.equip ? [`equip=${item.custom.equip}`] : []),
      ]
    : [`${slot}=,id=${item.itemId}`];

  if (!item.custom) {
    if (item.bonusIds?.length) parts.push(`bonus_id=${item.bonusIds.join('/')}`);
    if (item.ilevel) parts.push(`ilevel=${item.ilevel}`);
  }

  if (keepEnchants && equipped) {
    if (equipped.enchantId) parts.push(`enchant_id=${equipped.enchantId}`);
    else if (equipped.enchantName) parts.push(`enchant=${equipped.enchantName}`);

    const gems = item.gemIds?.length ? item.gemIds : equipped.gemIds;
    if (gems?.length) parts.push(`gem_id=${gems.join('/')}`);
  } else if (item.gemIds?.length) {
    parts.push(`gem_id=${item.gemIds.join('/')}`);
  }

  return parts.join(',');
}
