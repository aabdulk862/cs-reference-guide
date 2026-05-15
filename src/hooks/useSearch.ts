/**
 * React hook for client-side full-text search.
 *
 * Loads the pre-built search index (search-index.json) on mount,
 * creates a FlexSearch Document index, and exposes a search function
 * that returns SearchResult[] limited to 10 results.
 *
 * Requirements: 2.3, 2.4, 2.5, 2.7
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import FlexSearch from 'flexsearch';
import type { SearchResult } from '@/types/search';
import type { SearchDocument } from '@/plugins/search-indexer';
import { buildSearchResults, MAX_RESULTS, MIN_QUERY_LENGTH } from '@/utils/search';

type FlexSearchDocument = InstanceType<typeof FlexSearch.Document>;

interface UseSearchReturn {
  /** Perform a search query. Returns results synchronously from the in-memory index. */
  search: (query: string) => SearchResult[];
  /** Whether the search index is still loading */
  isLoading: boolean;
  /** Error message if index failed to load */
  error: string | null;
  /** Whether the index has been loaded and is ready for queries */
  isReady: boolean;
}

/**
 * Hook that loads the pre-built FlexSearch index and provides search functionality.
 */
export function useSearch(): UseSearchReturn {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Store the FlexSearch index and document map in refs to avoid re-renders
  const indexRef = useRef<FlexSearchDocument | null>(null);
  const documentsRef = useRef<Map<string, SearchDocument>>(new Map());

  useEffect(() => {
    let cancelled = false;

    async function loadIndex() {
      try {
        const response = await fetch('/search-index.json');
        if (!response.ok) {
          throw new Error(`Failed to load search index: ${response.status}`);
        }

        const documents: SearchDocument[] = await response.json();

        if (cancelled) return;

        // Create a FlexSearch Document index
        const index = new FlexSearch.Document({
          document: {
            id: 'id',
            index: ['title', 'content'],
          },
          tokenize: 'forward',
        });

        // Build a lookup map and add documents to the index
        const docMap = new Map<string, SearchDocument>();
        for (const doc of documents) {
          docMap.set(doc.id, doc);
          index.add(doc as unknown as Record<string, unknown>);
        }

        if (cancelled) return;

        indexRef.current = index;
        documentsRef.current = docMap;
        setIsReady(true);
        setIsLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load search index');
        setIsLoading(false);
      }
    }

    loadIndex();

    return () => {
      cancelled = true;
    };
  }, []);

  const search = useCallback((query: string): SearchResult[] => {
    if (!indexRef.current || !isReady) {
      return [];
    }

    if (!query || query.trim().length < MIN_QUERY_LENGTH) {
      return [];
    }

    const trimmedQuery = query.trim();

    // Query the FlexSearch index
    const rawResults = indexRef.current.search(trimmedQuery, { limit: MAX_RESULTS });

    // Collect unique document IDs from all field results
    const matchedIds: string[] = [];
    const seen = new Set<string>();

    for (const fieldResult of rawResults) {
      for (const id of fieldResult.result) {
        const idStr = String(id);
        if (!seen.has(idStr)) {
          seen.add(idStr);
          matchedIds.push(idStr);
        }
      }
    }

    return buildSearchResults(matchedIds, documentsRef.current, trimmedQuery);
  }, [isReady]);

  return { search, isLoading, error, isReady };
}
