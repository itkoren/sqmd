import { beforeAll, describe, expect, it, vi } from 'vitest';

// Mock heavy dependencies
vi.mock('../../src/embeddings/transformers.js', () => ({
  TransformersEmbedder: class {
    modelName = 'mock-model';
    vectorDim = 768;
    async embed(texts: string[]) {
      return texts.map(() => Array.from({ length: 768 }, () => 0.1));
    }
  },
}));

vi.mock('../../src/store/reader.js', () => ({
  vectorSearch: vi.fn().mockResolvedValue([]),
  ftsSearch: vi.fn().mockResolvedValue([]),
  getFileChunks: vi.fn().mockResolvedValue([]),
  getAllFiles: vi.fn().mockResolvedValue([]),
  getFileById: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/store/db.js', () => ({
  getDb: vi.fn().mockResolvedValue({
    tableNames: vi.fn().mockResolvedValue([]),
    openTable: vi.fn(),
    createEmptyTable: vi.fn().mockResolvedValue({
      add: vi.fn(),
      delete: vi.fn(),
      query: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([]),
      }),
      vectorSearch: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([]),
      }),
      search: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([]),
      }),
      countRows: vi.fn().mockResolvedValue(0),
    }),
  }),
  getChunksTable: vi.fn().mockResolvedValue({
    add: vi.fn(),
    delete: vi.fn(),
    query: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    }),
    vectorSearch: vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    }),
    search: vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    }),
    countRows: vi.fn().mockResolvedValue(0),
  }),
  getFilesTable: vi.fn().mockResolvedValue({
    add: vi.fn(),
    delete: vi.fn(),
    query: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    }),
    countRows: vi.fn().mockResolvedValue(0),
  }),
  getDbStats: vi.fn().mockResolvedValue({ fileCount: 0, chunkCount: 0 }),
  createIndexes: vi.fn().mockResolvedValue(undefined),
  closeDb: vi.fn(),
}));

describe('API Integration', () => {
  let app: ReturnType<typeof import('../../src/api/app.js').createApp> extends Promise<infer T>
    ? T
    : ReturnType<typeof import('../../src/api/app.js').createApp>;
  let mockDb: Record<string, unknown>;

  beforeAll(async () => {
    const { createApp } = await import('../../src/api/app.js');
    const { TransformersEmbedder } = await import('../../src/embeddings/transformers.js');
    const { getDb } = await import('../../src/store/db.js');
    const { loadConfig } = await import('../../src/config/loader.js');

    mockDb = (await getDb('/tmp/test-db')) as Record<string, unknown>;
    const embedder = new TransformersEmbedder('mock', '/tmp');
    const config = loadConfig();

    app = createApp({
      db: mockDb as Parameters<typeof createApp>[0]['db'],
      embedder,
      config,
      watcherStatus: { running: false },
    });
  });

  describe('GET /api/v1/health', () => {
    it('should return 200 with health status', async () => {
      const req = new Request('http://localhost/api/v1/health');
      const res = await app.fetch(req);

      expect(res.status).toBe(200);

      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('status');
      expect(body.status).toBe('ok');
      expect(body).toHaveProperty('uptime_seconds');
      expect(body).toHaveProperty('db');
      expect(body).toHaveProperty('watcher');
    });
  });

  describe('POST /api/v1/search', () => {
    it('should return 200 with search results for valid query', async () => {
      const req = new Request('http://localhost/api/v1/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'test query' }),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(200);

      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('results');
      expect(body).toHaveProperty('query');
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('duration_ms');
      expect(Array.isArray(body.results)).toBe(true);
    });

    it('should return 400 for missing query', async () => {
      const req = new Request('http://localhost/api/v1/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid JSON', async () => {
      const req = new Request('http://localhost/api/v1/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/search', () => {
    it('should return 200 with results for valid query param', async () => {
      const req = new Request('http://localhost/api/v1/search?q=test');
      const res = await app.fetch(req);

      expect(res.status).toBe(200);

      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('results');
      expect(body.query).toBe('test');
    });

    it('should return 400 when query param is missing', async () => {
      const req = new Request('http://localhost/api/v1/search');
      const res = await app.fetch(req);

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/documents', () => {
    it('should return 200 with document list', async () => {
      const req = new Request('http://localhost/api/v1/documents');
      const res = await app.fetch(req);

      expect(res.status).toBe(200);

      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('documents');
      expect(Array.isArray(body.documents)).toBe(true);
      expect(body).toHaveProperty('total');
    });
  });

  describe('GET /api/v1/documents/:fileId', () => {
    it('should return 404 for unknown file id', async () => {
      const req = new Request('http://localhost/api/v1/documents/nonexistent-id');
      const res = await app.fetch(req);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/index/status', () => {
    it('should return 200 with index stats', async () => {
      const req = new Request('http://localhost/api/v1/index/status');
      const res = await app.fetch(req);

      expect(res.status).toBe(200);

      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('db');
    });
  });

  describe('POST /api/v1/index/trigger', () => {
    it('should return 202 accepted', async () => {
      const req = new Request('http://localhost/api/v1/index/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: ['/tmp'], force: false }),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(202);

      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('job_id');
      expect(body.status).toBe('accepted');
    });
  });

  describe('404 handling', () => {
    it('should return 404 for unknown routes', async () => {
      const req = new Request('http://localhost/api/v1/nonexistent');
      const res = await app.fetch(req);

      expect(res.status).toBe(404);
    });
  });
});
