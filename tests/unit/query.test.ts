import { describe, expect, it } from 'vitest';
import {
  prepareDocumentForEmbedding,
  prepareQueryForEmbedding,
  preprocessQuery,
} from '../../src/search/query.js';

describe('preprocessQuery', () => {
  it('should lowercase the input', () => {
    expect(preprocessQuery('Hello World')).toBe('hello world');
  });

  it('should strip special characters', () => {
    // ! and ? are replaced with spaces, then collapsed
    expect(preprocessQuery('hello! world?')).toBe('hello world');
  });

  it('should preserve hyphens', () => {
    expect(preprocessQuery('well-known pattern')).toBe('well-known pattern');
  });

  it('should collapse multiple whitespace into single space', () => {
    expect(preprocessQuery('hello   world')).toBe('hello world');
  });

  it('should trim leading and trailing whitespace', () => {
    expect(preprocessQuery('  hello world  ')).toBe('hello world');
  });

  it('should handle combined cases', () => {
    const result = preprocessQuery('  Hello, World!  How are you? ');
    expect(result).toBe('hello world how are you');
  });
});

describe('prepareQueryForEmbedding', () => {
  it('should prepend search_query: for nomic models', () => {
    const result = prepareQueryForEmbedding('test query', 'nomic-embed-text');
    expect(result).toBe('search_query: test query');
  });

  it('should not prepend prefix for non-nomic models', () => {
    const result = prepareQueryForEmbedding('test query', 'sentence-transformers/all-MiniLM-L6-v2');
    expect(result).toBe('test query');
  });

  it('should still preprocess the query (lowercase, etc.)', () => {
    const result = prepareQueryForEmbedding('Hello World', 'nomic-embed-text');
    expect(result).toBe('search_query: hello world');
  });
});

describe('prepareDocumentForEmbedding', () => {
  it('should prepend search_document: for nomic models', () => {
    const result = prepareDocumentForEmbedding('some document text', 'nomic-embed-text');
    expect(result).toBe('search_document: some document text');
  });

  it('should not prepend prefix for non-nomic models', () => {
    const result = prepareDocumentForEmbedding('some document text', 'all-MiniLM-L6-v2');
    expect(result).toBe('some document text');
  });

  it('should not alter the original text for non-nomic models', () => {
    const text = 'Document with UPPERCASE and special—chars.';
    const result = prepareDocumentForEmbedding(text, 'other-model');
    expect(result).toBe(text);
  });
});
