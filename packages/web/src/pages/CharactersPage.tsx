import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import type { Character, ServerMeta } from '@rbl/shared';
import { api } from '../api.js';

const PLACEHOLDER = `# Pega aquí la salida del addon SimulationCraft, por ejemplo:
warlock="Nyxa"
level=110
race=blood_elf
spec=destruction
talents=2113321
artifact=1:0:0:0:0:26:4:32:4
head=,id=152163,bonus_id=3562/1512,enchant_id=5429
...`;

export function CharactersPage() {
  const meta = useOutletContext<ServerMeta | null>();
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const reload = () => {
    api.characters().then(setCharacters).catch(() => setCharacters([]));
  };

  useEffect(reload, []);

  const onImport = async () => {
    setBusy(true);
    setError(null);
    setWarnings([]);
    try {
      const { character, warnings: warns } = await api.importCharacter(input);
      setWarnings(warns);
      setInput('');
      reload();
      if (!warns.length) navigate(`/personajes/${character.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id: string) => {
    await api.deleteCharacter(id);
    reload();
  };

  return (
    <>
      <h1 className="page-title">Personajes</h1>
      <p className="page-subtitle">
        Copia tu personaje desde el juego y prueba aquí qué equipo, talentos o
        consumibles te hacen pegar más.
      </p>

      <p className="lead">
        Funciona así: dentro del WoW, el addon te da un texto con todo lo que
        llevas. Lo pegas aquí y la app recrea a tu personaje. A partir de ahí
        puedes probar cambios —una pieza nueva, otro talento, otra gema— y ver
        cuánto DPS ganarías con cada uno, sin tener que probarlo en el juego.
      </p>

      {meta && !meta.simc.available && (
        <div className="notice error">
          <strong>SimulationCraft no está disponible.</strong>
          {/* El mensaje trae las rutas donde se buscó, una por línea. */}
          <pre
            style={{
              marginTop: 6,
              marginBottom: 0,
              whiteSpace: 'pre-wrap',
              fontSize: 12.5,
              fontFamily: 'inherit',
            }}
          >
            {meta.simc.error}
          </pre>
        </div>
      )}

      <div className="card">
        <h2>Traer un personaje del juego</h2>
        <p className="hint">
          Dentro del WoW escribe <code>/rbl</code> (o <code>/simc</code> si usas
          el addon oficial), copia todo el texto que sale con Ctrl+C y pégalo
          aquí abajo con Ctrl+V.
        </p>

        <textarea
          value={input}
          placeholder={PLACEHOLDER}
          onChange={(event) => setInput(event.target.value)}
          spellCheck={false}
        />

        {error && <div className="notice error" style={{ marginTop: 12 }}>{error}</div>}

        {warnings.length > 0 && (
          <div className="notice" style={{ marginTop: 12 }}>
            Importado con avisos:
            <ul>
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="row" style={{ marginTop: 12 }}>
          <button onClick={onImport} disabled={busy || input.trim().length < 10}>
            {busy ? 'Importando…' : 'Importar'}
          </button>
          <button className="secondary" onClick={() => setInput('')} disabled={!input}>
            Limpiar
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Guardados</h2>
        {characters.length === 0 ? (
          <div className="empty">Todavía no has importado ningún personaje.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Clase / spec</th>
                <th>Talentos</th>
                <th className="num">Piezas guardadas</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {characters.map((character) => (
                <tr key={character.id}>
                  <td>
                    <Link to={`/personajes/${character.id}`}>{character.name}</Link>
                  </td>
                  <td style={{ color: 'var(--ink-2)' }}>
                    {character.class.replace(/_/g, ' ')} · {character.spec}
                  </td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {character.talents || '—'}
                  </td>
                  <td className="num">{character.bag.length}</td>
                  <td className="num">
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      <Link to={`/personajes/${character.id}/simular`}>
                        <button className="small">Simular</button>
                      </Link>
                      <button
                        className="small danger"
                        onClick={() => onDelete(character.id)}
                      >
                        Borrar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
