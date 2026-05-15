import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InteractiveErrorBoundary } from './InteractiveErrorBoundary';

/** A component that throws on render to test the error boundary */
function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Component render failed');
  }
  return <div>Rendered successfully</div>;
}

describe('InteractiveErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <InteractiveErrorBoundary interactiveType="bigo-chart">
        <ThrowingComponent shouldThrow={false} />
      </InteractiveErrorBoundary>
    );
    expect(screen.getByText('Rendered successfully')).toBeInTheDocument();
  });

  it('displays inline error message when child component throws', () => {
    // Suppress React error boundary console.error noise
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <InteractiveErrorBoundary interactiveType="bigo-chart">
        <ThrowingComponent shouldThrow={true} />
      </InteractiveErrorBoundary>
    );

    // Should display the error message
    expect(
      screen.getByText('Interactive component could not be loaded.')
    ).toBeInTheDocument();

    // Should have role="alert" for accessibility
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Should NOT crash the surrounding page (no uncaught error)
    consoleSpy.mockRestore();
  });

  it('does not render children after catching an error', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <InteractiveErrorBoundary interactiveType="visualization">
        <ThrowingComponent shouldThrow={true} />
      </InteractiveErrorBoundary>
    );

    expect(screen.queryByText('Rendered successfully')).not.toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it('displays warning icon in error state', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = render(
      <InteractiveErrorBoundary interactiveType="quiz">
        <ThrowingComponent shouldThrow={true} />
      </InteractiveErrorBoundary>
    );

    const icon = container.querySelector('.content-card__interactive-error-icon');
    expect(icon).toBeInTheDocument();
    expect(icon?.textContent).toBe('⚠');
    consoleSpy.mockRestore();
  });
});
