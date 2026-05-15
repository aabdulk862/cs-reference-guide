import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RouteErrorBoundary } from './RouteErrorBoundary';

/** A component that throws on render to test the error boundary */
function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test render error');
  }
  return <div>Rendered successfully</div>;
}

describe('RouteErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <RouteErrorBoundary>
        <ThrowingComponent shouldThrow={false} />
      </RouteErrorBoundary>
    );
    expect(screen.getByText('Rendered successfully')).toBeInTheDocument();
  });

  it('displays error message when child component throws', () => {
    // Suppress React error boundary console.error noise
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <RouteErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </RouteErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(
      screen.getByText('An error occurred while rendering this page. Please try reloading.')
    ).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('displays a reload button when an error occurs', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <RouteErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </RouteErrorBoundary>
    );

    const reloadButton = screen.getByRole('button', { name: /reload page/i });
    expect(reloadButton).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('calls window.location.reload when reload button is clicked', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    });

    render(
      <RouteErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </RouteErrorBoundary>
    );

    const reloadButton = screen.getByRole('button', { name: /reload page/i });
    fireEvent.click(reloadButton);

    expect(reloadMock).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });

  it('has role="alert" for accessibility', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <RouteErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </RouteErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('does not render a blank screen on error', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = render(
      <RouteErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </RouteErrorBoundary>
    );

    // The container should have visible content, not be empty
    expect(container.textContent).not.toBe('');
    expect(container.querySelector('.route-error-boundary')).toBeInTheDocument();

    consoleSpy.mockRestore();
  });
});
