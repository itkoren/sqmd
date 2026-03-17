import * as lancedb from '@lancedb/lancedb';
import type { ChunkRecord, FileRecord, SearchResult } from './schema.js';

export async function vectorSearch(
  table: lancedb.Table,
  vector: number[],
  topK: number,
  filter?: string
): Promise<SearchResult[]> {
  try {
    let query = table.vectorSearch(vector).limit(topK);

    if (filter) {
      query = query.where(filter);
    }

    const results = await query.toArray();
    return results.map((row: Record<string, unknown>, idx: number) => ({
      ...rowToChunkRecord(row),
      score: typeof row['_distance'] === 'number' ? 1 - row['_distance'] : 1 / (1 + idx),
      rank: idx + 1,
    }));
  } catch (err) {
    console.warn('Vector search error:', err instanceof Error ? err.message : String(err));
    return [];
  }
}

export async function ftsSearch(
  table: lancedb.Table,
  query: string,
  topK: number,
  filter?: string
): Promise<SearchResult[]> {
  try {
    let searchQuery = table.search(query, 'text').limit(topK);

    if (filter) {
      searchQuery = searchQuery.where(filter);
    }

    const results = await searchQuery.toArray();
    return results.map((row: Record<string, unknown>, idx: number) => ({
      ...rowToChunkRecord(row),
      score: typeof row['_score'] === 'number' ? row['_score'] : 1 / (1 + idx),
      rank: idx + 1,
    }));
  } catch (err) {
    console.warn('FTS search error:', err instanceof Error ? err.message : String(err));
    return [];
  }
}

export async function getFileChunks(
  table: lancedb.Table,
  fileId: string
): Promise<ChunkRecord[]> {
  try {
    const results = await table
      .query()
      .where(`file_id = '${fileId}'`)
      .toArray();

    return results.map(rowToChunkRecord);
  } catch {
    return [];
  }
}

export async function getAllFiles(table: lancedb.Table): Promise<FileRecord[]> {
  try {
    const results = await table.query().toArray();
    return results.map(rowToFileRecord);
  } catch {
    return [];
  }
}

export async function getFileById(
  table: lancedb.Table,
  fileId: string
): Promise<FileRecord | null> {
  try {
    const results = await table
      .query()
      .where(`file_id = '${fileId}'`)
      .limit(1)
      .toArray();

    if (results.length === 0) return null;
    return rowToFileRecord(results[0]!);
  } catch {
    return null;
  }
}

function rowToChunkRecord(row: Record<string, unknown>): ChunkRecord {
  let parentHeadings: string[] = [];
  const ph = row['parent_headings'];
  if (Array.isArray(ph)) {
    parentHeadings = ph.filter((x): x is string => typeof x === 'string');
  } else if (ph && typeof ph === 'object' && 'toArray' in ph) {
    parentHeadings = (ph as { toArray(): unknown[] }).toArray().filter((x): x is string => typeof x === 'string');
  }

  let vector: number[] = [];
  const v = row['vector'];
  if (v instanceof Float32Array || v instanceof Float64Array) {
    vector = Array.from(v);
  } else if (Array.isArray(v)) {
    vector = v as number[];
  }

  return {
    chunk_id: String(row['chunk_id'] ?? ''),
    file_id: String(row['file_id'] ?? ''),
    file_path: String(row['file_path'] ?? ''),
    file_hash: String(row['file_hash'] ?? ''),
    file_mtime: Number(row['file_mtime'] ?? 0),
    heading_path: String(row['heading_path'] ?? ''),
    heading_level: Number(row['heading_level'] ?? 0),
    heading_text: String(row['heading_text'] ?? ''),
    section_index: Number(row['section_index'] ?? 0),
    chunk_index: Number(row['chunk_index'] ?? 0),
    text: String(row['text'] ?? ''),
    text_raw: String(row['text_raw'] ?? ''),
    token_count: Number(row['token_count'] ?? 0),
    parent_headings: parentHeadings,
    depth: Number(row['depth'] ?? 0),
    vector,
    line_start: Number(row['line_start'] ?? 0),
    line_end: Number(row['line_end'] ?? 0),
  };
}

function rowToFileRecord(row: Record<string, unknown>): FileRecord {
  const status = String(row['status'] ?? 'skipped');
  const validStatus = ['indexed', 'error', 'skipped'].includes(status)
    ? (status as 'indexed' | 'error' | 'skipped')
    : 'skipped';

  return {
    file_id: String(row['file_id'] ?? ''),
    file_path: String(row['file_path'] ?? ''),
    file_hash: String(row['file_hash'] ?? ''),
    file_mtime: Number(row['file_mtime'] ?? 0),
    chunk_count: Number(row['chunk_count'] ?? 0),
    indexed_at: Number(row['indexed_at'] ?? 0),
    status: validStatus,
    error_msg: String(row['error_msg'] ?? ''),
  };
}
