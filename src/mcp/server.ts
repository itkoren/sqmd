import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createServer } from 'node:http';
import type * as lancedb from '@lancedb/lancedb';
import type { Embedder } from '../embeddings/types.js';
import type { Config } from '../config/schema.js';
import { registerTools } from './tools.js';

export async function startMcpServer(
  db: lancedb.Connection,
  embedder: Embedder,
  config: Config,
  options: { transport?: 'stdio' | 'sse'; port?: number } = {}
): Promise<void> {
  const transport = options.transport ?? config.mcp.transport;
  const port = options.port ?? config.mcp.sse_port;

  const server = new Server(
    {
      name: 'sqmd',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // Register all tools and resources
  registerTools(server, db, embedder, config);

  if (transport === 'stdio') {
    console.error('[mcp] Starting stdio transport');
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
    console.error('[mcp] Server connected via stdio');
  } else if (transport === 'sse') {
    console.log(`[mcp] Starting SSE transport on port ${port}`);

    const httpServer = createServer();
    const sseTransports = new Map<string, SSEServerTransport>();

    httpServer.on('request', (req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${port}`);

      if (req.method === 'GET' && url.pathname === '/sse') {
        const sseTransport = new SSEServerTransport('/messages', res);
        const sessionId = Date.now().toString();
        sseTransports.set(sessionId, sseTransport);

        res.on('close', () => {
          sseTransports.delete(sessionId);
        });

        server.connect(sseTransport).catch((err: unknown) => {
          console.error('[mcp] SSE connection error:', err instanceof Error ? err.message : String(err));
        });
      } else if (req.method === 'POST' && url.pathname === '/messages') {
        // Find the matching SSE transport
        for (const sseTransport of sseTransports.values()) {
          sseTransport.handlePostMessage(req, res).catch((err: unknown) => {
            console.error('[mcp] Message handling error:', err instanceof Error ? err.message : String(err));
          });
          return;
        }
        res.writeHead(404);
        res.end('No active SSE connection');
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    await new Promise<void>((resolve, reject) => {
      httpServer.listen(port, () => {
        console.log(`[mcp] SSE server listening on http://localhost:${port}/sse`);
        resolve();
      });
      httpServer.on('error', reject);
    });

    // Keep alive
    await new Promise<never>(() => {});
  } else {
    throw new Error(`Unknown transport: ${transport}`);
  }
}
