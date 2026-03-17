import { randomUUID } from 'node:crypto';
import type * as lancedb from '@lancedb/lancedb';
import { Hono } from 'hono';
import type { Config } from '../../config/schema.js';
import { IndexPipeline } from '../../ingestion/pipeline.js';
import { getDbStats } from '../../store/db.js';
import { IndexRequestSchema } from '../models.js';

interface Job {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: number;
  completedAt?: number;
  result?: {
    indexed: number;
    skipped: number;
    errors: Array<{ filePath: string; error: string }>;
  };
  error?: string;
}

const jobs = new Map<string, Job>();

export function createIndexRouter(db: lancedb.Connection, config: Config) {
  const router = new Hono();

  // POST /index/trigger — trigger re-index
  router.post('/trigger', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }

    const parsed = IndexRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation error', details: parsed.error.issues }, 400);
    }

    const { paths, force } = parsed.data;
    const resolvedPaths = paths ?? config.paths.watch_dirs;

    const jobId = randomUUID();
    const job: Job = {
      id: jobId,
      status: 'pending',
      startedAt: Date.now(),
    };
    jobs.set(jobId, job);

    // Run indexing asynchronously
    setImmediate(async () => {
      job.status = 'running';
      const pipeline = new IndexPipeline(config);

      try {
        const result = await pipeline.run({
          paths: resolvedPaths,
          force,
        });

        job.status = 'completed';
        job.completedAt = Date.now();
        job.result = result;
      } catch (err) {
        job.status = 'failed';
        job.completedAt = Date.now();
        job.error = err instanceof Error ? err.message : String(err);
      }
    });

    return c.json({ job_id: jobId, status: 'accepted' }, 202);
  });

  // GET /index/status — overall stats
  router.get('/status', async (c) => {
    try {
      const stats = await getDbStats(db);

      // Count recent jobs
      const recentJobs = Array.from(jobs.values())
        .sort((a, b) => b.startedAt - a.startedAt)
        .slice(0, 5);

      return c.json({
        db: stats,
        recent_jobs: recentJobs,
      });
    } catch (err) {
      return c.json(
        {
          error: 'Failed to get status',
          message: err instanceof Error ? err.message : String(err),
        },
        500
      );
    }
  });

  // GET /index/jobs/:jobId — job progress
  router.get('/jobs/:jobId', async (c) => {
    const jobId = c.req.param('jobId');
    const job = jobs.get(jobId);

    if (!job) {
      return c.json({ error: 'Job not found', job_id: jobId }, 404);
    }

    return c.json(job);
  });

  return router;
}
