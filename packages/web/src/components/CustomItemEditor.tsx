import { useState } from 'react';
import {
  GEAR_SLOTS,
  SLOT_LABELS,
  validateCustomItem,
  type GearItem,
  type GearSlot,
} from '@rbl/shared';
import { Help } from './Help.js';

/**
 * Formulario para describir a mano una pieza que el simulador no conoce.
 *
 * Existe porque los servidores progresivos reparten equipo de parches
 * posteriores a 7.3.5. El motor no tiene sus datos, pero sí acepta un ítem
 * declarado a pelo, así que lo que falta es que el jugador copie lo que pone el
 * tooltip del juego.
 */
export function CustomItemEditor({
  initial,
  onAdd,
  onCancel,
}: {
  /**
   * Pieza de partida, cuando se describe una que ya está en el inventario
   * porque vino del addon y el simulador no la conoce. Así el jugador no tiene
   * que reescribir el nombre ni el hueco, que ya sabemos.
   */
  initial?: GearItem;
  onAdd: (item: GearItem) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [slot, setSlot] = useState<GearSlot>(initial?.slot ?? 'trinket1');
  const [ilevel, setIlevel] = useState(initial?.ilevel ? String(initial.ilevel) : '');
  const [stats, setStats] = useState(initial?.custom?.stats ?? '');
  const [use, setUse] = useState(initial?.custom?.use ?? '');
  const [equip, setEquip] = useState(initial?.custom?.equip ?? '');
  const [errors, setErrors] = useState<string[]>([]);

  const submit = () => {
    const custom = {
      stats: stats.trim(),
      use: use.trim() || undefined,
      equip: equip.trim() || undefined,
    };
    const found = validateCustomItem(custom);
    if (!name.trim()) found.unshift('Ponle un nombre para reconocerla en los resultados.');
    setErrors(found);
    if (found.length > 0) return;

    onAdd({
      // Se conserva todo lo que ya trae la pieza (id original, encantamiento,
      // gemas) y solo se pisa lo que describe este formulario. El id sigue
      // sirviendo para reconocerla; lo que no se usa es para buscarla en la
      // base del simulador, que es donde no está.
      ...(initial ?? { itemId: 0, bonusIds: [], gemIds: [], relicIds: [] }),
      slot,
      name: name.trim(),
      ilevel: Number.parseInt(ilevel, 10) || undefined,
      custom,
    });
  };

  return (
    <div className="card" style={{ background: 'var(--surface-2)' }}>
      <h3 style={{ marginTop: 0 }}>
        {initial ? `Describir «${initial.name ?? `Ítem ${initial.itemId}`}»` : 'Describir una pieza a mano'}
        <Help term="customItem" />
      </h3>
      <p className="hint">
        Para el equipo que tu servidor ha traído de parches posteriores. El
        simulador no lo conoce, pero si le dices qué estadísticas da, lo simula
        igual. Cópialas del tooltip del juego.
      </p>

      <div className="row">
        <label style={{ flex: 2 }}>
          Nombre
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Placas de esgrima disimuladas"
          />
        </label>
        <label style={{ flex: 1 }}>
          Dónde va
          <select value={slot} onChange={(e) => setSlot(e.target.value as GearSlot)}>
            {GEAR_SLOTS.filter((s) => s !== 'shirt' && s !== 'tabard').map((s) => (
              <option key={s} value={s}>
                {SLOT_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: 1 }}>
          ilvl
          <input
            value={ilevel}
            onChange={(e) => setIlevel(e.target.value)}
            placeholder="885"
            inputMode="numeric"
          />
        </label>
      </div>

      <label>
        <span className="field-label">
          Estadísticas
          <Help term="customStats" />
        </span>
        <input
          value={stats}
          onChange={(e) => setStats(e.target.value)}
          placeholder="1052str_654crit_436haste"
        />
      </label>

      <label>
        <span className="field-label">
          Efecto de «Uso» (opcional)
          <Help term="customUse" />
        </span>
        <input
          value={use}
          onChange={(e) => setUse(e.target.value)}
          placeholder="4500str_20dur_120cd"
        />
      </label>

      <label>
        <span className="field-label">
          Efecto pasivo con proc (opcional)
          <Help term="customEquip" />
        </span>
        <input
          value={equip}
          onChange={(e) => setEquip(e.target.value)}
          placeholder="3000crit_15dur_1.5rppm_procby/attack_procon/hit"
        />
      </label>

      {errors.length > 0 && (
        <div className="notice error" style={{ marginTop: 12 }}>
          {errors.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        <button onClick={submit}>Guardar la pieza</button>
        <button className="secondary" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
