import { describe, expect, it } from 'vitest';
import { buildRagPrompt, formatResults, ragSystemPrompt } from '../../src/rag/prompt-templates.js';
import type { SearchResult } from '../../src/store/schema.js';

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    chunk_id: 'hash:0:0',
    file_id: 'file-1',
    file_path: '/docs/guide.md',
    file_hash: 'abc123',
    file_mtime: 1000000,
    heading_path: 'Overview',
    heading_level: 1,
    heading_text: 'Overview',
    section_index: 0,
    chunk_index: 0,
    text: 'Section: Overview\n\nContent here.',
    text_raw: 'Content here.',
    token_count: 10,
    parent_headings: [],
    depth: 1,
    vector: [],
    line_start: 1,
    line_end: 5,
    score: 0.85,
    ...overrides,
  };
}

describe('ragSystemPrompt', () => {
  it('should return a non-empty string', () => {
    const prompt = ragSystemPrompt();
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('should mention source citation guidance', () => {
    const prompt = ragSystemPrompt();
    expect(prompt.toLowerCase()).toContain('source');
  });
});

describe('formatResults', () => {
  it('should return "No relevant documents found." for empty results', () => {
    expect(formatResults([])).toBe('No relevant documents found.');
  });

  it('should include [1] index for first result', () => {
    const result = makeResult();
    expect(formatResults([result])).toContain('[1]');
  });

  it('should include [2] index for second result', () => {
    const results = [makeResult(), makeResult({ file_path: '/other.md' })];
    expect(formatResults(results)).toContain('[2]');
  });

  it('should include the file path', () => {
    const result = makeResult({ file_path: '/path/to/doc.md' });
    expect(formatResults([result])).toContain('/path/to/doc.md');
  });

  it('should include the heading path', () => {
    const result = makeResult({ heading_path: 'Chapter > Section' });
    expect(formatResults([result])).toContain('Chapter > Section');
  });

  it('should include score formatted to 4 decimal places', () => {
    const result = makeResult({ score: 0.12345678 });
    expect(formatResults([result])).toContain('0.1235');
  });

  it('should include text_raw content', () => {
    const result = makeResult({ text_raw: 'The actual document text.' });
    expect(formatResults([result])).toContain('The actual document text.');
  });

  it('should join multiple results with --- separator', () => {
    const results = [makeResult(), makeResult({ file_path: '/b.md' })];
    expect(formatResults(results)).toContain('---');
  });
});

describe('buildRagPrompt', () => {
  it('should include the query', () => {
    const prompt = buildRagPrompt('What is X?', 'Some context.');
    expect(prompt).toContain('What is X?');
  });

  it('should include the context', () => {
    const prompt = buildRagPrompt('query', 'This is the context docs.');
    expect(prompt).toContain('This is the context docs.');
  });

  it('should include Context Documents section header', () => {
    const prompt = buildRagPrompt('query', 'context');
    expect(prompt).toContain('Context Documents');
  });

  it('should include Question section header', () => {
    const prompt = buildRagPrompt('query', 'context');
    expect(prompt).toContain('Question');
  });

  it('should include Answer section header', () => {
    const prompt = buildRagPrompt('query', 'context');
    expect(prompt).toContain('Answer');
  });
});
