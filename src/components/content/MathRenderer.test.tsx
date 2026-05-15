import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MathRenderer } from './MathRenderer';

describe('MathRenderer', () => {
  it('renders a valid inline expression', () => {
    const { container } = render(
      <MathRenderer expression="x^2" display="inline" />
    );
    const span = container.querySelector('.math-inline');
    expect(span).not.toBeNull();
    expect(span!.innerHTML).toContain('katex');
  });

  it('renders a valid block expression in a div', () => {
    const { container } = render(
      <MathRenderer expression="x + y = z" display="block" />
    );
    const div = container.querySelector('.math-block');
    expect(div).not.toBeNull();
    expect(div!.innerHTML).toContain('katex');
  });

  it('falls back to monospace code for invalid inline expression', () => {
    // Use an expression with mismatched braces that KaTeX cannot parse
    const invalidExpr = '\\frac{1}{';
    const { container } = render(
      <MathRenderer expression={invalidExpr} display="inline" />
    );
    const code = container.querySelector('.math-error--inline');
    expect(code).not.toBeNull();
    expect(code!.textContent).toBe(invalidExpr);
  });

  it('falls back to monospace code block for invalid block expression', () => {
    const invalidExpr = '\\begin{aligned}';
    const { container } = render(
      <MathRenderer expression={invalidExpr} display="block" />
    );
    const div = container.querySelector('.math-error--block');
    expect(div).not.toBeNull();
    const code = div!.querySelector('.math-error-expression');
    expect(code).not.toBeNull();
    expect(code!.textContent).toBe(invalidExpr);
  });

  it('renders inline expression as a span element', () => {
    const { container } = render(
      <MathRenderer expression="a + b" display="inline" />
    );
    const span = container.querySelector('span.math-inline');
    expect(span).not.toBeNull();
    // Should not render as a block div
    expect(container.querySelector('div.math-block')).toBeNull();
  });

  it('renders block expression as a div element', () => {
    const { container } = render(
      <MathRenderer expression="a + b" display="block" />
    );
    const div = container.querySelector('div.math-block');
    expect(div).not.toBeNull();
    // Should not render as an inline span
    expect(container.querySelector('span.math-inline')).toBeNull();
  });
});
