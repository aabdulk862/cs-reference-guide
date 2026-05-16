# Testing Strategies

## Quick Reference

- React Testing Library is the standard for component testing, querying by accessible roles and labels rather than implementation details
- The testing trophy model prioritizes integration tests over unit tests for React components, testing behavior as users experience it
- renderHook from React Testing Library tests custom hooks in isolation without requiring a wrapper component
- Mock Service Worker (MSW) intercepts network requests at the service worker level, providing realistic API mocking for both tests and development
- act() wraps code that triggers state updates to ensure React processes all pending updates before assertions
- Vitest with jsdom or happy-dom provides a fast, ESM-native test runner compatible with React Testing Library
- Snapshot testing captures rendered output for regression detection but is brittle and should be used sparingly
- User event simulation via @testing-library/user-event provides realistic interaction sequences including focus, hover, and keyboard events

## When to Use

Testing strategies in React should be applied at multiple levels based on the confidence they provide relative to their maintenance cost. Write integration tests for user-facing features that exercise multiple components working together through realistic interactions. Write unit tests for complex custom hooks with branching logic, utility functions with many edge cases, and reducers with multiple action types. Use end-to-end tests sparingly for critical user journeys like authentication flows, payment processing, and data submission where the cost of a bug in production is highest. Apply snapshot testing only to stable, presentational components that rarely change and where visual regression is the primary concern. Skip testing for trivial components that simply render props without logic, and avoid testing implementation details like internal state values, effect timing, or component instance methods that couple tests to refactoring-sensitive internals.

## Code Examples

```typescript
// Integration test with React Testing Library
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { TaskBoard } from './TaskBoard';

// MSW server setup for realistic API mocking
const server = setupServer(
  http.get('/api/tasks', () => {
    return HttpResponse.json([
      { id: '1', title: 'Write tests', status: 'todo', assignee: 'Alice' },
      { id: '2', title: 'Fix bug', status: 'in-progress', assignee: 'Bob' },
      { id: '3', title: 'Deploy', status: 'done', assignee: 'Alice' },
    ]);
  }),
  http.post('/api/tasks', async ({ request }) => {
    const body = await request.json() as { title: string; assignee: string };
    return HttpResponse.json({
      id: '4',
      title: body.title,
      status: 'todo',
      assignee: body.assignee,
    }, { status: 201 });
  }),
  http.patch('/api/tasks/:id', async ({ params, request }) => {
    const body = await request.json() as { status: string };
    return HttpResponse.json({
      id: params.id,
      status: body.status,
      updatedAt: new Date().toISOString(),
    });
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      {ui}
    </MemoryRouter>
  );
}

describe('TaskBoard', () => {
  it('loads and displays tasks grouped by status', async () => {
    renderWithProviders(<TaskBoard />);

    // Verify loading state appears
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    // Wait for tasks to load
    await waitFor(() => {
      expect(screen.getByText('Write tests')).toBeInTheDocument();
    });

    // Verify grouping by status columns
    const todoColumn = screen.getByRole('region', { name: /todo/i });
    const inProgressColumn = screen.getByRole('region', { name: /in progress/i });
    const doneColumn = screen.getByRole('region', { name: /done/i });

    expect(within(todoColumn).getByText('Write tests')).toBeInTheDocument();
    expect(within(inProgressColumn).getByText('Fix bug')).toBeInTheDocument();
    expect(within(doneColumn).getByText('Deploy')).toBeInTheDocument();
  });

  it('creates a new task via the form', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TaskBoard />);

    await waitFor(() => {
      expect(screen.getByText('Write tests')).toBeInTheDocument();
    });

    // Open the create task form
    await user.click(screen.getByRole('button', { name: /add task/i }));

    // Fill in the form
    await user.type(screen.getByLabelText(/title/i), 'New feature');
    await user.selectOptions(screen.getByLabelText(/assignee/i), 'Alice');
    await user.click(screen.getByRole('button', { name: /create/i }));

    // Verify the new task appears in the todo column
    await waitFor(() => {
      expect(screen.getByText('New feature')).toBeInTheDocument();
    });
  });

  it('handles API errors gracefully', async () => {
    server.use(
      http.get('/api/tasks', () => {
        return HttpResponse.json(
          { message: 'Internal server error' },
          { status: 500 }
        );
      })
    );

    renderWithProviders(<TaskBoard />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to load tasks/i);
    });

    // Verify retry button is available
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
```

```typescript
// Testing custom hooks with renderHook
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDebounce } from './useDebounce';
import { usePagination } from './usePagination';

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 300));
    expect(result.current).toBe('hello');
  });

  it('debounces value changes by the specified delay', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'hello', delay: 300 } }
    );

    // Update the value
    rerender({ value: 'world', delay: 300 });

    // Value should not have changed yet
    expect(result.current).toBe('hello');

    // Advance time past the delay
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Now the debounced value should update
    expect(result.current).toBe('world');
  });

  it('resets the timer on rapid value changes', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'a', delay: 300 } }
    );

    rerender({ value: 'ab', delay: 300 });
    act(() => { vi.advanceTimersByTime(100); });

    rerender({ value: 'abc', delay: 300 });
    act(() => { vi.advanceTimersByTime(100); });

    rerender({ value: 'abcd', delay: 300 });
    act(() => { vi.advanceTimersByTime(299); });

    // Still showing initial value because timer keeps resetting
    expect(result.current).toBe('a');

    act(() => { vi.advanceTimersByTime(1); });

    // Now shows the final value
    expect(result.current).toBe('abcd');
  });
});

describe('usePagination', () => {
  it('calculates page boundaries correctly', () => {
    const { result } = renderHook(() =>
      usePagination({ totalItems: 95, pageSize: 10, currentPage: 1 })
    );

    expect(result.current.totalPages).toBe(10);
    expect(result.current.startIndex).toBe(0);
    expect(result.current.endIndex).toBe(9);
    expect(result.current.hasPrevious).toBe(false);
    expect(result.current.hasNext).toBe(true);
  });

  it('navigates between pages', () => {
    const { result } = renderHook(() =>
      usePagination({ totalItems: 50, pageSize: 10, currentPage: 1 })
    );

    act(() => {
      result.current.goToPage(3);
    });

    expect(result.current.currentPage).toBe(3);
    expect(result.current.startIndex).toBe(20);
    expect(result.current.endIndex).toBe(29);
    expect(result.current.hasPrevious).toBe(true);
    expect(result.current.hasNext).toBe(true);
  });

  it('clamps page number to valid range', () => {
    const { result } = renderHook(() =>
      usePagination({ totalItems: 30, pageSize: 10, currentPage: 1 })
    );

    act(() => {
      result.current.goToPage(99);
    });

    expect(result.current.currentPage).toBe(3); // Clamped to last page

    act(() => {
      result.current.goToPage(0);
    });

    expect(result.current.currentPage).toBe(1); // Clamped to first page
  });
});
```

```typescript
// Testing components with context providers and error boundaries
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '../context/ThemeContext';
import { AuthProvider } from '../context/AuthContext';
import { ThemeToggle } from './ThemeToggle';
import { ProtectedRoute } from './ProtectedRoute';

function renderWithTheme(ui: React.ReactElement, { theme = 'dark' } = {}) {
  return render(
    <ThemeProvider initialTheme={theme}>
      {ui}
    </ThemeProvider>
  );
}

describe('ThemeToggle', () => {
  it('toggles between light and dark themes', async () => {
    const user = userEvent.setup();
    renderWithTheme(<ThemeToggle />);

    const toggle = screen.getByRole('button', { name: /switch to light mode/i });
    expect(toggle).toBeInTheDocument();

    await user.click(toggle);

    expect(screen.getByRole('button', { name: /switch to dark mode/i })).toBeInTheDocument();
  });

  it('persists theme preference', async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithTheme(<ThemeToggle />);

    await user.click(screen.getByRole('button', { name: /switch to light mode/i }));
    unmount();

    // Re-render should restore persisted theme
    renderWithTheme(<ThemeToggle />, { theme: 'light' });
    expect(screen.getByRole('button', { name: /switch to dark mode/i })).toBeInTheDocument();
  });
});

describe('ProtectedRoute', () => {
  it('renders children when user is authenticated', () => {
    render(
      <AuthProvider initialUser={{ id: '1', name: 'Alice', role: 'admin' }}>
        <ProtectedRoute>
          <div>Protected content</div>
        </ProtectedRoute>
      </AuthProvider>
    );

    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });

  it('redirects to login when user is not authenticated', () => {
    render(
      <AuthProvider initialUser={null}>
        <ProtectedRoute>
          <div>Protected content</div>
        </ProtectedRoute>
      </AuthProvider>
    );

    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
    expect(screen.getByText(/redirecting to login/i)).toBeInTheDocument();
  });
});
```

## Common Pitfalls

1. **Testing implementation details instead of behavior**: Asserting on internal state values, checking how many times a function was called, or querying by component class names creates tests that break on every refactor without catching real bugs. Test what the user sees and does: rendered text, accessible elements, navigation outcomes, and visible state changes. If a test would not break when a bug is introduced that affects users, it is testing the wrong thing.

2. **Not waiting for asynchronous updates**: React state updates are asynchronous, and components that fetch data or respond to user events need time to update. Using `waitFor` or `findBy` queries ensures assertions run after React has processed all pending updates. Forgetting to await async operations leads to flaky tests that pass when the event loop happens to resolve quickly and fail under load.

3. **Over-mocking dependencies**: Mocking React components, hooks, or modules removes the integration that gives tests their value. If you mock the child component, you are not testing that the parent correctly passes props and handles callbacks. Mock at the boundary (network requests with MSW, timers with fake timers, browser APIs) and let internal component interactions exercise real code paths.

4. **Using getBy queries for elements that appear asynchronously**: `getBy` queries throw immediately if the element is not found, which fails for content that loads after an API call or state update. Use `findBy` (which retries until timeout) for elements that appear after async operations, and `queryBy` for asserting that elements are absent. Mixing these up is the most common source of test failures in async components.

5. **Not cleaning up between tests**: Shared state from previous tests (localStorage values, MSW handlers, fake timers, mounted components) can leak into subsequent tests, causing order-dependent failures. Always use `afterEach` to reset handlers (`server.resetHandlers()`), restore timers (`vi.useRealTimers()`), and clear storage. React Testing Library's `cleanup` runs automatically with most test runners but verify this in your setup.

6. **Writing tests that are too granular**: Testing every prop combination, every CSS class, and every minor UI variation creates a massive test suite that is expensive to maintain and provides diminishing returns. Focus on the critical paths: the happy path, the primary error states, and the edge cases that have caused bugs before. A few well-chosen integration tests provide more confidence than dozens of shallow unit tests.

## Real-World Use Cases

- **Design system component libraries**: Companies like Shopify (Polaris) and Atlassian (Atlassian Design System) maintain hundreds of reusable components with comprehensive test suites. Each component has accessibility tests (verifying ARIA attributes, keyboard navigation, screen reader announcements), visual regression tests (comparing rendered screenshots), and interaction tests (verifying state changes on user events). These tests run on every pull request to prevent regressions across dozens of consuming applications.

- **E-commerce checkout flows**: Payment processing requires high test confidence because bugs directly impact revenue. Integration tests simulate the complete checkout journey: adding items to cart, entering shipping information, applying discount codes, submitting payment, and handling various error states (declined cards, network timeouts, inventory conflicts). MSW mocks the payment gateway API to test all response scenarios without making real charges.

- **Form-heavy enterprise applications**: Insurance quoting platforms, loan applications, and healthcare intake forms have complex validation logic, conditional field visibility, and multi-step workflows. Tests verify that validation messages appear for invalid inputs, that conditional sections show and hide based on previous answers, that progress is preserved across steps, and that the final submission payload matches the expected schema.

- **Real-time collaborative features**: Applications like Google Docs or Figma test concurrent editing scenarios where multiple users modify the same document simultaneously. Tests simulate WebSocket messages arriving while the user is typing, verify that conflict resolution produces correct results, and ensure that cursor positions and selections remain accurate after remote changes are applied.

- **Accessibility compliance testing**: Organizations subject to WCAG requirements (government, education, healthcare) include automated accessibility checks in their test suites using tools like axe-core integrated with Testing Library. Tests verify that all interactive elements are keyboard-accessible, that color contrast meets minimum ratios, that form inputs have associated labels, and that dynamic content changes are announced to screen readers via ARIA live regions.

## Interview Questions

**Q: Why does React Testing Library recommend querying by role instead of test IDs?**

A: Querying by role tests the component the way assistive technologies and users perceive it. If a button is not queryable by its role, it likely has an accessibility problem (missing semantics, incorrect ARIA attributes). Test IDs are invisible to users and assistive technologies, so a test passing with test IDs does not guarantee the component is usable. Role-based queries simultaneously verify functionality and accessibility, catching two categories of bugs with one assertion. Test IDs should be a last resort for elements that genuinely have no accessible name or role.

**Q: How do you test a component that uses useEffect for data fetching?**

A: Render the component within a test, mock the API endpoint with MSW (not by mocking fetch directly), and use `findBy` or `waitFor` queries to assert on the loaded state. MSW intercepts at the network level, so the component's fetch logic executes exactly as it would in production. Test the loading state (verify a spinner or skeleton appears initially), the success state (verify data renders correctly), and the error state (override the MSW handler to return an error and verify the error UI appears). This approach tests the full integration between the component, its effect, and the network layer.

**Q: What is the difference between `waitFor` and `findBy` queries?**

A: `findBy` queries are convenience wrappers around `waitFor` + `getBy`. They retry the query until the element appears or the timeout expires, returning a Promise. `waitFor` is more general: it retries any assertion or callback until it passes, making it suitable for complex conditions like "wait until this element disappears" or "wait until this text changes." Use `findBy` when waiting for a single element to appear; use `waitFor` when the condition involves multiple assertions, element absence, or non-query checks like verifying a mock was called.

**Q: How do you handle testing components that depend on browser APIs like IntersectionObserver or ResizeObserver?**

A: These APIs are not available in jsdom (the default test environment). You have three options: (1) Mock the API globally in your test setup file with a minimal implementation that triggers callbacks synchronously, (2) Use a library like `jest-intersection-observer` that provides a controllable mock, or (3) Extract the observer logic into a custom hook that can be tested separately while the component test mocks the hook. Option 1 is simplest for basic cases; option 2 gives you control over when observations trigger; option 3 is best when the observer logic is complex and warrants isolated testing.

**Q: When should you use snapshot testing versus explicit assertions?**

A: Use snapshot testing for stable, presentational components where you want to detect any unintended change in the rendered output (icon libraries, static marketing pages, email templates). Use explicit assertions for everything else, especially components with dynamic behavior, conditional rendering, or user interactions. Snapshots are brittle because any change (even intentional ones like adding a class or reordering attributes) requires updating the snapshot, and large snapshots are rarely reviewed carefully during code review. Explicit assertions document the intended behavior and only fail when that specific behavior breaks.

## Production Tips

- **Integrate tests into your CI pipeline with meaningful failure reporting**: Configure your CI to run the full test suite on every pull request and block merging on failures. Use test reporters that surface the specific assertion that failed, the component under test, and a link to the relevant code. Flaky tests that pass on retry should be quarantined and fixed, not ignored, because they erode team confidence in the test suite.

- **Maintain a test coverage floor without chasing 100%**: Set a coverage threshold (70-80% line coverage is typical for React applications) that prevents coverage from decreasing but does not incentivize writing low-value tests to hit a number. Focus coverage requirements on critical paths (authentication, payment, data mutation) rather than applying them uniformly. A component that renders static text does not need the same coverage as a component that manages complex state transitions.

- **Use MSW for development in addition to testing**: Configure MSW to run in the browser during development, providing realistic API responses without a running backend. This enables frontend development to proceed independently of backend availability, makes it easy to test error states and edge cases by switching handlers, and ensures that the same mock data is used in both development and tests, reducing inconsistencies.

- **Write tests that serve as documentation**: Well-named test cases describe the component's behavior in plain language. A test file for a DatePicker might include cases like "displays the current month on initial render," "navigates to the next month when the forward arrow is clicked," and "disables dates before the minimum date." New team members can read the test file to understand the component's expected behavior without reading the implementation.

## Related Topics

- [React Hooks](./hooks.md) — Custom hooks are tested with renderHook, and understanding hook behavior is essential for writing correct component tests
- [Component Patterns](./component-patterns.md) — Compound components and render props require specific testing approaches for their composition APIs
- [Performance Optimization](./performance-optimization.md) — Performance tests verify that memoization and code splitting work correctly under realistic conditions
- [TypeScript](../typescript/index.md) — Type-safe test utilities and generic render helpers improve test maintainability
