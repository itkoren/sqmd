import type { SearchResult } from '../store/schema.js';

type CrossEncoderPipeline = (
  pairs: Array<[string, string]>,
  options?: Record<string, unknown>
) => Promise<Array<{ score: number }>>;

export class CrossEncoderReranker {
  private readonly modelName: string;
  private readonly cacheDir: string;
  private pipeline: CrossEncoderPipeline | null = null;

  constructor(modelName: string, cacheDir: string) {
    this.modelName = modelName;
    this.cacheDir = cacheDir;
  }

  private async loadPipeline(): Promise<CrossEncoderPipeline> {
    if (this.pipeline) return this.pipeline;

    const { pipeline, env } = await import('@huggingface/transformers');

    env.cacheDir = this.cacheDir;

    // text-classification pipeline for cross-encoder models
    this.pipeline = (await pipeline('text-classification', this.modelName, {
      dtype: 'fp32',
    })) as unknown as CrossEncoderPipeline;

    return this.pipeline;
  }

  async rerank(query: string, results: SearchResult[], topN: number): Promise<SearchResult[]> {
    if (results.length === 0) return [];

    const pipe = await this.loadPipeline();

    // Create query-document pairs
    const pairs: Array<[string, string]> = results.map((r) => [query, r.text_raw]);

    const scores = await pipe(pairs, { top_k: 1 });

    // Attach scores and sort
    const reranked = results.map((result, idx) => ({
      ...result,
      score: scores[idx]?.score ?? 0,
    }));

    reranked.sort((a, b) => b.score - a.score);

    return reranked.slice(0, topN);
  }
}

let rerankerInstance: CrossEncoderReranker | null = null;

export function getReranker(modelName: string, cacheDir: string): CrossEncoderReranker {
  if (!rerankerInstance || rerankerInstance.modelName !== modelName) {
    rerankerInstance = new CrossEncoderReranker(modelName, cacheDir);
  }
  return rerankerInstance;
}
