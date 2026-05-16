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
- **PWA**: vite-plugin-pwa (workbox)

## Project Structure

```
cs-reference-guide/
├── .kiro/              # Specs and steering files
├── content/            # All markdown content (multi-page topics organized by category)
├── src/
│   ├── components/
│   │   ├── content/    # ContentCard, TopicPage, ViewToggle, CodeBlock, AllCheatSheets
│   │   ├── interactive/ # BigOChart, CodePlayground, Quiz, SQLPlayground, DSVisualization
│   │   ├── layout/     # AppShell, Header, ThemeToggle, RouteTransition, RouteErrorBoundary, Skeleton
│   │   ├── navigation/ # Sidebar, Breadcrumbs, SearchBar, CommandPalette
│   │   └── study/      # PomodoroTimer, DailyGoal, WeeklyStats, BookmarkButton, etc.
│   ├── hooks/          # Custom hooks (useProgress, usePomodoro, useBookmarks, etc.)
│   ├── pages/          # Route-level page components (Dashboard, TopicPage, ProgressPage, etc.)
│   ├── plugins/        # Vite content pipeline (markdown-parser, vite-content-plugin)
│   ├── types/          # TypeScript interfaces
│   ├── utils/          # Utilities (storage, helpers)
│   └── workers/        # Web Workers (code-runner)
├── public/
│   └── content/        # Generated JSON (build output from content pipeline)
└── vite.config.ts
```

## Routing

Routes follow this pattern:
- `/` — Dashboard
- `/topic/:categorySlug/:topicSlug` — Topic overview page
- `/topic/:categorySlug/:topicSlug/:subtopicSlug` — Subtopic content page
- `/cheat-sheets` — All cheat sheets view
- `/progress` — Progress tracking page
- `/settings` — Settings page
- `/search` — Search results page

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
- React context for global state (theme)
- Local state for component-specific UI state
- Custom hooks encapsulate all localStorage read/write logic
- Manual completion tracking: `csguide:completed-topics` stores array of completed topic/subtopic IDs

### CSS
- All styles in `src/index.css` (centralized)
- CSS custom properties for theming (`:root` and `:root[data-theme="light"]`)
- Mobile-first responsive design with `@media (min-width: 768px)` breakpoints
- Minimum 44x44px touch targets
- Minimum 16px body font size
- Custom thin scrollbar on sidebar
- Active items use left accent border + accent background

## Content Pipeline

The Vite plugin at `src/plugins/vite-content-plugin.ts`:
1. Scans `content/` directory recursively
2. Applies exclusion filter (no .tex, .css, public/, dot-dirs)
3. Detects multi-page topics (directories with `index.md`)
4. Extracts learning path order from each `index.md`
5. Parses each `.md` file via `markdown-parser.ts`
6. Resolves categories via `CATEGORY_MAPPINGS`
7. Generates per-topic JSON in `public/content/` (includes subtopic data)
8. Generates `content-manifest.json` (with subtopics arrays)
9. Generates `search-index.json`

### Category Mappings (13 categories)

```typescript
{ pattern: 'backend', category: 'Backend' }
{ pattern: 'frontend', category: 'Frontend' }
{ pattern: 'databases', category: 'Databases' }
{ pattern: 'infrastructure', category: 'Infrastructure' }
{ pattern: 'data-structures-and-algorithms', category: 'Data Structures & Algorithms' }
{ pattern: 'system-design', category: 'System Design' }
{ pattern: 'networking', category: 'Networking' }
{ pattern: 'operating-systems', category: 'Operating Systems' }
{ pattern: 'interview-prep', category: 'Interview Prep' }
{ pattern: 'git', category: 'Git' }
{ pattern: 'security', category: 'Security' }
{ pattern: 'testing', category: 'Testing' }
{ pattern: 'software-engineering', category: 'Software Engineering' }
```

### Sidebar Groups

Categories are visually grouped in the sidebar:
- 🧠 Core CS: DSA, Operating Systems, Networking
- ⚙️ Server: Backend, Databases, System Design
- 🎨 Client: Frontend
- 🚀 DevOps: Infrastructure
- ✅ Quality: Testing, Security, Software Engineering
- 📚 Career: Interview Prep, Git

## Content Stats (as of last build)

- 13 categories, 39 topics, 182 subtopic files
- 2508 total sections
- All topics are multi-page (no single-file topics)

## Key Features

- **View modes**: Full, Cheat Sheet (500-word budget), ELI5 (simplified)
- **Manual completion**: "Mark as complete" button on each topic/subtopic page
- **Progress tracking**: ProgressPage shows per-category completion stats
- **Prev/Next navigation**: Bottom of subtopic pages for sequential reading
- **Collapsible sidebar**: Toggle button to hide/show sidebar
- **Command palette**: Quick navigation via keyboard shortcut
- **PWA**: Offline support via service worker

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
