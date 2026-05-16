# Performance Optimization

## Quick Reference

- React.memo wraps a component to skip re-rendering when props are shallowly equal; only effective when props actually stabilize between renders
- useMemo caches expensive computed values; useCallback caches function references to prevent child re-renders via stable prop identity
- Code splitting with React.lazy and Suspense loads components on demand, reducing initial bundle size by deferring non-critical chunks
- Virtualization (react-window, TanStack Virtual) renders only visible items in large lists, keeping DOM node count constant regardless of data size
- React 18 concurrent features (useTransition, useDeferredValue) mark updates as non-urgent, allowing React to interrupt rendering for higher-priority work
- React DevTools Profiler identifies which components re-rendered, why they re-rendered, and how long each render took
- State colocation keeps state close to where it is used, preventing unnecessary re-renders of distant subtrees
- Lazy initialization in useState accepts a function that runs only on the first render, avoiding expensive computation on every re-render

## When to Use

Performance optimization in React becomes necessary when users experience perceptible lag during interactions, when the React DevTools Profiler shows components re-rendering unnecessarily or taking more than 16ms per frame, or when bundle analysis reveals the initial JavaScript payload exceeds performance budgets. Apply memoization when profiling confirms that a specific component re-renders frequently with unchanged props while its parent updates for unrelated reasons. Use code splitting when route-level or feature-level chunks can defer loading of components not needed for the initial viewport. Virtualization is essential for any list or table rendering more than a few hundred items. Concurrent features are appropriate when expensive state transitions cause input lag or visual jank that cannot be solved by reducing render cost. The key principle is to measure before optimizing: premature optimization adds complexity without measurable benefit, while targeted optimization based on profiling data produces significant user-facing improvements with minimal code changes.

## Code Examples

```typescript
// React.memo with custom comparison for complex props
import { memo, useMemo, useCallback, useState } from 'react';

interface DataRow {
  id: string;
  name: string;
  value: number;
  metadata: Record<string, string>;
}

interface TableRowProps {
  row: DataRow;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

// Custom comparison: only re-render if relevant props changed
const TableRow = memo(function TableRow({ row, isSelected, onSelect, onDelete }: TableRowProps) {
  return (
    <tr className={isSelected ? 'selected' : ''}>
      <td>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelect(row.id)}
          aria-label={`Select ${row.name}`}
        />
      </td>
      <td>{row.name}</td>
      <td>{row.value.toLocaleString()}</td>
      <td>
        <button onClick={() => onDelete(row.id)} aria-label={`Delete ${row.name}`}>
          Delete
        </button>
      </td>
    </tr>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.row.id === nextProps.row.id &&
    prevProps.row.name === nextProps.row.name &&
    prevProps.row.value === nextProps.row.value &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onSelect === nextProps.onSelect &&
    prevProps.onDelete === nextProps.onDelete
  );
});

// Parent component with stable callbacks and memoized derived data
function DataTable({ data, filter }: { data: DataRow[]; filter: string }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Memoize filtered data to avoid recalculation on unrelated state changes
  const filteredData = useMemo(() => {
    return data.filter(row =>
      row.name.toLowerCase().includes(filter.toLowerCase())
    );
  }, [data, filter]);

  // Memoize sorted data separately from filtering
  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredData]);

  // Stable callback references prevent TableRow re-renders
  const handleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDelete = useCallback((id: string) => {
    // Dispatch delete action
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  return (
    <table>
      <tbody>
        {sortedData.map(row => (
          <TableRow
            key={row.id}
            row={row}
            isSelected={selectedIds.has(row.id)}
            onSelect={handleSelect}
            onDelete={handleDelete}
          />
        ))}
      </tbody>
    </table>
  );
}
```

```typescript
// Code splitting with React.lazy and route-level Suspense boundaries
import { lazy, Suspense, useTransition, useState } from 'react';
import { Routes, Route } from 'react-router-dom';

// Route-level code splitting: each page loads its own chunk
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Settings = lazy(() => import('./pages/Settings'));

// Component-level splitting for heavy libraries
const RichTextEditor = lazy(() => import('./components/RichTextEditor'));
const ChartWidget = lazy(() => import('./components/ChartWidget'));

function LoadingFallback() {
  return (
    <div role="progressbar" aria-label="Loading content" className="loading-skeleton">
      <div className="skeleton-header" />
      <div className="skeleton-body" />
    </div>
  );
}

function App() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Suspense>
  );
}

// useTransition for non-urgent state updates
function SearchableList({ items }: { items: string[] }) {
  const [query, setQuery] = useState('');
  const [filteredItems, setFilteredItems] = useState(items);
  const [isPending, startTransition] = useTransition();

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value); // Urgent: update input immediately

    // Non-urgent: filter can be interrupted if user types again
    startTransition(() => {
      const filtered = items.filter(item =>
        item.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredItems(filtered);
    });
  };

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={handleSearch}
        placeholder="Search items..."
        aria-label="Search items"
      />
      {isPending && <span aria-live="polite">Updating results...</span>}
      <ul>
        {filteredItems.map(item => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
```

```typescript
// Virtualization with TanStack Virtual for large lists
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';

interface VirtualListProps {
  items: Array<{ id: string; title: string; description: string }>;
  estimateSize?: number;
}

function VirtualList({ items, estimateSize = 80 }: VirtualListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 5, // Render 5 extra items above/below viewport
  });

  return (
    <div
      ref={parentRef}
      style={{ height: '600px', overflow: 'auto' }}
      role="list"
      aria-label={`List of ${items.length} items`}
    >
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map(virtualRow => {
          const item = items[virtualRow.index];
          return (
            <div
              key={item.id}
              role="listitem"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

## Common Pitfalls

1. **Premature memoization without profiling**: Wrapping every component in React.memo and every value in useMemo adds overhead from the comparison logic and increases code complexity. The shallow comparison itself has a cost, and if props change on most renders anyway, memoization provides no benefit while making the code harder to read. Always profile first with React DevTools to identify actual bottlenecks before applying memoization.

2. **Unstable references defeating memoization**: Passing inline objects (`style={{ color: 'red' }}`), inline arrays (`items={[1, 2, 3]}`), or inline functions (`onClick={() => handle(id)}`) as props creates new references every render, making React.memo on child components useless. These references must be stabilized with useMemo or useCallback, or extracted as constants outside the component if they never change.

3. **Memoizing cheap computations**: Using useMemo for simple operations like string concatenation, basic arithmetic, or filtering a small array adds more overhead than it saves. useMemo is only beneficial when the computation is genuinely expensive (complex sorting of large datasets, recursive calculations, heavy transformations) or when the result is used as a dependency for other hooks or as a prop to memoized children.

4. **Incorrect dependency arrays causing stale data or infinite loops**: Omitting dependencies from useMemo or useCallback causes stale closures where the memoized value references outdated state. Including unstable references (objects created during render) causes the memo to recompute every render, defeating its purpose. Including a setState function that triggers a re-render in a useEffect dependency array can create infinite loops.

5. **Over-splitting code without measuring impact**: Creating dozens of tiny lazy-loaded chunks can actually hurt performance due to the overhead of multiple network requests, connection limits, and chunk loading waterfalls. Optimal splitting groups related functionality into meaningful chunks (route-level or feature-level) rather than splitting every component individually. Measure with Lighthouse and real user metrics.

6. **Virtualizing short lists unnecessarily**: Virtualization adds complexity (fixed heights or measurement, scroll position management, accessibility challenges) that is not justified for lists under a few hundred items. The DOM can handle hundreds of simple elements efficiently. Reserve virtualization for lists with thousands of items or complex row rendering.

## Real-World Use Cases

- **E-commerce product grids**: Large product catalogs with hundreds of items per page use virtualization to render only visible product cards while maintaining smooth scrolling. Combined with React.memo on individual cards and useCallback for add-to-cart handlers, this pattern keeps interaction latency under 100ms even with complex card layouts including images, ratings, and price calculations.

- **Real-time dashboards**: Financial trading platforms and monitoring dashboards receive data updates multiple times per second. useTransition marks chart re-renders as non-urgent so that user interactions (clicking, scrolling, typing) remain responsive. useMemo prevents recalculating derived metrics on every tick when only a subset of data changed. Selective subscriptions via Zustand or Jotai ensure only affected widgets re-render.

- **Large form applications**: Enterprise forms with hundreds of fields (insurance applications, tax forms, medical records) use state colocation to prevent the entire form from re-rendering when a single field changes. Each field section manages its own state, with form-level state aggregated only on submission. React.memo on field components with stable validation callbacks prevents cascading re-renders during rapid typing.

- **Content management systems**: CMS interfaces with drag-and-drop page builders, rich text editors, and media galleries use code splitting to load editor components only when the user enters edit mode. The initial page load shows read-only content with minimal JavaScript, and heavy editing libraries (ProseMirror, DnD Kit) load on demand when the user clicks "Edit."

- **Social media feeds**: Infinite-scroll feeds with thousands of posts use virtualization to maintain constant memory usage regardless of how far the user scrolls. Combined with intersection observers for lazy-loading images and useTransition for non-urgent feed updates (new posts arriving), the feed remains responsive even on low-end devices.

## Interview Questions

**Q: When should you use React.memo versus useMemo versus useCallback?**

A: React.memo wraps an entire component to skip re-rendering when props are shallowly equal — use it for components that receive stable props while their parent re-renders frequently. useMemo caches a computed value within a component, recomputing only when dependencies change — use it for expensive calculations whose results are used in rendering or as dependencies for other hooks. useCallback caches a function reference — use it when passing callbacks to memoized children, since a new function reference would defeat their memoization. The key distinction is scope: React.memo prevents a component from rendering, useMemo prevents a value from being recomputed during a render that happens anyway, and useCallback stabilizes a reference to prevent downstream re-renders.

**Q: Explain how React's concurrent rendering improves perceived performance.**

A: Concurrent rendering allows React to interrupt a long render to handle higher-priority updates. Without concurrency, a state update that triggers an expensive re-render blocks the main thread until complete, causing input lag and visual jank. With useTransition, you mark a state update as non-urgent; React starts rendering but can pause if the user types or clicks, handling that interaction immediately before resuming the deferred render. useDeferredValue achieves similar results by showing stale content while new content renders in the background. The user perceives the app as responsive because their direct interactions are never blocked, even though background work may take longer overall.

**Q: What is the difference between code splitting at the route level versus the component level?**

A: Route-level splitting creates separate chunks for each page, loaded when the user navigates to that route. This is the highest-impact optimization because it reduces the initial bundle to only what the landing page needs. Component-level splitting goes further by deferring heavy components within a page (chart libraries, rich text editors, modals) until they are actually needed. Route-level splitting is almost always worthwhile; component-level splitting adds complexity and should be applied selectively to components with large dependency trees that are not immediately visible or interactive on page load.

**Q: How does virtualization work and what are its trade-offs?**

A: Virtualization renders only the items currently visible in the viewport plus a small overscan buffer, recycling DOM nodes as the user scrolls. For a list of 10,000 items, only 20-30 DOM nodes exist at any time, dramatically reducing memory usage and initial render time. The trade-offs include: fixed or measured item heights are required for accurate scroll positioning, accessibility can be challenging since screen readers may not see off-screen items, browser find-in-page does not work for unrendered items, and the implementation adds complexity for features like drag-and-drop or keyboard navigation that assume all items are in the DOM.

**Q: Why is state colocation important for performance, and how does it differ from memoization?**

A: State colocation means placing state in the lowest component in the tree that needs it. When state lives too high, every update re-renders the entire subtree below it, even components that do not use that state. Colocation eliminates the problem at its source by ensuring only relevant components are in the re-render path. Memoization (React.memo) is a workaround that still triggers the parent render but skips the child — it adds comparison overhead and complexity. Colocation is architecturally cleaner: fewer components render in the first place, no comparison logic is needed, and the code is easier to understand because state lives next to the UI that displays it.

## Production Tips

- **Establish performance budgets and monitor them continuously**: Set concrete targets for initial bundle size (under 200KB gzipped for the main chunk), Time to Interactive (under 3 seconds on 4G), and interaction latency (under 100ms for user actions). Use Lighthouse CI in your deployment pipeline to catch regressions before they reach production. Track Core Web Vitals (LCP, FID, CLS) with real user monitoring to understand actual user experience across devices and network conditions.

- **Profile in production mode, not development**: React's development mode includes extra checks, warnings, and the component stack that significantly slow rendering. Always profile with a production build (`npm run build` then serve locally) to get accurate timing data. Development mode can make components appear 2-10x slower than they actually are in production, leading to unnecessary optimization work.

- **Use the React DevTools Profiler's "Why did this render?" feature**: Enable "Record why each component rendered" in Profiler settings to see whether a component re-rendered due to props changes, state changes, or parent re-renders. This immediately identifies whether memoization would help (parent re-render with unchanged props) or whether the root cause is upstream (state changing too broadly). Focus optimization efforts on components that appear frequently in the flame chart with long render times.

- **Implement progressive loading patterns for complex pages**: Rather than loading everything at once or showing a single loading spinner, use nested Suspense boundaries to progressively reveal content as it becomes available. The page shell and navigation load first, then primary content, then secondary widgets. This pattern reduces perceived load time even when total load time is unchanged, because users see meaningful content earlier.

## Related Topics

- [React Hooks](./hooks.md) — useMemo, useCallback, and useRef are the primary hooks used in performance optimization patterns
- [State Management](./state-management.md) — External state libraries like Zustand provide fine-grained subscriptions that prevent unnecessary re-renders
- [Component Patterns](./component-patterns.md) — Composition patterns like compound components and render props affect re-render boundaries
- [TypeScript](../typescript/index.md) — Generic types enable type-safe memoization utilities and performance-oriented component APIs
