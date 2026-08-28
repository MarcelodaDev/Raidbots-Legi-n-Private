import { useEffect, useState } from 'react';
import {
  SLOT_LABELS,
  type Character,
  type GearItem,
  type PatchPhase,
  type PatchSpecGear,
} from '@rbl/shared';
import { api } from '../api.js';

/** Estado de un slot al comparar tu equipo con el de referencia de la fase. */
type SlotStatus = 'igual' | 'distinto' | 'vacío';

interface Row {
  slot: string;
  mine?: GearItem;
  recommended: PatchSpecGear['gear'][number];
  status: SlotStatus;
  ilevelDelta?: number;
}

/**
 * Compara el equipo del personaje con el equipo de referencia de la fase.
 *
 * La referencia sale de los perfiles por tier de SimulationCraft, que es equipo
 * BiS de ese tier. No es "lo que te va a tocar", sino a dónde apunta la fase.
 */
export function PhaseGearCard({
  character,
  phase,
  onAddToBag,
}: {
  character: Character;
  phase: PatchPhase | undefined;
  onAddToBag: (items: GearItem[]) => void;
}) {
  const [gear, setGear] = useState<PatchSpecGear | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!phase) return;
    setLoading(true);
    setError(null);
    api
      .patchGear(phase.id, character.class, character.spec)
      .then((result) => setGear(result))
      .catch((err: Error) => {
        setGear(null);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [phase, character.class, character.spec]);

  if (!phase) return null;

  const rows: Row[] = (gear?.gear ?? []).map((recommended) => {
    const mine = character.gear[recommended.slot];
    const status: SlotStatus = !mine
      ? 'vacío'
      : mine.itemId === recommended.itemId
        ? 'igual'
        : 'distinto';
    return {
      slot: recommended.slot,
      mine,
      recommended,
      status,
      ilevelDelta:
        mine?.ilevel && recommended.ilevel
          ? recommended.ilevel - mine.ilevel
          : undefined,
    };
  });

  const missing = rows.filter((row) => row.status !== 'igual');

  const addMissing = () => {
    onAddToBag(
      missing.map((row) => ({
        slot: row.recommended.slot,
        itemId: row.recommended.itemId,
        name: row.recommended.name,
        bonusIds: [],
        gemIds: [],
        relicIds: [],
        ilevel: row.recommended.ilevel,
      })),
    );
  };

  return (
    <div className="card">
      <h2>Equipo de referencia · {phase.label}</h2>
      <p className="hint">
        Lo que lleva un {character.class.replace(/_/g, ' ')} {character.spec} en los
        perfiles de esa fase. Es equipo BiS del tier, no lo que te vaya a tocar:
        sirve para saber a dónde apuntar y qué merece la pena simular.
      </p>

      {loading && <div className="empty">Cargando…</div>}

      {error && (
        <div className="notice">
          {error}
          <div style={{ marginTop: 6 }}>
            Puedes seguir usando el resto de la app con normalidad: lo único que
            falta es esta comparativa.
          </div>
        </div>
      )}

      {gear && (
        <>
          <div className="grid-3" style={{ marginBottom: 16 }}>
            <div className="stat-tile">
              <div className="label">Piezas que coinciden</div>
              <div className="value">
                {rows.length - missing.length} / {rows.length}
              </div>
            </div>
            <div className="stat-tile">
              <div className="label">ilvl tope de la fase</div>
              <div className="value">{phase.ilevelCap}</div>
            </div>
            <div className="stat-tile">
              <div className="label">Talentos de referencia</div>
              <div className="value" style={{ fontSize: 18 }}>
                {gear.talents || '—'}
                {gear.talents && gear.talents !== character.talents && (
                  <span
                    style={{ color: 'var(--ink-muted)', fontSize: 12, marginLeft: 8 }}
                  >
                    tú: {character.talents}
                  </span>
                )}
              </div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Slot</th>
                <th>Lo que llevas</th>
                <th>Referencia de la fase</th>
                <th className="num">ilvl ref.</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.slot}>
                  <td style={{ color: 'var(--ink-2)' }}>
                    {SLOT_LABELS[row.recommended.slot]}
                  </td>
                  <td>
                    {row.mine ? (
                      row.mine.name ?? `Ítem ${row.mine.itemId}`
                    ) : (
                      <span style={{ color: 'var(--ink-muted)' }}>vacío</span>
                    )}
                  </td>
                  <td>
                    <span className={`quality-${row.recommended.quality}`}>
                      {row.recommended.name}
                    </span>
                  </td>
                  <td className="num">{row.recommended.ilevel}</td>
                  <td>
                    {row.status === 'igual' ? (
                      <span className="badge ok">misma pieza</span>
                    ) : row.status === 'vacío' ? (
                      <span className="badge warn">slot vacío</span>
                    ) : (
                      <span className="badge">distinta</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {missing.length > 0 && (
            <div className="row" style={{ marginTop: 16, alignItems: 'center' }}>
              <button className="secondary" onClick={addMissing}>
                Añadir las {missing.length} piezas distintas al inventario
              </button>
              <span style={{ color: 'var(--ink-muted)', fontSize: 13 }}>
                Así puedes compararlas con Droptimizer o Top Gear.
              </span>
            </div>
          )}

          {gear.variants.length > 0 && (
            <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
              Esta fase también trae variantes de build para tu spec:{' '}
              {gear.variants.join(', ')}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
