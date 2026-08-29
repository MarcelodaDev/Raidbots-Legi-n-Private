import { useState } from 'react';
import { SIMC_RACES, type Character } from '@rbl/shared';
import { api } from '../api.js';
import { Help } from './Help.js';

/**
 * Razas que SimulationCraft 7.3.5 sí conoce, con lo que aportan al daño.
 *
 * La descripción está para poder elegir la que más se parezca a un racial
 * propio del servidor: es lo único que se puede hacer, porque simc no admite
 * declarar raciales nuevos.
 */
const RACES: { id: string; label: string; racial: string }[] = [
  { id: '', label: 'La del personaje (sin tocar)', racial: 'Si el motor no la conoce, se simula sin ningún racial.' },
  { id: 'dwarf', label: 'Enano', racial: '+2% de daño de golpe crítico (Sangre de la montaña).' },
  { id: 'gnome', label: 'Gnomo', racial: '+1% de celeridad.' },
  { id: 'troll', label: 'Trol', racial: '+10% de celeridad durante 10 s cada 3 min (Frenesí).' },
  { id: 'orc', label: 'Orco', racial: 'Furia de sangre: poder de ataque o de hechizos durante 15 s cada 2 min.' },
  { id: 'blood_elf', label: 'Elfo de sangre', racial: 'Torrente arcano: recupera recurso y silencia.' },
  { id: 'tauren', label: 'Tauren', racial: '+2% de salud y un aturdimiento en área.' },
  { id: 'highmountain_tauren', label: 'Tauren Altamontaña', racial: 'Embestida: daño en área cada 90 s.' },
  { id: 'nightborne', label: 'Nocturno', racial: 'Pulso arcano: daño en área y ralentización cada 3 min.' },
  { id: 'human', label: 'Humano', racial: 'Todo terreno: quita efectos de control.' },
  { id: 'night_elf', label: 'Elfo de la noche', racial: '+1% de esquiva y Camuflaje.' },
  { id: 'void_elf', label: 'Elfo del Vacío', racial: 'Salto en el vacío: teletransporte corto.' },
  { id: 'undead', label: 'No-muerto', racial: 'Voluntad de los Renegados y Canibalizar.' },
  { id: 'worgen', label: 'Huargen', racial: '+1% de probabilidad de golpe crítico (Oscuridad).' },
  { id: 'draenei', label: 'Draenei', racial: 'Don de los Naaru: sanación a lo largo del tiempo.' },
  { id: 'lightforged_draenei', label: 'Draenei Forjaluz', racial: 'Fuego purificador: daño en área cada 3 min.' },
  { id: 'pandaren', label: 'Pandaren', racial: '+100% de duración del buff de comida.' },
  { id: 'goblin', label: 'Goblin', racial: '+1% de celeridad y un cohete que hace daño.' },
];

// Si alguna vez se añade una raza al motor y no aquí, la lista de arriba se
// quedaría coja en silencio. Mejor enterarse.
const MISSING = SIMC_RACES.filter((race) => !RACES.some((entry) => entry.id === race));
if (MISSING.length > 0) {
  console.warn('RaceCard: faltan razas que el motor sí acepta:', MISSING.join(', '));
}

/**
 * Razas propias del servidor: elegir con qué raza estándar se simula.
 *
 * SimulationCraft acepta cualquier cadena en `race=` sin protestar y la deja en
 * `none`, que significa simular sin ningún racial. Eso no da error, solo un DPS
 * un 1-2% por debajo del real, y de ahí que esto exista.
 */
export function RaceCard({
  character,
  onUpdate,
}: {
  character: Character;
  onUpdate: (character: Character) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const racials = character.racials ?? [];
  const current = character.raceOverride ?? '';

  const save = async (raceOverride: string) => {
    setSaving(true);
    setError(null);
    try {
      onUpdate(await api.updateCharacter(character.id, { raceOverride }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <h2>
        Raza
        <Help term="raceOverride" />
      </h2>
      <p className="hint">
        Tu personaje es <strong>{character.race || '?'}</strong>. Si esa raza es
        propia del servidor, el simulador no la conoce y te simula sin ningún
        racial, sin avisar. No se pueden inventar raciales, pero sí elegir la
        raza oficial que más se le parezca.
      </p>

      {racials.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div className="field-label" style={{ marginBottom: 6 }}>
            Lo que el addon leyó de tu personaje
          </div>
          <table>
            <tbody>
              {racials.map((spell) => (
                <tr key={spell.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{spell.name}</td>
                  <td style={{ color: 'var(--ink-2)' }}>{spell.description || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <label>
        <span className="field-label">Simular como</span>
        <select
          value={current}
          onChange={(e) => void save(e.target.value)}
          disabled={saving}
        >
          {RACES.map((race) => (
            <option key={race.id} value={race.id}>
              {race.label}
            </option>
          ))}
        </select>
      </label>

      <p className="hint" style={{ marginTop: 8 }}>
        {RACES.find((race) => race.id === current)?.racial}
      </p>

      {current && (
        <div className="notice" style={{ marginTop: 12 }}>
          Es una aproximación: el racial de tu raza real y el de esta no tienen
          por qué valer lo mismo. Para comparar equipo da igual —el racial es el
          mismo en las dos opciones que compares y se cancela—, pero el DPS
          absoluto se parecerá a tu raza tanto como se parezcan los raciales.
        </div>
      )}

      {error && (
        <div className="notice error" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}
    </div>
  );
}
