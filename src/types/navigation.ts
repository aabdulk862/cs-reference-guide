/**
 * Navigation system types for the CS Reference Guide.
 * Covers sidebar state, command palette, and breadcrumb navigation.
 */

import type { Category } from './content';

/** State of the navigation system including sidebar and visited tracking */
export interface NavigationState {
  categories: Category[];
  currentPath: string[];
  expandedCategories: Set<string>;
  visitedTopics: Set<string>;
}

/** An item that can appear in the command palette */
export interface CommandPaletteItem {
  id: string;
  label: string;
  type: 'topic' | 'bookmark' | 'action';
  action: () => void;
  keywords: string[];
}

/** State of the command palette overlay */
export interface CommandPaletteState {
  isOpen: boolean;
  query: string;
  results: CommandPaletteItem[];
  selectedIndex: number;
}
