import { describe, expect, it } from 'vitest';
import type { SearchResult } from '../../src/store/schema.js';

// RRF fusion logic extracted for unit testing
function rrfFusion(
  vectorResults: SearchResult[],
  ftsResults: SearchResult[],
  k: number,
  topK: number
): SearchResult[] {
  const scores = new Map<string, number>();
  const chunkMap = new Map<string, SearchResult>();

  vectorResults.forEach((result, rank) => {
    const score = 1 / (k + rank + 1);
    scores.set(result.chunk_id, (scores.get(result.chunk_id) ?? 0) + score);
    chunkMap.set(result.chunk_id, result);
  });

  ftsResults.forEach((result, rank) => {
    const score = 1 / (k + rank + 1);
    scores.set(result.chunk_id, (scores.get(result.chunk_id) ?? 0) + score);
    if (!chunkMap.has(result.chunk_id)) {
      chunkMap.set(result.chunk_id, result);
    }
  });

  const sorted = Array.from(scores.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, topK);

  return sorted.map(([chunkId, score]) => ({
    ...chunkMap.get(chunkId)!,
    score,
  }));
}

function makeResult(chunk_id: string, score = 1.0): SearchResult {
  return {
    chunk_id,
    file_id: 'file1',
    file_path: '/test/file.md',
    file_hash: 'hash',
    file_mtime: 0,
    heading_path: '',
    heading_level: 0,
    heading_text: '',
    section_index: 0,
    chunk_index: 0,
    text: '',
    text_raw: 'content',
    token_count: 10,
    parent_headings: [],
    depth: 0,
    vector: [],
    line_start: 1,
    line_end: 5,
    score,
  };
}

describe('RRF Fusion', () => {
  describe('basic functionality', () => {
    it('should combine results from both lists', () => {
      const vectorResults = [makeResult('chunk1'), makeResult('chunk2')];
      const ftsResults = [makeResult('chunk3'), makeResult('chunk4')];

      const merged = rrfFusion(vectorResults, ftsResults, 60, 4);
      const ids = merged.map((r) => r.chunk_id);

      expect(ids).toContain('chunk1');
      expect(ids).toContain('chunk2');
      expect(ids).toContain('chunk3');
      expect(ids).toContain('chunk4');
    });

    it('should deduplicate results appearing in both lists', () => {
      const vectorResults = [makeResult('chunk1'), makeResult('chunk2'), makeResult('chunk3')];
      const ftsResults = [makeResult('chunk2'), makeResult('chunk4'), makeResult('chunk1')];

      const merged = rrfFusion(vectorResults, ftsResults, 60, 10);
      const ids = merged.map((r) => r.chunk_id);

      // Each chunk_id should appear only once
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should boost results appearing in both lists', () => {
      // chunk1 appears in both vector and fts
      // chunk2 appears only in vector
      const vectorResults = [makeResult('chunk1'), makeResult('chunk2')];
      const ftsResults = [makeResult('chunk1'), makeResult('chunk3')];

      const merged = rrfFusion(vectorResults, ftsResults, 60, 3);

      const chunk1 = merged.find((r) => r.chunk_id === 'chunk1');
      const chunk2 = merged.find((r) => r.chunk_id === 'chunk2');

      expect(chunk1).toBeDefined();
      expect(chunk2).toBeDefined();

      // chunk1 appears in both lists so should have higher score
      expect(chunk1!.score).toBeGreaterThan(chunk2!.score);
    });

    it('should respect topK limit', () => {
      const vectorResults = Array.from({ length: 10 }, (_, i) => makeResult(`chunk${i}`));
      const ftsResults = Array.from({ length: 10 }, (_, i) => makeResult(`fts-chunk${i}`));

      const merged = rrfFusion(vectorResults, ftsResults, 60, 5);
      expect(merged.length).toBeLessThanOrEqual(5);
    });
  });

  describe('RRF score calculation', () => {
    it('should calculate correct RRF score for rank 0', () => {
      // RRF score for rank 0 with k=60: 1/(60+0+1) = 1/61
      const vectorResults = [makeResult('chunk1')];
      const ftsResults: SearchResult[] = [];

      const merged = rrfFusion(vectorResults, ftsResults, 60, 1);
      expect(merged[0]!.score).toBeCloseTo(1 / 61, 6);
    });

    it('should give higher scores to higher-ranked results', () => {
      const vectorResults = [
        makeResult('first-rank'),
        makeResult('second-rank'),
        makeResult('third-rank'),
      ];
      const ftsResults: SearchResult[] = [];

      const merged = rrfFusion(vectorResults, ftsResults, 60, 3);

      expect(merged[0]!.score).toBeGreaterThan(merged[1]!.score);
      expect(merged[1]!.score).toBeGreaterThan(merged[2]!.score);
    });

    it('should use k parameter correctly', () => {
      const vectorResults = [makeResult('chunk1')];
      const ftsResults: SearchResult[] = [];

      const merged10 = rrfFusion(vectorResults, ftsResults, 10, 1);
      const merged60 = rrfFusion(vectorResults, ftsResults, 60, 1);

      // Smaller k means higher scores for top results
      expect(merged10[0]!.score).toBeGreaterThan(merged60[0]!.score);
    });
  });

  describe('edge cases', () => {
    it('should handle empty vector results', () => {
      const ftsResults = [makeResult('chunk1'), makeResult('chunk2')];
      const merged = rrfFusion([], ftsResults, 60, 10);

      expect(merged.length).toBe(2);
    });

    it('should handle empty fts results', () => {
      const vectorResults = [makeResult('chunk1'), makeResult('chunk2')];
      const merged = rrfFusion(vectorResults, [], 60, 10);

      expect(merged.length).toBe(2);
    });

    it('should handle both empty results', () => {
      const merged = rrfFusion([], [], 60, 10);
      expect(merged.length).toBe(0);
    });

    it('should sort results by score descending', () => {
      const vectorResults = [makeResult('a'), makeResult('b'), makeResult('c')];
      const ftsResults = [makeResult('c'), makeResult('b'), makeResult('d')];

      const merged = rrfFusion(vectorResults, ftsResults, 60, 10);

      for (let i = 0; i < merged.length - 1; i++) {
        expect(merged[i]!.score).toBeGreaterThanOrEqual(merged[i + 1]!.score);
      }
    });
  });
});
