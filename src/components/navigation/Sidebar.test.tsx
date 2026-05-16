import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SidebarNavigation } from './Sidebar';
import { _resetForTesting } from '../../utils/storage';

/**
 * Test manifest with a multi-page topic (Java with subtopics) and a single-file topic.
 */
const mockManifest = {
  categories: [
    {
      id: 'backend',
      name: 'Backend',
      topics: [
        {
          id: 'java',
          slug: 'backend/java',
          title: 'Java',
          source: 'parsed',
          sectionCount: 10,
          wordCount: 5000,
          contentPath: '/content/backend/java.json',
          subtopics: [
            { id: 'java-concurrency', slug: 'concurrency', title: 'Concurrency', wordCount: 2500 },
            { id: 'java-collections', slug: 'collections', title: 'Collections', wordCount: 2000 },
          ],
        },
        {
          id: 'spring-framework',
          slug: 'backend/spring-framework',
          title: 'Spring Framework',
          source: 'parsed',
          sectionCount: 5,
          wordCount: 3000,
          contentPath: '/content/backend/spring-framework.json',
        },
      ],
    },
  ],
  totalTopics: 2,
  totalSections: 15,
  buildTimestamp: '2025-01-01T00:00:00Z',
};

function renderSidebarAtRoute(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/topic/:categorySlug/:topicSlug/:subtopicSlug" element={<SidebarNavigation />} />
        <Route path="/topic/:categorySlug/:topicSlug" element={<SidebarNavigation />} />
        <Route path="*" element={<SidebarNavigation />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Sidebar expansion state persistence', () => {
  beforeEach(() => {
    _resetForTesting();
    localStorage.clear();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockManifest,
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Auto-expand parent topic and category when subtopic route is active', () => {
    it('auto-expands parent category and topic when navigating to a subtopic URL', async () => {
      renderSidebarAtRoute('/topic/backend/java/concurrency');

      // Wait for manifest to load and sidebar to render
      await waitFor(() => {
        expect(screen.getByText('Backend')).toBeInTheDocument();
      });

      // The category should be expanded (topics visible)
      expect(screen.getByText('Java')).toBeInTheDocument();

      // The topic should be expanded (subtopics visible)
      expect(screen.getByText('Concurrency')).toBeInTheDocument();
      expect(screen.getByText('Collections')).toBeInTheDocument();
    });

    it('does not auto-expand when viewing a topic overview (no subtopicSlug)', async () => {
      renderSidebarAtRoute('/topic/backend/java');

      await waitFor(() => {
        expect(screen.getByText('Backend')).toBeInTheDocument();
      });

      // Category is not auto-expanded (no subtopic in URL)
      // The "Java" text should not be visible since the category is collapsed
      expect(screen.queryByText('Java')).not.toBeInTheDocument();
    });
  });

  describe('aria-current="page" on active subtopic link', () => {
    it('applies aria-current="page" to the active subtopic link', async () => {
      renderSidebarAtRoute('/topic/backend/java/concurrency');

      await waitFor(() => {
        expect(screen.getByText('Concurrency')).toBeInTheDocument();
      });

      const activeLink = screen.getByText('Concurrency').closest('a');
      expect(activeLink).toHaveAttribute('aria-current', 'page');
    });

    it('does not apply aria-current to non-active subtopic links', async () => {
      renderSidebarAtRoute('/topic/backend/java/concurrency');

      await waitFor(() => {
        expect(screen.getByText('Collections')).toBeInTheDocument();
      });

      const inactiveLink = screen.getByText('Collections').closest('a');
      expect(inactiveLink).not.toHaveAttribute('aria-current');
    });
  });

  describe('Persistence of expansion state in localStorage', () => {
    it('persists expanded state to localStorage when toggling a category', async () => {
      renderSidebarAtRoute('/');

      await waitFor(() => {
        expect(screen.getByText('Backend')).toBeInTheDocument();
      });

      // Click to expand the Backend category
      fireEvent.click(screen.getByText('Backend'));

      // Check localStorage was updated
      await waitFor(() => {
        const stored = JSON.parse(localStorage.getItem('csguide:nav-state') || '{}');
        expect(stored.expandedCategories).toContain('backend');
      });
    });

    it('persists expanded state to localStorage when toggling a topic', async () => {
      // Pre-set the category as expanded
      localStorage.setItem(
        'csguide:nav-state',
        JSON.stringify({ expandedCategories: ['backend'], expandedTopics: [] })
      );

      renderSidebarAtRoute('/');

      await waitFor(() => {
        expect(screen.getByText('Java')).toBeInTheDocument();
      });

      // Click to expand the Java topic
      fireEvent.click(screen.getByText('Java'));

      // Check localStorage was updated with the topic
      await waitFor(() => {
        const stored = JSON.parse(localStorage.getItem('csguide:nav-state') || '{}');
        expect(stored.expandedTopics).toContain('backend/java');
      });
    });

    it('persists auto-expanded state when navigating to a subtopic', async () => {
      renderSidebarAtRoute('/topic/backend/java/concurrency');

      await waitFor(() => {
        expect(screen.getByText('Concurrency')).toBeInTheDocument();
      });

      // Check that auto-expand was persisted
      await waitFor(() => {
        const stored = JSON.parse(localStorage.getItem('csguide:nav-state') || '{}');
        expect(stored.expandedCategories).toContain('backend');
        expect(stored.expandedTopics).toContain('backend/java');
      });
    });

    it('loads persisted expansion state from localStorage on mount', async () => {
      // Pre-set expansion state
      localStorage.setItem(
        'csguide:nav-state',
        JSON.stringify({ expandedCategories: ['backend'], expandedTopics: ['backend/java'] })
      );

      renderSidebarAtRoute('/');

      await waitFor(() => {
        // Category should be expanded
        expect(screen.getByText('Java')).toBeInTheDocument();
        // Topic should be expanded
        expect(screen.getByText('Concurrency')).toBeInTheDocument();
      });
    });
  });

  describe('localStorage unavailable fallback', () => {
    it('defaults to collapsed except active subtopic parent when localStorage throws', async () => {
      // Make localStorage throw on getItem to simulate unavailability
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('Storage disabled', 'SecurityError');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Storage disabled', 'SecurityError');
      });

      renderSidebarAtRoute('/topic/backend/java/concurrency');

      await waitFor(() => {
        expect(screen.getByText('Backend')).toBeInTheDocument();
      });

      // Despite localStorage being unavailable, the active subtopic's parent
      // should be auto-expanded
      expect(screen.getByText('Java')).toBeInTheDocument();
      expect(screen.getByText('Concurrency')).toBeInTheDocument();
    });
  });
});
