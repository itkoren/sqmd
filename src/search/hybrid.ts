import type * as lancedb from '@lancedb/lancedb';
import type { Embedder } from '../embeddings/types.js';
import { ftsSearch, vectorSearch } from '../store/reader.js';
import type { SearchResult } from '../store/schema.js';
import { prepareQueryForEmbedding } from './query.js';

export type SearchMode = 'hybrid' | 'vector' | 'fts';

export interface HybridSearchOptions {
  query: string;
  topK: number;
  mode: SearchMode;
  rrfK: number;
  filterPath?: string;
  modelName?: string;
}

function buildFilter(filterPath?: string): string | undefined {
  if (!filterPath) return undefined;
  // Escape single quotes in path
  const escaped = filterPath.replace(/'/g, "\\'");
  return `file_path LIKE '%${escaped}%'`;
}

function rrfFusion(
  vectorResults: SearchResult[],
  ftsResults: SearchResult[],
  k: number,
  topK: number
): SearchResult[] {
  const scores = new Map<string, number>();
  const chunkMap = new Map<string, SearchResult>();

  // Score from vector search
  vectorResults.forEach((result, rank) => {
    const score = 1 / (k + rank + 1);
    scores.set(result.chunk_id, (scores.get(result.chunk_id) ?? 0) + score);
    chunkMap.set(result.chunk_id, result);
  });

  // Score from FTS search
  ftsResults.forEach((result, rank) => {
    const score = 1 / (k + rank + 1);
    scores.set(result.chunk_id, (scores.get(result.chunk_id) ?? 0) + score);
    if (!chunkMap.has(result.chunk_id)) {
      chunkMap.set(result.chunk_id, result);
    }
  });

  // Sort by RRF score
  const sorted = Array.from(scores.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, topK);

  return sorted.map(([chunkId, score]) => ({
    ...chunkMap.get(chunkId)!,
    score,
  }));
}

export async function hybridSearch(
  chunksTable: lancedb.Table,
  embedder: Embedder,
  options: HybridSearchOptions
): Promise<SearchResult[]> {
  const { query, topK, mode, rrfK, filterPath, modelName = '' } = options;

  const preparedQuery = prepareQueryForEmbedding(query, modelName);
  const filter = buildFilter(filterPath);

  const candidateK = topK * 3;

  if (mode === 'vector') {
    const embedding = await embedder.embed([preparedQuery]);
    const vec = embedding[0]!;
    return vectorSearch(chunksTable, vec, topK, filter);
  }

  if (mode === 'fts') {
    return ftsSearch(chunksTable, query, topK, filter);
  }

  // Hybrid: run both in parallel
  const embedding = await embedder.embed([preparedQuery]);
  const vec = embedding[0]!;

  const [vectorResults, ftsResults] = await Promise.all([
    vectorSearch(chunksTable, vec, candidateK, filter),
    ftsSearch(chunksTable, query, candidateK, filter),
  ]);

  return rrfFusion(vectorResults, ftsResults, rrfK, topK);
}
