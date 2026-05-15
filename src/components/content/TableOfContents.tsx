/**
 * TableOfContents — Displays a sidebar with clickable links to topic sections.
 *
 * Only rendered when a topic has more than 5 sections.
 * Each link scrolls the corresponding section into view.
 *
 * Requirements: 20.6
 */

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
  return (
    <nav className="table-of-contents" aria-label="Table of contents">
      <h3 className="table-of-contents__title">Contents</h3>
      <ul className="table-of-contents__list">
        {sections.map((section) => (
          <li key={section.id} className="table-of-contents__item">
            <a
              href={`#${section.id}`}
              className="table-of-contents__link"
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
