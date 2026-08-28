import { useState } from 'react';
import {
  SLOT_LABELS,
  type GearSlot,
  type ProfilesetResult,
  type SimResult,
} from '@rbl/shared';
import { ItemLabel } from './ItemIcon.js';

const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

/**
 * Todos los gráficos son de magnitud con una sola serie (azul) y los datos
 * completos están además en la propia tabla, así que no hace falta leyenda.
 * Las diferencias usan color + signo + flecha: nunca solo el color.
 */
export function ResultsView({ result }: { result: SimResult }) {
  return (
    <>
      <div className="card">
        <div className="hero">
          <div className="value">{nf.format(result.baseline.mean)}</div>
          <div className="unit">
            DPS ± {nf.format(result.baseline.error)} (
            {result.baseline.mean > 0
              ? nf2.format((result.baseline.error / result.baseline.mean) * 100)
              : '0'}
            %)
          </div>
        </div>

        <div className="grid-3" style={{ marginTop: 20 }}>
          <div className="stat-tile">
            <div className="label">Iteraciones</div>
            <div className="value">{nf.format(result.iterations)}</div>
          </div>
          <div className="stat-tile">
            <div className="label">Duración del cálculo</div>
            <div className="value">{formatDuration(result.elapsedMs)}</div>
          </div>
          <div className="stat-tile">
            <div className="label">Estilo</div>
            <div className="value" style={{ fontSize: 16 }}>
              {result.options.fightStyle} · {result.options.targets}⨯
            </div>
          </div>
          <div className="stat-tile">
            <div className="label">SimulationCraft</div>
            <div className="value" style={{ fontSize: 16 }}>
              {result.simcVersion}
            </div>
          </div>
        </div>
      </div>

      {result.warnings.length > 0 && <WarningsCard warnings={result.warnings} />}

      {result.profilesets && result.profilesets.length > 0 && (
        <ProfilesetTable
          profilesets={result.profilesets}
          baseline={result.baseline.mean}
          type={result.type}
        />
      )}

      {result.scaleFactors && result.scaleFactors.length > 0 && (
        <ScaleFactorsCard result={result} />
      )}

      {result.breakdown.length > 0 && <BreakdownCard result={result} />}
    </>
  );
}

// ---------------------------------------------------------------------------

function ProfilesetTable({
  profilesets,
  baseline,
  type,
}: {
  profilesets: ProfilesetResult[];
  baseline: number;
  type: SimResult['type'];
}) {
  const [onlyGains, setOnlyGains] = useState(false);

  // En Droptimizer un mismo ítem se prueba en varios slots: nos quedamos con
  // el mejor, igual que hace Raidbots.
  const rows = collapseByItem(profilesets, type).filter(
    (row) => !onlyGains || row.delta > 0,
  );

  const maxAbs = Math.max(
    ...rows.map((row) => Math.abs(row.delta)),
    Math.abs(baseline * 0.001),
  );

  return (
    <div className="card">
      <h2>Resultados por perfil</h2>
      <p className="hint">
        Diferencia de DPS frente al perfil base ({nf.format(baseline)} DPS). Ordenado
        de mejor a peor.
      </p>

      {type === 'relics' && <RelicReferenceNote profilesets={profilesets} />}

      <div className="row" style={{ marginBottom: 12, alignItems: 'center' }}>
        <button
          className={onlyGains ? '' : 'secondary'}
          onClick={() => setOnlyGains(!onlyGains)}
        >
          {onlyGains ? 'Mostrar todo' : 'Solo mejoras'}
        </button>
        <span style={{ color: 'var(--ink-muted)', fontSize: 13 }}>
          {rows.length} de {profilesets.length} perfiles
        </span>
      </div>

      <table>
        <thead>
          <tr>
            <th style={{ width: 36 }}>#</th>
            <th>Perfil</th>
            <th className="num">DPS</th>
            <th className="num">Δ DPS</th>
            <th style={{ width: '28%' }}>Diferencia</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const positive = row.delta >= 0;
            const width = maxAbs > 0 ? (Math.abs(row.delta) / maxAbs) * 50 : 0;
            return (
              <tr key={row.name}>
                <td style={{ color: 'var(--ink-muted)' }}>{index + 1}</td>
                <td>
                  {row.items ? (
                    // Una combinación de Top Gear: cada pieza con su icono y
                    // el slot al que va, que es lo que hay que ir a buscar.
                    <div style={{ display: 'grid', gap: 4 }}>
                      {row.items.map((item) => (
                        <span key={`${item.itemId}-${item.slot}`}>
                          <ItemLabel id={item.itemId} name={item.name} size="sm" />
                          <span style={{ color: 'var(--ink-muted)', fontSize: 12 }}>
                            {' '}
                            · {SLOT_LABELS[item.slot as GearSlot] ?? item.slot}
                          </span>
                        </span>
                      ))}
                    </div>
                  ) : row.itemId ? (
                    <ItemLabel id={row.itemId} name={row.label} size="sm" />
                  ) : (
                    row.label
                  )}
                  {row.slotNote && (
                    <div style={{ color: 'var(--ink-muted)', fontSize: 12 }}>
                      {row.slotNote}
                    </div>
                  )}
                </td>
                <td className="num">{nf.format(row.mean)}</td>
                <td className={`num delta-value ${positive ? 'up' : 'down'}`}>
                  {positive ? '▲ +' : '▼ '}
                  {nf.format(row.delta)}
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {positive ? '+' : ''}
                    {nf2.format(row.deltaPct)}%
                  </div>
                </td>
                <td>
                  <div className="delta-track">
                    <div className="delta-zero" style={{ left: '50%' }} />
                    <div
                      className="delta-fill"
                      style={{
                        left: positive ? '50%' : `${50 - width}%`,
                        width: `${width}%`,
                        background: positive ? 'var(--good)' : 'var(--critical)',
                      }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Los perfiles de ilvl de reliquia declaran los tres huecos de forma explícita,
 * incluido uno de referencia con el ilvl actual. Si esa referencia se separa del
 * perfil base es que el ilvl declarado no es el real, y entonces las subidas de
 * ilvl hay que leerlas contra la referencia, no contra el base.
 */
function RelicReferenceNote({ profilesets }: { profilesets: ProfilesetResult[] }) {
  const reference = profilesets.find(
    (entry) => entry.meta?.kind === 'relic_ilevel_reference',
  );
  if (!reference) return null;

  const drift = Math.abs(reference.deltaPct);
  if (drift < 0.5) {
    return (
      <div className="notice" style={{ borderLeftColor: 'var(--good)' }}>
        La fila «{reference.name}» sale a {nf2.format(reference.deltaPct)}% del perfil
        base, así que el ilvl de reliquia declarado es el correcto y las subidas
        de ilvl se pueden leer directamente.
      </div>
    );
  }

  return (
    <div className="notice">
      La fila «{reference.name}» se desvía {nf2.format(drift)}% del perfil base: el
      ilvl de reliquia que declaraste no coincide con el real. Las filas de ilvl
      siguen siendo comparables <strong>entre ellas y con esa referencia</strong>,
      pero no contra el perfil base. Vuelve a leer el artefacto en la ficha del
      personaje para que la app lo despeje sola.
    </div>
  );
}

interface CollapsedRow {
  name: string;
  label: string;
  /** Si la fila es una pieza concreta, para poder enseñar su icono. */
  itemId?: number;
  /** Si la fila es una combinación de Top Gear, las piezas que cambia. */
  items?: { itemId: number; name: string; slot: string }[];
  slotNote?: string;
  mean: number;
  delta: number;
  deltaPct: number;
}

/** `wrist` → `Muñecas`. Si el slot no se reconoce se deja tal cual. */
function slotNote(slot: string | undefined): string | undefined {
  if (!slot) return undefined;
  return `mejor en ${SLOT_LABELS[slot as GearSlot] ?? slot}`;
}

/**
 * El id del ítem de un perfil, si es que el perfil es una pieza.
 *
 * Las gemas también son ítems y tienen su icono; los encantamientos son
 * hechizos, así que ahí no hay nada que pedir.
 */
function rowItemId(entry: ProfilesetResult): number | undefined {
  const id = entry.meta?.kind === 'gem' ? entry.meta?.gemId : entry.meta?.itemId;
  return typeof id === 'number' && id > 0 ? id : undefined;
}

/** Las piezas que cambia una combinación de Top Gear. */
function rowItems(
  entry: ProfilesetResult,
): { itemId: number; name: string; slot: string }[] | undefined {
  if (entry.meta?.kind !== 'combination') return undefined;
  const items = entry.meta?.items;
  return Array.isArray(items) && items.length
    ? (items as { itemId: number; name: string; slot: string }[])
    : undefined;
}

function collapseByItem(
  profilesets: ProfilesetResult[],
  type: SimResult['type'],
): CollapsedRow[] {
  if (type !== 'droptimizer') {
    return profilesets.map((entry) => ({
      name: entry.name,
      label: String(entry.meta?.itemName ?? entry.name),
      itemId: rowItemId(entry),
      items: rowItems(entry),
      mean: entry.mean,
      delta: entry.delta,
      deltaPct: entry.deltaPct,
    }));
  }

  const best = new Map<string, CollapsedRow>();
  for (const entry of profilesets) {
    const itemId = rowItemId(entry);
    const key = itemId ? `item-${itemId}` : entry.name;
    const label = String(entry.meta?.itemName ?? entry.name);
    const candidate: CollapsedRow = {
      name: entry.name,
      label,
      itemId,
      slotNote: slotNote(entry.meta?.slot as string | undefined),
      mean: entry.mean,
      delta: entry.delta,
      deltaPct: entry.deltaPct,
    };
    const existing = best.get(key);
    if (!existing || candidate.mean > existing.mean) best.set(key, candidate);
  }

  return [...best.values()].sort((a, b) => b.mean - a.mean);
}

// ---------------------------------------------------------------------------

function ScaleFactorsCard({ result }: { result: SimResult }) {
  const factors = result.scaleFactors ?? [];
  const max = Math.max(...factors.map((factor) => Math.abs(factor.value)), 0.0001);

  return (
    <div className="card">
      <h2>Pesos de estadística</h2>
      <p className="hint">
        Cuánto DPS aporta un punto de cada estadística. Normalizado sobre la mayor.
      </p>

      <table>
        <thead>
          <tr>
            <th>Estadística</th>
            <th className="num">DPS por punto</th>
            <th className="num">Relativo</th>
            <th style={{ width: '45%' }}>Magnitud</th>
          </tr>
        </thead>
        <tbody>
          {factors.map((factor) => (
            <tr key={factor.stat}>
              <td>{factor.stat}</td>
              <td className="num">{nf2.format(factor.value)}</td>
              <td className="num">{nf2.format(factor.normalized)}</td>
              <td>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: `${(Math.abs(factor.value) / max) * 100}%` }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BreakdownCard({ result }: { result: SimResult }) {
  const rows = result.breakdown.slice(0, 25);
  const max = Math.max(...rows.map((row) => row.pct), 1);

  return (
    <div className="card">
      <h2>Daño por habilidad</h2>
      <p className="hint">Porcentaje sobre el daño total del jugador.</p>

      <table>
        <thead>
          <tr>
            <th>Habilidad</th>
            <th className="num">% del daño</th>
            <th className="num">DPS</th>
            <th className="num">Usos</th>
            <th style={{ width: '35%' }}>Peso</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td>{row.name.replace(/_/g, ' ')}</td>
              <td className="num">{nf2.format(row.pct)}%</td>
              <td className="num">{nf.format(row.dps)}</td>
              <td className="num">{nf2.format(row.executes)}</td>
              <td>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: `${(row.pct / max) * 100}%` }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WarningsCard({ warnings }: { warnings: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="notice">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>{warnings.length} avisos de SimulationCraft</strong>
        <button className="small secondary" onClick={() => setOpen(!open)}>
          {open ? 'Ocultar' : 'Ver'}
        </button>
      </div>
      {open && (
        <ul>
          {warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${seconds % 60} s`;
}
