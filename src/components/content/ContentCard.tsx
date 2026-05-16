import { useState, lazy, Suspense } from 'react';
import type { ContentSection, ContentNode } from '@/types/content';
import { shouldCollapse, getVisibleContent } from '@/utils/collapse';
import { InteractiveErrorBoundary } from '@/components/interactive/InteractiveErrorBoundary';
import { TaskList } from '@/components/content/TaskList';
import { FootnoteRef } from '@/components/content/FootnoteRef';
import { FootnoteDef } from '@/components/content/FootnoteDef';
import { Admonition } from '@/components/content/Admonition';
import { EnhancedCodeBlock } from '@/components/content/EnhancedCodeBlock';
import { MermaidRenderer } from '@/components/content/MermaidRenderer';

const BigOChart = lazy(() => import('@/components/interactive/BigOChart'));
const CodePlayground = lazy(() => import('@/components/interactive/CodePlayground'));
const DSVisualization = lazy(() => import('@/components/interactive/DSVisualization'));
const Quiz = lazy(() => import('@/components/interactive/Quiz'));
const SQLPlayground = lazy(() => import('@/components/interactive/SQLPlayground'));

const MAX_VISIBLE_WORDS = 300;

interface ContentCardProps {
  section: ContentSection;
}

/**
 * Renders a single ContentNode based on its type.
 */
function renderContentNode(node: ContentNode, index: number): React.ReactNode {
  switch (node.type) {
    case 'paragraph':
      return (
        <p key={index} className="content-card__paragraph">
          {node.text}
        </p>
      );

    case 'code':
      return (
        <EnhancedCodeBlock
          key={index}
          language={node.language || ''}
          code={node.code}
        />
      );

    case 'mermaid':
      return (
        <MermaidRenderer
          key={index}
          source={node.source}
        />
      );

    case 'image':
      return (
        <figure key={index} className="content-card__figure">
          <img
            src={node.src}
            alt={node.alt}
            className="content-card__image"
            loading="lazy"
          />
          {node.alt && (
            <figcaption className="content-card__figcaption">
              {node.alt}
            </figcaption>
          )}
        </figure>
      );

    case 'math':
      return (
        <div
          key={index}
          className={`content-card__math content-card__math--${node.display}`}
        >
          {node.expression}
        </div>
      );

    case 'list': {
      const ListTag = node.ordered ? 'ol' : 'ul';
      return (
        <ListTag key={index} className="content-card__list">
          {node.items.map((item, i) => (
            <li key={i} className="content-card__list-item">
              {item}
            </li>
          ))}
        </ListTag>
      );
    }

    case 'table':
      return (
        <div key={index} className="content-card__table-wrapper">
          <table className="content-card__table">
            <thead>
              <tr>
                {node.headers.map((header, i) => (
                  <th key={i}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {node.rows.map((row, rowIdx) => (
                <tr key={rowIdx}>
                  {row.map((cell, cellIdx) => (
                    <td key={cellIdx}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case 'blockquote':
      return (
        <blockquote key={index} className="content-card__blockquote">
          {node.text}
        </blockquote>
      );

    case 'interactive': {
      const InteractiveComponent = (() => {
        switch (node.interactiveType) {
          case 'bigo-chart':
            return BigOChart;
          case 'playground':
            return CodePlayground;
          case 'visualization':
            return DSVisualization;
          case 'quiz':
            return Quiz;
          case 'sql-playground':
            return SQLPlayground;
          default:
            return null;
        }
      })();

      if (!InteractiveComponent) {
        return null;
      }

      return (
        <div key={index} className="content-card__interactive" data-type={node.interactiveType}>
          <InteractiveErrorBoundary interactiveType={node.interactiveType}>
            <Suspense
              fallback={
                <div className="content-card__interactive-loading">
                  Loading interactive component…
                </div>
              }
            >
              <InteractiveComponent {...(node.config as Record<string, unknown> as any)} />
            </Suspense>
          </InteractiveErrorBoundary>
        </div>
      );
    }

    case 'admonition':
      return (
        <Admonition
          key={index}
          type={node.admonitionType}
          content={node.content}
        />
      );

    case 'unparseable':
      return (
        <div key={index} className="content-card__unparseable" role="alert">
          <span className="content-card__unparseable-indicator">
            ⚠ Content could not be parsed
          </span>
          <pre className="content-card__unparseable-raw">{node.raw}</pre>
        </div>
      );

    case 'task-list':
      return (
        <div key={index} className="content-card__task-list">
          <TaskList items={node.items} />
        </div>
      );

    case 'footnote-ref':
      return (
        <FootnoteRef key={index} identifier={node.identifier} index={node.index} />
      );

    case 'footnote-def':
      return (
        <div key={index} className="content-card__footnote-def">
          <FootnoteDef identifier={node.identifier} content={node.content} />
        </div>
      );
  }
}

/**
 * ContentCard renders a ContentSection as a self-contained card with
 * collapse/expand behavior for long content.
 *
 * Collapse logic:
 * - Collapses if wordCount > 300 OR paragraph count > 3
 * - Visible portion limited to 300 words maximum
 * - "Read more" / "Show less" toggle for collapsed content
 */
export function ContentCard({ section }: ContentCardProps) {
  const isCollapsible = shouldCollapse(section);
  const [isExpanded, setIsExpanded] = useState(false);

  const showFullContent = !isCollapsible || isExpanded;
  const visibleContent = showFullContent
    ? section.content
    : getVisibleContent(section.content, MAX_VISIBLE_WORDS);

  const HeadingTag = `h${section.level}` as keyof Pick<
    JSX.IntrinsicElements,
    'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  >;

  return (
    <article className="content-card" id={section.id}>
      <HeadingTag className="content-card__heading">
        {section.heading}
      </HeadingTag>

      <div className="content-card__body">
        {visibleContent.map((node, index) => renderContentNode(node, index))}
      </div>

      {/* Render subsections recursively — hidden when collapsed */}
      {showFullContent && section.subsections && section.subsections.length > 0 && (
        <div className="content-card__subsections">
          {section.subsections.map((sub) => (
            <ContentCard key={sub.id} section={sub} />
          ))}
        </div>
      )}

      {isCollapsible && (
        <button
          className="content-card__toggle"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          aria-controls={`content-${section.id}`}
        >
          {isExpanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </article>
  );
}

export default ContentCard;
