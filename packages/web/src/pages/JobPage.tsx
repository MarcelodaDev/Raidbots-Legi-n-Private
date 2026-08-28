import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Job, SimResult } from '@rbl/shared';
import { api, subscribeToJob } from '../api.js';
import { ResultsView } from '../components/ResultsView.js';

export function JobPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<SimResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!jobId) return;

    api
      .job(jobId)
      .then(({ job: current, log: lines }) => {
        setJob(current);
        setLog(lines);
      })
      .catch((err: Error) => setError(err.message));

    return subscribeToJob(jobId, {
      onJob: setJob,
      onLog: (line) => setLog((prev) => [...prev.slice(-400), line]),
    });
  }, [jobId]);

  // Al terminar, cargamos el resultado completo.
  useEffect(() => {
    if (!jobId || job?.status !== 'done') return;
    api.result(jobId).then(setResult).catch((err: Error) => setError(err.message));
  }, [jobId, job?.status]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  if (error) return <div className="notice error">{error}</div>;
  if (!job) return <div className="empty">Cargando…</div>;

  const running = job.status === 'queued' || job.status === 'running';

  return (
    <>
      <h1 className="page-title">{job.label}</h1>
      <p className="page-subtitle">
        <Link to={`/personajes/${job.characterId}`}>{job.characterName}</Link>
        {job.profilesetCount
          ? ` · ${job.profilesetCount.toLocaleString('es-ES')} ${
              job.profilesetCount === 1 ? 'opción comparada' : 'opciones comparadas'
            }`
          : ''}
      </p>

      {running && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              <span className="spinner" />
              <span>{job.phase}</span>
            </div>
            <button className="danger small" onClick={() => api.cancelJob(job.id)}>
              Cancelar
            </button>
          </div>
          <div className="progress" style={{ marginTop: 14 }}>
            <div style={{ width: `${job.progress}%` }} />
          </div>
        </div>
      )}

      {job.status === 'error' && (
        <div className="notice error">
          <strong>La simulación falló.</strong>
          <pre style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0', fontSize: 12.5 }}>
            {job.error}
          </pre>
        </div>
      )}

      {job.status === 'cancelled' && <div className="notice">Simulación cancelada.</div>}

      {result && <ResultsView result={result} />}

      {log.length > 0 && (
        <div className="card">
          <h2>Salida de SimulationCraft</h2>
          <div className="log" ref={logRef}>
            {log.join('\n')}
          </div>
        </div>
      )}
    </>
  );
}
