import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CodeBlock } from './CodeBlock';

describe('CodeBlock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders code content in a pre/code block', () => {
    render(<CodeBlock code="const x = 1;" language="javascript" />);
    const preElement = document.querySelector('.codeblock-pre');
    const codeElement = document.querySelector('.codeblock-code');
    expect(preElement).toBeTruthy();
    expect(codeElement).toBeTruthy();
    expect(codeElement?.textContent).toContain('const');
    expect(codeElement?.textContent).toContain('x');
  });

  it('displays the language label in the header', () => {
    render(<CodeBlock code="print('hello')" language="python" />);
    const langLabel = screen.getByText('python');
    expect(langLabel).toBeTruthy();
    expect(langLabel.className).toContain('codeblock-language');
  });

  it('applies language CSS class to code element', () => {
    render(<CodeBlock code="fn main() {}" language="rust" />);
    const codeElement = document.querySelector('.codeblock-code');
    expect(codeElement?.classList.contains('language-rust')).toBe(true);
  });

  it('shows Copy button in idle state', () => {
    render(<CodeBlock code="hello" language="text" />);
    const copyBtn = screen.getByRole('button', { name: /copy code to clipboard/i });
    expect(copyBtn).toBeTruthy();
    expect(copyBtn.textContent).toBe('Copy');
  });

  it('shows "Copied ✓" after clicking copy and resets after 2 seconds', async () => {
    // Mock clipboard API
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(<CodeBlock code="const x = 42;" language="javascript" />);
    const copyBtn = screen.getByRole('button', { name: /copy code to clipboard/i });

    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeText).toHaveBeenCalledWith('const x = 42;');
    expect(copyBtn.textContent).toBe('Copied ✓');
    expect(copyBtn.className).toContain('codeblock-copy-btn--copied');

    // After 2 seconds, should reset
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(copyBtn.textContent).toBe('Copy');
    expect(copyBtn.className).not.toContain('codeblock-copy-btn--copied');
  });

  it('shows runnable badge when runnable prop is true', () => {
    render(<CodeBlock code="console.log('hi')" language="javascript" runnable />);
    expect(screen.getByText('▶ Runnable')).toBeTruthy();
  });

  it('does not show runnable badge when runnable is false', () => {
    render(<CodeBlock code="console.log('hi')" language="javascript" />);
    expect(screen.queryByText('▶ Runnable')).toBeNull();
  });

  it('applies basic keyword highlighting for JavaScript', () => {
    render(<CodeBlock code="const x = 1;" language="javascript" />);
    const codeElement = document.querySelector('.codeblock-code');
    expect(codeElement?.innerHTML).toContain('<span class="kw">const</span>');
  });

  it('applies comment highlighting', () => {
    render(<CodeBlock code="// this is a comment" language="javascript" />);
    const codeElement = document.querySelector('.codeblock-code');
    expect(codeElement?.innerHTML).toContain('<span class="comment">');
  });

  it('applies string highlighting', () => {
    render(<CodeBlock code={'const s = "hello";'} language="javascript" />);
    const codeElement = document.querySelector('.codeblock-code');
    expect(codeElement?.innerHTML).toContain('<span class="str">');
  });

  it('applies number highlighting', () => {
    render(<CodeBlock code="const n = 42;" language="javascript" />);
    const codeElement = document.querySelector('.codeblock-code');
    expect(codeElement?.innerHTML).toContain('<span class="num">42</span>');
  });

  it('escapes HTML entities in code', () => {
    render(<CodeBlock code="<div>hello</div>" language="html" />);
    const codeElement = document.querySelector('.codeblock-code');
    // innerHTML shows &lt; for escaped < characters
    expect(codeElement?.innerHTML).toContain('&lt;');
    expect(codeElement?.innerHTML).toContain('&gt;');
    // The text content should show the original characters
    expect(codeElement?.textContent).toContain('<div>');
  });
});
