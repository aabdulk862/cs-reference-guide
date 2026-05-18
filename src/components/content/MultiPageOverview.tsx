import { useMemo } from 'react';
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

interface MultiPageOverviewProps {
  topicData: {
    title: string;
    sections: ContentSection[];
  };
  subtopics: ManifestSubtopic[];
  categorySlug: string;
  topicSlug: string;
  breadcrumbDisplayNames: Record<string, string>;
  activeView: ContentView;
  onViewChange: (view: ContentView) => void;
  isCompleted: boolean;
  onToggleComplete: () => void;
}

export function MultiPageOverview({
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
  const quickRefItems = useMemo(
    () => extractQuickReferenceItems(topicData.sections),
    [topicData.sections]
  );
  const totalWordCount = useMemo(
    () => getTotalWordCount(topicData.sections),
    [topicData.sections]
  );
  const readingTime = calculateReadingTime(totalWordCount);
  const showTableOfContents = topicData.sections.length > 5;

  const filteredSections = useMemo(
    () => filterSectionsByView(topicData.sections, activeView),
    [topicData.sections, activeView]
  );

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
            {filteredSections.map((section) => (
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
