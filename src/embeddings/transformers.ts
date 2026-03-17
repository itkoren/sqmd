import type { Embedder } from './types.js';

type PipelineType = (texts: string[], options?: Record<string, unknown>) => Promise<unknown>;

export class TransformersEmbedder implements Embedder {
  readonly modelName: string;
  readonly vectorDim = 768;
  private readonly cacheDir: string;
  private pipeline: PipelineType | null = null;

  constructor(modelName: string, cacheDir: string) {
    this.modelName = modelName;
    this.cacheDir = cacheDir;
  }

  private async loadPipeline(): Promise<PipelineType> {
    if (this.pipeline) return this.pipeline;

    // Dynamic import to avoid loading at startup
    const { pipeline, env } = await import('@huggingface/transformers');

    // Configure cache directory
    env.cacheDir = this.cacheDir;

    this.pipeline = (await pipeline('feature-extraction', this.modelName, {
      dtype: 'fp32',
    })) as unknown as PipelineType;

    return this.pipeline;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const prefixed = texts.map((t) => `search_document: ${t}`);
    return this.runEmbedding(prefixed);
  }

  async embedQuery(query: string): Promise<number[]> {
    const prefixed = `search_query: ${query}`;
    const results = await this.runEmbedding([prefixed]);
    return results[0]!;
  }

  async embed(texts: string[]): Promise<number[][]> {
    // Default embed without prefix — callers that need prefixes use embedDocuments/embedQuery
    return this.runEmbedding(texts);
  }

  private async runEmbedding(texts: string[]): Promise<number[][]> {
    const pipe = await this.loadPipeline();

    const output = await pipe(texts, { pooling: 'mean', normalize: true });

    // Handle tensor output from transformers.js v3
    if (output && typeof output === 'object' && 'tolist' in output) {
      const list = (output as { tolist(): number[][] }).tolist();
      return list;
    }

    if (output && typeof output === 'object' && 'data' in output) {
      const data = (output as { data: Float32Array | number[]; dims: number[] }).data;
      const dims = (output as { data: Float32Array | number[]; dims: number[] }).dims;
      const batchSize = dims[0] ?? texts.length;
      const embDim = dims[1] ?? this.vectorDim;

      const results: number[][] = [];
      for (let i = 0; i < batchSize; i++) {
        const vec: number[] = [];
        for (let j = 0; j < embDim; j++) {
          vec.push(Number(data[i * embDim + j]));
        }
        results.push(vec);
      }
      return results;
    }

    if (Array.isArray(output)) {
      return (output as number[][]).map((v) => Array.from(v));
    }

    throw new Error('Unexpected output format from transformers pipeline');
  }
}
