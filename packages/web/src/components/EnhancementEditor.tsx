import { useMemo, useState } from 'react';
import {
  SLOT_LABELS,
  type Character,
  type EnhancementDb,
  type GearSlot,
} from '@rbl/shared';

/** Slots que en Legion se pueden encantar o engarzar. */
const ENHANCEABLE: GearSlot[] = [
  'neck',
  'back',
  'finger1',
  'finger2',
  'main_hand',
  'off_hand',
];

interface Entry {
  id: number;
  name: string;
  /** true si aparece en los perfiles de referencia de ese hueco. */
  suggested: boolean;
}

interface Props {
  kind: 'enchants' | 'gems';
  character: Character;
  db: EnhancementDb;
  slot: GearSlot;
  setSlot: (slot: GearSlot) => void;
  selected: number[];
  setSelected: (ids: number[]) => void;
  includeNone: boolean;
  setIncludeNone: (value: boolean) => void;
}

/**
 * Selector de encantamientos o gemas para un hueco.
 *
 * Por defecto enseña solo lo que se usa de verdad en ese slot según los
 * perfiles por tier de SimulationCraft: entre 4000 encantamientos no se elige
 * nada. El catálogo completo está detrás de un interruptor.
 */
export function EnhancementEditor({
  kind,
  character,
  db,
  slot,
  setSlot,
  selected,
  setSelected,
  includeNone,
  setIncludeNone,
}: Props) {
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState('');

  const equipped = character.gear[slot];
  const suggestedIds = useMemo(() => {
    const bySlot = db.bySlot[slot];
    return new Set(kind === 'enchants' ? bySlot?.enchants ?? [] : bySlot?.gems ?? []);
  }, [db, slot, kind]);

  const entries: Entry[] = useMemo(() => {
    const catalogue: Entry[] =
      kind === 'enchants'
        ? db.enchants.map((e) => ({ id: e.id, name: e.name, suggested: suggestedIds.has(e.id) }))
        : db.gems.map((g) => ({ id: g.id, name: g.name, suggested: suggestedIds.has(g.id) }));

    const term = query.trim().toLowerCase();
    return catalogue
      .filter((entry) => (showAll || entry.suggested) && (!term || entry.name.toLowerCase().includes(term)))
      .sort((a, b) => {
        if (a.suggested !== b.suggested) return a.suggested ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, showAll ? 200 : 50);
  }, [db, kind, suggestedIds, showAll, query]);

  const toggle = (id: number) => {
    setSelected(
      selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id],
    );
  };

  const slotsWithItem = ENHANCEABLE.filter((option) => character.gear[option]);

  return (
    <>
      <div className="grid-3" style={{ marginBottom: 16 }}>
        <label className="field">
          Hueco
          <select value={slot} onChange={(event) => setSlot(event.target.value as GearSlot)}>
            {slotsWithItem.map((option) => (
              <option key={option} value={option}>
                {SLOT_LABELS[option]}
              </option>
            ))}
          </select>
        </label>

        <div className="stat-tile">
          <div className="label">Pieza en ese hueco</div>
          <div className="value" style={{ fontSize: 15 }}>
            {equipped ? equipped.name ?? `Ítem ${equipped.itemId}` : 'vacío'}
          </div>
        </div>

        <label className="field" style={{ justifyContent: 'flex-end' }}>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={includeNone}
              onChange={(event) => setIncludeNone(event.target.checked)}
            />
            Incluir un perfil {kind === 'enchants' ? 'sin encantar' : 'sin gema'}
          </span>
        </label>
      </div>

      {kind === 'gems' && equipped && !equipped.gemIds.length && (
        <div className="notice">
          Esa pieza no lleva ninguna gema ahora mismo. Si no tiene engarce,
          SimulationCraft ignorará las gemas y todos los perfiles saldrán con el
          mismo DPS.
        </div>
      )}

      <div className="notice" style={{ borderLeftColor: 'var(--series-1)' }}>
        Las diferencias entre {kind === 'enchants' ? 'encantamientos' : 'gemas'} son
        pequeñas (del orden de 0,1-0,5%). Baja el error objetivo a 0,05% o menos
        para que no se las coma el ruido.
      </div>

      <div className="row" style={{ marginBottom: 10, alignItems: 'center' }}>
        <button
          className={showAll ? '' : 'secondary'}
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? 'Solo las habituales' : 'Ver catálogo completo'}
        </button>
        {showAll && (
          <input
            style={{ maxWidth: 260 }}
            value={query}
            placeholder="Buscar por nombre"
            onChange={(event) => setQuery(event.target.value)}
          />
        )}
        <span style={{ color: 'var(--ink-muted)', fontSize: 13 }}>
          {selected.length} seleccionad{kind === 'gems' ? 'as' : 'os'}
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 4,
          maxHeight: 300,
          overflow: 'auto',
        }}
      >
        {entries.map((entry) => (
          <label
            key={entry.id}
            style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}
          >
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={selected.includes(entry.id)}
              onChange={() => toggle(entry.id)}
            />
            {entry.name}
            {showAll && entry.suggested && (
              <span className="badge ok" style={{ fontSize: 10, padding: '1px 6px' }}>
                habitual
              </span>
            )}
          </label>
        ))}
        {entries.length === 0 && (
          <div className="empty">
            {showAll
              ? 'Sin resultados.'
              : 'No hay nada habitual para ese hueco. Prueba con el catálogo completo.'}
          </div>
        )}
      </div>
    </>
  );
}
