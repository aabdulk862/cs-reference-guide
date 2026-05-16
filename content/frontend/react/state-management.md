# State Management

## Quick Reference

- Local state (useState/useReducer) is sufficient for component-level concerns: form inputs, toggles, and component-specific data
- Lifting state up to the nearest common ancestor handles sibling components that need shared state
- Context API with useReducer provides built-in global state for infrequently-changing values like theme, auth, and locale
- External libraries (Redux Toolkit, Zustand, Jotai) solve Context performance limitations with fine-grained subscriptions
- Server state libraries (TanStack Query, SWR) treat remote data as a separate concern with caching and background refetching
- URL state via React Router stores navigation-relevant state that should be shareable and bookmarkable
- The right state management choice depends on update frequency, consumer count, and persistence requirements
- Zustand provides minimal API with selector-based subscriptions; Redux Toolkit provides opinionated structure with DevTools

## When to Use

Choose local state for UI concerns that do not need to be shared: modal visibility, form field values, animation states, and component-specific loading indicators. Lift state up when two sibling components need the same data and updates should be synchronized between them. Use Context API for truly global values that change infrequently (theme, authenticated user, feature flags) where the re-render cost of context updates is acceptable because consumers are few or the value rarely changes. Reach for external state libraries when you have frequently-updating global state consumed by many components at different tree depths, when you need middleware (logging, persistence, async handling), or when DevTools integration is important for debugging complex state flows. Use server state libraries whenever your components display data fetched from APIs, because they handle caching, deduplication, background refetching, optimistic updates, and pagination automatically. Store state in the URL when it represents navigation context that users should be able to bookmark or share: active tab, search query, filter selections, and pagination page number.

## Code Examples

```typescript
// Context API with useReducer for authentication state
import { createContext, useContext, useReducer, ReactNode } from 'react';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'moderator';
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

type AuthAction =
  | { type: 'LOGIN_START' }
  | { type: 'LOGIN_SUCCESS'; user: User; token: string }
  | { type: 'LOGIN_FAILURE' }
  | { type: 'LOGOUT' }
  | { type: 'TOKEN_REFRESH'; token: string };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN_START':
      return { ...state, isLoading: true };
    case 'LOGIN_SUCCESS':
      return {
        user: action.user,
        token: action.token,
        isAuthenticated: true,
        isLoading: false,
      };
    case 'LOGIN_FAILURE':
      return { user: null, token: null, isAuthenticated: false, isLoading: false };
    case 'LOGOUT':
      return { user: null, token: null, isAuthenticated: false, isLoading: false };
    case 'TOKEN_REFRESH':
      return { ...state, token: action.token };
    default:
      return state;
  }
}

const AuthContext = createContext<{
  state: AuthState;
  dispatch: React.Dispatch<AuthAction>;
} | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, {
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: false,
  });

  return (
    <AuthContext.Provider value={{ state, dispatch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
```

```typescript
// Zustand store with slices pattern for scalable state management
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

interface CartSlice {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'quantity'>) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  totalPrice: () => number;
  totalItems: () => number;
}

interface UISlice {
  sidebarOpen: boolean;
  theme: 'light' | 'dark';
  notifications: string[];
  toggleSidebar: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  addNotification: (message: string) => void;
  dismissNotification: (index: number) => void;
}

type AppStore = CartSlice & UISlice;

const useAppStore = create<AppStore>()(
  devtools(
    persist(
      immer((set, get) => ({
        // Cart slice
        items: [],
        addItem: (item) => set((state) => {
          const existing = state.items.find(i => i.productId === item.productId);
          if (existing) {
            existing.quantity += 1;
          } else {
            state.items.push({ ...item, quantity: 1 });
          }
        }),
        removeItem: (productId) => set((state) => {
          state.items = state.items.filter(i => i.productId !== productId);
        }),
        updateQuantity: (productId, quantity) => set((state) => {
          const item = state.items.find(i => i.productId === productId);
          if (item) item.quantity = Math.max(0, quantity);
        }),
        clearCart: () => set((state) => { state.items = []; }),
        totalPrice: () => get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),
        totalItems: () => get().items.reduce((sum, i) => sum + i.quantity, 0),

        // UI slice
        sidebarOpen: true,
        theme: 'dark',
        notifications: [],
        toggleSidebar: () => set((state) => { state.sidebarOpen = !state.sidebarOpen; }),
        setTheme: (theme) => set((state) => { state.theme = theme; }),
        addNotification: (message) => set((state) => { state.notifications.push(message); }),
        dismissNotification: (index) => set((state) => {
          state.notifications.splice(index, 1);
        }),
      })),
      { name: 'app-store', partialize: (state) => ({ items: state.items, theme: state.theme }) }
    )
  )
);

// Selector pattern for fine-grained subscriptions
const useCartItems = () => useAppStore((state) => state.items);
const useTheme = () => useAppStore((state) => state.theme);
const useCartTotal = () => useAppStore((state) => state.totalPrice());
```

```typescript
// TanStack Query for server state management
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface Post {
  id: string;
  title: string;
  content: string;
  authorId: string;
  createdAt: string;
}

// Query hook with caching and background refetch
function usePosts(authorId: string) {
  return useQuery({
    queryKey: ['posts', authorId],
    queryFn: async (): Promise<Post[]> => {
      const response = await fetch(`/api/posts?authorId=${authorId}`);
      if (!response.ok) throw new Error('Failed to fetch posts');
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // Consider fresh for 5 minutes
    gcTime: 30 * 60 * 1000,   // Keep in cache for 30 minutes
    refetchOnWindowFocus: true,
  });
}

// Mutation with optimistic update
function useCreatePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (newPost: Omit<Post, 'id' | 'createdAt'>) => {
      const response = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPost),
      });
      if (!response.ok) throw new Error('Failed to create post');
      return response.json() as Promise<Post>;
    },
    onMutate: async (newPost) => {
      await queryClient.cancelQueries({ queryKey: ['posts', newPost.authorId] });
      const previousPosts = queryClient.getQueryData<Post[]>(['posts', newPost.authorId]);

      // Optimistic update
      queryClient.setQueryData<Post[]>(['posts', newPost.authorId], (old = []) => [
        ...old,
        { ...newPost, id: 'temp-' + Date.now(), createdAt: new Date().toISOString() },
      ]);

      return { previousPosts };
    },
    onError: (_err, newPost, context) => {
      // Rollback on error
      queryClient.setQueryData(['posts', newPost.authorId], context?.previousPosts);
    },
    onSettled: (_data, _error, newPost) => {
      // Refetch to get server state
      queryClient.invalidateQueries({ queryKey: ['posts', newPost.authorId] });
    },
  });
}
```

## Common Pitfalls

1. **Putting everything in global state**: Not all state needs to be global. Form input values, modal visibility, and component-specific loading states belong in local state. Putting them in a global store creates unnecessary coupling, makes components harder to test in isolation, and causes unrelated components to re-render when the state changes. The rule of thumb is: if only one component or a small subtree uses the state, keep it local.

2. **Context re-render cascading**: Every component consuming a context re-renders whenever any part of the context value changes. Putting a large object with frequently-changing properties into a single context causes all consumers to re-render even when they only care about one property. Split contexts by update frequency: a ThemeContext that rarely changes and a NotificationContext that updates frequently should be separate providers.

3. **Mixing server state with client state**: Storing API responses in Redux or Context alongside UI state creates synchronization problems. The cached data becomes stale, you must manually handle refetching, and the store grows unbounded. Use dedicated server state libraries (TanStack Query, SWR) that handle caching, staleness, and background updates automatically, keeping your client state store focused on true client-side concerns.

4. **Unnecessary state duplication**: Storing derived values in state (like a filtered list alongside the full list and filter criteria) creates synchronization bugs. When the source data changes, you must remember to update the derived state too. Calculate derived values during render with useMemo or inline computation. State should only contain the minimal source of truth from which everything else can be derived.

5. **Ignoring state colocation**: State that lives too high in the component tree causes the entire subtree to re-render on every update. If a search input's value is stored in a top-level provider, typing a character re-renders the entire application. Move state as close as possible to where it is consumed. This is often more effective than memoization because it eliminates the problem rather than caching around it.

6. **Not considering URL state**: Filter selections, pagination, sort order, and active tabs are often stored in component state when they should be in the URL. URL state is shareable (users can send links with specific filters applied), bookmarkable, and survives page refreshes. Use React Router's useSearchParams for query parameters that represent user-visible application state.

## Real-World Use Cases

Enterprise dashboards at companies like Datadog and Grafana combine multiple state management approaches: Zustand or Redux for global UI preferences and dashboard layout configuration, TanStack Query for the dozens of metric queries that power charts and tables, and local state for individual widget interactions like tooltip visibility and drag-and-drop positioning. This layered approach keeps each state concern in the appropriate tool, preventing a monolithic store that becomes unmaintainable.

E-commerce platforms like Shopify use server state management extensively for product catalogs, inventory levels, and pricing that must stay synchronized with the backend. Cart state lives in a client-side store (often persisted to localStorage) because it represents user intent that has not yet been committed to the server. The checkout flow uses useReducer for its multi-step form state, where each step's validation depends on previous steps and the overall flow has clear state transitions (shipping → payment → confirmation → complete).

Collaborative editing tools like Notion and Linear use a combination of optimistic updates (via mutation hooks) and real-time synchronization (via WebSocket subscriptions stored in refs). The local state represents the user's pending changes, the server state represents the committed document, and conflict resolution logic reconciles them. This pattern requires careful separation of "what the user sees" (optimistic local state) from "what the server confirmed" (query cache), with rollback mechanisms when optimistic updates fail.

Social media applications manage complex notification state, feed pagination, and user interaction state (likes, comments, shares) across hundreds of components. TanStack Query's infinite query support handles feed pagination with automatic page merging, while Zustand stores the user's draft compositions and UI preferences. The key architectural decision is identifying which state is truly global (authenticated user, unread count badge) versus which is route-scoped (current feed filters, active conversation).

## Interview Questions

**Q: Compare Context API with Redux Toolkit. When would you choose each?**

A: Context API is built-in, requires no additional dependencies, and works well for infrequently-changing global values (theme, locale, auth state) consumed by a moderate number of components. Its limitation is performance: every consumer re-renders when the context value changes, regardless of which property they use. Redux Toolkit is appropriate when you have frequently-updating state consumed by many components, need middleware for side effects or logging, want time-travel debugging via DevTools, or need to enforce predictable state transitions through reducers. Redux Toolkit's selector pattern (via useSelector or reselect) provides fine-grained subscriptions that only re-render when the selected slice changes.

**Q: What is the stale-while-revalidate pattern and how do libraries like TanStack Query implement it?**

A: Stale-while-revalidate serves cached (potentially stale) data immediately for instant UI response, then revalidates in the background by fetching fresh data from the server. If the fresh data differs from the cache, the UI updates seamlessly. TanStack Query implements this through configurable staleTime (how long data is considered fresh) and gcTime (how long unused data stays in cache). When a component mounts and cached data exists, it renders immediately with the cached value while a background refetch runs. This provides the best user experience: no loading spinners for repeat visits, with eventual consistency guarantees.

**Q: How would you handle state that needs to persist across page refreshes?**

A: The approach depends on the state type. For user preferences (theme, sidebar state, display density), use localStorage with a custom hook that syncs state on change and reads initial value from storage. For authentication tokens, use httpOnly cookies (most secure) or localStorage with proper XSS protections. For form drafts, use sessionStorage (cleared when tab closes) or IndexedDB for large data. For navigation state (filters, pagination), use URL search parameters via useSearchParams so the state is shareable and bookmarkable. Libraries like Zustand's persist middleware and TanStack Query's persistQueryClient automate localStorage synchronization with proper serialization and hydration.

**Q: Explain the concept of optimistic updates and how you would implement one.**

A: Optimistic updates immediately reflect a user action in the UI before the server confirms it, providing instant feedback. Implementation: (1) capture the current state as a rollback point, (2) apply the expected change to the local cache/state, (3) send the mutation to the server, (4) on success, optionally refetch to ensure consistency, (5) on failure, rollback to the captured state and show an error. TanStack Query's onMutate/onError/onSettled hooks provide this pattern built-in. The key consideration is identifying which operations are safe to optimistically update (toggling a like) versus which need server confirmation first (payment processing).

## Production Tips

- **Implement state persistence with versioning**: When persisting state to localStorage (via Zustand persist or custom hooks), include a version number in the stored data. When your state shape changes in a new release, the version mismatch triggers a migration function that transforms the old shape to the new one, preventing crashes from deserialization of incompatible data. Without versioning, schema changes break the application for users with stale localStorage.

- **Use React DevTools and Redux DevTools for state debugging**: In production debugging scenarios, Redux DevTools provides time-travel debugging showing every action dispatched and the resulting state changes. Zustand integrates with Redux DevTools via the devtools middleware. For Context-based state, React DevTools shows the current context value at each provider. Enable these tools in development and staging environments, and consider a feature flag to enable them in production for specific users during incident investigation.

- **Monitor state size and subscription count**: Large state objects and many subscribers degrade performance. Track the size of your persisted state (localStorage has a 5-10MB limit per origin) and the number of components subscribing to each store slice. If a single store action triggers re-renders in 50+ components, consider splitting the store or using more granular selectors. Zustand's subscribe function with a selector only notifies when the selected value changes, providing automatic optimization.

## Related Topics

- [React Hooks](./hooks.md) — useState, useReducer, and useContext are the foundation of all React state management
- [Performance Optimization](./performance-optimization.md) — State management choices directly impact re-render performance
- [Component Patterns](./component-patterns.md) — Compound components and context patterns for encapsulated state
