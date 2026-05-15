import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  SkeletonBlock,
  SkeletonHeader,
  SkeletonCard,
  SkeletonSidebar,
  SkeletonPage,
} from './Skeleton';

describe('Skeleton loading states', () => {
  describe('SkeletonBlock', () => {
    it('renders a div with skeleton-block class', () => {
      const { container } = render(<SkeletonBlock />);
      const block = container.querySelector('.skeleton-block');
      expect(block).toBeInTheDocument();
      expect(block).toHaveAttribute('aria-hidden', 'true');
    });

    it('accepts a custom className', () => {
      const { container } = render(<SkeletonBlock className="custom" />);
      const block = container.querySelector('.skeleton-block.custom');
      expect(block).toBeInTheDocument();
    });
  });

  describe('SkeletonHeader', () => {
    it('renders title and subtitle placeholder shapes', () => {
      const { container } = render(<SkeletonHeader />);
      const header = container.querySelector('.skeleton-header');
      expect(header).toBeInTheDocument();
      expect(header).toHaveAttribute('aria-hidden', 'true');
      expect(container.querySelector('.skeleton-header__title')).toBeInTheDocument();
      expect(container.querySelector('.skeleton-header__subtitle')).toBeInTheDocument();
    });
  });

  describe('SkeletonCard', () => {
    it('renders heading, body lines, and code block placeholders', () => {
      const { container } = render(<SkeletonCard />);
      const card = container.querySelector('.skeleton-card');
      expect(card).toBeInTheDocument();
      expect(card).toHaveAttribute('aria-hidden', 'true');
      expect(container.querySelector('.skeleton-card__heading')).toBeInTheDocument();
      expect(container.querySelector('.skeleton-card__body')).toBeInTheDocument();
      expect(container.querySelector('.skeleton-card__code')).toBeInTheDocument();

      // Should have multiple text lines
      const lines = container.querySelectorAll('.skeleton-card__line');
      expect(lines.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('SkeletonSidebar', () => {
    it('renders category and item placeholders', () => {
      const { container } = render(<SkeletonSidebar />);
      const sidebar = container.querySelector('.skeleton-sidebar');
      expect(sidebar).toBeInTheDocument();
      expect(sidebar).toHaveAttribute('aria-hidden', 'true');

      const categories = container.querySelectorAll('.skeleton-sidebar__category');
      expect(categories.length).toBeGreaterThanOrEqual(2);

      const items = container.querySelectorAll('.skeleton-sidebar__item');
      expect(items.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('SkeletonPage', () => {
    it('renders with role="status" and accessible label', () => {
      const { container } = render(<SkeletonPage />);
      const page = container.querySelector('.skeleton-page');
      expect(page).toBeInTheDocument();
      expect(page).toHaveAttribute('role', 'status');
      expect(page).toHaveAttribute('aria-label', 'Loading content');
    });

    it('renders header and card skeletons', () => {
      const { container } = render(<SkeletonPage />);
      expect(container.querySelector('.skeleton-header')).toBeInTheDocument();
      expect(container.querySelectorAll('.skeleton-card').length).toBe(2);
    });
  });
});
