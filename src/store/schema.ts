import * as arrow from 'apache-arrow';

export const VECTOR_DIM = 768;

export const CHUNKS_SCHEMA = new arrow.Schema([
  new arrow.Field('chunk_id', new arrow.Utf8(), false),
  new arrow.Field('file_id', new arrow.Utf8(), false),
  new arrow.Field('file_path', new arrow.Utf8(), false),
  new arrow.Field('file_hash', new arrow.Utf8(), false),
  new arrow.Field('file_mtime', new arrow.Float64(), false),
  new arrow.Field('heading_path', new arrow.Utf8(), false),
  new arrow.Field('heading_level', new arrow.Int8(), false),
  new arrow.Field('heading_text', new arrow.Utf8(), false),
  new arrow.Field('section_index', new arrow.Int32(), false),
  new arrow.Field('chunk_index', new arrow.Int32(), false),
  new arrow.Field('text', new arrow.Utf8(), false),
  new arrow.Field('text_raw', new arrow.Utf8(), false),
  new arrow.Field('token_count', new arrow.Int32(), false),
  new arrow.Field(
    'parent_headings',
    new arrow.List(new arrow.Field('item', new arrow.Utf8(), true)),
    false
  ),
  new arrow.Field('depth', new arrow.Int8(), false),
  new arrow.Field(
    'vector',
    new arrow.FixedSizeList(VECTOR_DIM, new arrow.Field('item', new arrow.Float32(), true)),
    false
  ),
  new arrow.Field('line_start', new arrow.Int32(), false),
  new arrow.Field('line_end', new arrow.Int32(), false),
]);

export const FILES_SCHEMA = new arrow.Schema([
  new arrow.Field('file_id', new arrow.Utf8(), false),
  new arrow.Field('file_path', new arrow.Utf8(), false),
  new arrow.Field('file_hash', new arrow.Utf8(), false),
  new arrow.Field('file_mtime', new arrow.Float64(), false),
  new arrow.Field('chunk_count', new arrow.Int32(), false),
  new arrow.Field('indexed_at', new arrow.Float64(), false),
  new arrow.Field('status', new arrow.Utf8(), false),
  new arrow.Field('error_msg', new arrow.Utf8(), true),
]);

export interface ChunkRecord {
  chunk_id: string;
  file_id: string;
  file_path: string;
  file_hash: string;
  file_mtime: number;
  heading_path: string;
  heading_level: number;
  heading_text: string;
  section_index: number;
  chunk_index: number;
  text: string;
  text_raw: string;
  token_count: number;
  parent_headings: string[];
  depth: number;
  vector: number[];
  line_start: number;
  line_end: number;
}

export interface FileRecord {
  file_id: string;
  file_path: string;
  file_hash: string;
  file_mtime: number;
  chunk_count: number;
  indexed_at: number;
  status: 'indexed' | 'error' | 'skipped';
  error_msg: string;
}

export interface SearchResult extends ChunkRecord {
  score: number;
  rank?: number;
}
