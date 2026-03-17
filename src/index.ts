#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadConfig, writeDefaultConfig } from './config/loader.js';
import { getDb, getChunksTable, getFilesTable, getDbStats } from './store/db.js';
import { getAllFiles } from './store/reader.js';
import { IndexPipeline } from './ingestion/pipeline.js';
import { TransformersEmbedder } from './embeddings/transformers.js';
import { OllamaEmbedder } from './embeddings/ollama.js';
import type { Embedder } from './embeddings/types.js';

const program = new Command();

program
  .name('sqmd')
  .description('Local semantic search engine over Markdown files')
  .version('0.1.0');

// ─── index command ───────────────────────────────────────────────────────────
program
  .command('index')
  .description('Index Markdown files for search')
  .option('--path <path>', 'Path to directory or file to index')
  .option('--force', 'Force re-indexing even if files are unchanged', false)
  .option('--watch', 'Start file watcher after indexing', false)
  .option('--config <path>', 'Path to config file')
  .action(async (opts) => {
    const config = loadConfig(opts.config);
    const paths = opts.path ? [path.resolve(opts.path)] : config.paths.watch_dirs;

    console.log(chalk.blue('Starting indexing...'));
    console.log(chalk.gray(`Paths: ${paths.join(', ')}`));

    const pipeline = new IndexPipeline(config);

    const result = await pipeline.run({
      paths,
      force: opts.force,
      onProgress: (event) => {
        if (event.type === 'file_start') {
          process.stdout.write(chalk.gray(`  Processing: ${event.filePath}\r`));
        } else if (event.type === 'file_done') {
          console.log(chalk.green(`  ✓ ${event.filePath}`));
        } else if (event.type === 'file_skip') {
          // Silent skip
        } else if (event.type === 'file_error') {
          console.log(chalk.red(`  ✗ ${event.filePath}`));
        }
      },
    });

    console.log('');
    console.log(chalk.green(`Done!`));
    console.log(`  Indexed: ${result.indexed}`);
    console.log(`  Skipped: ${result.skipped}`);
    console.log(`  Errors: ${result.errors.length}`);

    if (result.errors.length > 0) {
      console.log(chalk.red('\nErrors:'));
      result.errors.forEach((e) => {
        console.log(chalk.red(`  ${e.filePath}: ${e.error}`));
      });
    }

    if (opts.watch) {
      const { startWatcher } = await import('./watcher/daemon.js');
      const db = await getDb(config.paths.db_path);
      startWatcher(config, db);
      console.log(chalk.blue('\nWatcher started. Press Ctrl+C to stop.'));

      // Keep process alive
      process.on('SIGINT', () => {
        console.log('\nStopping watcher...');
        process.exit(0);
      });
    }
  });

// ─── search command ──────────────────────────────────────────────────────────
program
  .command('search <query>')
  .description('Search indexed documents')
  .option('--top-k <n>', 'Number of results', '10')
  .option('--mode <mode>', 'Search mode: hybrid, vector, fts', 'hybrid')
  .option('--filter <path>', 'Filter results to files matching path')
  .option('--config <path>', 'Path to config file')
  .action(async (query, opts) => {
    const config = loadConfig(opts.config);

    const db = await getDb(config.paths.db_path);
    const chunksTable = await getChunksTable(db);

    let embedder: Embedder;
    if (config.embeddings.backend === 'ollama') {
      embedder = new OllamaEmbedder(config.embeddings.model, config.embeddings.ollama_base_url);
    } else {
      embedder = new TransformersEmbedder(config.embeddings.model, config.paths.model_cache_dir);
    }

    const { hybridSearch } = await import('./search/hybrid.js');

    const topK = parseInt(opts.topK, 10);
    const mode = opts.mode as 'hybrid' | 'vector' | 'fts';

    console.log(chalk.blue(`Searching for: "${query}"`));
    console.log(chalk.gray(`Mode: ${mode}, Top-K: ${topK}`));
    console.log('');

    const start = Date.now();
    const results = await hybridSearch(chunksTable, embedder, {
      query,
      topK,
      mode,
      rrfK: config.search.rrf_k,
      filterPath: opts.filter,
      modelName: config.embeddings.model,
    });
    const duration = Date.now() - start;

    if (results.length === 0) {
      console.log(chalk.yellow('No results found.'));
      return;
    }

    results.forEach((result, idx) => {
      console.log(chalk.bold(`${idx + 1}. ${result.file_path}`));
      if (result.heading_path) {
        console.log(chalk.cyan(`   § ${result.heading_path}`));
      }
      console.log(chalk.gray(`   Score: ${result.score.toFixed(4)} | Lines ${result.line_start}-${result.line_end}`));
      console.log('');

      // Show snippet
      const snippet = result.text_raw.slice(0, 200).replace(/\n/g, ' ');
      console.log(`   ${snippet}${result.text_raw.length > 200 ? '...' : ''}`);
      console.log('');
    });

    console.log(chalk.gray(`Found ${results.length} results in ${duration}ms`));
  });

// ─── serve command ───────────────────────────────────────────────────────────
program
  .command('serve')
  .description('Start the REST API server')
  .option('--host <host>', 'Host to bind to')
  .option('--port <port>', 'Port to listen on')
  .option('--config <path>', 'Path to config file')
  .action(async (opts) => {
    const config = loadConfig(opts.config);

    if (opts.host) config.api.host = opts.host;
    if (opts.port) config.api.port = parseInt(opts.port, 10);

    const db = await getDb(config.paths.db_path);

    let embedder: Embedder;
    if (config.embeddings.backend === 'ollama') {
      embedder = new OllamaEmbedder(config.embeddings.model, config.embeddings.ollama_base_url);
    } else {
      embedder = new TransformersEmbedder(config.embeddings.model, config.paths.model_cache_dir);
    }

    const watcherStatus = { running: false };

    if (config.watcher.enabled) {
      const { startWatcher } = await import('./watcher/daemon.js');
      startWatcher(config, db);
      watcherStatus.running = true;
    }

    const { createApp } = await import('./api/app.js');
    const { serve } = await import('@hono/node-server');

    const app = createApp({ db, embedder, config, watcherStatus });

    const { host, port } = config.api;

    console.log(chalk.blue(`Starting sqmd API server`));
    console.log(chalk.gray(`Listening on http://${host}:${port}`));

    serve({
      fetch: app.fetch,
      hostname: host,
      port,
    });
  });

// ─── mcp command ─────────────────────────────────────────────────────────────
program
  .command('mcp')
  .description('Start the MCP server')
  .option('--transport <transport>', 'Transport: stdio or sse', 'stdio')
  .option('--port <port>', 'Port for SSE transport')
  .option('--config <path>', 'Path to config file')
  .action(async (opts) => {
    const config = loadConfig(opts.config);

    const db = await getDb(config.paths.db_path);

    let embedder: Embedder;
    if (config.embeddings.backend === 'ollama') {
      embedder = new OllamaEmbedder(config.embeddings.model, config.embeddings.ollama_base_url);
    } else {
      embedder = new TransformersEmbedder(config.embeddings.model, config.paths.model_cache_dir);
    }

    const { startMcpServer } = await import('./mcp/server.js');

    await startMcpServer(db, embedder, config, {
      transport: opts.transport as 'stdio' | 'sse',
      port: opts.port ? parseInt(opts.port, 10) : undefined,
    });
  });

// ─── status command ──────────────────────────────────────────────────────────
program
  .command('status')
  .description('Show index statistics')
  .option('--config <path>', 'Path to config file')
  .action(async (opts) => {
    const config = loadConfig(opts.config);

    try {
      const db = await getDb(config.paths.db_path);
      const stats = await getDbStats(db);

      const filesTable = await getFilesTable(db);
      const files = await getAllFiles(filesTable);

      const indexedFiles = files.filter((f) => f.status === 'indexed');
      const lastIndexed =
        indexedFiles.length > 0
          ? new Date(Math.max(...indexedFiles.map((f) => f.indexed_at))).toLocaleString()
          : 'Never';

      console.log(chalk.bold('sqmd Status'));
      console.log(chalk.gray('─'.repeat(40)));
      console.log(`DB path:       ${config.paths.db_path}`);
      console.log(`Files indexed: ${chalk.green(stats.fileCount)}`);
      console.log(`Chunks stored: ${chalk.green(stats.chunkCount)}`);
      console.log(`Last indexed:  ${lastIndexed}`);
      console.log(`Watch dirs:    ${config.paths.watch_dirs.join(', ')}`);
      console.log(`Embedder:      ${config.embeddings.backend} / ${config.embeddings.model}`);
    } catch (err) {
      console.log(chalk.red('Error reading status:'), err instanceof Error ? err.message : String(err));
      console.log(chalk.gray('Database may not be initialized. Run `sqmd index` first.'));
    }
  });

// ─── config command ──────────────────────────────────────────────────────────
program
  .command('config')
  .description('Manage configuration')
  .option('--init <path>', 'Write default config to specified path')
  .action((opts) => {
    if (opts.init) {
      const targetPath = opts.init.replace(/^~/, os.homedir());
      writeDefaultConfig(targetPath);
      console.log(chalk.green(`Default config written to: ${targetPath}`));
    } else {
      console.log('Usage: sqmd config --init <path>');
    }
  });

program.parse(process.argv);
