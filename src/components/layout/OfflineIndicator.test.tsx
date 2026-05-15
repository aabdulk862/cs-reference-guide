import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { OfflineIndicator } from './OfflineIndicator';

describe('OfflineIndicator', () => {
  let onlineGetter: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    onlineGetter = vi.spyOn(navigator, 'onLine', 'get');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not render when browser is online', () => {
    onlineGetter.mockReturnValue(true);
    render(<OfflineIndicator />);
    expect(screen.queryByText('Offline')).not.toBeInTheDocument();
  });

  it('renders "Offline" indicator when browser is offline', () => {
    onlineGetter.mockReturnValue(false);
    render(<OfflineIndicator />);
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('shows indicator when offline event fires', () => {
    onlineGetter.mockReturnValue(true);
    render(<OfflineIndicator />);
    expect(screen.queryByText('Offline')).not.toBeInTheDocument();

    // Simulate going offline
    act(() => {
      onlineGetter.mockReturnValue(false);
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('hides indicator when online event fires after being offline', () => {
    onlineGetter.mockReturnValue(false);
    render(<OfflineIndicator />);
    expect(screen.getByText('Offline')).toBeInTheDocument();

    // Simulate going online
    act(() => {
      onlineGetter.mockReturnValue(true);
      window.dispatchEvent(new Event('online'));
    });

    expect(screen.queryByText('Offline')).not.toBeInTheDocument();
  });

  it('has appropriate ARIA attributes for accessibility', () => {
    onlineGetter.mockReturnValue(false);
    render(<OfflineIndicator />);
    const indicator = screen.getByText('Offline');
    expect(indicator).toHaveAttribute('role', 'status');
    expect(indicator).toHaveAttribute('aria-live', 'polite');
    expect(indicator).toHaveAttribute('aria-label', 'You are offline');
  });
});
