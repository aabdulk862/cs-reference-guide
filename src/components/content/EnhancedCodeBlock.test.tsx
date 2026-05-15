import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { EnhancedCodeBlock } from './EnhancedCodeBlock';

describe('EnhancedCodeBlock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders code content in a pre/code block', () => {
    render(<EnhancedCodeBlock code="const x = 1;" language="javascript" />);
    const preElement = document.querySelector('.codeblock-pre');
    const codeElement = document.querySelector('.codeblock-code');
    expect(preElement).toBeTruthy();
    expect(codeElement).toBeTruthy();
    expect(codeElement?.textContent).toContain('const');
  });

  it('displays the language label when language is provided', () => {
    render(<EnhancedCodeBlock code="print('hello')" language="python" />);
    const langLabel = screen.getByText('python');
    expect(langLabel).toBeTruthy();
    expect(langLabel.className).toContain('codeblock-language');
  });

  it('hides the language label when language is empty', () => {
    render(<EnhancedCodeBlock code="some code" language="" />);
    const langLabel = document.querySelector('.codeblock-language');
    expect(langLabel).toBeNull();
  });

  it('shows Copy button in idle state', () => {
    render(<EnhancedCodeBlock code="hello" language="text" />);
    const copyBtn = screen.getByRole('button', { name: /copy code to clipboard/i });
    expect(copyBtn).toBeTruthy();
    expect(copyBtn.textContent).toBe('Copy');
  });

  it('shows "Copied ✓" after successful copy and resets after 2 seconds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(<EnhancedCodeBlock code="const x = 42;" language="javascript" />);
    const copyBtn = screen.getByRole('button', { name: /copy code to clipboard/i });

    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeText).toHaveBeenCalledWith('const x = 42;');
    expect(copyBtn.textContent).toBe('Copied ✓');
    expect(copyBtn.className).toContain('codeblock-copy-btn--copied');
    expect(copyBtn).toHaveAttribute('aria-label', 'Copied to clipboard');

    // After 2 seconds, should reset to idle
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(copyBtn.textContent).toBe('Copy');
    expect(copyBtn.className).not.toContain('codeblock-copy-btn--copied');
  });

  it('shows error state for 1 second when clipboard write fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Clipboard denied'));
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(<EnhancedCodeBlock code="some code" language="javascript" />);
    const copyBtn = screen.getByRole('button', { name: /copy code to clipboard/i });

    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(copyBtn.textContent).toBe('Error');
    expect(copyBtn.className).toContain('codeblock-copy-btn--error');
    expect(copyBtn).toHaveAttribute('aria-label', 'Failed to copy');

    // After 1 second, should reset to idle
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(copyBtn.textContent).toBe('Copy');
    expect(copyBtn.className).not.toContain('codeblock-copy-btn--error');
  });

  it('shows runnable badge when runnable prop is true', () => {
    render(<EnhancedCodeBlock code="console.log('hi')" language="javascript" runnable />);
    expect(screen.getByText('▶ Runnable')).toBeTruthy();
  });

  it('does not show runnable badge when runnable is false', () => {
    render(<EnhancedCodeBlock code="console.log('hi')" language="javascript" />);
    expect(screen.queryByText('▶ Runnable')).toBeNull();
  });

  it('applies basic keyword highlighting for JavaScript', () => {
    render(<EnhancedCodeBlock code="const x = 1;" language="javascript" />);
    const codeElement = document.querySelector('.codeblock-code');
    expect(codeElement?.innerHTML).toContain('<span class="kw">const</span>');
  });

  it('does not apply language- class when language is empty', () => {
    render(<EnhancedCodeBlock code="plain text" language="" />);
    const codeElement = document.querySelector('.codeblock-code');
    expect(codeElement?.className).toBe('codeblock-code');
    expect(codeElement?.className).not.toContain('language-');
  });
});
