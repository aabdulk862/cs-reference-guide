/**
 * Search results page — displays full-page search results with category filtering.
 *
 * Reads the `?q=` URL parameter to perform a search query.
 * Displays section-level results with topic title and matching section title.
 * Shows a prompt when the query is empty or missing.
 * Includes category filter controls to narrow results.
 *
 * Requirements: 13.2, 13.3, 13.7
 */

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useSearch } from '@/hooks/useSearch';
import { highlightMatches } from '@/utils/search';
import type { SearchResult } from '@/types/search';

/** Manifest types for category listing */
interface ManifestTopic {
  id: string;
  slug: string;
  title: string;
}

interface ManifestCategory {
  id: string;
  name: string;
  topics: ManifestTopic[];
}

interface ContentManifest {
  categories: ManifestCategory[];
  totalTopics: number;
}

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';

  const { search, isLoading, isReady } = useSearch();
  const [categories, setCategories] = useState<ManifestCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Fetch categories from the content manifest
  useEffect(() => {
    async function loadManifest() {
      try {
        const response = await fetch('/content-manifest.json');
        if (!response.ok) return;
        const data: ContentManifest = await response.json();
        setCategories(data.categories);
      } catch {
        // Manifest not available — leave categories empty
      }
    }
    loadManifest();
  }, []);

  // Perform search when query or index readiness changes
  const results: SearchResult[] = useMemo(() => {
    if (!isReady || !query.trim()) return [];
    return search(query);
  }, [query, search, isReady]);

  // Filter results by selected category
  const filteredResults = useMemo(() => {
    if (!selectedCategory) return results;
    return results.filter((result) => {
      // The topicId contains the category slug as the first path segment
      const categorySlug = result.topicId.split('/')[0];
      return categorySlug === selectedCategory;
    });
  }, [results, selectedCategory]);

  // Show prompt when query is empty or missing
  if (!query.trim()) {
    return (
      <div className="page-search">
        <h2>Search</h2>
        <div className="search-page-prompt">
          <p>Enter a search term to find topics, sections, and code examples.</p>
          <p className="search-page-prompt__hint">
            Use the search bar above or navigate to <code>/search?q=your+query</code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-search">
      <h2>Search Results</h2>

      {/* Category filter controls */}
      <div className="search-page-filters" role="group" aria-label="Category filters">
        <button
          className={`search-filter-btn ${selectedCategory === null ? 'search-filter-btn--active' : ''}`}
          onClick={() => setSelectedCategory(null)}
          aria-pressed={selectedCategory === null}
        >
          All
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            className={`search-filter-btn ${selectedCategory === category.id ? 'search-filter-btn--active' : ''}`}
            onClick={() => setSelectedCategory(category.id)}
            aria-pressed={selectedCategory === category.id}
          >
            {category.name}
          </button>
        ))}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="search-page-loading" role="status" aria-live="polite">
          <p>Loading search index…</p>
        </div>
      )}

      {/* Results */}
      {isReady && (
        <div className="search-page-results" aria-live="polite">
          <p className="search-page-results__summary">
            {filteredResults.length === 0
              ? `No results found for "${query}"`
              : `${filteredResults.length} result${filteredResults.length !== 1 ? 's' : ''} for "${query}"`}
            {selectedCategory && ` in ${categories.find((c) => c.id === selectedCategory)?.name || selectedCategory}`}
          </p>

          {filteredResults.length > 0 && (
            <ul className="search-page-results__list">
              {filteredResults.map((result) => {
                const topicParts = result.topicId.split('/');
                const categorySlug = topicParts.length > 1 ? topicParts[0] : result.topicId;
                const topicSlug = topicParts.length > 1 ? topicParts.slice(1).join('/') : result.topicId;

                return (
                  <li key={`${result.topicId}:${result.sectionId}`} className="search-result-card">
                    <Link
                      to={`/topic/${categorySlug}/${topicSlug}#${result.sectionId}`}
                      className="search-result-card__link"
                    >
                      <span className="search-result-card__category">
                        {categories.find((c) => c.id === categorySlug)?.name || categorySlug}
                      </span>
                      <h3 className="search-result-card__topic-title">
                        <HighlightedText text={result.title} query={query} />
                      </h3>
                      <p className="search-result-card__section-title">
                        Section: <HighlightedText text={result.title} query={query} />
                      </p>
                      <p className="search-result-card__snippet">
                        <HighlightedText text={result.snippet} query={query} />
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
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
