import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { iconUrl, type ItemMedia } from '@rbl/shared';
import { api } from '../api.js';

/**
 * Iconos y nombres de ítems.
 *
 * Los ids que aparecen en pantalla se piden al servidor en tandas, no uno por
 * uno, y el servidor los cachea en disco. Si no hay icono (sin internet, o la
 * fuente no lo tenía) se pinta un recuadro con las iniciales: la interfaz nunca
 * depende de que esto funcione.
 */

interface MediaStore {
  media: Record<number, ItemMedia>;
  request: (ids: number[]) => void;
}

const MediaContext = createContext<MediaStore>({ media: {}, request: () => {} });

export function ItemMediaProvider({ children }: { children: React.ReactNode }) {
  const [media, setMedia] = useState<Record<number, ItemMedia>>({});
  const [queue, setQueue] = useState<number[]>([]);

  const request = useMemo(
    () => (ids: number[]) => {
      setQueue((prev) => {
        const fresh = ids.filter((id) => id > 0 && !prev.includes(id));
        return fresh.length ? [...prev, ...fresh] : prev;
      });
    },
    [],
  );

  useEffect(() => {
    const pending = queue.filter((id) => !(id in media));
    if (!pending.length) return;

    let cancelled = false;
    // Un respiro antes de pedir, para agrupar lo que aparezca en el mismo
    // render en una sola petición.
    const handle = setTimeout(() => {
      api
        .itemMedia(pending.slice(0, 200))
        .then((result) => {
          if (!cancelled) setMedia((prev) => ({ ...prev, ...result }));
        })
        .catch(() => {
          // Sin iconos se sigue funcionando; se marca para no reintentar en bucle.
          if (cancelled) return;
          setMedia((prev) => {
            const next = { ...prev };
            for (const id of pending) next[id] = next[id] ?? { id, source: 'dbc' };
            return next;
          });
        });
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [queue, media]);

  return (
    <MediaContext.Provider value={{ media, request }}>{children}</MediaContext.Provider>
  );
}

/** Pide los iconos de estos ítems y devuelve lo que se sepa de ellos. */
export function useItemMedia(ids: number[]): Record<number, ItemMedia> {
  const { media, request } = useContext(MediaContext);
  const key = ids.join(',');

  useEffect(() => {
    if (ids.length) request(ids);
    // `key` resume la lista: así no se pide en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return media;
}

const SIZES = { sm: 24, md: 36, lg: 48 } as const;

/**
 * El nombre que se enseña.
 *
 * El que viene del addon es el del perfil .simc: en minúsculas y a veces con
 * guiones bajos (`runebound collar`). El que resuelve el servidor viene de la
 * base de datos del juego con sus mayúsculas (`Runebound Collar`), así que ese
 * manda; el del addon queda de reserva mientras el otro no haya llegado.
 */
function displayName(
  fromCaller: string | undefined,
  entry: ItemMedia | undefined,
  id: number,
): string {
  return entry?.name ?? fromCaller ?? `Ítem ${id}`;
}

/** Iniciales para el recuadro de reserva cuando no hay icono. */
function initials(name: string | undefined, id: number): string {
  if (!name) return String(id).slice(0, 2);
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * El nombre de un ítem, ya resuelto, para pintarlo por tu cuenta.
 *
 * Para cuando el icono y el nombre no van juntos en la misma línea y no sirve
 * `ItemLabel`.
 */
export function useItemName(id: number, fallback?: string): string {
  const media = useItemMedia([id]);
  return displayName(fallback, media[id], id);
}

export function ItemIcon({
  id,
  name,
  quality,
  size = 'md',
}: {
  id: number;
  name?: string;
  quality?: number;
  size?: keyof typeof SIZES;
}) {
  const media = useItemMedia([id]);
  const [broken, setBroken] = useState(false);
  const entry = media[id];
  const px = SIZES[size];
  const url = iconUrl(entry?.icon);
  const label = displayName(name, entry, id);
  const q = quality ?? entry?.quality;

  // Si la imagen no carga (sin internet, o el nombre del icono no existe) se
  // enseña el recuadro con iniciales, nunca el icono roto del navegador.
  const showImage = url && !broken;

  return (
    <span
      className={`item-icon quality-border-${q ?? 1}`}
      style={{ width: px, height: px, fontSize: px * 0.36 }}
      title={label}
    >
      {showImage ? (
        <img
          src={url}
          alt=""
          width={px}
          height={px}
          loading="lazy"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="item-icon-fallback">{initials(label, id)}</span>
      )}
    </span>
  );
}

/** Icono + nombre coloreado por calidad, que es como se enseña en el juego. */
export function ItemLabel({
  id,
  name,
  quality,
  ilevel,
  size = 'md',
}: {
  id: number;
  name?: string;
  quality?: number;
  ilevel?: number;
  size?: keyof typeof SIZES;
}) {
  const media = useItemMedia([id]);
  const entry = media[id];
  const label = displayName(name, entry, id);
  const q = quality ?? entry?.quality;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <ItemIcon id={id} name={label} quality={q} size={size} />
      <span>
        <span className={q !== undefined ? `quality-${q}` : undefined}>{label}</span>
        {ilevel ? (
          <span style={{ color: 'var(--ink-muted)', fontSize: 12 }}> · {ilevel}</span>
        ) : null}
      </span>
    </span>
  );
}
