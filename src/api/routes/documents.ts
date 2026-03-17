import { Hono } from 'hono';
import * as fs from 'node:fs';
import type * as lancedb from '@lancedb/lancedb';
import { getChunksTable, getFilesTable } from '../../store/db.js';
import { getAllFiles, getFileById, getFileChunks } from '../../store/reader.js';

export function createDocumentsRouter(db: lancedb.Connection) {
  const router = new Hono();

  // GET /documents — paginated list of indexed files
  router.get('/', async (c) => {
    const page = parseInt(c.req.query('page') ?? '0', 10);
    const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 100);
    const pathPrefix = c.req.query('path_prefix');

    try {
      const filesTable = await getFilesTable(db);
      let files = await getAllFiles(filesTable);

      if (pathPrefix) {
        files = files.filter((f) => f.file_path.startsWith(pathPrefix));
      }

      const total = files.length;
      const paginated = files.slice(page * limit, (page + 1) * limit);

      return c.json({
        documents: paginated,
        total,
        page,
        limit,
      });
    } catch (err) {
      return c.json(
        { error: 'Failed to list documents', message: err instanceof Error ? err.message : String(err) },
        500
      );
    }
  });

  // GET /documents/:fileId — file metadata + chunks
  router.get('/:fileId', async (c) => {
    const fileId = c.req.param('fileId');

    try {
      const filesTable = await getFilesTable(db);
      const chunksTable = await getChunksTable(db);

      const file = await getFileById(filesTable, fileId);
      if (!file) {
        return c.json({ error: 'File not found', file_id: fileId }, 404);
      }

      const chunks = await getFileChunks(chunksTable, fileId);

      return c.json({
        file,
        chunks: chunks.map((chunk) => ({
          chunk_id: chunk.chunk_id,
          heading_path: chunk.heading_path,
          heading_text: chunk.heading_text,
          heading_level: chunk.heading_level,
          section_index: chunk.section_index,
          chunk_index: chunk.chunk_index,
          text_raw: chunk.text_raw,
          token_count: chunk.token_count,
          line_start: chunk.line_start,
          line_end: chunk.line_end,
        })),
      });
    } catch (err) {
      return c.json(
        { error: 'Failed to get document', message: err instanceof Error ? err.message : String(err) },
        500
      );
    }
  });

  // GET /documents/:fileId/raw — raw MD content
  router.get('/:fileId/raw', async (c) => {
    const fileId = c.req.param('fileId');

    try {
      const filesTable = await getFilesTable(db);
      const file = await getFileById(filesTable, fileId);

      if (!file) {
        return c.json({ error: 'File not found', file_id: fileId }, 404);
      }

      if (!fs.existsSync(file.file_path)) {
        return c.json({ error: 'File no longer exists on disk', file_path: file.file_path }, 404);
      }

      const content = fs.readFileSync(file.file_path, 'utf-8');
      return c.text(content, 200, { 'Content-Type': 'text/markdown; charset=utf-8' });
    } catch (err) {
      return c.json(
        { error: 'Failed to read document', message: err instanceof Error ? err.message : String(err) },
        500
      );
    }
  });

  return router;
}
