import type * as lancedb from '@lancedb/lancedb';
import { Hono } from 'hono';
import type { Config } from '../config/schema.js';
import type { Embedder } from '../embeddings/types.js';
import { corsMiddleware, createApiKeyMiddleware, requestLogger } from './middleware.js';
import { createDocumentsRouter } from './routes/documents.js';
import { createHealthRouter } from './routes/health.js';
import { createIndexRouter } from './routes/index.js';
import { createSearchRouter } from './routes/search.js';

export interface AppState {
  db: lancedb.Connection;
  embedder: Embedder;
  config: Config;
  watcherStatus: { running: boolean };
}

export function createApp(state: AppState): Hono {
  const app = new Hono();

  const { db, embedder, config, watcherStatus } = state;

  // Global middleware
  app.use('*', corsMiddleware());
  app.use('*', requestLogger());
  app.use('/api/*', createApiKeyMiddleware(config.api.api_key));

  // Mount routers under /api/v1
  app.route('/api/v1/health', createHealthRouter(db, watcherStatus));
  app.route('/api/v1/search', createSearchRouter(db, embedder, config));
  app.route('/api/v1/documents', createDocumentsRouter(db));
  app.route('/api/v1/index', createIndexRouter(db, config));

  // Root redirect
  app.get('/', (c) => c.redirect('/api/v1/health'));

  // 404 handler
  app.notFound((c) => {
    return c.json({ error: 'Not found', path: new URL(c.req.url).pathname }, 404);
  });

  // Error handler
  app.onError((err, c) => {
    console.error('Unhandled error:', err);
    return c.json({ error: 'Internal server error', message: err.message }, 500);
  });

  return app;
}
