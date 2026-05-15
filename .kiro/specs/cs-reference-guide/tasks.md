# Implementation Plan: CS Reference Guide

## Overview

This plan implements a React + Vite SPA that transforms markdown CS notes into an interactive, ADHD-friendly study application. The implementation proceeds in phases: project scaffolding and core types, build-time content parsing, navigation and search, content presentation, interactive elements, study tools, authored content, and offline support. Each phase builds incrementally on the previous, with property-based tests validating correctness properties from the design.

## Tasks

- [x] 1. Project scaffolding and core types
  - [x] 1.1 Initialize Vite + React + TypeScript project with dependencies
    - Initialize project with `npm create vite@latest` using React + TypeScript template
    - Install dependencies: react-router-dom, flexsearch, fast-check (dev), vitest (dev), @testing-library/react (dev), remark, remark-gfm, unified, unist-util-visit, sql.js, monaco-editor or codemirror, katex, recharts
    - Configure vitest in vite.config.ts
    - Create directory structure: src/components, src/hooks, src/utils, src/types, src/content, src/workers, src/plugins
    - _Requirements: 1.1, 1.5_

  - [x] 1.2 Define core TypeScript interfaces and types
    - Create src/types/content.ts with ParsedContent, ContentSection, ContentNode, Topic, Category interfaces
    - Create src/types/navigation.ts with NavigationState, CommandPaletteItem, CommandPaletteState
    - Create src/types/study.ts with PomodoroState, StudySession, ProgressState, DailyGoal, WeeklyStats, SpacedRepetitionState, RepetitionSchedule, BookmarkState, Bookmark
    - Create src/types/search.ts with SearchEngine, SearchResult interfaces
    - Create src/types/interactive.ts with PlaygroundProps, PlaygroundState, SQLPlaygroundProps, Quiz, QuizQuestion, VisualizationProps
    - _Requirements: 1.1_

  - [x] 1.3 Create localStorage persistence utility
    - Create src/utils/storage.ts with typed get/set/remove functions using namespaced keys (csguide:*)
    - Implement try/catch wrapping for all localStorage operations
    - Implement schema version checking and migration support (csguide:version key)
    - Implement graceful fallback to in-memory Map when localStorage is unavailable or full
    - _Requirements: 5.8, 6.5, 6.6, 9.6_

  - [x]* 1.4 Write property test for state persistence round-trip
    - **Property 11: State persistence round-trip**
    - **Validates: Requirements 5.8, 6.5, 9.6**


- [x] 2. Build-time content parser (Vite plugin)
  - [x] 2.1 Implement file exclusion filter
    - Create src/plugins/exclusion-filter.ts
    - Implement filter that excludes: .tex files, .css files, files in public/ directory, files in dot-prefixed directories
    - Export as pure function for testability
    - _Requirements: 7.6_

  - [x]* 2.2 Write property test for file exclusion filter
    - **Property 3: File exclusion filter**
    - **Validates: Requirements 7.6**

  - [x] 2.3 Implement markdown parser core
    - Create src/plugins/markdown-parser.ts
    - Parse markdown AST using remark/unified
    - Map H1 → Topic, H2 → ContentSection, H3+ → subsections
    - Extract code blocks with language annotation and runnable flag
    - Extract image references with original paths
    - Parse LaTeX math (inline $...$ and block $$...$$) into math nodes with display mode
    - Handle unparseable content by emitting `unparseable` nodes with raw content
    - Calculate wordCount per section
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.7_

  - [x]* 2.4 Write property test for parser structural preservation
    - **Property 1: Parser structural preservation**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**

  - [x] 2.5 Implement image path resolution
    - Create src/plugins/image-resolver.ts
    - Resolve relative image paths relative to the source markdown file's directory
    - Normalize paths to remove ../ traversals
    - Copy referenced assets to output directory during build
    - Handle missing images by logging warnings
    - _Requirements: 7.5_

  - [x]* 2.6 Write property test for image path resolution
    - **Property 2: Image path resolution**
    - **Validates: Requirements 7.5**

  - [x] 2.7 Implement Vite plugin orchestrator
    - Create src/plugins/vite-content-plugin.ts
    - Implement Vite plugin that runs at build time (configureServer + buildStart hooks)
    - Recursively scan repository directories, apply exclusion filter
    - Run markdown parser on each .md file
    - Generate content JSON manifests per topic (output to public/content/)
    - Generate content-manifest.json with category/topic index
    - Map repository directories to categories per design (Data Structures and Algorithms/ → Data Structures, Git/ → Git, etc.)
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6_

  - [x] 2.8 Build FlexSearch index at build time
    - Extend Vite plugin to generate a serialized FlexSearch index
    - Index all headings, body text, code exampl  es from parsed content
    - Output search-index.json to public/
    - _Requirements: 2.3, 2.4_

- [x] 3. Checkpoint - Ensure content parser tests pass
  - Ensure all tests pass, ask the user if questions arise.


- [x] 4. Navigation system
  - [x] 4.1 Implement App shell and routing
    - Create src/App.tsx with React Router setup
    - Implement layout with persistent sidebar, header (focus timer area), and main content area
    - Set up React.lazy code-splitting per topic route
    - Implement Suspense boundaries with loading fallback
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 4.2 Implement sidebar navigation
    - Create src/components/navigation/Sidebar.tsx
    - Render category tree from content-manifest.json
    - Implement collapsible categories with expand/collapse on click
    - Display visited/unvisited indicators per topic (from progress state)
    - Persist expanded categories in localStorage (csguide:nav-state)
    - _Requirements: 2.1, 2.6_

  - [x] 4.3 Implement breadcrumb navigation
    - Create src/components/navigation/Breadcrumbs.tsx
    - Generate breadcrumb array from current route path (category → topic → section)
    - Each breadcrumb shows display name; last item is not a link
    - _Requirements: 2.2_

  - [x]* 4.4 Write property test for breadcrumb generation
    - **Property 4: Breadcrumb generation**
    - **Validates: Requirements 2.2**

  - [x] 4.5 Implement search engine
    - Create src/components/navigation/SearchBar.tsx
    - Load pre-built FlexSearch index on app init
    - On input (≥1 char), query index and display up to 10 results within 200ms
    - Highlight matching keywords in results
    - Navigate to Content_Section on result selection
    - Display "No results found" message with suggestions when empty
    - _Requirements: 2.3, 2.4, 2.5, 2.7_

  - [x]* 4.6 Write property test for search result limit and relevance
    - **Property 5: Search result limit and relevance**
    - **Validates: Requirements 2.3, 2.4**

  - [x] 4.7 Implement command palette
    - Create src/components/navigation/CommandPalette.tsx
    - Open on Ctrl+K / Cmd+K, close on Escape or click outside
    - Populate with all topics, bookmarks, and actions (start Pomodoro, open dashboard)
    - Fuzzy filter results within 100ms, display up to 10 matches
    - Keyboard navigation with Up/Down arrows, Enter to select
    - Return focus to previously focused element on close
    - Display "No results found" when filter yields zero matches
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [x]* 4.8 Write property test for command palette population
    - **Property 18: Command palette population**
    - **Validates: Requirements 10.2**

  - [x]* 4.9 Write property test for fuzzy matching with result limit
    - **Property 19: Fuzzy matching with result limit**
    - **Validates: Requirements 10.3**

  - [x]* 4.10 Write property test for keyboard navigation bounds
    - **Property 20: Keyboard navigation bounds**
    - **Validates: Requirements 10.6**

- [x] 5. Checkpoint - Ensure navigation tests pass
  - Ensure all tests pass, ask the user if questions arise.


- [x] 6. Content presentation layer
  - [x] 6.1 Implement content card renderer
    - Create src/components/content/ContentCard.tsx
    - Render each ContentSection as a self-contained card with visible border/shadow
    - Implement collapse logic: collapse if wordCount > 300 OR paragraph count > 3
    - Show "Read more" / "Show less" toggle for collapsed content
    - Visible portion limited to 300 words maximum
    - Apply design tokens from guide-system.css (16px min font, 1.5 line-height, 16px spacing)
    - _Requirements: 3.1, 3.2, 3.4, 3.7, 8.1_

  - [x]* 6.2 Write property test for content collapse decision
    - **Property 6: Content collapse decision**
    - **Validates: Requirements 3.1, 3.4**

  - [x] 6.3 Implement code block renderer with copy button
    - Create src/components/content/CodeBlock.tsx
    - Syntax-highlighted code blocks with language annotation
    - One-click copy button that shows "Copied" confirmation for 2+ seconds
    - _Requirements: 3.3_

  - [x] 6.4 Implement Quick Reference Card
    - Create src/components/content/QuickReferenceCard.tsx
    - Display at top of each topic page
    - Bulleted list of max 7 items, each ≤ 2 sentences
    - Visually distinct styling (different background, border)
    - _Requirements: 3.5_

  - [x] 6.5 Implement content view toggle (Full / Cheat Sheet / ELI5)
    - Create src/components/content/ViewToggle.tsx
    - Toggle between Full Content, Cheat Sheet (≤500 words), and ELI5 (≤3 sentences) views
    - Persist last selected view preference
    - _Requirements: 20.1, 20.2, 20.3_

  - [x]* 6.6 Write property test for content view word/sentence constraints
    - **Property 21: Content view word/sentence constraints**
    - **Validates: Requirements 20.1, 20.2**

  - [x] 6.7 Implement math rendering
    - Create src/components/content/MathRenderer.tsx
    - Render inline and block LaTeX using KaTeX
    - Fallback to raw monospace display for invalid expressions
    - _Requirements: 7.4_

  - [x] 6.8 Implement topic page composition
    - Create src/components/content/TopicPage.tsx
    - Lazy-load topic content JSON on navigation
    - Compose: ViewToggle → QuickReferenceCard → ContentCards → Interactive elements
    - Render progress bar showing viewed/total sections ratio
    - _Requirements: 3.6, 1.2_

  - [x] 6.9 Implement All Cheat Sheets page
    - Create src/components/content/AllCheatSheets.tsx
    - List all topic cheat sheets for rapid browsing
    - Accessible from Navigation_System
    - _Requirements: 20.4_


- [x] 7. Interactive elements
  - [x] 7.1 Implement code playground with Web Worker execution
    - Create src/components/interactive/CodePlayground.tsx
    - Create src/workers/code-runner.worker.ts
    - Editable code area with JavaScript execution via Web Worker
    - 5-second timeout: terminate worker and display timeout error
    - Display runtime errors with stack trace in output panel
    - _Requirements: 4.1, 4.2_

  - [x] 7.2 Implement SQL playground
    - Create src/components/interactive/SQLPlayground.tsx
    - Use sql.js (SQLite compiled to WASM) for client-side SQL execution
    - Pre-load sample dataset schema and data
    - Display query results in table format
    - Display SQL error messages on invalid queries
    - _Requirements: 13.2_

  - [x] 7.3 Implement quiz component
    - Create src/components/interactive/Quiz.tsx
    - Support multiple-choice (4 options) and fill-in-the-blank question types
    - Display positive feedback within 500ms for correct answers (≤150 chars explanation)
    - Display correct answer + step-by-step explanation within 500ms for incorrect answers
    - Expandable "Test Yourself" sections after each H2 heading
    - _Requirements: 4.3, 4.4, 4.5_

  - [x]* 7.4 Write property test for answer verification correctness
    - **Property 8: Answer verification correctness**
    - **Validates: Requirements 4.4, 4.5**

  - [x] 7.5 Implement data structure visualizations
    - Create src/components/interactive/DSVisualization.tsx
    - Support types: bst, bfs, dfs, linked-list, heap, graph
    - Implement play, pause, step-forward, reset controls
    - Animation step duration configurable 500ms-2000ms
    - Use SVG or Canvas for rendering
    - _Requirements: 4.6_

  - [x] 7.6 Implement Big O comparison chart
    - Create src/components/interactive/BigOChart.tsx
    - Interactive chart using recharts
    - Toggle up to 10 algorithms on/off
    - Display time complexity curves (O(1), O(log n), O(n), O(n log n), O(n²), O(2^n))
    - _Requirements: 4.7_

- [x] 8. Checkpoint - Ensure interactive element tests pass
  - Ensure all tests pass, ask the user if questions arise.


- [x] 9. Study tools
  - [x] 9.1 Implement Pomodoro timer
    - Create src/components/study/PomodoroTimer.tsx
    - Create src/hooks/usePomodoro.ts with state machine logic
    - Configurable work (5-90 min, default 25) and break (1-30 min, default 5) intervals
    - State transitions: idle → work → break → work (cycle), any → idle on stop
    - Start, pause, stop controls
    - Banner notifications on interval end (non-interrupting, dismissible)
    - Persist configuration to localStorage (csguide:pomodoro)
    - _Requirements: 5.1, 5.2, 5.3, 5.7_

  - [x]* 9.2 Write property test for Pomodoro timer state machine
    - **Property 9: Pomodoro timer state machine**
    - **Validates: Requirements 5.1, 5.2, 5.3**

  - [x] 9.3 Implement focus mode
    - Create src/components/study/FocusMode.tsx
    - When Pomodoro active: reduce sidebar and non-active cards to 50% opacity
    - Restore full opacity when Pomodoro stopped
    - _Requirements: 5.5, 5.7_

  - [x] 9.4 Implement study session and focus timer
    - Create src/hooks/useStudySession.ts
    - Start session on first Content_Section navigation
    - Display elapsed time in HH:MM:SS in header
    - Continue across page navigations
    - Pause when tab hidden (document.visibilityState)
    - Save to localStorage on close/refresh, restore on return
    - _Requirements: 5.4, 5.8_

  - [x] 9.5 Implement daily goal tracker
    - Create src/components/study/DailyGoal.tsx
    - Create src/hooks/useDailyGoal.ts
    - Configurable target (5-480 minutes)
    - Progress bar with elapsed minutes and percentage
    - Reset at midnight local timezone (compare stored date vs current date)
    - _Requirements: 5.6_

  - [x]* 9.6 Write property test for daily goal reset
    - **Property 10: Daily goal reset**
    - **Validates: Requirements 5.6**

  - [x] 9.7 Implement progress tracker
    - Create src/hooks/useProgress.ts
    - Track section completion via scroll observation (IntersectionObserver)
    - Mark section complete when user scrolls to ≥90% of section height
    - Calculate per-topic percentage: floor(completed / total * 100)
    - Calculate overall percentage: floor(total completed / total sections * 100)
    - Persist to localStorage (csguide:progress)
    - _Requirements: 6.1, 6.2, 6.5_

  - [x]* 9.8 Write property test for scroll completion threshold
    - **Property 12: Scroll completion threshold**
    - **Validates: Requirements 6.1**

  - [x]* 9.9 Write property test for progress percentage calculation
    - **Property 7: Progress percentage calculation**
    - **Validates: Requirements 3.6, 6.2**

  - [x] 9.10 Implement bookmarks
    - Create src/hooks/useBookmarks.ts
    - Create src/components/study/BookmarkButton.tsx
    - Toggle bookmark on click: add if not bookmarked, remove if already bookmarked
    - Persist to localStorage (csguide:bookmarks)
    - Display bookmarks list on dashboard
    - _Requirements: 6.3, 6.4, 6.5_

  - [x]* 9.11 Write property test for bookmark toggle idempotence
    - **Property 13: Bookmark toggle idempotence**
    - **Validates: Requirements 6.3, 6.4**

  - [x] 9.12 Implement resume prompt
    - Create src/components/study/ResumePrompt.tsx
    - Show "Continue where you left off" if (now - lastSession) > 60 seconds
    - Link to last viewed Content_Section
    - Store last-viewed in localStorage (csguide:last-viewed)
    - _Requirements: 6.7_

  - [x]* 9.13 Write property test for resume prompt timing
    - **Property 14: Resume prompt timing**
    - **Validates: Requirements 6.7**

  - [x] 9.14 Implement weekly stats
    - Create src/components/study/WeeklyStats.tsx
    - Create src/hooks/useWeeklyStats.ts
    - Aggregate daily study records over past 7 days
    - Show total minutes and distinct topics covered
    - Persist to localStorage (csguide:weekly-stats)
    - _Requirements: 6.8_

  - [x]* 9.15 Write property test for weekly stats aggregation
    - **Property 15: Weekly stats aggregation**
    - **Validates: Requirements 6.8**

- [x] 10. Checkpoint - Ensure study tools tests pass
  - Ensure all tests pass, ask the user if questions arise.


- [x] 11. Spaced repetition system
  - [x] 11.1 Implement spaced repetition scheduler
    - Create src/hooks/useSpacedRepetition.ts
    - Interval sequence: [1, 3, 7, 14, 30] days
    - Schedule first review on topic completion (all sections complete)
    - Advance interval on successful review
    - Reset to index 0 on "Still struggling"
    - After final interval (30 days), repeat at 30-day intervals
    - Persist to localStorage (csguide:spaced-rep)
    - _Requirements: 9.1, 9.3, 9.4, 9.5, 9.6_

  - [x]* 11.2 Write property test for spaced repetition interval advancement
    - **Property 16: Spaced repetition interval advancement**
    - **Validates: Requirements 9.1, 9.3, 9.4, 9.5**

  - [x] 11.3 Implement due for review list
    - Create src/components/study/DueForReview.tsx
    - Filter topics where nextReviewDate ≤ today
    - Sort by most overdue first (currentDate - nextReviewDate descending)
    - Display up to 20 items with topic name and days since last review
    - _Requirements: 9.2_

  - [x]* 11.4 Write property test for spaced repetition due list
    - **Property 17: Spaced repetition due list**
    - **Validates: Requirements 9.2**

- [x] 12. Progress dashboard
  - [x] 12.1 Implement progress dashboard page
    - Create src/components/dashboard/Dashboard.tsx
    - Display overall progress percentage
    - Display per-topic progress bars
    - Display bookmarks list
    - Display weekly stats summary
    - Display due-for-review list
    - Display resume prompt
    - _Requirements: 6.2, 6.3, 6.7, 6.8, 9.2_


- [x] 13. Built-in authored content
  - [x] 13.1 Create Operating Systems content
    - Create src/content/operating-systems/ with TSX modules
    - Cover: processes/threads, CPU scheduling (FCFS, SJF, Round Robin, Priority), memory management (paging, segmentation, virtual memory), deadlocks, file systems, IPC
    - Include interactive visualizations (scheduling timeline, page table simulation, deadlock graph)
    - Include quiz questions per subtopic
    - Include cheat sheet (≤500 words) and ELI5 summary (≤3 sentences)
    - _Requirements: 11.1, 11.2, 11.3, 20.1, 20.2_

  - [x] 13.2 Create Networking content
    - Create src/content/networking/ with TSX modules
    - Cover: OSI/TCP-IP models, HTTP/HTTPS, DNS, TCP vs UDP, WebSockets, REST vs gRPC, load balancing, CDNs
    - Include diagrams/visualizations (TCP handshake, DNS flow, request lifecycle)
    - Include quiz questions per subtopic
    - Include cheat sheet and ELI5 summary
    - _Requirements: 12.1, 12.2, 12.3, 20.1, 20.2_

  - [x] 13.3 Create SQL and Databases content
    - Create src/content/sql-databases/ with TSX modules
    - Cover: relational model, normalization (1NF-BCNF), SQL syntax (SELECT, JOIN, GROUP BY, HAVING, subqueries, window functions), indexing (B-tree, hash), transactions/ACID, isolation levels, query optimization
    - Include 20+ progressive SQL practice problems with solutions
    - Include SQL playground integration with sample dataset
    - Include quiz questions per subtopic
    - Include cheat sheet and ELI5 summary
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 20.1, 20.2_

  - [x] 13.4 Create Design Patterns content
    - Create src/content/design-patterns/ with TSX modules
    - Cover: Creational (Singleton, Factory, Abstract Factory, Builder, Prototype), Structural (Adapter, Decorator, Facade, Proxy, Composite), Behavioral (Observer, Strategy, Command, Template Method, State, Iterator)
    - Each pattern: when-to-use summary, UML diagram, Java code example, real-world analogy
    - Include interactive pattern selector (describe problem → recommended pattern)
    - Include quiz questions per pattern
    - Include cheat sheet and ELI5 summary
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 20.1, 20.2_

  - [x] 13.5 Create System Design content
    - Create src/content/system-design/ with TSX modules
    - Cover: scalability, load balancers, caching, sharding/replication, CAP theorem, consistent hashing, message queues, rate limiting, API design, microservices patterns
    - Include architecture diagrams per topic
    - Include 10 end-to-end system design walkthroughs (URL shortener, chat system, news feed, etc.)
    - Include quiz questions per subtopic
    - Include cheat sheet and ELI5 summary
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 20.1, 20.2_

  - [x] 13.6 Create Docker and Kubernetes content
    - Create src/content/devops/ with TSX modules
    - Cover: Docker (images, containers, Dockerfile, volumes, networking, Compose), Kubernetes (pods, services, deployments, ConfigMaps, Secrets, namespaces, Helm), CI/CD concepts
    - Include annotated config file examples (Dockerfile, docker-compose.yml, K8s YAML)
    - Include quiz questions per subtopic
    - Include cheat sheet and ELI5 summary
    - _Requirements: 16.1, 16.2, 16.3, 20.1, 20.2_

  - [x] 13.7 Create Testing Patterns content
    - Create src/content/testing/ with TSX modules
    - Cover: unit testing, integration testing, contract testing, E2E testing, load testing, test doubles (mocks, stubs, fakes, spies), TDD, BDD, testing pyramids
    - Include Java (JUnit/Mockito) code examples per pattern
    - Include quiz questions per subtopic
    - Include cheat sheet and ELI5 summary
    - _Requirements: 17.1, 17.2, 17.3, 20.1, 20.2_

  - [x] 13.8 Create Behavioral Interview content
    - Create src/content/behavioral-interview/ with TSX modules
    - Cover: STAR method, question categories (leadership, conflict, failure, teamwork, initiative), response structuring tips
    - Include 30+ common questions organized by category with sample STAR outlines
    - Include Practice Mode: random question selection, typed response area, visible elapsed timer
    - Include cheat sheet and ELI5 summary
    - _Requirements: 18.1, 18.2, 18.3, 20.1, 20.2_

  - [x] 13.9 Create Coding Patterns content
    - Create src/content/coding-patterns/ with TSX modules
    - Cover: sliding window, two pointers, fast/slow pointers, merge intervals, cyclic sort, in-place reversal, BFS, DFS, two heaps, subsets, modified binary search, top K elements, K-way merge, dynamic programming, backtracking, greedy
    - Each pattern: explanation, template code, 3+ example problems with solutions, complexity analysis
    - Include inline code playground per example problem
    - Include quiz questions per pattern
    - Include cheat sheet and ELI5 summary
    - _Requirements: 19.1, 19.2, 19.3, 20.1, 20.2_

- [x] 14. Checkpoint - Ensure authored content renders correctly
  - Ensure all tests pass, ask the user if questions arise.


- [x] 15. Accessibility and responsive design
  - [x] 15.1 Implement keyboard navigation and accessibility
    - Ensure all interactive elements reachable via Tab/Shift+Tab
    - All elements activatable via Enter or Space
    - Focus indicators: 2px solid outline with ≥3:1 contrast ratio
    - Minimum touch target size 44x44 CSS pixels
    - ARIA labels for interactive components
    - _Requirements: 8.2, 8.4_

  - [x] 15.2 Implement responsive layout
    - Ensure layout works from 320px to 2560px without horizontal scrolling
    - Sidebar collapses to hamburger menu on mobile
    - Content cards stack vertically on narrow viewports
    - Apply guide-system.css design tokens consistently
    - _Requirements: 8.3, 8.4_

- [x] 16. Offline support and service worker
  - [x] 16.1 Implement service worker for offline caching
    - Create src/service-worker.ts
    - Register service worker in main entry point
    - Cache-first strategy for content JSON and assets
    - Network-first for app shell during development
    - Cache all content after initial load for full offline support
    - Graceful fallback if service worker registration fails
    - _Requirements: 1.4_

- [x] 17. Integration and wiring
  - [x] 17.1 Wire all components together and configure routes
    - Connect sidebar navigation to React Router routes
    - Wire search results to navigation
    - Wire command palette actions to navigation and study tools
    - Connect progress tracker to content card scroll observation
    - Wire bookmark buttons throughout content pages
    - Connect Pomodoro timer to focus mode opacity changes
    - Connect daily goal to study session elapsed time
    - Ensure code-splitting works for all topic routes (chunks < 50KB)
    - _Requirements: 1.2, 1.3, 2.5, 5.4, 5.5, 6.1_

  - [x]* 17.2 Write integration tests
    - Test full build pipeline: markdown → JSON → rendered app
    - Test offline mode with service worker
    - Test SQL playground query execution
    - Test code playground with timeout
    - Test keyboard accessibility flow
    - _Requirements: 1.4, 4.1, 4.2, 8.2, 13.2_

- [x] 18. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate the 21 universal correctness properties defined in the design
- Unit tests validate specific examples and edge cases
- The implementation uses TypeScript throughout, matching the design document interfaces
- All authored content (tasks 13.1-13.9) can be developed in parallel once the content rendering infrastructure is complete
- fast-check is used for all property-based tests with minimum 100 iterations per property

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "2.1"] },
    { "id": 3, "tasks": ["1.4", "2.2", "2.3"] },
    { "id": 4, "tasks": ["2.4", "2.5"] },
    { "id": 5, "tasks": ["2.6", "2.7"] },
    { "id": 6, "tasks": ["2.8"] },
    { "id": 7, "tasks": ["4.1"] },
    { "id": 8, "tasks": ["4.2", "4.3", "4.5", "4.7"] },
    { "id": 9, "tasks": ["4.4", "4.6", "4.8", "4.9", "4.10"] },
    { "id": 10, "tasks": ["6.1", "6.3", "6.4", "6.5", "6.7"] },
    { "id": 11, "tasks": ["6.2", "6.6", "6.8", "6.9"] },
    { "id": 12, "tasks": ["7.1", "7.2", "7.3", "7.5", "7.6"] },
    { "id": 13, "tasks": ["7.4"] },
    { "id": 14, "tasks": ["9.1", "9.4", "9.5", "9.7", "9.10", "9.12", "9.14"] },
    { "id": 15, "tasks": ["9.2", "9.3", "9.6", "9.8", "9.9", "9.11", "9.13", "9.15"] },
    { "id": 16, "tasks": ["11.1", "11.3"] },
    { "id": 17, "tasks": ["11.2", "11.4", "12.1"] },
    { "id": 18, "tasks": ["13.1", "13.2", "13.3", "13.4", "13.5", "13.6", "13.7", "13.8", "13.9"] },
    { "id": 19, "tasks": ["15.1", "15.2", "16.1"] },
    { "id": 20, "tasks": ["17.1"] },
    { "id": 21, "tasks": ["17.2"] }
  ]
}
```
