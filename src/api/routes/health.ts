import type * as lancedb from '@lancedb/lancedb';
import { Hono } from 'hono';
import { getDbStats } from '../../store/db.js';

const startTime = Date.now();

export function createHealthRouter(
  db: lancedb.Connection | null,
  watcherStatus: { running: boolean }
) {
  const router = new Hono();

  router.get('/', async (c) => {
    const uptime = Math.floor((Date.now() - startTime) / 1000);

    let dbStatus = 'disconnected';
    let fileCount = 0;
    let chunkCount = 0;

    if (db) {
      try {
        const stats = await getDbStats(db);
        fileCount = stats.fileCount;
        chunkCount = stats.chunkCount;
        dbStatus = 'connected';
      } catch {
        dbStatus = 'error';
      }
    }

    return c.json({
      status: 'ok',
      uptime_seconds: uptime,
      db: {
        status: dbStatus,
        file_count: fileCount,
        chunk_count: chunkCount,
      },
      watcher: {
        status: watcherStatus.running ? 'running' : 'stopped',
      },
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
