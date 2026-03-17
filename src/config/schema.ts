import { z } from 'zod';

export const PathsSchema = z.object({
  watch_dirs: z.array(z.string()).default(['~/notes']),
  db_path: z.string().default('~/.sqmd/lancedb'),
  model_cache_dir: z.string().default('~/.sqmd/models'),
});

export const EmbeddingsSchema = z.object({
  backend: z.enum(['transformers', 'ollama']).default('transformers'),
  model: z.string().default('nomic-ai/nomic-embed-text-v1.5'),
  batch_size: z.number().int().positive().default(64),
  ollama_base_url: z.string().url().default('http://localhost:11434'),
});

export const ChunkingSchema = z.object({
  max_tokens: z.number().int().positive().default(512),
  min_chars: z.number().int().nonnegative().default(50),
  include_breadcrumb: z.boolean().default(true),
  overlap_tokens: z.number().int().nonnegative().default(64),
});

export const SearchSchema = z.object({
  default_top_k: z.number().int().positive().default(10),
  rrf_k: z.number().int().positive().default(60),
  rerank: z.boolean().default(false),
  rerank_model: z.string().default('cross-encoder/ms-marco-MiniLM-L-6-v2'),
  rerank_top_n: z.number().int().positive().default(20),
});

export const WatcherSchema = z.object({
  enabled: z.boolean().default(true),
  debounce_ms: z.number().int().positive().default(3000),
  extensions: z.array(z.string()).default(['.md', '.mdx']),
  ignore_patterns: z.array(z.string()).default(['**/.git/**', '**/node_modules/**']),
});

export const ApiSchema = z.object({
  host: z.string().default('127.0.0.1'),
  port: z.number().int().min(1).max(65535).default(7832),
  api_key: z.string().default(''),
});

export const McpSchema = z.object({
  transport: z.enum(['stdio', 'sse']).default('stdio'),
  sse_port: z.number().int().min(1).max(65535).default(7833),
});

export const ConfigSchema = z.object({
  paths: PathsSchema.default({}),
  embeddings: EmbeddingsSchema.default({}),
  chunking: ChunkingSchema.default({}),
  search: SearchSchema.default({}),
  watcher: WatcherSchema.default({}),
  api: ApiSchema.default({}),
  mcp: McpSchema.default({}),
});

export type Config = z.infer<typeof ConfigSchema>;
export type PathsConfig = z.infer<typeof PathsSchema>;
export type EmbeddingsConfig = z.infer<typeof EmbeddingsSchema>;
export type ChunkingConfig = z.infer<typeof ChunkingSchema>;
export type SearchConfig = z.infer<typeof SearchSchema>;
export type WatcherConfig = z.infer<typeof WatcherSchema>;
export type ApiConfig = z.infer<typeof ApiSchema>;
export type McpConfig = z.infer<typeof McpSchema>;
