# React Hooks

## Quick Reference

- Hooks are functions that let you use React state and lifecycle features in function components without writing classes
- Two rules: only call hooks at the top level (never inside loops, conditions, or nested functions) and only call hooks from React function components or custom hooks
- useState returns a tuple of current value and setter; the setter accepts a value or an updater function receiving previous state
- useEffect synchronizes components with external systems; the dependency array controls when the effect re-runs
- useContext consumes context values without prop drilling; any consumer re-renders when the context value changes
- useReducer manages complex state with a reducer function, similar to Redux patterns; dispatch is stable across renders
- useMemo caches computed values between renders; useCallback caches function references to prevent child re-renders
- useRef holds mutable values that persist across renders without triggering re-renders when changed
- Custom hooks extract reusable stateful logic into composable functions prefixed with `use`

## When to Use

Use hooks whenever you need stateful logic in function components. useState handles simple local state like form inputs, toggle flags, and counters. Reach for useReducer when state transitions are complex, when multiple sub-values change together, or when the next state depends on the previous state and an action type. useEffect is necessary for synchronizing with external systems: fetching data, subscribing to events, manipulating the DOM directly, or setting up timers. useContext eliminates prop drilling for values that many components need at different nesting levels, such as theme preferences, authentication state, or locale settings. useMemo and useCallback become relevant when profiling reveals unnecessary re-renders or expensive recalculations. useRef is the right choice for storing DOM references, tracking previous values, holding interval IDs, or any mutable value that should not trigger re-renders. Custom hooks are appropriate whenever you find yourself duplicating stateful logic across multiple components or when a component's hook logic becomes complex enough to warrant extraction for testability and readability.

## Code Examples

```typescript
// useState with updater function for batched updates
import { useState, useCallback } from 'react';

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
}

function useTodoList(initialTodos: TodoItem[] = []) {
  const [todos, setTodos] = useState<TodoItem[]>(initialTodos);

  const addTodo = useCallback((text: string) => {
    setTodos(prev => [...prev, {
      id: crypto.randomUUID(),
      text,
      completed: false,
    }]);
  }, []);

  const toggleTodo = useCallback((id: string) => {
    setTodos(prev => prev.map(todo =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    ));
  }, []);

  const removeTodo = useCallback((id: string) => {
    setTodos(prev => prev.filter(todo => todo.id !== id));
  }, []);

  const completedCount = todos.filter(t => t.completed).length;

  return { todos, addTodo, toggleTodo, removeTodo, completedCount };
}
```

```typescript
// Custom hook combining useEffect, useRef, and useState for data fetching
import { useState, useEffect, useRef, useCallback } from 'react';

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

function useFetch<T>(url: string, options?: RequestInit): FetchState<T> & { refetch: () => void } {
  const [state, setState] = useState<FetchState<T>>({
    data: null,
    loading: true,
    error: null,
  });
  const abortControllerRef = useRef<AbortController | null>(null);
  const cacheRef = useRef<Map<string, T>>(new Map());

  const fetchData = useCallback(async () => {
    if (cacheRef.current.has(url)) {
      setState({ data: cacheRef.current.get(url)!, loading: false, error: null });
      return;
    }

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const response = await fetch(url, {
        ...options,
        signal: abortControllerRef.current.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: T = await response.json();
      cacheRef.current.set(url, data);
      setState({ data, loading: false, error: null });
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        setState({ data: null, loading: false, error });
      }
    }
  }, [url, options]);

  useEffect(() => {
    fetchData();
    return () => abortControllerRef.current?.abort();
  }, [fetchData]);

  return { ...state, refetch: fetchData };
}
```

```typescript
// useReducer for complex form state management
import { useReducer } from 'react';

interface FormState {
  values: Record<string, string>;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
  isSubmitting: boolean;
}

type FormAction =
  | { type: 'SET_FIELD'; field: string; value: string }
  | { type: 'SET_ERROR'; field: string; error: string }
  | { type: 'TOUCH_FIELD'; field: string }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_SUCCESS' }
  | { type: 'SUBMIT_FAILURE'; errors: Record<string, string> }
  | { type: 'RESET'; initialValues: Record<string, string> };

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_FIELD':
      return {
        ...state,
        values: { ...state.values, [action.field]: action.value },
        errors: { ...state.errors, [action.field]: '' },
      };
    case 'SET_ERROR':
      return {
        ...state,
        errors: { ...state.errors, [action.field]: action.error },
      };
    case 'TOUCH_FIELD':
      return {
        ...state,
        touched: { ...state.touched, [action.field]: true },
      };
    case 'SUBMIT_START':
      return { ...state, isSubmitting: true };
    case 'SUBMIT_SUCCESS':
      return { ...state, isSubmitting: false, errors: {} };
    case 'SUBMIT_FAILURE':
      return { ...state, isSubmitting: false, errors: action.errors };
    case 'RESET':
      return {
        values: action.initialValues,
        errors: {},
        touched: {},
        isSubmitting: false,
      };
    default:
      return state;
  }
}

function useForm(initialValues: Record<string, string>) {
  const [state, dispatch] = useReducer(formReducer, {
    values: initialValues,
    errors: {},
    touched: {},
    isSubmitting: false,
  });

  return { state, dispatch };
}
```

## Common Pitfalls

1. **Stale closures in useEffect**: When the dependency array is incomplete, the effect captures stale values from a previous render. The ESLint `exhaustive-deps` rule catches most cases, but developers often suppress it instead of restructuring the effect. Always include all referenced variables in the dependency array or use useRef for values that should not trigger re-runs. A common manifestation is a timer callback that reads state but the state value never updates because the callback was created with the initial value captured in its closure.

2. **Overusing useEffect for derived state**: Computing values that can be calculated directly from props or state during render does not need useEffect. Using useEffect to sync derived state causes an extra render cycle and introduces bugs where the derived value is temporarily out of sync. For example, filtering a list based on a search term should be computed inline or with useMemo, not stored in separate state updated via useEffect. The rule of thumb is: if you can calculate it from existing props and state, do it during rendering.

3. **Creating new references on every render**: Passing inline objects like `style={{ color: 'red' }}` or inline callbacks like `onClick={() => handleClick(id)}` creates new references every render, defeating React.memo on child components. Extract stable references with useMemo for objects and useCallback for functions. However, only optimize this when profiling shows it matters, as premature memoization adds complexity without measurable benefit in most cases.

4. **Ignoring cleanup in useEffect**: Effects that set up subscriptions, timers, or event listeners must return a cleanup function to prevent memory leaks and stale callbacks. Forgetting cleanup leads to components that continue receiving events after unmounting, causing "setState on unmounted component" warnings and potential memory leaks. Every addEventListener needs a corresponding removeEventListener in the cleanup.

5. **Violating the rules of hooks**: Calling hooks conditionally or inside loops breaks React's ability to track hook state between renders. React relies on the order of hook calls being consistent across renders. Wrapping a hook call in an if statement means the hook might not be called on some renders, shifting all subsequent hook indices and corrupting state. The ESLint plugin `eslint-plugin-react-hooks` enforces this rule statically.

6. **Using useState when useRef suffices**: Not every mutable value needs to trigger a re-render. Storing interval IDs, previous values for comparison, or DOM element references in useState causes unnecessary re-renders. useRef is the correct choice for values that need to persist across renders but should not cause the component to update when they change.

## Real-World Use Cases

React hooks power the state management and side effect handling in virtually every modern React application. At Meta, hooks replaced thousands of class component lifecycle methods with composable, testable logic units. The useFetch pattern shown above is the foundation of data-fetching hooks in libraries like SWR and TanStack Query, which add caching, background refetching, and optimistic updates on top of the basic fetch-state-error pattern.

In e-commerce applications, useReducer manages complex checkout flows where multiple form steps, validation states, and payment processing states interact. The reducer pattern makes state transitions explicit and testable in isolation from the UI. Companies like Shopify use custom hooks to encapsulate cart logic, inventory checks, and pricing calculations that are shared across web and mobile (React Native) platforms.

Real-time collaboration tools like Figma and Notion use useEffect with WebSocket connections, where the cleanup function properly closes connections and the dependency array ensures reconnection when authentication tokens change. Custom hooks like `useWebSocket` encapsulate the connection lifecycle, message buffering, and reconnection logic, providing a clean API to consuming components.

Form-heavy enterprise applications use custom hooks that combine useReducer for form state, useEffect for async validation, and useCallback for stable submit handlers. Libraries like React Hook Form and Formik are built entirely on hooks, demonstrating how complex stateful logic can be packaged into reusable abstractions without affecting the component tree structure.

## Interview Questions

**Q: What are the rules of hooks and why do they exist?**

A: The two rules are: only call hooks at the top level (never inside loops, conditions, or nested functions) and only call hooks from React function components or custom hooks. These rules exist because React tracks hook state by the order in which hooks are called during each render. If a hook is called conditionally, the order changes between renders, causing React to associate the wrong state with the wrong hook. The rules ensure a stable, predictable mapping between hook calls and their stored state.

**Q: Explain the difference between useState and useReducer. When would you choose one over the other?**

A: useState is simpler and works well for independent state values with straightforward updates. useReducer is preferable when state logic is complex: when the next state depends on the previous state and an action type, when multiple sub-values change together in response to a single event, or when you want to centralize state transition logic for testability. useReducer also provides a stable dispatch function that never changes reference, making it safe to pass to deeply nested children without causing re-renders. In practice, if you find yourself writing multiple related useState calls that always update together, that is a signal to consolidate into useReducer.

**Q: How does the useEffect dependency array work, and what happens when you get it wrong?**

A: The dependency array tells React when to re-run the effect. An empty array means run once on mount and clean up on unmount. Specific values mean re-run when those values change (compared by Object.is). Omitting the array entirely means run after every render. When the array is incomplete (missing a dependency), the effect captures stale values from a previous render, leading to bugs where the effect operates on outdated data. When the array includes unstable references (objects or functions recreated every render), the effect runs too often, potentially causing infinite loops or performance issues.

**Q: What is the purpose of useCallback and useMemo, and when should you avoid using them?**

A: useCallback memoizes a function reference so it remains stable across renders, preventing child components wrapped in React.memo from re-rendering due to a new function prop. useMemo memoizes a computed value, preventing expensive recalculations when dependencies have not changed. Avoid using them when the computation is cheap (the memoization overhead exceeds the saved work), when the component does not pass the value to memoized children, or when the dependencies change on every render anyway (making memoization useless). Profile first, then optimize.

## Production Tips

- **Always use the exhaustive-deps ESLint rule without suppression**: The `react-hooks/exhaustive-deps` rule catches stale closure bugs that are extremely difficult to debug in production. When the rule flags a dependency, restructure the effect rather than adding an eslint-disable comment. Common restructuring patterns include moving the function inside the effect, using useRef for values that should not trigger re-runs, or splitting the effect into multiple focused effects with different dependency sets.

- **Implement error boundaries around hook-heavy components**: Hooks that perform async operations (data fetching, WebSocket connections) can throw errors that crash the entire component tree if uncaught. Wrap major UI sections in error boundaries that log to your monitoring service and display fallback UI. This is especially important for custom hooks used across many components, where a single bug in the hook logic could cascade across the application.

- **Use React DevTools Profiler to validate memoization**: Before adding useMemo or useCallback, use the Profiler to confirm that unnecessary re-renders are actually occurring and causing measurable performance impact. The Profiler shows why each component rendered (props changed, hooks changed, parent rendered), making it clear whether memoization will help. Many performance issues are better solved by state colocation (moving state closer to where it is used) than by memoization.

## Related Topics

- [State Management](./state-management.md) — Hooks are the foundation for all state management patterns in React
- [Component Patterns](./component-patterns.md) — Custom hooks enable the primary mechanism for logic reuse in modern React
- [TypeScript Generics](../typescript/generics.md) — Generic hooks provide type-safe reusable stateful logic
