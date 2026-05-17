import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BottomNav } from './BottomNav';

function renderWithRouter(initialRoute = '/') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <BottomNav />
    </MemoryRouter>
  );
}

describe('BottomNav', () => {
  it('renders exactly 5 navigation items (4 links + 1 timer button)', () => {
    renderWithRouter();
    const nav = screen.getByRole('navigation', { name: /mobile navigation/i });
    const links = nav.querySelectorAll('a');
    const buttons = nav.querySelectorAll('button');
    expect(links.length).toBe(4);
    expect(buttons.length).toBe(1);
  });

  it('renders all expected labels', () => {
    renderWithRouter();
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Topics')).toBeTruthy();
    expect(screen.getByText('Search')).toBeTruthy();
    expect(screen.getByText('Timer')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
  });

  it('marks Home as active when on root route', () => {
    const { container } = renderWithRouter('/');
    const activeItems = container.querySelectorAll('.bottom-nav__item--active');
    expect(activeItems.length).toBe(1);
    expect(activeItems[0].getAttribute('aria-label')).toBe('Home');
  });

  it('marks Search as active when on /search route', () => {
    const { container } = renderWithRouter('/search');
    const activeItems = container.querySelectorAll('.bottom-nav__item--active');
    expect(activeItems.length).toBe(1);
    expect(activeItems[0].getAttribute('aria-label')).toBe('Search');
  });

  it('marks Settings as active when on /settings route', () => {
    const { container } = renderWithRouter('/settings');
    const activeItems = container.querySelectorAll('.bottom-nav__item--active');
    expect(activeItems.length).toBe(1);
    expect(activeItems[0].getAttribute('aria-label')).toBe('Settings');
  });

  it('has aria-label on the nav element', () => {
    renderWithRouter();
    const nav = screen.getByRole('navigation', { name: /mobile navigation/i });
    expect(nav).toBeTruthy();
  });

  it('sets aria-current="page" on the active item', () => {
    renderWithRouter('/search');
    const searchLink = screen.getByLabelText('Search');
    expect(searchLink.getAttribute('aria-current')).toBe('page');
  });

  it('does not set aria-current on inactive items', () => {
    renderWithRouter('/search');
    const homeLink = screen.getByLabelText('Home');
    expect(homeLink.getAttribute('aria-current')).toBeNull();
  });

  it('renders correct navigation paths', () => {
    renderWithRouter();
    const homeLink = screen.getByLabelText('Home');
    const searchLink = screen.getByLabelText('Search');
    const settingsLink = screen.getByLabelText('Settings');
    expect(homeLink.getAttribute('href')).toBe('/');
    expect(searchLink.getAttribute('href')).toBe('/search');
    expect(settingsLink.getAttribute('href')).toBe('/settings');
  });
});
