/**
 * Study tools types for the CS Reference Guide.
 * Covers Pomodoro timer, study sessions, progress tracking,
 * spaced repetition, and bookmarks.
 */

/** Daily study record used for weekly stats aggregation */
export interface DailyStudyRecord {
  date: string;
  elapsedMinutes: number;
  topicIds: string[];
}

/** Weekly statistics aggregated from daily study records */
export interface WeeklyStats {
  totalMinutes: number;
  topicsCovered: number;
  dailyRecords: DailyStudyRecord[];
}

/** Pomodoro timer state machine */
export interface PomodoroState {
  mode: 'work' | 'break' | 'idle';
  workDuration: number;
  breakDuration: number;
  remainingSeconds: number;
  isRunning: boolean;
  completedPomodoros: number;
}

/** Active study session tracking elapsed time */
export interface StudySession {
  startTime: number;
  elapsedSeconds: number;
  isActive: boolean;
  lastTopicId: string;
  lastSectionId: string;
}

/** Daily study goal configuration and progress */
export interface DailyGoal {
  targetMinutes: number;
  elapsedMinutes: number;
  date: string;
}

/** Overall progress tracking state */
export interface ProgressState {
  completedSections: Record<string, Set<string>>;
  topicProgress: Record<string, number>;
  overallProgress: number;
  dailyGoal: DailyGoal;
  weeklyStats: WeeklyStats;
}

/** Spaced repetition system state */
export interface SpacedRepetitionState {
  schedules: Record<string, RepetitionSchedule>;
}

/** Schedule for a single topic's spaced repetition */
export interface RepetitionSchedule {
  topicId: string;
  completedDate: string;
  currentInterval: number;
  nextReviewDate: string;
  reviewCount: number;
}

/** Bookmark collection state */
export interface BookmarkState {
  bookmarks: Bookmark[];
}

/** A single bookmark referencing a content section */
export interface Bookmark {
  id: string;
  topicId: string;
  sectionId: string;
  title: string;
  createdAt: string;
}
