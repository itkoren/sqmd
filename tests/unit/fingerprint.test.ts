import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashFile, hashPath } from '../../src/ingestion/fingerprint.js';

describe('hashPath', () => {
  it('should return a 64-char hex string', () => {
    const result = hashPath('/some/path/file.md');
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should be deterministic', () => {
    const path1 = hashPath('/some/path/file.md');
    const path2 = hashPath('/some/path/file.md');
    expect(path1).toBe(path2);
  });

  it('should produce different hashes for different paths', () => {
    const a = hashPath('/path/a.md');
    const b = hashPath('/path/b.md');
    expect(a).not.toBe(b);
  });
});

describe('hashFile', () => {
  let tmpDir: string;
  let fileA: string;
  let fileB: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fingerprint-test-'));
    fileA = path.join(tmpDir, 'a.md');
    fileB = path.join(tmpDir, 'b.md');
    fs.writeFileSync(fileA, 'hello world');
    fs.writeFileSync(fileB, 'different content');
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return an object with hash and mtime', async () => {
    const result = await hashFile(fileA);
    expect(result).toHaveProperty('hash');
    expect(result).toHaveProperty('mtime');
    expect(typeof result.hash).toBe('string');
    expect(typeof result.mtime).toBe('number');
  });

  it('should return a 64-char hex hash', async () => {
    const result = await hashFile(fileA);
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should return the same hash for the same content', async () => {
    const r1 = await hashFile(fileA);
    const r2 = await hashFile(fileA);
    expect(r1.hash).toBe(r2.hash);
  });

  it('should return different hashes for different content', async () => {
    const r1 = await hashFile(fileA);
    const r2 = await hashFile(fileB);
    expect(r1.hash).not.toBe(r2.hash);
  });

  it('should return different hash after content change', async () => {
    const file = path.join(tmpDir, 'mutable.md');
    fs.writeFileSync(file, 'original content');
    const before = await hashFile(file);

    fs.writeFileSync(file, 'modified content');
    const after = await hashFile(file);

    expect(before.hash).not.toBe(after.hash);
  });

  it('should throw for a non-existent file', async () => {
    await expect(hashFile('/nonexistent/path/file.md')).rejects.toThrow();
  });
});
