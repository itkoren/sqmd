import chokidar, { type FSWatcher } from 'chokidar';
import type * as lancedb from '@lancedb/lancedb';
import type { Config } from '../config/schema.js';
import { FileChangeHandler } from './handler.js';

export function startWatcher(config: Config, db: lancedb.Connection): FSWatcher {
  const { watch_dirs } = config.paths;
  const { extensions, ignore_patterns, debounce_ms } = config.watcher;

  const handler = new FileChangeHandler(config, db);

  // Build glob patterns for watched extensions
  const globPatterns = watch_dirs.flatMap((dir) =>
    extensions.map((ext) => {
      // Remove leading dot for glob pattern
      const extWithoutDot = ext.startsWith('.') ? ext.slice(1) : ext;
      return `${dir}/**/*.${extWithoutDot}`;
    })
  );

  const watcher = chokidar.watch(globPatterns, {
    ignored: ignore_patterns,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: debounce_ms,
      pollInterval: 100,
    },
    followSymlinks: true,
  });

  watcher
    .on('add', (filePath: string) => {
      handler.onAdd(filePath);
    })
    .on('change', (filePath: string) => {
      handler.onChange(filePath);
    })
    .on('unlink', (filePath: string) => {
      handler.onUnlink(filePath).catch((err: unknown) => {
        console.error(
          '[watcher] Unlink handler error:',
          err instanceof Error ? err.message : String(err)
        );
      });
    })
    .on('error', (error: Error) => {
      console.error('[watcher] Error:', error.message);
    })
    .on('ready', () => {
      console.log('[watcher] Ready, watching:', watch_dirs.join(', '));
    });

  return watcher;
}
