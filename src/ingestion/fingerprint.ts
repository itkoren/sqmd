import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export async function hashFile(filePath: string): Promise<{ hash: string; mtime: number }> {
  const absolutePath = path.resolve(filePath);
  const stat = fs.statSync(absolutePath);
  const mtime = stat.mtimeMs;

  const content = fs.readFileSync(absolutePath);
  const hash = crypto.createHash('sha256').update(content).digest('hex');

  return { hash, mtime };
}

export function hashPath(filePath: string): string {
  const absolutePath = path.resolve(filePath);
  const normalized = absolutePath.replace(/\\/g, '/');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}
