import { useEffect, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import {
  SIMMED_SLOTS,
  SLOT_LABELS,
  type Character,
  type GearItem,
  type GearSlot,
  type ServerMeta,
} from '@rbl/shared';
import { api } from '../api.js';
import { ItemPicker } from '../components/ItemPicker.js';
import { PhaseGearCard } from '../components/PhaseGearCard.js';

export function CharacterPage() {
  const { id } = useParams<{ id: string }>();
  const meta = useOutletContext<ServerMeta | null>();
  const [character, setCharacter] = useState<Character | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingBag, setSavingBag] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.character(id).then(setCharacter).catch((err: Error) => setError(err.message));
  }, [id]);

  if (error) return <div className="notice error">{error}</div>;
  if (!character) return <div className="empty">Cargando…</div>;

  const saveBag = async (bag: GearItem[]) => {
    setSavingBag(true);
    try {
      setCharacter(await api.updateBag(character.id, bag));
    } finally {
      setSavingBag(false);
    }
  };

  const phases = meta?.patches ?? [];
  const phase = phases.find((entry) => entry.id === character.patchId);

  const setPhase = async (patchId: string) => {
    setCharacter(await api.updateCharacter(character.id, { patchId }));
  };

  /** Añade piezas al inventario sin duplicar lo que ya está. */
  const addManyToBag = (items: GearItem[]) => {
    const known = new Set(character.bag.map((item) => `${item.itemId}-${item.slot}`));
    const fresh = items.filter((item) => !known.has(`${item.itemId}-${item.slot}`));
    if (fresh.length) void saveBag([...character.bag, ...fresh]);
  };

  const addToBag = (itemId: number, name: string, slots: GearSlot[], ilevel: number) => {
    const item: GearItem = {
      slot: slots[0],
      itemId,
      name,
      bonusIds: [],
      gemIds: [],
      relicIds: [],
      ilevel,
    };
    void saveBag([...character.bag, item]);
  };

  const removeFromBag = (index: number) => {
    void saveBag(character.bag.filter((_, i) => i !== index));
  };

  return (
    <>
      <h1 className="page-title">{character.name}</h1>
      <p className="page-subtitle">
        {character.class.replace(/_/g, ' ')} · {character.spec} · {character.race} ·
        nivel {character.level}
      </p>

      <div className="row" style={{ marginBottom: 20, alignItems: 'flex-end' }}>
        <Link to={`/personajes/${character.id}/simular`}>
          <button>Simular</button>
        </Link>

        {phases.length > 0 && (
          <label className="field" style={{ minWidth: 320 }}>
            Fase del servidor
            <select
              value={character.patchId ?? ''}
              onChange={(event) => void setPhase(event.target.value)}
            >
              <option value="">Sin fase (todo 7.3.5)</option>
              {phases.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label} · ilvl ≤ {entry.ilevelCap}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {phase && (
        <div className="notice" style={{ borderLeftColor: 'var(--series-1)' }}>
          Fase <strong>{phase.label}</strong>: {phase.description} El buscador de
          ítems se limita a ilvl {phase.ilevelCap} y Top Gear usa{' '}
          {phase.maxLegendaries} legendarias por defecto.
        </div>
      )}

      <PhaseGearCard
        character={character}
        phase={phase}
        onAddToBag={addManyToBag}
      />

      <div className="card">
        <h2>Equipo</h2>
        <p className="hint">
          Importado del addon. Talentos: <strong>{character.talents || '—'}</strong>
          {character.artifact ? ' · artefacto importado' : ' · sin datos de artefacto'}
        </p>

        <div className="gear-grid">
          {SIMMED_SLOTS.map((slot) => (
            <GearSlotCard key={slot} slot={slot} item={character.gear[slot]} />
          ))}
        </div>
      </div>

      <ArtifactCard character={character} onUpdate={setCharacter} />

      <div className="card">
        <h2>Inventario para Top Gear</h2>
        <p className="hint">
          El addon de Legion no exporta las bolsas de forma fiable, así que aquí
          añades a mano las piezas que quieras comparar. Se guardan con el personaje.
        </p>

        {character.bag.length > 0 && (
          <table style={{ marginBottom: 16 }}>
            <thead>
              <tr>
                <th>Ítem</th>
                <th>Slot</th>
                <th className="num">ilvl</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {character.bag.map((item, index) => (
                <tr key={`${item.itemId}-${index}`}>
                  <td>
                    {item.name ?? `Ítem ${item.itemId}`}
                    <span style={{ color: 'var(--ink-muted)', fontSize: 12 }}>
                      {' '}
                      (id {item.itemId})
                    </span>
                  </td>
                  <td style={{ color: 'var(--ink-2)' }}>{SLOT_LABELS[item.slot]}</td>
                  <td className="num">{item.ilevel ?? '—'}</td>
                  <td className="num">
                    <button
                      className="small danger"
                      onClick={() => removeFromBag(index)}
                      disabled={savingBag}
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {showPicker ? (
          <>
            <ItemPicker
              characterClass={character.class}
              patchId={character.patchId}
              onPick={(item, ilevel) =>
                addToBag(item.id, item.name, item.slots, ilevel)
              }
            />
            <div className="row" style={{ marginTop: 12 }}>
              <button className="secondary" onClick={() => setShowPicker(false)}>
                Cerrar buscador
              </button>
            </div>
          </>
        ) : (
          <button className="secondary" onClick={() => setShowPicker(true)}>
            Añadir ítem al inventario
          </button>
        )}
      </div>

      <div className="card">
        <h2>Perfil .simc</h2>
        <p className="hint">
          Esto es exactamente lo que recibe SimulationCraft como perfil base.
        </p>
        <div className="log">{character.profile}</div>
      </div>
    </>
  );
}

/**
 * Rasgos del artefacto. Los lee el motor con una simulación de una iteración,
 * porque la cadena `artifact=` del addon no trae ni nombres ni los rangos que
 * aportan el Crisol y las reliquias.
 */
function ArtifactCard({
  character,
  onUpdate,
}: {
  character: Character;
  onUpdate: (character: Character) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const traits = character.artifactTraits ?? [];

  const read = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.readArtifact(character.id);
      onUpdate(result.character);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>Artefacto</h2>
      <p className="hint">
        Necesario para comparar reliquias. Se leen del propio SimulationCraft,
        que es quien resuelve los rangos del Crisol y de las reliquias.
      </p>

      {error && <div className="notice error">{error}</div>}

      {traits.length > 0 && (
        <>
          <div className="grid-3" style={{ marginBottom: 16 }}>
            <div className="stat-tile">
              <div className="label">Rasgos</div>
              <div className="value">{traits.length}</div>
            </div>
            <div className="stat-tile">
              <div className="label">ilvl del arma</div>
              <div className="value">{character.weaponIlevel ?? '—'}</div>
            </div>
            <div className="stat-tile">
              <div className="label">ilvl de reliquia</div>
              <div className="value">{character.estimatedRelicIlevel ?? '—'}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Rasgo</th>
                <th className="num">Total</th>
                <th className="num">Comprado</th>
                <th className="num">Crisol</th>
                <th className="num">Reliquia</th>
              </tr>
            </thead>
            <tbody>
              {traits
                .filter((trait) => trait.totalRank > 0)
                .map((trait) => (
                  <tr key={trait.id}>
                    <td>{trait.name}</td>
                    <td className="num">{trait.totalRank}</td>
                    <td className="num">{trait.purchasedRank}</td>
                    <td className="num">{trait.crucibleRank || '—'}</td>
                    <td className="num">{trait.relicRank || '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </>
      )}

      <div className="row" style={{ marginTop: traits.length ? 16 : 0 }}>
        <button className="secondary" onClick={read} disabled={busy}>
          {busy ? 'Leyendo…' : traits.length ? 'Volver a leer' : 'Leer rasgos del artefacto'}
        </button>
        {character.artifactReadAt && (
          <span style={{ color: 'var(--ink-muted)', fontSize: 13 }}>
            Leído el {new Date(character.artifactReadAt).toLocaleString('es-ES')}
          </span>
        )}
      </div>
    </div>
  );
}

function GearSlotCard({ slot, item }: { slot: GearSlot; item?: GearItem }) {
  return (
    <div className="gear-slot">
      <div>
        <div className="slot-name">{SLOT_LABELS[slot]}</div>
        <div className="item-name">
          {item ? item.name ?? `Ítem ${item.itemId}` : <span style={{ color: 'var(--ink-muted)' }}>vacío</span>}
        </div>
      </div>
      {item && (
        <div style={{ color: 'var(--ink-muted)', fontSize: 12, textAlign: 'right' }}>
          id {item.itemId}
          {item.enchantId ? <div>ench. {item.enchantId}</div> : null}
        </div>
      )}
    </div>
  );
}
