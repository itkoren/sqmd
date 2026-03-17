import * as fs from 'node:fs';
import * as path from 'node:path';

function matchesPattern(filePath: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<DOUBLE_STAR>>')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/<<DOUBLE_STAR>>/g, '.*');

  const regex = new RegExp(escaped);
  return regex.test(filePath) || regex.test(filePath.replace(/\\/g, '/'));
}

function matchesAnyPattern(filePath: string, patterns: string[]): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return patterns.some((pattern) => matchesPattern(normalizedPath, pattern));
}

export async function* scanDirectory(
  dir: string,
  extensions: string[],
  ignorePatterns: string[] = ['**/.git/**', '**/node_modules/**']
): AsyncGenerator<string> {
  const normalizedDir = path.resolve(dir);

  if (!fs.existsSync(normalizedDir)) {
    return;
  }

  const stat = fs.statSync(normalizedDir);
  if (!stat.isDirectory()) {
    return;
  }

  yield* walkDirectory(normalizedDir, extensions, ignorePatterns);
}

async function* walkDirectory(
  dir: string,
  extensions: string[],
  ignorePatterns: string[]
): AsyncGenerator<string> {
  let entries: fs.Dirent[];

  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const normalizedPath = fullPath.replace(/\\/g, '/');

    if (matchesAnyPattern(normalizedPath, ignorePatterns)) {
      continue;
    }

    if (entry.isDirectory()) {
      yield* walkDirectory(fullPath, extensions, ignorePatterns);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (extensions.includes(ext)) {
        yield fullPath;
      }
    }
  }
}
