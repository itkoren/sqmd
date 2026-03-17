import type { SearchResult } from '../store/schema.js';
import { estimateTokens } from '../ingestion/chunker.js';

export function buildContext(results: SearchResult[], maxTokens: number): string {
  const parts: string[] = [];
  let tokenCount = 0;

  for (const result of results) {
    const attribution = formatAttribution(result);
    const content = result.text_raw;

    const chunk = `${attribution}\n${content}`;
    const chunkTokens = estimateTokens(chunk);

    if (tokenCount + chunkTokens > maxTokens && parts.length > 0) {
      break;
    }

    parts.push(chunk);
    tokenCount += chunkTokens;
  }

  return parts.join('\n\n---\n\n');
}

function formatAttribution(result: SearchResult): string {
  const lines: string[] = [];

  lines.push(`Source: ${result.file_path}`);

  if (result.heading_path) {
    lines.push(`Section: ${result.heading_path}`);
  }

  lines.push(`Lines: ${result.line_start}-${result.line_end}`);

  return lines.join('\n');
}
