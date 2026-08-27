import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Job, JobStatus } from '@rbl/shared';
import { api } from '../api.js';

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: 'En cola',
  running: 'Ejecutando',
  done: 'Completada',
  error: 'Error',
  cancelled: 'Cancelada',
};

const STATUS_CLASS: Record<JobStatus, string> = {
  queued: 'badge',
  running: 'badge warn',
  done: 'badge ok',
  error: 'badge error',
  cancelled: 'badge',
};

export function HistoryPage() {
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    const load = () => api.jobs().then(setJobs).catch(() => setJobs([]));
    load();
    // Refresco periódico: basta para una lista de historial.
    const handle = setInterval(load, 4000);
    return () => clearInterval(handle);
  }, []);

  return (
    <>
      <h1 className="page-title">Historial</h1>
      <p className="page-subtitle">Últimas simulaciones ejecutadas en esta máquina.</p>

      <div className="card">
        {jobs.length === 0 ? (
          <div className="empty">Todavía no has lanzado ninguna simulación.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Simulación</th>
                <th>Personaje</th>
                <th className="num">Perfiles</th>
                <th>Estado</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <Link to={`/sims/${job.id}`}>{job.label}</Link>
                  </td>
                  <td style={{ color: 'var(--ink-2)' }}>{job.characterName}</td>
                  <td className="num">{job.profilesetCount ?? 1}</td>
                  <td>
                    <span className={STATUS_CLASS[job.status]}>
                      {STATUS_LABEL[job.status]}
                    </span>
                  </td>
                  <td style={{ color: 'var(--ink-muted)' }}>
                    {new Date(job.createdAt).toLocaleString('es-ES')}
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
