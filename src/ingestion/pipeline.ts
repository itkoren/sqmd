import * as fs from 'node:fs';
import pLimit from 'p-limit';
import type { Config } from '../config/schema.js';
import { OllamaEmbedder } from '../embeddings/ollama.js';
import { TransformersEmbedder } from '../embeddings/transformers.js';
import type { Embedder } from '../embeddings/types.js';
import { createIndexes, getChunksTable, getDb, getFilesTable } from '../store/db.js';
import { getAllFiles } from '../store/reader.js';
import type { ChunkRecord, FileRecord } from '../store/schema.js';
import { upsertChunks, upsertFile } from '../store/writer.js';
import { chunkDocument } from './chunker.js';
import { hashFile, hashPath } from './fingerprint.js';
import { parseMarkdown } from './parser.js';
import { scanDirectory } from './scanner.js';

export interface FileError {
  filePath: string;
  error: string;
}

export interface IndexResult {
  indexed: number;
  skipped: number;
  errors: FileError[];
}

export type ProgressCallback = (event: {
  type: 'file_start' | 'file_done' | 'file_skip' | 'file_error' | 'batch_embed';
  filePath?: string;
  indexed?: number;
  skipped?: number;
  errors?: number;
  total?: number;
}) => void;

export interface RunOptions {
  paths: string[];
  force?: boolean;
  onProgress?: ProgressCallback;
  concurrency?: number;
}

export class IndexPipeline {
  private config: Config;
  private embedder: Embedder | null = null;

  constructor(config: Config) {
    this.config = config;
  }

  private getEmbedder(): Embedder {
    if (this.embedder) return this.embedder;

    const { backend, model, ollama_base_url } = this.config.embeddings;

    if (backend === 'ollama') {
      this.embedder = new OllamaEmbedder(model, ollama_base_url);
    } else {
      this.embedder = new TransformersEmbedder(model, this.config.paths.model_cache_dir);
    }

    return this.embedder;
  }

  async run(options: RunOptions): Promise<IndexResult> {
    const { paths, force = false, onProgress, concurrency = 4 } = options;

    const db = await getDb(this.config.paths.db_path);
    const chunksTable = await getChunksTable(db);
    const filesTable = await getFilesTable(db);

    // Build map of existing file hashes
    const existingFiles = await getAllFiles(filesTable);
    const existingHashMap = new Map(existingFiles.map((f) => [f.file_id, f.file_hash]));

    const { extensions, ignore_patterns } = this.config.watcher;

    // Collect all files to process
    const filesToProcess: string[] = [];

    for (const searchPath of paths) {
      if (!fs.existsSync(searchPath)) {
        console.warn(`Path not found: ${searchPath}`);
        continue;
      }

      const stat = fs.statSync(searchPath);
      if (stat.isDirectory()) {
        for await (const filePath of scanDirectory(searchPath, extensions, ignore_patterns)) {
          filesToProcess.push(filePath);
        }
      } else if (stat.isFile()) {
        const ext = searchPath.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? '';
        if (extensions.includes(ext)) {
          filesToProcess.push(searchPath);
        }
      }
    }

    const result: IndexResult = {
      indexed: 0,
      skipped: 0,
      errors: [],
    };

    const limit = pLimit(concurrency);
    const embedder = this.getEmbedder();
    const { batch_size } = this.config.embeddings;

    let pendingChunks: ChunkRecord[] = [];
    let pendingFiles: FileRecord[] = [];

    const flushBatch = async (): Promise<void> => {
      if (pendingChunks.length === 0) return;

      // Embed all pending chunks
      const texts = pendingChunks.map((c) => c.text);
      const batchCount = Math.ceil(texts.length / batch_size);

      for (let b = 0; b < batchCount; b++) {
        const start = b * batch_size;
        const end = Math.min(start + batch_size, texts.length);
        const batchTexts = texts.slice(start, end);

        const embeddings = await embedder.embed(batchTexts);

        for (let i = 0; i < batchTexts.length; i++) {
          pendingChunks[start + i]!.vector = embeddings[i]!;
        }

        onProgress?.({ type: 'batch_embed', total: end });
      }

      // Upsert chunks
      for (let i = 0; i < pendingFiles.length; i++) {
        const file = pendingFiles[i]!;
        const fileChunks = pendingChunks.filter((c) => c.file_id === file.file_id);
        await upsertChunks(chunksTable, fileChunks);
        await upsertFile(filesTable, file);
        result.indexed++;
        onProgress?.({
          type: 'file_done',
          filePath: file.file_path,
          indexed: result.indexed,
          skipped: result.skipped,
          errors: result.errors.length,
        });
      }

      pendingChunks = [];
      pendingFiles = [];
    };

    const processFile = async (filePath: string): Promise<void> => {
      onProgress?.({ type: 'file_start', filePath });

      const fileId = hashPath(filePath);
      const { hash: fileHash, mtime: fileMtime } = await hashFile(filePath);

      // Skip unchanged files unless force
      if (!force && existingHashMap.get(fileId) === fileHash) {
        result.skipped++;
        onProgress?.({
          type: 'file_skip',
          filePath,
          skipped: result.skipped,
        });
        return;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const doc = parseMarkdown(content, filePath);

      const chunks = chunkDocument(doc, {
        fileId,
        fileHash,
        filePath,
        fileMtime,
        maxTokens: this.config.chunking.max_tokens,
        minChars: this.config.chunking.min_chars,
        overlapTokens: this.config.chunking.overlap_tokens,
        includeBreadcrumb: this.config.chunking.include_breadcrumb,
      });

      const fileRecord: FileRecord = {
        file_id: fileId,
        file_path: filePath,
        file_hash: fileHash,
        file_mtime: fileMtime,
        chunk_count: chunks.length,
        indexed_at: Date.now(),
        status: 'indexed',
        error_msg: '',
      };

      pendingChunks.push(...chunks);
      pendingFiles.push(fileRecord);
    };

    // Process files with concurrency limit
    const tasks = filesToProcess.map((filePath) =>
      limit(async () => {
        try {
          await processFile(filePath);
        } catch (err) {
          result.errors.push({
            filePath,
            error: err instanceof Error ? err.message : String(err),
          });
          onProgress?.({
            type: 'file_error',
            filePath,
            errors: result.errors.length,
          });

          // Record error in files table
          const fileId = hashPath(filePath);
          const fileRecord: FileRecord = {
            file_id: fileId,
            file_path: filePath,
            file_hash: '',
            file_mtime: 0,
            chunk_count: 0,
            indexed_at: Date.now(),
            status: 'error',
            error_msg: err instanceof Error ? err.message : String(err),
          };
          try {
            await upsertFile(filesTable, fileRecord);
          } catch {
            // Best effort
          }
        }

        // Flush when we have enough chunks
        if (pendingChunks.length >= batch_size * 4) {
          await flushBatch();
        }
      })
    );

    await Promise.all(tasks);

    // Final flush
    await flushBatch();

    // Create indexes after bulk loading
    if (result.indexed > 0) {
      await createIndexes(db);
    }

    return result;
  }
}
