import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import type { ServerMeta } from '@rbl/shared';
import { api } from './api.js';

export function App() {
  const [meta, setMeta] = useState<ServerMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .meta()
      .then(setMeta)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          Raidbots Legion
          <span>Simulador local · WoW 7.3.5</span>
        </div>

        <nav className="nav">
          <NavLink to="/" end>
            Personajes
          </NavLink>
          <NavLink to="/historial">Historial</NavLink>
        </nav>

        <div style={{ marginTop: 'auto', display: 'grid', gap: 8 }}>
          <SimcBadge meta={meta} error={error} />
          {meta?.itemDb.available ? (
            <span className="badge ok">
              {meta.itemDb.items.toLocaleString('es-ES')} ítems
            </span>
          ) : (
            <span className="badge warn">Sin base de ítems</span>
          )}
          {meta &&
            (meta.patches.length ? (
              <span className="badge ok">{meta.patches.length} fases</span>
            ) : (
              <span className="badge warn">Sin fases</span>
            ))}
        </div>
      </aside>

      <main className="content">
        <Outlet context={meta} />
      </main>
    </div>
  );
}

function SimcBadge({ meta, error }: { meta: ServerMeta | null; error: string | null }) {
  if (error) return <span className="badge error">Servidor caído</span>;
  if (!meta) return <span className="badge">Comprobando…</span>;
  if (!meta.simc.available) return <span className="badge error">SimC no encontrado</span>;
  return (
    <span className="badge ok" title={meta.simc.path}>
      SimC {meta.simc.version}
    </span>
  );
}
