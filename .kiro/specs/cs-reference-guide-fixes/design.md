# CS Reference Guide Multi-Defect Bugfix Design

## Overview

The CS Reference Guide app has 17 defects spanning broken tests, missing styles, incomplete pages, unintegrated components, content pipeline issues, and missing features. This design formalizes the bug conditions across all defect categories and defines a targeted fix strategy that addresses each issue while preserving existing working functionality. The defects are grouped into 7 logical clusters: test environment, dashboard completion, CSS styling, interactive component integration, theme toggle, content pipeline, and sidebar link consistency.

## Glossary

- **Bug_Condition (C)**: The set of conditions under which the app exhibits defective behavior — test crashes, unstyled components, placeholder content, missing features, or data loss in the content pipeline
- **Property (P)**: The desired correct behavior for each defect — tests pass, components render styled, interactive elements are functional, content is fully parsed
- **Preservation**: Existing working behaviors that must remain unchanged — AppShell layout, Command Palette, lazy-loading, ContentCard rendering of non-interactive nodes, SQL Playground, sidebar navigation, localStorage persistence, well-formed markdown parsing, exclusion filters, Infosys category mappings
- **parseMarkdown**: The function in `src/plugins/markdown-parser.ts` that converts raw markdown into structured `ParsedContent` objects using remark/unified AST processing
- **vite-content-plugin**: The Vite plugin in `src/plugins/vite-content-plugin.ts` that orchestrates content scanning, parsing, and manifest generation at build time
- **ContentCard**: The component in `src/components/content/ContentCard.tsx` that renders individual content sections with collapse/expand behavior
- **CATEGORY_MAPPINGS**: The array in `vite-content-plugin.ts` that maps repository directory patterns to category names for content organization

## Bug Details

### Bug Condition

The bugs manifest across 7 categories affecting the app's core functionality as a study tool. The defects range from environment configuration issues to missing UI implementations to content pipeline data loss.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type AppState | TestExecution | RenderContext | ContentPipelineInput
  OUTPUT: boolean
  
  RETURN (input.type == "test" AND input.file == "storage.test.ts")
         OR (input.type == "page" AND input.route == "/" AND input.expectsStudyDashboard)
         OR (input.type == "render" AND input.component IN ["SearchBar", "TopicPage", "ViewToggle", "Breadcrumbs", "SidebarQuickLinks", "AllCheatSheets"] AND input.hasNoCSS)
         OR (input.type == "render" AND input.component == "ContentCard" AND input.node.type == "interactive")
         OR (input.type == "render" AND input.expectsThemeToggle AND NOT themeToggleExists())
         OR (input.type == "content" AND input.hasDuplicateH1WithinCategory)
         OR (input.type == "content" AND input.hasNoH2Headings)
         OR (input.type == "content" AND input.hasMultipleH1AsChapters)
         OR (input.type == "content" AND input.sourceDir == "markdowns/")
         OR (input.type == "navigation" AND input.sidebarLinkPath != input.contentJsonPath)
END FUNCTION
```

### Examples

- **Test crash**: Running `vitest run` on `storage.test.ts` throws `TypeError: Cannot read properties of undefined (reading 'clear')` because jsdom doesn't provide `localStorage` by default without proper configuration
- **Dashboard placeholder**: Navigating to `/` shows "Welcome to the CS Reference Guide. Your study dashboard will appear here." instead of progress charts, timers, and review lists
- **Unstyled SearchBar**: The search input in the header renders as a raw unstyled `<input>` with no visible icon, no dropdown styling, and no hover/focus states
- **Interactive placeholder**: A ContentCard with `node.type === 'interactive'` and `node.interactiveType === 'sql-playground'` shows text "Interactive: sql-playground" instead of the actual SQLPlayground component
- **Duplicate IDs**: Two files `Data Structures and Algorithms/Array.md` (title "Array") and a hypothetical `Data Structures and Algorithms/SubDir/Array.md` would both generate `id: "array"`, causing data collision
- **No-H2 content loss**: A markdown file with only `# Title` and body text (no `## Section` headings) produces `{ sections: [], metadata: { sectionCount: 0, wordCount: 0 } }` — content is invisible
- **Multi-H1 loss**: `Grokking Algorithms.md` uses `# Chapter 1: ...`, `# Chapter 2: ...` etc. — only the first H1 becomes the title, subsequent H1s and their content are lost
- **markdowns/ ignored**: Files in `/markdowns/` directory have no `CATEGORY_MAPPINGS` entry, so `resolveCategory()` returns `null` and they are skipped entirely
- **Sidebar link mismatch**: Sidebar generates links as `/topic/${category.id}/${topic.id}` but TopicPage fetches `/content/${categorySlug}/${topicSlug}.json` — when `topic.id` differs from the file slug used in `contentPath`, navigation fails

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- AppShell layout (sticky header, 260px sidebar, scrollable main) must continue rendering correctly
- Command Palette (Ctrl+K / Cmd+K) overlay with search, results, and keyboard navigation must work
- Lazy-loaded page components with loading fallback spinner must continue functioning
- ContentCard rendering of paragraph, code, table, math, image, list, blockquote nodes must retain existing styles
- SQL Playground direct usage must continue executing queries with existing styling
- Sidebar collapsible categories with topic links, active states, and visited indicators must work
- localStorage persistence with `csguide:` namespace prefix must continue for bookmarks, progress, nav state
- Well-formed markdown files (H1 title + H2 sections, unique titles) must continue parsing correctly
- Exclusion filter for .tex, .css, public/, dot-prefixed directories must continue working
- Infosys/ subdirectory category mappings (Java, Spring, Maven, Gradle, MongoDB, Kafka, AI) must remain correct

**Scope:**
All inputs that do NOT trigger any of the 17 bug conditions should be completely unaffected by these fixes. This includes:
- Non-storage test files
- Pages other than Dashboard (NotFound, TopicPage with existing content)
- Components that already have CSS (CommandPalette, ContentCard body, Sidebar categories)
- ContentCard nodes that are not of type "interactive"
- Content pipeline processing of well-formed single-H1 markdown files with H2 sections
- Sidebar links that already match their content paths

## Hypothesized Root Cause

Based on the bug analysis, the root causes are:

1. **Test Environment (1.1)**: The `src/test/setup.ts` only imports `@testing-library/jest-dom` but does not configure localStorage availability. While vitest with jsdom environment should provide localStorage, the setup may need an explicit `Storage` mock or the vitest config may need `environmentOptions` for jsdom to enable storage.

2. **Dashboard Incompleteness (1.2)**: The Dashboard component was implemented as a placeholder with only a bookmarks list. The study components (`WeeklyStats`, `DueForReview`, `DailyGoal`, `PomodoroTimer`, `ResumePrompt`) exist in `src/components/study/` but are never imported or rendered in Dashboard.

3. **Missing CSS (1.3–1.7, 1.12)**: Six components have JSX with class names but no corresponding CSS rules in `src/index.css` or any component-level stylesheet. The classes `.search-bar`, `.page-topic`, `.view-toggle`, `.breadcrumbs`, `.sidebar-quick-links`, and `.all-cheat-sheets` have zero CSS definitions.

4. **Interactive Placeholder (1.8)**: The `renderContentNode` function in `ContentCard.tsx` handles the `'interactive'` case by rendering a `<p>` placeholder instead of importing and rendering the actual components (`BigOChart`, `CodePlayground`, `DSVisualization`, `Quiz`, `SQLPlayground`).

5. **No Theme Toggle (1.9)**: No theme toggle component exists. The app hardcodes dark mode via `:root` CSS variables with no mechanism to switch to light mode.

6. **Duplicate Topic IDs (1.10)**: In `markdown-parser.ts`, the `id` is derived solely from `slugify(title)`. When multiple files in the same category share a title (e.g., "Summary"), they produce identical IDs and the last one overwrites earlier entries in the manifest.

7. **No-H2 Content Loss (1.11)**: In `buildSections()`, content nodes are only added to a section when `stack.length > 0`. If no H2 heading exists, the stack is never populated, so all content after H1 is silently dropped.

8. **Multi-H1 Loss (1.15)**: In `buildSections()`, when `level === 1`, the code sets `title = headingText` and `continue`s — it doesn't create a section. Subsequent H1s overwrite the title variable and their following content (before the next heading) is dropped because the stack is empty after each H1.

9. **markdowns/ Not Mapped (1.14, 1.16)**: The `CATEGORY_MAPPINGS` array has no entries for the `markdowns/` directory prefix. Since `resolveCategory()` returns `null` for these paths, all files in `markdowns/` are skipped.

10. **Sidebar Link Mismatch (1.13)**: The Sidebar generates links as `/topic/${category.id}/${topic.id}` but the manifest stores `topic.slug` as `${categorySlug}/${topicSlug}`. The TopicPage uses `useParams` to get `categorySlug` and `topicSlug` and fetches `/content/${categorySlug}/${topicSlug}.json`. If `topic.id` (derived from title slug) differs from the actual file slug used in `contentPath`, the fetch fails.

11. **Empty Chapter Stubs (1.17)**: The Designing Data-Intensive Applications markdown has chapters 3–12 as empty `# Chapter N:` headings with no content below them, resulting in empty or missing sections.

## Correctness Properties

Property 1: Bug Condition - All 17 Defects Produce Correct Behavior After Fix

_For any_ input where any of the 17 bug conditions holds (test environment missing localStorage, Dashboard missing study components, components missing CSS, interactive nodes showing placeholders, no theme toggle, duplicate IDs, no-H2 content loss, multi-H1 loss, markdowns/ unmapped, sidebar link mismatch, empty chapter stubs), the fixed application SHALL produce the expected correct behavior as specified in requirements 2.1–2.17.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.14, 2.15, 2.16, 2.17**

Property 2: Preservation - Existing Functionality Unchanged

_For any_ input where none of the 17 bug conditions hold (well-formed markdown with unique titles and H2 sections, non-interactive ContentCard nodes, pages with existing CSS, non-storage tests, sidebar links that already match content paths), the fixed application SHALL produce exactly the same behavior as the original application, preserving layout, navigation, content rendering, persistence, and content pipeline correctness.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10**

## Fix Implementation

### Changes Required

#### Cluster 1: Test Environment Fix

**File**: `src/test/setup.ts`

**Specific Changes**:
1. **Add localStorage mock**: Add a `Storage` class implementation or configure jsdom's `storageQuota` option. Since vitest with `environment: 'jsdom'` should provide localStorage, verify the issue is that `localStorage.clear()` is called before the mock is ready. Add explicit `beforeEach` cleanup or ensure the jsdom environment is properly configured with `globals: true`.

#### Cluster 2: Dashboard Completion

**File**: `src/pages/Dashboard.tsx`

**Specific Changes**:
1. **Import study components**: Import `WeeklyStats`, `DueForReview`, `DailyGoal`, `PomodoroTimer`, `ResumePrompt` from `@/components/study/`
2. **Add progress overview**: Calculate topics completed vs total from the content manifest and display as a summary stat
3. **Compose full dashboard layout**: Render all study components in a grid/flex layout with appropriate sections and headings
4. **Maintain bookmarks section**: Keep the existing BookmarksList component in place

#### Cluster 3: CSS for Unstyled Components

**File**: `src/index.css`

**Specific Changes**:
1. **SearchBar styles**: Add CSS for `.search-bar`, `.search-input-wrapper`, `.search-input`, `.search-icon`, `.search-results-dropdown`, `.search-results-list`, `.search-result-item`, `.search-result-item--selected`, `.search-highlight`, `.search-no-results` — styled consistently with the dark theme design system
2. **TopicPage styles**: Add CSS for `.page-topic`, `.topic-progress`, `.topic-progress__bar`, `.topic-progress__fill`, `.topic-progress__label`, `.topic-content-sections`, `.tracked-content-card`
3. **ViewToggle styles**: Add CSS for `.view-toggle`, `.view-toggle-btn`, `.view-toggle-btn--active` with clear selected/unselected states
4. **Breadcrumbs styles**: Add CSS for `.breadcrumbs`, `.breadcrumb-list`, `.breadcrumb-item`, `.breadcrumb-link`, `.breadcrumb-current`, `.breadcrumb-separator`
5. **Sidebar quick links styles**: Add CSS for `.sidebar-quick-links`, `.sidebar-quick-link` with hover/focus states and visual separation from category tree
6. **AllCheatSheets styles**: Add CSS for `.all-cheat-sheets`, `.all-cheat-sheets__header`, `.all-cheat-sheets__title`, `.all-cheat-sheets__subtitle`, `.all-cheat-sheets__search`, `.all-cheat-sheets__search-input`, `.all-cheat-sheets__result-count`, `.all-cheat-sheets__groups`, `.all-cheat-sheets__category`, `.all-cheat-sheets__category-heading`, `.all-cheat-sheets__grid`, `.all-cheat-sheets__card`, `.all-cheat-sheets__card-title`, `.all-cheat-sheets__card-meta`, `.all-cheat-sheets__card-summary`, `.all-cheat-sheets__empty`

#### Cluster 4: Interactive Component Integration

**File**: `src/components/content/ContentCard.tsx`

**Specific Changes**:
1. **Import interactive components**: Add lazy imports for `BigOChart`, `CodePlayground`, `DSVisualization`, `Quiz`, `SQLPlayground` from `@/components/interactive/`
2. **Replace placeholder rendering**: In the `'interactive'` case of `renderContentNode`, map `node.interactiveType` to the corresponding component and render it with appropriate props (passing `node.config` or `node.data` as needed)
3. **Add error boundary**: Wrap interactive components in a Suspense boundary with fallback for loading states

#### Cluster 5: Theme Toggle

**Files**: New `src/components/layout/ThemeToggle.tsx`, `src/index.css`, `src/components/layout/Header.tsx`

**Specific Changes**:
1. **Create ThemeToggle component**: A button that reads/writes theme preference to localStorage via the storage utility, toggles a `data-theme="light"` or `data-theme="dark"` attribute on `<html>`
2. **Add light theme CSS variables**: Define `:root[data-theme="light"]` with appropriate light-mode colors (white backgrounds, dark text, adjusted borders)
3. **Integrate in Header**: Add the ThemeToggle button in the `header-right` section alongside SearchBar and command palette trigger
4. **Default to system preference**: Use `prefers-color-scheme` media query as initial default, then respect stored preference

#### Cluster 6: Content Pipeline Fixes

**File**: `src/plugins/markdown-parser.ts`

**Specific Changes**:
1. **Disambiguate duplicate IDs (1.10)**: Modify `parseMarkdown` to accept an optional `parentDir` parameter. Generate the ID by combining the parent directory name with the title slug (e.g., `slugify(parentDirName + '-' + title)`) when the title alone would produce a generic slug. Alternatively, use the file's relative path to derive a unique ID.
2. **Handle no-H2 files (1.11)**: In `buildSections()`, after processing all nodes, if `sections` is empty but content nodes were encountered before any heading (or after H1 with no H2), create an implicit section with `id: 'content'`, `heading: title`, `level: 2` containing all those content nodes.
3. **Handle multi-H1 as sections (1.15)**: In `buildSections()`, when encountering an H1 that is NOT the first H1, treat it as an H2-level section boundary. Keep the first H1 as the title, but subsequent H1s create top-level sections (level 2) with their heading text.

**File**: `src/plugins/vite-content-plugin.ts`

**Specific Changes**:
4. **Add markdowns/ category mappings (1.14, 1.16)**: Add entries to `CATEGORY_MAPPINGS` for:
   - `{ pattern: 'markdowns/Grokking Algorithms', category: 'Algorithms' }`
   - `{ pattern: 'markdowns/Designing Data-Intensive Applications', category: 'System Design' }`
   - `{ pattern: 'markdowns/Cracking the Coding Interview', category: 'Interview Prep' }`
   - `{ pattern: 'markdowns/Data Structures and Algorithms', category: 'Data Structures' }`
   - `{ pattern: 'markdowns/Data Structures Methods', category: 'Data Structures' }`
   - `{ pattern: 'markdowns/Git', category: 'Git' }`
   - `{ pattern: 'markdowns/Practice Learning', category: 'Interview Prep' }`
   - `{ pattern: 'markdowns/Solved Problems', category: 'Interview Prep' }`
   - `{ pattern: 'markdowns/Projects', category: 'Interview Prep' }`
5. **Generate unique IDs in manifest (1.10)**: When building the manifest, detect duplicate `topic.id` values within a category and disambiguate by prepending the parent directory slug or appending a counter.

**File**: `markdowns/Designing Data-Intensive Applications.md` (content authoring)

**Specific Changes**:
6. **Fill empty chapter stubs (1.17)**: Add comprehensive summary content for Chapters 3–12 covering key concepts from the book.

#### Cluster 7: Sidebar Link Consistency

**File**: `src/components/navigation/Sidebar.tsx`

**Specific Changes**:
1. **Fix link path generation**: Change the sidebar link from `/topic/${category.id}/${topic.id}` to use the topic's slug that matches the content JSON path. The manifest's `topic.slug` field contains `${categorySlug}/${topicSlug}` — extract the topicSlug portion and use it: `/topic/${category.id}/${topicSlug}` where `topicSlug` is derived from `topic.slug.split('/')[1]` or directly from `topic.contentPath`.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that exercise each bug condition on the unfixed code to observe failures and confirm root causes.

**Test Cases**:
1. **localStorage Test Crash**: Run `vitest run src/utils/storage.test.ts` and observe TypeError (will fail on unfixed code)
2. **Dashboard Missing Components**: Render Dashboard and assert presence of WeeklyStats, PomodoroTimer, etc. (will fail on unfixed code)
3. **SearchBar Unstyled**: Snapshot test or computed style check for `.search-bar` elements (will fail on unfixed code)
4. **Interactive Placeholder**: Render ContentCard with interactive node and assert actual component renders (will fail on unfixed code)
5. **Duplicate ID Generation**: Call `parseMarkdown` on two files with same H1 title in same category, assert IDs differ (will fail on unfixed code)
6. **No-H2 Content Loss**: Call `parseMarkdown` on markdown with only H1 and body text, assert `sectionCount > 0` (will fail on unfixed code)
7. **Multi-H1 Loss**: Call `parseMarkdown` on markdown with multiple H1 chapters, assert all chapters appear as sections (will fail on unfixed code)
8. **markdowns/ Unmapped**: Call `resolveCategory('markdowns/Grokking Algorithms.md')` and assert it returns a category (will fail on unfixed code)
9. **Sidebar Link Mismatch**: Render Sidebar with manifest data and assert link hrefs match content paths (will fail on unfixed code)

**Expected Counterexamples**:
- Storage tests crash with TypeError on `localStorage.clear()`
- `parseMarkdown` returns `{ sections: [], metadata: { sectionCount: 0 } }` for no-H2 files
- `resolveCategory` returns `null` for markdowns/ paths
- Sidebar links use `topic.id` which may differ from the slug in `topic.contentPath`

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed functions produce the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedApp(input)
  ASSERT expectedBehavior(result)
END FOR
```

Specifically:
- `parseMarkdown(noH2Content)` → `result.metadata.sectionCount >= 1`
- `parseMarkdown(multiH1Content)` → `result.sections.length == numberOfH1s - 1`
- `resolveCategory('markdowns/Grokking Algorithms.md')` → `'Algorithms'`
- `renderContentCard(interactiveNode)` → renders actual component, not placeholder text
- `sidebarLink.href` → matches `topic.contentPath` pattern

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed functions produce the same result as the original functions.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalFunction(input) = fixedFunction(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for well-formed markdown files and non-interactive content nodes, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Well-Formed Markdown Preservation**: Generate random well-formed markdown (single H1 + multiple H2s with unique titles) and verify `parseMarkdown` produces identical output before and after fix
2. **Non-Interactive ContentCard Preservation**: Render ContentCard with paragraph, code, table, math, image, list, blockquote nodes and verify output is unchanged
3. **Exclusion Filter Preservation**: Verify `.tex`, `.css`, `public/`, dot-prefixed paths continue to be excluded
4. **Infosys Mapping Preservation**: Verify all existing Infosys/ category mappings continue to resolve correctly
5. **Sidebar Category Rendering Preservation**: Verify collapsible categories, visited indicators, and active states render identically

### Unit Tests

- Test `parseMarkdown` with no-H2 markdown produces implicit section with correct word count
- Test `parseMarkdown` with multi-H1 markdown produces sections for each subsequent H1
- Test `parseMarkdown` generates unique IDs when given same-title files with different paths
- Test `resolveCategory` returns correct categories for all markdowns/ files
- Test `shouldExclude` continues to exclude .tex, .css, public/, dot-prefixed paths
- Test ThemeToggle persists preference and toggles `data-theme` attribute
- Test Dashboard renders all study components
- Test ContentCard renders interactive components by type

### Property-Based Tests

- Generate random markdown strings with varying heading structures and verify `parseMarkdown` never produces 0 sections when content exists below headings
- Generate random file paths within markdowns/ directory and verify `resolveCategory` returns non-null for known patterns
- Generate random well-formed markdown (H1 + H2s) and verify the fix doesn't alter their parsing output (preservation)
- Generate random `ContentNode` arrays without interactive type and verify `renderContentNode` output is unchanged

### Integration Tests

- Test full content pipeline: scan markdowns/ directory, parse all files, verify manifest has expected categories and non-zero topic counts
- Test TopicPage navigation: click sidebar link → TopicPage loads correct content JSON
- Test Dashboard renders with real manifest data and all study widgets are interactive
- Test theme toggle: click toggle → verify CSS variables change → verify persistence across page reload
