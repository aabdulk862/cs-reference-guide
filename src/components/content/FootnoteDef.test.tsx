import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FootnoteDef } from './FootnoteDef';

describe('FootnoteDef', () => {
  it('renders the footnote content', () => {
    render(<FootnoteDef identifier="note1" content="This is a footnote." />);

    expect(screen.getByText('This is a footnote.')).toBeInTheDocument();
  });

  it('renders the identifier label', () => {
    render(<FootnoteDef identifier="abc" content="Some content" />);

    expect(screen.getByText('[abc]')).toBeInTheDocument();
  });

  it('has an id for linking from the reference', () => {
    render(<FootnoteDef identifier="ref2" content="Content" />);

    const container = screen.getByRole('doc-footnote');
    expect(container).toHaveAttribute('id', 'footnote-def-ref2');
  });

  it('provides a back-link to the reference', () => {
    render(<FootnoteDef identifier="myid" content="Footnote text" />);

    const backLink = screen.getByLabelText('Back to reference myid');
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute('href', '#footnote-ref-myid');
    expect(backLink).toHaveTextContent('↩');
  });

  it('renders with doc-footnote role for accessibility', () => {
    render(<FootnoteDef identifier="x" content="Test" />);

    expect(screen.getByRole('doc-footnote')).toBeInTheDocument();
  });
});
