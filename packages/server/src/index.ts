import path from 'node:path';
import fs from 'node:fs';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { ROOT, config, ensureDirs } from './config.js';
import { registerRoutes } from './routes.js';
import { loadItemDb, itemDbStatus } from './data/itemdb.js';
import { getSimcStatus } from './simc/binary.js';

async function main(): Promise<void> {
  ensureDirs();
  loadItemDb();

  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    bodyLimit: 8 * 1024 * 1024, // los perfiles con muchos ítems pesan
  });

  // La interfaz corre en otro puerto durante el desarrollo.
  await app.register(cors, { origin: true });

  await registerRoutes(app);

  // En producción servimos el build de la web desde el propio servidor.
  const webDist = path.join(ROOT, 'packages', 'web', 'dist');
  if (fs.existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api')) {
        return reply.code(404).send({ error: 'Ruta no encontrada.' });
      }
      return reply.sendFile('index.html');
    });
  }

  await app.listen({ port: config.port, host: config.host });

  const simc = await getSimcStatus();
  const items = itemDbStatus();

  app.log.info(
    simc.available
      ? `SimulationCraft ${simc.version} (WoW ${simc.wowVersion}) en ${simc.path}`
      : `SimulationCraft no disponible: ${simc.error}`,
  );
  app.log.info(
    items.available
      ? `Base de ítems: ${items.items} ítems, ${items.consumables} consumibles`
      : 'Base de ítems no generada. Ejecuta `npm run build:itemdb`.',
  );
}

main().catch((err) => {
  console.error('No se pudo arrancar el servidor:', err);
  process.exit(1);
});
