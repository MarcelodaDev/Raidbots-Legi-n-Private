import { useState } from 'react';
import type { LootStatus } from '@rbl/shared';
import { api } from '../api.js';
import { Help } from './Help.js';

/**
 * Importar la tabla de botín que vuelca el addon.
 *
 * Va aquí y no en la ficha de un personaje porque es la misma para todos: qué
 * jefe suelta qué pieza no depende de con quién juegues.
 */
export function LootTableCard({
  status,
  onUpdate,
}: {
  status: LootStatus | undefined;
  onUpdate: (next: LootStatus) => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      onUpdate(await api.importLoot(text));
      setText('');
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      onUpdate(await api.clearLoot());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>
        Tabla de botín
        <Help term="lootTable" />
      </h2>

      {status?.available ? (
        <p className="hint">
          Cargada: <strong>{status.items.toLocaleString('es')}</strong> piezas de{' '}
          <strong>{status.bosses}</strong> jefes. El buscador de mejoras ya te dice
          de dónde cae cada una.
        </p>
      ) : (
        <p className="hint">
          El simulador sabe qué piezas te mejoran, pero no de dónde salen: su base
          de datos no incluye las tablas de botín. El juego sí lo sabe. En el
          juego escribe <code>/rbl botin</code>, espera a que acabe, copia todo y
          pégalo aquí.
        </p>
      )}

      {open ? (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder="# Raidbots Legion · tabla de botín ..."
            style={{ width: '100%', fontFamily: 'var(--mono, monospace)', fontSize: 12 }}
          />
          {error && (
            <div className="notice error" style={{ marginTop: 8 }}>
              {error}
            </div>
          )}
          <div className="row" style={{ marginTop: 8 }}>
            <button onClick={() => void submit()} disabled={busy || !text.trim()}>
              {busy ? 'Guardando…' : 'Guardar la tabla'}
            </button>
            <button className="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <div className="row">
          <button className="secondary" onClick={() => setOpen(true)}>
            {status?.available ? 'Volver a importar' : 'Pegar la tabla de botín'}
          </button>
          {status?.available && (
            <button className="small danger" onClick={() => void clear()} disabled={busy}>
              Borrar
            </button>
          )}
        </div>
      )}

      {status?.available && (
        <p className="hint" style={{ marginTop: 10 }}>
          Sale del Diario de Mazmorras del cliente, así que refleja las tablas de
          Blizzard en 7.3.5. Si tu servidor ha movido el botín de algún jefe, esa
          pieza aparecerá donde la puso Blizzard.
        </p>
      )}
    </div>
  );
}
