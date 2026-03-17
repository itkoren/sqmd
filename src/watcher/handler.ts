import * as fs from 'node:fs';
import type * as lancedb from '@lancedb/lancedb';
import type { Config } from '../config/schema.js';
import { hashPath } from '../ingestion/fingerprint.js';
import { IndexPipeline } from '../ingestion/pipeline.js';
import { deleteFile } from '../store/writer.js';

type DebouncedHandler = {
  timer: ReturnType<typeof setTimeout> | null;
  pending: Set<string>;
};

export class FileChangeHandler {
  private config: Config;
  private db: lancedb.Connection;
  private debounceState: DebouncedHandler = {
    timer: null,
    pending: new Set(),
  };

  constructor(config: Config, db: lancedb.Connection) {
    this.config = config;
    this.db = db;
  }

  onAdd(filePath: string): void {
    this.scheduleProcess(filePath);
  }

  onChange(filePath: string): void {
    this.scheduleProcess(filePath);
  }

  async onUnlink(filePath: string): Promise<void> {
    // Remove any pending processing for this file
    this.debounceState.pending.delete(filePath);

    const fileId = hashPath(filePath);

    try {
      await deleteFile(this.db, fileId);
      console.log(`[watcher] Deleted from index: ${filePath}`);
    } catch (err) {
      console.error(
        `[watcher] Error deleting ${filePath}:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  private scheduleProcess(filePath: string): void {
    this.debounceState.pending.add(filePath);

    if (this.debounceState.timer) {
      clearTimeout(this.debounceState.timer);
    }

    this.debounceState.timer = setTimeout(() => {
      this.processPending();
    }, this.config.watcher.debounce_ms);
  }

  private async processPending(): Promise<void> {
    const filesToProcess = Array.from(this.debounceState.pending);
    this.debounceState.pending.clear();
    this.debounceState.timer = null;

    if (filesToProcess.length === 0) return;

    console.log(`[watcher] Processing ${filesToProcess.length} changed file(s)`);

    const pipeline = new IndexPipeline(this.config);

    // Filter to only existing files
    const existingFiles = filesToProcess.filter((f) => {
      try {
        return fs.existsSync(f) && fs.statSync(f).isFile();
      } catch {
        return false;
      }
    });

    if (existingFiles.length === 0) return;

    try {
      const result = await pipeline.run({
        paths: existingFiles,
        force: true, // Always reindex changed files
        onProgress: (event) => {
          if (event.type === 'file_done') {
            console.log(`[watcher] Indexed: ${event.filePath}`);
          } else if (event.type === 'file_error') {
            console.error(`[watcher] Error indexing: ${event.filePath}`);
          }
        },
      });

      console.log(`[watcher] Done: ${result.indexed} indexed, ${result.errors.length} errors`);
    } catch (err) {
      console.error('[watcher] Pipeline error:', err instanceof Error ? err.message : String(err));
    }
  }
}
