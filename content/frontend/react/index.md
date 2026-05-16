# React

React is a declarative, component-based JavaScript library for building user interfaces, maintained by Meta. It introduced the virtual DOM reconciliation model that minimizes expensive DOM mutations by comparing render trees and applying only the necessary changes. React's one-way data flow, where props flow down and events bubble up through callbacks, creates predictable state management patterns that scale from small widgets to enterprise applications.

The modern React ecosystem centers on function components with hooks, which replaced class components as the standard approach for managing state and side effects. React 18 introduced concurrent rendering, automatic batching, and Suspense for data fetching, enabling applications to remain responsive during expensive renders. Combined with TypeScript for type-safe component APIs and frameworks like Next.js for server-side rendering, React provides a complete platform for building production web applications.

Understanding React deeply requires mastering hooks, state management patterns, performance optimization techniques, component composition patterns, and testing strategies. Each of these areas builds on the previous, forming a comprehensive skill set for building maintainable, performant React applications at scale.

## Learning Path

1. [Hooks](./hooks.md) — Master useState, useEffect, useContext, useReducer, useMemo, useCallback, useRef, and custom hooks
2. [State Management](./state-management.md) — Local state, Context API, external libraries (Redux Toolkit, Zustand), and server state (TanStack Query)
3. [Component Patterns](./component-patterns.md) — Compound components, render props, HOCs, custom hooks, and composition strategies
4. [Performance Optimization](./performance-optimization.md) — React.memo, code splitting, virtualization, concurrent features, and profiling
5. [Testing Strategies](./testing-strategies.md) — React Testing Library, hook testing, mocking strategies, and integration testing
