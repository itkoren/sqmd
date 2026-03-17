import type { SearchResult } from '../store/schema.js';

export function ragSystemPrompt(): string {
  return `You are a helpful assistant that answers questions based on provided document excerpts.

When answering:
- Base your response on the provided context documents
- Cite the source file and section when referencing specific information
- If the context doesn't contain enough information to answer the question, say so clearly
- Do not make up information that is not in the provided context
- Keep your answers concise and focused on the question asked`;
}

export function formatResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return 'No relevant documents found.';
  }

  const formatted = results.map((result, idx) => {
    const lines: string[] = [];

    lines.push(`[${idx + 1}] ${result.file_path}`);

    if (result.heading_path) {
      lines.push(`    Section: ${result.heading_path}`);
    }

    lines.push(`    Score: ${result.score.toFixed(4)}`);
    lines.push('');
    lines.push(result.text_raw);

    return lines.join('\n');
  });

  return formatted.join('\n\n---\n\n');
}

export function buildRagPrompt(query: string, context: string): string {
  return `Based on the following document excerpts, please answer the question.

## Context Documents

${context}

## Question

${query}

## Answer`;
}
