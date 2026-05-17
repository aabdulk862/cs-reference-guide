/**
 * TableOfContents — Displays a sidebar with clickable links to topic sections.
 *
 * Only rendered when a topic has more than 5 sections.
 * Each link scrolls the corresponding section into view.
 * Includes scroll-spy behavior to highlight the current section.
 *
 * Requirements: 20.6
 */

import { useEffect, useState, useRef } from 'react';
import type { ContentSection } from '../../types/content';

export interface TableOfContentsProps {
  sections: ContentSection[];
}

/**
 * Scrolls the section with the given ID into view smoothly.
 */
function scrollToSection(sectionId: string): void {
  const element = document.getElementById(sectionId);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export function TableOfContents({ sections }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>('');
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    // Clean up previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    const visibleSections = new Map<string, IntersectionObserverEntry>();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleSections.set(entry.target.id, entry);
          } else {
            visibleSections.delete(entry.target.id);
          }
        }

        // Find the topmost visible section
        if (visibleSections.size > 0) {
          let topmost: { id: string; top: number } | null = null;
          for (const [id, entry] of visibleSections) {
            const top = entry.boundingClientRect.top;
            if (!topmost || top < topmost.top) {
              topmost = { id, top };
            }
          }
          if (topmost) {
            setActiveId(topmost.id);
          }
        }
      },
      {
        rootMargin: '-10% 0px -60% 0px',
        threshold: 0,
      }
    );

    // Observe all section elements
    for (const section of sections) {
      const element = document.getElementById(section.id);
      if (element) {
        observerRef.current.observe(element);
      }
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [sections]);

  return (
    <nav className="table-of-contents" aria-label="Table of contents">
      <h3 className="table-of-contents__title">Contents</h3>
      <ul className="table-of-contents__list">
        {sections.map((section) => (
          <li key={section.id} className="table-of-contents__item">
            <a
              href={`#${section.id}`}
              className={`toc-item${activeId === section.id ? ' toc-item--active' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                scrollToSection(section.id);
              }}
            >
              {section.heading}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
