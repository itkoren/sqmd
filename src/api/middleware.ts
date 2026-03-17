import type { Context, MiddlewareHandler, Next } from 'hono';

export function createApiKeyMiddleware(apiKey: string): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    // Skip auth if no API key configured
    if (!apiKey) {
      return next();
    }

    const authHeader = c.req.header('Authorization');
    const providedKey = authHeader?.replace(/^Bearer\s+/, '') ?? c.req.header('X-API-Key');

    if (!providedKey || providedKey !== apiKey) {
      return c.json({ error: 'Unauthorized', message: 'Invalid or missing API key' }, 401);
    }

    return next();
  };
}

export function requestLogger(): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const start = Date.now();
    const method = c.req.method;
    const path = new URL(c.req.url).pathname;

    await next();

    const duration = Date.now() - start;
    const status = c.res.status;

    console.log(`[${new Date().toISOString()}] ${method} ${path} ${status} ${duration}ms`);
  };
}

export function corsMiddleware(): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    c.res.headers.set('Access-Control-Allow-Origin', '*');
    c.res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    c.res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');

    if (c.req.method === 'OPTIONS') {
      return c.body(null, 204);
    }

    return next();
  };
}
