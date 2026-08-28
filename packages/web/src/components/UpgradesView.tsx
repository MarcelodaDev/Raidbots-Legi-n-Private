import { SLOT_LABELS, type GearSlot, type ProfilesetResult } from '@rbl/shared';
import { ItemLabel, useItemName } from './ItemIcon.js';
import { Help } from './Help.js';

/**
 * El resultado del buscador de mejoras, agrupado por hueco.
 *
 * Cada pieza se ha simulado a varios niveles de objeto, así que de cada una se
 * saben dos cosas que aquí se juntan: cuánto sube en el mejor caso, y a partir
 * de qué nivel empieza a compensar. Lo segundo es lo que de verdad se usa: una
 * pieza que no te mejora a 940 y sí a 970 te dice exactamente qué buscar.
 */

const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

/** Cuántas piezas se enseñan por hueco. */
const TOP = 3;

interface Candidate {
  itemId: number;
  name: string;
  quality?: number;
  /** Delta de DPS por nivel de objeto probado. */
  byIlevel: { ilevel: number; delta: number; deltaPct: number }[];
  bestDelta: number;
  bestIlevel: number;
  /** El nivel más bajo probado en el que ya mejora. */
  fromIlevel?: number;
  reason?: string;
}

interface SlotGroup {
  slot: GearSlot;
  replaces?: string;
  replacesId?: number;
  replacesIlevel?: number;
  candidates: Candidate[];
}

function groupBySlot(profilesets: ProfilesetResult[]): SlotGroup[] {
  const slots = new Map<GearSlot, SlotGroup>();

  for (const entry of profilesets) {
    if (entry.meta?.kind !== 'upgrade') continue;
    const slot = entry.meta.slot as GearSlot;
    const itemId = Number(entry.meta.itemId);
    const ilevel = Number(entry.meta.ilevel);
    if (!slot || !itemId) continue;

    let group = slots.get(slot);
    if (!group) {
      group = {
        slot,
        replaces: entry.meta.replaces ? String(entry.meta.replaces) : undefined,
        replacesId: Number(entry.meta.replacesId) || undefined,
        replacesIlevel: Number(entry.meta.replacesIlevel) || undefined,
        candidates: [],
      };
      slots.set(slot, group);
    }

    let candidate = group.candidates.find((c) => c.itemId === itemId);
    if (!candidate) {
      candidate = {
        itemId,
        name: String(entry.meta.itemName ?? entry.name),
        quality: Number(entry.meta.quality) || undefined,
        byIlevel: [],
        bestDelta: Number.NEGATIVE_INFINITY,
        bestIlevel: ilevel,
        reason: entry.meta.reason ? String(entry.meta.reason) : undefined,
      };
      group.candidates.push(candidate);
    }
    candidate.byIlevel.push({ ilevel, delta: entry.delta, deltaPct: entry.deltaPct });
  }

  for (const group of slots.values()) {
    for (const candidate of group.candidates) {
      candidate.byIlevel.sort((a, b) => a.ilevel - b.ilevel);
      for (const step of candidate.byIlevel) {
        if (step.delta > candidate.bestDelta) {
          candidate.bestDelta = step.delta;
          candidate.bestIlevel = step.ilevel;
        }
      }
      // El escalón más bajo que ya sube: es lo que hay que ir a buscar.
      candidate.fromIlevel = candidate.byIlevel.find((step) => step.delta > 0)?.ilevel;
    }
    group.candidates.sort((a, b) => b.bestDelta - a.bestDelta);
  }

  // Los huecos donde más se puede ganar, primero.
  return [...slots.values()].sort(
    (a, b) => (b.candidates[0]?.bestDelta ?? 0) - (a.candidates[0]?.bestDelta ?? 0),
  );
}

export function UpgradesView({ profilesets }: { profilesets: ProfilesetResult[] }) {
  const groups = groupBySlot(profilesets);
  if (!groups.length) return null;

  const improving = groups.filter((g) => (g.candidates[0]?.bestDelta ?? 0) > 0);
  const ilevels = [
    ...new Set(profilesets.map((p) => Number(p.meta?.ilevel)).filter(Boolean)),
  ].sort((a, b) => a - b);

  return (
    <div className="card">
      <h2>
        Qué te mejora, hueco por hueco
        <Help term="upgrades" />
      </h2>
      <p className="hint">
        Las {TOP} mejores piezas de cada hueco, entre las que se pueden conseguir
        en tu fase. «Desde ilvl» es el nivel más bajo de los probados
        {ilevels.length ? ` (${ilevels.join(', ')})` : ''} en el que la pieza ya
        te sube: por debajo de ese nivel no te compensa cambiarla.
      </p>

      <div className={`verdict ${improving.length ? 'good' : 'flat'}`}>
        {improving.length ? (
          <span>
            Tienes margen en <strong>{improving.length}</strong> de{' '}
            {groups.length} huecos. Donde más ganas es en{' '}
            <strong>{SLOT_LABELS[improving[0].slot]}</strong>:{' '}
            <strong style={{ color: 'var(--good)' }}>
              ▲ +{nf.format(improving[0].candidates[0].bestDelta)} DPS
            </strong>
            .
          </span>
        ) : (
          <span>
            Ninguna pieza de tu fase te mejora en los huecos mirados. Lo que
            llevas ya es lo mejor que puedes conseguir ahora mismo.
          </span>
        )}
      </div>

      {groups.map((group) => (
        <div key={group.slot} style={{ marginTop: 20 }}>
          <SlotHeader group={group} />

          <table>
            <thead>
              <tr>
                <th>Pieza</th>
                <th className="num">Desde ilvl</th>
                <th className="num">Ganancia máx.</th>
                <th>Por nivel</th>
                <th style={{ width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {group.candidates.slice(0, TOP).map((candidate) => (
                <tr key={candidate.itemId}>
                  <td>
                    <ItemLabel
                      id={candidate.itemId}
                      name={candidate.name}
                      quality={candidate.quality}
                      size="sm"
                    />
                  </td>
                  <td className="num">
                    {candidate.fromIlevel ? (
                      <strong style={{ color: 'var(--good)' }}>
                        {candidate.fromIlevel}
                      </strong>
                    ) : (
                      <span style={{ color: 'var(--ink-muted)' }}>no mejora</span>
                    )}
                  </td>
                  <td
                    className={`num delta-value ${
                      candidate.bestDelta >= 0 ? 'up' : 'down'
                    }`}
                  >
                    {candidate.bestDelta >= 0 ? '▲ +' : '▼ '}
                    {nf.format(candidate.bestDelta)}
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      a ilvl {candidate.bestIlevel}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {candidate.byIlevel.map((step) => (
                        <span
                          key={step.ilevel}
                          className={`delta-value ${step.delta >= 0 ? 'up' : 'down'}`}
                          style={{ fontSize: 12 }}
                        >
                          {step.ilevel}:{' '}
                          {step.delta >= 0 ? '+' : ''}
                          {nf2.format(step.deltaPct)}%
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="num">
                    {/*
                      La DBC de simc no trae tabla de botín, así que el origen no
                      lo sabemos. El enlace lleva a la ficha del ítem, donde sí
                      está de dónde cae.
                    */}
                    <a
                      href={`https://www.wowhead.com/item=${candidate.itemId}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      style={{ fontSize: 12 }}
                    >
                      dónde cae ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

/** Cabecera de un hueco, con el nombre bien escrito de lo que llevas puesto. */
function SlotHeader({ group }: { group: SlotGroup }) {
  const equipped = useItemName(group.replacesId ?? 0, group.replaces);

  return (
    <div className="slot-name" style={{ marginBottom: 6 }}>
      {SLOT_LABELS[group.slot]}
      {group.replaces && (
        <span style={{ textTransform: 'none', letterSpacing: 0 }}>
          {' '}
          · ahora llevas {equipped}
          {group.replacesIlevel ? ` (${group.replacesIlevel})` : ''}
        </span>
      )}
    </div>
  );
}
