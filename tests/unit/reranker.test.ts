import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchResult } from '../../src/store/schema.js';

vi.mock('@huggingface/transformers', () => ({
  pipeline: vi
    .fn()
    .mockResolvedValue((pairs: Array<[string, string]>) =>
      Promise.resolve(pairs.map((_, i) => ({ score: 1.0 - i * 0.1 })))
    ),
  env: { cacheDir: '' },
}));

// Import after mock to ensure the mock is in place for the dynamic import
const { CrossEncoderReranker, getReranker } = await import('../../src/search/reranker.js');

function makeResult(text: string, score = 0.5): SearchResult {
  return {
    chunk_id: 'hash:0:0',
    file_id: 'file-1',
    file_path: '/path/doc.md',
    file_hash: 'abc123',
    file_mtime: 1000000,
    heading_path: 'Section',
    heading_level: 1,
    heading_text: 'Section',
    section_index: 0,
    chunk_index: 0,
    text: text,
    text_raw: text,
    token_count: 10,
    parent_headings: [],
    depth: 1,
    vector: [],
    line_start: 1,
    line_end: 5,
    score,
  };
}

describe('CrossEncoderReranker', () => {
  describe('rerank', () => {
    it('should return empty array for empty results', async () => {
      const reranker = new CrossEncoderReranker('cross-encoder/ms-marco-MiniLM-L-6-v2', '/tmp');
      const result = await reranker.rerank('query', [], 5);
      expect(result).toEqual([]);
    });

    it('should return at most topN results', async () => {
      const reranker = new CrossEncoderReranker('cross-encoder/ms-marco-MiniLM-L-6-v2', '/tmp');
      const results = [
        makeResult('text one'),
        makeResult('text two'),
        makeResult('text three'),
        makeResult('text four'),
      ];
      const reranked = await reranker.rerank('query', results, 2);
      expect(reranked.length).toBeLessThanOrEqual(2);
    });

    it('should sort results descending by score', async () => {
      const reranker = new CrossEncoderReranker('cross-encoder/ms-marco-MiniLM-L-6-v2', '/tmp');
      const results = [makeResult('first'), makeResult('second'), makeResult('third')];
      const reranked = await reranker.rerank('query', results, 3);
      for (let i = 1; i < reranked.length; i++) {
        expect(reranked[i - 1]!.score).toBeGreaterThanOrEqual(reranked[i]!.score);
      }
    });
  });
});

describe('getReranker', () => {
  beforeEach(() => {
    // Reset the module-level singleton by calling with a unique model name each test
  });

  it('should return the same instance for the same model name', () => {
    const r1 = getReranker('model-a', '/tmp');
    const r2 = getReranker('model-a', '/tmp');
    expect(r1).toBe(r2);
  });

  it('should return a new instance for a different model name', () => {
    const r1 = getReranker('model-x', '/tmp');
    const r2 = getReranker('model-y', '/tmp');
    expect(r1).not.toBe(r2);
  });
});
