/**
 * TopicPage — Composes the full topic view.
 *
 * Supports three rendering modes:
 * 1. Subtopic view: when subtopicSlug is present, fetches and renders subtopic content
 * 2. Multi-page overview: when topic has subtopics, renders index content + subtopic links
 * 3. Single-file topic: existing behavior for topics without subtopics
 *
 * Lazy-loads topic content JSON on navigation, then renders:
 * 1. Breadcrumbs (navigation context)
 * 2. ViewToggle (full / cheat-sheet / eli5)
 * 3. QuickReferenceCard (first key points from content)
 * 4. Progress bar (sections viewed / total sections)
 * 5. ContentCards for each section
 *
 * The selected view mode filters content via the content-views utility.
 *
 * Requirements: 3.3, 3.4, 3.5, 3.6, 3.7
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Breadcrumbs } from '../components/navigation/Breadcrumbs';
import { ViewToggle } from '../components/content/ViewToggle';
import { QuickReferenceCard } from '../components/content/QuickReferenceCard';
import { ContentCard } from '../components/content/ContentCard';
import { TableOfContents } from '../components/content/TableOfContents';
import { calculateReadingTime } from '../utils/reading-time';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import {
  truncateToCheatSheet,
  truncateToELI5,
  type ContentView,
} from '../utils/content-views';
import { get, set } from '../utils/storage';
import type { ContentSection } from '../types/content';

/** Shape of the topic JSON loaded at runtime */
interface TopicData {
  id: string;
  slug: string;
  title: string;
  category: string;
  sections: ContentSection[];
}

/** Manifest subtopic entry */
interface ManifestSubtopic {
  id: string;
  slug: string;
  title: string;
  wordCount: number;
}

/** Manifest topic entry */
interface ManifestTopic {
  id: string;
  slug: string;
  title: string;
  source: 'parsed' | 'authored';
  sectionCount: number;
  wordCount: number;
  contentPath: string;
  subtopics?: ManifestSubtopic[];
}

/** Manifest category entry */
interface ManifestCategory {
  id: string;
  name: string;
  topics: ManifestTopic[];
}

/** Content manifest structure */
interface ContentManifest {
  categories: ManifestCategory[];
  totalTopics: number;
  totalSections: number;
  buildTimestamp: string;
}

/** Progress storage key prefix */
const PROGRESS_KEY = 'progress';

/** Retrieve viewed sections for a topic from localStorage */
function getViewedSections(topicId: string): Set<string> {
  const progress = get<Record<string, string[]>>(PROGRESS_KEY, {});
  const sectionIds = progress[topicId] ?? [];
  return new Set(sectionIds);
}

/** Mark a section as viewed for a topic in localStorage */
function markSectionViewed(topicId: string, sectionId: string): void {
  const progress = get<Record<string, string[]>>(PROGRESS_KEY, {});
  const existing = new Set(progress[topicId] ?? []);
  existing.add(sectionId);
  progress[topicId] = Array.from(existing);
  set(PROGRESS_KEY, progress);
}

/** Extract quick reference items from the first few sections */
function extractQuickReferenceItems(sections: ContentSection[]): string[] {
  const items: string[] = [];
  for (const section of sections) {
    if (items.length >= 7) break;
    // Extract the first paragraph text from each section as a key point
    for (const node of section.content) {
      if (items.length >= 7) break;
      if (node.type === 'paragraph' && node.text.trim().length > 0) {
        items.push(node.text);
        break; // Only take the first paragraph per section
      }
    }
  }
  return items;
}

/**
 * Filter sections at the topic level for cheat-sheet and eli5 views.
 * For cheat-sheet: applies a shared 500-word budget across all sections,
 * returning only sections that fit within the budget.
 * For eli5: returns only the first section with 3 sentences total.
 * For full: returns all sections unchanged.
 */
function filterSectionsByView(
  sections: ContentSection[],
  view: ContentView
): ContentSection[] {
  if (view === 'full') {
    return sections;
  }

  if (view === 'eli5') {
    // ELI5: find the first section(s) that have paragraph content and show 3 sentences total
    if (sections.length === 0) return [];
    
    let sentencesRemaining = 3;
    const result: ContentSection[] = [];

    for (const section of sections) {
      if (sentencesRemaining <= 0) break;

      const truncatedContent = truncateToELI5(section.content, sentencesRemaining);
      if (truncatedContent.length === 0) continue;

      // Count sentences consumed
      let sentencesUsed = 0;
      for (const node of truncatedContent) {
        if (node.type === 'paragraph' || node.type === 'blockquote') {
          const text = node.type === 'paragraph' ? node.text : node.text;
          // Count sentence-ending punctuation
          const sentences = text.trim().split(/[.!?]+(?:\s|$)/).filter((s: string) => s.trim().length > 0);
          sentencesUsed += sentences.length;
        }
      }

      result.push({
        ...section,
        content: truncatedContent,
        subsections: [],
      });

      sentencesRemaining -= sentencesUsed;
    }

    return result;
  }

  // Cheat-sheet: apply a shared 500-word budget across all sections
  const result: ContentSection[] = [];
  let wordsRemaining = 500;

  for (const section of sections) {
    if (wordsRemaining <= 0) break;

    const truncatedContent = truncateToCheatSheet(section.content, wordsRemaining);
    if (truncatedContent.length === 0) continue;

    // Count how many words were used by this section's truncated content
    let sectionWords = 0;
    for (const node of truncatedContent) {
      if (node.type === 'code') continue; // code blocks don't count
      if (node.type === 'paragraph') sectionWords += countWordsInText(node.text);
      else if (node.type === 'blockquote') sectionWords += countWordsInText(node.text);
      else if (node.type === 'list') sectionWords += node.items.reduce((sum, item) => sum + countWordsInText(item), 0);
    }

    result.push({
      ...section,
      content: truncatedContent,
      subsections: [],
    });

    wordsRemaining -= sectionWords;
  }

  return result;
}

/** Count words in a text string */
function countWordsInText(text: string): number {
  if (!text.trim()) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Flatten sections to count total (including subsections) */
function countAllSections(sections: ContentSection[]): number {
  let count = 0;
  for (const section of sections) {
    count += 1;
    if (section.subsections && section.subsections.length > 0) {
      count += countAllSections(section.subsections);
    }
  }
  return count;
}

/** Collect all section IDs (including subsections) */
function collectAllSectionIds(sections: ContentSection[]): string[] {
  const ids: string[] = [];
  for (const section of sections) {
    ids.push(section.id);
    if (section.subsections && section.subsections.length > 0) {
      ids.push(...collectAllSectionIds(section.subsections));
    }
  }
  return ids;
}

/** Calculate total word count across all sections (including subsections) */
function getTotalWordCount(sections: ContentSection[]): number {
  let total = 0;
  for (const section of sections) {
    total += section.wordCount;
    if (section.subsections && section.subsections.length > 0) {
      total += getTotalWordCount(section.subsections);
    }
  }
  return total;
}

/**
 * Find a topic in the manifest by category slug and topic slug.
 * Returns the topic entry if found, or undefined.
 */
function findTopicInManifest(
  manifest: ContentManifest,
  categorySlug: string,
  topicSlug: string
): ManifestTopic | undefined {
  const category = manifest.categories.find((c) => c.id === categorySlug);
  if (!category) return undefined;
  return category.topics.find((t) => {
    const slugPart = t.slug.split('/')[1] ?? t.id;
    return slugPart === topicSlug;
  });
}

export default function TopicPage() {
  const { categorySlug, topicSlug, subtopicSlug } = useParams<{
    categorySlug: string;
    topicSlug: string;
    subtopicSlug: string;
  }>();

  const [topicData, setTopicData] = useState<TopicData | null>(null);
  const [manifest, setManifest] = useState<ContentManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [subtopicNotFound, setSubtopicNotFound] = useState(false);
  const [activeView, setActiveView] = useState<ContentView>('full');
  const [viewedSections, setViewedSections] = useState<Set<string>>(new Set());

  // Fetch manifest on mount
  useEffect(() => {
    let cancelled = false;

    async function loadManifest() {
      try {
        const response = await fetch('/content-manifest.json');
        if (!response.ok) return;
        const data: ContentManifest = await response.json();
        if (!cancelled) {
          setManifest(data);
        }
      } catch {
        // Manifest not available — continue without it
      }
    }

    loadManifest();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch topic/subtopic content JSON on mount or when route params change
  useEffect(() => {
    if (!categorySlug || !topicSlug) {
      setError('Invalid topic path.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotFound(false);
    setSubtopicNotFound(false);

    // Determine the content path based on whether we're viewing a subtopic
    const contentPath = subtopicSlug
      ? `/content/${categorySlug}/${topicSlug}/${subtopicSlug}.json`
      : `/content/${categorySlug}/${topicSlug}.json`;

    fetch(contentPath)
      .then((response) => {
        if (!response.ok) {
          if (response.status === 404) {
            if (subtopicSlug) {
              // Subtopic not found — could be invalid subtopic or subtopic on single-file topic
              throw new Error('SUBTOPIC_NOT_FOUND');
            } else {
              // Topic not found
              throw new Error('TOPIC_NOT_FOUND');
            }
          }
          throw new Error(`Failed to load topic: ${response.status}`);
        }
        return response.json();
      })
      .then((data: TopicData) => {
        if (!cancelled) {
          setTopicData(data);
          setViewedSections(getViewedSections(data.id));
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          if (err.message === 'TOPIC_NOT_FOUND') {
            setNotFound(true);
          } else if (err.message === 'SUBTOPIC_NOT_FOUND') {
            setSubtopicNotFound(true);
          } else {
            setError(err.message);
          }
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [categorySlug, topicSlug, subtopicSlug]);

  // Handle view mode change from ViewToggle
  const handleViewChange = useCallback((view: ContentView) => {
    setActiveView(view);
  }, []);

  // Track section visibility (mark as viewed when scrolled into view)
  const handleSectionViewed = useCallback(
    (sectionId: string) => {
      if (!topicData) return;
      markSectionViewed(topicData.id, sectionId);
      setViewedSections((prev) => {
        const next = new Set(prev);
        next.add(sectionId);
        return next;
      });
    },
    [topicData]
  );

  // Determine if the topic has subtopics from the manifest
  const manifestTopic = useMemo(() => {
    if (!manifest || !categorySlug || !topicSlug) return undefined;
    return findTopicInManifest(manifest, categorySlug, topicSlug);
  }, [manifest, categorySlug, topicSlug]);

  const hasSubtopics = useMemo(() => {
    return manifestTopic?.subtopics && manifestTopic.subtopics.length > 0;
  }, [manifestTopic]);

  // Extract first section summary for meta description (must be called unconditionally)
  const firstSectionSummary = useMemo(() => {
    if (!topicData || !topicData.sections.length) return '';
    const firstSection = topicData.sections[0];
    for (const node of firstSection.content) {
      if (node.type === 'paragraph' && node.text.trim().length > 0) {
        return node.text.trim();
      }
    }
    return firstSection.heading || '';
  }, [topicData]);

  // Set document meta for SEO (must be called unconditionally)
  useDocumentMeta({
    title: topicData?.title ?? 'CS Reference Guide',
    description: firstSectionSummary,
  });

  // Loading state
  if (loading) {
    return (
      <div className="page-topic page-topic--loading" role="status" aria-live="polite">
        <p>Loading topic content…</p>
      </div>
    );
  }

  // Topic not found error
  if (notFound) {
    return (
      <div className="page-topic page-topic--error" role="alert">
        <h2>Topic not found</h2>
        <p>The topic you're looking for doesn't exist.</p>
        <Link to="/">Return to Dashboard</Link>
      </div>
    );
  }

  // Subtopic not found error — check if it's a subtopic on a single-file topic
  if (subtopicNotFound) {
    // If manifest is loaded and topic has no subtopics, it's a single-file topic
    const isSingleFileTopic = manifest && manifestTopic && !hasSubtopics;

    return (
      <div className="page-topic page-topic--error" role="alert">
        <h2>{isSingleFileTopic ? 'Page not found' : 'Subtopic not found'}</h2>
        <p>
          {isSingleFileTopic
            ? 'This topic does not have subtopics.'
            : "The subtopic you're looking for doesn't exist within this topic."}
        </p>
        <Link to={`/topic/${categorySlug}/${topicSlug}`}>
          {isSingleFileTopic ? 'View topic' : 'Back to topic overview'}
        </Link>
      </div>
    );
  }

  // Generic error state
  if (error || !topicData) {
    return (
      <div className="page-topic page-topic--error" role="alert">
        <h2>Unable to load topic</h2>
        <p>{error ?? 'Topic data is unavailable.'}</p>
      </div>
    );
  }

  // Build display name overrides for breadcrumbs
  const breadcrumbDisplayNames: Record<string, string> = {};
  if (topicSlug) {
    // Use manifest topic title if available, otherwise use fetched data title
    breadcrumbDisplayNames[topicSlug] = manifestTopic?.title ?? topicData.title;
  }
  if (subtopicSlug && topicData) {
    breadcrumbDisplayNames[subtopicSlug] = topicData.title;
  }

  // --- Subtopic view ---
  if (subtopicSlug) {
    return (
      <SubtopicView
        topicData={topicData}
        categorySlug={categorySlug!}
        topicSlug={topicSlug!}
        breadcrumbDisplayNames={breadcrumbDisplayNames}
        activeView={activeView}
        onViewChange={handleViewChange}
        viewedSections={viewedSections}
        onSectionViewed={handleSectionViewed}
      />
    );
  }

  // --- Multi-page topic overview ---
  if (hasSubtopics && manifestTopic?.subtopics) {
    return (
      <MultiPageOverview
        topicData={topicData}
        subtopics={manifestTopic.subtopics}
        categorySlug={categorySlug!}
        topicSlug={topicSlug!}
        breadcrumbDisplayNames={breadcrumbDisplayNames}
        activeView={activeView}
        onViewChange={handleViewChange}
        viewedSections={viewedSections}
        onSectionViewed={handleSectionViewed}
      />
    );
  }

  // --- Single-file topic (existing behavior) ---
  return (
    <SingleFileView
      topicData={topicData}
      breadcrumbDisplayNames={breadcrumbDisplayNames}
      activeView={activeView}
      onViewChange={handleViewChange}
      viewedSections={viewedSections}
      onSectionViewed={handleSectionViewed}
    />
  );
}

// ─── Subtopic View ───────────────────────────────────────────────────────────

interface SubtopicViewProps {
  topicData: TopicData;
  categorySlug: string;
  topicSlug: string;
  breadcrumbDisplayNames: Record<string, string>;
  activeView: ContentView;
  onViewChange: (view: ContentView) => void;
  viewedSections: Set<string>;
  onSectionViewed: (sectionId: string) => void;
}

function SubtopicView({
  topicData,
  categorySlug,
  topicSlug,
  breadcrumbDisplayNames,
  activeView,
  onViewChange,
  viewedSections,
  onSectionViewed,
}: SubtopicViewProps) {
  const totalSections = countAllSections(topicData.sections);
  const allSectionIds = collectAllSectionIds(topicData.sections);
  const viewedCount = allSectionIds.filter((id) => viewedSections.has(id)).length;
  const progressPercent = totalSections > 0 ? Math.floor((viewedCount / totalSections) * 100) : 0;
  const quickRefItems = extractQuickReferenceItems(topicData.sections);
  const totalWordCount = getTotalWordCount(topicData.sections);
  const readingTime = calculateReadingTime(totalWordCount);
  const showTableOfContents = topicData.sections.length > 5;

  return (
    <div className={`page-topic${showTableOfContents ? ' page-topic--with-toc' : ''}`}>
      {/* Breadcrumbs */}
      <Breadcrumbs displayNames={breadcrumbDisplayNames} />

      {/* Back to overview link */}
      <Link
        to={`/topic/${categorySlug}/${topicSlug}`}
        className="topic-back-link"
      >
        ← Back to overview
      </Link>

      {/* Topic Title and Reading Time */}
      <header className="topic-header">
        <h1 className="topic-header__title">{topicData.title}</h1>
        <p className="topic-header__reading-time">{readingTime} min read</p>
      </header>

      {/* View Toggle */}
      <ViewToggle onChange={onViewChange} />

      {/* Quick Reference Card */}
      <QuickReferenceCard items={quickRefItems} />

      {/* Progress Bar */}
      <TopicProgressBar
        viewed={viewedCount}
        total={totalSections}
        percent={progressPercent}
      />

      {/* Table of Contents sidebar */}
      {showTableOfContents && (
        <TableOfContents sections={topicData.sections} />
      )}

      {/* Content Cards */}
      <div className="topic-content-sections">
        {filterSectionsByView(topicData.sections, activeView).map((section) => (
          <TrackedContentCard
            key={section.id}
            section={section}
            onViewed={onSectionViewed}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Multi-Page Overview ─────────────────────────────────────────────────────

interface MultiPageOverviewProps {
  topicData: TopicData;
  subtopics: ManifestSubtopic[];
  categorySlug: string;
  topicSlug: string;
  breadcrumbDisplayNames: Record<string, string>;
  activeView: ContentView;
  onViewChange: (view: ContentView) => void;
  viewedSections: Set<string>;
  onSectionViewed: (sectionId: string) => void;
}

function MultiPageOverview({
  topicData,
  subtopics,
  categorySlug,
  topicSlug,
  breadcrumbDisplayNames,
  activeView,
  onViewChange,
  viewedSections,
  onSectionViewed,
}: MultiPageOverviewProps) {
  const totalSections = countAllSections(topicData.sections);
  const allSectionIds = collectAllSectionIds(topicData.sections);
  const viewedCount = allSectionIds.filter((id) => viewedSections.has(id)).length;
  const progressPercent = totalSections > 0 ? Math.floor((viewedCount / totalSections) * 100) : 0;
  const quickRefItems = extractQuickReferenceItems(topicData.sections);
  const totalWordCount = getTotalWordCount(topicData.sections);
  const readingTime = calculateReadingTime(totalWordCount);
  const showTableOfContents = topicData.sections.length > 5;

  return (
    <div className={`page-topic${showTableOfContents ? ' page-topic--with-toc' : ''}`}>
      {/* Breadcrumbs */}
      <Breadcrumbs displayNames={breadcrumbDisplayNames} />

      {/* Topic Title and Reading Time */}
      <header className="topic-header">
        <h1 className="topic-header__title">{topicData.title}</h1>
        <p className="topic-header__reading-time">{readingTime} min read</p>
      </header>

      {/* View Toggle */}
      <ViewToggle onChange={onViewChange} />

      {/* Quick Reference Card */}
      <QuickReferenceCard items={quickRefItems} />

      {/* Progress Bar */}
      <TopicProgressBar
        viewed={viewedCount}
        total={totalSections}
        percent={progressPercent}
      />

      {/* Table of Contents sidebar */}
      {showTableOfContents && (
        <TableOfContents sections={topicData.sections} />
      )}

      {/* Index/Overview Content Cards */}
      <div className="topic-content-sections">
        {filterSectionsByView(topicData.sections, activeView).map((section) => (
          <TrackedContentCard
            key={section.id}
            section={section}
            onViewed={onSectionViewed}
          />
        ))}
      </div>

      {/* Subtopic Links */}
      <nav className="topic-subtopics" aria-label="Subtopics">
        <h2 className="topic-subtopics__heading">Subtopics</h2>
        <ul className="topic-subtopics__list">
          {subtopics.map((subtopic) => (
            <li key={subtopic.id} className="topic-subtopics__item">
              <Link
                to={`/topic/${categorySlug}/${topicSlug}/${subtopic.slug}`}
                className="topic-subtopics__link"
              >
                <span className="topic-subtopics__title">{subtopic.title}</span>
                <span className="topic-subtopics__word-count">
                  {subtopic.wordCount.toLocaleString()} words
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

// ─── Single-File View ────────────────────────────────────────────────────────

interface SingleFileViewProps {
  topicData: TopicData;
  breadcrumbDisplayNames: Record<string, string>;
  activeView: ContentView;
  onViewChange: (view: ContentView) => void;
  viewedSections: Set<string>;
  onSectionViewed: (sectionId: string) => void;
}

function SingleFileView({
  topicData,
  breadcrumbDisplayNames,
  activeView,
  onViewChange,
  viewedSections,
  onSectionViewed,
}: SingleFileViewProps) {
  const totalSections = countAllSections(topicData.sections);
  const allSectionIds = collectAllSectionIds(topicData.sections);
  const viewedCount = allSectionIds.filter((id) => viewedSections.has(id)).length;
  const progressPercent = totalSections > 0 ? Math.floor((viewedCount / totalSections) * 100) : 0;
  const quickRefItems = extractQuickReferenceItems(topicData.sections);
  const totalWordCount = getTotalWordCount(topicData.sections);
  const readingTime = calculateReadingTime(totalWordCount);
  const showTableOfContents = topicData.sections.length > 5;

  return (
    <div className={`page-topic${showTableOfContents ? ' page-topic--with-toc' : ''}`}>
      {/* 1. Breadcrumbs */}
      <Breadcrumbs displayNames={breadcrumbDisplayNames} />

      {/* Topic Title and Reading Time */}
      <header className="topic-header">
        <h1 className="topic-header__title">{topicData.title}</h1>
        <p className="topic-header__reading-time">{readingTime} min read</p>
      </header>

      {/* 2. View Toggle */}
      <ViewToggle onChange={onViewChange} />

      {/* 3. Quick Reference Card */}
      <QuickReferenceCard items={quickRefItems} />

      {/* 4. Progress Bar */}
      <TopicProgressBar
        viewed={viewedCount}
        total={totalSections}
        percent={progressPercent}
      />

      {/* Table of Contents sidebar (shown when > 5 sections) */}
      {showTableOfContents && (
        <TableOfContents sections={topicData.sections} />
      )}

      {/* 5. Content Cards */}
      <div className="topic-content-sections">
        {filterSectionsByView(topicData.sections, activeView).map((section) => (
          <TrackedContentCard
            key={section.id}
            section={section}
            onViewed={onSectionViewed}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Shared Components ───────────────────────────────────────────────────────

/**
 * Progress bar showing sections viewed / total sections.
 * Requirement 3.6: visual progress indicators within each Topic.
 */
interface TopicProgressBarProps {
  viewed: number;
  total: number;
  percent: number;
}

function TopicProgressBar({ viewed, total, percent }: TopicProgressBarProps) {
  return (
    <div className="topic-progress" role="region" aria-label="Topic progress">
      <div className="topic-progress__label">
        {viewed} of {total} sections completed
      </div>
      <div
        className="topic-progress__bar"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${percent}% complete`}
      >
        <div
          className="topic-progress__fill"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Wrapper around ContentCard that fires onViewed when the card
 * scrolls into view (using IntersectionObserver at 90% threshold).
 */
interface TrackedContentCardProps {
  section: ContentSection;
  onViewed: (sectionId: string) => void;
}

function TrackedContentCard({ section, onViewed }: TrackedContentCardProps) {
  const handleRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;

      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.9) {
              onViewed(section.id);
              observer.disconnect();
            }
          }
        },
        { threshold: 0.9 }
      );

      observer.observe(node);
    },
    [section.id, onViewed]
  );

  return (
    <div ref={handleRef} className="tracked-content-card">
      <ContentCard section={section} />
    </div>
  );
}
