import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import type { Root, Heading, Paragraph, Text, Node } from 'mdast';
import * as path from 'node:path';

export interface Section {
  headingPath: string;
  headingText: string;
  headingLevel: number;
  lineStart: number;
  lineEnd: number;
  content: string;
  parentHeadings: string[];
}

export interface ParsedDocument {
  filePath: string;
  sections: Section[];
}

interface HeadingStackEntry {
  level: number;
  text: string;
}

function extractNodeText(node: Node): string {
  const parts: string[] = [];

  if ('value' in node && typeof node.value === 'string') {
    parts.push(node.value);
  }

  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children as Node[]) {
      parts.push(extractNodeText(child));
    }
  }

  return parts.join('');
}

function getNodeStart(node: Node): number {
  return node.position?.start?.line ?? 0;
}

function getNodeEnd(node: Node): number {
  return node.position?.end?.line ?? 0;
}

export function parseMarkdown(content: string, filePath: string): ParsedDocument {
  const processor = unified().use(remarkParse);
  const ast = processor.parse(content) as Root;

  const sections: Section[] = [];
  const headingStack: HeadingStackEntry[] = [];

  let currentSectionNodes: Node[] = [];
  let currentSectionStart = 1;
  let currentHeadingLevel = 0;
  let currentHeadingText = '';

  function flushSection(endLine: number): void {
    const sectionText = currentSectionNodes
      .map((n) => extractNodeText(n))
      .filter((t) => t.trim().length > 0)
      .join('\n\n');

    const parentHeadings = headingStack.map((h) => h.text);
    const headingPath =
      headingStack.length > 0
        ? headingStack.map((h) => h.text).join(' > ')
        : '';

    sections.push({
      headingPath,
      headingText: currentHeadingText,
      headingLevel: currentHeadingLevel,
      lineStart: currentSectionStart,
      lineEnd: endLine,
      content: sectionText,
      parentHeadings: [...parentHeadings],
    });

    currentSectionNodes = [];
  }

  const children = ast.children;
  let i = 0;

  while (i < children.length) {
    const node = children[i]!;

    if (node.type === 'heading') {
      const headingNode = node as Heading;
      const level = headingNode.depth;
      const headingText = extractNodeText(headingNode);
      const lineStart = getNodeStart(headingNode);

      // Flush previous section
      if (currentSectionNodes.length > 0 || currentHeadingLevel > 0) {
        flushSection(lineStart - 1);
      }

      // Update heading stack
      // Pop headings at same or deeper level
      while (headingStack.length > 0 && headingStack[headingStack.length - 1]!.level >= level) {
        headingStack.pop();
      }

      // Push current heading to parent stack for next sections
      currentHeadingLevel = level;
      currentHeadingText = headingText;
      currentSectionStart = lineStart;

      // The heading itself becomes the first node
      currentSectionNodes = [headingNode];

      // Push to stack for children headings
      headingStack.push({ level, text: headingText });
    } else {
      if (currentSectionNodes.length === 0 && sections.length === 0 && headingStack.length === 0) {
        // Preamble content before first heading
        currentSectionStart = getNodeStart(node);
      }
      currentSectionNodes.push(node);
    }

    i++;
  }

  // Flush last section
  if (currentSectionNodes.length > 0 || (sections.length === 0 && children.length > 0)) {
    const lastLine =
      children.length > 0
        ? getNodeEnd(children[children.length - 1]!)
        : 0;
    flushSection(lastLine);
  }

  return {
    filePath,
    sections,
  };
}

export function getFileStem(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}
