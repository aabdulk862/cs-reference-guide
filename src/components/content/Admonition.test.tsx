import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Admonition } from './Admonition';

describe('Admonition', () => {
  it('renders note type with correct icon and label', () => {
    render(<Admonition type="note" content="This is a note." />);
    expect(screen.getByText('ℹ️')).toBeTruthy();
    expect(screen.getByText('Note')).toBeTruthy();
    expect(screen.getByText('This is a note.')).toBeTruthy();
  });

  it('renders warning type with correct icon and label', () => {
    render(<Admonition type="warning" content="This is a warning." />);
    expect(screen.getByText('⚠️')).toBeTruthy();
    expect(screen.getByText('Warning')).toBeTruthy();
    expect(screen.getByText('This is a warning.')).toBeTruthy();
  });

  it('renders tip type with correct icon and label', () => {
    render(<Admonition type="tip" content="This is a tip." />);
    expect(screen.getByText('💡')).toBeTruthy();
    expect(screen.getByText('Tip')).toBeTruthy();
    expect(screen.getByText('This is a tip.')).toBeTruthy();
  });

  it('applies note-specific CSS class', () => {
    const { container } = render(<Admonition type="note" content="Note content" />);
    const aside = container.querySelector('.admonition');
    expect(aside?.classList.contains('admonition--note')).toBe(true);
  });

  it('applies warning-specific CSS class', () => {
    const { container } = render(<Admonition type="warning" content="Warning content" />);
    const aside = container.querySelector('.admonition');
    expect(aside?.classList.contains('admonition--warning')).toBe(true);
  });

  it('applies tip-specific CSS class', () => {
    const { container } = render(<Admonition type="tip" content="Tip content" />);
    const aside = container.querySelector('.admonition');
    expect(aside?.classList.contains('admonition--tip')).toBe(true);
  });

  it('has accessible role and aria-label', () => {
    render(<Admonition type="warning" content="Careful!" />);
    const aside = screen.getByRole('note');
    expect(aside).toBeTruthy();
    expect(aside.getAttribute('aria-label')).toBe('Warning admonition');
  });

  it('renders content in the admonition__content div', () => {
    const { container } = render(<Admonition type="tip" content="Use shortcuts to save time." />);
    const contentDiv = container.querySelector('.admonition__content');
    expect(contentDiv?.textContent).toBe('Use shortcuts to save time.');
  });
});
