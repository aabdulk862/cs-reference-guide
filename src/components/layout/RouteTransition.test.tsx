import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Outlet, useNavigate } from 'react-router-dom';
import { RouteTransition } from './RouteTransition';

function PageA() {
  return <div data-testid="page-a">Page A</div>;
}

function PageB() {
  return <div data-testid="page-b">Page B</div>;
}

function NavButton({ to }: { to: string }) {
  const navigate = useNavigate();
  return <button onClick={() => navigate(to)}>Navigate</button>;
}

/**
 * Layout component that mirrors AppShell's usage:
 * RouteTransition wraps the Outlet at the layout level.
 */
function Layout({ duration }: { duration?: number }) {
  return (
    <div>
      <NavButton to="/b" />
      <RouteTransition duration={duration}>
        <Outlet />
      </RouteTransition>
    </div>
  );
}

function renderWithRoutes(initialRoute = '/a', duration = 200) {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route element={<Layout duration={duration} />}>
          <Route path="/a" element={<PageA />} />
          <Route path="/b" element={<PageB />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('RouteTransition', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders children immediately on initial mount', () => {
    renderWithRoutes('/a');
    expect(screen.getByTestId('page-a')).toBeTruthy();
  });

  it('applies opacity 1 on initial render (visible state)', () => {
    const { container } = renderWithRoutes('/a');
    const transitionDiv = container.querySelector('.route-transition');
    expect(transitionDiv).toBeTruthy();
    expect(transitionDiv!.getAttribute('style')).toContain('opacity: 1');
  });

  it('applies a CSS transition property with duration in the 150-300ms range', () => {
    const { container } = renderWithRoutes('/a', 250);
    const transitionDiv = container.querySelector('.route-transition');
    expect(transitionDiv!.getAttribute('style')).toContain('transition: opacity 250ms ease-in-out');
  });

  it('sets opacity to 0 when route changes (fade-out)', () => {
    const { container } = renderWithRoutes('/a', 200);

    act(() => {
      screen.getByText('Navigate').click();
    });

    const transitionDiv = container.querySelector('.route-transition');
    expect(transitionDiv!.getAttribute('style')).toContain('opacity: 0');
  });

  it('restores opacity to 1 after the fade duration completes (fade-in)', () => {
    const { container } = renderWithRoutes('/a', 200);

    act(() => {
      screen.getByText('Navigate').click();
    });

    // Advance past the fade duration
    act(() => {
      vi.advanceTimersByTime(200);
    });

    const transitionDiv = container.querySelector('.route-transition');
    expect(transitionDiv!.getAttribute('style')).toContain('opacity: 1');
  });

  it('renders new route content after navigation', () => {
    renderWithRoutes('/a', 200);

    act(() => {
      screen.getByText('Navigate').click();
    });

    // New content is rendered (React Router swaps immediately)
    expect(screen.queryByTestId('page-b')).toBeTruthy();
  });

  it('uses a default duration of 200ms (within 150-300ms range)', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/a']}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/a" element={<PageA />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    const transitionDiv = container.querySelector('.route-transition');
    const style = transitionDiv!.getAttribute('style') || '';
    expect(style).toContain('opacity 200ms');
  });
});
