/**
 * Barrel file re-exporting all types for the CS Reference Guide.
 */

// Content system types
export type {
  ImageRef,
  CodeBlock,
  MathExpression,
  ContentMetadata,
  InteractiveType,
  ContentNode,
  TaskListItem,
  CompareOption,
  PrereqLink,
  ContentSection,
  ParsedContent,
  Topic,
  Category,
} from './content';

// Navigation types
export type {
  NavigationState,
  CommandPaletteItem,
  CommandPaletteState,
} from './navigation';

// Study tools types
export type {
  DailyStudyRecord,
  WeeklyStats,
  PomodoroState,
  StudySession,
  DailyGoal,
  ProgressState,
  SpacedRepetitionState,
  RepetitionSchedule,
  BookmarkState,
  Bookmark,
} from './study';

// Search types
export type {
  FlexSearchIndex,
  SearchEngine,
  SearchResult,
} from './search';

// Interactive element types
export type {
  SQLSchema,
  SQLTableDefinition,
  SQLColumnDefinition,
  PlaygroundProps,
  PlaygroundState,
  SQLPlaygroundProps,
  Quiz,
  QuizQuestion,
  VisualizationProps,
  VisualizationControls,
} from './interactive';
