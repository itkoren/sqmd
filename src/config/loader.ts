import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import yaml from 'js-yaml';
import { ConfigSchema, type Config } from './schema.js';

function expandTilde(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

function expandPaths(config: Config): Config {
  return {
    ...config,
    paths: {
      ...config.paths,
      watch_dirs: config.paths.watch_dirs.map(expandTilde),
      db_path: expandTilde(config.paths.db_path),
      model_cache_dir: expandTilde(config.paths.model_cache_dir),
    },
  };
}

function applyEnvOverrides(config: Config): Config {
  const result = structuredClone(config);

  const dbPath = process.env['SQMD_DB_PATH'];
  if (dbPath) {
    result.paths.db_path = expandTilde(dbPath);
  }

  const apiPort = process.env['SQMD_API_PORT'];
  if (apiPort) {
    const port = parseInt(apiPort, 10);
    if (!isNaN(port)) {
      result.api.port = port;
    }
  }

  const apiKey = process.env['SQMD_API_KEY'];
  if (apiKey !== undefined) {
    result.api.api_key = apiKey;
  }

  const embBackend = process.env['SQMD_EMBEDDINGS_BACKEND'];
  if (embBackend === 'transformers' || embBackend === 'ollama') {
    result.embeddings.backend = embBackend;
  }

  const embModel = process.env['SQMD_EMBEDDINGS_MODEL'];
  if (embModel) {
    result.embeddings.model = embModel;
  }

  const ollamaUrl = process.env['SQMD_OLLAMA_BASE_URL'];
  if (ollamaUrl) {
    result.embeddings.ollama_base_url = ollamaUrl;
  }

  const modelCacheDir = process.env['SQMD_MODEL_CACHE_DIR'];
  if (modelCacheDir) {
    result.paths.model_cache_dir = expandTilde(modelCacheDir);
  }

  return result;
}

export function loadConfig(configPath?: string): Config {
  // Determine config file path
  let resolvedPath: string;

  if (configPath) {
    resolvedPath = expandTilde(configPath);
  } else {
    const envPath = process.env['SQMD_CONFIG'];
    if (envPath) {
      resolvedPath = expandTilde(envPath);
    } else {
      const defaultPath = expandTilde('~/.sqmd/config.yaml');
      const localPath = path.resolve('./config.yaml');

      if (fs.existsSync(defaultPath)) {
        resolvedPath = defaultPath;
      } else if (fs.existsSync(localPath)) {
        resolvedPath = localPath;
      } else {
        // No config file found — use defaults
        const parsed = ConfigSchema.parse({});
        return applyEnvOverrides(expandPaths(parsed));
      }
    }
  }

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Config file not found: ${resolvedPath}`);
  }

  const raw = fs.readFileSync(resolvedPath, 'utf-8');
  const data = yaml.load(raw) ?? {};
  const parsed = ConfigSchema.parse(data);
  return applyEnvOverrides(expandPaths(parsed));
}

export function writeDefaultConfig(targetPath: string): void {
  const defaultYaml = `paths:
  watch_dirs:
    - "~/notes"
  db_path: "~/.sqmd/lancedb"
  model_cache_dir: "~/.sqmd/models"

embeddings:
  backend: "transformers"
  model: "nomic-ai/nomic-embed-text-v1.5"
  batch_size: 64
  ollama_base_url: "http://localhost:11434"

chunking:
  max_tokens: 512
  min_chars: 50
  include_breadcrumb: true
  overlap_tokens: 64

search:
  default_top_k: 10
  rrf_k: 60
  rerank: false
  rerank_model: "cross-encoder/ms-marco-MiniLM-L-6-v2"
  rerank_top_n: 20

watcher:
  enabled: true
  debounce_ms: 3000
  extensions:
    - ".md"
    - ".mdx"
  ignore_patterns:
    - "**/.git/**"
    - "**/node_modules/**"

api:
  host: "127.0.0.1"
  port: 7832
  api_key: ""

mcp:
  transport: "stdio"
  sse_port: 7833
`;

  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(targetPath, defaultYaml, 'utf-8');
}
