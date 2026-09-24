import Fastify from 'fastify';
import staticPlugin from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Inventory } from './config.js';
import type { Store } from './db.js';

export async function createApp(
  inventory: Inventory,
  store: Store,
  nextCheck: () => number | null,
  logger = false,
) {
  const app = Fastify({ logger, requestTimeout: 10_000, bodyLimit: 1024 });
  app.addHook('onSend', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Frame-Options', 'DENY');
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'",
    );
  });
  let cache: { until: number; value: ReturnType<Store['dashboard']> } | undefined;
  app.get('/api/status', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!cache || Date.now() > cache.until)
      cache = { until: Date.now() + 2000, value: store.dashboard(inventory, nextCheck()) };
    return cache.value;
  });
  app.get('/api/health', async () => ({ status: 'ok' }));
  const client = resolve('dist/client');
  if (existsSync(client)) await app.register(staticPlugin, { root: client });
  return app;
}
