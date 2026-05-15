# Implementation Plan: CS Reference Overhaul

## Overview

This implementation plan transforms the CS Reference Guide from a workspace-root-scanning content pipeline into a self-contained, mobile-responsive, offline-capable Progressive Web App. Tasks are organized into 10 phases that build incrementally: starting with content pipeline enhancements, then content migration, content authoring, app feature fixes, new pages, search/code block enhancements, mobile responsiveness, PWA/offline, performance polish, and deployment readiness.

## Tasks

- [x] 1. Content Pipeline Enhancements
  - Extend the markdown parser and Vite plugin with new node types, validation, and sitemap generation

  - [x] 1.1 Extend ContentNode types and parser for Mermaid blocks
    - Add `mermaid` type to the `ContentNode` union in `src/types/`
    - Modify `src/plugins/markdown-parser.ts` to detect fenced code blocks with language `mermaid` and emit `{ type: 'mermaid', source: string }` nodes instead of `{ type: 'code' }` nodes
    - Ensure mermaid blocks up to 50,000 characters are handled without truncation
    - _Requirements: 14.1, 14.5_

  - [x] 1.2 Extend ContentNode types and parser for admonitions
    - Add `admonition` type to the `ContentNode` union with `admonitionType: 'note' | 'warning' | 'tip'` and `content: string`
    - Modify `src/plugins/markdown-parser.ts` to detect blockquotes starting with `[!NOTE]`, `[!WARNING]`, or `[!TIP]` and emit `admonition` nodes
    - Unrecognized admonition types (e.g., `[!DANGER]`) must produce standard `blockquote` nodes
    - _Requirements: 15.1, 15.5_

  - [x] 1.3 Extend ContentNode types and parser for task lists and footnotes
    - Add `task-list` type with `items: TaskListItem[]` (each with `checked: boolean` and `text: string`)
    - Add `footnote-ref` type with `identifier: string` and `index: number`
    - Add `footnote-def` type with `identifier: string` and `content: string`
    - Modify parser to detect `- [ ]` / `- [x]` syntax and footnote `[^id]` / `[^id]: text` syntax
    - _Requirements: 15.3, 15.4_

  - [x]* 1.4 Write property test for extended markdown node classification
    - **Property 2: Extended markdown node classification**
    - Generate random markdown strings containing mermaid blocks, admonition blockquotes, task lists, and footnotes; verify correct node type classification
    - **Validates: Requirements 14.1, 15.1, 15.3, 15.4, 15.5**

  - [x] 1.5 Implement content validation pipeline
    - Create `src/plugins/content-validator.ts` with `ValidationConfig` and `ValidationResult` interfaces
    - Implement word count validation (minimum 1500 words prose, stub threshold 200 words)
    - Implement required section detection ("When to Use", "Common Pitfalls", "Interview Questions", "Real-World Use Cases", "Production Tips")
    - Implement section minimum word count check (100 words)
    - Implement broken image reference detection (resolved relative to file location within `content/`)
    - Implement external image URL detection (`http://` or `https://` prefixed)
    - Implement orphaned image file detection (`.png` files not referenced by any Topic_File)
    - Emit warnings without failing the build
    - _Requirements: 1.1, 1.2, 1.3, 1.6, 1.7, 1.8, 2.1, 2.3, 2.4, 2.5_

  - [x]* 1.6 Write property test for prose word count calculation
    - **Property 1: Prose word count excludes non-prose elements**
    - Generate random markdown with mixed prose, code blocks, headings, and front-matter; verify word count only includes paragraph text, list items, blockquotes, and table cells
    - **Validates: Requirements 1.1, 1.6, 1.7, 1.8**

  - [x]* 1.7 Write property test for image reference validation
    - **Property 3: Image reference validation**
    - Generate random file paths and image references (valid, broken, external); verify correct flagging behavior
    - **Validates: Requirements 2.1, 2.4, 2.5**

  - [x]* 1.8 Write property test for orphaned image detection
    - **Property 4: Orphaned image detection**
    - Generate random sets of image files and reference sets; verify the orphan detector returns exactly the set difference
    - **Validates: Requirements 2.3, 7.2**

  - [x] 1.9 Update Vite plugin contentRoot and category mappings
    - Change `contentRoot` in `vite.config.ts` from workspace root (`..`) to `path.resolve(__dirname, 'content')`
    - Replace `CATEGORY_MAPPINGS` array in `src/plugins/vite-content-plugin.ts` with new entries matching `content/{category}/` structure
    - Ensure `resolveCategory` returns non-null for all mapped directories and null for unmapped paths
    - _Requirements: 6.9, 6.12, 8.1, 8.2, 8.3, 8.4_

  - [x]* 1.10 Write property test for category resolution completeness
    - **Property 5: Category resolution completeness**
    - Generate random file paths under mapped and unmapped directories; verify resolveCategory returns correct results
    - **Validates: Requirements 6.9, 8.1, 8.3**

  - [x] 1.11 Implement search index enhancement to include code blocks
    - Modify the search document builder to concatenate code block content with prose text for full-text indexing
    - Ensure the `code` field of every code-type ContentNode is included in the searchable text
    - _Requirements: 17.1_

  - [x]* 1.12 Write property test for search index code inclusion
    - **Property 6: Search index includes code block content**
    - Generate random ParsedContent with code blocks; verify search document contains full code field content
    - **Validates: Requirements 17.1**

  - [x] 1.13 Implement sitemap generator
    - Create `src/plugins/sitemap-generator.ts` implementing `generateSitemap(manifest, baseUrl)` function
    - Generate valid XML with `<urlset>`, `<url>`, and `<loc>` elements for every topic in the manifest
    - Integrate into the Vite plugin build step to output `sitemap.xml` alongside the manifest
    - _Requirements: 21.3_

  - [x]* 1.14 Write property test for sitemap generation
    - **Property 9: Sitemap generation from manifest**
    - Generate random ContentManifest objects with N topics across M categories; verify XML contains exactly N `<url>` elements with valid paths
    - **Validates: Requirements 21.3**

- [x] 2. Checkpoint - Content pipeline enhancements complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Content Migration and Reorganization
  - Move legacy workspace-root directories into `cs-reference-guide/content/` and update mappings

  - [x] 3.1 Create content directory structure
    - Create all category subdirectories under `cs-reference-guide/content/`: `backend/`, `frontend/`, `infrastructure/`, `data-structures-and-algorithms/`, `system-design/`, `interview-prep/`, `git/`
    - _Requirements: 6.1_

  - [x] 3.2 Migrate backend content from legacy directories
    - Move/consolidate content from `Infosys/Java/`, `Infosys/Spring/`, `Infosys/MongoDB/`, `Infosys/Introduction to Apache Kafka/`, `Infosys/Apache Maven/`, `Infosys/Gradle/` into `cs-reference-guide/content/backend/`
    - Rename files to kebab-case (e.g., `java.md`, `spring-framework.md`, `mongodb.md`, `apache-kafka.md`, `apache-maven.md`, `gradle.md`)
    - Remove broken image references; replace diagrams with Mermaid blocks where applicable
    - _Requirements: 6.2, 2.1, 2.2_

  - [x] 3.3 Migrate data structures and algorithms content
    - Move content from `Data Structures and Algorithms/` into `cs-reference-guide/content/data-structures-and-algorithms/`
    - Rename files to kebab-case (e.g., `array.md`, `big-o-notation.md`, `graph.md`, `heap.md`, `list.md`, `map.md`, `queue.md`, `ring-buffer.md`, `sets.md`, `tree.md`, `trie.md`)
    - Replace PNG image references with Mermaid diagrams or remove broken references
    - _Requirements: 6.5, 2.1, 2.2_

  - [x] 3.4 Migrate Git content
    - Move content from `Git/` into `cs-reference-guide/content/git/`
    - Rename files to kebab-case (e.g., `git-commands.md`, `git-branching.md`, `gitignore.md`, `local-vs-remote.md`, `merge-conflicts.md`, `pull-requests.md`, `what-is-git.md`)
    - Replace PNG image references with Mermaid diagrams
    - _Requirements: 6.8, 2.1, 2.2_

  - [x] 3.5 Migrate interview prep content
    - Move content from `Cracking the Coding Interview/` and `Grokking Algorithms/` into `cs-reference-guide/content/interview-prep/`
    - Rename to `cracking-the-coding-interview.md`, `grokking-algorithms.md`
    - Add `behavioral-prep.md` placeholder
    - _Requirements: 6.7_

  - [x] 3.6 Clean up legacy directories and irrelevant files
    - Remove Legacy_Content_Directories from workspace root (`Infosys/`, `Data Structures and Algorithms/`, `Git/`, `Grokking Algorithms/`, `Cracking the Coding Interview/`)
    - Remove `public/` directory at workspace root if it exists (old static HTML guides)
    - Remove `resume.tex` if present
    - Remove any files matching `*Scope Document*`
    - Remove `markdowns/` directory at workspace root if present
    - Remove orphaned `.png` files not referenced by any Topic_File
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

  - [x] 3.7 Update exclusion filter for new patterns
    - Ensure `src/plugins/exclusion-filter.ts` excludes: `*.tex`, `public/**`, `*Scope Document*`, dot-prefixed directories, `*.css`
    - _Requirements: 7.5_

- [x] 4. Checkpoint - Content migration complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Content Authoring - Backend and Infrastructure Topics
  - Create new topic files following the mandatory file structure from content-authoring guidelines

  - [x] 5.1 Author Docker & Containerization topic
    - Create `content/infrastructure/docker-containerization.md` with H2 sections: images, containers, Dockerfile syntax, multi-stage builds, Docker Compose, networking, volumes
    - Follow mandatory structure: Quick Reference, When to Use, Code Examples, Architecture/Diagrams, Common Pitfalls, Real-World Use Cases, Interview Questions, Production Tips, Related Topics
    - Minimum 1500 words prose, at least 2 code blocks, at least 1 Mermaid diagram
    - _Requirements: 3.1, 1.1, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 5.2 Author Kubernetes & EKS topic
    - Create `content/infrastructure/kubernetes-eks.md` with H2 sections: pods, deployments, services, ingress, ConfigMaps, Secrets, Helm charts, EKS-specific configuration
    - Follow mandatory structure with minimum 1500 words, code blocks, Mermaid diagrams
    - _Requirements: 3.2, 1.1, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 5.3 Author AWS Services topic
    - Create `content/infrastructure/aws-services.md` with H2 sections: CloudWatch, S3, Pinpoint, EKS, IAM, VPC
    - Each section describes at least one operational use case
    - _Requirements: 3.3, 1.1, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 5.4 Author CI/CD Pipelines topic
    - Create `content/infrastructure/ci-cd-pipelines.md` with H2 sections: GitLab CI/CD, Jenkins pipeline syntax, stages, artifacts, deployment strategies
    - _Requirements: 3.4, 1.1, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 5.5 Author RabbitMQ topic
    - Create `content/backend/rabbitmq.md` with H2 sections: exchanges, queues, bindings, acknowledgments, dead-letter queues, clustering
    - _Requirements: 3.5, 1.1, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 5.6 Author Resilience4j topic
    - Create `content/backend/resilience4j.md` with H2 sections: circuit breakers, rate limiters, retry, bulkhead, time limiter
    - _Requirements: 3.6, 1.1, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 5.7 Author MapStruct topic
    - Create `content/backend/mapstruct.md` with H2 sections: mapper interfaces, custom mappings, expression mappings, decorator patterns
    - _Requirements: 3.7, 1.1, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 5.8 Author Linux Administration topic
    - Create `content/infrastructure/linux-administration.md` with H2 sections: file system hierarchy, process management, systemd, networking commands, permissions, shell scripting
    - _Requirements: 3.8, 1.1, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 5.9 Author SQL Performance Tuning topic
    - Create `content/backend/sql-performance-tuning.md` with H2 sections: query plans, indexing strategies, partitioning, query optimization, common anti-patterns
    - _Requirements: 3.9, 1.1, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 5.10 Author Observability topic
    - Create `content/infrastructure/observability.md` with H2 sections: CloudWatch metrics and alarms, Splunk log analysis, Qualys vulnerability scanning
    - _Requirements: 3.10, 1.1, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 5.11 Author Security topic
    - Create `content/backend/security.md` with H2 sections: Log4Shell remediation, CVE response processes, OWASP Top 10, Spring Security configuration
    - _Requirements: 3.11, 1.1, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 5.12 Author Incident Response topic
    - Create `content/backend/incident-response.md` with H2 sections: runbook creation, severity classification, communication protocols, post-mortem processes, on-call practices
    - _Requirements: 3.12, 1.1, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [x] 6. Content Authoring - Frontend Topics
  - Create frontend topic files with comprehensive depth

  - [x] 6.1 Author React topic
    - Create `content/frontend/react.md` with H2 sections: hooks, state management patterns, performance optimization, component patterns, testing strategies
    - Follow mandatory structure with minimum 1500 words, code blocks, Mermaid diagrams
    - _Requirements: 4.1, 1.1, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 6.2 Author TypeScript topic
    - Create `content/frontend/typescript.md` with H2 sections: type system, generics, utility types, conditional types, mapped types, declaration files
    - _Requirements: 4.2, 1.1, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 6.3 Author Angular topic
    - Create `content/frontend/angular.md` with H2 sections: modules, components, services, dependency injection, RxJS operators, change detection
    - _Requirements: 4.3, 1.1, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 6.4 Author Next.js topic
    - Create `content/frontend/nextjs.md` with H2 sections: SSR, SSG, ISR, API routes, middleware, App Router patterns
    - _Requirements: 4.4, 1.1, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 6.5 Author HTML & CSS topic
    - Create `content/frontend/html-css.md` with H2 sections: semantic HTML, accessibility, Flexbox, Grid, responsive design, CSS custom properties
    - _Requirements: 4.5, 1.1, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 6.6 Author JavaScript topic
    - Create `content/frontend/javascript.md` with H2 sections: ES6+ features, closures, prototypes, event loop, promises, generators, module systems
    - _Requirements: 4.6, 1.1, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [x] 7. Content Authoring - CS Fundamentals and System Design
  - Create system design and CS fundamentals topic files

  - [x] 7.1 Author Operating Systems topic
    - Create `content/system-design/operating-systems.md` with H2 sections: process scheduling, memory management, virtual memory, file systems, concurrency primitives, inter-process communication
    - Each section minimum 150 words
    - _Requirements: 5.1, 1.1, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 7.2 Author Networking topic
    - Create `content/system-design/networking.md` with H2 sections: TCP/IP stack, HTTP/HTTPS, DNS resolution, load balancing algorithms, CDNs, WebSockets
    - Each section minimum 150 words
    - _Requirements: 5.2, 1.1, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 7.3 Author Design Patterns topic
    - Create `content/system-design/design-patterns.md` with H2 sections: GoF patterns, enterprise integration patterns, microservice patterns with Java/Spring examples
    - Each section minimum 150 words
    - _Requirements: 5.3, 1.1, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 7.4 Author System Design topic
    - Create `content/system-design/system-design.md` with H2 sections: distributed systems fundamentals, CAP theorem, consistency models, horizontal scaling, database sharding, caching strategies
    - Each section minimum 150 words
    - _Requirements: 5.4, 1.1, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [x] 8. Content Authoring - Deepen Existing Migrated Content
  - Enhance all migrated topic files to meet the 1500-word minimum and mandatory section structure

  - [x] 8.1 Deepen data structures and algorithms topics
    - Enhance each file in `content/data-structures-and-algorithms/` (array, big-o-notation, graph, heap, list, map, queue, ring-buffer, sets, tree, trie) to meet mandatory structure
    - Add Quick Reference, When to Use, Code Examples, Common Pitfalls, Interview Questions, Production Tips, Related Topics sections where missing
    - Ensure minimum 1500 words prose per file
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [x] 8.2 Deepen Git topics
    - Enhance each file in `content/git/` to meet mandatory structure and 1500-word minimum
    - Add missing sections, Mermaid diagrams for branching flows, interview questions
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [x] 8.3 Deepen backend topics (Java, Spring, MongoDB, Kafka, Maven, Gradle)
    - Enhance each migrated backend file to meet mandatory structure and 1500-word minimum
    - Add missing sections, production-oriented depth, Mermaid diagrams
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [x] 8.4 Deepen interview prep topics
    - Enhance `cracking-the-coding-interview.md` and `grokking-algorithms.md` to meet mandatory structure
    - Create `behavioral-prep.md` with full content
    - _Requirements: 1.1, 1.2, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

- [x] 9. Checkpoint - All content authored and migrated
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. App Feature Fixes - Dashboard, Interactive Components, View Modes
  - Fix existing broken features in the React application

  - [x] 10.1 Fix Dashboard page
    - Implement progress overview section showing topics started, total topics, overall percentage
    - Render WeeklyStats, DueForReview, DailyGoal, PomodoroTimer, ResumePrompt study components
    - Add CSS styles for `.page-dashboard`, `.dashboard-widgets`, `.dashboard-progress`, `.dashboard-review`, `.dashboard-bookmarks`
    - Render BookmarksList with empty-state message
    - Handle Content_Manifest fetch failure gracefully (show zero values)
    - Add "Recently Studied" section (up to 5 topics from localStorage `csguide:recent-topics`)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 10.2 Fix interactive components rendering
    - Ensure BigOChart, CodePlayground, DSVisualization, Quiz, SQLPlayground components render correctly from interactive content nodes
    - Implement React.lazy loading with Suspense fallback for each interactive component
    - Add error boundary around interactive components to display inline error message on failure
    - Render nothing for unrecognized `interactiveType` values
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8_

  - [x] 10.3 Fix content view modes (Full, Cheat Sheet, ELI5)
    - Implement Full mode: display all sections and content nodes without truncation
    - Implement Cheat Sheet mode: truncate to 500 words per section, keep code blocks in full
    - Implement ELI5 mode: display only paragraph/blockquote nodes, max 3 sentences per section
    - Style ViewToggle with `.view-toggle`, `.view-toggle-btn`, `.view-toggle-btn--active` classes
    - Default to "Full" when no localStorage preference exists
    - Persist selection to localStorage key `view-preference`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [x]* 10.4 Write unit tests for Dashboard, interactive components, and view modes
    - Test Dashboard renders all required widgets and handles manifest fetch failure
    - Test each interactive component type renders from content nodes
    - Test view toggle persists preference and applies correct truncation
    - _Requirements: 10.1, 10.2, 11.1, 12.1_

- [x] 11. New Pages and Routes
  - Add missing page components and route configuration

  - [x] 11.1 Create Progress page
    - Create `src/pages/ProgressPage.tsx` displaying per-category completion bars
    - Calculate completion as topics with at least one section marked complete / total topics per category
    - Lazy-load within AppShell at `/progress`
    - _Requirements: 13.1, 13.7_

  - [x] 11.2 Create Search results page
    - Create `src/pages/SearchPage.tsx` reading `?q=` URL parameter
    - Display section-level results with topic title and matching section title
    - Show prompt when query is empty or missing
    - Include category filter controls
    - _Requirements: 13.2, 13.3, 13.7_

  - [x] 11.3 Create Settings page
    - Create `src/pages/SettingsPage.tsx` with theme toggle (light/dark), daily goal slider (1-20), notification toggle
    - Persist all selections to localStorage under `csguide:settings`
    - _Requirements: 13.4, 13.7_

  - [x] 11.4 Create Category overview page
    - Create `src/pages/CategoryPage.tsx` listing all topics in a category with completion status
    - Render NotFound page for invalid categorySlug
    - _Requirements: 13.5, 13.6, 13.7_

  - [x] 11.5 Update App.tsx route configuration
    - Add lazy-loaded route definitions for `/progress`, `/search`, `/settings`, `/category/:categorySlug`
    - Ensure all new routes are within the AppShell layout
    - Add NotFound catch-all route
    - _Requirements: 13.7_

  - [x]* 11.6 Write unit tests for new pages
    - Test Progress page renders per-category completion
    - Test Search page handles empty query and displays results
    - Test Settings page persists preferences
    - Test Category page shows NotFound for invalid slugs
    - _Requirements: 13.1, 13.2, 13.4, 13.5, 13.6_

- [x] 12. Code Block and Search Enhancements
  - Implement enhanced code block component and search improvements

  - [x] 12.1 Implement enhanced code block component
    - Create/update `src/components/content/EnhancedCodeBlock.tsx` with language label in header
    - Add copy button using `navigator.clipboard.writeText()`
    - Implement "Copied" confirmation state (2 seconds) and error state (1 second)
    - Hide language label when language is empty
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_

  - [x] 12.2 Implement Mermaid renderer component
    - Create `src/components/content/MermaidRenderer.tsx` with 5-second timeout
    - On success: inject SVG via `dangerouslySetInnerHTML`
    - On error: display raw source with "Syntax error" label
    - On timeout: display raw source with "Rendering timed out" label
    - _Requirements: 14.2, 14.3, 14.4_

  - [x] 12.3 Implement admonition component
    - Create `src/components/content/Admonition.tsx` with type-specific icon, background color, and left border
    - Support note (ℹ️), warning (⚠️), and tip (💡) types
    - _Requirements: 15.2_

  - [x] 12.4 Implement task list and footnote rendering
    - Create components to render task-list nodes as read-only checkboxes
    - Create footnote rendering with bidirectional links between references and definitions
    - _Requirements: 15.3, 15.4_

  - [x] 12.5 Implement search category filter and section-level results
    - Add category filter control to search UI listing all categories from manifest
    - Filter results to selected category when active; show all when no filter
    - Display results at section level with section heading as title
    - Generate snippets of up to 120 characters centered on first matching term
    - Navigate to `/topic/:categorySlug/:topicSlug#sectionId` on result selection
    - _Requirements: 17.2, 17.3, 17.4, 17.5_

  - [x]* 12.6 Write property test for search category filter
    - **Property 7: Search category filter correctness**
    - Generate random search results with category assignments; verify filter returns only matching results
    - **Validates: Requirements 17.2, 17.3**

  - [x]* 12.7 Write property test for search snippet generation
    - **Property 8: Search snippet generation constraints**
    - Generate random section text and search terms; verify snippet ≤ 120 chars, contains term, centered on first occurrence
    - **Validates: Requirements 17.4**

  - [x]* 12.8 Write unit tests for code block, Mermaid, and admonition components
    - Test copy button lifecycle (idle → copied → idle)
    - Test Mermaid handles valid/invalid/timeout cases
    - Test admonition renders correct styling per type
    - _Requirements: 14.2, 14.3, 14.4, 15.2, 16.5, 16.6_

- [x] 13. Checkpoint - App features and search enhancements complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Mobile Responsiveness
  - Implement mobile-first responsive design with sidebar overlay and bottom nav

  - [x] 14.1 Implement mobile sidebar overlay and hamburger menu
    - Add hamburger menu icon visible at viewport < 768px
    - Implement sidebar as full-height overlay anchored to left edge
    - Dismiss on tap outside or close button; return focus to main content
    - _Requirements: 18.1, 18.2_

  - [x] 14.2 Implement bottom navigation bar
    - Create fixed bottom nav bar visible at viewport < 768px with max 5 items (home, topics, search, bookmarks, settings)
    - Ensure minimum 44×44px touch targets with 8px spacing
    - _Requirements: 18.3, 18.6_

  - [x] 14.3 Implement responsive content layout
    - Content cards at 100% width with no horizontal margin on mobile
    - Code blocks with horizontal scroll (no page-level horizontal scroll)
    - Body text minimum 16px font size on mobile
    - Add CSS breakpoints at 768px for all responsive behavior
    - _Requirements: 18.4, 18.5, 18.6, 18.7_

  - [x]* 14.4 Write unit tests for mobile navigation
    - Test hamburger menu opens/closes sidebar overlay
    - Test bottom nav renders correct items on mobile viewport
    - _Requirements: 18.1, 18.2, 18.3_

- [x] 15. PWA and Offline Support
  - Implement service worker, manifest, and offline capabilities

  - [x] 15.1 Create web app manifest
    - Create `public/manifest.json` with app name, icons (192x192, 512x512), theme color `#6366f1`, display `standalone`
    - Create or source PWA icons at required sizes
    - Link manifest in `index.html`
    - _Requirements: 19.2_

  - [x] 15.2 Implement service worker with Workbox
    - Create service worker using Workbox for precaching app shell and content JSON
    - Implement cache-first strategy for content JSON and images
    - Implement stale-while-revalidate for app shell (HTML/JS/CSS)
    - Precache: index.html, JS/CSS chunks, content-manifest.json, all topic JSON, search-index.json
    - Register service worker in app entry point
    - _Requirements: 19.1, 19.5_

  - [x] 15.3 Implement offline indicator and update notifications
    - Display "Offline" indicator in header within 3 seconds of connectivity loss
    - Hide indicator when network is restored
    - Display non-blocking notification when new content is available with refresh action
    - Handle precache failure: show notification that offline access is unavailable
    - _Requirements: 19.3, 19.5, 19.6, 19.7_

  - [x] 15.4 Ensure Pomodoro timer works offline
    - Verify PomodoroTimer uses only local state (no network requests for start/pause/reset)
    - _Requirements: 19.4_

  - [x]* 15.5 Write unit tests for offline behavior
    - Test offline indicator appears/disappears with network state changes
    - Test service worker registration handles failure gracefully
    - _Requirements: 19.3, 19.6_

- [x] 16. Performance and Polish
  - Add transitions, loading states, keyboard shortcuts, and reading time

  - [x] 16.1 Implement route transition animations
    - Add fade transition (150-300ms) between route changes for outgoing and incoming page content
    - _Requirements: 20.1_

  - [x] 16.2 Implement skeleton loading states
    - Create skeleton placeholder components for header, cards, sidebar
    - Display skeletons while content is loading
    - _Requirements: 20.2_

  - [x] 16.3 Implement keyboard shortcuts
    - Add shortcut handler: `/` for search focus, `[` for previous topic, `]` for next topic, `b` for bookmark toggle
    - Guard: only dispatch when no `<input>`, `<textarea>`, or `[contenteditable]` has focus
    - _Requirements: 20.3_

  - [x]* 16.4 Write property test for keyboard shortcut dispatch guard
    - **Property 12: Keyboard shortcut dispatch guard**
    - Generate random keyboard events with varying focus states; verify shortcuts only fire when no input element has focus
    - **Validates: Requirements 20.3**

  - [x] 16.5 Implement back-to-top button
    - Display floating "Back to top" button when user scrolls past first viewport height
    - Smooth scroll to top on activation
    - _Requirements: 20.4_

  - [x] 16.6 Implement reading time and table of contents
    - Display estimated reading time below topic title (`Math.ceil(wordCount / 200)` min, minimum 1 minute)
    - Display table of contents sidebar for topics with more than 5 sections (clickable links to sections)
    - _Requirements: 20.5, 20.6_

  - [x]* 16.7 Write property test for reading time calculation
    - **Property 11: Reading time calculation**
    - Generate random word counts; verify reading time equals `Math.ceil(W / 200)` with minimum 1 minute
    - **Validates: Requirements 20.5**

  - [x]* 16.8 Write unit tests for performance features
    - Test skeleton loading states render correct placeholder shapes
    - Test back-to-top button visibility on scroll
    - Test route transitions apply fade animation
    - _Requirements: 20.1, 20.2, 20.4_

- [x] 17. Checkpoint - Mobile, PWA, and performance complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 18. Deployment Readiness
  - Add meta tags, error boundaries, analytics hooks, and static hosting config

  - [x] 18.1 Implement useDocumentMeta hook
    - Create `src/hooks/useDocumentMeta.ts` that sets `document.title` (max 60 chars) and `meta[name="description"]` (max 160 chars)
    - Truncate preserving whole words, append ellipsis when truncated
    - Set og:image to default social image
    - Apply to topic pages (topic name + first section summary) and non-topic pages (app name + generic description)
    - _Requirements: 21.1, 21.2_

  - [x]* 18.2 Write property test for document meta tag truncation
    - **Property 10: Document meta tag truncation**
    - Generate random title and description strings of varying lengths; verify truncation to 60/160 chars preserving whole words
    - **Validates: Requirements 21.1, 21.2**

  - [x] 18.3 Implement error boundaries
    - Add error boundary component wrapping route-level components
    - Display error message and reload button on render errors (not blank screen)
    - _Requirements: 21.4_

  - [x] 18.4 Implement analytics event system
    - Create `src/utils/analytics.ts` with subscribe/trackPageView/trackSearch/trackTopicComplete functions
    - Expose callable event hooks for page view, search query, and topic completion events
    - _Requirements: 21.5_

  - [x] 18.5 Add static hosting configuration
    - Create `public/_redirects` with `/* /index.html 200` for Netlify SPA support
    - Create `vercel.json` with rewrites rule directing all paths to `/index.html`
    - _Requirements: 21.6_

  - [x]* 18.6 Write unit tests for deployment features
    - Test error boundary catches and displays render errors with reload button
    - Test analytics event system subscribe and track functions
    - Test useDocumentMeta sets correct document title and meta description
    - _Requirements: 21.1, 21.4, 21.5_

- [x] 19. Final Checkpoint - All features complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation between major phases
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Content authoring tasks (phases 5-8) are the most time-intensive and can be parallelized across categories
- The content pipeline enhancements (phase 1) must be complete before content migration (phase 3) to ensure new node types are parsed correctly
- All code uses TypeScript following the project's existing conventions

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "3.1"] },
    { "id": 1, "tasks": ["1.4", "1.5", "1.9"] },
    { "id": 2, "tasks": ["1.6", "1.7", "1.8", "1.10", "1.11", "1.13"] },
    { "id": 3, "tasks": ["1.12", "1.14", "3.2", "3.3", "3.4", "3.5"] },
    { "id": 4, "tasks": ["3.6", "3.7"] },
    { "id": 5, "tasks": ["5.1", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "5.8", "5.9", "5.10", "5.11", "5.12"] },
    { "id": 6, "tasks": ["6.1", "6.2", "6.3", "6.4", "6.5", "6.6", "7.1", "7.2", "7.3", "7.4"] },
    { "id": 7, "tasks": ["8.1", "8.2", "8.3", "8.4"] },
    { "id": 8, "tasks": ["10.1", "10.2", "10.3", "11.1", "11.2", "11.3", "11.4", "11.5"] },
    { "id": 9, "tasks": ["10.4", "11.6", "12.1", "12.2", "12.3", "12.4", "12.5"] },
    { "id": 10, "tasks": ["12.6", "12.7", "12.8"] },
    { "id": 11, "tasks": ["14.1", "14.2", "14.3"] },
    { "id": 12, "tasks": ["14.4", "15.1", "15.2"] },
    { "id": 13, "tasks": ["15.3", "15.4", "15.5"] },
    { "id": 14, "tasks": ["16.1", "16.2", "16.3", "16.5", "16.6"] },
    { "id": 15, "tasks": ["16.4", "16.7", "16.8"] },
    { "id": 16, "tasks": ["18.1", "18.3", "18.4", "18.5"] },
    { "id": 17, "tasks": ["18.2", "18.6"] }
  ]
}
```
