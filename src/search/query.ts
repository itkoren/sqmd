export function preprocessQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function prepareQueryForEmbedding(query: string, model: string): string {
  const processed = preprocessQuery(query);

  // For nomic models, prepend search_query prefix
  if (model.includes('nomic')) {
    return `search_query: ${processed}`;
  }

  return processed;
}

export function prepareDocumentForEmbedding(text: string, model: string): string {
  // For nomic models, prepend search_document prefix
  if (model.includes('nomic')) {
    return `search_document: ${text}`;
  }

  return text;
}
