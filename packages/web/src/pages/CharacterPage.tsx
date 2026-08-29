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
import { CustomItemEditor } from '../components/CustomItemEditor.js';
import { RaceCard } from '../components/RaceCard.js';
import { PhaseGearCard } from '../components/PhaseGearCard.js';
import { ItemIcon, ItemLabel, useItemName } from '../components/ItemIcon.js';
import { FieldLabel, Help } from '../components/Help.js';

export function CharacterPage() {
  const { id } = useParams<{ id: string }>();
  const meta = useOutletContext<ServerMeta | null>();
  const [character, setCharacter] = useState<Character | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingBag, setSavingBag] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  /** Índice de la pieza del inventario que se está describiendo, si es una ya guardada. */
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  /** Ids del inventario que el simulador no sabe construir. */
  const [unknownIds, setUnknownIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!id) return;
    api.character(id).then(setCharacter).catch((err: Error) => setError(err.message));
  }, [id]);

  // Qué piezas del inventario no puede construir el motor. Se pregunta al
  // servidor porque el catálogo completo de la DBC son 58.000 ids y no tiene
  // sentido bajárselo al navegador para esto.
  const bagIds = character?.bag.map((item) => item.itemId).join(',') ?? '';
  useEffect(() => {
    if (!bagIds) return setUnknownIds(new Set());
    api
      .unknownItems(bagIds.split(',').map(Number))
      .then((res) => setUnknownIds(new Set(res.unknown)))
      .catch(() => setUnknownIds(new Set()));
  }, [bagIds]);

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
            <FieldLabel term="phase">Fase del servidor</FieldLabel>
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
          Fase <strong>{phase.label}</strong>: {phase.description} Mientras estés
          en ella, el buscador solo te enseña equipo de hasta ilvl{' '}
          {phase.ilevelCap} y se dan por buenas {phase.maxLegendaries}{' '}
          legendarias a la vez.
        </div>
      )}

      <PhaseGearCard
        character={character}
        phase={phase}
        onAddToBag={addManyToBag}
      />

      <div className="card">
        <h2>Lo que llevas puesto</h2>
        <p className="hint">
          Tal y como lo trajo el addon. Talentos:{' '}
          <strong>{character.talents || '—'}</strong>
          {character.artifact
            ? ' · el artefacto también se importó'
            : ' · no llegaron datos del artefacto'}
        </p>

        <div className="gear-grid">
          {SIMMED_SLOTS.map((slot) => (
            <GearSlotCard key={slot} slot={slot} item={character.gear[slot]} />
          ))}
        </div>
      </div>

      <RaceCard character={character} onUpdate={setCharacter} />

      <ArtifactCard character={character} onUpdate={setCharacter} />

      <div className="card">
        <h2>
          Piezas guardadas para comparar
          <Help term="bag" />
        </h2>
        <p className="hint">
          Aquí vas metiendo las piezas que te interesa probar. Luego, al simular,
          las tienes todas a mano para ver cuál te conviene. Se guardan con el
          personaje, así que siguen aquí la próxima vez.
        </p>

        {character.bag.length > 0 && (
          <table style={{ marginBottom: 16 }}>
            <thead>
              <tr>
                <th>Pieza</th>
                <th>Dónde va</th>
                <th className="num">
                  <span className="field-label" style={{ justifyContent: 'flex-end' }}>
                    ilvl
                    <Help term="ilevel" />
                  </span>
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {character.bag.map((item, index) => (
                <tr key={`${item.itemId}-${index}`}>
                  <td>
                    <ItemLabel id={item.itemId} name={item.name} size="sm" />
                    {item.custom ? (
                      <span
                        className="badge warn"
                        style={{ marginLeft: 8 }}
                        title={`stats=${item.custom.stats}`}
                      >
                        a mano
                      </span>
                    ) : (
                      unknownIds.has(item.itemId) && (
                        <span
                          className="badge error"
                          style={{ marginLeft: 8 }}
                          title="Es de un parche posterior a 7.3.5, así que el simulador no tiene sus datos."
                        >
                          sin datos
                        </span>
                      )
                    )}
                  </td>
                  <td style={{ color: 'var(--ink-2)' }}>{SLOT_LABELS[item.slot]}</td>
                  <td className="num">{item.ilevel ?? '—'}</td>
                  <td className="num">
                    {(item.custom || unknownIds.has(item.itemId)) && (
                      <button
                        className="small secondary"
                        style={{ marginRight: 6 }}
                        onClick={() => {
                          setEditingIndex(index);
                          setShowCustom(true);
                        }}
                        disabled={savingBag}
                      >
                        Describir
                      </button>
                    )}
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
        ) : showCustom ? (
          <CustomItemEditor
            initial={editingIndex === null ? undefined : character.bag[editingIndex]}
            onAdd={(item) => {
              void saveBag(
                editingIndex === null
                  ? [...character.bag, item]
                  : character.bag.map((old, i) => (i === editingIndex ? item : old)),
              );
              setShowCustom(false);
              setEditingIndex(null);
            }}
            onCancel={() => {
              setShowCustom(false);
              setEditingIndex(null);
            }}
          />
        ) : (
          <div className="row">
            <button className="secondary" onClick={() => setShowPicker(true)}>
              Buscar una pieza y guardarla
            </button>
            <button
              className="secondary"
              onClick={() => {
                setEditingIndex(null);
                setShowCustom(true);
              }}
            >
              Describir una a mano
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Ficha técnica</h2>
        <p className="hint">
          Esto es lo que se le pasa tal cual al simulador. No hace falta tocarlo
          ni entenderlo para usar la app: está aquí por si algo sale raro y hay
          que mirar de dónde viene.
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
      <h2>
        Tu arma artefacto
        <Help term="artifactTraits" />
      </h2>
      <p className="hint">
        Hace falta leerla una vez antes de poder comparar reliquias. Los rangos
        los calcula el propio simulador, porque es quien sabe cuáles te da el
        Crisol y cuáles tus reliquias.
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
  // Con el slot vacío no hay ítem que resolver; el 0 no se pide.
  const name = useItemName(item?.itemId ?? 0, item?.name);

  return (
    <div className="gear-slot">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
        {item && <ItemIcon id={item.itemId} name={name} size="md" />}
        <div style={{ minWidth: 0 }}>
          <div className="slot-name">{SLOT_LABELS[slot]}</div>
          <div className="item-name">
            {item ? name : <span style={{ color: 'var(--ink-muted)' }}>vacío</span>}
          </div>
        </div>
      </div>
      {item && (
        <div style={{ color: 'var(--ink-muted)', fontSize: 12, textAlign: 'right' }}>
          {item.ilevel ? <div>{item.ilevel}</div> : null}
          {item.enchantId ? <div>ench.</div> : null}
          {item.gemIds.length ? <div>{item.gemIds.length} gema</div> : null}
        </div>
      )}
    </div>
  );
}
