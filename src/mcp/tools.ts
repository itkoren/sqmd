import * as fs from 'node:fs';
import type * as lancedb from '@lancedb/lancedb';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Config } from '../config/schema.js';
import type { Embedder } from '../embeddings/types.js';
import { hashPath } from '../ingestion/fingerprint.js';
import { IndexPipeline } from '../ingestion/pipeline.js';
import { buildContext } from '../rag/context-builder.js';
import { hybridSearch } from '../search/hybrid.js';
import { getChunksTable, getDbStats, getFilesTable } from '../store/db.js';
import { getAllFiles, getFileById, getFileChunks } from '../store/reader.js';

export function registerTools(
  server: Server,
  db: lancedb.Connection,
  embedder: Embedder,
  config: Config
): void {
  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'search_documents',
        description: 'Search indexed Markdown documents using semantic or full-text search',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
            top_k: {
              type: 'number',
              description: 'Number of results to return (default: 10)',
            },
            mode: {
              type: 'string',
              enum: ['hybrid', 'vector', 'fts'],
              description: 'Search mode (default: hybrid)',
            },
            filter_path: {
              type: 'string',
              description: 'Filter results to files matching this path prefix',
            },
            include_context: {
              type: 'boolean',
              description: 'Include assembled RAG context in response',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_document',
        description: 'Get a specific document by file path',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Absolute path to the file',
            },
            section: {
              type: 'string',
              description: 'Optional section heading to filter to',
            },
          },
          required: ['file_path'],
        },
      },
      {
        name: 'list_documents',
        description: 'List all indexed documents',
        inputSchema: {
          type: 'object',
          properties: {
            path_prefix: {
              type: 'string',
              description: 'Filter to files matching this path prefix',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of documents to return (default: 20)',
            },
          },
        },
      },
      {
        name: 'trigger_index',
        description: 'Trigger re-indexing of documents',
        inputSchema: {
          type: 'object',
          properties: {
            paths: {
              type: 'array',
              items: { type: 'string' },
              description: 'Paths to index (defaults to configured watch_dirs)',
            },
            force: {
              type: 'boolean',
              description: 'Force re-indexing even if files are unchanged',
            },
          },
        },
      },
      {
        name: 'get_index_status',
        description: 'Get current index statistics',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const toolArgs = (args ?? {}) as Record<string, unknown>;

    try {
      switch (name) {
        case 'search_documents': {
          const query = String(toolArgs.query ?? '');
          const topK = Number(toolArgs.top_k ?? config.search.default_top_k);
          const mode = (toolArgs.mode as 'hybrid' | 'vector' | 'fts') ?? 'hybrid';
          const filterPath = toolArgs.filter_path ? String(toolArgs.filter_path) : undefined;
          const includeContext = Boolean(toolArgs.include_context ?? false);

          const chunksTable = await getChunksTable(db);
          const results = await hybridSearch(chunksTable, embedder, {
            query,
            topK,
            mode,
            rrfK: config.search.rrf_k,
            filterPath,
            modelName: config.embeddings.model,
          });

          let contextText = '';
          if (includeContext) {
            contextText = buildContext(results, 2000);
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  results: results.map((r) => ({
                    chunk_id: r.chunk_id,
                    file_path: r.file_path,
                    heading_path: r.heading_path,
                    text_raw: r.text_raw,
                    score: r.score,
                    line_start: r.line_start,
                    line_end: r.line_end,
                  })),
                  total: results.length,
                  ...(includeContext ? { context: contextText } : {}),
                }),
              },
            ],
          };
        }

        case 'get_document': {
          const filePath = String(toolArgs.file_path ?? '');
          const section = toolArgs.section ? String(toolArgs.section) : undefined;

          const fileId = hashPath(filePath);
          const filesTable = await getFilesTable(db);
          const chunksTable = await getChunksTable(db);

          const file = await getFileById(filesTable, fileId);
          if (!file) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ error: 'File not found' }) }],
              isError: true,
            };
          }

          let chunks = await getFileChunks(chunksTable, fileId);

          if (section) {
            chunks = chunks.filter(
              (c) =>
                c.heading_text.toLowerCase().includes(section.toLowerCase()) ||
                c.heading_path.toLowerCase().includes(section.toLowerCase())
            );
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ file, chunks }),
              },
            ],
          };
        }

        case 'list_documents': {
          const pathPrefix = toolArgs.path_prefix ? String(toolArgs.path_prefix) : undefined;
          const limit = Number(toolArgs.limit ?? 20);

          const filesTable = await getFilesTable(db);
          let files = await getAllFiles(filesTable);

          if (pathPrefix) {
            files = files.filter((f) => f.file_path.startsWith(pathPrefix));
          }

          const paginated = files.slice(0, limit);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ documents: paginated, total: files.length }),
              },
            ],
          };
        }

        case 'trigger_index': {
          const paths = (toolArgs.paths as string[] | undefined) ?? config.paths.watch_dirs;
          const force = Boolean(toolArgs.force ?? false);

          const pipeline = new IndexPipeline(config);
          const result = await pipeline.run({ paths, force });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result),
              },
            ],
          };
        }

        case 'get_index_status': {
          const stats = await getDbStats(db);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(stats),
              },
            ],
          };
        }

        default:
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
            isError: true,
          };
      }
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Tool execution failed',
              message: err instanceof Error ? err.message : String(err),
            }),
          },
        ],
        isError: true,
      };
    }
  });

  // Register MCP Resources: md://{filePath}
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const filesTable = await getFilesTable(db);
    const files = await getAllFiles(filesTable);

    return {
      resources: files.map((f) => ({
        uri: `md://${f.file_path}`,
        name: f.file_path.split('/').pop() ?? f.file_path,
        description: `Markdown file: ${f.file_path}`,
        mimeType: 'text/markdown',
      })),
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    const filePath = uri.replace(/^md:\/\//, '');

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');

    return {
      contents: [
        {
          uri,
          mimeType: 'text/markdown',
          text: content,
        },
      ],
    };
  });
}
