import * as lancedb from '@lancedb/lancedb';
import type { ChunkRecord, FileRecord } from './schema.js';
import { getChunksTable, getFilesTable } from './db.js';

export async function upsertChunks(
  table: lancedb.Table,
  chunks: ChunkRecord[]
): Promise<void> {
  if (chunks.length === 0) return;

  const fileId = chunks[0]!.file_id;

  // Delete existing chunks for this file
  try {
    await table.delete(`file_id = '${fileId}'`);
  } catch {
    // Table may be empty, ignore
  }

  // Insert new chunks
  await table.add(chunks as unknown as Record<string, unknown>[]);
}

export async function upsertFile(
  table: lancedb.Table,
  file: FileRecord
): Promise<void> {
  // Delete existing record for this file
  try {
    await table.delete(`file_id = '${file.file_id}'`);
  } catch {
    // Table may be empty, ignore
  }

  // Insert updated record
  await table.add([file] as unknown as Record<string, unknown>[]);
}

export async function deleteFile(
  db: lancedb.Connection,
  fileId: string
): Promise<void> {
  const chunksTable = await getChunksTable(db);
  const filesTable = await getFilesTable(db);

  try {
    await chunksTable.delete(`file_id = '${fileId}'`);
  } catch {
    // May not exist
  }

  try {
    await filesTable.delete(`file_id = '${fileId}'`);
  } catch {
    // May not exist
  }
}
