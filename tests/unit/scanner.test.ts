import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scanDirectory } from '../../src/ingestion/scanner.js';

async function collectAll(gen: AsyncGenerator<string>): Promise<string[]> {
  const results: string[] = [];
  for await (const item of gen) {
    results.push(item);
  }
  return results;
}

describe('scanDirectory', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-test-'));

    // Create directory structure:
    // tmpDir/
    //   a.md
    //   b.txt
    //   sub/
    //     c.md
    //     d.mdx
    //   .git/
    //     config
    //   node_modules/
    //     pkg.md

    fs.writeFileSync(path.join(tmpDir, 'a.md'), '# A');
    fs.writeFileSync(path.join(tmpDir, 'b.txt'), 'text file');
    fs.mkdirSync(path.join(tmpDir, 'sub'));
    fs.writeFileSync(path.join(tmpDir, 'sub', 'c.md'), '# C');
    fs.writeFileSync(path.join(tmpDir, 'sub', 'd.mdx'), '# D');
    fs.mkdirSync(path.join(tmpDir, '.git'));
    fs.writeFileSync(path.join(tmpDir, '.git', 'config'), '');
    fs.mkdirSync(path.join(tmpDir, 'node_modules'));
    fs.writeFileSync(path.join(tmpDir, 'node_modules', 'pkg.md'), '# pkg');
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should yield .md files recursively', async () => {
    const results = await collectAll(scanDirectory(tmpDir, ['.md']));
    const names = results.map((p) => path.basename(p));
    expect(names).toContain('a.md');
    expect(names).toContain('c.md');
  });

  it('should filter by extension — not yield .txt files', async () => {
    const results = await collectAll(scanDirectory(tmpDir, ['.md']));
    const names = results.map((p) => path.basename(p));
    expect(names).not.toContain('b.txt');
  });

  it('should yield .mdx when listed in extensions', async () => {
    const results = await collectAll(scanDirectory(tmpDir, ['.md', '.mdx']));
    const names = results.map((p) => path.basename(p));
    expect(names).toContain('d.mdx');
  });

  it('should ignore .git/ by default', async () => {
    const results = await collectAll(scanDirectory(tmpDir, ['.md', '.txt', '']));
    const names = results.map((p) => path.basename(p));
    expect(names).not.toContain('config');
  });

  it('should ignore node_modules/ by default', async () => {
    const results = await collectAll(scanDirectory(tmpDir, ['.md']));
    const names = results.map((p) => path.basename(p));
    expect(names).not.toContain('pkg.md');
  });

  it('should return nothing for a non-existent directory', async () => {
    const results = await collectAll(scanDirectory('/nonexistent/path/dir', ['.md']));
    expect(results).toHaveLength(0);
  });

  it('should return nothing when given a file path instead of a directory', async () => {
    const filePath = path.join(tmpDir, 'a.md');
    const results = await collectAll(scanDirectory(filePath, ['.md']));
    expect(results).toHaveLength(0);
  });

  it('should respect custom ignorePatterns', async () => {
    const results = await collectAll(scanDirectory(tmpDir, ['.md'], ['**/sub/**']));
    const names = results.map((p) => path.basename(p));
    expect(names).not.toContain('c.md');
    expect(names).toContain('a.md');
  });
});
