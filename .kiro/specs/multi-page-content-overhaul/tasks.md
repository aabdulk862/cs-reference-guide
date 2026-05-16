# Implementation Plan: Multi-Page Content Overhaul

## Overview

This plan transforms the CS Reference Guide from a flat single-file-per-topic architecture into one supporting multi-page topics (directories with `index.md` + subtopic files). The implementation proceeds in phases: architecture changes first (content pipeline, routing, sidebar, breadcrumbs, TopicPage), then content restructuring (splitting/moving/renaming files), then new content authoring, then cleanup and verification.

## Tasks

- [x] 1. Content Pipeline: Multi-Page Topic Detection and Processing
  - [x] 1.1 Add multi-page topic detection logic to `src/plugins/vite-content-plugin.ts`
    - Add `MultiPageTopic` interface with `dirPath`, `indexFile`, `subtopicFiles`, `category`, `topicSlug` fields
    - Implement directory detection: for each category directory, check if child entries are directories containing `index.md`
    - Directories with `index.md` → classify as multi-page topic; directories without → log warning and skip
    - Single `.md` files in category directory → existing single-file behavior (unchanged)
    - Log warning when subtopic count exceeds 50
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6_

  - [x] 1.2 Implement multi-page topic processing and JSON output generation
    - Parse `index.md` as topic overview, extract title from H1 heading
    - Parse each additional `.md` file (excluding `index.md`, excluding nested subdirectories) as subtopic, ordered alphabetically by filename
    - Generate `{categorySlug}/{topicSlug}.json` from index content
    - Generate `{categorySlug}/{topicSlug}/{subtopicSlug}.json` for each subtopic in a subdirectory under the category output
    - Implement slug deduplication: first occurrence unchanged, subsequent duplicates get `-2`, `-3` suffix with warning
    - _Requirements: 1.3, 1.4, 2.4, 2.5, 2.6_

  - [x] 1.3 Extend manifest schema with `subtopics` array and aggregated counts
    - Add `ManifestSubtopic` interface with `id`, `slug`, `title`, `wordCount` fields
    - Add optional `subtopics?: ManifestSubtopic[]` to `ManifestTopic` interface
    - For multi-page topics: set topic-level `wordCount` = sum of index + all subtopics; `sectionCount` = sum of index + all subtopics
    - For multi-page topics: populate `subtopics` array ordered alphabetically by title
    - For single-file topics: omit `subtopics` field entirely
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 1.4 Add new category mappings to `CATEGORY_MAPPINGS`
    - Add entries for: `security` → "Security", `nextjs` → "Next.js", `html-css` → "HTML & CSS", `ci-cd` → "CI/CD", `linux` → "Linux"
    - _Requirements: 9.6_

  - [ ]* 1.5 Write property tests for topic classification (Property 1)
    - **Property 1: Topic Classification**
    - Test that directories with `index.md` are classified as multi-page, `.md` files as single-file, directories without `index.md` are skipped
    - **Validates: Requirements 1.1, 1.2, 1.5, 6.5**

  - [ ]* 1.6 Write property tests for subtopic manifest structure and ordering (Property 3)
    - **Property 3: Subtopic Manifest Structure and Ordering**
    - Test that manifest `subtopics` array has exactly N elements for N subtopic files, each with non-empty fields, ordered alphabetically by title
    - **Validates: Requirements 1.4, 2.1**

  - [ ]* 1.7 Write property test for aggregate counts invariant (Property 4)
    - **Property 4: Aggregate Counts Invariant**
    - Test that topic-level wordCount = sum(index + subtopics) and sectionCount = sum(index + subtopics)
    - **Validates: Requirements 2.3**

  - [ ]* 1.8 Write property test for single-file topic manifest invariant (Property 5)
    - **Property 5: Single-File Topic Manifest Invariant**
    - Test that single-file topics have no `subtopics` field, correct `contentPath` pattern, and non-empty required fields
    - **Validates: Requirements 2.2, 6.1, 6.6, 10.1, 10.4**

  - [ ]* 1.9 Write property test for slug deduplication uniqueness (Property 6)
    - **Property 6: Slug Deduplication Uniqueness**
    - Test that all generated slugs are unique, first occurrence unchanged, duplicates get `-2`, `-3` suffixes
    - **Validates: Requirements 2.6**

  - [ ]* 1.10 Write property test for output file path correctness (Property 7)
    - **Property 7: Output File Path Correctness**
    - Test that multi-page topics produce JSON at `/content/{C}/{T}.json` for index and `/content/{C}/{T}/{S}.json` for each subtopic
    - **Validates: Requirements 2.4, 2.5**

- [x] 2. Checkpoint - Content pipeline architecture
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Routing: Add Subtopic Route Support
  - [x] 3.1 Add subtopic route to `src/App.tsx`
    - Add route `/topic/:categorySlug/:topicSlug/:subtopicSlug` before the existing topic route
    - Keep existing `/topic/:categorySlug/:topicSlug` route unchanged
    - Both routes render `<TopicPage />`
    - _Requirements: 3.1, 3.2_

  - [x] 3.2 Update `TopicPage` to handle subtopic rendering
    - Read `subtopicSlug` from `useParams`
    - If `subtopicSlug` present: fetch `/content/{categorySlug}/{topicSlug}/{subtopicSlug}.json`, render subtopic content, show "Back to overview" link
    - If `subtopicSlug` absent and topic has subtopics (check manifest): fetch index JSON, render overview + list of subtopic links with titles
    - If `subtopicSlug` absent and no subtopics: existing single-file behavior (unchanged)
    - Handle error cases: subtopic not found → inline error with link to parent; topic not found → not-found error; subtopic on single-file topic → not-found error
    - _Requirements: 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 4. Sidebar: Expandable Multi-Page Topics
  - [x] 4.1 Update Sidebar to render expandable items for multi-page topics
    - For topics with `subtopics` array: render toggle button (chevron) instead of direct link
    - On expand: show nested `<ul>` with subtopic links indented under parent, each linking to `/topic/:categorySlug/:topicSlug/:subtopicSlug`
    - For single-file topics: keep existing direct link behavior
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 4.2 Implement sidebar expansion state persistence for topics
    - Extend `NavState` interface to include `expandedTopics: string[]`
    - Persist expansion state in localStorage under `csguide:nav-state`
    - Auto-expand parent topic and category when a subtopic route is active
    - Apply `aria-current="page"` to active subtopic link
    - Handle localStorage unavailable: default to collapsed except active subtopic's parent
    - _Requirements: 4.4, 4.5, 4.6_

  - [ ]* 4.3 Write property test for sidebar expansion state round-trip (Property 9)
    - **Property 9: Sidebar Expansion State Round-Trip**
    - Test that serializing expansion state to localStorage and deserializing produces identical set of expanded topic IDs
    - **Validates: Requirements 4.5**

- [x] 5. Breadcrumbs: 4-Segment Path Support
  - [x] 5.1 Extend `generateBreadcrumbs` in `src/utils/breadcrumbs.ts` for subtopic paths
    - Handle 4-segment paths `["topic", categorySlug, topicSlug, subtopicSlug]` → produce 3 breadcrumb items
    - First: category label linking to `/category/{categorySlug}`
    - Second: topic label linking to `/topic/{categorySlug}/{topicSlug}` (clickable, not `isLast`)
    - Third: subtopic label with `isLast=true` (non-clickable)
    - Use display names from manifest for human-readable labels
    - Existing 3-segment behavior unchanged
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]* 5.2 Write property test for breadcrumb generation (Property 8)
    - **Property 8: Breadcrumb Generation**
    - Test that 4-segment paths produce exactly 3 items with correct links, 3-segment paths produce 2 items, and final element always has `isLast=true`
    - **Validates: Requirements 5.1, 5.2, 5.5**

- [x] 6. Checkpoint - Architecture complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Content Restructuring: Split Existing Topics into Multi-Page Directories
  - [x] 7.1 Split backend topics into multi-page directories
    - Convert `content/backend/java.md` → `content/backend/java/index.md` + subtopic files (3-8 files, each 2000-3000 words)
    - Convert `content/backend/spring-framework.md` → `content/backend/spring-framework/index.md` + subtopic files
    - Create `content/backend/databases/index.md` + subtopic files (consolidating `mongodb.md` and `sql-performance-tuning.md` content)
    - Create `content/backend/messaging/index.md` + subtopic files (consolidating `apache-kafka.md` and `rabbitmq.md` content)
    - Each index.md: 150-300 word overview + numbered learning path + links to subtopics
    - Each subtopic: 2000-3000 words prose, following content-authoring guidelines
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 7.2 Split frontend topics into multi-page directories
    - Convert `content/frontend/react.md` → `content/frontend/react/index.md` + subtopic files
    - Convert `content/frontend/typescript.md` → `content/frontend/typescript/index.md` + subtopic files
    - Convert `content/frontend/javascript.md` → `content/frontend/javascript/index.md` + subtopic files
    - Each index.md: 150-300 word overview + numbered learning path + links to subtopics
    - Each subtopic: 2000-3000 words prose, following content-authoring guidelines
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 7.3 Split infrastructure topics into multi-page directories
    - Convert `content/infrastructure/docker-containerization.md` → `content/infrastructure/docker/index.md` + subtopic files
    - Convert `content/infrastructure/kubernetes-eks.md` → `content/infrastructure/kubernetes/index.md` + subtopic files
    - Convert `content/infrastructure/aws-services.md` → `content/infrastructure/aws/index.md` + subtopic files
    - Convert `content/infrastructure/observability.md` → `content/infrastructure/observability/index.md` + subtopic files
    - Each index.md: 150-300 word overview + numbered learning path + links to subtopics
    - Each subtopic: 2000-3000 words prose, following content-authoring guidelines
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 7.4 Split data structures and algorithms topics into multi-page directories
    - Create `content/data-structures-and-algorithms/arrays-and-strings/index.md` + subtopic files (consolidating `array.md` content + new string algorithms)
    - Create `content/data-structures-and-algorithms/trees-and-graphs/index.md` + subtopic files (consolidating `tree.md` and `graph.md` content)
    - Create `content/data-structures-and-algorithms/dynamic-programming/index.md` + subtopic files (new content)
    - Create `content/data-structures-and-algorithms/sorting-and-searching/index.md` + subtopic files (new content)
    - Each index.md: 150-300 word overview + numbered learning path + links to subtopics
    - Each subtopic: 2000-3000 words prose, following content-authoring guidelines
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 7.5 Split system-design topic into multi-page directory
    - Convert `content/system-design/system-design.md` → `content/system-design/system-design/index.md` + subtopic files
    - Each index.md: 150-300 word overview + numbered learning path + links to subtopics
    - Each subtopic: 2000-3000 words prose, following content-authoring guidelines
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 7.6 Split interview-prep into multi-page directory
    - Create `content/interview-prep/interview-prep/index.md` + subtopic files (consolidating behavioral-prep.md content + new interview strategy content)
    - Each index.md: 150-300 word overview + numbered learning path + links to subtopics
    - Each subtopic: 2000-3000 words prose, following content-authoring guidelines
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 8. Checkpoint - Content splitting complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. New Content: Add New Topic Areas and Renamed Files
  - [x] 9.1 Create new category directories with topic files
    - Create `content/security/` with at least one `.md` topic file following content-authoring guidelines
    - Create `content/nextjs/` with at least one `.md` topic file following content-authoring guidelines
    - Create `content/html-css/` with at least one `.md` topic file following content-authoring guidelines
    - Create `content/ci-cd/` with at least one `.md` topic file following content-authoring guidelines
    - Create `content/linux/` with at least one `.md` topic file following content-authoring guidelines
    - Each file: minimum 1500 words prose, all mandatory sections present
    - _Requirements: 9.1, 9.3, 9.6_

  - [x] 9.2 Rename and update data structure files
    - Rename `content/data-structures-and-algorithms/map.md` → `content/data-structures-and-algorithms/hash-tables.md`
    - Update H1 title to "Hash Tables" and refocus content on hash table data structures
    - Rename `content/data-structures-and-algorithms/list.md` → `content/data-structures-and-algorithms/linked-lists.md`
    - Update H1 title to "Linked Lists" and refocus content on linked list data structures
    - Each file: minimum 1500 words prose, all mandatory sections present
    - _Requirements: 9.2, 9.4, 9.5_

- [x] 10. Content Removal: Delete Deprecated Files
  - [x] 10.1 Remove deprecated topic files
    - Delete `content/backend/mapstruct.md`
    - Delete `content/backend/resilience4j.md`
    - Delete `content/backend/apache-maven.md`
    - Delete `content/backend/gradle.md`
    - Delete `content/backend/incident-response.md`
    - Delete `content/interview-prep/grokking-algorithms.md`
    - Delete `content/interview-prep/cracking-the-coding-interview.md`
    - Remove any references to deleted files in remaining topics' Related Topics sections
    - _Requirements: 7.1, 7.3, 7.4_

- [x] 11. Verification: Ensure Git Topics Preserved and Build Passes
  - [x] 11.1 Verify git category integrity
    - Confirm `content/git/` contains no subdirectories
    - Confirm all 7 git files remain present and unmodified in path: `git-branching.md`, `git-commands.md`, `gitignore.md`, `local-vs-remote.md`, `merge-conflicts.md`, `pull-requests.md`, `what-is-git.md`
    - Confirm manifest lists all git topics under "Git" category with no `subtopics` field
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 11.2 Run full build and verify output
    - Run `tsc -b && vite build` and confirm exit code 0 with zero TypeScript errors
    - Verify `content-manifest.json` is valid JSON with `totalTopics > 0` and entries for all new/restructured topics
    - Run `npx vitest run` and confirm zero failures
    - Run `npx eslint .` and confirm zero errors on modified/new files
    - Verify all 7 removed files are absent from repository
    - Verify all new category directories exist with at least one `.md` file
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [x] 12. Final Checkpoint - All changes verified
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major phase
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The content writing tasks (7.x, 9.x) are the most time-intensive — each subtopic file requires 2000-3000 words of production-quality prose
- Git category is explicitly preserved as single-file topics per Requirement 10
- New category mappings (task 1.4) must be added before content directories (task 9.1) will be detected by the pipeline

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.4"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.5", "1.6", "1.7", "1.8", "1.9", "1.10"] },
    { "id": 3, "tasks": ["3.1", "5.1"] },
    { "id": 4, "tasks": ["3.2", "4.1"] },
    { "id": 5, "tasks": ["4.2", "4.3", "5.2"] },
    { "id": 6, "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5", "7.6"] },
    { "id": 7, "tasks": ["9.1", "9.2"] },
    { "id": 8, "tasks": ["10.1"] },
    { "id": 9, "tasks": ["11.1", "11.2"] }
  ]
}
```
