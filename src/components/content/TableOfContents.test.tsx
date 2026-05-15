import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TableOfContents } from './TableOfContents';
import type { ContentSection } from '../../types/content';

function makeSection(id: string, heading: string): ContentSection {
  return {
    id,
    heading,
    level: 2,
    content: [],
    wordCount: 100,
    subsections: [],
  };
}

describe('TableOfContents', () => {
  it('renders a nav element with table of contents label', () => {
    const sections = [makeSection('s1', 'Introduction')];
    render(<TableOfContents sections={sections} />);
    expect(screen.getByRole('navigation', { name: /table of contents/i })).toBeInTheDocument();
  });

  it('renders a link for each section', () => {
    const sections = [
      makeSection('s1', 'Introduction'),
      makeSection('s2', 'Getting Started'),
      makeSection('s3', 'Advanced Topics'),
    ];
    render(<TableOfContents sections={sections} />);

    expect(screen.getByText('Introduction')).toBeInTheDocument();
    expect(screen.getByText('Getting Started')).toBeInTheDocument();
    expect(screen.getByText('Advanced Topics')).toBeInTheDocument();
  });

  it('links have correct href attributes', () => {
    const sections = [makeSection('my-section', 'My Section')];
    render(<TableOfContents sections={sections} />);

    const link = screen.getByText('My Section');
    expect(link).toHaveAttribute('href', '#my-section');
  });

  it('scrolls to section on click', () => {
    const sections = [makeSection('target-section', 'Target')];
    const mockElement = { scrollIntoView: vi.fn() };
    vi.spyOn(document, 'getElementById').mockReturnValue(mockElement as unknown as HTMLElement);

    render(<TableOfContents sections={sections} />);
    fireEvent.click(screen.getByText('Target'));

    expect(document.getElementById).toHaveBeenCalledWith('target-section');
    expect(mockElement.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });

    vi.restoreAllMocks();
  });

  it('renders the Contents title', () => {
    const sections = [makeSection('s1', 'Intro')];
    render(<TableOfContents sections={sections} />);
    expect(screen.getByText('Contents')).toBeInTheDocument();
  });
});
