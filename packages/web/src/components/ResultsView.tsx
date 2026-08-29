import { useState } from 'react';
import {
  SLOT_LABELS,
  buildPawnScale,
  type GearSlot,
  type ProfilesetResult,
  type SimResult,
} from '@rbl/shared';
import { ItemLabel } from './ItemIcon.js';
import { Help } from './Help.js';
import { UpgradesView } from './UpgradesView.js';

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
        <div className="hero-label">
          Tu personaje ahora mismo
          <Help term="baseline" />
        </div>
        <div className="hero">
          <div className="value">{nf.format(result.baseline.mean)}</div>
          <div className="unit">
            <span className="field-label">
              DPS
              <Help term="dps" />
            </span>
          </div>
        </div>
        <div
          className="field-label"
          style={{ color: 'var(--ink-muted)', fontSize: 13, marginTop: 8 }}
        >
          margen de ± {nf.format(result.baseline.error)} (
          {result.baseline.mean > 0
            ? nf2.format((result.baseline.error / result.baseline.mean) * 100)
            : '0'}
          %)
          <Help term="dpsError" />
        </div>

        <div className="grid-3" style={{ marginTop: 20 }}>
          <div className="stat-tile">
            <div className="label">
              <span className="field-label">
                Combates simulados
                <Help term="iterations" />
              </span>
            </div>
            <div className="value">{nf.format(result.iterations)}</div>
          </div>
          <div className="stat-tile">
            <div className="label">Lo que tardó</div>
            <div className="value">{formatDuration(result.elapsedMs)}</div>
          </div>
          <div className="stat-tile">
            <div className="label">
              <span className="field-label">
                Tipo de pelea
                <Help term="fightStyle" />
              </span>
            </div>
            <div className="value" style={{ fontSize: 16 }}>
              {result.options.fightStyle} · {result.options.targets}{' '}
              {result.options.targets === 1 ? 'enemigo' : 'enemigos'}
            </div>
          </div>
          <div className="stat-tile">
            <div className="label">Motor de cálculo</div>
            <div className="value" style={{ fontSize: 16 }}>
              SimulationCraft {result.simcVersion}
            </div>
          </div>
        </div>
      </div>

      {result.warnings.length > 0 && <WarningsCard warnings={result.warnings} />}

      {result.type === 'upgrades' && result.profilesets?.length ? (
        <UpgradesView profilesets={result.profilesets} />
      ) : null}

      {result.type !== 'upgrades' && result.profilesets && result.profilesets.length > 0 && (
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
  const allRows = collapseByItem(profilesets, type);
  const rows = allRows.filter((row) => !onlyGains || row.delta > 0);

  const maxAbs = Math.max(
    ...rows.map((row) => Math.abs(row.delta)),
    Math.abs(baseline * 0.001),
  );

  // En Droptimizer una misma pieza se prueba en varios huecos y aquí se ha
  // quedado la mejor, así que hay menos líneas que pruebas: conviene decirlo
  // en vez de dar dos números que no cuadran.
  const grouped = allRows.length < profilesets.length;

  // Lo primero que hay que leer: si algo de lo probado te mejora y cuánto.
  const best = allRows.reduce<CollapsedRow | null>(
    (top, row) => (!top || row.delta > top.delta ? row : top),
    null,
  );

  return (
    <div className="card">
      <h2>Qué sale mejor</h2>
      <p className="hint">
        Cada línea es una opción que has pedido comparar. La ganancia es lo que
        te subiría o bajaría el DPS respecto a lo que llevas ahora (
        {nf.format(baseline)} DPS), y están ordenadas de mejor a peor.
      </p>

      {best && (
        <div className={`verdict ${best.delta > 0 ? 'good' : 'flat'}`}>
          {best.delta > 0 ? (
            <span>
              Lo que más te sube es <strong>{best.label}</strong>:{' '}
              <strong style={{ color: 'var(--good)' }}>
                ▲ +{nf.format(best.delta)} DPS
              </strong>{' '}
              ({nf2.format(best.deltaPct)}% más).
            </span>
          ) : (
            <span>
              Nada de lo que has probado te mejora: lo que llevas ahora es lo
              mejor de esta lista.
            </span>
          )}
        </div>
      )}

      {type === 'relics' && <RelicReferenceNote profilesets={profilesets} />}

      <div className="row" style={{ marginBottom: 12, alignItems: 'center' }}>
        <button
          className={onlyGains ? '' : 'secondary'}
          onClick={() => setOnlyGains(!onlyGains)}
        >
          {onlyGains ? 'Enseñar todas' : 'Solo las que mejoran'}
        </button>
        <span style={{ color: 'var(--ink-muted)', fontSize: 13 }}>
          {onlyGains
            ? `${rows.length} de ${allRows.length} te mejoran`
            : `${rows.length} ${rows.length === 1 ? 'opción' : 'opciones'}`}
          {grouped &&
            ` · cada pieza se probó en varios huecos y se enseña su mejor hueco`}
        </span>
      </div>

      <table>
        <thead>
          <tr>
            <th style={{ width: 36 }}>#</th>
            <th>Opción</th>
            <th className="num">
              <span className="field-label" style={{ justifyContent: 'flex-end' }}>
                DPS
                <Help term="dps" />
              </span>
            </th>
            <th className="num">
              <span className="field-label" style={{ justifyContent: 'flex-end' }}>
                Ganancia
                <Help term="delta" />
              </span>
            </th>
            <th style={{ width: '28%' }}>Comparativa</th>
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
                      {row.kept?.map((item) => (
                        <span
                          key={`kept-${item.itemId}-${item.slot}`}
                          style={{ opacity: 0.65 }}
                        >
                          <ItemLabel id={item.itemId} name={item.name} size="sm" />
                          <span style={{ color: 'var(--ink-muted)', fontSize: 12 }}>
                            {' '}
                            · {SLOT_LABELS[item.slot as GearSlot] ?? item.slot} (sigue)
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
  /** Las del mismo hueco que se quedan como están. */
  kept?: { itemId: number; name: string; slot: string }[];
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

/**
 * Las piezas del mismo hueco que la combinación NO cambia.
 *
 * En un hueco doble hace falta enseñarlas: si solo se nombra lo que se mueve,
 * una fila de abalorios parece llevar uno solo cuando en realidad lleva dos.
 */
function rowKept(
  entry: ProfilesetResult,
): { itemId: number; name: string; slot: string }[] | undefined {
  if (entry.meta?.kind !== 'combination') return undefined;
  const kept = entry.meta?.kept;
  return Array.isArray(kept) && kept.length
    ? (kept as { itemId: number; name: string; slot: string }[])
    : undefined;
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
      kept: rowKept(entry),
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

/**
 * La cadena para el addon Pawn.
 *
 * Con esto pegado en el juego, Pawn enseña en el tooltip de cada pieza cuánto
 * vale para ti, usando los pesos que acaba de calcular esta simulación.
 */
function PawnCard({ result }: { result: SimResult }) {
  const [copied, setCopied] = useState(false);

  const scale = buildPawnScale(
    result.characterName,
    result.class,
    result.spec,
    result.scaleFactors ?? [],
  );

  if (!scale) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(scale.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso de portapapeles queda seleccionarlo a mano, que para eso
      // el texto está a la vista y en un campo seleccionable.
      setCopied(false);
    }
  };

  return (
    <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
      <div className="slot-name field-label" style={{ marginBottom: 6 }}>
        Para el addon Pawn
        <Help term="pawn" />
      </div>
      <p className="hint">
        Pega esto en el juego y Pawn te dirá, en el tooltip de cada pieza que te
        caiga, cuánto vale para ti. En el juego:{' '}
        <code>/pawn</code> → <strong>Escalas</strong> →{' '}
        <strong>Importar</strong> → pegar con Ctrl+V.
      </p>

      <input
        readOnly
        value={scale.text}
        onFocus={(event) => event.currentTarget.select()}
        style={{
          fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
          fontSize: 12.5,
        }}
      />

      <div className="row" style={{ marginTop: 10, alignItems: 'center' }}>
        <button className="secondary" onClick={copy}>
          {copied ? '✓ Copiado' : 'Copiar la cadena'}
        </button>
        {scale.skipped.length > 0 && (
          <span style={{ color: 'var(--ink-muted)', fontSize: 13 }}>
            Pawn no maneja {scale.skipped.join(', ')}, así que se queda fuera.
          </span>
        )}
      </div>
    </div>
  );
}

function ScaleFactorsCard({ result }: { result: SimResult }) {
  const factors = result.scaleFactors ?? [];
  const max = Math.max(...factors.map((factor) => Math.abs(factor.value)), 0.0001);

  return (
    <div className="card">
      <h2>
        Qué estadística te renta más
        <Help term="statWeights" />
      </h2>
      <p className="hint">
        Cuánto DPS te daría un punto más de cada estadística. La columna de la
        derecha lo compara con la mejor: si crítico marca 1,00 y celeridad 0,50,
        un punto de crítico te vale el doble que uno de celeridad.
      </p>

      <table>
        <thead>
          <tr>
            <th>Estadística</th>
            <th className="num">DPS por punto</th>
            <th className="num">Comparado con la mejor</th>
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

      <PawnCard result={result} />
    </div>
  );
}

function BreakdownCard({ result }: { result: SimResult }) {
  const rows = result.breakdown.slice(0, 25);
  const max = Math.max(...rows.map((row) => row.pct), 1);

  return (
    <div className="card">
      <h2>
        De dónde sale tu daño
        <Help term="breakdown" />
      </h2>
      <p className="hint">
        Qué parte del daño pone cada habilidad. Si algo que deberías estar
        usando mucho aparece muy abajo, ahí tienes algo que revisar.
      </p>

      <table>
        <thead>
          <tr>
            <th>Habilidad</th>
            <th className="num">% del daño</th>
            <th className="num">DPS</th>
            <th className="num">Veces usada</th>
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
