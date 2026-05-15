import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { SWNotification } from './SWNotification';
import type { SWUpdateEvent } from '@/utils/service-worker';

// Capture the callback registered via onSWUpdate
let swCallback: ((event: SWUpdateEvent) => void) | null = null;

vi.mock('@/utils/service-worker', () => ({
  onSWUpdate: vi.fn((cb: (event: SWUpdateEvent) => void) => {
    swCallback = cb;
  }),
}));

describe('SWNotification', () => {
  beforeEach(() => {
    swCallback = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when there are no notifications', () => {
    const { container } = render(<SWNotification />);
    expect(container.querySelector('.sw-notifications')).not.toBeInTheDocument();
  });

  it('displays update-available notification with refresh action', () => {
    render(<SWNotification />);

    act(() => {
      swCallback?.({
        type: 'update-available',
        message: 'New content is available. Refresh to update.',
      });
    });

    expect(screen.getByText('New content is available. Refresh to update.')).toBeInTheDocument();
    expect(screen.getByText('Refresh')).toBeInTheDocument();
  });

  it('displays cache-failed notification without action button', () => {
    render(<SWNotification />);

    act(() => {
      swCallback?.({
        type: 'cache-failed',
        message: 'Offline access is unavailable.',
      });
    });

    expect(screen.getByText('Offline access is unavailable.')).toBeInTheDocument();
    // No action button for cache-failed
    expect(screen.queryByText('Refresh')).not.toBeInTheDocument();
  });

  it('does not display notification for cache-complete event', () => {
    render(<SWNotification />);

    act(() => {
      swCallback?.({
        type: 'cache-complete',
        message: 'Content is cached for offline use.',
      });
    });

    expect(screen.queryByText('Content is cached for offline use.')).not.toBeInTheDocument();
  });

  it('dismisses notification when dismiss button is clicked', () => {
    render(<SWNotification />);

    act(() => {
      swCallback?.({
        type: 'cache-failed',
        message: 'Offline access is unavailable.',
      });
    });

    expect(screen.getByText('Offline access is unavailable.')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Dismiss notification'));

    expect(screen.queryByText('Offline access is unavailable.')).not.toBeInTheDocument();
  });

  it('calls window.location.reload when refresh action is clicked', () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
      configurable: true,
    });

    render(<SWNotification />);

    act(() => {
      swCallback?.({
        type: 'update-available',
        message: 'New content is available. Refresh to update.',
      });
    });

    fireEvent.click(screen.getByText('Refresh'));
    expect(reloadMock).toHaveBeenCalled();
  });

  it('can display multiple notifications simultaneously', () => {
    render(<SWNotification />);

    act(() => {
      swCallback?.({
        type: 'update-available',
        message: 'New content is available. Refresh to update.',
      });
    });

    act(() => {
      swCallback?.({
        type: 'cache-failed',
        message: 'Offline access is unavailable.',
      });
    });

    expect(screen.getByText('New content is available. Refresh to update.')).toBeInTheDocument();
    expect(screen.getByText('Offline access is unavailable.')).toBeInTheDocument();
  });
});
