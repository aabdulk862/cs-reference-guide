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
import type { ContentView } from '../../utils/content-views';

interface SingleFileViewProps {
  topicData: {
    title: string;
    sections: ContentSection[];
  };
  categorySlug: string;
  breadcrumbDisplayNames: Record<string, string>;
  activeView: ContentView;
  onViewChange: (view: ContentView) => void;
  isCompleted: boolean;
  onToggleComplete: () => void;
}

export function SingleFileView({
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
