# CS Reference Guide

A comprehensive, interactive computer science reference guide built for senior-level software engineers preparing for interviews and deepening production knowledge. Browse structured topics across backend, frontend, infrastructure, algorithms, system design, and more — all in a fast, searchable single-page app.

## Features

- Full-text search powered by FlexSearch
- Interactive code playground with CodeMirror
- SQL playground using sql.js (SQLite in the browser via WASM)
- Big-O complexity charts with Recharts
- Mermaid diagram rendering
- LaTeX math rendering with KaTeX
- Coding interview guide with 12 algorithm pattern tabs and step-through visualizations
- Pomodoro timer, daily goals, and study tracking
- Bookmarks and progress persistence (localStorage → IndexedDB → in-memory fallback)
- Dark/light theme toggle
- Offline-capable PWA with WASM cache invalidation
- Pre-rendered static HTML for SEO crawlability

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript 5.6 |
| Build | Vite 5.4 |
| Routing | react-router-dom 6 |
| Search | FlexSearch |
| Code Editor | CodeMirror 6 |
| SQL | sql.js (SQLite WASM) |
| Charts | Recharts |
| Math | KaTeX |
| Diagrams | Mermaid |
| Testing | Vitest + Testing Library + fast-check |
| PWA | vite-plugin-pwa (Workbox) |
| Deployment | Netlify |

## Content Categories

| Category | Topics |
|----------|--------|
| Backend | Java, Spring Framework, API Design, Messaging (Kafka, RabbitMQ), Build Tools |
| Frontend | React, TypeScript, Angular, Next.js, JavaScript, HTML & CSS, State Management, Web Performance |
| Databases | SQL Foundations, PostgreSQL, Oracle, MongoDB, Redis |
| Infrastructure | Docker, Kubernetes, AWS, CI/CD, Linux, Observability |
| Data Structures & Algorithms | Fundamental Data Structures, Arrays & Strings, Trees & Graphs, Sorting & Searching, Dynamic Programming |
| System Design | Fundamentals (CAP, Consistent Hashing, Quorums, Sagas, Event Sourcing, Vector Clocks, Leader Election), Patterns |
| Networking | Protocols, Real-Time & Infrastructure |
| Operating Systems | Processes & Memory, Systems & I/O |
| Security | Application Security, Infrastructure Security |
| Testing | Unit Testing, Integration Testing, Test Strategy |
| Software Engineering | Design Principles, Practices |
| Interview Prep | Technical, Soft Skills |

## Getting Started

### Prerequisites

- Node.js 20+
- npm 9+

### Installation

```bash
git clone <repo-url>
cd cs-reference-guide
npm install
```

### Development

```bash
npm run dev
```

Opens the app at `http://localhost:5173`.

### Build

```bash
npm run build
```

Compiles TypeScript, runs the content pipeline (markdown → JSON), generates pre-rendered HTML pages, and outputs to `dist/`.

### Preview Production Build

```bash
npm run preview
```

### Run Tests

```bash
npm test
```

### Lint

```bash
npm run lint
```

## Content Pipeline

The build process includes a custom Vite plugin that transforms markdown files into structured JSON:

```
content/{category}/{topic-dir}/index.md + subtopics.md
    → exclusion filter
    → multi-page topic detection (directories with index.md)
    → markdown parser
    → category resolver
    → content validator (severity-based: warnings + info)
    → JSON output (per-topic with subtopics)
    → content-manifest.json
    → search-index.json
    → sitemap.xml
    → pre-rendered HTML (postbuild)
```

- Scans `content/` directory recursively
- Detects multi-page topics (directories with `index.md`)
- Parses markdown into structured sections (headings, code blocks, tables, diagrams, math, etc.)
- Validates content quality (word count warnings, missing section info messages)
- Generates per-topic JSON files in `public/content/`
- Produces `content-manifest.json` for navigation and `search-index.json` for full-text search
- Generates `sitemap.xml` for SEO
- Post-build: generates static HTML with meta tags for all routes (SEO crawlability)

## Adding Content

1. Create a topic directory: `content/{category}/{topic-name}/`
2. Create `index.md` with H1 title, description, and `## Learning Path` with numbered links
3. Create subtopic `.md` files following the mandatory structure: Quick Reference → When to Use → Code Examples → Architecture/Diagrams → Common Pitfalls → Real-World Use Cases → Interview Questions → Production Tips → Related Topics
4. Run `npm run build` to verify it appears in the manifest
5. Check the build log for any validation messages

## Project Structure

```
cs-reference-guide/
├── content/            # Markdown topic files (multi-page topics organized by category)
├── docs/               # Documentation (content-audit.md)
├── scripts/            # Build scripts (prerender.ts)
├── src/
│   ├── components/     # React components (content, interactive, layout, navigation, study)
│   ├── hooks/          # Custom hooks (useProgress, usePomodoro, useBookmarks, etc.)
│   ├── pages/          # Route-level page components (incl. CodingGuidePage)
│   ├── plugins/        # Vite content pipeline (vite-content-plugin, markdown-parser, content-validator, etc.)
│   ├── types/          # TypeScript interfaces
│   ├── utils/          # Utilities (storage with IndexedDB fallback, indexeddb-adapter, helpers)
│   └── workers/        # Web Workers (code-runner)
├── public/content/     # Generated JSON (build output)
└── vite.config.ts
```

## Storage Architecture

The app uses a three-tier persistence fallback:

1. **localStorage** (primary) — synchronous, namespaced with `csguide:` prefix
2. **IndexedDB** (fallback) — used when localStorage is unavailable (e.g., iOS Safari private browsing)
3. **In-memory Map** (final fallback) — when both are unavailable

The API remains synchronous for all consumers. IndexedDB data is hydrated into memory at init.

## License

Private
