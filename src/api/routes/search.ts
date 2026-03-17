import type * as lancedb from '@lancedb/lancedb';
import { Hono } from 'hono';
import type { Config } from '../../config/schema.js';
import type { Embedder } from '../../embeddings/types.js';
import { hybridSearch } from '../../search/hybrid.js';
import { getReranker } from '../../search/reranker.js';
import { getChunksTable } from '../../store/db.js';
import { SearchRequestSchema } from '../models.js';

export function createSearchRouter(db: lancedb.Connection, embedder: Embedder, config: Config) {
  const router = new Hono();

  const handleSearch = async (
    query: string,
    params: {
      top_k?: number;
      mode?: string;
      filter_path?: string;
      include_context?: boolean;
      rerank?: boolean;
    }
  ) => {
    const start = Date.now();

    const chunksTable = await getChunksTable(db);

    const topK = params.top_k ?? config.search.default_top_k;
    const mode = (params.mode as 'hybrid' | 'vector' | 'fts') ?? 'hybrid';

    let results = await hybridSearch(chunksTable, embedder, {
      query,
      topK: params.rerank ? config.search.rerank_top_n : topK,
      mode,
      rrfK: config.search.rrf_k,
      filterPath: params.filter_path,
      modelName: config.embeddings.model,
    });

    // Apply reranking if requested
    if (params.rerank ?? config.search.rerank) {
      const reranker = getReranker(config.search.rerank_model, config.paths.model_cache_dir);
      results = await reranker.rerank(query, results, topK);
    }

    const duration = Date.now() - start;

    return {
      results: results.map((r) => ({
        chunk_id: r.chunk_id,
        file_id: r.file_id,
        file_path: r.file_path,
        heading_path: r.heading_path,
        heading_text: r.heading_text,
        heading_level: r.heading_level,
        section_index: r.section_index,
        chunk_index: r.chunk_index,
        text_raw: r.text_raw,
        token_count: r.token_count,
        score: r.score,
        line_start: r.line_start,
        line_end: r.line_end,
        ...(params.include_context ? { text: r.text } : {}),
      })),
      query,
      total: results.length,
      duration_ms: duration,
    };
  };

  // POST /search
  router.post('/', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const parsed = SearchRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation error', details: parsed.error.issues }, 400);
    }

    const { query, top_k, mode, filter_path, include_context, rerank } = parsed.data;

    try {
      const response = await handleSearch(query, {
        top_k,
        mode,
        filter_path,
        include_context,
        rerank,
      });
      return c.json(response);
    } catch (err) {
      return c.json(
        { error: 'Search failed', message: err instanceof Error ? err.message : String(err) },
        500
      );
    }
  });

  // GET /search?q=...
  router.get('/', async (c) => {
    const q = c.req.query('q');
    if (!q) {
      return c.json({ error: 'Missing query parameter: q' }, 400);
    }

    const top_k = c.req.query('top_k') ? Number.parseInt(c.req.query('top_k')!, 10) : undefined;
    const mode = c.req.query('mode') as 'hybrid' | 'vector' | 'fts' | undefined;
    const filter_path = c.req.query('filter_path');
    const include_context = c.req.query('include_context') === 'true';
    const rerank = c.req.query('rerank') === 'true';

    try {
      const response = await handleSearch(q, {
        top_k,
        mode,
        filter_path,
        include_context,
        rerank,
      });
      return c.json(response);
    } catch (err) {
      return c.json(
        { error: 'Search failed', message: err instanceof Error ? err.message : String(err) },
        500
      );
    }
  });

  return router;
}
