import type { ScaleFactor } from './index.js';

/**
 * Cadena de escala para el addon Pawn.
 *
 * Pawn enseña dentro del juego, en el tooltip de cada pieza, cuánto vale para
 * ti. Para eso necesita saber cuánto te renta cada estadística, que es justo lo
 * que calcula esta app. La cadena se pega en el juego y Pawn la importa.
 *
 * El formato es el de Pawn v1, que es el que entiende la versión de Legion:
 *
 *   ( Pawn: v1: "Nombre": Class=Mage, Spec=Frost, Intellect=1.00, ... )
 *
 * Dos detalles que rompen la importación si se descuidan:
 *
 * - Los decimales van con punto. Formatear con `es-ES` metería comas y Pawn
 *   leería `1,25` como dos campos.
 * - El nombre va entre comillas, así que no puede llevar comillas ni los
 *   caracteres que delimitan la cadena.
 */

/**
 * De los nombres de simc a los de Pawn.
 *
 * Lo que no esté aquí se deja fuera a propósito: Pawn ignora en silencio una
 * clave que no conoce, y prefiero enseñar qué se ha quedado fuera antes que dar
 * por buena una cadena a la que le falta algo.
 */
const STAT_NAMES: Record<string, string> = {
  Str: 'Strength',
  Agi: 'Agility',
  Int: 'Intellect',
  Sta: 'Stamina',
  Crit: 'CritRating',
  CritRating: 'CritRating',
  Haste: 'HasteRating',
  HasteRating: 'HasteRating',
  Mastery: 'MasteryRating',
  MasteryRating: 'MasteryRating',
  Vers: 'Versatility',
  Versatility: 'Versatility',
  Avoidance: 'Avoidance',
  Leech: 'Leech',
  Speed: 'MovementSpeed',
  Armor: 'Armor',
  BonusArmor: 'BonusArmor',
  WDps: 'Dps',
};

/** Las estadísticas contra las que simc normaliza, en orden de preferencia. */
const PRIMARY_STATS = ['Int', 'Str', 'Agi'];

export interface PawnScale {
  /** La cadena lista para pegar en el juego. */
  text: string;
  /** Nombres de simc que Pawn no entiende y se han dejado fuera. */
  skipped: string[];
}

/** `death_knight` → `DeathKnight`, `frost` → `Frost`. */
function pascalCase(value: string): string {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

/**
 * Quita el nombre de la clase que simc pega al final de la especialización.
 *
 * En los resultados la spec llega como nombre para enseñar («Frost Mage»,
 * «Beast Mastery Hunter»), no como el token corto. Pawn espera solo la
 * especialización, así que un `Spec=FrostMage` no le vale.
 */
function specWithoutClass(spec: string, characterClass: string): string {
  const specWords = spec.split(/[_\s]+/).filter(Boolean);
  const classWords = characterClass.split(/[_\s]+/).filter(Boolean);
  if (specWords.length <= classWords.length) return spec;

  const tail = specWords.slice(-classWords.length);
  const matches = tail.every(
    (word, i) => word.toLowerCase() === classWords[i].toLowerCase(),
  );
  return matches ? specWords.slice(0, -classWords.length).join(' ') : spec;
}

/**
 * Deja el nombre en algo que quepa entre las comillas de la cadena.
 *
 * Pawn corta por la primera comilla, así que un nombre con comillas partiría la
 * cadena por la mitad y la importación fallaría sin decir por qué.
 */
function safeName(name: string): string {
  const clean = name.replace(/["():,]/g, '').replace(/\s+/g, ' ').trim();
  return clean || 'Personaje';
}

/**
 * Construye la cadena de Pawn a partir de los pesos calculados.
 *
 * Devuelve `null` si no hay ninguna estadística que Pawn entienda: es mejor no
 * enseñar nada que dar una cadena vacía que el jugador pegaría sin resultado.
 */
export function buildPawnScale(
  name: string,
  characterClass: string,
  spec: string,
  factors: ScaleFactor[],
): PawnScale | null {
  const known = factors.filter((factor) => STAT_NAMES[factor.stat]);
  const skipped = factors
    .filter((factor) => !STAT_NAMES[factor.stat])
    .map((factor) => factor.stat);

  if (!known.length) return null;

  // Se reescala para que la estadística principal valga 1. A Pawn solo le
  // importan las proporciones, y así los números se leen de un vistazo
  // («el crítico me vale 0,64 de lo que me vale el intelecto»).
  const primary = known.find((factor) => PRIMARY_STATS.includes(factor.stat));
  const reference = Math.abs(primary?.value ?? 0) ||
    Math.max(...known.map((factor) => Math.abs(factor.value)));

  const parts = known.map((factor) => {
    const scaled = reference > 0 ? factor.value / reference : 0;
    return `${STAT_NAMES[factor.stat]}=${scaled.toFixed(2)}`;
  });

  const header = [
    `Class=${pascalCase(characterClass)}`,
    `Spec=${pascalCase(specWithoutClass(spec, characterClass))}`,
  ];

  return {
    text: `( Pawn: v1: "${safeName(name)}": ${[...header, ...parts].join(', ')} )`,
    skipped,
  };
}
