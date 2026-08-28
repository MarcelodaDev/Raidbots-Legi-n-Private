import fs from 'node:fs';
import path from 'node:path';
import type { ItemMedia } from '@rbl/shared';
import { config } from '../config.js';
import { getItem } from './itemdb.js';

/**
 * Nombre e icono de cada ítem.
 *
 * El nombre ya lo tenemos de la DBC de SimulationCraft; lo que no está ahí es
 * el icono, así que hay que pedirlo fuera. Para que la app siga siendo local:
 *
 *   - Todo lo que se pide se guarda en disco y no se vuelve a pedir nunca.
 *   - Si no hay internet o la fuente falla, se devuelve el nombre de la DBC sin
 *     icono, y la interfaz lo enseña igual. Nada se rompe por esto.
 *   - Los fallos también se recuerdan un rato, para no machacar la fuente
 *     pidiendo una y otra vez algo que no está.
 *
 * La fuente es configurable con RBL_ICON_SOURCE, un patrón donde `{id}` es el
 * id del ítem. Por defecto usa el endpoint de tooltips de Wowhead, que es de
 * donde se surten las webs de WoW.
 */

const DEFAULT_SOURCE =
  'https://nether.wowhead.com/tooltip/item/{id}?dataEnv=1&locale=0';

/** Cuánto se recuerda un fallo antes de volver a intentarlo. */
const FAILURE_TTL_MS = 6 * 60 * 60 * 1000;

interface CacheEntry extends ItemMedia {
  /** Marca de cuándo falló, si falló. */
  failedAt?: string;
}

let cache = new Map<number, CacheEntry>();
let dirty = false;
let saveTimer: NodeJS.Timeout | undefined;

function cacheFile(): string {
  return path.join(config.dataDir, 'item-media.json');
}

export function loadMedia(): void {
  cache = new Map();
  const file = cacheFile();
  if (!fs.existsSync(file)) return;

  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, CacheEntry>;
    for (const [id, entry] of Object.entries(parsed)) {
      cache.set(Number(id), entry);
    }
  } catch {
    // Un caché corrupto no debe impedir arrancar: se regenera solo.
    cache = new Map();
  }
}

/** Guarda en disco, agrupando escrituras para no tocar el fichero por cada ítem. */
function scheduleSave(): void {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    if (!dirty) return;
    dirty = false;
    try {
      const out: Record<string, CacheEntry> = {};
      for (const [id, entry] of cache) out[String(id)] = entry;
      fs.mkdirSync(path.dirname(cacheFile()), { recursive: true });
      fs.writeFileSync(cacheFile(), JSON.stringify(out), 'utf8');
    } catch {
      // Si no se puede escribir, seguimos con el caché en memoria.
    }
  }, 2000);
  saveTimer.unref?.();
}

/** Lo que sabemos de un ítem sin salir a la red. */
function localMedia(id: number): ItemMedia {
  const record = getItem(id);
  return {
    id,
    name: record?.name,
    quality: record?.quality,
    icon: undefined,
    source: 'dbc',
  };
}

function isUsable(entry: CacheEntry | undefined): boolean {
  if (!entry) return false;
  if (entry.icon) return true;
  // Un fallo se reintenta pasado un rato.
  if (!entry.failedAt) return false;
  return Date.now() - new Date(entry.failedAt).getTime() < FAILURE_TTL_MS;
}

/**
 * Saca el nombre y el icono de la respuesta de la fuente.
 *
 * No se da por supuesta la forma exacta del JSON: se buscan las claves
 * habituales y, si no aparece ninguna, se devuelve null para que quede
 * registrado que la fuente respondió algo que no entendemos.
 */
export function parseMediaResponse(payload: unknown): { name?: string; icon?: string } | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as Record<string, unknown>;

  const icon =
    typeof data.icon === 'string'
      ? data.icon
      : typeof data.iconName === 'string'
        ? data.iconName
        : undefined;

  const name =
    typeof data.name === 'string'
      ? data.name
      : typeof data.name_enus === 'string'
        ? data.name_enus
        : undefined;

  if (!icon && !name) return null;
  return { name, icon };
}

function sourceUrl(id: number): string {
  const template = process.env.RBL_ICON_SOURCE || DEFAULT_SOURCE;
  return template.replace('{id}', String(id));
}

/** Pide un ítem a la fuente externa. Devuelve null si no se pudo. */
async function fetchOne(id: number): Promise<{ name?: string; icon?: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(sourceUrl(id), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    return parseMediaResponse(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Cuántas peticiones simultáneas hacemos como mucho. */
const CONCURRENCY = 3;

/**
 * Devuelve nombre e icono de varios ítems, pidiendo fuera solo los que falten.
 *
 * Nunca lanza: si la red no va, cada ítem sale con su nombre de la DBC y sin
 * icono, que es exactamente lo que la interfaz sabe pintar.
 */
export async function getItemMedia(ids: number[]): Promise<Record<number, ItemMedia>> {
  const unique = [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))];
  const result: Record<number, ItemMedia> = {};
  const pending: number[] = [];

  for (const id of unique) {
    const entry = cache.get(id);
    if (isUsable(entry)) {
      result[id] = entry as ItemMedia;
    } else {
      pending.push(id);
      result[id] = localMedia(id);
    }
  }

  if (!pending.length || process.env.RBL_ICONS === 'off') return result;

  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, pending.length) }, async () => {
    while (cursor < pending.length) {
      const id = pending[cursor++];
      const fetched = await fetchOne(id);
      const local = localMedia(id);

      if (fetched?.icon) {
        const entry: CacheEntry = {
          id,
          // El nombre de la DBC es el que usa el simulador: manda ese, y el de
          // la fuente externa solo si aquí no había ninguno.
          name: local.name ?? fetched.name,
          icon: fetched.icon,
          quality: local.quality,
          source: 'remote',
          fetchedAt: new Date().toISOString(),
        };
        cache.set(id, entry);
        result[id] = entry;
      } else {
        cache.set(id, { ...local, failedAt: new Date().toISOString() });
      }
    }
  });

  await Promise.all(workers);
  scheduleSave();
  return result;
}

export function mediaStatus(): { cached: number; withIcon: number; source: string } {
  let withIcon = 0;
  for (const entry of cache.values()) if (entry.icon) withIcon++;
  return {
    cached: cache.size,
    withIcon,
    source: process.env.RBL_ICON_SOURCE || DEFAULT_SOURCE,
  };
}

/** Olvida lo cacheado, para volver a pedirlo. */
export function clearMedia(): void {
  cache = new Map();
  scheduleSave();
}
