import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResumePrompt, saveLastViewed } from './ResumePrompt';
import * as storage from '@/utils/storage';

describe('ResumePrompt', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when no last-viewed data exists', () => {
    vi.spyOn(storage, 'get').mockReturnValue(null);
    const { container } = render(<ResumePrompt />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when elapsed time is under 60 seconds', () => {
    vi.spyOn(storage, 'get').mockReturnValue({
      topicId: 'arrays',
      sectionId: 'intro',
      timestamp: Date.now() - 30_000, // 30 seconds ago
    });
    const { container } = render(<ResumePrompt />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the resume prompt when elapsed time exceeds 60 seconds', () => {
    vi.spyOn(storage, 'get').mockReturnValue({
      topicId: 'arrays',
      sectionId: 'intro',
      timestamp: Date.now() - 120_000, // 2 minutes ago
    });
    render(<ResumePrompt />);
    expect(screen.getByText('Continue where you left off')).toBeInTheDocument();
  });

  it('links to the correct topic and section', () => {
    vi.spyOn(storage, 'get').mockReturnValue({
      topicId: 'binary-trees',
      sectionId: 'traversal',
      timestamp: Date.now() - 90_000,
    });
    render(<ResumePrompt />);
    const link = screen.getByRole('link', { name: 'Continue where you left off' });
    expect(link).toHaveAttribute('href', '/topic/binary-trees#traversal');
  });

  it('dismisses the prompt when close button is clicked', () => {
    vi.spyOn(storage, 'get').mockReturnValue({
      topicId: 'arrays',
      sectionId: 'intro',
      timestamp: Date.now() - 120_000,
    });
    render(<ResumePrompt />);
    expect(screen.getByText('Continue where you left off')).toBeInTheDocument();

    const closeButton = screen.getByRole('button', { name: 'Dismiss resume prompt' });
    fireEvent.click(closeButton);

    expect(screen.queryByText('Continue where you left off')).not.toBeInTheDocument();
  });
});

describe('saveLastViewed', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('saves topicId, sectionId, and timestamp to storage', () => {
    const setSpy = vi.spyOn(storage, 'set');
    const before = Date.now();
    saveLastViewed('graphs', 'bfs');
    const after = Date.now();

    expect(setSpy).toHaveBeenCalledTimes(1);
    const [key, data] = setSpy.mock.calls[0];
    expect(key).toBe('last-viewed');
    expect(data).toMatchObject({
      topicId: 'graphs',
      sectionId: 'bfs',
    });
    expect((data as { timestamp: number }).timestamp).toBeGreaterThanOrEqual(before);
    expect((data as { timestamp: number }).timestamp).toBeLessThanOrEqual(after);
  });
});
