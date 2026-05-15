/**
 * Content system types for the CS Reference Guide.
 * These types represent the parsed markdown content structure
 * produced at build time by the Vite content parser plugin.
 */

/** Reference to an image asset within parsed content */
export interface ImageRef {
  src: string;
  alt: string;
  originalPath: string;
}

/** A code block extracted from markdown */
export interface CodeBlock {
  language: string;
  code: string;
  runnable: boolean;
}

/** A math expression extracted from markdown (LaTeX) */
export interface MathExpression {
  expression: string;
  display: 'inline' | 'block';
}

/** Metadata about a parsed content file */
export interface ContentMetadata {
  source: 'parsed' | 'authored';
  filePath?: string;
  lastModified?: string;
  wordCount: number;
  sectionCount: number;
}

/** Types of interactive elements that can be embedded in content */
export type InteractiveType =
  | 'quiz'
  | 'playground'
  | 'visualization'
  | 'sql-playground'
  | 'bigo-chart';

/** A single item in a task list */
export interface TaskListItem {
  checked: boolean;
  text: string;
}

/** A union type representing all possible content node types within a section */
export type ContentNode =
  | { type: 'paragraph'; text: string }
  | { type: 'code'; language: string; code: string; runnable: boolean }
  | { type: 'image'; src: string; alt: string; originalPath: string }
  | { type: 'math'; expression: string; display: 'inline' | 'block' }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'blockquote'; text: string }
  | { type: 'interactive'; interactiveType: InteractiveType; config: unknown }
  | { type: 'mermaid'; source: string }
  | { type: 'admonition'; admonitionType: 'note' | 'warning' | 'tip'; content: string }
  | { type: 'task-list'; items: TaskListItem[] }
  | { type: 'footnote-ref'; identifier: string; index: number }
  | { type: 'footnote-def'; identifier: string; content: string }
  | { type: 'unparseable'; raw: string };

/** A section of content within a topic, corresponding to heading levels */
export interface ContentSection {
  id: string;
  heading: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  content: ContentNode[];
  wordCount: number;
  subsections: ContentSection[];
}

/** The full parsed output of a markdown file */
export interface ParsedContent {
  id: string;
  slug: string;
  title: string;
  category: string;
  sections: ContentSection[];
  images: ImageRef[];
  codeBlocks: CodeBlock[];
  mathExpressions: MathExpression[];
  metadata: ContentMetadata;
}

/** A topic within a category */
export interface Topic {
  id: string;
  slug: string;
  title: string;
  category: string;
  sections: ContentSection[];
  source: 'parsed' | 'authored';
  wordCount: number;
}

/** A category grouping related topics */
export interface Category {
  id: string;
  name: string;
  icon: string;
  topics: Topic[];
}
