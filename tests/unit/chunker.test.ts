import { describe, expect, it } from 'vitest';
import { chunkDocument, estimateTokens } from '../../src/ingestion/chunker.js';
import { parseMarkdown } from '../../src/ingestion/parser.js';

const defaultInput = {
  fileId: 'test-file-id',
  fileHash: 'abc123',
  filePath: '/home/user/notes/test.md',
  fileMtime: 1000000,
  maxTokens: 512,
  minChars: 50,
  overlapTokens: 64,
  includeBreadcrumb: true,
};

describe('chunker', () => {
  describe('preamble handling', () => {
    it('should create a preamble chunk for content before first heading', () => {
      const md = `This is a preamble paragraph that should be captured as a section.

It has multiple paragraphs.`;

      const doc = parseMarkdown(md, '/test.md');
      const chunks = chunkDocument(doc, defaultInput);

      expect(chunks.length).toBeGreaterThan(0);
      const preamble = chunks.find((c) => c.heading_level === 0);
      expect(preamble).toBeDefined();
      expect(preamble!.text_raw).toContain('preamble paragraph');
    });

    it('should use filename stem as breadcrumb for preamble', () => {
      const md = 'Some preamble content here that is long enough to not be filtered.';

      const myNotesInput = {
        ...defaultInput,
        filePath: '/home/user/notes/my-notes.md',
      };
      const doc = parseMarkdown(md, '/home/user/notes/my-notes.md');
      const chunks = chunkDocument(doc, myNotesInput);

      expect(chunks.length).toBeGreaterThan(0);
      const preamble = chunks[0]!;
      expect(preamble.text).toContain('my-notes');
    });
  });

  describe('hierarchical chunking', () => {
    it('should create chunks for each heading section', () => {
      const md = `# Header 1

Content under header 1 that has enough characters to not be filtered out.

## Subheader 1.1

Content under subheader 1.1 that has enough characters to not be filtered out.

## Subheader 1.2

Content under subheader 1.2 that has enough characters to not be filtered out.

# Header 2

Content under header 2 that has enough characters to not be filtered out.`;

      const doc = parseMarkdown(md, '/test.md');
      const chunks = chunkDocument(doc, defaultInput);

      expect(chunks.length).toBeGreaterThanOrEqual(4);
    });

    it('should set correct heading levels', () => {
      const md = `# Top Level

Content here that is long enough to not be filtered out.

## Second Level

Content here that is long enough to not be filtered out.

### Third Level

Content here that is long enough to not be filtered out.`;

      const doc = parseMarkdown(md, '/test.md');
      const chunks = chunkDocument(doc, defaultInput);

      const levels = chunks.map((c) => c.heading_level);
      expect(levels).toContain(1);
      expect(levels).toContain(2);
      expect(levels).toContain(3);
    });

    it('should include heading path in breadcrumb', () => {
      const md = `# Chapter 1

Content here.

## Section 1.1

This is section content that is long enough to not be filtered out by minChars.`;

      const doc = parseMarkdown(md, '/test.md');
      const chunks = chunkDocument(doc, defaultInput);

      const sectionChunk = chunks.find((c) => c.heading_text === 'Section 1.1');
      if (sectionChunk) {
        expect(sectionChunk.text).toContain('Section:');
      }
    });
  });

  describe('token-based splitting', () => {
    it('should split large sections into multiple chunks', () => {
      // Create a large section
      const paragraphs = Array.from(
        { length: 50 },
        (_, i) =>
          `Paragraph ${i}: This is a long paragraph with enough content to contribute tokens. It has multiple sentences and should help push the section over the token limit for splitting tests.`
      );
      const md = `# Large Section\n\n${paragraphs.join('\n\n')}`;

      const doc = parseMarkdown(md, '/test.md');
      const chunks = chunkDocument(doc, { ...defaultInput, maxTokens: 100 });

      const sectionChunks = chunks.filter((c) => c.heading_text === 'Large Section');
      expect(sectionChunks.length).toBeGreaterThan(1);
    });

    it('should maintain chunk_index for split chunks', () => {
      const paragraphs = Array.from(
        { length: 30 },
        (_, i) => `Paragraph ${i}: This is a long paragraph with enough content.`
      );
      const md = `# Section\n\n${paragraphs.join('\n\n')}`;

      const doc = parseMarkdown(md, '/test.md');
      const chunks = chunkDocument(doc, { ...defaultInput, maxTokens: 100 });

      const sectionChunks = chunks.filter((c) => c.heading_text === 'Section');
      if (sectionChunks.length > 1) {
        expect(sectionChunks[0]!.chunk_index).toBe(0);
        expect(sectionChunks[1]!.chunk_index).toBe(1);
      }
    });
  });

  describe('breadcrumb injection', () => {
    it('should inject breadcrumb as prefix in text field', () => {
      const md = `# My Heading

This is content under my heading that is long enough to not be filtered.`;

      const doc = parseMarkdown(md, '/test.md');
      const chunks = chunkDocument(doc, defaultInput);

      const headingChunk = chunks.find((c) => c.heading_text === 'My Heading');
      if (headingChunk) {
        expect(headingChunk.text).toContain('Section:');
        expect(headingChunk.text_raw).not.toContain('Section:');
      }
    });

    it('should not inject breadcrumb when includeBreadcrumb is false', () => {
      const md = `# My Heading

This is content under my heading that is long enough to not be filtered.`;

      const doc = parseMarkdown(md, '/test.md');
      const chunks = chunkDocument(doc, { ...defaultInput, includeBreadcrumb: false });

      const headingChunk = chunks.find((c) => c.heading_text === 'My Heading');
      if (headingChunk) {
        expect(headingChunk.text).not.toContain('Section:');
      }
    });
  });

  describe('stub filtering', () => {
    it('should filter out chunks shorter than minChars', () => {
      const md = `# Heading

Short.

## Another Heading

This is longer content that should not be filtered out because it has enough characters.`;

      const doc = parseMarkdown(md, '/test.md');
      const chunks = chunkDocument(doc, { ...defaultInput, minChars: 50 });

      // "Short." is only 6 chars + heading text, should be filtered
      for (const chunk of chunks) {
        expect(chunk.text_raw.length).toBeGreaterThanOrEqual(defaultInput.minChars);
      }
    });

    it('should keep chunks at minChars boundary', () => {
      const content = 'a'.repeat(50);
      const md = `# Heading\n\n${content}`;

      const doc = parseMarkdown(md, '/test.md');
      const chunks = chunkDocument(doc, { ...defaultInput, minChars: 50 });

      // At least one chunk should exist (the content is exactly 50 chars)
      expect(chunks.some((c) => c.text_raw.trim().length >= 50)).toBe(true);
    });
  });

  describe('parent headings', () => {
    it('should record parent headings on deeply nested sections', () => {
      const md = `# Root

Root content here.

## Level Two

Level two content here.

### Level Three

Level three content that is long enough to not be filtered out by minChars.`;

      const doc = parseMarkdown(md, '/test.md');
      const chunks = chunkDocument(doc, defaultInput);

      const deepChunk = chunks.find((c) => c.heading_text === 'Level Three');
      expect(deepChunk).toBeDefined();
      expect(deepChunk!.parent_headings).toContain('Root');
      expect(deepChunk!.parent_headings).toContain('Level Two');
    });
  });

  describe('chunk_id composition', () => {
    it('should format chunk_id as fileHash:sectionIdx:chunkIdx', () => {
      const md = `# Section

Content here that is long enough to not be filtered out by minChars.`;

      const doc = parseMarkdown(md, '/test.md');
      const chunks = chunkDocument(doc, defaultInput);

      expect(chunks.length).toBeGreaterThan(0);
      const chunk = chunks[0]!;
      // chunk_id should be fileHash:sectionIdx:chunkIdx
      expect(chunk.chunk_id).toBe(
        `${defaultInput.fileHash}:${chunk.section_index}:${chunk.chunk_index}`
      );
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens for a simple string', () => {
      const text = 'Hello world how are you today';
      const tokens = estimateTokens(text);
      expect(tokens).toBeGreaterThan(0);
    });

    it('should return more tokens for longer text', () => {
      const short = 'Hello world';
      const long = 'Hello world this is a much longer piece of text with many more words';
      expect(estimateTokens(long)).toBeGreaterThan(estimateTokens(short));
    });
  });
});
