import {
  GEAR_SLOTS,
  type Character,
  type GearItem,
  type GearSlot,
} from '@rbl/shared';
import { simcKnowsItem } from '../data/itemdb.js';

const SLOT_SET = new Set<string>(GEAR_SLOTS);

/**
 * Opciones de perfil que no aceptamos de una cadena pegada por el usuario.
 * Un perfil .simc puede escribir ficheros, leer rutas locales o disparar
 * peticiones de red; como la app ejecuta el binario tal cual, filtramos.
 */
const FORBIDDEN_OPTIONS = new Set([
  'input',
  'output',
  'html',
  'json',
  'json2',
  'xml',
  'save',
  'save_gear',
  'save_talents',
  'save_actions',
  'save_profiles',
  'save_full_profile',
  'apikey',
  'armory',
  'armory2',
  'guild',
  'http_clear_cache',
  'cache_directory',
  'item_db_source',
  'proxy',
  'spell_query',
  'spell_query_xml_output_file',
  'chart_render_url',
  'log',
  'debug',
  'threads',
  'iterations',
  'target_error',
  'profileset_work_threads',
]);

/** Opciones que fija la app y que ignoramos si vienen en el perfil pegado. */
const OVERRIDDEN_OPTIONS = new Set([
  'max_time',
  'vary_combat_length',
  'fight_style',
  'desired_targets',
  'calculate_scale_factors',
  'single_actor_batch',
  'profileset_metric',
  'optimal_raid',
]);

export interface ParsedProfile {
  name: string;
  class: string;
  spec: string;
  race: string;
  level: number;
  role?: string;
  region?: string;
  server?: string;
  professions?: string;
  talents: string;
  artifact?: string;
  crucible?: string;
  gear: Partial<Record<GearSlot, GearItem>>;
  bag: GearItem[];
  /** Perfil saneado listo para pasarle a simc. */
  profile: string;
  warnings: string[];
}

/** Divide `a=b` respetando que el valor puede contener `=`. */
function splitOption(line: string): [string, string] | null {
  const idx = line.indexOf('=');
  if (idx <= 0) return null;
  return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
}

function parseIdList(value: string | undefined): number[] {
  if (!value) return [];
  return value
    .split('/')
    .map((v) => Number.parseInt(v, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/** Igual que `parseIdList` pero conservando sufijos como `3612:1512`. */
function parseTokenList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split('/')
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Parsea una línea de equipo:
 *   head=,id=152163,bonus_id=3562/1512,enchant_id=5429,gem_id=130220
 *   finger1=Anillo Chulo,id=134487,bonus_id=1727/1811
 */
export function parseGearLine(line: string): GearItem | null {
  const parts = line.split(',');
  const first = splitOption(parts[0]);
  if (!first) return null;

  const slot = first[0].toLowerCase();
  if (!SLOT_SET.has(slot)) return null;

  const item: GearItem = {
    slot: slot as GearSlot,
    itemId: 0,
    bonusIds: [],
    gemIds: [],
    relicIds: [],
    raw: line,
  };

  const displayName = first[1].trim();
  if (displayName) item.name = displayName.replace(/_/g, ' ');

  for (const part of parts.slice(1)) {
    const kv = splitOption(part);
    if (!kv) continue;
    const [key, value] = [kv[0].toLowerCase(), kv[1]];
    switch (key) {
      case 'id':
        item.itemId = Number.parseInt(value, 10) || 0;
        break;
      case 'bonus_id':
        item.bonusIds = parseIdList(value);
        break;
      case 'enchant_id':
        item.enchantId = Number.parseInt(value, 10) || undefined;
        break;
      case 'enchant':
        item.enchantName = value || undefined;
        break;
      case 'gem_id':
        item.gemIds = parseIdList(value);
        break;
      case 'relic_id':
        item.relicIds = parseTokenList(value);
        break;
      case 'ilevel':
        item.ilevel = Number.parseInt(value, 10) || undefined;
        break;
      default:
        break;
    }
  }

  return item.itemId > 0 ? item : null;
}

/** Vuelve a construir la línea .simc de un ítem. */
export function gearItemToLine(item: GearItem, slot?: GearSlot): string {
  const target = slot ?? item.slot;
  const parts = [`${target}=,id=${item.itemId}`];
  if (item.bonusIds.length) parts.push(`bonus_id=${item.bonusIds.join('/')}`);
  if (item.enchantId) parts.push(`enchant_id=${item.enchantId}`);
  else if (item.enchantName) parts.push(`enchant=${item.enchantName}`);
  if (item.gemIds.length) parts.push(`gem_id=${item.gemIds.join('/')}`);
  if (item.relicIds.length) parts.push(`relic_id=${item.relicIds.join('/')}`);
  if (item.ilevel) parts.push(`ilevel=${item.ilevel}`);
  return parts.join(',');
}

const CLASS_KEYS = new Set([
  'deathknight',
  'death_knight',
  'demonhunter',
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
]);

function normalizeClass(key: string): string {
  if (key === 'deathknight') return 'death_knight';
  if (key === 'demonhunter') return 'demon_hunter';
  return key;
}

/**
 * Parsea la salida del addon SimulationCraft de Legion.
 *
 * Además del equipo equipado reconoce el bloque comentado "Gear from Bags"
 * que algunas versiones del addon incluyen. Cuando no está, el inventario se
 * gestiona desde la app.
 */
export function parseSimcProfile(input: string): ParsedProfile {
  const warnings: string[] = [];
  const result: ParsedProfile = {
    name: 'Personaje',
    class: '',
    spec: '',
    race: '',
    level: 110,
    talents: '',
    gear: {},
    bag: [],
    profile: '',
    warnings,
  };

  const keptLines: string[] = [];
  const rawLines = input.split(/\r?\n/);

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Líneas comentadas: solo nos interesan si contienen equipo de la bolsa.
    if (trimmed.startsWith('#')) {
      const uncommented = trimmed.replace(/^#+\s*/, '');
      const bagItem = parseGearLine(uncommented);
      if (bagItem) result.bag.push(bagItem);
      continue;
    }

    const kv = splitOption(trimmed);
    if (!kv) {
      // Líneas de APL u opciones sin `=`: se conservan tal cual.
      keptLines.push(trimmed);
      continue;
    }

    const key = kv[0].toLowerCase();
    const value = kv[1];

    if (FORBIDDEN_OPTIONS.has(key)) {
      warnings.push(`Se ignoró la opción "${key}" del perfil por seguridad.`);
      continue;
    }
    if (OVERRIDDEN_OPTIONS.has(key)) {
      // La app controla estas opciones desde la interfaz.
      continue;
    }

    if (CLASS_KEYS.has(key)) {
      result.class = normalizeClass(key);
      result.name = value.replace(/^"|"$/g, '') || result.name;
      keptLines.push(trimmed);
      continue;
    }

    const gearItem = parseGearLine(trimmed);
    if (gearItem) {
      result.gear[gearItem.slot] = gearItem;
      keptLines.push(trimmed);
      continue;
    }

    switch (key) {
      case 'level':
        result.level = Number.parseInt(value, 10) || 110;
        break;
      case 'race':
        result.race = value;
        break;
      case 'spec':
        result.spec = value;
        break;
      case 'role':
        result.role = value;
        break;
      case 'region':
        result.region = value;
        break;
      case 'server':
        result.server = value;
        break;
      case 'professions':
        result.professions = value;
        break;
      case 'talents':
        result.talents = value;
        break;
      case 'artifact':
        result.artifact = value;
        break;
      case 'crucible':
        result.crucible = value;
        break;
      default:
        break;
    }

    keptLines.push(trimmed);
  }

  if (!result.class) {
    throw new Error(
      'No se encontró la línea de clase (por ejemplo `warlock="Nombre"`). ' +
        '¿Seguro que pegaste la salida completa del addon SimulationCraft?',
    );
  }

  if (Object.keys(result.gear).length === 0) {
    warnings.push('El perfil no contiene equipo; la simulación usará el personaje desnudo.');
  }

  if (result.bag.length === 0) {
    warnings.push(
      'El perfil no trae ítems de la bolsa. Puedes añadirlos a mano desde la ' +
        'ficha del personaje para usarlos en Top Gear.',
    );
  }

  // Avisar cuanto antes de las piezas que simc no va a saber construir: si una
  // llega a una simulación, cancela el lote entero y no queda claro por qué.
  const unknown = [
    ...Object.values(result.gear),
    ...result.bag,
  ].filter((item) => !simcKnowsItem(item.itemId));
  if (unknown.length > 0) {
    const shown = unknown
      .slice(0, 5)
      .map((item) => (item.name ? `${item.name} (id ${item.itemId})` : `id ${item.itemId}`))
      .join(', ');
    const rest = unknown.length > 5 ? ` y ${unknown.length - 5} más` : '';
    warnings.push(
      `Estas piezas no existen en la versión 7.3.5 del simulador y no se pueden simular: ${shown}${rest}. ` +
        'Tu servidor las ha traído de un parche posterior. Se pueden guardar, pero quedan fuera de las comparaciones.',
    );
  }

  result.profile = keptLines.join('\n');
  return result;
}

/**
 * Limpia un perfil arbitrario (por ejemplo uno editado a mano en la app)
 * quitando opciones peligrosas antes de pasárselo a simc.
 */
export function sanitizeProfile(input: string): { profile: string; warnings: string[] } {
  const warnings: string[] = [];
  const lines: string[] = [];
  for (const rawLine of input.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const kv = splitOption(trimmed);
    if (kv && FORBIDDEN_OPTIONS.has(kv[0].toLowerCase())) {
      warnings.push(`Se ignoró la opción "${kv[0]}" por seguridad.`);
      continue;
    }
    lines.push(trimmed);
  }
  return { profile: lines.join('\n'), warnings };
}

/** Convierte un perfil parseado en un `Character` persistible. */
export function toCharacter(parsed: ParsedProfile, id: string): Character {
  const now = new Date().toISOString();
  return {
    id,
    name: parsed.name,
    class: parsed.class,
    spec: parsed.spec,
    race: parsed.race,
    level: parsed.level,
    role: parsed.role,
    region: parsed.region,
    server: parsed.server,
    professions: parsed.professions,
    talents: parsed.talents,
    artifact: parsed.artifact,
    crucible: parsed.crucible,
    gear: parsed.gear,
    bag: parsed.bag,
    profile: parsed.profile,
    createdAt: now,
    updatedAt: now,
  };
}
