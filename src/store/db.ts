import * as lancedb from '@lancedb/lancedb';
import * as fs from 'node:fs';
import { CHUNKS_SCHEMA, FILES_SCHEMA } from './schema.js';

const CHUNKS_TABLE = 'chunks';
const FILES_TABLE = 'files';

let connectionCache: Map<string, lancedb.Connection> = new Map();

export async function getDb(dbPath: string): Promise<lancedb.Connection> {
  if (connectionCache.has(dbPath)) {
    return connectionCache.get(dbPath)!;
  }

  if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath, { recursive: true });
  }

  const db = await lancedb.connect(dbPath);
  connectionCache.set(dbPath, db);
  return db;
}

export function closeDb(dbPath: string): void {
  connectionCache.delete(dbPath);
}

export async function getChunksTable(db: lancedb.Connection): Promise<lancedb.Table> {
  const tableNames = await db.tableNames();

  if (tableNames.includes(CHUNKS_TABLE)) {
    return await db.openTable(CHUNKS_TABLE);
  }

  // Create table with schema using empty initial data
  const table = await db.createEmptyTable(CHUNKS_TABLE, CHUNKS_SCHEMA);
  return table;
}

export async function getFilesTable(db: lancedb.Connection): Promise<lancedb.Table> {
  const tableNames = await db.tableNames();

  if (tableNames.includes(FILES_TABLE)) {
    return await db.openTable(FILES_TABLE);
  }

  const table = await db.createEmptyTable(FILES_TABLE, FILES_SCHEMA);
  return table;
}

export async function createIndexes(db: lancedb.Connection): Promise<void> {
  try {
    const chunksTable = await getChunksTable(db);

    // Check row count before creating index (need enough rows for IVF-PQ)
    const stats = await chunksTable.countRows();
    if (stats < 256) {
      return; // Not enough data for index
    }

    // Create IVF-PQ vector index
    await chunksTable.createIndex('vector', {
      config: lancedb.Index.ivfPq({
        numPartitions: Math.min(256, Math.floor(stats / 10)),
        numSubVectors: 96,
      }),
    });

    // Create FTS index on text field
    await chunksTable.createIndex('text', {
      config: lancedb.Index.fts(),
    });
  } catch (err) {
    // Index creation may fail if already exists or data is insufficient
    console.warn('Index creation warning:', err instanceof Error ? err.message : String(err));
  }
}

export async function getDbStats(
  db: lancedb.Connection
): Promise<{ fileCount: number; chunkCount: number }> {
  try {
    const chunksTable = await getChunksTable(db);
    const filesTable = await getFilesTable(db);

    const chunkCount = await chunksTable.countRows();
    const fileCount = await filesTable.countRows();

    return { fileCount, chunkCount };
  } catch {
    return { fileCount: 0, chunkCount: 0 };
  }
}
