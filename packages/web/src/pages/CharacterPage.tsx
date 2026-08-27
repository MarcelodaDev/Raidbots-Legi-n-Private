import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  SIMMED_SLOTS,
  SLOT_LABELS,
  type Character,
  type GearItem,
  type GearSlot,
} from '@rbl/shared';
import { api } from '../api.js';
import { ItemPicker } from '../components/ItemPicker.js';

export function CharacterPage() {
  const { id } = useParams<{ id: string }>();
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

      <div className="row" style={{ marginBottom: 20 }}>
        <Link to={`/personajes/${character.id}/simular`}>
          <button>Simular</button>
        </Link>
      </div>

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
