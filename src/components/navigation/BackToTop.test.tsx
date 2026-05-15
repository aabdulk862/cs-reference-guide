import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BackToTop } from './BackToTop';

describe('BackToTop', () => {
  let scrollYGetter: ReturnType<typeof vi.spyOn>;
  let innerHeightGetter: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    scrollYGetter = vi.spyOn(window, 'scrollY', 'get');
    innerHeightGetter = vi.spyOn(window, 'innerHeight', 'get');
    innerHeightGetter.mockReturnValue(800);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not render when scroll position is within first viewport height', () => {
    scrollYGetter.mockReturnValue(400);
    render(<BackToTop />);
    expect(screen.queryByRole('button', { name: /back to top/i })).not.toBeInTheDocument();
  });

  it('does not render when scroll position equals viewport height', () => {
    scrollYGetter.mockReturnValue(800);
    render(<BackToTop />);
    expect(screen.queryByRole('button', { name: /back to top/i })).not.toBeInTheDocument();
  });

  it('renders when user scrolls past first viewport height', () => {
    scrollYGetter.mockReturnValue(801);
    render(<BackToTop />);

    // Trigger scroll event to update state
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    expect(screen.getByRole('button', { name: /back to top/i })).toBeInTheDocument();
  });

  it('hides when user scrolls back within first viewport height', () => {
    scrollYGetter.mockReturnValue(1000);
    render(<BackToTop />);

    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    expect(screen.getByRole('button', { name: /back to top/i })).toBeInTheDocument();

    // Scroll back up
    scrollYGetter.mockReturnValue(200);
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    expect(screen.queryByRole('button', { name: /back to top/i })).not.toBeInTheDocument();
  });

  it('calls window.scrollTo with smooth behavior on click', () => {
    const scrollToMock = vi.fn();
    window.scrollTo = scrollToMock;
    scrollYGetter.mockReturnValue(1200);

    render(<BackToTop />);

    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    const button = screen.getByRole('button', { name: /back to top/i });
    fireEvent.click(button);

    expect(scrollToMock).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('has appropriate accessibility attributes', () => {
    scrollYGetter.mockReturnValue(1200);
    render(<BackToTop />);

    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    const button = screen.getByRole('button', { name: /back to top/i });
    expect(button).toHaveAttribute('aria-label', 'Back to top');
    expect(button).toHaveAttribute('title', 'Back to top');
    expect(button).toHaveAttribute('type', 'button');
  });
});
