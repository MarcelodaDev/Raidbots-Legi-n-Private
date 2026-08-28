import { SLOT_LABELS, type GearSlot, type TopGearSpace } from '@rbl/shared';
import { Help } from './Help.js';

/**
 * Cuántas combinaciones lleva la selección actual, y qué hacer si son demasiadas.
 *
 * «Mejor combinación» prueba todas las formas de mezclar las piezas, así que el
 * número no suma: se multiplica. Una pieza más en un slot multiplica todo lo
 * demás, y se pasa de «va bien» a «millones» de golpe.
 *
 * Antes esto solo se veía al final, como un error rojo con un número enorme y un
 * «reduce los slots». Eso no enseña nada: no dices de dónde sale el número ni
 * qué quitar. Aquí se enseña mientras se eligen piezas, con el desglose por
 * hueco ordenado de mayor a menor, que es justo el orden en el que conviene
 * recortar.
 */

const FAMILY_LABELS: Record<string, string> = {
  finger: 'Anillos',
  trinket: 'Abalorios',
};

function familyLabel(family: string): string {
  return FAMILY_LABELS[family] ?? SLOT_LABELS[family as GearSlot] ?? family;
}

const nf = new Intl.NumberFormat('es-ES');

/** «4 h», «25 min». Sin historial no se estima: no se inventa un número. */
function formatDuration(profiles: number, secondsPerProfile?: number): string | null {
  if (!secondsPerProfile || secondsPerProfile <= 0) return null;
  const s = profiles * secondsPerProfile;
  if (s < 90) return `${Math.round(s)} s`;
  if (s < 5400) return `${Math.round(s / 60)} min`;
  if (s < 172800) return `${(s / 3600).toFixed(1)} h`;
  if (s < 31536000) return `${Math.round(s / 86400)} días`;
  return `${(s / 31536000).toFixed(1)} años`;
}

/**
 * Cuánto bajaría el total quitando una pieza del hueco que más multiplica.
 *
 * Es la sugerencia útil: no «reduce los ítems», sino «quita una de aquí y pasas
 * de esto a esto otro».
 */
function biggestCut(space: TopGearSpace): { label: string; after: number } | null {
  const worst = space.axes[0];
  if (!worst || worst.options < 2 || !space.total) return null;

  // Un hueco doble reparte las piezas en parejas: C(n,2) → C(n-1,2). Uno suelto
  // baja de n a n-1.
  const paired = worst.family === 'finger' || worst.family === 'trinket';
  const before = worst.options;
  const pool = paired ? (1 + Math.sqrt(1 + 8 * before)) / 2 : before;
  const after = paired ? ((pool - 1) * (pool - 2)) / 2 : before - 1;
  if (after < 1) return null;

  return {
    label: familyLabel(worst.family),
    after: Math.round((space.total / before) * after),
  };
}

export function TopGearBudget({
  space,
  secondsPerProfile,
}: {
  space: TopGearSpace | undefined;
  secondsPerProfile?: number;
}) {
  if (!space || !space.total) return null;

  const time = formatDuration(space.total, secondsPerProfile);
  const cut = space.overLimit ? biggestCut(space) : null;

  return (
    <div className={`notice${space.overLimit ? ' error' : ''}`} style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15 }}>
          {nf.format(space.total)}{' '}
          {space.total === 1 ? 'combinación' : 'combinaciones'}
        </strong>
        {time && <span>· unos {time} en este ordenador</span>}
        <Help term="topgearSpace" />
      </div>

      {space.axes.length > 1 && (
        <div style={{ marginTop: 8 }}>
          Sale de multiplicar:{' '}
          {space.axes.map((axis, index) => (
            <span key={axis.family}>
              {index > 0 && ' × '}
              <strong>{axis.options}</strong> {familyLabel(axis.family)}
            </span>
          ))}
        </div>
      )}

      {space.overLimit ? (
        <div style={{ marginTop: 10 }}>
          Son demasiadas: el tope es {nf.format(space.limit)}. Cada pieza que
          añades <strong>multiplica</strong> el total, así que quitar una baja
          mucho más de lo que parece.
          {cut && (
            <div style={{ marginTop: 6 }}>
              Empieza por <strong>{cut.label}</strong>, que es lo que más
              multiplica: con una pieza menos ahí te quedarías en{' '}
              <strong>{nf.format(cut.after)}</strong>.
            </div>
          )}
          <div style={{ marginTop: 6 }}>
            Si no sabes cuáles quitar, lanza antes <strong>Probar piezas</strong>:
            te dice cuáles merecen la pena de una en una, y aquí dejas solo esas.
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 8, color: 'var(--ink-muted)' }}>
          Cada pieza que añadas multiplica este número, no lo suma.
        </div>
      )}
    </div>
  );
}
