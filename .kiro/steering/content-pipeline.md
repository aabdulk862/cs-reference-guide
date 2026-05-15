# Content Pipeline Reference

inclusion: auto

## Purpose

This steering file documents the content pipeline architecture for the CS Reference Guide. Use this when modifying the Vite plugin, markdown parser, or category mappings.

## Pipeline Overview

```
content/*.md → exclusion filter → markdown parser → category resolver → JSON output
                                                                      → manifest
                                                                      → search index
```

## Key Files

| File | Purpose |
|------|---------|
| `src/plugins/vite-content-plugin.ts` | Orchestrator: scans, filters, parses, generates output |
| `src/plugins/markdown-parser.ts` | Converts markdown AST to structured `ParsedContent` |
| `src/plugins/exclusion-filter.ts` | Determines which files to skip |
| `src/plugins/image-resolver.ts` | Resolves relative image paths |

## Content Directory

The pipeline scans ONLY from `cs-reference-guide/content/`. It does NOT scan workspace root directories.

## CATEGORY_MAPPINGS

Maps directory patterns to sidebar categories:

```typescript
const CATEGORY_MAPPINGS = [
  { pattern: 'content/backend', category: 'Backend' },
  { pattern: 'content/frontend', category: 'Frontend' },
  { pattern: 'content/infrastructure', category: 'Infrastructure' },
  { pattern: 'content/data-structures-and-algorithms', category: 'Data Structures & Algorithms' },
  { pattern: 'content/system-design', category: 'System Design' },
  { pattern: 'content/interview-prep', category: 'Interview Prep' },
  { pattern: 'content/git', category: 'Git' },
];
```

When adding a new category:
1. Create the directory under `content/`
2. Add a mapping entry to `CATEGORY_MAPPINGS`
3. The pipeline auto-discovers all .md files in mapped directories

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
- `content-manifest.json` — category/topic index with metadata
- `search-index.json` — FlexSearch serialized index
- `{category}/{topic}.json` — per-topic structured content

## Manifest Schema

```json
{
  "categories": [{
    "id": "backend",
    "name": "Backend",
    "topics": [{
      "id": "docker-containerization",
      "slug": "backend/docker-containerization",
      "title": "Docker & Containerization",
      "sectionCount": 7,
      "wordCount": 2500,
      "contentPath": "/content/backend/docker-containerization.json"
    }]
  }],
  "totalTopics": 50,
  "totalSections": 300,
  "buildTimestamp": "2025-01-15T10:00:00Z"
}
```

## Adding New Content

1. Create `.md` file in the appropriate `content/{category}/` directory
2. Use H1 for title, H2 for sections
3. Follow the content-authoring steering file for structure
4. Run `npm run build` to verify it appears in the manifest
5. Check the build log for any warnings about missing sections or low word count
