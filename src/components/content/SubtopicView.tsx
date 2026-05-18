import { Link } from 'react-router-dom';
import { Breadcrumbs } from '../navigation/Breadcrumbs';
import { ViewToggle } from './ViewToggle';
import { QuickReferenceCard } from './QuickReferenceCard';
import { ContentCard } from './ContentCard';
import { TableOfContents } from './TableOfContents';
import { ShareButton } from './ShareButton';
import { RandomTopicButton } from '../navigation/RandomTopicButton';
import { MarkCompleteButton } from './MarkCompleteButton';
import { calculateReadingTime } from '../../utils/reading-time';
import {
  extractQuickReferenceItems,
  filterSectionsByView,
  getTotalWordCount,
} from '../../utils/topic-helpers';
import type { ContentSection } from '../../types/content';
import type { ManifestSubtopic } from '../../types/manifest';
import type { ContentView } from '../../utils/content-views';

interface SubtopicViewProps {
  topicData: {
    title: string;
    sections: ContentSection[];
  };
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

export function SubtopicView({
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
