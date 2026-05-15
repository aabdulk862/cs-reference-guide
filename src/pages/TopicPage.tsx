/**
 * TopicPage — Composes the full topic view.
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
 * Requirements: 3.6, 1.2
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
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
import type { ContentSection, ContentNode } from '../types/content';

/** Shape of the topic JSON loaded at runtime */
interface TopicData {
  id: string;
  slug: string;
  title: string;
  category: string;
  sections: ContentSection[];
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

/** Apply view mode filtering to a section's content nodes */
function filterContentByView(
  content: ContentNode[],
  view: ContentView
): ContentNode[] {
  switch (view) {
    case 'cheat-sheet':
      return truncateToCheatSheet(content, 500);
    case 'eli5':
      return truncateToELI5(content, 3);
    case 'full':
    default:
      return content;
  }
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

export default function TopicPage() {
  const { categorySlug, topicSlug } = useParams<{
    categorySlug: string;
    topicSlug: string;
  }>();

  const [topicData, setTopicData] = useState<TopicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ContentView>('full');
  const [viewedSections, setViewedSections] = useState<Set<string>>(new Set());

  // Fetch topic content JSON on mount or when route params change
  useEffect(() => {
    if (!categorySlug || !topicSlug) {
      setError('Invalid topic path.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const contentPath = `/content/${categorySlug}/${topicSlug}.json`;

    fetch(contentPath)
      .then((response) => {
        if (!response.ok) {
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
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [categorySlug, topicSlug]);

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

  // Error state
  if (error || !topicData) {
    return (
      <div className="page-topic page-topic--error" role="alert">
        <h2>Unable to load topic</h2>
        <p>{error ?? 'Topic data is unavailable.'}</p>
      </div>
    );
  }

  const totalSections = countAllSections(topicData.sections);
  const allSectionIds = collectAllSectionIds(topicData.sections);
  const viewedCount = allSectionIds.filter((id) => viewedSections.has(id)).length;
  const progressPercent = totalSections > 0 ? Math.floor((viewedCount / totalSections) * 100) : 0;

  const quickRefItems = extractQuickReferenceItems(topicData.sections);

  // Calculate reading time from total word count
  const totalWordCount = getTotalWordCount(topicData.sections);
  const readingTime = calculateReadingTime(totalWordCount);

  // Show TOC when topic has more than 5 sections
  const showTableOfContents = topicData.sections.length > 5;

  // Build display name overrides for breadcrumbs
  const breadcrumbDisplayNames: Record<string, string> = {};
  if (topicSlug) {
    breadcrumbDisplayNames[topicSlug] = topicData.title;
  }

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
      <ViewToggle onChange={handleViewChange} />

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
        {topicData.sections.map((section) => (
          <TrackedContentCard
            key={section.id}
            section={{
              ...section,
              content: filterContentByView(section.content, activeView),
            }}
            onViewed={handleSectionViewed}
          />
        ))}
      </div>
    </div>
  );
}

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
