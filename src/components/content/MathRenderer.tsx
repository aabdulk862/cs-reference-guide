import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export interface MathRendererProps {
  expression: string;
  display: 'inline' | 'block';
}

/**
 * Renders LaTeX math expressions using KaTeX.
 * Falls back to raw monospace display for invalid expressions.
 *
 * Validates: Requirements 7.4
 */
export function MathRenderer({ expression, display }: MathRendererProps) {
  const rendered = useMemo(() => {
    try {
      const html = katex.renderToString(expression, {
        displayMode: display === 'block',
        throwOnError: true,
        output: 'html',
      });
      return { html, error: false };
    } catch {
      return { html: '', error: true };
    }
  }, [expression, display]);

  if (rendered.error) {
    if (display === 'block') {
      return (
        <div className="math-error math-error--block">
          <code className="math-error-expression">{expression}</code>
        </div>
      );
    }
    return (
      <code className="math-error math-error--inline">{expression}</code>
    );
  }

  if (display === 'block') {
    return (
      <div
        className="math-block"
        dangerouslySetInnerHTML={{ __html: rendered.html }}
      />
    );
  }

  return (
    <span
      className="math-inline"
      dangerouslySetInnerHTML={{ __html: rendered.html }}
    />
  );
}
