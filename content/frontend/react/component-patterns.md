# Component Patterns

## Quick Reference

- Compound components expose related components that share implicit state through context, giving consumers control over composition
- Render props pass rendering control to consumers via a function that receives data and returns JSX
- Higher-order components (HOCs) wrap components to inject props or behavior; largely replaced by hooks but important for legacy codebases
- Custom hooks are the primary mechanism for logic reuse in modern React, extracting stateful logic into composable functions
- Container/Presentational split separates data-fetching logic from pure rendering for testability and reuse
- Controlled components derive their display value from props/state; uncontrolled components manage their own internal state via refs
- Composition over inheritance: React favors composing components via children and props over class inheritance hierarchies
- Polymorphic components accept an `as` prop to render as different HTML elements or components while preserving type safety

## When to Use

Use compound components when building complex UI widgets (tabs, accordions, selects, menus) where consumers need control over the arrangement and rendering of sub-parts while the parent manages shared state. Choose render props when a component needs to share layout, animation, or measurement logic while letting consumers control what renders inside. Use custom hooks whenever you find duplicated stateful logic across components or when a component's hook logic becomes complex enough to warrant extraction. Apply the container/presentational split when you want to reuse the same visual component with different data sources, or when you need to test rendering logic independently from data fetching. Use controlled components for forms where you need to validate, transform, or synchronize input values with external state. Choose polymorphic components when building design system primitives (Button, Text, Box) that need to render as different HTML elements depending on context while maintaining consistent styling and behavior.

## Code Examples

```typescript
// Compound component pattern with context
import { createContext, useContext, useState, ReactNode, useId } from 'react';

interface TabsContextType {
  activeTab: string;
  setActiveTab: (id: string) => void;
  baseId: string;
}

const TabsContext = createContext<TabsContextType | null>(null);

function useTabs() {
  const context = useContext(TabsContext);
  if (!context) throw new Error('Tab components must be used within Tabs');
  return context;
}

function Tabs({ children, defaultTab }: { children: ReactNode; defaultTab: string }) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const baseId = useId();

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab, baseId }}>
      <div role="tablist">{children}</div>
    </TabsContext.Provider>
  );
}

function TabTrigger({ id, children }: { id: string; children: ReactNode }) {
  const { activeTab, setActiveTab, baseId } = useTabs();
  const isActive = activeTab === id;

  return (
    <button
      role="tab"
      id={`${baseId}-tab-${id}`}
      aria-selected={isActive}
      aria-controls={`${baseId}-panel-${id}`}
      tabIndex={isActive ? 0 : -1}
      onClick={() => setActiveTab(id)}
    >
      {children}
    </button>
  );
}

function TabPanel({ id, children }: { id: string; children: ReactNode }) {
  const { activeTab, baseId } = useTabs();
  if (activeTab !== id) return null;

  return (
    <div
      role="tabpanel"
      id={`${baseId}-panel-${id}`}
      aria-labelledby={`${baseId}-tab-${id}`}
    >
      {children}
    </div>
  );
}

Tabs.Trigger = TabTrigger;
Tabs.Panel = TabPanel;

// Usage: consumers control composition order and content
function App() {
  return (
    <Tabs defaultTab="overview">
      <Tabs.Trigger id="overview">Overview</Tabs.Trigger>
      <Tabs.Trigger id="settings">Settings</Tabs.Trigger>
      <Tabs.Panel id="overview">Overview content here</Tabs.Panel>
      <Tabs.Panel id="settings">Settings content here</Tabs.Panel>
    </Tabs>
  );
}
```

```typescript
// Polymorphic component with TypeScript type safety
import { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';

type PolymorphicProps<E extends ElementType, Props = object> = Props &
  Omit<ComponentPropsWithoutRef<E>, keyof Props | 'as'> & {
    as?: E;
  };

interface ButtonBaseProps {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  children: ReactNode;
}

type ButtonProps<E extends ElementType = 'button'> = PolymorphicProps<E, ButtonBaseProps>;

function Button<E extends ElementType = 'button'>({
  as,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  children,
  ...props
}: ButtonProps<E>) {
  const Component = as || 'button';
  const className = `btn btn--${variant} btn--${size} ${isLoading ? 'btn--loading' : ''}`;

  return (
    <Component className={className} disabled={isLoading} {...props}>
      {isLoading ? <span className="btn__spinner" /> : null}
      {children}
    </Component>
  );
}

// Usage with full type safety
<Button variant="primary" onClick={() => {}}>Click me</Button>
<Button as="a" href="/dashboard" variant="secondary">Go to Dashboard</Button>
<Button as="link" to="/settings" variant="ghost">Settings</Button>
```

```typescript
// Custom hook pattern for reusable logic with composition
import { useState, useEffect, useCallback, useRef } from 'react';

interface UseIntersectionOptions {
  threshold?: number | number[];
  rootMargin?: string;
  root?: Element | null;
  freezeOnceVisible?: boolean;
}

function useIntersection(options: UseIntersectionOptions = {}) {
  const { threshold = 0, rootMargin = '0px', root = null, freezeOnceVisible = false } = options;
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);
  const [node, setNode] = useState<Element | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const frozen = entry?.isIntersecting && freezeOnceVisible;

  const ref = useCallback((element: Element | null) => {
    setNode(element);
  }, []);

  useEffect(() => {
    if (!node || frozen) return;

    observerRef.current = new IntersectionObserver(
      ([observerEntry]) => setEntry(observerEntry),
      { threshold, rootMargin, root }
    );

    observerRef.current.observe(node);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [node, threshold, rootMargin, root, frozen]);

  return { ref, entry, isVisible: !!entry?.isIntersecting };
}

// Composing multiple custom hooks
function useAnimatedVisibility(options?: UseIntersectionOptions) {
  const { ref, isVisible } = useIntersection({ ...options, freezeOnceVisible: true });
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    if (isVisible && !hasAnimated) {
      setHasAnimated(true);
    }
  }, [isVisible, hasAnimated]);

  return { ref, isVisible, hasAnimated };
}
```

## Common Pitfalls

1. **Overusing Higher-Order Components**: HOCs create wrapper hell in React DevTools, making debugging difficult. They can cause prop name collisions when multiple HOCs inject props with the same name. They also make TypeScript typing complex because the wrapped component's props must be correctly forwarded and the injected props must be excluded from the public API. In modern React, custom hooks solve the same problems more cleanly without affecting the component tree structure. Reserve HOCs for integrating with legacy libraries that require them (like older versions of Redux connect).

2. **Breaking compound component encapsulation**: Compound components rely on context to share state between parent and children. If consumers wrap child components in intermediate elements or conditionally render them, the context connection can break. Design compound components to be resilient by using context lookup that traverses the tree rather than relying on direct parent-child relationships. Document which components must be direct children versus which can be nested arbitrarily.

3. **Prop drilling disguised as composition**: Passing the same prop through 5+ intermediate components is not composition, it is prop drilling. True composition uses children, render props, or context to skip intermediate layers. If you find yourself adding a prop to a component solely to pass it to a grandchild, that is a signal to restructure using context or component composition (passing the consuming component as children to the providing component).

4. **Controlled/uncontrolled component confusion**: Switching a component between controlled (value prop) and uncontrolled (defaultValue prop) during its lifetime causes React warnings and unpredictable behavior. A component should be either controlled or uncontrolled for its entire lifecycle. If you need to reset an uncontrolled component, use the key prop to force remounting. If you need external access to an uncontrolled component's value, use a ref rather than switching to controlled mode.

5. **Creating context providers that re-render everything**: Placing a context provider at the top of the tree with a value that changes frequently (like a timer or mouse position) causes every consumer to re-render on every change. Split frequently-changing values into their own context, memoize the context value object with useMemo, or use an external state library with selector-based subscriptions instead of context for high-frequency updates.

## Real-World Use Cases

Design system libraries like Radix UI, Headless UI, and Chakra UI are built entirely on compound component patterns. Radix UI's Dialog component exposes Dialog.Root, Dialog.Trigger, Dialog.Portal, Dialog.Overlay, and Dialog.Content as separate composable pieces. This allows consumers to control exactly where the trigger renders, whether to use a portal, and what content appears in the overlay, while the library manages focus trapping, escape key handling, and accessibility attributes through shared context.

Enterprise form systems use the controlled component pattern extensively. Formik and React Hook Form provide form context that individual field components consume to register themselves, report validation errors, and synchronize their values. The container/presentational split allows the same form field components to work with different form libraries by swapping the container that provides the control logic while keeping the presentational rendering unchanged.

Data visualization dashboards use render props and custom hooks to separate data transformation from rendering. A chart component might accept a renderTooltip prop that receives the hovered data point and returns custom tooltip JSX. This allows the same chart component to display different tooltip formats across different dashboard widgets without the chart needing to know about tooltip content. Libraries like Recharts and Victory use this pattern for customizable chart elements.

Component libraries for large organizations use polymorphic components to maintain design consistency while supporting semantic HTML. A Text component renders as p, span, h1-h6, or label depending on context, applying consistent typography styles regardless of the underlying element. This pattern ensures accessibility (correct heading hierarchy, proper label associations) while keeping the styling API uniform across the design system.

## Interview Questions

**Q: Explain the compound component pattern and its advantages over prop-based configuration.**

A: Compound components expose a set of related sub-components that share implicit state through context. Instead of configuring a complex component through a single props object (which becomes unwieldy with many options), consumers compose the sub-components in JSX, controlling order, conditional rendering, and wrapper elements. Advantages include: inversion of control (consumers decide what renders where), better readability (JSX structure mirrors visual structure), easier extension (add new sub-components without changing the parent API), and natural accessibility (each sub-component manages its own ARIA attributes). The tradeoff is more verbose usage for simple cases where a props-based API would be more concise.

**Q: When would you use a render prop versus a custom hook for sharing logic?**

A: Custom hooks are preferred for sharing stateful logic (data fetching, subscriptions, state machines) because they do not add wrapper components to the tree and compose naturally with other hooks. Render props are still valuable when the shared logic involves rendering concerns: layout measurement (the component needs to render a container to measure), animation (the component controls mount/unmount transitions), or when the shared component provides visual structure (a virtualized list that manages scroll position and renders items via a render prop). The key distinction is whether the shared concern is purely logical (use a hook) or involves DOM structure and rendering (consider a render prop).

**Q: How do you handle the "prop drilling" problem without reaching for global state?**

A: Three approaches before global state: (1) Component composition — restructure the tree so the consuming component is passed as children to the providing component, eliminating intermediate layers. (2) Context for specific concerns — create a focused context for the shared value, scoped to the subtree that needs it rather than the entire app. (3) Compound components — if the drilling occurs within a widget, restructure as a compound component where sub-components access shared state via context. Global state (Redux, Zustand) is appropriate only when the state is truly application-wide and consumed by components in unrelated subtrees.

**Q: What is the difference between composition and inheritance in React, and why does React favor composition?**

A: Inheritance creates rigid hierarchies where child classes are tightly coupled to parent implementation details. Composition assembles behavior from independent pieces that can be mixed and matched. React favors composition because: components are functions (not classes with inheritance chains), the children prop enables arbitrary nesting, custom hooks compose without hierarchy, and render props delegate rendering decisions to consumers. In practice, React teams at Meta found zero use cases where inheritance was preferable to composition across thousands of components. The flexibility of composition means you can change one piece without affecting others, test pieces in isolation, and reuse them in unexpected combinations.

## Production Tips

- **Design compound components with escape hatches**: Not every consumer will use your compound component as intended. Provide imperative handles via useImperativeHandle for programmatic control (opening a dialog from a keyboard shortcut, scrolling a virtualized list to an index). Export the context hook so advanced consumers can build custom sub-components that integrate with your state management. This layered API serves both simple and complex use cases without forcing everyone into the same pattern.

- **Use TypeScript discriminated unions for component variants**: Instead of a single component with many boolean props (isLoading, isDisabled, isError, isEmpty), define variant types as a discriminated union. This makes impossible states unrepresentable: a component cannot be simultaneously loading and in an error state. The TypeScript compiler enforces that consumers provide the correct props for each variant, catching configuration errors at compile time rather than runtime.

- **Measure component API surface area**: A component with more than 10 props is likely doing too much. Split it into compound components or extract logic into hooks. Track the number of props across your design system components and set a threshold. Components with large prop surfaces are harder to document, test, and maintain. Each prop is a commitment to backward compatibility that constrains future changes.

## Related Topics

- [React Hooks](./hooks.md) — Custom hooks are the modern replacement for HOCs and render props for logic reuse
- [State Management](./state-management.md) — Context-based patterns power compound component state sharing
- [Testing Strategies](./testing-strategies.md) — Component patterns affect testing strategy and test structure
