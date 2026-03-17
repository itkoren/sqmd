import { z } from 'zod';

export const SearchRequestSchema = z.object({
  query: z.string().min(1),
  top_k: z.number().int().positive().default(10),
  mode: z.enum(['hybrid', 'vector', 'fts']).default('hybrid'),
  filter_path: z.string().optional(),
  include_context: z.boolean().default(false),
  rerank: z.boolean().default(false),
});

export type SearchRequest = z.infer<typeof SearchRequestSchema>;

export const SearchResultItemSchema = z.object({
  chunk_id: z.string(),
  file_id: z.string(),
  file_path: z.string(),
  heading_path: z.string(),
  heading_text: z.string(),
  heading_level: z.number(),
  section_index: z.number(),
  chunk_index: z.number(),
  text_raw: z.string(),
  token_count: z.number(),
  score: z.number(),
  line_start: z.number(),
  line_end: z.number(),
});

export type SearchResultItem = z.infer<typeof SearchResultItemSchema>;

export const SearchResponseSchema = z.object({
  results: z.array(SearchResultItemSchema),
  query: z.string(),
  total: z.number(),
  duration_ms: z.number(),
});

export type SearchResponse = z.infer<typeof SearchResponseSchema>;

export const IndexRequestSchema = z.object({
  paths: z.array(z.string()).optional(),
  force: z.boolean().default(false),
});

export type IndexRequest = z.infer<typeof IndexRequestSchema>;

export const PaginationSchema = z.object({
  page: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type Pagination = z.infer<typeof PaginationSchema>;
