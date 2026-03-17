# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

### Changed

### Fixed

### Deprecated

### Removed

### Security

---

## [0.1.1] - 2026-03-17

### Changed
- Scoped npm package name to `@itkoren/sqmd` (unscoped `sqmd` rejected by npm as too similar to `send`)
- Switched npm publish from `NPM_TOKEN` secret to OIDC trusted publishing (`id-token: write` + `--provenance`)
- Replaced deprecated `actions/create-release@v1` with `gh release create`; existing releases updated via `gh release edit` fallback

### Fixed
- Added `repository.url` to `package.json` (required by npm provenance verification)
- Fixed TS2341 error in `src/search/reranker.ts` — restored bracket notation for private field access with `biome-ignore` comment
- Added `"performance": { "noDelete": "off" }` to `biome.json` to prevent Biome unsafe fix from converting `delete process.env[X]` to broken `process.env.X = undefined`

---

## [0.1.0] - 2026-03-17

### Added
- Local semantic search engine for Markdown files (`sqmd` CLI)
- Ingestion pipeline: directory scanner, remark-based Markdown parser, token-aware chunker with configurable overlap
- Content fingerprinting via SHA-256 (`hashFile`, `hashPath`) for incremental re-indexing
- LanceDB vector store with Apache Arrow schema (`ChunkRecord`, `FileRecord`)
- HuggingFace Transformers local embeddings with nomic-embed-text asymmetric prefix support (`search_query:` / `search_document:`)
- Ollama embedding backend alternative
- Hybrid search combining vector similarity and BM25 full-text search
- Cross-encoder reranker (`CrossEncoderReranker`) using `@huggingface/transformers` text-classification pipeline
- REST API via Hono + `@hono/node-server` (search, documents, index status/trigger, health endpoints)
- MCP server integration for tool-based access
- File watcher daemon using chokidar for live re-indexing
- RAG context builder with token-budget capping and attribution (Source / Section / Lines)
- RAG prompt templates (`ragSystemPrompt`, `formatResults`, `buildRagPrompt`)
- YAML configuration with Zod validation and env-var overrides
- Biome 1.9 for lint + format (`npm run check`)
- Vitest 2.x test suite with workspace projects (`unit` / `integration`) and v8 coverage (80% thresholds)
- GitHub Actions CI workflow (push/PR: type-check → lint → test → coverage → build)
- GitHub Actions release workflow (tag `v*.*.*`: test → build → GitHub Release → npm publish with provenance)
