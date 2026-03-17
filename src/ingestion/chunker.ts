import * as path from 'node:path';
import type { ParsedDocument, Section } from './parser.js';
import type { ChunkRecord } from '../store/schema.js';

export interface ChunkInput {
  fileId: string;
  fileHash: string;
  filePath: string;
  fileMtime: number;
  maxTokens: number;
  minChars: number;
  overlapTokens: number;
  includeBreadcrumb: boolean;
}

export interface ChunkOptions {
  maxTokens: number;
  minChars: number;
  overlapTokens: number;
  includeBreadcrumb: boolean;
}

// Rough token count estimate
export function estimateTokens(text: string): number {
  return Math.ceil(text.split(/\s+/).length * 1.3);
}

function buildBreadcrumb(headingPath: string, filePath: string): string {
  const stem = path.basename(filePath, path.extname(filePath));
  if (headingPath && headingPath.length > 0) {
    return `Section: ${headingPath}\n\n`;
  }
  return `Section: ${stem}\n\n`;
}

function splitIntoParagraphs(text: string): string[] {
  return text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
}

interface RawChunk {
  text: string; // with breadcrumb prefix
  textRaw: string; // without breadcrumb
  lineStart: number;
  lineEnd: number;
  chunkIndex: number;
}

function splitSectionIntoChunks(
  content: string,
  breadcrumb: string,
  lineStart: number,
  lineEnd: number,
  maxTokens: number,
  overlapTokens: number,
  startChunkIndex: number
): RawChunk[] {
  const paragraphs = splitIntoParagraphs(content);
  const chunks: RawChunk[] = [];
  let currentParagraphs: string[] = [];
  let chunkIndex = startChunkIndex;

  for (const para of paragraphs) {
    const candidate = [...currentParagraphs, para].join('\n\n');
    const tokens = estimateTokens(breadcrumb + candidate);

    if (tokens > maxTokens && currentParagraphs.length > 0) {
      // Flush current chunk
      const chunkText = currentParagraphs.join('\n\n');
      chunks.push({
        text: breadcrumb + chunkText,
        textRaw: chunkText,
        lineStart,
        lineEnd,
        chunkIndex: chunkIndex++,
      });

      // Start overlap: carry over last few "tokens" worth of content
      // Simple approximation: carry over last paragraph if it's within overlapTokens
      const lastPara = currentParagraphs[currentParagraphs.length - 1] ?? '';
      const lastParaTokens = estimateTokens(lastPara);
      if (lastParaTokens <= overlapTokens) {
        currentParagraphs = [lastPara, para];
      } else {
        currentParagraphs = [para];
      }
    } else {
      currentParagraphs.push(para);
    }
  }

  // Flush remaining
  if (currentParagraphs.length > 0) {
    const chunkText = currentParagraphs.join('\n\n');
    chunks.push({
      text: breadcrumb + chunkText,
      textRaw: chunkText,
      lineStart,
      lineEnd,
      chunkIndex: chunkIndex++,
    });
  }

  return chunks;
}

export function chunkDocument(
  doc: ParsedDocument,
  input: ChunkInput
): ChunkRecord[] {
  const results: ChunkRecord[] = [];
  const { fileId, fileHash, filePath, fileMtime, maxTokens, minChars, overlapTokens, includeBreadcrumb } = input;

  for (let sectionIdx = 0; sectionIdx < doc.sections.length; sectionIdx++) {
    const section = doc.sections[sectionIdx]!;

    const breadcrumb = includeBreadcrumb
      ? buildBreadcrumb(section.headingPath, filePath)
      : '';

    const content = section.content;
    const totalTokens = estimateTokens(breadcrumb + content);

    let rawChunks: RawChunk[];

    if (totalTokens <= maxTokens) {
      // Single chunk for this section
      rawChunks = [
        {
          text: breadcrumb + content,
          textRaw: content,
          lineStart: section.lineStart,
          lineEnd: section.lineEnd,
          chunkIndex: 0,
        },
      ];
    } else {
      // Split into multiple chunks
      rawChunks = splitSectionIntoChunks(
        content,
        breadcrumb,
        section.lineStart,
        section.lineEnd,
        maxTokens,
        overlapTokens,
        0
      );
    }

    for (const raw of rawChunks) {
      // Filter stubs
      if (raw.textRaw.length < minChars) continue;

      const chunkId = `${fileHash}:${sectionIdx}:${raw.chunkIndex}`;
      const tokenCount = estimateTokens(raw.textRaw);

      results.push({
        chunk_id: chunkId,
        file_id: fileId,
        file_path: filePath,
        file_hash: fileHash,
        file_mtime: fileMtime,
        heading_path: section.headingPath,
        heading_level: section.headingLevel,
        heading_text: section.headingText,
        section_index: sectionIdx,
        chunk_index: raw.chunkIndex,
        text: raw.text,
        text_raw: raw.textRaw,
        token_count: tokenCount,
        parent_headings: section.parentHeadings,
        depth: section.headingLevel,
        vector: [], // Will be filled during embedding
        line_start: raw.lineStart,
        line_end: raw.lineEnd,
      });
    }
  }

  return results;
}
