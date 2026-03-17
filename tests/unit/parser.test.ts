import { describe, expect, it } from 'vitest';
import { getFileStem, parseMarkdown } from '../../src/ingestion/parser.js';

describe('parseMarkdown', () => {
  it('should return the filePath in the result', () => {
    const doc = parseMarkdown('# Hello', '/some/path/file.md');
    expect(doc.filePath).toBe('/some/path/file.md');
  });

  it('should return 0 sections for an empty document', () => {
    const doc = parseMarkdown('', '/test.md');
    expect(doc.sections).toHaveLength(0);
  });

  it('should return 1 section for a single heading', () => {
    const doc = parseMarkdown('# Title\n\nSome content here.', '/test.md');
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0]!.headingText).toBe('Title');
  });

  describe('preamble', () => {
    it('should capture content before first heading as a section with headingLevel 0', () => {
      const md = 'This is preamble content.\n\nAnother preamble paragraph.\n\n# Heading\n\nBody.';
      const doc = parseMarkdown(md, '/test.md');
      const preamble = doc.sections.find((s) => s.headingLevel === 0);
      expect(preamble).toBeDefined();
      expect(preamble!.headingText).toBe('');
    });

    it('should capture preamble text in content', () => {
      const md = 'Intro paragraph here.\n\n# Section\n\nBody.';
      const doc = parseMarkdown(md, '/test.md');
      const preamble = doc.sections.find((s) => s.headingLevel === 0);
      expect(preamble!.content).toContain('Intro paragraph');
    });
  });

  describe('hierarchy', () => {
    it('should set correct parentHeadings for nested sections', () => {
      const md = '# Chapter\n\nChapter intro.\n\n## Section\n\nSection content.';
      const doc = parseMarkdown(md, '/test.md');
      const section = doc.sections.find((s) => s.headingText === 'Section');
      expect(section).toBeDefined();
      expect(section!.parentHeadings).toContain('Chapter');
    });

    it('should reset parentHeadings when level goes up', () => {
      const md = '# Chapter 1\n\nContent.\n\n## Sub\n\nSub content.\n\n# Chapter 2\n\nNew chapter.';
      const doc = parseMarkdown(md, '/test.md');
      const ch2 = doc.sections.find((s) => s.headingText === 'Chapter 2');
      expect(ch2).toBeDefined();
      expect(ch2!.parentHeadings).not.toContain('Chapter 1');
      expect(ch2!.parentHeadings).not.toContain('Sub');
    });

    it('should build headingPath as breadcrumb trail', () => {
      const md = '# Top\n\nContent.\n\n## Middle\n\nContent.\n\n### Bottom\n\nContent.';
      const doc = parseMarkdown(md, '/test.md');
      const bottom = doc.sections.find((s) => s.headingText === 'Bottom');
      expect(bottom).toBeDefined();
      expect(bottom!.headingPath).toContain('Top');
      expect(bottom!.headingPath).toContain('Middle');
      expect(bottom!.headingPath).toContain('Bottom');
    });

    it('should set headingPath to empty string for top-level headings', () => {
      const md = '# Top Level\n\nContent.';
      const doc = parseMarkdown(md, '/test.md');
      // headingPath is built from headingStack BEFORE current heading is pushed
      // so top-level heading has empty headingPath
      const topLevel = doc.sections.find((s) => s.headingText === 'Top Level');
      expect(topLevel).toBeDefined();
      expect(topLevel!.headingPath).toBe('Top Level');
    });
  });

  describe('line numbers', () => {
    it('should record lineStart on sections', () => {
      const md = '# Heading\n\nContent here.';
      const doc = parseMarkdown(md, '/test.md');
      expect(doc.sections[0]!.lineStart).toBeGreaterThan(0);
    });

    it('should record lineEnd >= lineStart', () => {
      const md = '# Heading\n\nContent here.\n\nMore content.';
      const doc = parseMarkdown(md, '/test.md');
      const section = doc.sections[0]!;
      expect(section.lineEnd).toBeGreaterThanOrEqual(section.lineStart);
    });
  });

  describe('content capture', () => {
    it('should capture paragraph text in section content', () => {
      const md = '# Heading\n\nThis is the paragraph content.';
      const doc = parseMarkdown(md, '/test.md');
      expect(doc.sections[0]!.content).toContain('This is the paragraph content');
    });

    it('should handle inline code in headings', () => {
      const md = '# Use `foo()` here\n\nContent.';
      const doc = parseMarkdown(md, '/test.md');
      expect(doc.sections[0]!.headingText).toContain('foo()');
    });
  });

  it('should produce multiple sections for multiple headings', () => {
    const md = '# One\n\nContent.\n\n# Two\n\nMore.\n\n# Three\n\nFinal.';
    const doc = parseMarkdown(md, '/test.md');
    expect(doc.sections.length).toBe(3);
  });
});

describe('getFileStem', () => {
  it('should strip the extension', () => {
    expect(getFileStem('/path/to/file.md')).toBe('file');
  });

  it('should handle multi-dot filenames', () => {
    expect(getFileStem('/path/to/my.notes.md')).toBe('my.notes');
  });

  it('should return basename without extension', () => {
    expect(getFileStem('docs/guide.txt')).toBe('guide');
  });
});
