import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContentCard } from './ContentCard';
import type { ContentSection } from '@/types/content';

describe('ContentCard', () => {
  const shortSection: ContentSection = {
    id: 'test-section',
    heading: 'Test Section',
    level: 2,
    wordCount: 20,
    content: [
      { type: 'paragraph', text: 'This is a short paragraph.' },
      { type: 'paragraph', text: 'Another short paragraph.' },
    ],
    subsections: [],
  };

  const longSection: ContentSection = {
    id: 'long-section',
    heading: 'Long Section',
    level: 2,
    wordCount: 350,
    content: [
      { type: 'paragraph', text: Array(200).fill('word').join(' ') },
      { type: 'paragraph', text: Array(150).fill('more').join(' ') },
    ],
    subsections: [],
  };

  const manyParagraphsSection: ContentSection = {
    id: 'many-paragraphs',
    heading: 'Many Paragraphs',
    level: 3,
    wordCount: 40,
    content: [
      { type: 'paragraph', text: 'First paragraph.' },
      { type: 'paragraph', text: 'Second paragraph.' },
      { type: 'paragraph', text: 'Third paragraph.' },
      { type: 'paragraph', text: 'Fourth paragraph.' },
    ],
    subsections: [],
  };

  it('renders the section heading', () => {
    render(<ContentCard section={shortSection} />);
    expect(screen.getByText('Test Section')).toBeInTheDocument();
  });

  it('renders all content when section is short', () => {
    render(<ContentCard section={shortSection} />);
    expect(screen.getByText('This is a short paragraph.')).toBeInTheDocument();
    expect(screen.getByText('Another short paragraph.')).toBeInTheDocument();
    expect(screen.queryByText('Read more')).not.toBeInTheDocument();
  });

  it('shows "Read more" button when content exceeds 300 words', () => {
    render(<ContentCard section={longSection} />);
    expect(screen.getByText('Read more')).toBeInTheDocument();
  });

  it('shows "Read more" button when paragraph count exceeds 3', () => {
    render(<ContentCard section={manyParagraphsSection} />);
    expect(screen.getByText('Read more')).toBeInTheDocument();
  });

  it('expands content on "Read more" click and shows "Show less"', () => {
    render(<ContentCard section={longSection} />);
    const button = screen.getByText('Read more');
    fireEvent.click(button);
    expect(screen.getByText('Show less')).toBeInTheDocument();
    expect(screen.queryByText('Read more')).not.toBeInTheDocument();
  });

  it('collapses content on "Show less" click', () => {
    render(<ContentCard section={longSection} />);
    fireEvent.click(screen.getByText('Read more'));
    fireEvent.click(screen.getByText('Show less'));
    expect(screen.getByText('Read more')).toBeInTheDocument();
  });

  it('renders the card as an article element', () => {
    const { container } = render(<ContentCard section={shortSection} />);
    const article = container.querySelector('article.content-card');
    expect(article).toBeInTheDocument();
  });

  it('renders with the correct heading level', () => {
    const { container } = render(<ContentCard section={shortSection} />);
    const h2 = container.querySelector('h2.content-card__heading');
    expect(h2).toBeInTheDocument();
    expect(h2?.textContent).toBe('Test Section');
  });

  it('renders code blocks', () => {
    const section: ContentSection = {
      id: 'code-section',
      heading: 'Code Example',
      level: 2,
      wordCount: 10,
      content: [
        { type: 'code', language: 'javascript', code: 'const x = 1;', runnable: false },
      ],
      subsections: [],
    };
    const { container } = render(<ContentCard section={section} />);
    // EnhancedCodeBlock renders with syntax highlighting spans, so check the container
    const codeBlock = container.querySelector('.codeblock-container');
    expect(codeBlock).toBeInTheDocument();
    expect(codeBlock?.getAttribute('data-language')).toBe('javascript');
    // The code content should be present (possibly split across spans)
    const codeEl = container.querySelector('.codeblock-code');
    expect(codeEl?.textContent).toContain('const x = 1;');
  });

  it('renders lists', () => {
    const section: ContentSection = {
      id: 'list-section',
      heading: 'List Example',
      level: 2,
      wordCount: 10,
      content: [
        { type: 'list', ordered: true, items: ['First item', 'Second item'] },
      ],
      subsections: [],
    };
    render(<ContentCard section={section} />);
    expect(screen.getByText('First item')).toBeInTheDocument();
    expect(screen.getByText('Second item')).toBeInTheDocument();
  });

  it('renders tables', () => {
    const section: ContentSection = {
      id: 'table-section',
      heading: 'Table Example',
      level: 2,
      wordCount: 10,
      content: [
        { type: 'table', headers: ['Name', 'Value'], rows: [['foo', 'bar']] },
      ],
      subsections: [],
    };
    render(<ContentCard section={section} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('foo')).toBeInTheDocument();
  });

  it('renders blockquotes', () => {
    const section: ContentSection = {
      id: 'quote-section',
      heading: 'Quote Example',
      level: 2,
      wordCount: 5,
      content: [
        { type: 'blockquote', text: 'A wise quote' },
      ],
      subsections: [],
    };
    render(<ContentCard section={section} />);
    expect(screen.getByText('A wise quote')).toBeInTheDocument();
  });

  it('sets aria-expanded attribute on toggle button', () => {
    render(<ContentCard section={longSection} />);
    const button = screen.getByText('Read more');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(screen.getByText('Show less')).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('ContentCard - Interactive Components', () => {
  it('renders Suspense loading fallback for interactive bigo-chart node', () => {
    const section: ContentSection = {
      id: 'interactive-bigo',
      heading: 'Big O',
      level: 2,
      wordCount: 0,
      content: [
        { type: 'interactive', interactiveType: 'bigo-chart', config: {} },
      ],
      subsections: [],
    };
    const { container } = render(<ContentCard section={section} />);
    // The interactive wrapper should be rendered with the correct data-type
    const wrapper = container.querySelector('.content-card__interactive[data-type="bigo-chart"]');
    expect(wrapper).toBeInTheDocument();
    // Suspense fallback should show while lazy component loads
    expect(screen.getByText('Loading interactive component…')).toBeInTheDocument();
  });

  it('renders Suspense loading fallback for interactive playground node', () => {
    const section: ContentSection = {
      id: 'interactive-playground',
      heading: 'Playground',
      level: 2,
      wordCount: 0,
      content: [
        {
          type: 'interactive',
          interactiveType: 'playground',
          config: { initialCode: 'console.log("hi")', language: 'javascript', timeoutMs: 5000 },
        },
      ],
      subsections: [],
    };
    const { container } = render(<ContentCard section={section} />);
    const wrapper = container.querySelector('.content-card__interactive[data-type="playground"]');
    expect(wrapper).toBeInTheDocument();
    expect(screen.getByText('Loading interactive component…')).toBeInTheDocument();
  });

  it('renders Suspense loading fallback for interactive visualization node', () => {
    const section: ContentSection = {
      id: 'interactive-vis',
      heading: 'Visualization',
      level: 2,
      wordCount: 0,
      content: [
        {
          type: 'interactive',
          interactiveType: 'visualization',
          config: { type: 'bst', initialData: [5, 3, 7], stepDurationMs: 1000 },
        },
      ],
      subsections: [],
    };
    const { container } = render(<ContentCard section={section} />);
    const wrapper = container.querySelector('.content-card__interactive[data-type="visualization"]');
    expect(wrapper).toBeInTheDocument();
    expect(screen.getByText('Loading interactive component…')).toBeInTheDocument();
  });

  it('renders Suspense loading fallback for interactive quiz node', () => {
    const section: ContentSection = {
      id: 'interactive-quiz',
      heading: 'Quiz',
      level: 2,
      wordCount: 0,
      content: [
        {
          type: 'interactive',
          interactiveType: 'quiz',
          config: {
            quiz: {
              id: 'q1',
              topicId: 't1',
              sectionId: 's1',
              questions: [{ id: 'q1', type: 'multiple-choice', prompt: 'What?', options: ['A', 'B'], correctAnswer: 'A', explanation: 'Because.' }],
            },
          },
        },
      ],
      subsections: [],
    };
    const { container } = render(<ContentCard section={section} />);
    const wrapper = container.querySelector('.content-card__interactive[data-type="quiz"]');
    expect(wrapper).toBeInTheDocument();
    expect(screen.getByText('Loading interactive component…')).toBeInTheDocument();
  });

  it('renders Suspense loading fallback for interactive sql-playground node', () => {
    const section: ContentSection = {
      id: 'interactive-sql',
      heading: 'SQL',
      level: 2,
      wordCount: 0,
      content: [
        { type: 'interactive', interactiveType: 'sql-playground', config: {} },
      ],
      subsections: [],
    };
    const { container } = render(<ContentCard section={section} />);
    const wrapper = container.querySelector('.content-card__interactive[data-type="sql-playground"]');
    expect(wrapper).toBeInTheDocument();
    expect(screen.getByText('Loading interactive component…')).toBeInTheDocument();
  });

  it('renders nothing for unrecognized interactiveType values', () => {
    const section: ContentSection = {
      id: 'interactive-unknown',
      heading: 'Unknown',
      level: 2,
      wordCount: 0,
      content: [
        { type: 'interactive', interactiveType: 'unknown-type' as any, config: {} },
      ],
      subsections: [],
    };
    const { container } = render(<ContentCard section={section} />);
    // Should not render any interactive wrapper
    const wrapper = container.querySelector('.content-card__interactive');
    expect(wrapper).not.toBeInTheDocument();
    // Should not render any placeholder or error text
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });

  it('wraps interactive components with error boundary', () => {
    const section: ContentSection = {
      id: 'interactive-error-boundary',
      heading: 'Error Boundary Test',
      level: 2,
      wordCount: 0,
      content: [
        { type: 'interactive', interactiveType: 'bigo-chart', config: {} },
      ],
      subsections: [],
    };
    const { container } = render(<ContentCard section={section} />);
    // The interactive wrapper should exist (error boundary is inside it)
    const wrapper = container.querySelector('.content-card__interactive');
    expect(wrapper).toBeInTheDocument();
  });
});