import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CategoryPage from './CategoryPage';

/** Mock manifest data */
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
          sectionCount: 5,
          wordCount: 2000,
          contentPath: '/content/backend/java.json',
        },
        {
          id: 'spring-framework',
          slug: 'backend/spring-framework',
          title: 'Spring Framework',
          source: 'parsed',
          sectionCount: 8,
          wordCount: 3000,
          contentPath: '/content/backend/spring-framework.json',
        },
      ],
    },
    {
      id: 'frontend',
      name: 'Frontend',
      topics: [
        {
          id: 'react',
          slug: 'frontend/react',
          title: 'React',
          source: 'parsed',
          sectionCount: 5,
          wordCount: 1800,
          contentPath: '/content/frontend/react.json',
        },
      ],
    },
  ],
  totalTopics: 3,
  totalSections: 18,
  buildTimestamp: '2025-01-15T10:00:00Z',
};

function renderCategoryPage(categorySlug: string) {
  return render(
    <MemoryRouter initialEntries={[`/category/${categorySlug}`]}>
      <Routes>
        <Route path="/category/:categorySlug" element={<CategoryPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('CategoryPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('renders loading state initially', () => {
    // Never resolve the fetch
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise(() => {})
    );
    renderCategoryPage('backend');
    expect(screen.getByText('Loading category…')).toBeInTheDocument();
  });

  it('renders category name and topic list for a valid category', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockManifest,
    } as Response);

    renderCategoryPage('backend');

    await waitFor(() => {
      expect(screen.getByText('Backend')).toBeInTheDocument();
    });

    expect(screen.getByText('Java')).toBeInTheDocument();
    expect(screen.getByText('Spring Framework')).toBeInTheDocument();
    expect(screen.getByText('2 topics')).toBeInTheDocument();
  });

  it('renders NotFound page for invalid categorySlug', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockManifest,
    } as Response);

    renderCategoryPage('nonexistent-category');

    await waitFor(() => {
      expect(screen.getByText('404 — Page Not Found')).toBeInTheDocument();
    });
  });

  it('renders NotFound when manifest fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    renderCategoryPage('backend');

    await waitFor(() => {
      expect(screen.getByText('404 — Page Not Found')).toBeInTheDocument();
    });
  });

  it('renders NotFound when fetch throws an error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    renderCategoryPage('backend');

    await waitFor(() => {
      expect(screen.getByText('404 — Page Not Found')).toBeInTheDocument();
    });
  });

  it('shows "Not Started" status for topics with no progress', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockManifest,
    } as Response);

    renderCategoryPage('backend');

    await waitFor(() => {
      expect(screen.getByText('Backend')).toBeInTheDocument();
    });

    const statusBadges = screen.getAllByText('Not Started');
    expect(statusBadges.length).toBe(2);
  });

  it('shows "In Progress" status for topics with partial progress', async () => {
    // Set up progress data in localStorage
    const progressData = {
      completedSections: { java: ['section-1', 'section-2'] },
      topicProgress: { java: 40 },
      overallProgress: 10,
    };
    localStorage.setItem('csguide:progress', JSON.stringify(progressData));

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockManifest,
    } as Response);

    renderCategoryPage('backend');

    await waitFor(() => {
      expect(screen.getByText('Backend')).toBeInTheDocument();
    });

    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Not Started')).toBeInTheDocument();
  });

  it('shows "Complete" status for topics with 100% progress', async () => {
    const progressData = {
      completedSections: { java: ['s1', 's2', 's3', 's4', 's5'] },
      topicProgress: { java: 100 },
      overallProgress: 33,
    };
    localStorage.setItem('csguide:progress', JSON.stringify(progressData));

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockManifest,
    } as Response);

    renderCategoryPage('backend');

    await waitFor(() => {
      expect(screen.getByText('Backend')).toBeInTheDocument();
    });

    expect(screen.getByText('Complete')).toBeInTheDocument();
  });

  it('renders topic links with correct paths', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockManifest,
    } as Response);

    renderCategoryPage('backend');

    await waitFor(() => {
      expect(screen.getByText('Java')).toBeInTheDocument();
    });

    const javaLink = screen.getByText('Java').closest('a');
    expect(javaLink).toHaveAttribute('href', '/topic/backend/java');

    const springLink = screen.getByText('Spring Framework').closest('a');
    expect(springLink).toHaveAttribute('href', '/topic/backend/spring-framework');
  });

  it('renders singular "topic" for categories with one topic', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockManifest,
    } as Response);

    renderCategoryPage('frontend');

    await waitFor(() => {
      expect(screen.getByText('Frontend')).toBeInTheDocument();
    });

    expect(screen.getByText('1 topic')).toBeInTheDocument();
  });
});
