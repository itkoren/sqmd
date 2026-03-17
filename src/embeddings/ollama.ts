import type { Embedder } from './types.js';

interface OllamaEmbeddingResponse {
  embedding: number[];
}

export class OllamaEmbedder implements Embedder {
  readonly modelName: string;
  readonly vectorDim = 768;
  private readonly baseUrl: string;

  constructor(modelName: string, baseUrl: string) {
    this.modelName = modelName;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async embed(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];

    for (const text of texts) {
      const embedding = await this.embedSingle(text);
      results.push(embedding);
    }

    return results;
  }

  private async embedSingle(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.modelName,
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama embeddings API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as OllamaEmbeddingResponse;

    if (!data.embedding || !Array.isArray(data.embedding)) {
      throw new Error('Invalid response from Ollama embeddings API: missing embedding field');
    }

    return data.embedding;
  }
}

export function createEmbedder(
  backend: 'transformers' | 'ollama',
  modelName: string,
  options: { cacheDir?: string; ollamaBaseUrl?: string } = {}
): Embedder {
  if (backend === 'ollama') {
    return new OllamaEmbedder(modelName, options.ollamaBaseUrl ?? 'http://localhost:11434');
  }

  // Default to transformers
  const { TransformersEmbedder } = require('./transformers.js') as {
    TransformersEmbedder: new (model: string, cacheDir: string) => Embedder;
  };
  return new TransformersEmbedder(modelName, options.cacheDir ?? '~/.sqmd/models');
}
