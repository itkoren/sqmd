export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
  readonly modelName: string;
  readonly vectorDim: number;
}
