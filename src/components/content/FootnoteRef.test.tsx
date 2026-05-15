import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FootnoteRef } from './FootnoteRef';

describe('FootnoteRef', () => {
  it('renders a superscript link with the footnote index', () => {
    render(<FootnoteRef identifier="abc" index={1} />);

    const link = screen.getByRole('doc-noteref');
    expect(link).toBeInTheDocument();
    expect(link).toHaveTextContent('[1]');
  });

  it('links to the corresponding footnote definition', () => {
    render(<FootnoteRef identifier="myref" index={3} />);

    const link = screen.getByRole('doc-noteref');
    expect(link).toHaveAttribute('href', '#footnote-def-myref');
  });

  it('has an id for back-linking from the definition', () => {
    render(<FootnoteRef identifier="note1" index={1} />);

    const link = screen.getByRole('doc-noteref');
    expect(link).toHaveAttribute('id', 'footnote-ref-note1');
  });

  it('provides an accessible label', () => {
    render(<FootnoteRef identifier="ref" index={5} />);

    const link = screen.getByLabelText('Footnote 5');
    expect(link).toBeInTheDocument();
  });
});
