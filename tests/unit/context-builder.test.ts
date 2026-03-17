import { describe, expect, it } from 'vitest';
import { buildContext } from '../../src/rag/context-builder.js';
import type { SearchResult } from '../../src/store/schema.js';

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    chunk_id: 'hash:0:0',
    file_id: 'file-1',
    file_path: '/docs/guide.md',
    file_hash: 'abc123',
    file_mtime: 1000000,
    heading_path: 'Introduction',
    heading_level: 1,
    heading_text: 'Introduction',
    section_index: 0,
    chunk_index: 0,
    text: 'Section: Introduction\n\nSome content here.',
    text_raw: 'Some content here.',
    token_count: 10,
    parent_headings: [],
    depth: 1,
    vector: [],
    line_start: 1,
    line_end: 5,
    score: 0.9,
    ...overrides,
  };
}

describe('buildContext', () => {
  it('should return empty string for empty results', () => {
    expect(buildContext([], 1000)).toBe('');
  });

  it('should include Source: attribution', () => {
    const result = makeResult();
    const context = buildContext([result], 1000);
    expect(context).toContain('Source: /docs/guide.md');
  });

  it('should include Section: when heading_path is present', () => {
    const result = makeResult({ heading_path: 'Introduction' });
    const context = buildContext([result], 1000);
    expect(context).toContain('Section: Introduction');
  });

  it('should omit Section: line when heading_path is empty', () => {
    const result = makeResult({ heading_path: '' });
    const context = buildContext([result], 1000);
    expect(context).not.toContain('Section:');
  });

  it('should include Lines: attribution', () => {
    const result = makeResult({ line_start: 3, line_end: 10 });
    const context = buildContext([result], 1000);
    expect(context).toContain('Lines: 3-10');
  });

  it('should include text_raw content', () => {
    const result = makeResult({ text_raw: 'My document content.' });
    const context = buildContext([result], 1000);
    expect(context).toContain('My document content.');
  });

  it('should join multiple results with --- separator', () => {
    const results = [
      makeResult({ file_path: '/a.md', text_raw: 'Content A.' }),
      makeResult({ file_path: '/b.md', text_raw: 'Content B.' }),
    ];
    const context = buildContext(results, 10000);
    expect(context).toContain('---');
    expect(context).toContain('Content A.');
    expect(context).toContain('Content B.');
  });

  it('should stop adding results when maxTokens exceeded after first result', () => {
    const longText = 'word '.repeat(500); // ~650 tokens estimated
    const results = [
      makeResult({ text_raw: longText, file_path: '/first.md' }),
      makeResult({ text_raw: 'Short second.', file_path: '/second.md' }),
    ];
    // maxTokens = 100 means second result would push over limit
    const context = buildContext(results, 100);
    expect(context).toContain('/first.md');
    expect(context).not.toContain('/second.md');
  });
});
