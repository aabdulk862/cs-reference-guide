/**
 * Interactive element types for the CS Reference Guide.
 * Covers code playgrounds, SQL playgrounds, quizzes, and visualizations.
 */

/** SQL table schema definition */
export interface SQLSchema {
  tables: SQLTableDefinition[];
}

/** Definition of a single SQL table */
export interface SQLTableDefinition {
  name: string;
  columns: SQLColumnDefinition[];
}

/** Definition of a single column in a SQL table */
export interface SQLColumnDefinition {
  name: string;
  type: string;
  primaryKey?: boolean;
  nullable?: boolean;
  references?: string;
}

/** Props for the code playground component */
export interface PlaygroundProps {
  initialCode: string;
  language: 'javascript' | 'pseudocode';
  timeoutMs: number;
}

/** Internal state of the code playground */
export interface PlaygroundState {
  code: string;
  output: string;
  error: string | null;
  isRunning: boolean;
}

/** Props for the SQL playground component */
export interface SQLPlaygroundProps {
  schema: SQLSchema;
  sampleData: Record<string, unknown[]>;
  initialQuery?: string;
}

/** A quiz containing multiple questions for a topic section */
export interface Quiz {
  id: string;
  topicId: string;
  sectionId: string;
  questions: QuizQuestion[];
}

/** A single quiz question (multiple-choice or fill-in-the-blank) */
export interface QuizQuestion {
  id: string;
  type: 'multiple-choice' | 'fill-in-the-blank';
  prompt: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
}

/** Props for data structure visualization components */
export interface VisualizationProps {
  type: 'bst' | 'bfs' | 'dfs' | 'linked-list' | 'heap' | 'graph';
  initialData: unknown;
  stepDurationMs: number;
}

/** Controls exposed by visualization components */
export interface VisualizationControls {
  play: () => void;
  pause: () => void;
  stepForward: () => void;
  reset: () => void;
}
