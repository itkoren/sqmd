# sqmd

A fully local, high-performance semantic search engine for Markdown files. Index your notes, documentation, or any collection of `.md` / `.mdx` files and query them with natural language — no external API keys, no cloud services, no data leaving your machine.

Designed to serve both humans (CLI + REST API) and AI agents (MCP server), with a RAG-ready output layer for use as an agent memory backend.

---

## Table of Contents

- [Features](#features)
- [Architecture Overview](#architecture-overview)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Initial Configuration](#initial-configuration)
  - [First Index](#first-index)
- [CLI Reference](#cli-reference)
  - [index](#index)
  - [search](#search)
  - [serve](#serve)
  - [mcp](#mcp)
  - [status](#status)
  - [config](#config)
- [REST API](#rest-api)
  - [Search](#search-endpoints)
  - [Documents](#document-endpoints)
  - [Index Management](#index-management-endpoints)
  - [Health & Metrics](#health--metrics-endpoints)
  - [Authentication](#authentication)
- [MCP Server](#mcp-server)
  - [Tools](#mcp-tools)
  - [Resources](#mcp-resources)
  - [Claude Desktop Integration](#claude-desktop-integration)
- [RAG Layer](#rag-layer)
- [Configuration Reference](#configuration-reference)
- [Architecture Deep Dive](#architecture-deep-dive)
  - [Chunking Algorithm](#chunking-algorithm)
  - [Embedding Pipeline](#embedding-pipeline)
  - [Hybrid Search & RRF](#hybrid-search--rrf)
  - [Incremental Indexing](#incremental-indexing)
  - [LanceDB Schema](#lancedb-schema)
- [Embedding Backends](#embedding-backends)
  - [Transformers.js (Default)](#transformersjs-default)
  - [Ollama](#ollama)
- [Performance](#performance)
- [Development](#development)
  - [Running Tests](#running-tests)
  - [Project Conventions](#project-conventions)
- [Troubleshooting](#troubleshooting)

---

## Features

- **Fully local** — all embeddings, vector storage, and search run on-device
- **Hierarchical chunking** — sections are split following the document's heading structure, preserving semantic context
- **Hybrid search** — combines dense vector search (cosine ANN) and sparse full-text search (BM25/Tantivy) fused via Reciprocal Rank Fusion
- **Incremental indexing** — SHA-256 fingerprinting skips unchanged files; filesystem watcher triggers re-indexing automatically
- **Multiple interfaces** — CLI, REST API (Hono), and MCP server for AI agents
- **RAG output** — context builder assembles ranked chunks into token-budgeted context windows with source attribution
- **Optional reranking** — cross-encoder reranking (ONNX) for higher-precision results
- **Two embedding backends** — Transformers.js ONNX (default, bundled) or Ollama HTTP
- **Type-safe configuration** — Zod-validated YAML config with environment variable overrides

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Interfaces                               │
│   CLI (Commander)   REST API (Hono)   MCP Server (stdio/SSE)    │
└────────────┬──────────────┬──────────────────┬─────────────────┘
             │              │                  │
             ▼              ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Search Layer                              │
│         Query preprocessing → Hybrid RRF → Reranker            │
└────────────────────────────┬────────────────────────────────────┘
                             │
             ┌───────────────┼───────────────┐
             ▼               ▼               ▼
        Vector ANN        BM25 FTS      RAG Context
        (LanceDB)        (Tantivy)       Builder
             │               │
             └───────┬───────┘
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Storage Layer                             │
│             LanceDB  (chunks + files tables)                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌─────────────────────────────────────────────────────────────────┐
│                      Ingestion Pipeline                         │
│   Scanner → Parser (remark AST) → Chunker → Embedder → Writer  │
└──────────────┬───────────────────────────────────────┬──────────┘
               │                                       │
          File System                          Transformers.js
         (chokidar watch)                       ONNX / Ollama
```

---

## Technology Stack

| Component | Library | Rationale |
|-----------|---------|-----------|
| Language | TypeScript (Node.js ≥22) | Type safety; ESM native; no GIL |
| Vector DB | `@lancedb/lancedb` | Embedded hybrid vector + BM25; no separate process |
| Embeddings | `@huggingface/transformers` v3 | ONNX runtime, 2–3× faster than PyTorch on CPU |
| MD Parsing | `remark` / `remark-parse` | Full mdast AST with line positions |
| REST Server | `hono` + `@hono/node-server` | ~3× faster than Express; excellent TypeScript DX |
| MCP Server | `@modelcontextprotocol/sdk` | Official Anthropic reference SDK |
| File Watch | `chokidar` v3 | Native FSEvents on macOS; debounce built-in |
| CLI | `commander` | Lightweight, typed |
| Config | `zod` + `js-yaml` | Runtime-validated config |
| Concurrency | `p-limit` | Bounded parallelism for the indexing pipeline |

---

## Project Structure

```
sqmd/
├── src/
│   ├── index.ts                    # CLI entrypoint
│   ├── config/
│   │   ├── schema.ts               # Zod config schemas + TypeScript types
│   │   └── loader.ts               # YAML loading, ~ expansion, env overrides
│   ├── ingestion/
│   │   ├── scanner.ts              # Recursive async file discovery
│   │   ├── parser.ts               # remark AST → Section[] with line numbers
│   │   ├── chunker.ts              # Hierarchical token-aware chunking
│   │   ├── fingerprint.ts          # SHA-256 content + path hashing
│   │   └── pipeline.ts             # Full index orchestration (scan→chunk→embed→store)
│   ├── embeddings/
│   │   ├── types.ts                # Embedder interface
│   │   ├── transformers.ts         # Transformers.js ONNX backend
│   │   └── ollama.ts               # Ollama HTTP backend
│   ├── store/
│   │   ├── schema.ts               # Apache Arrow schemas + TypeScript record types
│   │   ├── db.ts                   # LanceDB connection management
│   │   ├── writer.ts               # Upsert / delete operations
│   │   └── reader.ts               # Vector search, FTS search, file/chunk queries
│   ├── search/
│   │   ├── query.ts                # Query preprocessing and prefix injection
│   │   ├── hybrid.ts               # RRF fusion (vector + BM25)
│   │   └── reranker.ts             # Optional cross-encoder reranking
│   ├── watcher/
│   │   ├── handler.ts              # chokidar event handler + debounce
│   │   └── daemon.ts               # Long-running watcher lifecycle
│   ├── api/
│   │   ├── app.ts                  # Hono application factory
│   │   ├── middleware.ts           # Auth, CORS, request logging
│   │   ├── models.ts               # Zod request/response schemas
│   │   └── routes/
│   │       ├── health.ts           # GET /api/v1/health
│   │       ├── search.ts           # POST|GET /api/v1/search
│   │       ├── documents.ts        # GET /api/v1/documents[/:id]
│   │       └── index.ts            # POST /api/v1/index/trigger, GET /api/v1/index/status
│   ├── mcp/
│   │   ├── tools.ts                # MCP tool + resource implementations
│   │   └── server.ts               # MCP server (stdio + SSE transports)
│   └── rag/
│       ├── context-builder.ts      # Token-budgeted context window assembly
│       └── prompt-templates.ts     # System prompts for RAG use
├── tests/
│   ├── unit/
│   │   ├── chunker.test.ts
│   │   ├── hybrid.test.ts
│   │   └── config.test.ts
│   └── integration/
│       ├── pipeline.test.ts
│       └── api.test.ts
├── config.yaml                     # Default configuration (copy to ~/.sqmd/)
├── package.json
└── tsconfig.json
```

---

## Getting Started

### Prerequisites

- **Node.js 22+** — required for native ESM and modern `node:` builtins
- **pnpm** (recommended) or npm

```bash
node --version   # must be ≥ 22.0.0
```

### Installation

**From source:**

```bash
git clone <repo>
cd sqmd
npm install       # or: pnpm install
npm run build     # compiles TypeScript → dist/
```

**Global install (after build):**

```bash
npm install -g .
sqmd --version
```

### Initial Configuration

Write the default configuration file:

```bash
node dist/index.js config --init ~/.sqmd/config.yaml
```

Then edit `~/.sqmd/config.yaml` to set the directories you want to index:

```yaml
paths:
  watch_dirs:
    - "~/notes"
    - "~/work/docs"
  db_path: "~/.sqmd/lancedb"
```

The tool resolves config in this order:
1. Path from `--config` flag
2. `$SQMD_CONFIG` environment variable
3. `~/.sqmd/config.yaml`
4. `./config.yaml` (project-local)
5. Built-in defaults

### First Index

```bash
node dist/index.js index
```

On first run, the embedding model (`nomic-ai/nomic-embed-text-v1.5`, ~270 MB) is downloaded and cached to `~/.sqmd/models`. Subsequent runs use the cached model.

---

## CLI Reference

All commands accept `--config <path>` to specify a non-default config file.

### `index`

Scan and index Markdown files.

```
sqmd index [options]

Options:
  --path <path>     Directory or single file to index (default: watch_dirs from config)
  --force           Re-index all files, even if content is unchanged
  --watch           Keep running and re-index files as they change
  --config <path>   Config file path
```

**Examples:**

```bash
# Index default watch_dirs
node dist/index.js index

# Index a specific directory
node dist/index.js index --path ~/work/docs

# Force full re-index (ignores change detection)
node dist/index.js index --force

# Index then keep watching
node dist/index.js index --watch
```

Progress is printed per-file. A summary reports indexed, skipped (unchanged), and errored files.

---

### `search`

Query the index from the terminal.

```
sqmd search <query> [options]

Arguments:
  query             Natural language search query (quote multi-word queries)

Options:
  --top-k <n>       Number of results to return (default: 10)
  --mode <mode>     hybrid | vector | fts  (default: hybrid)
  --filter <path>   Restrict results to files whose path contains this substring
  --config <path>   Config file path
```

**Examples:**

```bash
# Semantic search
node dist/index.js search "how to configure authentication"

# Full-text only
node dist/index.js search "OAuth token refresh" --mode fts

# Top 5 results scoped to a directory
node dist/index.js search "deployment strategy" --top-k 5 --filter /work/
```

Output includes file path, heading breadcrumb, score, line range, and a 200-character snippet.

---

### `serve`

Start the HTTP REST API server.

```
sqmd serve [options]

Options:
  --host <host>     Bind address (default: 127.0.0.1)
  --port <port>     Port (default: 7832)
  --config <path>   Config file path
```

```bash
node dist/index.js serve
# → Listening on http://127.0.0.1:7832
```

If `watcher.enabled` is `true` in config, the file watcher starts automatically alongside the API server.

---

### `mcp`

Start the Model Context Protocol server.

```
sqmd mcp [options]

Options:
  --transport <transport>   stdio | sse  (default: stdio)
  --port <port>             Port for SSE transport (default: 7833)
  --config <path>           Config file path
```

```bash
# For Claude Desktop / Claude Code (stdio)
node dist/index.js mcp

# For HTTP-based agents (SSE)
node dist/index.js mcp --transport sse --port 7833
```

---

### `status`

Display index statistics.

```bash
node dist/index.js status
```

Output:

```
sqmd Status
────────────────────────────────────────
DB path:       ~/.sqmd/lancedb
Files indexed: 142
Chunks stored: 3847
Last indexed:  3/17/2026, 09:14:32 AM
Watch dirs:    ~/notes
Embedder:      transformers / nomic-ai/nomic-embed-text-v1.5
```

---

### `config`

Manage configuration.

```bash
# Write default config to a path
node dist/index.js config --init ~/.sqmd/config.yaml
```

---

## REST API

Base URL: `http://localhost:7832/api/v1`

All responses are JSON. Errors use `{ "error": "...", "message": "..." }`.

### Search Endpoints

#### `POST /api/v1/search`

```json
// Request body
{
  "query": "how to set up two-factor authentication",
  "top_k": 10,
  "mode": "hybrid",
  "filter_path": "/notes/security",
  "include_context": false,
  "rerank": false
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `query` | string | **required** | Natural language query |
| `top_k` | number | 10 | Number of results |
| `mode` | `"hybrid"` \| `"vector"` \| `"fts"` | `"hybrid"` | Search algorithm |
| `filter_path` | string | — | Path substring filter |
| `include_context` | boolean | false | Include breadcrumb-prefixed `text` field |
| `rerank` | boolean | config default | Apply cross-encoder reranking |

```json
// Response
{
  "results": [
    {
      "chunk_id": "abc123:2:0",
      "file_id": "sha256-of-path",
      "file_path": "/notes/security/2fa.md",
      "heading_path": "Setup > Two-Factor Authentication",
      "heading_text": "Two-Factor Authentication",
      "heading_level": 2,
      "section_index": 2,
      "chunk_index": 0,
      "text_raw": "Enable 2FA by navigating to Settings...",
      "token_count": 87,
      "score": 0.0312,
      "line_start": 45,
      "line_end": 72
    }
  ],
  "query": "how to set up two-factor authentication",
  "total": 10,
  "duration_ms": 43
}
```

#### `GET /api/v1/search?q=...`

```bash
curl "http://localhost:7832/api/v1/search?q=configure+auth&top_k=5&mode=vector"
```

Accepts the same parameters as POST, via query string. Useful for quick browser/curl queries.

---

### Document Endpoints

#### `GET /api/v1/documents`

Returns a paginated list of indexed files.

```bash
curl "http://localhost:7832/api/v1/documents?limit=20&offset=0"
```

```json
{
  "documents": [
    {
      "file_id": "...",
      "file_path": "/notes/setup.md",
      "file_hash": "...",
      "chunk_count": 12,
      "indexed_at": 1742215200000,
      "status": "indexed"
    }
  ],
  "total": 142,
  "limit": 20,
  "offset": 0
}
```

#### `GET /api/v1/documents/:fileId`

Returns metadata and all stored chunks for a specific file.

```bash
curl "http://localhost:7832/api/v1/documents/<file_id>"
```

#### `GET /api/v1/documents/:fileId/raw`

Returns the raw Markdown content of the file (read from disk).

---

### Index Management Endpoints

#### `POST /api/v1/index/trigger`

Trigger a re-index operation asynchronously.

```json
// Request
{
  "paths": ["/notes/work"],   // optional; defaults to watch_dirs
  "force": false              // optional
}
```

```json
// Response 202
{
  "job_id": "job-1710000000000",
  "status": "queued"
}
```

#### `GET /api/v1/index/status`

Returns current index statistics and watcher state.

```json
{
  "fileCount": 142,
  "chunkCount": 3847,
  "watcherRunning": true,
  "dbPath": "~/.sqmd/lancedb"
}
```

#### `GET /api/v1/index/jobs/:jobId`

Returns the progress of a triggered index job.

```json
{
  "job_id": "job-1710000000000",
  "status": "completed",
  "indexed": 5,
  "skipped": 137,
  "errors": 0,
  "started_at": 1710000000000,
  "completed_at": 1710000003500
}
```

---

### Health & Metrics Endpoints

#### `GET /api/v1/health`

```json
{
  "status": "ok",
  "db": "connected",
  "embedder": "transformers / nomic-ai/nomic-embed-text-v1.5",
  "watcher": "running",
  "uptime_seconds": 3600
}
```

#### `GET /api/v1/metrics`

Search latency percentiles and throughput counters.

---

### Authentication

Set `api.api_key` in config to a non-empty string to enable bearer token auth. All `/api/*` requests must include:

```
Authorization: Bearer <your-api-key>
```

If `api_key` is empty (the default), authentication is disabled — suitable for local use.

---

## MCP Server

sqmd exposes a full Model Context Protocol server, allowing AI agents like Claude to search your notes directly from conversations.

### MCP Tools

| Tool | Required Args | Optional Args | Description |
|------|--------------|---------------|-------------|
| `search_documents` | `query` | `top_k`, `mode`, `filter_path`, `include_context` | Primary semantic/hybrid search |
| `get_document` | `file_path` | `section` | Fetch a file's metadata and chunks, optionally filtered to a heading |
| `list_documents` | — | `path_prefix`, `limit` | Browse the indexed file tree |
| `trigger_index` | — | `paths`, `force` | Request re-indexing |
| `get_index_status` | — | — | Index health and stats |

**`search_documents` example (Claude tool call):**

```json
{
  "query": "database migration strategy",
  "top_k": 5,
  "mode": "hybrid",
  "include_context": true
}
```

When `include_context` is `true`, the response includes a pre-assembled `context` string ready to inject into a prompt.

### MCP Resources

Every indexed file is exposed as a resource with URI scheme `md://<absolute-path>`:

```
md:///Users/alice/notes/architecture.md
```

Agents can read raw Markdown content directly via the resource protocol without going through the search tool.

### Claude Desktop Integration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sqmd": {
      "command": "node",
      "args": ["/path/to/sqmd/dist/index.js", "mcp"],
      "env": {
        "SQMD_CONFIG": "/Users/alice/.sqmd/config.yaml"
      }
    }
  }
}
```

Or, if installed globally:

```json
{
  "mcpServers": {
    "sqmd": {
      "command": "sqmd",
      "args": ["mcp"],
      "env": {
        "SQMD_CONFIG": "~/.sqmd/config.yaml"
      }
    }
  }
}
```

### Claude Code Integration

Add to your `.mcp.json` or use `claude mcp add`:

```bash
claude mcp add sqmd -- node /path/to/dist/index.js mcp
```

---

## RAG Layer

The `src/rag/` module provides utilities for AI agent memory management.

**`buildContext(results, maxTokens)`** assembles search results into a single context string that fits within a token budget. Each chunk is preceded by attribution metadata:

```
Source: /notes/architecture/decisions.md
Section: Architecture > Database > Schema Design
Lines: 45-72

We chose PostgreSQL because it provides...

---

Source: /notes/architecture/decisions.md
Section: Architecture > Database > Migrations
Lines: 100-134

All schema changes are managed via...
```

The `search_documents` MCP tool returns this context when `include_context: true`. Inject it directly into the system prompt or user message of your agent.

**`ragSystemPrompt()`** returns a baseline system prompt for RAG-style agents instructing the model on how to interpret sourced context.

---

## Configuration Reference

All settings live in `config.yaml` (or the file pointed to by `--config` / `$SQMD_CONFIG`).

### `paths`

| Key | Default | Description |
|-----|---------|-------------|
| `watch_dirs` | `["~/notes"]` | Directories to index and watch |
| `db_path` | `~/.sqmd/lancedb` | LanceDB database location |
| `model_cache_dir` | `~/.sqmd/models` | Directory for cached embedding models |

### `embeddings`

| Key | Default | Description |
|-----|---------|-------------|
| `backend` | `"transformers"` | `"transformers"` (ONNX) or `"ollama"` |
| `model` | `"nomic-ai/nomic-embed-text-v1.5"` | HuggingFace model ID or Ollama model name |
| `batch_size` | `64` | Texts per embedding batch |
| `ollama_base_url` | `"http://localhost:11434"` | Ollama server URL (used only when backend is `"ollama"`) |

### `chunking`

| Key | Default | Description |
|-----|---------|-------------|
| `max_tokens` | `512` | Maximum tokens per chunk before splitting |
| `min_chars` | `50` | Minimum characters; shorter chunks are discarded |
| `include_breadcrumb` | `true` | Prepend `"Section: H1 > H2 > H3\n\n"` to chunk text for richer embeddings |
| `overlap_tokens` | `64` | Carry-over tokens between adjacent sub-chunks when a section is split |

### `search`

| Key | Default | Description |
|-----|---------|-------------|
| `default_top_k` | `10` | Default number of results |
| `rrf_k` | `60` | RRF constant (`k` in `1/(k + rank)`) — higher values reduce outlier impact |
| `rerank` | `false` | Enable cross-encoder reranking globally |
| `rerank_model` | `"cross-encoder/ms-marco-MiniLM-L-6-v2"` | ONNX cross-encoder model |
| `rerank_top_n` | `20` | Fetch this many candidates before reranking to `top_k` |

### `watcher`

| Key | Default | Description |
|-----|---------|-------------|
| `enabled` | `true` | Auto-start file watcher when `serve` runs |
| `debounce_ms` | `3000` | Wait this long after the last change before re-indexing |
| `extensions` | `[".md", ".mdx"]` | File extensions to watch |
| `ignore_patterns` | `["**/.git/**", "**/node_modules/**"]` | Glob patterns to ignore |

### `api`

| Key | Default | Description |
|-----|---------|-------------|
| `host` | `"127.0.0.1"` | Bind address |
| `port` | `7832` | HTTP port |
| `api_key` | `""` | API key for bearer auth; empty disables auth |

### `mcp`

| Key | Default | Description |
|-----|---------|-------------|
| `transport` | `"stdio"` | `"stdio"` or `"sse"` |
| `sse_port` | `7833` | Port for SSE transport |

### Environment Variable Overrides

| Variable | Config Key |
|----------|------------|
| `SQMD_CONFIG` | Config file path |
| `SQMD_DB_PATH` | `paths.db_path` |
| `SQMD_API_PORT` | `api.port` |

---

## Architecture Deep Dive

### Chunking Algorithm

The chunker (`src/ingestion/chunker.ts`) implements a hierarchical, token-aware strategy inspired by PageIndex's TOC-based approach:

1. **Parse** — `remark-parse` converts Markdown to an mdast AST with precise line number tracking.

2. **Build section tree** — The AST walker maintains a heading stack. Every content block (paragraphs, lists, code blocks) is assigned to its nearest ancestor heading.

3. **Inject breadcrumb** — When `include_breadcrumb` is enabled, each chunk's `text` field is prefixed with `"Section: H1 > H2 > H3\n\n"`. This prefix is embedded alongside the content, giving the vector model full hierarchical context. The `text_raw` field always contains the unprefixed content for display.

4. **Token-aware splitting** — Sections exceeding `max_tokens` (default 512) are split at paragraph boundaries. The last paragraph of each chunk is carried over into the next when it fits within `overlap_tokens` (default 64), maintaining cross-chunk coherence.

5. **Stub filtering** — Chunks with `text_raw.length < min_chars` (default 50) are discarded.

6. **Preamble handling** — Content before the first heading becomes `heading_level = 0` with the filename stem as the breadcrumb.

Token estimation uses `Math.ceil(words * 1.3)` — a fast approximation that overestimates slightly to avoid over-long chunks.

---

### Embedding Pipeline

The pipeline (`src/ingestion/pipeline.ts`) orchestrates indexing with bounded parallelism:

```
scanDirectory()
    │
    ├── hashFile() → compare with stored hash
    │   └── skip if unchanged (unless --force)
    │
    ├── parseMarkdown() → ParsedDocument
    ├── chunkDocument() → ChunkRecord[] (vectors empty)
    │
    └── [collected into batches of batch_size * 4]
            │
            ├── embedder.embed(texts) → number[][]
            └── upsertChunks() + upsertFile() → LanceDB
```

Files are processed with `p-limit(4)` concurrency. Embedding batches are flushed when the pending buffer exceeds `batch_size * 4` (default 256 chunks), balancing memory usage and throughput.

After the first bulk index, `createIndexes()` builds:
- **IVF-PQ vector index** — `num_partitions: 256`, `num_sub_vectors: 96` (cosine metric)
- **Tantivy FTS index** — on the `text` field

---

### Hybrid Search & RRF

`src/search/hybrid.ts` fuses vector and full-text results using **Reciprocal Rank Fusion**:

```
query
  │
  ├── prepareQueryForEmbedding()  →  "search_query: <query>"  (nomic prefix)
  │
  ├── vectorSearch(vector, k*3)   →  ranked list A
  └── ftsSearch(query, k*3)       →  ranked list B
                │
                ▼
          RRF score(d) = Σ 1 / (60 + rank_i)
                │
                ▼
          top-k by RRF score  →  SearchResult[]
```

The RRF constant `k=60` (configurable via `search.rrf_k`) controls how steeply rank differences penalise lower-ranked results. Duplicate chunk IDs across lists are merged, summing their RRF scores.

**Search modes:**
- `hybrid` — RRF fusion of both lists (recommended)
- `vector` — pure cosine ANN search only
- `fts` — pure BM25 full-text search only

**Optional reranking:** When enabled, the initial `top_k` result set is expanded to `rerank_top_n` (default 20) and scored by a cross-encoder (`cross-encoder/ms-marco-MiniLM-L-6-v2` ONNX), which jointly processes query + passage for higher-precision ranking.

---

### Incremental Indexing

Change detection uses two layers:

1. **Content hash** (`src/ingestion/fingerprint.ts`) — SHA-256 of file contents stored in the `files` table. On re-scan, the current hash is compared against the stored one; identical hashes skip the file entirely.

2. **File watcher** (`src/watcher/`) — chokidar monitors `watch_dirs` for `add`, `change`, and `unlink` events. Events are debounced (default 3 s) to coalesce rapid saves. On `unlink`, the file's chunks are deleted from both tables.

---

### LanceDB Schema

Two tables are maintained:

**`chunks`** — one row per chunk (core search table):

| Column | Type | Description |
|--------|------|-------------|
| `chunk_id` | Utf8 | `"{file_hash}:{section_idx}:{chunk_idx}"` |
| `file_id` | Utf8 | SHA-256 of the absolute file path |
| `file_path` | Utf8 | Absolute path |
| `file_hash` | Utf8 | Content hash (change detection) |
| `file_mtime` | Float64 | Epoch timestamp |
| `heading_path` | Utf8 | `"H1 > H2 > H3"` |
| `heading_level` | Int8 | 0 = preamble, 1–6 = heading depth |
| `heading_text` | Utf8 | Verbatim heading text |
| `section_index` | Int32 | Index of section within the file |
| `chunk_index` | Int32 | Index of chunk within the section |
| `text` | Utf8 | Breadcrumb-prefixed text (embedded) |
| `text_raw` | Utf8 | Display text (no breadcrumb) |
| `token_count` | Int32 | Approximate token count |
| `parent_headings` | List\<Utf8\> | Ancestor heading texts |
| `depth` | Int8 | Heading depth |
| `vector` | FixedSizeList(768, Float32) | Embedding vector |
| `line_start` | Int32 | First line in the source file |
| `line_end` | Int32 | Last line in the source file |

**`files`** — one row per indexed file:

| Column | Type | Description |
|--------|------|-------------|
| `file_id` | Utf8 | SHA-256 of path |
| `file_path` | Utf8 | Absolute path |
| `file_hash` | Utf8 | Content hash |
| `file_mtime` | Float64 | Last modification time |
| `chunk_count` | Int32 | Number of chunks |
| `indexed_at` | Float64 | Indexing timestamp |
| `status` | Utf8 | `"indexed"` \| `"error"` \| `"skipped"` |
| `error_msg` | Utf8 | Error details if status is `"error"` |

Vector dimension is `768` for `nomic-embed-text-v1.5`. For `bge-m3`, change `VECTOR_DIM` in `src/store/schema.ts` to `1024` before first index.

---

## Embedding Backends

### Transformers.js (Default)

Uses `@huggingface/transformers` v3 with the ONNX runtime. No Python, no separate process. Models are downloaded once and cached locally.

**Model:** `nomic-ai/nomic-embed-text-v1.5` (768-dim, ~270 MB)

The nomic model uses asymmetric prefixes for higher accuracy:
- Documents are embedded as `"search_document: <text>"`
- Queries are embedded as `"search_query: <text>"`

To use `bge-m3` (1024-dim, multilingual):

```yaml
embeddings:
  model: "BAAI/bge-m3"
```

Also update `VECTOR_DIM = 1024` in `src/store/schema.ts` and rebuild.

### Ollama

Point sqmd at a running [Ollama](https://ollama.ai) instance:

```yaml
embeddings:
  backend: "ollama"
  model: "nomic-embed-text"
  ollama_base_url: "http://localhost:11434"
```

Ollama must be running with the model already pulled (`ollama pull nomic-embed-text`).

---

## Performance

| Operation | Typical Time | Notes |
|-----------|-------------|-------|
| Initial index (50k chunks) | 2–4 min | CPU; ONNX SIMD; batch size 64 |
| Single file re-index | < 1 s | Hash skip + targeted upsert |
| Search (hybrid, no rerank) | < 100 ms | IVF-PQ ANN + Tantivy BM25 + RRF |
| Search (with reranking) | 200–500 ms | Cross-encoder inference per candidate |
| Memory (idle) | ~400 MB | ONNX model ~200 MB + mmap'd LanceDB |

Embedding throughput scales with CPU core count — the ONNX runtime uses SIMD and will use available threads automatically.

---

## Development

### Running Tests

```bash
npm test              # run all tests once (vitest)
npm run test:watch    # watch mode
```

Test coverage:
- `tests/unit/chunker.test.ts` — hierarchical chunking, breadcrumbs, overlap, stub filtering
- `tests/unit/hybrid.test.ts` — RRF fusion logic (mocked DB)
- `tests/unit/config.test.ts` — config loading, validation, env var overrides
- `tests/integration/pipeline.test.ts` — full pipeline with temp LanceDB instance
- `tests/integration/api.test.ts` — Hono app endpoints (health, search, documents, index)

### Building

```bash
npm run build      # tsc → dist/
npm run dev        # tsx src/index.ts (no build step, for development)
```

### Project Conventions

- All source imports use `.js` extension for ESM compatibility (TypeScript resolves to `.ts` at compile time)
- Node built-ins use the `node:` prefix (`node:fs`, `node:path`, `node:crypto`)
- `src/config/schema.ts` is the single source of truth for all config types — do not duplicate config fields elsewhere
- Embedder is lazy-loaded on first use to avoid model download cost at startup for non-indexing commands
- `p-limit` concurrency default is 4 files; adjust `concurrency` in `pipeline.run()` for I/O-bound vs CPU-bound workloads

---

## Troubleshooting

**`Database may not be initialized. Run sqmd index first.`**

The LanceDB database doesn't exist yet. Run `node dist/index.js index` to create it.

---

**`Path not found: ~/notes`**

The tilde in `watch_dirs` is expanded at runtime. Ensure the directory exists. Use an absolute path to be explicit:

```yaml
paths:
  watch_dirs:
    - "/Users/alice/notes"
```

---

**First index takes a long time**

The embedding model (~270 MB) is being downloaded on first use. Subsequent runs use the cache at `~/.sqmd/models`. Check disk space and network connectivity if the download stalls.

---

**Search returns no results**

1. Run `node dist/index.js status` to verify files were indexed
2. Check `errors` count — some files may have failed to parse
3. Try `--mode fts` first to verify full-text search works independently
4. Ensure you're using the same model for both indexing and search (config `embeddings.model`)

---

**Vector dimension mismatch error**

If you change the embedding model after an initial index, the stored vector dimension will mismatch the new model. Delete the database and re-index:

```bash
rm -rf ~/.sqmd/lancedb
node dist/index.js index --force
```

---

**Ollama connection refused**

Ensure Ollama is running (`ollama serve`) and the model is pulled (`ollama pull nomic-embed-text`). Verify `ollama_base_url` in config.

---

**Port 7832 already in use**

Override with `--port` or in config:

```yaml
api:
  port: 8832
```
