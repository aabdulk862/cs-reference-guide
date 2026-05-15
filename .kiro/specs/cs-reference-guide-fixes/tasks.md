# Implementation Plan

## Overview

This task list implements fixes for 17 defects across 7 clusters in the CS Reference Guide app. The workflow follows the exploratory bugfix methodology: write tests to confirm bugs exist, write preservation tests to capture baseline behavior, implement fixes, then verify all tests pass.

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Content Pipeline Defects (Duplicate IDs, No-H2 Loss, Multi-H1 Loss, markdowns/ Unmapped)
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bugs exist
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the content pipeline bugs exist
  - **Scoped PBT Approach**: Use fast-check to generate markdown inputs that trigger each bug condition
  - Test file: `src/plugins/__tests__/markdown-parser.bugfix.test.ts`
  - **Bug Condition 1 - Duplicate IDs**: Call `parseMarkdown` on two markdown strings with identical H1 titles (e.g., "# Summary") and assert the generated IDs are different when parent directory context differs
  - **Bug Condition 2 - No-H2 Loss**: Call `parseMarkdown` on markdown with only `# Title` followed by body paragraphs (no H2 headings) and assert `result.metadata.sectionCount >= 1` and `result.metadata.wordCount > 0`
  - **Bug Condition 3 - Multi-H1 Loss**: Call `parseMarkdown` on markdown with multiple H1 headings (e.g., `# Chapter 1: Intro\ncontent\n# Chapter 2: Basics\ncontent`) and assert `result.sections.length >= numberOfH1s - 1` (all chapters after first become sections)
  - **Bug Condition 4 - markdowns/ Unmapped**: Call `resolveCategory('markdowns/Grokking Algorithms/file.md')` and assert it returns `'Algorithms'` (not null)
  - **Bug Condition 5 - Sidebar Link Mismatch**: Assert that sidebar link paths use `topic.slug` (matching contentPath) rather than `topic.id` when they differ
  - Use `fc.string()` and `fc.array()` to generate varied markdown content for property assertions
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bugs exist)
  - Document counterexamples found (e.g., `parseMarkdown("# Title\nSome content", path, cat)` returns `{ sections: [], sectionCount: 0 }`)
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.10, 1.11, 1.13, 1.14, 1.15_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Well-Formed Markdown Parsing and Category Resolution Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Test file: `src/plugins/__tests__/markdown-parser.preservation.test.ts`
  - **Observation Phase**:
  - Observe: `parseMarkdown("# Title\n## Section 1\nContent\n## Section 2\nMore", path, "Data Structures")` produces structured output with 2 sections on unfixed code
  - Observe: `resolveCategory("Infosys/Java/Basics.md")` returns `"Java"` on unfixed code
  - Observe: `resolveCategory("Data Structures and Algorithms/Array.md")` returns `"Data Structures"` on unfixed code
  - Observe: `shouldExclude("file.tex")` returns `true` on unfixed code
  - Observe: `shouldExclude("public/index.html")` returns `true` on unfixed code
  - Observe: `shouldExclude(".hidden/file.md")` returns `true` on unfixed code
  - **Property-Based Tests**:
  - Write PBT: for all well-formed markdown (single H1 + N H2 sections with unique titles within category), `parseMarkdown` produces `sectionCount === N` and preserves title, section headings, and word counts
  - Write PBT: for all paths matching existing `CATEGORY_MAPPINGS` patterns (Infosys/Java/*, Data Structures and Algorithms/*, Git/*), `resolveCategory` returns the expected category string
  - Write PBT: for all paths ending in `.tex`, `.css`, starting with `public/`, or containing dot-prefixed directories, `shouldExclude` returns `true`
  - Write PBT: for all non-interactive `ContentNode` types (paragraph, code, table, math, image, list, blockquote), `renderContentNode` produces the same JSX output
  - Verify all tests pass on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.4, 3.6, 3.7, 3.8, 3.9, 3.10_

- [x] 3. Fix Cluster 1: Test Environment Fix

  - [x] 3.1 Add localStorage mock to test setup
    - Edit `src/test/setup.ts` to add a proper `Storage` mock or configure jsdom localStorage availability
    - Add `beforeEach(() => localStorage.clear())` to ensure clean state between tests
    - Verify all 19 storage tests in `src/utils/storage.test.ts` pass
    - _Bug_Condition: isBugCondition(input) where input.type == "test" AND input.file == "storage.test.ts"_
    - _Expected_Behavior: All storage tests pass without TypeError on localStorage.clear()_
    - _Preservation: Non-storage tests continue to pass unchanged_
    - _Requirements: 1.1, 2.1_

- [x] 4. Fix Cluster 2: Dashboard Completion

  - [x] 4.1 Integrate study components into Dashboard
    - Import `WeeklyStats`, `DueForReview`, `DailyGoal`, `PomodoroTimer`, `ResumePrompt` from `@/components/study/`
    - Add progress overview section: fetch content-manifest.json and calculate topics completed / total
    - Compose full dashboard layout with grid/flex sections for each widget
    - Maintain existing BookmarksList component
    - _Bug_Condition: isBugCondition(input) where input.type == "page" AND input.route == "/" AND input.expectsStudyDashboard_
    - _Expected_Behavior: Dashboard displays progress overview, WeeklyStats, DueForReview, DailyGoal, PomodoroTimer, ResumePrompt, and Bookmarks_
    - _Preservation: Existing bookmarks functionality unchanged_
    - _Requirements: 1.2, 2.2_

- [x] 5. Fix Cluster 3: CSS for Unstyled Components

  - [x] 5.1 Add SearchBar CSS styles
    - Add CSS rules to `src/index.css` for `.search-bar`, `.search-input-wrapper`, `.search-input`, `.search-icon`, `.search-results-dropdown`, `.search-results-list`, `.search-result-item`, `.search-result-item--selected`, `.search-highlight`, `.search-no-results`
    - Style consistently with dark theme design system (backgrounds, borders, focus states)
    - _Requirements: 1.3, 2.3_

  - [x] 5.2 Add TopicPage CSS styles
    - Add CSS rules to `src/index.css` for `.page-topic`, `.topic-progress`, `.topic-progress__bar`, `.topic-progress__fill`, `.topic-progress__label`, `.topic-content-sections`, `.tracked-content-card`
    - Include progress bar fill animation and appropriate spacing
    - _Requirements: 1.4, 2.4_

  - [x] 5.3 Add ViewToggle CSS styles
    - Add CSS rules for `.view-toggle`, `.view-toggle-btn`, `.view-toggle-btn--active`
    - Provide clear selected/unselected states with distinct visual feedback
    - _Requirements: 1.5, 2.5_

  - [x] 5.4 Add Breadcrumbs CSS styles
    - Add CSS rules for `.breadcrumbs`, `.breadcrumb-list`, `.breadcrumb-item`, `.breadcrumb-link`, `.breadcrumb-current`, `.breadcrumb-separator`
    - Style with clickable links and visual separators (e.g., ">")
    - _Requirements: 1.6, 2.6_

  - [x] 5.5 Add Sidebar quick links CSS styles
    - Add CSS rules for `.sidebar-quick-links`, `.sidebar-quick-link`
    - Include hover/focus states and visual separation from category tree (border or spacing)
    - _Requirements: 1.7, 2.7_

  - [x] 5.6 Add AllCheatSheets page CSS styles
    - Add CSS rules for `.all-cheat-sheets`, `.all-cheat-sheets__header`, `.all-cheat-sheets__title`, `.all-cheat-sheets__subtitle`, `.all-cheat-sheets__search`, `.all-cheat-sheets__search-input`, `.all-cheat-sheets__result-count`, `.all-cheat-sheets__groups`, `.all-cheat-sheets__category`, `.all-cheat-sheets__category-heading`, `.all-cheat-sheets__grid`, `.all-cheat-sheets__card`, `.all-cheat-sheets__card-title`, `.all-cheat-sheets__card-meta`, `.all-cheat-sheets__card-summary`, `.all-cheat-sheets__empty`
    - Use responsive grid layout for cards, consistent with app design system
    - _Requirements: 1.12, 2.12_

- [x] 6. Fix Cluster 4: Interactive Component Integration

  - [x] 6.1 Replace interactive placeholders in ContentCard
    - Import (lazy) `BigOChart`, `CodePlayground`, `DSVisualization`, `Quiz`, `SQLPlayground` from `@/components/interactive/`
    - In the `'interactive'` case of `renderContentNode`, map `node.interactiveType` to the corresponding component
    - Wrap in `<Suspense>` with a loading fallback
    - Remove the placeholder `<p>` text
    - _Bug_Condition: isBugCondition(input) where input.type == "render" AND input.component == "ContentCard" AND input.node.type == "interactive"_
    - _Expected_Behavior: Renders BigOChart for "bigo-chart", CodePlayground for "playground", DSVisualization for "visualization", Quiz for "quiz", SQLPlayground for "sql-playground"_
    - _Preservation: Non-interactive ContentCard nodes (paragraph, code, table, math, image, list, blockquote) render identically_
    - _Requirements: 1.8, 2.8_

- [x] 7. Fix Cluster 5: Theme Toggle

  - [x] 7.1 Create ThemeToggle component
    - Create `src/components/layout/ThemeToggle.tsx`
    - Read/write theme preference to localStorage via storage utility (`csguide:theme`)
    - Toggle `data-theme="light"` or `data-theme="dark"` attribute on `<html>` element
    - Default to system preference via `prefers-color-scheme` media query, then respect stored preference
    - Render a button with sun/moon icon indicating current mode
    - _Requirements: 1.9, 2.9_

  - [x] 7.2 Add light theme CSS variables
    - Add `:root[data-theme="light"]` block in `src/index.css` with light-mode colors
    - Light backgrounds (#ffffff, #f5f5f5), dark text (#1a1a1a, #333), adjusted borders and shadows
    - Ensure all existing component styles adapt via CSS custom properties
    - _Requirements: 1.9, 2.9_

  - [x] 7.3 Integrate ThemeToggle in Header
    - Import `ThemeToggle` in `src/components/layout/Header.tsx`
    - Add ThemeToggle button in the `header-right` section alongside SearchBar and command palette trigger
    - _Requirements: 1.9, 2.9_

- [x] 8. Fix Cluster 6: Content Pipeline Fixes

  - [x] 8.1 Fix duplicate topic ID generation
    - Modify `parseMarkdown` in `src/plugins/markdown-parser.ts` to accept an optional `parentDir` or `filePath` context parameter
    - Generate unique IDs by incorporating parent directory name when title alone would produce a generic slug (e.g., `slugify(parentDirName + '-' + title)`)
    - Update `vite-content-plugin.ts` to pass file path context to `parseMarkdown`
    - Detect and disambiguate duplicate `topic.id` values within a category in the manifest builder
    - _Bug_Condition: isBugCondition(input) where input.type == "content" AND input.hasDuplicateH1WithinCategory_
    - _Expected_Behavior: Each topic within a category has a unique ID incorporating directory context_
    - _Preservation: Well-formed files with unique titles continue to produce the same IDs_
    - _Requirements: 1.10, 2.10_

  - [x] 8.2 Handle no-H2 markdown files (implicit section)
    - In `buildSections()` in `src/plugins/markdown-parser.ts`, track content nodes that appear after H1 but before any H2
    - After processing all nodes, if `topSections` is empty but content was found, create an implicit section: `{ id: 'content', heading: title, level: 2, content: collectedNodes }`
    - Ensure `sectionCount >= 1` and `wordCount > 0` for files with content
    - _Bug_Condition: isBugCondition(input) where input.type == "content" AND input.hasNoH2Headings_
    - _Expected_Behavior: Topic has at least 1 section with non-zero word count when content exists below H1_
    - _Preservation: Files with H2 headings continue to parse identically_
    - _Requirements: 1.11, 2.11_

  - [x] 8.3 Handle multi-H1 markdown as chapter sections
    - In `buildSections()` in `src/plugins/markdown-parser.ts`, track whether the first H1 has been seen
    - For subsequent H1 headings (not the first), treat them as H2-level section boundaries: create a top-level section with `level: 2` and the H1 heading text
    - Ensure all content following each subsequent H1 is captured in that section
    - _Bug_Condition: isBugCondition(input) where input.type == "content" AND input.hasMultipleH1AsChapters_
    - _Expected_Behavior: All H1 chapters after the first appear as top-level sections with their content preserved_
    - _Preservation: Single-H1 files continue to parse identically_
    - _Requirements: 1.15, 2.15_

  - [x] 8.4 Add markdowns/ directory category mappings
    - Add entries to `CATEGORY_MAPPINGS` in `src/plugins/vite-content-plugin.ts`:
      - `{ pattern: 'markdowns/Grokking Algorithms', category: 'Algorithms' }`
      - `{ pattern: 'markdowns/Designing Data-Intensive Applications', category: 'System Design' }`
      - `{ pattern: 'markdowns/Cracking the Coding Interview', category: 'Interview Prep' }`
      - `{ pattern: 'markdowns/Data Structures and Algorithms', category: 'Data Structures' }`
      - `{ pattern: 'markdowns/Data Structures Methods', category: 'Data Structures' }`
      - `{ pattern: 'markdowns/Git', category: 'Git' }`
      - `{ pattern: 'markdowns/Practice Learning', category: 'Interview Prep' }`
      - `{ pattern: 'markdowns/Solved Problems', category: 'Interview Prep' }`
      - `{ pattern: 'markdowns/Projects', category: 'Interview Prep' }`
    - _Bug_Condition: isBugCondition(input) where input.type == "content" AND input.sourceDir == "markdowns/"_
    - _Expected_Behavior: resolveCategory returns correct category for all markdowns/ paths_
    - _Preservation: Existing CATEGORY_MAPPINGS for non-markdowns/ paths unchanged_
    - _Requirements: 1.14, 1.16, 2.14, 2.16_

  - [x] 8.5 Fill empty DDIA chapter stubs (Chapters 3–12)
    - Edit `markdowns/Designing Data-Intensive Applications.md`
    - Add comprehensive summary content for each empty chapter stub:
      - Chapter 3: Storage and Retrieval (LSM-trees, B-trees, column storage)
      - Chapter 4: Encoding and Evolution (Thrift, Protobuf, Avro, schema evolution)
      - Chapter 5: Replication (leader-follower, multi-leader, leaderless)
      - Chapter 6: Partitioning (key-range, hash, secondary indexes)
      - Chapter 7: Transactions (ACID, isolation levels, serializability)
      - Chapter 8: The Trouble with Distributed Systems (faults, unreliable networks/clocks)
      - Chapter 9: Consistency and Consensus (linearizability, total order broadcast, Raft/Paxos)
      - Chapter 10: Batch Processing (MapReduce, dataflow engines, Spark)
      - Chapter 11: Stream Processing (message brokers, event sourcing, stream joins)
      - Chapter 12: The Future of Data Systems (data integration, unbundling, correctness)
    - _Bug_Condition: isBugCondition(input) where DDIA chapters 3-12 are empty stubs_
    - _Expected_Behavior: Each chapter has substantive content covering key concepts_
    - _Requirements: 1.17, 2.17_

- [x] 9. Fix Cluster 7: Sidebar Link Consistency

  - [x] 9.1 Fix sidebar link path generation
    - In `src/components/navigation/Sidebar.tsx`, change the Link `to` prop from `/topic/${category.id}/${topic.id}` to use the topic slug that matches the content JSON path
    - Extract topicSlug from `topic.contentPath` (e.g., `/content/data-structures/array.json` → `array`) or from `topic.slug.split('/')[1]`
    - Use: `to={/topic/${category.id}/${topicSlug}}`
    - _Bug_Condition: isBugCondition(input) where input.type == "navigation" AND input.sidebarLinkPath != input.contentJsonPath_
    - _Expected_Behavior: Sidebar link href matches the content JSON path pattern so TopicPage can fetch correctly_
    - _Preservation: Sidebar categories, visited indicators, active states, and collapsible behavior unchanged_
    - _Requirements: 1.13, 2.13_

- [x] 10. Verify bug condition exploration test now passes

  - [x] 10.1 Re-run bug condition exploration test
    - **Property 1: Expected Behavior** - Content Pipeline Produces Correct Output After Fix
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior for all bug conditions
    - When this test passes, it confirms:
      - Duplicate IDs are disambiguated
      - No-H2 files produce non-zero sections
      - Multi-H1 files capture all chapters as sections
      - markdowns/ paths resolve to correct categories
      - Sidebar links match content paths
    - Run: `npx vitest run src/plugins/__tests__/markdown-parser.bugfix.test.ts`
    - **EXPECTED OUTCOME**: Test PASSES (confirms bugs are fixed)
    - _Requirements: 2.10, 2.11, 2.13, 2.14, 2.15_

  - [x] 10.2 Verify preservation tests still pass
    - **Property 2: Preservation** - Well-Formed Markdown Parsing Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run: `npx vitest run src/plugins/__tests__/markdown-parser.preservation.test.ts`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm well-formed markdown parsing, category resolution, exclusion filters, and ContentCard rendering are all unchanged
    - _Requirements: 3.1, 3.4, 3.6, 3.7, 3.8, 3.9, 3.10_

- [x] 11. Checkpoint - Ensure all tests pass
  - Run full test suite: `npx vitest run`
  - Verify all storage tests pass (Cluster 1 fix)
  - Verify exploration tests pass (content pipeline fixes)
  - Verify preservation tests pass (no regressions)
  - Run build to verify content pipeline generates correct manifest: `npm run build`
  - Verify no TypeScript errors: `npx tsc --noEmit`
  - Ask the user if questions arise

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1", "2"],
      "description": "Write exploration and preservation tests BEFORE implementing fixes"
    },
    {
      "wave": 2,
      "tasks": ["3", "4", "5", "6", "7", "8", "9"],
      "description": "Implement all 7 fix clusters (can be done in parallel)"
    },
    {
      "wave": 3,
      "tasks": ["10"],
      "description": "Verify exploration and preservation tests pass after fixes"
    },
    {
      "wave": 4,
      "tasks": ["11"],
      "description": "Final checkpoint - full test suite, build, and type check"
    }
  ]
}
```

## Notes

- The app uses React 18.3, TypeScript 5.6, Vite 5.4, react-router-dom 6.28, vitest, testing-library, and fast-check for PBT
- Test commands: `npx vitest run` (full suite), `npx vitest run <path>` (specific file)
- Build command: `npm run build` (runs tsc then vite build, which triggers the content plugin)
- The content pipeline runs at build time via `vite-content-plugin.ts` and generates JSON in `public/content/`
- CSS is centralized in `src/index.css` — all new styles go there
- Interactive components exist in `src/components/interactive/` but are not imported by ContentCard
- Study components exist in `src/components/study/` but are not imported by Dashboard
