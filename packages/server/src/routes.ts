import type { FastifyInstance } from 'fastify';
import {
  DEFAULT_SIM_OPTIONS,
  FIGHT_STYLES,
  validateCustomItem,
  type Character,
  type GearItem,
  type ItemSearchQuery,
  type ServerMeta,
  type SimRequest,
} from '@rbl/shared';
import { config } from './config.js';
import { getSimcStatus, invalidateSimcCache } from './simc/binary.js';
import { parseSimcProfile, sanitizeProfile, toCharacter } from './simc/import.js';
import { readArtifactTraits } from './simc/artifact.js';
import {
  getConsumables,
  itemDbStatus,
  loadItemDb,
  searchItems,
  slotsForItem,
} from './data/itemdb.js';
import {
  getPhase,
  getPhaseGear,
  listPhases,
  loadPatches,
  patchDbStatus,
} from './data/patches.js';
import { getEnhancements, loadEnhancements } from './data/enhancements.js';
import { clearMedia, getItemMedia, loadMedia, mediaStatus } from './data/media.js';
import { planSim, queue } from './queue.js';
import {
  deleteCharacter,
  getCharacter,
  getJob,
  getResult,
  listCharacters,
  listJobs,
  newId,
  saveCharacter,
  secondsPerProfile,
} from './store.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // Estado y metadatos
  // -------------------------------------------------------------------------

  app.get('/api/meta', async (): Promise<ServerMeta> => {
    const simc = await getSimcStatus();
    return {
      simc,
      itemDb: itemDbStatus(),
      patches: listPhases(),
      fightStyles: FIGHT_STYLES,
      defaults: { ...DEFAULT_SIM_OPTIONS, threads: config.cpuCount },
      cpuCount: config.cpuCount,
      secondsPerProfile: secondsPerProfile(),
    };
  });

  app.post('/api/meta/refresh', async () => {
    invalidateSimcCache();
    loadItemDb();
    loadPatches();
    loadEnhancements();
    loadMedia();
    return {
      simc: await getSimcStatus(true),
      itemDb: itemDbStatus(),
      patches: patchDbStatus(),
    };
  });

  // -------------------------------------------------------------------------
  // Fases de contenido
  // -------------------------------------------------------------------------

  app.get('/api/patches', async () => listPhases());

  app.get<{ Params: { id: string } }>('/api/patches/:id', async (req, reply) => {
    const phase = getPhase(req.params.id);
    if (!phase) return reply.code(404).send({ error: 'Fase no encontrada.' });
    const { specs, ...rest } = phase;
    return { ...rest, specs: Object.keys(specs ?? {}) };
  });

  /** Equipo de referencia de una spec en una fase. */
  app.get<{
    Params: { id: string };
    Querystring: { class?: string; spec?: string };
  }>('/api/patches/:id/gear', async (req, reply) => {
    const { class: className, spec } = req.query;
    if (!className || !spec) {
      return reply.code(400).send({ error: 'Faltan los parámetros class y spec.' });
    }
    const gear = getPhaseGear(req.params.id, className, spec);
    if (!gear) {
      return reply.code(404).send({
        error:
          `No hay equipo de referencia para ${className} ${spec} en esa fase. ` +
          'SimulationCraft no trae perfil de esa spec para ese tier.',
      });
    }
    return gear;
  });

  app.get('/api/consumables', async () => getConsumables());

  app.get('/api/enhancements', async () => getEnhancements());

  // -------------------------------------------------------------------------
  // Personajes
  // -------------------------------------------------------------------------

  app.get('/api/characters', async () => listCharacters());

  app.get<{ Params: { id: string } }>('/api/characters/:id', async (req, reply) => {
    const character = getCharacter(req.params.id);
    if (!character) return reply.code(404).send({ error: 'Personaje no encontrado.' });
    return character;
  });

  app.post<{ Body: { simc: string } }>('/api/characters/import', async (req, reply) => {
    const input = req.body?.simc;
    if (typeof input !== 'string' || input.trim().length < 10) {
      return reply
        .code(400)
        .send({ error: 'Pega la salida del addon SimulationCraft.' });
    }

    try {
      const parsed = parseSimcProfile(input);
      const character = toCharacter(parsed, newId());
      saveCharacter(character);
      return { character, warnings: parsed.warnings };
    } catch (err) {
      return reply
        .code(400)
        .send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.put<{ Params: { id: string }; Body: Partial<Character> }>(
    '/api/characters/:id',
    async (req, reply) => {
      const existing = getCharacter(req.params.id);
      if (!existing) return reply.code(404).send({ error: 'Personaje no encontrado.' });

      const patch = req.body ?? {};
      const next: Character = { ...existing, ...patch, id: existing.id };

      if (typeof patch.profile === 'string') {
        const { profile } = sanitizeProfile(patch.profile);
        next.profile = profile;
      }

      return saveCharacter(next);
    },
  );

  app.put<{ Params: { id: string }; Body: { bag: GearItem[] } }>(
    '/api/characters/:id/bag',
    async (req, reply) => {
      const existing = getCharacter(req.params.id);
      if (!existing) return reply.code(404).send({ error: 'Personaje no encontrado.' });

      const bag = Array.isArray(req.body?.bag) ? req.body.bag : [];

      // Las cadenas de un ítem descrito a mano acaban dentro de una línea de un
      // perfil que se ejecuta, así que se validan aquí y no solo en el
      // formulario: el endpoint es público dentro de la máquina.
      for (const item of bag) {
        if (!item.custom) continue;
        const errors = validateCustomItem(item.custom);
        if (errors.length > 0) {
          return reply.code(400).send({
            error: `"${item.name ?? `Ítem ${item.itemId}`}": ${errors.join(' ')}`,
          });
        }
      }

      // Rellenamos los slots posibles desde la base de datos de ítems.
      const normalized = bag.map((item) => ({
        ...item,
        bonusIds: item.bonusIds ?? [],
        gemIds: item.gemIds ?? [],
        relicIds: item.relicIds ?? [],
        custom: item.custom
          ? {
              stats: item.custom.stats.trim(),
              use: item.custom.use?.trim() || undefined,
              equip: item.custom.equip?.trim() || undefined,
            }
          : undefined,
      }));

      return saveCharacter({ ...existing, bag: normalized });
    },
  );

  /**
   * Lee los rasgos del artefacto preguntándoselos al motor y los cachea en el
   * personaje. Es una simulación de una sola iteración: tarda menos de un
   * segundo y evita que la app tenga que mantener su propia copia de la DBC de
   * artefactos.
   */
  app.post<{ Params: { id: string } }>(
    '/api/characters/:id/artifact',
    async (req, reply) => {
      const character = getCharacter(req.params.id);
      if (!character) return reply.code(404).send({ error: 'Personaje no encontrado.' });

      const simc = await getSimcStatus();
      if (!simc.available) return reply.code(503).send({ error: simc.error });

      try {
        const probe = await readArtifactTraits(character);
        const updated = saveCharacter({
          ...character,
          artifactTraits: probe.traits,
          artifactReadAt: new Date().toISOString(),
          weaponIlevel: probe.weaponIlevel,
          estimatedRelicIlevel: probe.estimatedRelicIlevel,
        });
        return { character: updated, ...probe };
      } catch (err) {
        return reply
          .code(400)
          .send({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  );

  app.delete<{ Params: { id: string } }>('/api/characters/:id', async (req, reply) => {
    if (!deleteCharacter(req.params.id)) {
      return reply.code(404).send({ error: 'Personaje no encontrado.' });
    }
    return { ok: true };
  });

  // -------------------------------------------------------------------------
  // Ítems
  // -------------------------------------------------------------------------

  app.get<{ Querystring: ItemSearchQuery }>('/api/items', async (req) => {
    const q = req.query;
    return searchItems({
      q: q.q,
      slot: q.slot,
      minIlevel: q.minIlevel ? Number(q.minIlevel) : undefined,
      maxIlevel: q.maxIlevel ? Number(q.maxIlevel) : undefined,
      quality: q.quality !== undefined ? Number(q.quality) : undefined,
      limit: q.limit ? Number(q.limit) : undefined,
      class: q.class,
      patch: q.patch,
      patchOnly: String(q.patchOnly) === 'true',
      includeLaterTiers: String(q.includeLaterTiers) === 'true',
    });
  });

  app.get<{ Params: { id: string } }>('/api/items/:id/slots', async (req) => ({
    slots: slotsForItem(Number(req.params.id)),
  }));

  /**
   * Nombre e icono de varios ítems a la vez. La interfaz pide de golpe los que
   * tiene en pantalla en vez de uno por uno.
   */
  app.get<{ Querystring: { ids?: string } }>('/api/items/media', async (req) => {
    const ids = (req.query.ids ?? '')
      .split(',')
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isFinite(value) && value > 0)
      .slice(0, 200);
    return getItemMedia(ids);
  });

  app.get('/api/items/media/status', async () => mediaStatus());

  app.post('/api/items/media/clear', async () => {
    clearMedia();
    return { ok: true };
  });

  // -------------------------------------------------------------------------
  // Simulaciones
  // -------------------------------------------------------------------------

  app.post<{ Body: SimRequest }>('/api/sims/plan', async (req, reply) => {
    try {
      return planSim(req.body);
    } catch (err) {
      return reply
        .code(400)
        .send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post<{ Body: SimRequest }>('/api/sims', async (req, reply) => {
    const simc = await getSimcStatus();
    if (!simc.available) {
      return reply.code(503).send({ error: simc.error });
    }
    try {
      return queue.enqueue(req.body);
    } catch (err) {
      return reply
        .code(400)
        .send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/jobs', async () => listJobs());

  app.get<{ Params: { id: string } }>('/api/jobs/:id', async (req, reply) => {
    const job = getJob(req.params.id);
    if (!job) return reply.code(404).send({ error: 'Trabajo no encontrado.' });
    return { job, log: queue.getLog(job.id) };
  });

  app.post<{ Params: { id: string } }>('/api/jobs/:id/cancel', async (req, reply) => {
    if (!queue.cancel(req.params.id)) {
      return reply.code(400).send({ error: 'El trabajo no se puede cancelar.' });
    }
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>('/api/results/:id', async (req, reply) => {
    const result = getResult(req.params.id);
    if (!result) return reply.code(404).send({ error: 'Resultado no encontrado.' });
    return result;
  });

  // -------------------------------------------------------------------------
  // Progreso en vivo (Server-Sent Events)
  // -------------------------------------------------------------------------

  app.get<{ Params: { id: string } }>('/api/jobs/:id/events', (req, reply) => {
    const jobId = req.params.id;

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const current = getJob(jobId);
    if (current) send('job', current);

    const onJob = (job: { id: string }) => {
      if (job.id === jobId) send('job', job);
    };
    const onLog = (entry: { jobId: string; line: string }) => {
      if (entry.jobId === jobId) send('log', entry);
    };

    queue.on('job', onJob);
    queue.on('log', onLog);

    // Latido para que los proxies no corten la conexión.
    const heartbeat = setInterval(() => reply.raw.write(': ping\n\n'), 15_000);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      queue.off('job', onJob);
      queue.off('log', onLog);
    });
  });
}
