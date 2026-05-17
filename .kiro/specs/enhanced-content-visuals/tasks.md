# Implementation Plan: Enhanced Content Visuals

## Overview

This plan implements rich visual content enhancements for the CS Reference Guide in incremental steps: first extending the type system, then the parser, then the renderer components, and finally the search indexer. Each step builds on the previous, with property-based tests validating parser correctness and unit tests covering component behavior.

## Tasks

- [x] 1. Extend ContentNode type system
  - [x] 1.1 Add new ContentNode variants and supporting interfaces
    - Add `CompareOption` and `PrereqLink` interfaces to `src/types/content.ts`
    - Add `interview`, `compare`, `prereq`, and `chart` variants to the `ContentNode` discriminated union
    - Export all new types from the barrel file
    - _Requirements: 10.1_

- [x] 2. Implement parser detection for new node types
  - [x] 2.1 Implement interview Q/A parsing in markdown-parser.ts
    - Track current H2 heading context in `buildSections`
    - When inside `## Interview Questions`, detect `**Q:` pattern lines paired with `A:` paragraphs
    - Emit `{ type: 'interview', question, answer }` nodes for matched pairs
    - Non-matching lines emit standard `paragraph` nodes
    - _Requirements: 6.1, 6.2, 6.8_

  - [ ]* 2.2 Write property test for interview Q/A parsing
    - **Property 1: Interview Q/A Parsing**
    - **Validates: Requirements 6.1, 6.2**
    - Test file: `src/plugins/__tests__/markdown-parser.pbt.test.ts`
    - Generate random question text, answer text, number of Q/A pairs, interspersed non-Q: lines
    - Verify interview nodes have correct question/answer separation; non-matching lines produce paragraphs

  - [x] 2.3 Implement comparison block parsing in markdown-parser.ts
    - Extend the blockquote `[!COMPARE]` detection branch
    - Parse title from first line after `[!COMPARE]`
    - Parse `### Option Name` sub-blocks with body, optional `Pros:` and `Cons:` lists
    - Emit `{ type: 'compare', title, options }` if 2–4 options; otherwise fall through to standard blockquote
    - _Requirements: 7.1, 7.4_

  - [ ]* 2.4 Write property test for comparison block parsing
    - **Property 2: Comparison Block Parsing with Option Count Validation**
    - **Validates: Requirements 7.1, 7.4**
    - Test file: `src/plugins/__tests__/markdown-parser.pbt.test.ts`
    - Generate random titles, option counts (0–6), option names, body content, pros/cons presence
    - Verify compare node emitted only for 2–4 options; otherwise standard blockquote

  - [x] 2.5 Implement prerequisite block parsing in markdown-parser.ts
    - Extend the blockquote `[!PREREQ]` detection branch
    - Parse markdown links from content lines (max 5 links)
    - Emit `{ type: 'prereq', links }` if at least one link found; otherwise standard blockquote
    - _Requirements: 8.1, 8.2_

  - [ ]* 2.6 Write property test for prerequisite block parsing
    - **Property 3: Prerequisite Block Parsing with Link Validation**
    - **Validates: Requirements 8.1, 8.2**
    - Test file: `src/plugins/__tests__/markdown-parser.pbt.test.ts`
    - Generate random link counts (0–7), display text, path strings, non-link text
    - Verify prereq node emitted only when ≥1 link present; max 5 links in output

  - [x] 2.7 Implement chart block parsing in markdown-parser.ts
    - Extend the `code` case for language `chart`
    - Parse JSON content; validate required fields (`type`, `data`, `xKey`)
    - Emit `{ type: 'chart', chartType, data, xKey, yKeys, title }` for valid config
    - Emit fallback `code` node for invalid JSON or missing fields (no exceptions thrown)
    - _Requirements: 9.1, 9.4, 9.5_

  - [ ]* 2.8 Write property test for chart block parsing
    - **Property 4: Chart Block Parsing with JSON Validation**
    - **Validates: Requirements 9.1, 9.4, 9.5**
    - Test file: `src/plugins/__tests__/markdown-parser.pbt.test.ts`
    - Generate valid/invalid JSON, present/missing fields, data array contents, chart types
    - Verify chart node emitted only for valid config; fallback for invalid; no exceptions

  - [ ]* 2.9 Write property test for unrecognized admonition fallback
    - **Property 7: Unrecognized Admonition Type Fallback**
    - **Validates: Requirements 10.4**
    - Test file: `src/plugins/__tests__/markdown-parser.pbt.test.ts`
    - Generate random uppercase type identifiers (not NOTE/WARNING/TIP/COMPARE/PREREQ)
    - Verify standard blockquote node produced without errors

  - [ ]* 2.10 Write property test for backward compatibility
    - **Property 8: Backward Compatibility — Existing Syntax Unchanged**
    - **Validates: Requirements 10.2, 10.6**
    - Test file: `src/plugins/__tests__/markdown-parser.pbt.test.ts`
    - Generate random markdown using only existing syntax patterns
    - Verify output identical to pre-enhancement parser (no new node types appear)

- [x] 3. Checkpoint - Parser implementation complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Enhance MermaidRenderer component
  - [x] 4.1 Add theme reactivity to MermaidRenderer
    - Subscribe to theme context (dark/light)
    - Re-initialize mermaid with appropriate theme on change
    - Cancel in-flight renders when theme changes mid-render
    - Re-render diagram within 1000ms of theme change
    - _Requirements: 1.5_

  - [x] 4.2 Add responsive SVG scaling and overflow handling to MermaidRenderer
    - Apply `width="100%"` and `preserveAspectRatio` to rendered SVG
    - Wrap in `max-width: 100%` container with `overflow-x: auto` for wide diagrams
    - Ensure diagrams at or below container width display without horizontal scrolling
    - _Requirements: 1.3, 1.4_

  - [ ]* 4.3 Write unit tests for MermaidRenderer enhancements
    - Test error display: syntax error shows message + source in `<pre>` block
    - Test timeout: shows timeout indication + raw source
    - Test theme reactivity: theme change triggers re-render
    - Test responsive SVG: rendered SVG has width="100%" and overflow wrapper
    - _Requirements: 1.1, 1.2, 1.3, 1.5_

- [x] 5. Enhance table rendering in ContentCard
  - [x] 5.1 Add enhanced table styling to ContentCard
    - Apply alternating row background colors (visible in both themes)
    - Apply bold styling to first column cells in body rows
    - Add horizontal scroll container for wide tables
    - Conditionally apply sticky header + max-height 400px container for tables with >5 rows
    - Preserve existing hover highlighting and border styling
    - Add CSS styles to `src/index.css`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 5.2 Write property test for table sticky header conditional
    - **Property 5: Table Sticky Header Conditional**
    - **Validates: Requirements 5.4**
    - Test file: `src/components/content/__tests__/ContentCard.pbt.test.ts`
    - Generate random row counts (1–20), column counts, cell content
    - Verify scrollable container with sticky header applied only when rows > 5

  - [ ]* 5.3 Write unit tests for enhanced table styling
    - Test alternating rows visible in both themes
    - Test bold first column
    - Test hover preserved
    - _Requirements: 5.1, 5.3, 5.5_

- [x] 6. Implement new React components
  - [x] 6.1 Create InterviewCard component
    - Create `src/components/content/InterviewCard.tsx`
    - Render question text always visible
    - "Show Answer" toggle button with 44x44px min touch target
    - Answer revealed/hidden with 300ms CSS transition (max-height)
    - Reset to collapsed on route change (via `useLocation` key)
    - Add styles to `src/index.css`
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 6.7_

  - [ ]* 6.2 Write unit tests for InterviewCard
    - Test default collapsed state
    - Test click reveals answer, click again hides
    - Test 44px touch target
    - Test route change resets to collapsed
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 6.7_

  - [x] 6.3 Create CompareCard component
    - Create `src/components/content/CompareCard.tsx`
    - Render title header
    - Grid layout: side-by-side columns on ≥768px, stacked on mobile
    - Each option in bordered card with header
    - Pros in green accent, cons in red accent
    - Add styles to `src/index.css`
    - _Requirements: 7.2, 7.3, 7.5, 7.6_

  - [ ]* 6.4 Write unit tests for CompareCard
    - Test side-by-side layout classes on desktop
    - Test stacked layout on mobile
    - Test pros green accent, cons red accent
    - _Requirements: 7.2, 7.3, 7.5_

  - [x] 6.5 Create PrereqBadges component
    - Create `src/components/content/PrereqBadges.tsx`
    - Horizontal flex row of pill-shaped badges
    - Each badge: icon + text, clickable via react-router `Link`
    - Path resolution: `./path.md` → `/topic/:category/:topic/:subtopic` route
    - WCAG AA contrast in both themes
    - Add styles to `src/index.css`
    - _Requirements: 8.3, 8.4, 8.5, 8.6_

  - [ ]* 6.6 Write unit tests for PrereqBadges
    - Test pill shape rendering, icon + text, correct href
    - Test WCAG AA contrast ratios in both themes
    - _Requirements: 8.4, 8.5, 8.6_

  - [x] 6.7 Create ChartRenderer component
    - Create `src/components/content/ChartRenderer.tsx`
    - Lazy-loaded with `React.lazy` + `Suspense` fallback
    - `ResponsiveContainer` with 16:9 aspect ratio
    - Line/Bar/Area chart based on `chartType`
    - Legend shown only when `yKeys.length > 1`
    - Labeled axes from `xKey` and `yKeys`
    - Theme-aware colors from CSS custom properties
    - Error states: invalid JSON, missing fields, empty data
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9_

  - [ ]* 6.8 Write unit tests for ChartRenderer
    - Test Line/Bar/Area each render correct Recharts component
    - Test legend shown for multi-series, hidden for single
    - Test empty data shows "No data available"
    - Test error states for invalid config
    - _Requirements: 9.2, 9.6, 9.7_

- [x] 7. Wire new components into ContentCard renderer
  - [x] 7.1 Add switch cases for new node types in ContentCard
    - Add `case 'interview':` rendering `<InterviewCard>`
    - Add `case 'compare':` rendering `<CompareCard>`
    - Add `case 'prereq':` rendering `<PrereqBadges>`
    - Add `case 'chart':` rendering lazy `<ChartRenderer>` wrapped in Suspense
    - _Requirements: 10.1_

- [x] 8. Checkpoint - Components and rendering complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Update search indexer for new node types
  - [x] 9.1 Add text extraction cases to search-indexer.ts
    - Add `case 'interview':` → return `${node.question} ${node.answer}`
    - Add `case 'compare':` → return title + option names + bodies + pros + cons
    - Add `case 'prereq':` → return link display texts joined
    - Add `case 'chart':` → return `node.title || ''`
    - _Requirements: 10.3_

  - [ ]* 9.2 Write property test for search index text extraction
    - **Property 6: Search Index Text Extraction for New Node Types**
    - **Validates: Requirements 10.3**
    - Test file: `src/plugins/__tests__/search-indexer.pbt.test.ts`
    - Generate random interview/compare/prereq/chart nodes with varying content
    - Verify non-empty string returned containing all user-visible text

- [x] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project uses React 18 + TypeScript + Vite with Vitest + fast-check for testing
- All styles go in `src/index.css` (centralized CSS approach)
- ChartRenderer reuses the existing Recharts dependency (already used by BigOChart)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "2.3", "2.5", "2.7"] },
    { "id": 2, "tasks": ["2.2", "2.4", "2.6", "2.8", "2.9", "2.10"] },
    { "id": 3, "tasks": ["4.1", "4.2", "5.1", "6.1", "6.3", "6.5", "6.7", "9.1"] },
    { "id": 4, "tasks": ["4.3", "5.2", "5.3", "6.2", "6.4", "6.6", "6.8", "9.2"] },
    { "id": 5, "tasks": ["7.1"] }
  ]
}
```
