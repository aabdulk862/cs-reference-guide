# Content Pipeline Reference

inclusion: auto

## Purpose

This steering file documents the content pipeline architecture for the CS Reference Guide. Use this when modifying the Vite plugin, markdown parser, or category mappings.

## Pipeline Overview

```
content/{category}/{topic-dir}/index.md + subtopics.md
    → exclusion filter
    → multi-page topic detection (directories with index.md)
    → markdown parser
    → category resolver
    → JSON output (per-topic with subtopics)
    → content-manifest.json
    → search-index.json
    → sitemap.xml
```

## Key Files

| File | Purpose |
|------|---------|
| `src/plugins/vite-content-plugin.ts` | Orchestrator: scans, filters, detects multi-page topics, parses, generates output |
| `src/plugins/markdown-parser.ts` | Converts markdown AST to structured `ParsedContent` |
| `src/plugins/exclusion-filter.ts` | Determines which files to skip |
| `src/plugins/image-resolver.ts` | Resolves relative image paths |
| `src/plugins/plugin-utils.ts` | Shared utilities: `CATEGORY_MAPPINGS`, `resolveCategory()`, `slugify()`, `extractLearningPathOrder()` |
| `src/plugins/search-indexer.ts` | Builds FlexSearch documents from parsed content |
| `src/plugins/content-validator.ts` | Validates content structure and quality |
| `src/plugins/sitemap-generator.ts` | Generates sitemap.xml from manifest data |

## Content Directory

The pipeline scans ONLY from `cs-reference-guide/content/`. It does NOT scan workspace root directories.

## Content Architecture

ALL content is organized as **multi-page topics**. Each category contains one or more topic directories, each with an `index.md` and subtopic `.md` files:

```
content/{category}/{topic-name}/
├── index.md           # Topic overview with Learning Path links
├── subtopic-1.md      # Individual subtopic content
├── subtopic-2.md
└── ...
```

There are NO single-page (flat `.md` file) topics. Every topic is a directory with an `index.md`.

## CATEGORY_MAPPINGS

Defined in `src/plugins/plugin-utils.ts`. Maps directory patterns to sidebar categories:

```typescript
const CATEGORY_MAPPINGS: CategoryMapping[] = [
  { pattern: 'backend', category: 'Backend' },
  { pattern: 'frontend', category: 'Frontend' },
  { pattern: 'databases', category: 'Databases' },
  { pattern: 'infrastructure', category: 'Infrastructure' },
  { pattern: 'data-structures-and-algorithms', category: 'Data Structures & Algorithms' },
  { pattern: 'system-design', category: 'System Design' },
  { pattern: 'networking', category: 'Networking' },
  { pattern: 'operating-systems', category: 'Operating Systems' },
  { pattern: 'interview-prep', category: 'Interview Prep' },
  { pattern: 'git', category: 'Git' },
  { pattern: 'security', category: 'Security' },
  { pattern: 'testing', category: 'Testing' },
  { pattern: 'software-engineering', category: 'Software Engineering' },
];
```

When adding a new category:
1. Create the directory under `content/`
2. Add a mapping entry to `CATEGORY_MAPPINGS` in `src/plugins/plugin-utils.ts`
3. Create at least one topic subdirectory with `index.md`
4. Add the category ID to the appropriate group in `CATEGORY_GROUPS` (`src/components/navigation/Sidebar.tsx`)
5. The pipeline auto-discovers all multi-page topics in mapped directories

## Sidebar Organization

Categories are grouped in the sidebar via `CATEGORY_GROUPS` in `src/components/navigation/Sidebar.tsx`:

```typescript
const CATEGORY_GROUPS = [
  { label: 'Fundamentals', icon: '🧠', categoryIds: ['data-structures-algorithms', 'operating-systems', 'networking'] },
  { label: 'Server-Side', icon: '⚙️', categoryIds: ['backend', 'databases'] },
  { label: 'Client-Side', icon: '🎨', categoryIds: ['frontend'] },
  { label: 'Architecture', icon: '🏗️', categoryIds: ['system-design', 'software-engineering', 'security'] },
  { label: 'Infrastructure', icon: '🚀', categoryIds: ['infrastructure', 'git'] },
  { label: 'Quality', icon: '✅', categoryIds: ['testing'] },
  { label: 'Interview', icon: '🎯', categoryIds: ['interview-prep'] },
];
```

Note: `categoryIds` use the manifest IDs (slugified category names), not the directory names.

## Multi-Page Topic Detection

The `detectMultiPageTopics()` function:
1. Iterates each category directory
2. Finds subdirectories (not files) within each category
3. Checks if the subdirectory contains an `index.md`
4. If yes → treats it as a multi-page topic with subtopics
5. Collects all `.md` files in the directory (excluding `index.md`) as subtopics
6. Orders subtopics based on the Learning Path in `index.md` via `extractLearningPathOrder()`

## Subtopic Ordering

The `extractLearningPathOrder()` function (in `plugin-utils.ts`) parses the `index.md` for a numbered list under `## Learning Path` and extracts filenames from markdown links. Subtopics are displayed in this order in the sidebar.

## Exclusion Rules

Files excluded from processing:
- `*.tex` files
- `*.css` files
- Files in `public/` directory
- Files in dot-prefixed directories (`.kiro/`, `.git/`, etc.)
- Files matching `*Scope Document*`

## Markdown Parser Behavior

### Heading Handling
- First H1 → topic title
- Subsequent H1s → treated as H2-level sections (multi-chapter files)
- H2 → top-level sections
- H3+ → subsections within the parent H2

### No-H2 Files
If a file has H1 + body content but no H2 headings, the parser creates an implicit section containing all body content.

### Content Nodes

The parser produces these node types:
- `paragraph` — prose text
- `code` — fenced code block with language
- `image` — resolved image reference
- `math` — LaTeX (inline or block)
- `list` — ordered or unordered
- `table` — headers + rows
- `blockquote` — quoted text
- `interactive` — special interactive component marker
- `mermaid` — Mermaid diagram source
- `admonition` — callout block (NOTE, WARNING, TIP)
- `task-list` — checkbox list items
- `unparseable` — fallback for broken syntax

### ID Generation
Topic IDs incorporate parent directory context to avoid collisions:
- `slugify(parentDirName + '-' + title)` for generic titles
- `slugify(title)` for unique titles

## Build Output

Generated files in `public/content/`:
- `content-manifest.json` — category/topic index with metadata (includes subtopics array)
- `search-index.json` — FlexSearch serialized index
- `sitemap.xml` — SEO sitemap
- `{category}/{topic}.json` — per-topic structured content with subtopic data

## Manifest Schema

```json
{
  "categories": [{
    "id": "backend",
    "name": "Backend",
    "topics": [{
      "id": "api-design",
      "slug": "backend/api-design",
      "title": "API Design",
      "source": "parsed",
      "sectionCount": 7,
      "wordCount": 2500,
      "contentPath": "/content/backend/api-design.json",
      "subtopics": [
        { "id": "rest-api-design", "slug": "rest-api-design", "title": "REST API Design", "wordCount": 3000 },
        { "id": "graphql", "slug": "graphql", "title": "GraphQL", "wordCount": 2800 },
        { "id": "grpc", "slug": "grpc", "title": "gRPC", "wordCount": 2600 }
      ]
    }]
  }],
  "totalTopics": 46,
  "totalSections": 2508,
  "buildTimestamp": "2025-05-16T10:00:00Z"
}
```

## Adding New Content

1. Create a topic directory: `content/{category}/{topic-name}/`
2. Create `index.md` with H1 title, description, and `## Learning Path` with numbered links
3. Create subtopic `.md` files following the content-authoring steering file
4. Run `npm run build` to verify it appears in the manifest
5. Check the build log for any warnings about missing sections or low word count
