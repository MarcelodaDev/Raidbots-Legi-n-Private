/**
 * Tipos compartidos entre el servidor y la interfaz web.
 *
 * Todo lo que viaja por la API vive aquí para que el front y el back no se
 * desincronicen. Los nombres de slots, stats y opciones siguen la nomenclatura
 * de SimulationCraft 7.3.5 (rama legion-dev).
 */

// ---------------------------------------------------------------------------
// Equipo y personaje
// ---------------------------------------------------------------------------

/** Slots de equipo tal y como los nombra SimulationCraft. */
export const GEAR_SLOTS = [
  'head',
  'neck',
  'shoulder',
  'back',
  'chest',
  'shirt',
  'tabard',
  'wrist',
  'hands',
  'waist',
  'legs',
  'feet',
  'finger1',
  'finger2',
  'trinket1',
  'trinket2',
  'main_hand',
  'off_hand',
] as const;

export type GearSlot = (typeof GEAR_SLOTS)[number];

/** Slots que en la práctica se simulan (sin camisa ni tabardo). */
export const SIMMED_SLOTS: GearSlot[] = GEAR_SLOTS.filter(
  (s) => s !== 'shirt' && s !== 'tabard',
) as GearSlot[];

/** Slots que comparten pool de ítems: un anillo puede ir en finger1 o finger2. */
export const PAIRED_SLOTS: Record<string, GearSlot[]> = {
  finger: ['finger1', 'finger2'],
  trinket: ['trinket1', 'trinket2'],
};

export interface GearItem {
  slot: GearSlot;
  itemId: number;
  /** Nombre legible. Puede venir del addon o de la base de datos de ítems. */
  name?: string;
  bonusIds: number[];
  enchantId?: number;
  /** Algunos perfiles usan el nombre del encantamiento en vez del id. */
  enchantName?: string;
  gemIds: number[];
  /**
   * Reliquias del arma artefacto (solo main_hand). Se guardan como texto
   * porque simc admite `id:bonus_id` en cada reliquia.
   */
  relicIds: string[];
  /** ilvl efectivo. Si está presente se fuerza con `ilevel=` en el perfil. */
  ilevel?: number;
  /** Línea original del perfil .simc, por si hay opciones que no parseamos. */
  raw?: string;
  /**
   * Ítem que SimulationCraft no conoce, descrito a mano.
   *
   * Los servidores privados progresivos reparten piezas de parches posteriores
   * a 7.3.5. El motor no tiene sus datos y cancela el lote entero si se las
   * pasas por id, pero sí acepta un ítem declarado a pelo con sus
   * estadísticas. Cuando esto está presente, la línea del perfil se escribe en
   * esa forma y el id deja de usarse.
   */
  custom?: CustomItem;
  /**
   * Estadísticas que el cliente enseña de esta pieza, leídas por el addon y ya
   * en el formato de simc. Son un dato, no una decisión: las piezas que el
   * motor sí conoce se siguen simulando por su id, que es más fiable. Solo se
   * usan para rellenar el formulario de las que no conoce.
   */
  scannedStats?: string;
  /** Texto literal de los efectos de «Uso»/«Equipar», tal cual lo enseña el juego. */
  scannedEffect?: string;
}

/**
 * Un ítem descrito a mano para simc.
 *
 * Los tres campos van tal cual al perfil que se ejecuta, así que se validan con
 * lista blanca antes de guardarse (ver `validateCustomItem`).
 */
export interface CustomItem {
  /** Estadísticas, en el formato de simc: `1052str_654crit_436haste`. */
  stats: string;
  /** Efecto de "Uso": `4500str_20dur_120cd`. */
  use?: string;
  /** Efecto pasivo con proc: `3000crit_15dur_1.5rppm_procby/attack_procon/hit`. */
  equip?: string;
}

/** Estadísticas que entiende el formato `stats=` de simc. */
export const CUSTOM_STAT_KEYS = [
  'str',
  'agi',
  'int',
  'sta',
  'spi',
  'crit',
  'haste',
  'mastery',
  'vers',
  'ap',
  'sp',
  'armor',
  'avoidance',
  'leech',
  'speed',
] as const;

/**
 * Razas que SimulationCraft 7.3.5 sabe simular.
 *
 * Es lista blanca y no una comprobación de formato: el valor acaba escrito como
 * `race=<valor>` en un perfil que se ejecuta como proceso.
 */
export const SIMC_RACES = [
  'blood_elf',
  'draenei',
  'dwarf',
  'gnome',
  'goblin',
  'highmountain_tauren',
  'human',
  'lightforged_draenei',
  'nightborne',
  'night_elf',
  'orc',
  'pandaren',
  'tauren',
  'troll',
  'undead',
  'void_elf',
  'worgen',
] as const;

/** ¿Es una raza que el motor acepta? La cadena vacía significa «no tocar». */
export function isSimcRace(value: string): boolean {
  return value === '' || (SIMC_RACES as readonly string[]).includes(value);
}

/**
 * Identificador que simc acepta para un ítem escrito a mano.
 *
 * Va delante de la primera coma de la línea, donde normalmente iría el nombre,
 * así que no admite espacios, acentos ni comas.
 */
export function customItemToken(name: string | undefined, itemId: number): string {
  const token = (name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return token || `item_${itemId}`;
}

/**
 * Comprueba que las tres cadenas de un ítem a mano son inofensivas.
 *
 * Van dentro de una línea de un perfil que se ejecuta, así que aquí no vale
 * "parece razonable": solo se acepta el alfabeto exacto del formato de simc.
 * En particular no pueden llevar coma (cerraría la opción y abriría otra),
 * salto de línea (abriría una orden nueva) ni `=`.
 */
export function validateCustomItem(custom: CustomItem): string[] {
  const errors: string[] = [];
  const statKeys = new Set<string>(CUSTOM_STAT_KEYS);

  // Un token es un número seguido de un nombre: `1052str`, `1.5rppm`, `20dur`.
  // Los de proc llevan una barra: `procby/attack`.
  const TOKEN = /^(\d+(?:\.\d+)?)?([a-z]+(?:\/[a-z]+)?|%)$/;

  const checkTokens = (value: string, field: string, allowEffects: boolean): void => {
    if (!/^[a-z0-9._/%]+$/.test(value)) {
      errors.push(`${field}: solo se admiten letras minúsculas, números, "_", "/", "." y "%".`);
      return;
    }
    for (const token of value.split('_')) {
      if (!TOKEN.test(token)) {
        errors.push(`${field}: no se entiende "${token}".`);
        continue;
      }
      const name = token.replace(/^\d+(\.\d+)?/, '');
      if (!allowEffects && !statKeys.has(name)) {
        errors.push(`${field}: "${name}" no es una estadística que simc acepte.`);
      }
    }
  };

  if (!custom.stats?.trim()) errors.push('Hacen falta las estadísticas de la pieza.');
  else checkTokens(custom.stats.trim(), 'Estadísticas', false);

  if (custom.use?.trim()) checkTokens(custom.use.trim(), 'Efecto de uso', true);
  if (custom.equip?.trim()) checkTokens(custom.equip.trim(), 'Efecto pasivo', true);

  return errors;
}

/**
 * Un rasgo del arma artefacto, leído del propio motor.
 *
 * SimulationCraft acepta `artifact_override=<rasgo>:<rango>` para forzar el
 * rango de un rasgo, que es justo lo que hace una reliquia. Pero si el nombre
 * no existe se limita a avisar por consola y sigue con el rango original: el
 * perfil devuelve el DPS base disfrazado de resultado válido. Por eso hay que
 * partir siempre de la lista real de rasgos del personaje.
 */
export interface ArtifactTrait {
  id: number;
  name: string;
  /** Nombre tokenizado, que es lo que espera `artifact_override`. */
  token: string;
  totalRank: number;
  purchasedRank: number;
  crucibleRank: number;
  relicRank: number;
}

/** Una habilidad de la pestaña «General» del libro de hechizos. */
export interface RacialSpell {
  id: number;
  name: string;
  description: string;
}

export interface Character {
  id: string;
  name: string;
  /** Clase en formato simc: `death_knight`, `demon_hunter`, ... */
  class: string;
  spec: string;
  race: string;
  level: number;
  role?: string;
  region?: string;
  server?: string;
  professions?: string;
  /** Cadena de 7 dígitos con los talentos. */
  talents: string;
  /** Cadena `artifact=` del addon (rasgos del artefacto). */
  artifact?: string;
  /** Cadena `crucible=` del Crisol de Luznether (7.3+). */
  crucible?: string;
  /** Rasgos del artefacto leídos del motor. Los rellena la sonda de artefacto. */
  artifactTraits?: ArtifactTrait[];
  /** Cuándo se leyeron esos rasgos. */
  artifactReadAt?: string;
  /** ilvl efectivo del arma artefacto, según el motor. */
  weaponIlevel?: number;
  /** ilvl de reliquia equivalente, despejado a partir del ilvl del arma. */
  estimatedRelicIlevel?: number;
  gear: Partial<Record<GearSlot, GearItem>>;
  /**
   * Inventario adicional (bolsas y banco). El addon de Legion no siempre lo
   * exporta, así que se puede gestionar a mano desde la app.
   */
  bag: GearItem[];
  /** Fase de contenido del servidor donde juega este personaje. */
  patchId?: string;
  /**
   * Raza estándar con la que se simula cuando la del personaje es propia del
   * servidor. SimulationCraft no admite raciales inventados, así que lo más
   * cerca que se puede estar es elegir la raza oficial con el mismo efecto.
   */
  raceOverride?: string;
  /** Habilidades generales leídas del juego, raciales incluidos. Informativo. */
  racials?: RacialSpell[];
  /** Perfil .simc original, saneado. Es la base de todas las simulaciones. */
  profile: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Opciones de simulación
// ---------------------------------------------------------------------------

export const FIGHT_STYLES = [
  'Patchwerk',
  'CastingPatchwerk',
  'LightMovement',
  'HeavyMovement',
  'HelterSkelter',
  'Ultraxion',
  'CleaveAdd',
  'HecticAddCleave',
  'Beastlord',
] as const;

export type FightStyle = (typeof FIGHT_STYLES)[number];

export interface SimOptions {
  fightStyle: FightStyle;
  /** Duración media del combate en segundos. */
  fightLength: number;
  /** Variación de la duración (0.2 = ±20%). */
  varyCombatLength: number;
  targets: number;
  /** Error objetivo en %. Si es > 0 manda sobre `iterations`. */
  targetError: number;
  iterations: number;
  threads: number;
  /** Consumibles: `default` deja que simc elija, `disabled` los desactiva. */
  flask?: string;
  food?: string;
  potion?: string;
  augmentation?: string;
  /** Opciones extra en formato simc, una por línea. Uso avanzado. */
  extraOptions?: string;
}

export const DEFAULT_SIM_OPTIONS: SimOptions = {
  fightStyle: 'Patchwerk',
  fightLength: 300,
  varyCombatLength: 0.2,
  targets: 1,
  targetError: 0.2,
  iterations: 10000,
  threads: 0, // 0 = usar todos los núcleos disponibles
  flask: 'default',
  food: 'default',
  potion: 'default',
  augmentation: 'default',
};

// ---------------------------------------------------------------------------
// Tipos de simulación
// ---------------------------------------------------------------------------

export type SimType =
  | 'quick'
  | 'droptimizer'
  | 'upgrades'
  | 'topgear'
  | 'talents'
  | 'consumables'
  | 'relics'
  | 'enchants'
  | 'gems';

export interface QuickSimConfig {
  type: 'quick';
  /** Calcula pesos de estadística (`calculate_scale_factors=1`). */
  statWeights: boolean;
  /** Stats a escalar. Vacío = las que simc elija para la spec. */
  scaleStats?: string[];
}

/** Un ítem candidato para Droptimizer / Top Gear. */
export interface CandidateItem {
  itemId: number;
  name: string;
  /** Slots donde puede ir (uno o dos en anillos y abalorios). */
  slots: GearSlot[];
  ilevel: number;
  bonusIds?: number[];
  gemIds?: number[];
  /** Calidad del ítem (5 = legendaria). Se usa para el límite de legendarias. */
  quality?: number;
  /** Etiqueta de origen: jefe, mazmorra, "bolsa"... solo informativa. */
  source?: string;
  /** Descripción a mano, para las piezas que simc no conoce. */
  custom?: CustomItem;
}

export interface DroptimizerConfig {
  type: 'droptimizer';
  items: CandidateItem[];
  /** ilvl al que se normalizan todos los candidatos. 0 = usar el suyo. */
  targetIlevel: number;
  /** Mantener encantamiento y gemas del ítem equipado en ese slot. */
  keepEnchants: boolean;
}

export interface TopGearConfig {
  type: 'topgear';
  /** Ítems candidatos además de lo equipado (bolsa incluida). */
  items: CandidateItem[];
  /** Slots que se dejan libres para combinar. */
  slots: GearSlot[];
  maxLegendaries: number;
  /** Tope de combinaciones a simular. */
  maxCombinations: number;
  keepEnchants: boolean;
}

/**
 * Buscador de mejoras: recorre la base de ítems de tu fase y te dice qué te
 * sube el DPS, hueco por hueco.
 */
export interface UpgradesConfig {
  type: 'upgrades';
  /** Cuántos candidatos por hueco se simulan, tras ordenarlos por tus pesos. */
  perSlot: number;
  /** Huecos a mirar. Vacío = todos menos abalorios. */
  slots: GearSlot[];
  /** ilvls a los que se prueba cada candidato, para saber desde cuál mejora. */
  ilevels: number[];
  /**
   * Probar legendarias en huecos donde todavía no llevas ninguna.
   *
   * Una legendaria gana casi siempre por potencia bruta, así que sin esto
   * apagado el primer puesto de cada hueco sería una legendaria y la lista
   * daría a entender que puedes ponértelas todas. En Legion solo se llevan dos.
   *
   * Con la opción apagada las legendarias solo se prueban donde ya llevas una:
   * ahí el cambio es justo, porque el total de legendarias no varía.
   */
  includeNewLegendaries: boolean;
  /**
   * Incluir equipo de PvP.
   *
   * Fuera de PvP funciona como cualquier pieza, pero para quien juega bandas y
   * mazmorras es ruido: más de la mitad de los abalorios candidatos de una fase
   * son de temporada de PvP.
   */
  includePvp: boolean;
  keepEnchants: boolean;
}

export type TalentMode = 'rows' | 'full' | 'custom';

export interface TalentsConfig {
  type: 'talents';
  /** `rows`: una fila cada vez. `full`: todas las combinaciones. */
  mode: TalentMode;
  /** Filas (1-7) a variar en modo `rows`. */
  rows: number[];
  /** Cadenas de talentos concretas en modo `custom`. */
  custom?: string[];
}

export interface ConsumablesConfig {
  type: 'consumables';
  flasks: string[];
  foods: string[];
  potions: string[];
  augmentations: string[];
}

/**
 * Comparador de reliquias y del Crisol de Luznether.
 *
 * Una reliquia hace dos cosas: sube un rango de un rasgo concreto y sube el
 * ilvl del arma. Se comparan por separado porque son decisiones distintas:
 * "qué rasgo me conviene" y "cuánto vale subir el arma".
 */
export interface RelicsConfig {
  type: 'relics';
  /** Rasgos a comparar, en formato tokenizado. */
  traits: string[];
  /** Rangos que añade la reliquia. Normalmente 1. */
  extraRanks: number;
  /**
   * ilvl actual de las tres reliquias del arma.
   *
   * Hace falta porque el addon no lo exporta: el ilvl va codificado en los
   * bonus_id de cada reliquia. Todos los perfiles del eje de ilvl declaran los
   * tres slots de forma explícita, incluido uno de referencia con estos
   * valores, así que las diferencias entre ellos son correctas aunque el
   * usuario se equivoque; si se equivoca, la referencia se desvía del perfil
   * base y se ve a simple vista.
   */
  currentRelicIlevels: number[];
  /** ilvls a probar en cada slot de reliquia. Vacío = no comparar ilvl. */
  relicIlevels: number[];
}

/**
 * Comparador de encantamientos de un slot.
 *
 * SimulationCraft ignora en silencio un `enchant_id` que no conoce y devuelve
 * el DPS sin encantar, así que los ids se validan contra el catálogo antes de
 * generar nada.
 */
export interface EnchantsConfig {
  type: 'enchants';
  slot: GearSlot;
  enchantIds: number[];
  /** Añade un perfil sin encantar, para ver cuánto vale encantar la pieza. */
  includeNone: boolean;
}

/**
 * Comparador de gemas de un slot.
 *
 * Si la pieza no tiene engarce, SimulationCraft ignora la gema (comprobado):
 * los perfiles saldrían todos iguales. Por eso se avisa cuando la pieza no
 * lleva ninguna gema ahora mismo.
 */
export interface GemsConfig {
  type: 'gems';
  slot: GearSlot;
  gemIds: number[];
  includeNone: boolean;
}

export type SimConfig =
  | QuickSimConfig
  | DroptimizerConfig
  | UpgradesConfig
  | TopGearConfig
  | TalentsConfig
  | ConsumablesConfig
  | RelicsConfig
  | EnchantsConfig
  | GemsConfig;

export interface SimRequest {
  characterId: string;
  /** Nombre libre para identificar la simulación en el historial. */
  label?: string;
  options: SimOptions;
  config: SimConfig;
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------

export interface DpsValue {
  mean: number;
  /** Error estándar de la media (lo que simc llama `mean_std_dev`). */
  error: number;
  min?: number;
  max?: number;
}

export interface AbilityBreakdown {
  name: string;
  /** Daño total medio de la habilidad. */
  amount: number;
  /** Porcentaje sobre el daño total del jugador. */
  pct: number;
  dps: number;
  executes: number;
  crit: number;
  uptime?: number;
}

export interface ScaleFactor {
  stat: string;
  value: number;
  error: number;
  /** Valor normalizado respecto al stat principal. */
  normalized: number;
}

export interface ProfilesetResult {
  name: string;
  mean: number;
  stddev: number;
  /** Diferencia absoluta contra el perfil base. */
  delta: number;
  /** Diferencia porcentual contra el perfil base. */
  deltaPct: number;
  /** Datos estructurados para pintar la fila (ítem, talentos, etc.). */
  meta?: Record<string, unknown>;
}

export interface SimResult {
  jobId: string;
  type: SimType;
  label: string;
  characterId: string;
  characterName: string;
  spec: string;
  class: string;
  simcVersion: string;
  wowVersion: string;
  options: SimOptions;
  baseline: DpsValue;
  breakdown: AbilityBreakdown[];
  scaleFactors?: ScaleFactor[];
  profilesets?: ProfilesetResult[];
  /** Avisos de simc (perfiles con errores, opciones desconocidas...). */
  warnings: string[];
  iterations: number;
  elapsedMs: number;
  finishedAt: string;
}

// ---------------------------------------------------------------------------
// Trabajos (cola de simulación)
// ---------------------------------------------------------------------------

export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';

export interface Job {
  id: string;
  status: JobStatus;
  type: SimType;
  label: string;
  characterId: string;
  characterName: string;
  /** 0-100. */
  progress: number;
  /** Texto de estado ("simulando perfil 12/240"). */
  phase: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  /** Número de perfilesets planificados, para mostrar el coste antes de lanzar. */
  profilesetCount?: number;
}

export interface JobEvent {
  job: Job;
  /** Últimas líneas de la salida de simc. */
  log?: string[];
}

// ---------------------------------------------------------------------------
// Base de datos de ítems
// ---------------------------------------------------------------------------

export interface ItemRecord {
  id: number;
  name: string;
  ilevel: number;
  /** Calidad: 0 pobre ... 5 legendaria, 6 artefacto. */
  quality: number;
  /** INVTYPE de la DBC. */
  inventoryType: number;
  itemClass: number;
  itemSubclass: number;
  classMask: number;
  /** Slots de simc derivados del INVTYPE. */
  slots: GearSlot[];
  /**
   * Tipos de estadística (ITEM_MOD_* de la DBC). Solo los tipos, no los
   * importes: sirven para ordenar candidatos sin simularlos.
   */
  stats?: number[];
}

export interface ConsumableRecord {
  id: number;
  name: string;
  /** Nombre tokenizado que espera simc (`flask_of_the_whispered_pact`). */
  token: string;
  ilevel: number;
  reqLevel: number;
}

export interface ConsumableDb {
  flasks: ConsumableRecord[];
  foods: ConsumableRecord[];
  potions: ConsumableRecord[];
  augmentations: ConsumableRecord[];
}

// ---------------------------------------------------------------------------
// Gemas y encantamientos
// ---------------------------------------------------------------------------

export interface EnchantRecord {
  id: number;
  name: string;
  token: string;
}

export interface GemRecord {
  id: number;
  name: string;
  ilevel: number;
  reqLevel: number;
}

/** Lo que se usa de verdad en cada hueco, según los perfiles por tier de simc. */
export interface SlotEnhancements {
  enchants: number[];
  gems: number[];
}

export interface EnhancementDb {
  gems: GemRecord[];
  enchants: EnchantRecord[];
  bySlot: Partial<Record<GearSlot, SlotEnhancements>>;
}

/**
 * Nombre e icono de un ítem para pintarlo en la interfaz.
 *
 * El nombre sale de la DBC de SimulationCraft; el icono hay que pedirlo fuera,
 * porque la DBC no lo trae. `source` dice de dónde salió cada cosa, y `icon`
 * puede faltar perfectamente: la interfaz tiene que saber pintarlo sin él.
 */
export interface ItemMedia {
  id: number;
  name?: string;
  /** Nombre del fichero del icono, sin extensión (`inv_helmet_164`). */
  icon?: string;
  quality?: number;
  source: 'dbc' | 'remote';
  fetchedAt?: string;
}

/** Plantilla de URL del icono. `{icon}` es el nombre del fichero. */
export const ICON_URL_TEMPLATE =
  'https://wow.zamimg.com/images/wow/icons/medium/{icon}.jpg';

export function iconUrl(icon: string | undefined): string | undefined {
  if (!icon) return undefined;
  return ICON_URL_TEMPLATE.replace('{icon}', icon.toLowerCase());
}

export interface ItemSearchQuery {
  q?: string;
  slot?: GearSlot;
  minIlevel?: number;
  maxIlevel?: number;
  quality?: number;
  limit?: number;
  /** Clase en formato simc: filtra lo que ese personaje puede equipar. */
  class?: string;
  /** Fase del servidor: recorta al ilvl máximo de esa fase. */
  patch?: string;
  /** Solo ítems que aparecen en los perfiles de referencia de la fase. */
  patchOnly?: boolean;
  /** Incluir equipo que parece de un tier posterior a la fase. */
  includeLaterTiers?: boolean;
}

// ---------------------------------------------------------------------------
// Restricciones de equipo por clase
// ---------------------------------------------------------------------------

/** Bit de cada clase dentro de `classMask` (orden de la DBC). */
export const CLASS_BITS: Record<string, number> = {
  warrior: 1 << 0,
  paladin: 1 << 1,
  hunter: 1 << 2,
  rogue: 1 << 3,
  priest: 1 << 4,
  death_knight: 1 << 5,
  shaman: 1 << 6,
  mage: 1 << 7,
  warlock: 1 << 8,
  monk: 1 << 9,
  druid: 1 << 10,
  demon_hunter: 1 << 11,
};

/** Subclase de armadura que usa cada clase: 1 tela, 2 cuero, 3 malla, 4 placas. */
export const CLASS_ARMOR_TYPE: Record<string, number> = {
  mage: 1,
  priest: 1,
  warlock: 1,
  druid: 2,
  rogue: 2,
  monk: 2,
  demon_hunter: 2,
  hunter: 3,
  shaman: 3,
  warrior: 4,
  paladin: 4,
  death_knight: 4,
};

/**
 * INVTYPE de las piezas cuya subclase determina el tipo de armadura.
 * Capas, cuellos, anillos y abalorios los puede llevar cualquiera aunque en la
 * DBC figuren como "tela" o "misceláneo".
 */
export const ARMOR_TYPED_INVTYPES = new Set([1, 3, 5, 6, 7, 8, 9, 10, 20]);

// ---------------------------------------------------------------------------
// Fases de contenido (servidores progresivos)
// ---------------------------------------------------------------------------

/** Una pieza del equipo de referencia de una spec en una fase. */
export interface PatchGearPiece {
  slot: GearSlot;
  itemId: number;
  name: string;
  ilevel: number;
  quality: number;
  /** Línea de ítem tal y como la escribe simc, con bonus_id y encantamiento. */
  encoded: string;
}

export interface PatchSpecGear {
  class: string;
  spec: string;
  /** Nombre del perfil de simc del que sale (por ejemplo `T21_Mage_Frost`). */
  profile: string;
  talents: string;
  gear: PatchGearPiece[];
  /** Otros perfiles de la misma spec en esa fase (variantes de build). */
  variants: string[];
}

/**
 * Una fase de contenido de un servidor progresivo.
 *
 * Sale de los perfiles por tier de SimulationCraft. Ojo: esos perfiles están
 * escritos sobre el juego final de 7.3.5, así que su equipo es el del tier pero
 * sus mecánicas son las de 7.3.5. Los números de aquí son valores por defecto
 * razonables, no una reconstrucción histórica de cada parche.
 */
export interface PatchPhase {
  id: string;
  label: string;
  description: string;
  order: number;
  /** ilvl máximo del equipo de la fase, sin contar el arma artefacto. */
  ilevelCap: number;
  /** ilvl del arma artefacto en esa fase (escala con las reliquias). */
  artifactIlevel: number;
  /**
   * Id de ítem más alto visto en la fase. Los ids se asignan por bloques según
   * se desarrolla el contenido, así que sirve de frontera con los tiers
   * posteriores. Es una heurística, no un dato de la DBC.
   */
  maxItemId: number;
  /** Legendarias equipadas como mucho en los perfiles de la fase. */
  maxLegendaries: number;
  /** Si los perfiles de la fase traen datos de Crisol de Luznether. */
  profilesUseCrucible: boolean;
  profileCount: number;
  specCount: number;
  itemCount: number;
  /** Perfiles de simc que no se pudieron cargar al generar los datos. */
  skipped: string[];
}

/** Fase con su catálogo de ítems, para filtrar el buscador. */
export interface PatchDetail extends PatchPhase {
  items: { id: number; name: string; ilevel: number; quality: number; slots: GearSlot[] }[];
}

// ---------------------------------------------------------------------------
// Metadatos y estado del servidor
// ---------------------------------------------------------------------------

export interface SimcStatus {
  available: boolean;
  path?: string;
  version?: string;
  wowVersion?: string;
  error?: string;
  /** Rutas donde se buscó el binario, para diagnosticar cuando no aparece. */
  searched?: { path: string; exists: boolean }[];
}

/** Estado de la tabla de botín volcada desde el juego. */
export interface LootStatus {
  available: boolean;
  items: number;
  bosses: number;
  importedAt?: string;
}

/** Estado del catálogo de piezas que el motor no conoce. */
export interface CustomItemsStatus {
  available: boolean;
  items: number;
  /** Cuántas tienen el efecto ya traducido al formato de simc. */
  withEffect: number;
}

/**
 * Una pieza del catálogo: lo que el motor no sabe de ella y el cliente sí.
 *
 * Vive fuera de los personajes a propósito. Describirla es una sola vez y sirve
 * para todos: las estadísticas de un ítem no cambian según quién lo lleve.
 */
export interface CustomItemEntry {
  itemId: number;
  name: string;
  slot?: GearSlot;
  ilevel?: number;
  stats: string;
  /** Texto literal del efecto, tal cual lo enseña el juego. Sin traducir. */
  effectText?: string;
  use?: string;
  equip?: string;
  addedAt: string;
  seenOn?: string;
}

export interface ServerMeta {
  simc: SimcStatus;
  itemDb: { available: boolean; items: number; consumables: number };
  loot: LootStatus;
  customItems: CustomItemsStatus;
  patches: PatchPhase[];
  fightStyles: readonly string[];
  defaults: SimOptions;
  cpuCount: number;
  /**
   * Segundos que tarda una variante en este ordenador, sacado de las
   * simulaciones que ya se han hecho aquí. Sin historial no viene.
   */
  secondsPerProfile?: number;
}

// ---------------------------------------------------------------------------
// Utilidades compartidas
// ---------------------------------------------------------------------------

export const CLASS_LIST = [
  'death_knight',
  'demon_hunter',
  'druid',
  'hunter',
  'mage',
  'monk',
  'paladin',
  'priest',
  'rogue',
  'shaman',
  'warlock',
  'warrior',
] as const;

/** Etiqueta legible para un slot. */
export const SLOT_LABELS: Record<GearSlot, string> = {
  head: 'Cabeza',
  neck: 'Cuello',
  shoulder: 'Hombros',
  back: 'Espalda',
  chest: 'Pecho',
  shirt: 'Camisa',
  tabard: 'Tabardo',
  wrist: 'Muñecas',
  hands: 'Manos',
  waist: 'Cintura',
  legs: 'Piernas',
  feet: 'Pies',
  finger1: 'Anillo 1',
  finger2: 'Anillo 2',
  trinket1: 'Abalorio 1',
  trinket2: 'Abalorio 2',
  main_hand: 'Mano principal',
  off_hand: 'Mano secundaria',
};

/** Convierte un nombre de ítem al token que espera simc. */
export function tokenize(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Slot "base" de un slot emparejado: finger2 -> finger. */
export function slotFamily(slot: GearSlot): string {
  if (slot === 'finger1' || slot === 'finger2') return 'finger';
  if (slot === 'trinket1' || slot === 'trinket2') return 'trinket';
  return slot;
}

export { buildPawnScale, type PawnScale } from './pawn.js';
export {
  ITEM_MOD_STATS,
  isPvpItem,
  pickSlotCandidates,
  statScore,
  weightsByStat,
  type ScoredItem,
} from './upgrades.js';

/** Una familia de slots y cuántas configuraciones admite. */
export interface TopGearAxisInfo {
  /** `head`, `finger`, `trinket`… */
  family: string;
  options: number;
}

/**
 * El tamaño del espacio de búsqueda de «Mejor combinación».
 *
 * El total es el producto de los ejes, no la suma: cada pieza que se añade
 * multiplica todo lo demás. Se enseña mientras se eligen piezas para que el
 * jugador vea crecer el número y sepa qué recortar.
 */
export interface TopGearSpace {
  /** De mayor a menor: el primero es el que más recorta si se toca. */
  axes: TopGearAxisInfo[];
  total: number;
  limit: number;
  overLimit: boolean;
}

export interface SimPlan {
  profilesetCount: number;
  warnings: string[];
  /** Solo en «Mejor combinación». */
  space?: TopGearSpace;
}
