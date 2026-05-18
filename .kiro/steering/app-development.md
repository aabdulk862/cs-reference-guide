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
- **Diagrams**: Mermaid 11.x
- **PWA**: vite-plugin-pwa (workbox)
- **Deployment**: Netlify (netlify.toml)
- **CI**: GitHub Actions (type-check → test → build)

## Project Structure

```
cs-reference-guide/
├── .kiro/              # Specs and steering files
├── .github/workflows/  # CI pipeline (ci.yml)
├── content/            # All markdown content (multi-page topics organized by category)
├── src/
│   ├── components/
│   │   ├── content/    # ContentCard, CodeBlock, EnhancedCodeBlock, MermaidRenderer, MathRenderer,
│   │   │               # Admonition, ChartRenderer, CompareCard, FootnoteDef, FootnoteRef,
│   │   │               # InterviewCard, MarkCompleteButton, MultiPageOverview, PrereqBadges,
│   │   │               # QuickReferenceCard, ShareButton, SingleFileView, SubtopicView,
│   │   │               # TableOfContents, TaskList, ViewToggle, AllCheatSheets
│   │   ├── interactive/ # BigOChart, CodePlayground, Quiz, SQLPlayground, DSVisualization
│   │   ├── layout/     # AppShell, Header, ThemeToggle, RouteTransition, RouteErrorBoundary,
│   │   │               # Skeleton, Sidebar, LoadingFallback, MobileSidebarOverlay, NavTimer,
│   │   │               # OfflineIndicator, SWNotification
│   │   ├── navigation/ # Sidebar, Breadcrumbs, SearchBar, CommandPalette, BackToTop,
│   │   │               # BottomNav, RandomTopicButton
│   │   └── study/      # PomodoroTimer, DailyGoal, WeeklyStats, BookmarkButton,
│   │                   # DueForReview, ResumePrompt
│   ├── hooks/          # useProgress, usePomodoro, useBookmarks, useDailyGoal, useWeeklyStats,
│   │                   # useSearch, useCommandPalette, useDocumentMeta, useKeyboardShortcuts,
│   │                   # useOnlineStatus, useSpacedRepetition, useStudySession, useSWNotifications
│   ├── pages/          # Dashboard, TopicPage, ProgressPage, SearchPage, SettingsPage,
│   │                   # CategoryPage, CheatSheets, BehavioralGuidePage, NotFound
│   ├── plugins/        # Vite content pipeline (vite-content-plugin, markdown-parser,
│   │                   # exclusion-filter, image-resolver, plugin-utils, search-indexer,
│   │                   # content-validator, sitemap-generator)
│   ├── styles/         # Modular CSS files (40+ files: tokens, layout, sidebar, topic-page, etc.)
│   ├── types/          # TypeScript interfaces (content, manifest, navigation, search, study, interactive)
│   ├── utils/          # Utilities (storage, helpers)
│   └── workers/        # Web Workers (code-runner)
├── public/
│   └── content/        # Generated JSON (build output from content pipeline)
├── netlify.toml        # Netlify deployment config with caching headers
└── vite.config.ts
```

## Routing

Routes follow this pattern:
- `/` — Dashboard
- `/topic/:categorySlug/:topicSlug` — Topic overview page
- `/topic/:categorySlug/:topicSlug/:subtopicSlug` — Subtopic content page
- `/category/:categorySlug` — Category overview page
- `/cheat-sheets` — All cheat sheets view
- `/progress` — Progress tracking page
- `/settings` — Settings page
- `/search` — Search results page
- `/behavioral-guide` — Behavioral interview guide
- `*` — NotFound (404)

## Coding Conventions

### TypeScript
- Strict mode enabled
- Prefer interfaces over types for object shapes
- Use discriminated unions for content nodes
- Export types from `src/types/` barrel files
- Path alias: `@/*` maps to `src/*`

### React Components
- Functional components only
- Use React.lazy for code-splitting page components and heavy interactive components
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
- Modular CSS in `src/styles/` directory (40+ files organized by component/feature)
- Global tokens and variables in `src/styles/tokens.css`
- Layout primitives in `src/styles/layout.css`
- `src/index.css` imports all style modules
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
6. Resolves categories via `CATEGORY_MAPPINGS` (in `plugin-utils.ts`)
7. Generates per-topic JSON in `public/content/` (includes subtopic data)
8. Generates `content-manifest.json` (with subtopics arrays)
9. Generates `search-index.json`
10. Generates `sitemap.xml`

### Category Mappings (13 categories)

Defined in `src/plugins/plugin-utils.ts`:

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

Categories are visually grouped in the sidebar (`src/components/navigation/Sidebar.tsx`):
- 🧠 Fundamentals: DSA, Operating Systems, Networking
- ⚙️ Server-Side: Backend, Databases
- 🎨 Client-Side: Frontend
- 🏗️ Architecture: System Design, Software Engineering, Security
- 🚀 Infrastructure: Infrastructure, Git
- ✅ Quality: Testing
- 🎯 Interview: Interview Prep

## Content Stats (as of last build)

- 13 categories, 46 topics, 182+ subtopic files
- All topics are multi-page (no single-file topics)

## Key Features

- **View modes**: Full, Cheat Sheet (500-word budget), ELI5 (simplified)
- **Manual completion**: "Mark as complete" button on each topic/subtopic page
- **Progress tracking**: ProgressPage shows per-category completion stats
- **Prev/Next navigation**: Bottom of subtopic pages for sequential reading
- **Collapsible sidebar**: Toggle button to hide/show sidebar
- **Command palette**: Quick navigation via keyboard shortcut
- **Back to top**: Scroll-to-top button on long pages
- **Bottom nav**: Mobile navigation bar
- **Random topic**: Discover random topics
- **Spaced repetition**: Review scheduling for completed topics
- **Resume prompt**: Continue where you left off
- **Offline indicator**: Shows when offline (PWA)
- **Service worker notifications**: Prompt to update when new version available
- **PWA**: Offline support via service worker

## Deployment

- **Platform**: Netlify
- **Build command**: `npm run build`
- **Publish directory**: `dist`
- **Node version**: 20
- **Caching strategy**:
  - `/assets/*` — immutable, cache forever
  - `/content/*.json` — 1 day cache, stale-while-revalidate 1 week
  - `/content-manifest.json`, `/search-index.json` — 1 hour cache, stale-while-revalidate 1 day
  - `/sw.js` — never cache

## CI/CD

GitHub Actions workflow (`.github/workflows/ci.yml`):
1. Checkout → setup Node 20 → `npm ci`
2. Type check: `npx tsc --noEmit`
3. Run tests: `npm test`
4. Build: `npm run build`

Triggers on push/PR to `main`.

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

## Build Chunking

Manual chunks in `vite.config.ts` for code-splitting heavy libraries:
- `vendor-mermaid` — Mermaid diagrams
- `vendor-katex` — Math rendering
- `vendor-recharts` — Charts
- `vendor-sql` — sql.js WASM
- `vendor-cytoscape` — Graph visualization
