/**
 * Search bar component for the CS Reference Guide.
 *
 * Provides full-text search across all indexed content with:
 * - Instant results on ≥1 character input (within 200ms)
 * - Up to 10 results displayed in a dropdown
 * - Highlighted matching keywords in results
 * - Navigation to Content_Section on result selection
 * - "No results found" message with suggestions when empty
 * - Closes on Escape or click outside
 *
 * Requirements: 2.3, 2.4, 2.5, 2.7
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSearch } from '@/hooks/useSearch';
import { highlightMatches, MIN_QUERY_LENGTH } from '@/utils/search';
import type { SearchResult } from '@/types/search';

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [hasSearched, setHasSearched] = useState(false);

  const { search, isLoading, isReady } = useSearch();
  const navigate = useNavigate();

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Perform search on query change
  useEffect(() => {
    if (!isReady) return;

    if (query.trim().length < MIN_QUERY_LENGTH) {
      setResults([]);
      setIsOpen(false);
      setHasSearched(false);
      setSelectedIndex(-1);
      return;
    }

    const searchResults = search(query);
    setResults(searchResults);
    setIsOpen(true);
    setHasSearched(true);
    setSelectedIndex(-1);
  }, [query, search, isReady]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Navigate to a search result
  const navigateToResult = useCallback(
    (result: SearchResult) => {
      // Build the URL: /topic/:categorySlug/:topicSlug#sectionId
      // The topicId format from the indexer is the topic slug
      const topicParts = result.topicId.split('/');
      const categorySlug = topicParts.length > 1 ? topicParts[0] : result.topicId;
      const topicSlug = topicParts.length > 1 ? topicParts.slice(1).join('/') : result.topicId;

      navigate(`/topic/${categorySlug}/${topicSlug}#${result.sectionId}`);
      setIsOpen(false);
      setQuery('');
    },
    [navigate]
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      switch (event.key) {
        case 'Escape':
          setIsOpen(false);
          inputRef.current?.blur();
          break;

        case 'ArrowDown':
          event.preventDefault();
          setSelectedIndex((prev) =>
            prev < results.length - 1 ? prev + 1 : prev
          );
          break;

        case 'ArrowUp':
          event.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
          break;

        case 'Enter':
          event.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < results.length) {
            navigateToResult(results[selectedIndex]);
          }
          break;
      }
    },
    [results, selectedIndex, navigateToResult]
  );

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
  };

  const handleFocus = () => {
    if (query.trim().length >= MIN_QUERY_LENGTH && hasSearched) {
      setIsOpen(true);
    }
  };

  return (
    <div className="search-bar" ref={containerRef} role="search">
      <div className="search-input-wrapper">
        <svg
          className="search-icon"
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M11.5 11.5L14.5 14.5M6.5 12C3.46243 12 1 9.53757 1 6.5C1 3.46243 3.46243 1 6.5 1C9.53757 1 12 3.46243 12 6.5C12 9.53757 9.53757 12 6.5 12Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder={isLoading ? 'Loading search…' : 'Search topics…'}
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          disabled={isLoading}
          aria-label="Search topics"
          aria-expanded={isOpen}
          aria-controls="search-results-dropdown"
          aria-activedescendant={
            selectedIndex >= 0 ? `search-result-${selectedIndex}` : undefined
          }
          role="combobox"
          aria-autocomplete="list"
        />
      </div>

      {isOpen && (
        <div
          id="search-results-dropdown"
          className="search-results-dropdown"
          role="listbox"
          aria-label="Search results"
        >
          {results.length > 0 ? (
            <ul className="search-results-list">
              {results.map((result, index) => (
                <li
                  key={`${result.topicId}:${result.sectionId}`}
                  id={`search-result-${index}`}
                  className={`search-result-item ${
                    index === selectedIndex ? 'search-result-item--selected' : ''
                  }`}
                  role="option"
                  aria-selected={index === selectedIndex}
                  onClick={() => navigateToResult(result)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className="search-result-title">
                    <HighlightedText text={result.title} query={query} />
                  </div>
                  <div className="search-result-snippet">
                    <HighlightedText text={result.snippet} query={query} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            hasSearched && (
              <div className="search-no-results" role="status">
                <p className="search-no-results-message">
                  No results found. Try different keywords.
                </p>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Renders text with matching query terms highlighted using <mark> elements.
 */
function HighlightedText({ text, query }: { text: string; query: string }) {
  const segments = highlightMatches(text, query);

  return (
    <span>
      {segments.map((segment, i) =>
        segment.highlighted ? (
          <mark key={i} className="search-highlight">
            {segment.text}
          </mark>
        ) : (
          <span key={i}>{segment.text}</span>
        )
      )}
    </span>
  );
}

export default SearchBar;
