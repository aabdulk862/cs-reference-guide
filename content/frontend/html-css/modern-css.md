# Modern CSS

Modern CSS has evolved far beyond simple selectors and box model properties into a powerful layout and styling system capable of handling complex responsive designs without JavaScript. Flexbox and Grid provide two-dimensional layout control, custom properties enable dynamic theming, container queries allow component-level responsiveness, and cascade layers give developers fine-grained control over specificity. Mastering these features is essential for building performant, maintainable, and accessible user interfaces that work across devices and screen sizes.

---

## Quick Reference

- **Flexbox** — One-dimensional layout (row or column); use for navigation bars, card rows, centering, and distributing space between items
- **CSS Grid** — Two-dimensional layout (rows and columns simultaneously); use for page layouts, dashboards, and complex grid-based designs
- **Custom Properties (CSS Variables)** — Declared with `--name` syntax, accessed with `var(--name)`; cascade and inherit like regular properties, enabling dynamic theming
- **Container Queries** — Style elements based on their container's size rather than the viewport; enables truly reusable responsive components
- **Cascade Layers (`@layer`)** — Explicit control over cascade ordering; eliminates specificity wars between base styles, components, and utilities
- **`:has()` Selector** — Parent selector that styles elements based on their children or subsequent siblings; previously impossible without JavaScript
- **`clamp()` Function** — Responsive values without media queries: `clamp(min, preferred, max)` for fluid typography and spacing
- **Logical Properties** — `margin-inline`, `padding-block` replace directional properties for internationalization support (RTL/LTR)
- **Subgrid** — Child elements participate in the parent's grid tracks, enabling alignment across nested components
- **`@scope`** — Limits style application to a specific DOM subtree, providing native CSS scoping without build tools

---

## When to Use

Modern CSS features solve specific layout and styling challenges. Choosing the right tool for each situation prevents over-engineering and produces more maintainable code.

**Use Flexbox when:**

- Laying out items in a single direction (row of navigation links, vertical stack of cards)
- Distributing space between items with varying sizes
- Centering content both vertically and horizontally
- Building components where items should wrap to the next line when space runs out
- Aligning items along a single axis with different alignment rules per item

**Use CSS Grid when:**

- Creating two-dimensional layouts where both row and column placement matters
- Building page-level layouts with header, sidebar, main content, and footer regions
- Designing card grids where items should align both horizontally and vertically
- Overlapping elements without absolute positioning
- Creating complex dashboard layouts with varying cell sizes

**Use Custom Properties when:**

- Implementing theme switching (light/dark mode) without duplicating entire stylesheets
- Creating design tokens that propagate through component hierarchies
- Building responsive designs where spacing and sizing scale proportionally
- Enabling runtime style changes that CSS alone cannot achieve with static values

**Use Container Queries when:**

- Building reusable components that must adapt to their container width regardless of viewport size
- Creating widget libraries where the same component appears in sidebars, main content, and modals at different sizes
- Replacing JavaScript-based resize observers for layout adaptation

---

## Code Examples

### Example 1: Responsive Dashboard Layout with CSS Grid

```css
/* Modern dashboard layout using Grid with named areas */
.dashboard {
  display: grid;
  grid-template-columns: 250px 1fr 300px;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    "header  header  header"
    "sidebar main    aside"
    "footer  footer  footer";
  min-height: 100vh;
  gap: 0;
}

.dashboard__header  { grid-area: header; }
.dashboard__sidebar { grid-area: sidebar; }
.dashboard__main    { grid-area: main; }
.dashboard__aside   { grid-area: aside; }
.dashboard__footer  { grid-area: footer; }

/* Responsive: collapse to single column on mobile */
@media (max-width: 768px) {
  .dashboard {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto 1fr auto auto;
    grid-template-areas:
      "header"
      "main"
      "aside"
      "sidebar"
      "footer";
  }
}

/* Intermediate: two-column layout for tablets */
@media (min-width: 769px) and (max-width: 1024px) {
  .dashboard {
    grid-template-columns: 200px 1fr;
    grid-template-areas:
      "header  header"
      "sidebar main"
      "footer  footer";
  }

  .dashboard__aside {
    grid-area: main;
    /* Aside content flows below main in the same grid area */
  }
}
```

```html
<div class="dashboard">
  <header class="dashboard__header">Navigation</header>
  <nav class="dashboard__sidebar">Sidebar Links</nav>
  <main class="dashboard__main">Primary Content</main>
  <aside class="dashboard__aside">Widgets</aside>
  <footer class="dashboard__footer">Footer</footer>
</div>
```

Grid template areas provide a visual representation of the layout directly in CSS, making it immediately clear how the page is structured. Changing the layout for different breakpoints requires only redefining the template areas rather than restructuring HTML or adding complex positioning rules.

### Example 2: Design System Theming with Custom Properties

```css
/* Design tokens as custom properties */
:root {
  /* Color palette */
  --color-primary-50: #eff6ff;
  --color-primary-500: #3b82f6;
  --color-primary-700: #1d4ed8;
  --color-primary-900: #1e3a5f;

  /* Semantic tokens (reference palette tokens) */
  --color-bg-primary: #ffffff;
  --color-bg-secondary: #f8fafc;
  --color-text-primary: #0f172a;
  --color-text-secondary: #475569;
  --color-border: #e2e8f0;
  --color-accent: var(--color-primary-500);

  /* Spacing scale */
  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  --space-xl: 2rem;
  --space-2xl: 3rem;

  /* Typography */
  --font-size-sm: clamp(0.8rem, 0.17vw + 0.76rem, 0.89rem);
  --font-size-base: clamp(1rem, 0.34vw + 0.91rem, 1.19rem);
  --font-size-lg: clamp(1.25rem, 0.61vw + 1.1rem, 1.58rem);
  --font-size-xl: clamp(1.56rem, 1vw + 1.31rem, 2.11rem);
  --font-size-2xl: clamp(1.95rem, 1.56vw + 1.56rem, 2.81rem);

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-base: 250ms ease;
}

/* Dark theme override — only semantic tokens change */
:root[data-theme="dark"] {
  --color-bg-primary: #0f172a;
  --color-bg-secondary: #1e293b;
  --color-text-primary: #f1f5f9;
  --color-text-secondary: #94a3b8;
  --color-border: #334155;
  --color-accent: var(--color-primary-500);
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.4);
}

/* Components consume semantic tokens */
.card {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--space-sm);
  padding: var(--space-lg);
  box-shadow: var(--shadow-sm);
  transition: box-shadow var(--transition-fast);
}

.card:hover {
  box-shadow: var(--shadow-md);
}

.card__title {
  color: var(--color-text-primary);
  font-size: var(--font-size-lg);
  margin-block-end: var(--space-sm);
}

.card__body {
  color: var(--color-text-secondary);
  font-size: var(--font-size-base);
}
```

The two-tier token system (palette tokens and semantic tokens) means theme switching only requires overriding semantic tokens. Components never reference palette colors directly, so adding a new theme (high contrast, brand-specific) requires zero component changes. The `clamp()` function for typography creates fluid scaling between minimum and maximum sizes without media query breakpoints.

### Example 3: Container Queries for Reusable Components

```css
/* Define a containment context */
.widget-container {
  container-type: inline-size;
  container-name: widget;
}

/* Component adapts to its container, not the viewport */
.product-card {
  display: grid;
  gap: var(--space-md);
  padding: var(--space-md);
}

/* Narrow container: stack vertically */
@container widget (max-width: 300px) {
  .product-card {
    grid-template-columns: 1fr;
    text-align: center;
  }

  .product-card__image {
    max-width: 150px;
    margin-inline: auto;
  }

  .product-card__actions {
    flex-direction: column;
  }
}

/* Medium container: side-by-side layout */
@container widget (min-width: 301px) and (max-width: 600px) {
  .product-card {
    grid-template-columns: 120px 1fr;
    align-items: start;
  }
}

/* Wide container: full horizontal layout with extra details */
@container widget (min-width: 601px) {
  .product-card {
    grid-template-columns: 200px 1fr auto;
    align-items: center;
  }

  .product-card__details {
    display: block; /* Hidden in narrower containers */
  }
}
```

```html
<!-- Same component, different containers -->
<div class="widget-container" style="width: 250px;">
  <article class="product-card"><!-- Renders stacked --></article>
</div>

<div class="widget-container" style="width: 500px;">
  <article class="product-card"><!-- Renders side-by-side --></article>
</div>

<div class="widget-container" style="width: 800px;">
  <article class="product-card"><!-- Renders full horizontal --></article>
</div>
```

Container queries solve the fundamental limitation of media queries: a component in a narrow sidebar and the same component in wide main content need different layouts, but both exist at the same viewport width. Container queries make components truly self-contained and reusable regardless of where they are placed in the page.

---

## Common Pitfalls

**1. Using Flexbox when Grid is more appropriate (and vice versa).** Flexbox is content-driven (items determine their size, container distributes space), while Grid is layout-driven (you define the grid, items fill it). Using Flexbox for a two-dimensional card grid results in uneven row heights and alignment issues. Using Grid for a simple horizontal navigation adds unnecessary complexity. Match the tool to the layout dimension.

**2. Overriding custom properties at the wrong scope.** Custom properties inherit through the DOM tree, not the CSS cascade. Setting `--color-accent` on a `.modal` element affects all descendants, which may include components that should use the global accent color. Use cascade layers or more specific scoping to prevent unintended inheritance.

**3. Not accounting for content overflow in Grid layouts.** Grid items with `minmax(0, 1fr)` behave differently from `1fr` alone. Without `minmax(0, 1fr)`, a grid item with long unbreakable content (URLs, code snippets) can overflow its track and break the layout. Always consider overflow behavior when defining track sizes.

**4. Using `100vh` for full-height layouts on mobile.** Mobile browsers have dynamic toolbars that change the viewport height. `100vh` refers to the largest possible viewport, causing content to be hidden behind the toolbar. Use `100dvh` (dynamic viewport height) or the `min-height: 100svh` pattern for reliable full-height layouts on mobile devices.

**5. Ignoring the cascade when using utility classes alongside component styles.** Utility classes (like Tailwind) and component CSS can conflict unpredictably based on source order. Cascade layers (`@layer base, components, utilities`) provide explicit ordering that eliminates these conflicts regardless of file import order.

**6. Not using logical properties for internationalization.** `margin-left` and `padding-right` break in right-to-left (RTL) languages. `margin-inline-start` and `padding-inline-end` automatically adapt to the document's writing direction. Any application that may need internationalization should use logical properties from the start.

---

## Real-World Use Cases

**Design system implementation:** Large organizations build design systems using custom properties as tokens, with Grid and Flexbox providing the layout primitives. The token layer enables white-labeling (different brands use different token values) while components remain unchanged. Cascade layers separate reset styles, design tokens, component styles, and utility overrides into predictable priority levels.

**Responsive email template builders:** Drag-and-drop email builders use CSS Grid for the editor canvas layout and container queries to preview how email components will render at different widths (desktop, tablet, mobile) simultaneously in the editor. The same component renders differently in each preview pane based on its container width.

**Accessible data dashboards:** Dashboard applications use Grid for the overall panel layout with `grid-template-areas` that reorganize for different screen sizes. Each panel uses Flexbox internally for content alignment. Custom properties drive a high-contrast mode that meets WCAG AAA requirements by overriding only the semantic color tokens.

**Progressive web applications:** PWAs use `clamp()` for fluid typography that scales smoothly between mobile and desktop without breakpoint jumps, CSS Grid for app-shell layouts that adapt from phone to tablet to desktop, and container queries for widget components that appear in both the main view and notification panels at different sizes.

---

## Interview Questions

**Q: When would you choose CSS Grid over Flexbox? Can you describe a layout that requires Grid and cannot be achieved with Flexbox alone?**

A: Grid is necessary when you need simultaneous control over both rows and columns. A classic example is a card grid where all cards in the same row must have equal height AND all cards in the same column must have equal width, regardless of content length. Flexbox can equalize heights within a row (with `align-items: stretch`) but cannot coordinate column widths across rows. Another example is overlapping elements: Grid allows multiple items to occupy the same grid cell using `grid-row` and `grid-column`, creating overlaps without absolute positioning. A dashboard with panels of varying sizes that must align to a consistent grid is fundamentally a Grid problem.

**Q: Explain CSS Custom Properties inheritance and how it differs from preprocessor variables (Sass/Less). What can custom properties do that preprocessor variables cannot?**

A: Preprocessor variables are compiled away at build time — they are static text substitution with no runtime existence. Custom properties are live CSS values that participate in the cascade, inherit through the DOM tree, and can be modified at runtime via JavaScript (`element.style.setProperty('--color', 'red')`) or CSS (media queries, pseudo-classes, container queries). This enables: theme switching without page reload, component-scoped overrides (a dark card inside a light page), animation of custom properties with `@property` registration, and responsive values that change based on context. The inheritance behavior means setting `--spacing: 2rem` on a container automatically propagates to all descendants, which preprocessor variables cannot achieve since they have no DOM awareness.

**Q: What are cascade layers and what problem do they solve? How would you structure layers in a large application?**

A: Cascade layers (`@layer`) solve specificity conflicts between different sources of styles. Without layers, a utility class `.text-red { color: red }` might lose to a component style `.card .title { color: blue }` due to specificity, even though the utility should win. Layers establish explicit priority: styles in later-declared layers override earlier layers regardless of specificity. A typical structure is `@layer reset, tokens, base, components, utilities` — reset normalizes browser defaults, tokens define custom properties, base sets element-level styles, components define scoped component styles, and utilities provide single-purpose overrides that always win. Third-party CSS can be assigned to its own layer to prevent it from unexpectedly overriding your styles.

**Q: How do container queries change the way you architect CSS for reusable components?**

A: Container queries fundamentally shift responsive design from page-level to component-level. Previously, a card component needed to know where it would be used (sidebar vs main content) to apply the correct media query breakpoints. With container queries, the component defines its own responsive behavior based on its container's size, making it truly portable. This changes architecture by eliminating the need for variant props or modifier classes for different contexts (`.card--sidebar`, `.card--main`), reducing the coupling between layout and component styles, and enabling component libraries that work in any container without consumer-side responsive overrides. The trade-off is that container queries require explicit containment context (`container-type: inline-size`), which has layout implications (creates a new formatting context, similar to `overflow: hidden`).

---

## Production Tips

**Establish a custom property naming convention and enforce it.** Use a consistent pattern like `--{category}-{property}-{variant}` (e.g., `--color-text-primary`, `--space-padding-lg`). Document which properties are public API (safe for consumers to override) versus internal implementation details. Without convention, custom property names proliferate into an unmaintainable mess where developers cannot distinguish between tokens meant for theming and internal component variables.

**Use feature queries (`@supports`) for progressive enhancement.** Not all browsers support the latest CSS features simultaneously. Wrap newer features in `@supports` blocks with fallbacks: `@supports (container-type: inline-size) { ... }`. This ensures the application remains functional in older browsers while providing enhanced experiences in modern ones. Test with the fallback path regularly to ensure it remains acceptable.

**Audit CSS bundle size and remove unused styles.** Tools like PurgeCSS or the built-in tree-shaking in Tailwind CSS eliminate unused styles from production bundles. For custom CSS, regularly audit with coverage tools in Chrome DevTools. Large CSS files block rendering (CSS is render-blocking by default), so keeping the critical CSS path small directly impacts Largest Contentful Paint (LCP) scores.

---

## Related Topics

- [React Fundamentals](../frontend/react/index.md) — Component-based architecture where CSS modules, styled-components, or utility classes integrate with React's rendering model
- [Next.js Fundamentals](../nextjs/nextjs-fundamentals.md) — Framework-level CSS handling including CSS Modules, global styles, and font optimization
