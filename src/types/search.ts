/**
 * Search engine types for the CS Reference Guide.
 * Uses FlexSearch for client-side full-text search with a pre-built index.
 */

/** FlexSearch index interface for adding and querying content */
export interface FlexSearchIndex {
  add(id: string, content: string): void;
  search(query: string, options?: { limit: number }): string[];
}

/** The search engine combining the index with a search method */
export interface SearchEngine {
  search(query: string): SearchResult[];
  index: FlexSearchIndex;
}

/** A single search result with relevance scoring */
export interface SearchResult {
  topicId: string;
  sectionId: string;
  title: string;
  snippet: string;
  matchedTerms: string[];
  score: number;
}
