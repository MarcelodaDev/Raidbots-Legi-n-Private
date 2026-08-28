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

export interface ServerMeta {
  simc: SimcStatus;
  itemDb: { available: boolean; items: number; consumables: number };
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
