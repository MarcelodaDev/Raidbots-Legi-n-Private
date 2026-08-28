import { useEffect, useMemo, useState } from 'react';
import { GEAR_SLOTS, SLOT_LABELS, type GearSlot, type ItemRecord } from '@rbl/shared';
import { api } from '../api.js';
import { ItemLabel } from './ItemIcon.js';

interface Props {
  /** Se llama al elegir un ítem. `ilevel` puede venir sobrescrito por el usuario. */
  onPick: (item: ItemRecord, ilevel: number) => void;
  /** Slot inicial del filtro. */
  slot?: GearSlot;
  /** Texto del botón de añadir. */
  actionLabel?: string;
  /**
   * Clase del personaje: filtra lo que puede equipar. Sin esto es fácil elegir
   * una pieza inválida y que SimulationCraft cancele la simulación entera.
   */
  characterClass?: string;
  /**
   * Fase del servidor. Recorta la búsqueda al ilvl máximo de esa fase: en un
   * servidor progresivo el equipo de tiers posteriores todavía no existe.
   */
  patchId?: string;
}

const SEARCHABLE_SLOTS = GEAR_SLOTS.filter(
  (slot) => slot !== 'shirt' && slot !== 'tabard',
);

/**
 * Buscador sobre la base de ítems generada desde la DBC de SimulationCraft.
 * Permite fijar el ilvl, que es como se representa el titanforjado en simc.
 */
export function ItemPicker({
  onPick,
  slot,
  actionLabel = 'Añadir',
  characterClass,
  patchId,
}: Props) {
  const [query, setQuery] = useState('');
  const [slotFilter, setSlotFilter] = useState<GearSlot | ''>(slot ?? '');
  const [minIlevel, setMinIlevel] = useState(900);
  const [results, setResults] = useState<ItemRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [ilevelOverride, setIlevelOverride] = useState<Record<number, number>>({});
  const [patchOnly, setPatchOnly] = useState(false);
  const [includeLaterTiers, setIncludeLaterTiers] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (!query && !slotFilter) {
        setResults([]);
        return;
      }
      setLoading(true);
      api
        .items({
          q: query,
          slot: slotFilter || undefined,
          minIlevel,
          limit: 60,
          class: characterClass,
          patch: patchId,
          patchOnly: patchOnly ? 'true' : undefined,
          includeLaterTiers: includeLaterTiers ? 'true' : undefined,
        })
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);

    return () => clearTimeout(handle);
  }, [
    query,
    slotFilter,
    minIlevel,
    characterClass,
    patchId,
    patchOnly,
    includeLaterTiers,
  ]);

  const hint = useMemo(() => {
    if (loading) return 'Buscando…';
    if (!query && !slotFilter) return 'Escribe un nombre o elige un slot.';
    if (!results.length) return 'Sin resultados.';
    return `${results.length} resultados`;
  }, [loading, query, slotFilter, results.length]);

  return (
    <div>
      <div className="grid-3">
        <label className="field">
          Nombre o id
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ej: Chaqueta, 152163"
          />
        </label>
        <label className="field">
          Slot
          <select
            value={slotFilter}
            onChange={(event) => setSlotFilter(event.target.value as GearSlot | '')}
          >
            <option value="">Cualquiera</option>
            {SEARCHABLE_SLOTS.map((option) => (
              <option key={option} value={option}>
                {SLOT_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          ilvl mínimo
          <input
            type="number"
            value={minIlevel}
            min={800}
            max={1000}
            step={5}
            onChange={(event) => setMinIlevel(Number(event.target.value) || 0)}
          />
        </label>
      </div>

      {patchId && (
        <div style={{ display: 'grid', gap: 6, marginTop: 10, fontSize: 13 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={patchOnly}
              onChange={(event) => setPatchOnly(event.target.checked)}
            />
            Solo piezas que aparecen en los perfiles de referencia de mi fase
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={includeLaterTiers}
              onChange={(event) => setIncludeLaterTiers(event.target.checked)}
            />
            Incluir equipo que parece de un tier posterior
            <span style={{ color: 'var(--ink-muted)' }}>
              (se descarta por rango de id de ítem, que es una aproximación)
            </span>
          </label>
        </div>
      )}

      <p className="hint" style={{ margin: '10px 0 0' }}>
        {hint}
        {patchId ? ' · limitado al ilvl de tu fase' : ''}
      </p>

      {results.length > 0 && (
        <div style={{ maxHeight: 320, overflow: 'auto', marginTop: 8 }}>
          <table>
            <thead>
              <tr>
                <th>Ítem</th>
                <th>Slot</th>
                <th className="num">ilvl base</th>
                <th className="num">ilvl a usar</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {results.map((item) => (
                <tr key={item.id}>
                  <td>
                    <ItemLabel
                      id={item.id}
                      name={item.name}
                      quality={item.quality}
                      size="sm"
                    />
                  </td>
                  <td style={{ color: 'var(--ink-2)' }}>
                    {item.slots.map((s) => SLOT_LABELS[s]).join(' / ')}
                  </td>
                  <td className="num">{item.ilevel}</td>
                  <td className="num" style={{ width: 110 }}>
                    <input
                      type="number"
                      className="num"
                      value={ilevelOverride[item.id] ?? item.ilevel}
                      onChange={(event) =>
                        setIlevelOverride((prev) => ({
                          ...prev,
                          [item.id]: Number(event.target.value) || item.ilevel,
                        }))
                      }
                    />
                  </td>
                  <td className="num">
                    <button
                      className="small"
                      onClick={() =>
                        onPick(item, ilevelOverride[item.id] ?? item.ilevel)
                      }
                    >
                      {actionLabel}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
