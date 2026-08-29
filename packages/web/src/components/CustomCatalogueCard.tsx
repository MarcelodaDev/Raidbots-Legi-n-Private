import { useEffect, useState } from 'react';
import { SLOT_LABELS, type CustomItemEntry, type CustomItemsStatus } from '@rbl/shared';
import { api } from '../api.js';
import { Help } from './Help.js';

/**
 * Catálogo de las piezas que el motor no conoce.
 *
 * Vive fuera de los personajes porque las estadísticas de un ítem no cambian
 * según quién lo lleve: se describe una vez y sirve para todos. Lo que viene en
 * el repositorio es la parte compartida; lo que se añade aquí se queda en esta
 * instalación y manda sobre lo compartido.
 */
export function CustomCatalogueCard() {
  const [status, setStatus] = useState<CustomItemsStatus | null>(null);
  const [items, setItems] = useState<CustomItemEntry[]>([]);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const reload = () => {
    api
      .customItems()
      .then((data) => {
        setStatus(data.status);
        setItems(data.items);
      })
      .catch(() => undefined);
  };

  useEffect(reload, []);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.importCustomItems(text);
      setStatus(result.status);
      setText('');
      setOpen(false);
      setNotice(
        `${result.added} pieza(s) guardadas.` +
          (result.withoutStats > 0
            ? ` ${result.withoutStats} venían sin estadísticas y no se pueden simular.`
            : ''),
      );
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const shown = showAll ? items : items.slice(0, 8);
  const pendingEffect = items.filter((entry) => entry.effectText && !entry.use && !entry.equip);

  return (
    <div className="card">
      <h2>
        Piezas propias del servidor
        <Help term="customCatalogue" />
      </h2>

      {status?.available ? (
        <p className="hint">
          <strong>{status.items}</strong> piezas descritas
          {status.shipped > 0 && `, ${status.shipped} de serie`}
          {status.local > 0 && ` y ${status.local} añadidas aquí`}. Se aplican solas a
          cualquier personaje que las lleve.
        </p>
      ) : (
        <p className="hint">
          El simulador solo conoce el equipo de Legion. Para las piezas que tu
          servidor ha traído de parches posteriores hace falta decirle qué
          estadísticas dan, y eso se hace una sola vez. En el juego:{' '}
          <code>/rbl escanear &lt;desde&gt; &lt;hasta&gt;</code> — lee incluso las
          piezas que no tienes.
        </p>
      )}

      {notice && (
        <div className="notice" style={{ marginBottom: 12 }}>
          {notice}
        </div>
      )}

      {pendingEffect.length > 0 && (
        <div className="notice warn" style={{ marginBottom: 12 }}>
          <strong>{pendingEffect.length} pieza(s) tienen efecto sin traducir.</strong> Se
          simulan solo por sus estadísticas: el addon copia el texto del tooltip,
          pero convertirlo en la fórmula que entiende el motor lo tiene que hacer
          una persona. Hasta entonces, esas piezas rinden por debajo de lo real.
        </div>
      )}

      {items.length > 0 && (
        <table style={{ marginBottom: 12 }}>
          <thead>
            <tr>
              <th>Pieza</th>
              <th>Hueco</th>
              <th className="num">ilvl</th>
              <th>Estadísticas</th>
              <th>Efecto</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((entry) => (
              <tr key={entry.itemId}>
                <td>
                  {entry.name}
                  <span style={{ color: 'var(--ink-muted)', marginLeft: 6, fontSize: 12 }}>
                    {entry.itemId}
                  </span>
                </td>
                <td style={{ color: 'var(--ink-2)' }}>
                  {entry.slot ? SLOT_LABELS[entry.slot] : '—'}
                </td>
                <td className="num">{entry.ilevel ?? '—'}</td>
                <td style={{ fontSize: 12, fontFamily: 'var(--mono, monospace)' }}>
                  {entry.stats}
                </td>
                <td style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                  {entry.use || entry.equip ? (
                    <span style={{ color: 'var(--good)' }}>{entry.use ?? entry.equip}</span>
                  ) : entry.effectText ? (
                    <span title={entry.effectText}>sin traducir</span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {items.length > 8 && (
        <button className="small secondary" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Ver solo las primeras' : `Ver las ${items.length}`}
        </button>
      )}

      {open ? (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder="# Raidbots Legion · ítems para el catálogo ..."
            style={{ width: '100%', fontFamily: 'var(--mono, monospace)', fontSize: 12 }}
          />
          {error && (
            <div className="notice error" style={{ marginTop: 8 }}>
              {error}
            </div>
          )}
          <div className="row" style={{ marginTop: 8 }}>
            <button onClick={() => void submit()} disabled={busy || !text.trim()}>
              {busy ? 'Guardando…' : 'Guardar las piezas'}
            </button>
            <button className="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <div className="row" style={{ marginTop: 12 }}>
          <button className="secondary" onClick={() => setOpen(true)}>
            Pegar un escaneo del juego
          </button>
        </div>
      )}
    </div>
  );
}
