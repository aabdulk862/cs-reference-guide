# CS Reference Guide

A comprehensive, interactive computer science reference guide built for senior-level software engineers preparing for interviews and deepening production knowledge. Browse structured topics across backend, frontend, infrastructure, algorithms, system design, and more — all in a fast, searchable single-page app.

## Features

- Full-text search powered by FlexSearch
- Interactive code playground with CodeMirror
- SQL playground using sql.js (SQLite in the browser via WASM)
- Big-O complexity charts with Recharts
- Mermaid diagram rendering
- LaTeX math rendering with KaTeX
- Pomodoro timer, daily goals, and study tracking
- Bookmarks and progress persistence via localStorage
- Dark/light theme toggle
- Offline-capable PWA

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

## Content Categories

| Category | Topics |
|----------|--------|
| Backend | Java, Spring Framework, Apache Kafka, RabbitMQ, MongoDB, SQL Performance, Maven, Gradle, MapStruct, Resilience4j, Security, Incident Response |
| Frontend | React, TypeScript, Angular, Next.js, JavaScript, HTML & CSS |
| Infrastructure | Docker, Kubernetes/EKS, AWS Services, CI/CD Pipelines, Linux Administration, Observability |
| Data Structures & Algorithms | Arrays, Lists, Maps, Sets, Trees, Tries, Graphs, Heaps, Queues, Ring Buffers, Big-O Notation |
| System Design | Design Patterns, Networking, Operating Systems, Distributed Systems |
| Interview Prep | Cracking the Coding Interview, Grokking Algorithms, Behavioral Prep |
| Git | Commands, Branching, Merge Conflicts, Pull Requests, .gitignore, Local vs Remote |

## Getting Started

### Prerequisites

- Node.js 18+
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

Compiles TypeScript, runs the content pipeline (markdown → JSON), and outputs to `dist/`.

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
content/*.md → exclusion filter → markdown parser → category resolver → JSON output
                                                                      → manifest
                                                                      → search index
```

- Scans `content/` directory recursively
- Parses markdown into structured sections (headings, code blocks, tables, diagrams, math, etc.)
- Generates per-topic JSON files in `public/content/`
- Produces `content-manifest.json` for navigation and `search-index.json` for full-text search

## Adding Content

1. Create a `.md` file in the appropriate `content/{category}/` directory
2. Use H1 for the topic title, H2 for major sections
3. Follow the mandatory section structure: Quick Reference → When to Use → Code Examples → Common Pitfalls → Real-World Use Cases → Interview Questions → Production Tips → Related Topics
4. Run `npm run build` to verify it appears in the manifest

## Project Structure

```
cs-reference-guide/
├── content/            # Markdown topic files (organized by category)
├── src/
│   ├── components/     # React components (content, interactive, layout, navigation, study)
│   ├── hooks/          # Custom hooks (useProgress, usePomodoro, useBookmarks, etc.)
│   ├── pages/          # Route-level page components
│   ├── plugins/        # Vite content pipeline (markdown-parser, vite-content-plugin)
│   ├── types/          # TypeScript interfaces
│   ├── utils/          # Utilities (storage, helpers)
│   └── workers/        # Web Workers (code-runner)
├── public/content/     # Generated JSON (build output)
└── vite.config.ts
```

## License

Private
