import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig, writeDefaultConfig } from '../../src/config/loader.js';
import { ConfigSchema } from '../../src/config/schema.js';

describe('Config Schema', () => {
  it('should parse a complete valid config', () => {
    const config = ConfigSchema.parse({
      paths: {
        watch_dirs: ['/home/user/notes'],
        db_path: '/home/user/.db',
        model_cache_dir: '/home/user/.models',
      },
      embeddings: {
        backend: 'transformers',
        model: 'nomic-ai/nomic-embed-text-v1.5',
        batch_size: 32,
        ollama_base_url: 'http://localhost:11434',
      },
      chunking: {
        max_tokens: 256,
        min_chars: 30,
        include_breadcrumb: false,
        overlap_tokens: 32,
      },
      search: {
        default_top_k: 5,
        rrf_k: 30,
        rerank: true,
        rerank_model: 'cross-encoder/test',
        rerank_top_n: 10,
      },
      watcher: {
        enabled: false,
        debounce_ms: 1000,
        extensions: ['.md'],
        ignore_patterns: ['**/.git/**'],
      },
      api: {
        host: '0.0.0.0',
        port: 8080,
        api_key: 'test-key',
      },
      mcp: {
        transport: 'sse',
        sse_port: 9000,
      },
    });

    expect(config.api.port).toBe(8080);
    expect(config.embeddings.batch_size).toBe(32);
    expect(config.search.default_top_k).toBe(5);
  });

  it('should apply defaults for missing fields', () => {
    const config = ConfigSchema.parse({});

    expect(config.api.port).toBe(7832);
    expect(config.api.host).toBe('127.0.0.1');
    expect(config.embeddings.backend).toBe('transformers');
    expect(config.embeddings.batch_size).toBe(64);
    expect(config.chunking.max_tokens).toBe(512);
    expect(config.search.default_top_k).toBe(10);
    expect(config.watcher.enabled).toBe(true);
  });

  it('should reject invalid backend', () => {
    expect(() =>
      ConfigSchema.parse({
        embeddings: { backend: 'invalid' },
      })
    ).toThrow();
  });

  it('should reject invalid port', () => {
    expect(() =>
      ConfigSchema.parse({
        api: { port: 99999 },
      })
    ).toThrow();
  });

  it('should reject negative batch_size', () => {
    expect(() =>
      ConfigSchema.parse({
        embeddings: { batch_size: -1 },
      })
    ).toThrow();
  });
});

describe('Config Loader', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqmd-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // Clean up env vars
    delete process.env.SQMD_CONFIG;
    delete process.env.SQMD_DB_PATH;
    delete process.env.SQMD_API_PORT;
    delete process.env.SQMD_API_KEY;
  });

  it('should load a valid config file', () => {
    const configPath = path.join(tmpDir, 'config.yaml');
    const yaml = `
paths:
  db_path: "/tmp/test-db"
api:
  port: 9999
`;
    fs.writeFileSync(configPath, yaml);

    const config = loadConfig(configPath);
    expect(config.api.port).toBe(9999);
    expect(config.paths.db_path).toBe('/tmp/test-db');
  });

  it('should throw for non-existent config file', () => {
    expect(() => loadConfig('/non/existent/path/config.yaml')).toThrow();
  });

  it('should use defaults when no config file exists', () => {
    // Point to non-existent config but no env override
    // Since loadConfig falls back to defaults, we need a fresh call
    const config = loadConfig();
    expect(config).toBeDefined();
    expect(config.api.port).toBe(7832);
  });

  it('should support SQMD_CONFIG env var', () => {
    const configPath = path.join(tmpDir, 'custom.yaml');
    const yaml = `
api:
  port: 7777
`;
    fs.writeFileSync(configPath, yaml);
    process.env.SQMD_CONFIG = configPath;

    const config = loadConfig();
    expect(config.api.port).toBe(7777);
  });

  it('should override db_path with env var', () => {
    const configPath = path.join(tmpDir, 'config.yaml');
    fs.writeFileSync(configPath, 'paths:\n  db_path: "/original/path"');

    const overridePath = '/override/db/path';
    process.env.SQMD_DB_PATH = overridePath;

    const config = loadConfig(configPath);
    expect(config.paths.db_path).toBe(overridePath);
  });

  it('should override api port with env var', () => {
    const configPath = path.join(tmpDir, 'config.yaml');
    fs.writeFileSync(configPath, 'api:\n  port: 7832');

    process.env.SQMD_API_PORT = '8888';

    const config = loadConfig(configPath);
    expect(config.api.port).toBe(8888);
  });

  it('should override api key with env var', () => {
    const configPath = path.join(tmpDir, 'config.yaml');
    fs.writeFileSync(configPath, '');

    process.env.SQMD_API_KEY = 'my-secret-key';

    const config = loadConfig(configPath);
    expect(config.api.api_key).toBe('my-secret-key');
  });

  it('should expand tilde in paths', () => {
    const configPath = path.join(tmpDir, 'config.yaml');
    const yaml = `
paths:
  db_path: "~/.sqmd/lancedb"
  model_cache_dir: "~/.sqmd/models"
`;
    fs.writeFileSync(configPath, yaml);

    const config = loadConfig(configPath);
    expect(config.paths.db_path).toContain(os.homedir());
    expect(config.paths.model_cache_dir).toContain(os.homedir());
    expect(config.paths.db_path).not.toContain('~');
    expect(config.paths.model_cache_dir).not.toContain('~');
  });
});

describe('writeDefaultConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqmd-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should write a valid config file', () => {
    const configPath = path.join(tmpDir, 'config.yaml');
    writeDefaultConfig(configPath);

    expect(fs.existsSync(configPath)).toBe(true);

    // Should be loadable
    const config = loadConfig(configPath);
    expect(config).toBeDefined();
    expect(config.api.port).toBe(7832);
  });

  it('should create parent directories', () => {
    const configPath = path.join(tmpDir, 'nested', 'dir', 'config.yaml');
    writeDefaultConfig(configPath);

    expect(fs.existsSync(configPath)).toBe(true);
  });
});
