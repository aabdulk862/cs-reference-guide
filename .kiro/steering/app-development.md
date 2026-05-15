# App Development Guidelines

inclusion: auto

## Purpose

This steering file provides guidelines for developing the CS Reference Guide React application. Follow these conventions when modifying app code in `cs-reference-guide/src/`.

## Tech Stack

- **Framework**: React 18 + TypeScript 5.6
- **Build**: Vite 5.4
- **Routing**: react-router-dom 6.28
- **Testing**: Vitest + @testing-library/react + fast-check (PBT)
- **Charts**: Recharts
- **Code Editor**: CodeMirror
- **SQL**: sql.js (SQLite WASM)
- **Search**: FlexSearch
- **Math**: KaTeX

## Project Structure

```
cs-reference-guide/
├── .kiro/              # Specs and steering files
├── content/            # All markdown Topic_Files (organized by category)
├── src/
│   ├── components/
│   │   ├── content/    # ContentCard, TopicPage, ViewToggle, CodeBlock
│   │   ├── interactive/ # BigOChart, CodePlayground, Quiz, SQLPlayground, DSVisualization
│   │   ├── layout/     # AppShell, Header, ThemeToggle
│   │   ├── navigation/ # Sidebar, Breadcrumbs, SearchBar, CommandPalette
│   │   └── study/      # PomodoroTimer, DailyGoal, WeeklyStats, BookmarkButton, etc.
│   ├── hooks/          # Custom hooks (useProgress, usePomodoro, useBookmarks, etc.)
│   ├── pages/          # Route-level page components (Dashboard, TopicPage, etc.)
│   ├── plugins/        # Vite content pipeline (markdown-parser, vite-content-plugin)
│   ├── types/          # TypeScript interfaces
│   ├── utils/          # Utilities (storage, helpers)
│   └── workers/        # Web Workers (code-runner)
├── public/
│   └── content/        # Generated JSON (build output)
└── vite.config.ts
```

## Coding Conventions

### TypeScript
- Strict mode enabled
- Prefer interfaces over types for object shapes
- Use discriminated unions for content nodes
- Export types from `src/types/` barrel files

### React Components
- Functional components only
- Use React.lazy for code-splitting interactive components
- Wrap lazy components in Suspense with fallback
- Use error boundaries around route-level components
- CSS classes follow BEM-like naming: `.component-name__element--modifier`

### State Management
- localStorage for persistence (namespaced with `csguide:` prefix)
- React context for global state (theme, progress)
- Local state for component-specific UI state
- Custom hooks encapsulate all localStorage read/write logic

### CSS
- All styles in `src/index.css` (centralized)
- CSS custom properties for theming (`:root` and `:root[data-theme="light"]`)
- Mobile-first responsive design with `@media (min-width: 768px)` breakpoints
- Minimum 44x44px touch targets
- Minimum 16px body font size

## Content Pipeline

The Vite plugin at `src/plugins/vite-content-plugin.ts`:
1. Scans `content/` directory recursively
2. Applies exclusion filter (no .tex, .css, public/, dot-dirs)
3. Parses each .md file via `markdown-parser.ts`
4. Resolves categories via `CATEGORY_MAPPINGS`
5. Generates per-topic JSON in `public/content/`
6. Generates `content-manifest.json`
7. Generates `search-index.json`

### Category Mappings

When adding new content directories, add a mapping entry:
```typescript
{ pattern: 'content/backend', category: 'Backend' }
```

### Multi-H1 Handling
Files with multiple H1 headings: first H1 = title, subsequent H1s = H2-level sections.

### No-H2 Handling
Files with no H2 headings: content under H1 becomes an implicit section.

## Testing

- Run tests: `npx vitest run`
- Run specific: `npx vitest run src/path/to/test.ts`
- Build (triggers content pipeline): `npm run build`
- Type check: `npx tsc --noEmit`

### Property-Based Tests
- Use fast-check with minimum 100 iterations
- Tag format: `Feature: cs-reference-guide, Property N: title`
- Target pure logic: parsers, calculators, state machines, serialization

## Performance Targets

- Initial load: < 3 seconds on 10 Mbps / 20ms latency
- Search results: < 200ms after keystroke
- Topic chunk size: < 50KB each
- Route transitions: 150-300ms fade animation
