/**
 * TopicPage — Composes the full topic view.
 *
 * Supports three rendering modes:
 * 1. Subtopic view: when subtopicSlug is present, fetches and renders subtopic content
 * 2. Multi-page overview: when topic has subtopics, renders index content + subtopic links
 * 3. Single-file topic: existing behavior for topics without subtopics
 *
 * Completion is manual — a "Mark as complete" button at the bottom of each page.
 *
 * Requirements: 3.3, 3.4, 3.5, 3.6, 3.7
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Breadcrumbs } from '../components/navigation/Breadcrumbs';
import { ViewToggle } from '../components/content/ViewToggle';
import { QuickReferenceCard } from '../components/content/QuickReferenceCard';
import { ContentCard } from '../components/content/ContentCard';
import { TableOfContents } from '../components/content/TableOfContents';
import { ShareButton } from '../components/content/ShareButton';
import { RandomTopicButton } from '../components/navigation/RandomTopicButton';
import { calculateReadingTime } from '../utils/reading-time';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import {
  truncateToCheatSheet,
  truncateToELI5,
  type ContentView,
} from '../utils/content-views';
import { get, set } from '../utils/storage';
import { useDailyGoal } from '../hooks/useDailyGoal';
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

/** Storage key for manual completion state */
const COMPLETED_KEY = 'completed-topics';

/** Get the set of completed topic/subtopic IDs */
function getCompletedTopics(): Set<string> {
  const completed = get<string[]>(COMPLETED_KEY, []);
  return new Set(completed);
}

/** Toggle completion for a topic/subtopic ID */
function toggleCompletion(topicId: string): boolean {
  const completed = get<string[]>(COMPLETED_KEY, []);
  const completedSet = new Set(completed);
  if (completedSet.has(topicId)) {
    completedSet.delete(topicId);
    set(COMPLETED_KEY, Array.from(completedSet));
    return false;
  } else {
    completedSet.add(topicId);
    set(COMPLETED_KEY, Array.from(completedSet));
    return true;
  }
}

/** Extract quick reference items from the first few sections */
function extractQuickReferenceItems(sections: ContentSection[]): string[] {
  const items: string[] = [];
  for (const section of sections) {
    if (items.length >= 7) break;
    for (const node of section.content) {
      if (items.length >= 7) break;
      if (node.type === 'paragraph' && node.text.trim().length > 0) {
        items.push(node.text);
        break;
      }
    }
  }
  return items;
}

/**
 * Filter sections at the topic level for cheat-sheet and eli5 views.
 */
function filterSectionsByView(
  sections: ContentSection[],
  view: ContentView
): ContentSection[] {
  if (view === 'full') {
    return sections;
  }

  if (view === 'eli5') {
    if (sections.length === 0) return [];
    let sentencesRemaining = 3;
    const result: ContentSection[] = [];

    for (const section of sections) {
      if (sentencesRemaining <= 0) break;
      const truncatedContent = truncateToELI5(section.content, sentencesRemaining);
      if (truncatedContent.length === 0) continue;

      let sentencesUsed = 0;
      for (const node of truncatedContent) {
        if (node.type === 'paragraph' || node.type === 'blockquote') {
          const text = node.type === 'paragraph' ? node.text : node.text;
          const sentences = text.trim().split(/[.!?]+(?:\s|$)/).filter((s: string) => s.trim().length > 0);
          sentencesUsed += sentences.length;
        }
      }

      result.push({ ...section, content: truncatedContent, subsections: [] });
      sentencesRemaining -= sentencesUsed;
    }
    return result;
  }

  // Cheat-sheet
  const result: ContentSection[] = [];
  let wordsRemaining = 500;

  for (const section of sections) {
    if (wordsRemaining <= 0) break;
    const truncatedContent = truncateToCheatSheet(section.content, wordsRemaining);
    if (truncatedContent.length === 0) continue;

    let sectionWords = 0;
    for (const node of truncatedContent) {
      if (node.type === 'code') continue;
      if (node.type === 'paragraph') sectionWords += countWordsInText(node.text);
      else if (node.type === 'blockquote') sectionWords += countWordsInText(node.text);
      else if (node.type === 'list') sectionWords += node.items.reduce((sum, item) => sum + countWordsInText(item), 0);
    }

    result.push({ ...section, content: truncatedContent, subsections: [] });
    wordsRemaining -= sectionWords;
  }
  return result;
}

function countWordsInText(text: string): number {
  if (!text.trim()) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

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
  const [isCompleted, setIsCompleted] = useState(false);

  // Daily goal: track time spent on page
  const { addMinutes } = useDailyGoal();
  const pageEntryTime = useRef<number>(Date.now());

  useEffect(() => {
    pageEntryTime.current = Date.now();
    return () => {
      const elapsed = Math.floor((Date.now() - pageEntryTime.current) / 60000);
      if (elapsed >= 1) {
        addMinutes(elapsed);
      }
    };
  }, [categorySlug, topicSlug, subtopicSlug, addMinutes]);

  // Fetch manifest on mount
  useEffect(() => {
    let cancelled = false;
    async function loadManifest() {
      try {
        const response = await fetch('/content-manifest.json');
        if (!response.ok) return;
        const data: ContentManifest = await response.json();
        if (!cancelled) setManifest(data);
      } catch { /* Manifest not available */ }
    }
    loadManifest();
    return () => { cancelled = true; };
  }, []);

  // Fetch topic/subtopic content JSON
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

    const contentPath = subtopicSlug
      ? `/content/${categorySlug}/${topicSlug}/${subtopicSlug}.json`
      : `/content/${categorySlug}/${topicSlug}.json`;

    fetch(contentPath)
      .then((response) => {
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error(subtopicSlug ? 'SUBTOPIC_NOT_FOUND' : 'TOPIC_NOT_FOUND');
          }
          throw new Error(`Failed to load topic: ${response.status}`);
        }
        return response.json();
      })
      .then((data: TopicData) => {
        if (!cancelled) {
          setTopicData(data);
          // Check completion state
          const completionId = subtopicSlug
            ? `${categorySlug}/${topicSlug}/${subtopicSlug}`
            : `${categorySlug}/${topicSlug}`;
          setIsCompleted(getCompletedTopics().has(completionId));
          setLoading(false);

          // Track recently studied topics
          const recentKey = 'recent-topics';
          const recent = get<Array<{ topicId: string; title: string; categorySlug: string; topicSlug: string; timestamp: number }>>(recentKey, []);
          const topicIdForRecent = subtopicSlug
            ? `${categorySlug}/${topicSlug}/${subtopicSlug}`
            : `${categorySlug}/${topicSlug}`;
          const filtered = recent.filter((r) => r.topicId !== topicIdForRecent);
          filtered.unshift({
            topicId: topicIdForRecent,
            title: data.title,
            categorySlug: categorySlug!,
            topicSlug: subtopicSlug ? `${topicSlug}/${subtopicSlug}` : topicSlug!,
            timestamp: Date.now(),
          });
          set(recentKey, filtered.slice(0, 10));
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          if (err.message === 'TOPIC_NOT_FOUND') setNotFound(true);
          else if (err.message === 'SUBTOPIC_NOT_FOUND') setSubtopicNotFound(true);
          else setError(err.message);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [categorySlug, topicSlug, subtopicSlug]);

  const handleViewChange = useCallback((view: ContentView) => {
    setActiveView(view);
  }, []);

  const handleToggleComplete = useCallback(() => {
    const completionId = subtopicSlug
      ? `${categorySlug}/${topicSlug}/${subtopicSlug}`
      : `${categorySlug}/${topicSlug}`;
    const newState = toggleCompletion(completionId);
    setIsCompleted(newState);
  }, [categorySlug, topicSlug, subtopicSlug]);

  const manifestTopic = useMemo(() => {
    if (!manifest || !categorySlug || !topicSlug) return undefined;
    return findTopicInManifest(manifest, categorySlug, topicSlug);
  }, [manifest, categorySlug, topicSlug]);

  const hasSubtopics = useMemo(() => {
    return manifestTopic?.subtopics && manifestTopic.subtopics.length > 0;
  }, [manifestTopic]);

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

  useDocumentMeta({
    title: topicData?.title ?? 'CS Reference Guide',
    description: firstSectionSummary,
  });

  if (loading) {
    return (
      <div className="page-topic page-topic--loading" data-category={categorySlug} role="status" aria-live="polite">
        <p>Loading topic content…</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="page-topic page-topic--error" data-category={categorySlug} role="alert">
        <h2>Topic not found</h2>
        <p>The topic you're looking for doesn't exist.</p>
        <Link to="/">Return to Dashboard</Link>
      </div>
    );
  }

  if (subtopicNotFound) {
    const isSingleFileTopic = manifest && manifestTopic && !hasSubtopics;
    return (
      <div className="page-topic page-topic--error" data-category={categorySlug} role="alert">
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

  if (error || !topicData) {
    return (
      <div className="page-topic page-topic--error" data-category={categorySlug} role="alert">
        <h2>Unable to load topic</h2>
        <p>{error ?? 'Topic data is unavailable.'}</p>
      </div>
    );
  }

  const breadcrumbDisplayNames: Record<string, string> = {};
  if (topicSlug) {
    breadcrumbDisplayNames[topicSlug] = manifestTopic?.title ?? topicData.title;
  }
  if (subtopicSlug && topicData) {
    breadcrumbDisplayNames[subtopicSlug] = topicData.title;
  }

  if (subtopicSlug) {
    return (
      <SubtopicView
        topicData={topicData}
        categorySlug={categorySlug!}
        topicSlug={topicSlug!}
        subtopicSlug={subtopicSlug}
        subtopics={manifestTopic?.subtopics ?? []}
        breadcrumbDisplayNames={breadcrumbDisplayNames}
        activeView={activeView}
        onViewChange={handleViewChange}
        isCompleted={isCompleted}
        onToggleComplete={handleToggleComplete}
      />
    );
  }

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
        isCompleted={isCompleted}
        onToggleComplete={handleToggleComplete}
      />
    );
  }

  return (
    <SingleFileView
      topicData={topicData}
      categorySlug={categorySlug!}
      breadcrumbDisplayNames={breadcrumbDisplayNames}
      activeView={activeView}
      onViewChange={handleViewChange}
      isCompleted={isCompleted}
      onToggleComplete={handleToggleComplete}
    />
  );
}

// ─── Subtopic View ───────────────────────────────────────────────────────────

interface SubtopicViewProps {
  topicData: TopicData;
  categorySlug: string;
  topicSlug: string;
  subtopicSlug: string;
  subtopics: ManifestSubtopic[];
  breadcrumbDisplayNames: Record<string, string>;
  activeView: ContentView;
  onViewChange: (view: ContentView) => void;
  isCompleted: boolean;
  onToggleComplete: () => void;
}

function SubtopicView({
  topicData,
  categorySlug,
  topicSlug,
  subtopicSlug,
  subtopics,
  breadcrumbDisplayNames,
  activeView,
  onViewChange,
  isCompleted,
  onToggleComplete,
}: SubtopicViewProps) {
  const quickRefItems = extractQuickReferenceItems(topicData.sections);
  const totalWordCount = getTotalWordCount(topicData.sections);
  const readingTime = calculateReadingTime(totalWordCount);
  const showTableOfContents = topicData.sections.length > 5;

  // Compute prev/next subtopics
  const currentIndex = subtopics.findIndex((s) => s.slug === subtopicSlug);
  const prevSubtopic = currentIndex > 0 ? subtopics[currentIndex - 1] : null;
  const nextSubtopic = currentIndex < subtopics.length - 1 ? subtopics[currentIndex + 1] : null;

  return (
    <div className="page-topic" data-category={categorySlug}>
      <Breadcrumbs displayNames={breadcrumbDisplayNames} />

      <Link to={`/topic/${categorySlug}/${topicSlug}`} className="topic-back-link">
        ← Back to overview
      </Link>

      <header className="topic-header">
        <h1 className="topic-header__title">{topicData.title}</h1>
        <p className="topic-header__reading-time">{readingTime} min read</p>
        <div className="topic-toolbar">
          <ShareButton />
          <RandomTopicButton />
        </div>
      </header>

      <ViewToggle onChange={onViewChange} />
      <QuickReferenceCard items={quickRefItems} />

      <div className={showTableOfContents ? 'topic-layout' : ''}>
        <div className={showTableOfContents ? 'topic-layout__content' : ''}>
          <div className="topic-content-sections">
            {filterSectionsByView(topicData.sections, activeView).map((section) => (
              <ContentCard key={section.id} section={section} />
            ))}
          </div>
        </div>

        {showTableOfContents && (
          <aside className="topic-layout__toc">
            <TableOfContents sections={topicData.sections} />
          </aside>
        )}
      </div>

      {/* Prev/Next Navigation */}
      {(prevSubtopic || nextSubtopic) && (
        <nav className="topic-prev-next" aria-label="Previous and next subtopics">
          {prevSubtopic ? (
            <Link
              to={`/topic/${categorySlug}/${topicSlug}/${prevSubtopic.slug}`}
              className="topic-prev-next__link topic-prev-next__link--prev"
            >
              <span className="topic-prev-next__direction">← Previous</span>
              <span className="topic-prev-next__title">{prevSubtopic.title}</span>
            </Link>
          ) : <span />}
          {nextSubtopic ? (
            <Link
              to={`/topic/${categorySlug}/${topicSlug}/${nextSubtopic.slug}`}
              className="topic-prev-next__link topic-prev-next__link--next"
            >
              <span className="topic-prev-next__direction">Next →</span>
              <span className="topic-prev-next__title">{nextSubtopic.title}</span>
            </Link>
          ) : <span />}
        </nav>
      )}

      <MarkCompleteButton isCompleted={isCompleted} onToggle={onToggleComplete} />
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
  isCompleted: boolean;
  onToggleComplete: () => void;
}

function MultiPageOverview({
  topicData,
  subtopics,
  categorySlug,
  topicSlug,
  breadcrumbDisplayNames,
  activeView,
  onViewChange,
  isCompleted,
  onToggleComplete,
}: MultiPageOverviewProps) {
  const quickRefItems = extractQuickReferenceItems(topicData.sections);
  const totalWordCount = getTotalWordCount(topicData.sections);
  const readingTime = calculateReadingTime(totalWordCount);
  const showTableOfContents = topicData.sections.length > 5;

  return (
    <div className="page-topic" data-category={categorySlug}>
      <Breadcrumbs displayNames={breadcrumbDisplayNames} />

      <header className="topic-header">
        <h1 className="topic-header__title">{topicData.title}</h1>
        <p className="topic-header__reading-time">{readingTime} min read</p>
        <div className="topic-toolbar">
          <ShareButton />
          <RandomTopicButton />
        </div>
      </header>

      <ViewToggle onChange={onViewChange} />
      <QuickReferenceCard items={quickRefItems} />

      <div className={showTableOfContents ? 'topic-layout' : ''}>
        <div className={showTableOfContents ? 'topic-layout__content' : ''}>
          <div className="topic-content-sections">
            {filterSectionsByView(topicData.sections, activeView).map((section) => (
              <ContentCard key={section.id} section={section} />
            ))}
          </div>
        </div>

        {showTableOfContents && (
          <aside className="topic-layout__toc">
            <TableOfContents sections={topicData.sections} />
          </aside>
        )}
      </div>

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

      <MarkCompleteButton isCompleted={isCompleted} onToggle={onToggleComplete} />
    </div>
  );
}

// ─── Single-File View ────────────────────────────────────────────────────────

interface SingleFileViewProps {
  topicData: TopicData;
  categorySlug: string;
  breadcrumbDisplayNames: Record<string, string>;
  activeView: ContentView;
  onViewChange: (view: ContentView) => void;
  isCompleted: boolean;
  onToggleComplete: () => void;
}

function SingleFileView({
  topicData,
  categorySlug,
  breadcrumbDisplayNames,
  activeView,
  onViewChange,
  isCompleted,
  onToggleComplete,
}: SingleFileViewProps) {
  const quickRefItems = extractQuickReferenceItems(topicData.sections);
  const totalWordCount = getTotalWordCount(topicData.sections);
  const readingTime = calculateReadingTime(totalWordCount);
  const showTableOfContents = topicData.sections.length > 5;

  return (
    <div className="page-topic" data-category={categorySlug}>
      <Breadcrumbs displayNames={breadcrumbDisplayNames} />

      <header className="topic-header">
        <h1 className="topic-header__title">{topicData.title}</h1>
        <p className="topic-header__reading-time">{readingTime} min read</p>
        <div className="topic-toolbar">
          <ShareButton />
          <RandomTopicButton />
        </div>
      </header>

      <ViewToggle onChange={onViewChange} />
      <QuickReferenceCard items={quickRefItems} />

      <div className={showTableOfContents ? 'topic-layout' : ''}>
        <div className={showTableOfContents ? 'topic-layout__content' : ''}>
          <div className="topic-content-sections">
            {filterSectionsByView(topicData.sections, activeView).map((section) => (
              <ContentCard key={section.id} section={section} />
            ))}
          </div>
        </div>

        {showTableOfContents && (
          <aside className="topic-layout__toc">
            <TableOfContents sections={topicData.sections} />
          </aside>
        )}
      </div>

      <MarkCompleteButton isCompleted={isCompleted} onToggle={onToggleComplete} />
    </div>
  );
}

// ─── Mark Complete Button ────────────────────────────────────────────────────

interface MarkCompleteButtonProps {
  isCompleted: boolean;
  onToggle: () => void;
}

function MarkCompleteButton({ isCompleted, onToggle }: MarkCompleteButtonProps) {
  return (
    <div className="topic-completion">
      <button
        type="button"
        className={`topic-completion__btn ${isCompleted ? 'topic-completion__btn--completed' : ''}`}
        onClick={onToggle}
        aria-pressed={isCompleted}
      >
        {isCompleted ? '✓ Completed' : 'Mark as complete'}
      </button>
    </div>
  );
}
