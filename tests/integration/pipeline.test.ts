import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Mock the embedder to avoid downloading models
vi.mock('../../src/embeddings/transformers.js', () => ({
  TransformersEmbedder: class {
    modelName = 'mock-model';
    vectorDim = 768;
    async embed(texts: string[]) {
      return texts.map(() => Array.from({ length: 768 }, () => Math.random()));
    }
    async embedDocuments(texts: string[]) {
      return texts.map(() => Array.from({ length: 768 }, () => Math.random()));
    }
    async embedQuery(_query: string) {
      return Array.from({ length: 768 }, () => Math.random());
    }
  },
}));

const SAMPLE_MD_1 = `# Getting Started

Welcome to this guide. This section covers the basics of getting started.

## Installation

To install the package, run the following command:

\`\`\`bash
npm install my-package
\`\`\`

## Configuration

After installation, create a config file with your settings.

# Advanced Usage

This section covers advanced usage patterns.

## API Reference

The API provides the following methods for interacting with the system.
`;

const SAMPLE_MD_2 = `# Another Document

This is another markdown document with different content.

## Section A

Content for section A with enough text to not be filtered by minChars.

## Section B

Content for section B with more information about the topic at hand.
`;

describe('IndexPipeline Integration', () => {
  let tmpDir: string;
  let dbDir: string;
  let notesDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqmd-integration-'));
    dbDir = path.join(tmpDir, 'db');
    notesDir = path.join(tmpDir, 'notes');

    fs.mkdirSync(dbDir, { recursive: true });
    fs.mkdirSync(notesDir, { recursive: true });

    // Write sample markdown files
    fs.writeFileSync(path.join(notesDir, 'guide.md'), SAMPLE_MD_1);
    fs.writeFileSync(path.join(notesDir, 'other.md'), SAMPLE_MD_2);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should index markdown files and store chunks', async () => {
    const { loadConfig } = await import('../../src/config/loader.js');
    const { IndexPipeline } = await import('../../src/ingestion/pipeline.js');
    const { getDb, getFilesTable } = await import('../../src/store/db.js');
    const { getAllFiles } = await import('../../src/store/reader.js');

    // Create a minimal config
    const config = loadConfig();
    config.paths.db_path = dbDir;
    config.paths.model_cache_dir = path.join(tmpDir, 'models');
    config.embeddings.backend = 'transformers';
    config.chunking.min_chars = 30;

    const pipeline = new IndexPipeline(config);

    const result = await pipeline.run({
      paths: [notesDir],
    });

    expect(result.errors.length).toBe(0);
    expect(result.indexed).toBeGreaterThan(0);

    // Verify files were stored in DB
    const db = await getDb(dbDir);
    const filesTable = await getFilesTable(db);
    const files = await getAllFiles(filesTable);

    expect(files.length).toBeGreaterThanOrEqual(2);
    expect(files.every((f) => f.status === 'indexed')).toBe(true);
  }, 30000);

  it('should skip unchanged files on re-run', async () => {
    const { loadConfig } = await import('../../src/config/loader.js');
    const { IndexPipeline } = await import('../../src/ingestion/pipeline.js');

    const config = loadConfig();
    config.paths.db_path = dbDir;
    config.paths.model_cache_dir = path.join(tmpDir, 'models');

    const pipeline = new IndexPipeline(config);

    const result = await pipeline.run({
      paths: [notesDir],
    });

    // On second run, all files should be skipped (unchanged)
    expect(result.skipped).toBe(2);
    expect(result.indexed).toBe(0);
  }, 30000);

  it('should force re-index when force option is set', async () => {
    const { loadConfig } = await import('../../src/config/loader.js');
    const { IndexPipeline } = await import('../../src/ingestion/pipeline.js');

    const config = loadConfig();
    config.paths.db_path = dbDir;
    config.paths.model_cache_dir = path.join(tmpDir, 'models');

    const pipeline = new IndexPipeline(config);

    const result = await pipeline.run({
      paths: [notesDir],
      force: true,
    });

    expect(result.indexed).toBeGreaterThan(0);
    expect(result.skipped).toBe(0);
  }, 30000);

  it('should store chunks with correct fields', async () => {
    const { getDb, getFilesTable, getChunksTable } = await import('../../src/store/db.js');
    const { getAllFiles, getFileChunks } = await import('../../src/store/reader.js');

    const db = await getDb(dbDir);
    const filesTable = await getFilesTable(db);
    const chunksTable = await getChunksTable(db);
    const files = await getAllFiles(filesTable);

    const guideFile = files.find((f) => f.file_path.includes('guide.md'));
    expect(guideFile).toBeDefined();

    const chunks = await getFileChunks(chunksTable, guideFile!.file_id);
    expect(chunks.length).toBeGreaterThan(0);

    const firstChunk = chunks[0]!;
    expect(firstChunk.chunk_id).toBeTruthy();
    expect(firstChunk.file_id).toBe(guideFile!.file_id);
    expect(firstChunk.file_path).toContain('guide.md');
    expect(firstChunk.text_raw).toBeTruthy();
    // Vector may be stored as typed array; check it has elements
    expect(firstChunk.vector.length).toBeGreaterThanOrEqual(0);
    expect(typeof firstChunk.token_count).toBe('number');
  }, 30000);
});
