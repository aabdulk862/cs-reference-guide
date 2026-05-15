# Requirements Document

## Introduction

The CS Reference Overhaul is a comprehensive transformation of a personal Computer Science study and reference application built with React + Vite. All markdown content is organized consistently and thoroughly inside the `cs-reference-guide/` application directory under `cs-reference-guide/content/`, following a clean category-based hierarchy. The Content_Pipeline (a Vite build-time plugin at `cs-reference-guide/src/plugins/`) scans markdown files from within `cs-reference-guide/content/`, parses them into structured JSON, and generates a content manifest for the React application to consume at runtime. This overhaul addresses 14 major areas: deepening existing content, fixing broken images, adding missing topics from a professional resume, reorganizing file structure into `cs-reference-guide/content/`, removing irrelevant files, updating category mappings, standardizing topic formatting, fixing incomplete app features, adding missing pages/routes, improving the content pipeline, adding mobile responsiveness, implementing PWA/offline support, performance polish, and deployment readiness. The target audience is a software engineer preparing for senior-level interviews working on enterprise distributed systems.

## Glossary

- **Content_Pipeline**: The Vite build-time plugin system at `cs-reference-guide/src/plugins/` that scans markdown files from `cs-reference-guide/content/`, parses them into structured JSON, and generates a content manifest for the React application to consume at runtime.
- **Content_Directory**: The `cs-reference-guide/content/` directory that serves as the single root for all organized markdown Topic_Files, replacing the old scattered workspace-root directories.
- **Category_Mapping**: A configuration entry in `vite-content-plugin.ts` that maps a directory path pattern (relative to `cs-reference-guide/content/`) to a named sidebar category for content organization.
- **Topic_File**: A single markdown file located inside `cs-reference-guide/content/` representing one knowledge base topic, processed by the Content_Pipeline into a JSON file with sections, metadata, and content nodes.
- **Content_Manifest**: The `content-manifest.json` file generated at build time containing all categories, topics, section counts, and word counts for the application to render navigation and content.
- **Mermaid_Diagram**: A text-based diagramming syntax rendered as SVG, used as a replacement for static PNG images in topic files.
- **DDIA**: "Designing Data-Intensive Applications" by Martin Kleppmann — a key reference book for distributed systems concepts.
- **PWA**: Progressive Web App — a web application that uses service workers, manifests, and caching strategies to provide offline access and native-like behavior.
- **Admonition**: A callout block in markdown (e.g., `> [!NOTE]`, `> [!WARNING]`, `> [!TIP]`) used to highlight important information.
- **AppShell**: The root layout component (`AppShell.tsx`) that wraps all routes with sidebar navigation, header, and content area.
- **Service_Worker**: A background script that intercepts network requests to enable offline caching and asset pre-fetching for the PWA.
- **Search_Index**: The `search-index.json` file generated at build time containing indexed content for client-side full-text search.
- **Legacy_Content_Directories**: The old workspace-root directories (`Infosys/`, `Data Structures and Algorithms/`, `Git/`, `Grokking Algorithms/`, `Cracking the Coding Interview/`) that contain markdown content to be migrated into `cs-reference-guide/content/` and then removed.

## Requirements

### Requirement 1: Deepen Existing Markdown Content

**User Story:** As a software engineer preparing for senior-level interviews, I want each topic file to contain comprehensive, thorough explanations with production-oriented depth, so that I can use the reference guide as a complete study resource without needing external materials.

#### Acceptance Criteria

1. THE Content_Pipeline SHALL validate that each Topic_File in `cs-reference-guide/content/` contains a minimum of 1500 words of prose text, excluding code blocks, diagram definitions, headings, and front-matter metadata
2. WHEN a Topic_File is processed, THE Content_Pipeline SHALL verify the presence of the following named sections: "When to Use", "Common Pitfalls", "Interview Questions", "Real-World Use Cases", and "Production Tips"
3. IF a Topic_File is missing one or more of the required named sections, THEN THE Content_Pipeline SHALL log a warning listing each missing section name and the affected file path
4. THE Topic_File SHALL contain at least one language-annotated fenced code block for each concept that describes an implementation pattern, algorithm, or data structure operation
5. WHEN a Topic_File describes an architectural flow, a data structure with relationships between components, or a multi-step algorithm, THE Topic_File SHALL contain a Mermaid_Diagram block illustrating that concept
6. WHEN a Topic_File contains stub or outline-only content (fewer than 200 words of prose text, excluding code blocks and headings), THE Content_Pipeline SHALL log a warning identifying the file as incomplete
7. IF a Topic_File contains between 200 and 1499 words of prose text, THEN THE Content_Pipeline SHALL log a notice identifying the file as below the minimum depth threshold
8. THE Topic_File SHALL provide consistent depth across all sections, ensuring no section contains fewer than 100 words of explanatory prose unless it is a pure code example or diagram section

### Requirement 2: Fix or Remove Broken Image References

**User Story:** As a user of the reference guide, I want all visual content to render correctly, so that diagrams and illustrations enhance my understanding rather than showing broken placeholders.

#### Acceptance Criteria

1. THE Topic_File SHALL NOT contain markdown image references (`![alt](path)`) or HTML `<img>` tags pointing to local `.png` files that do not exist at the path resolved relative to the Topic_File's own directory location within `cs-reference-guide/content/`
2. WHEN a Topic_File previously referenced a local image for a diagram, THE Topic_File SHALL replace that reference with a Mermaid_Diagram code block if the diagram depicts a flowchart, tree, graph, or sequence; otherwise with an ASCII art representation or a descriptive text paragraph that conveys the same structural information as the original image
3. WHEN a `.png` file inside `cs-reference-guide/content/` is not referenced by any Topic_File via markdown image syntax or HTML `<img>` tag, THE Content_Pipeline build process SHALL output the file path to a list of orphaned files reported in the build log
4. THE Topic_File SHALL NOT contain image references where the URL begins with `http://` or `https://`
5. IF a Topic_File contains a markdown image reference or HTML `<img>` tag whose target path cannot be resolved to an existing file within `cs-reference-guide/content/`, THEN THE Content_Pipeline build process SHALL report the broken reference including the Topic_File path and the unresolved image path in the build log

### Requirement 3: Add Missing Backend and Infrastructure Topics

**User Story:** As a software engineer, I want the reference guide to cover all backend and infrastructure technologies from my professional experience, so that I can review and prepare for questions on my full technology stack.

#### Acceptance Criteria

1. WHEN the Content_Pipeline scans `cs-reference-guide/content/`, THE Content_Pipeline SHALL find and process a Topic_File for Docker and Containerization that contains a dedicated H2 section for each of: images, containers, Dockerfile syntax, multi-stage builds, Docker Compose, networking, and volumes, producing a manifest entry with sectionCount >= 7 and wordCount >= 50 per section
2. WHEN the Content_Pipeline scans `cs-reference-guide/content/`, THE Content_Pipeline SHALL find and process a Topic_File for Kubernetes and EKS that contains a dedicated H2 section for each of: pods, deployments, services, ingress, ConfigMaps, Secrets, Helm charts, and EKS-specific configuration, producing a manifest entry with sectionCount >= 8 and wordCount >= 50 per section
3. WHEN the Content_Pipeline scans `cs-reference-guide/content/`, THE Content_Pipeline SHALL find and process Topic_Files for AWS Services that contain a dedicated H2 section for each of: CloudWatch, S3, Pinpoint, EKS, IAM, and VPC, where each section describes at least one operational use case, producing manifest entries with sectionCount >= 6 and wordCount >= 50 per section
4. WHEN the Content_Pipeline scans `cs-reference-guide/content/`, THE Content_Pipeline SHALL find and process a Topic_File for CI/CD Pipelines that contains a dedicated H2 section for each of: GitLab CI/CD and Jenkins pipeline syntax, stages, artifacts, and deployment strategies, producing a manifest entry with sectionCount >= 4 and wordCount >= 50 per section
5. WHEN the Content_Pipeline scans `cs-reference-guide/content/`, THE Content_Pipeline SHALL find and process a Topic_File for RabbitMQ that contains a dedicated H2 section for each of: exchanges, queues, bindings, acknowledgments, dead-letter queues, and clustering, producing a manifest entry with sectionCount >= 6 and wordCount >= 50 per section
6. WHEN the Content_Pipeline scans `cs-reference-guide/content/`, THE Content_Pipeline SHALL find and process a Topic_File for Resilience4j that contains a dedicated H2 section for each of: circuit breakers, rate limiters, retry, bulkhead, and time limiter patterns, producing a manifest entry with sectionCount >= 5 and wordCount >= 50 per section
7. WHEN the Content_Pipeline scans `cs-reference-guide/content/`, THE Content_Pipeline SHALL find and process a Topic_File for MapStruct that contains a dedicated H2 section for each of: mapper interfaces, custom mappings, expression mappings, and decorator patterns, producing a manifest entry with sectionCount >= 4 and wordCount >= 50 per section
8. WHEN the Content_Pipeline scans `cs-reference-guide/content/`, THE Content_Pipeline SHALL find and process a Topic_File for Linux Administration that contains a dedicated H2 section for each of: file system hierarchy, process management, systemd, networking commands, permissions, and shell scripting, producing a manifest entry with sectionCount >= 6 and wordCount >= 50 per section
9. WHEN the Content_Pipeline scans `cs-reference-guide/content/`, THE Content_Pipeline SHALL find and process a Topic_File for SQL Performance Tuning that contains a dedicated H2 section for each of: query plans, indexing strategies, partitioning, query optimization, and common anti-patterns, producing a manifest entry with sectionCount >= 5 and wordCount >= 50 per section
10. WHEN the Content_Pipeline scans `cs-reference-guide/content/`, THE Content_Pipeline SHALL find and process a Topic_File for Observability that contains a dedicated H2 section for each of: CloudWatch metrics and alarms, Splunk log analysis, and Qualys vulnerability scanning, producing a manifest entry with sectionCount >= 3 and wordCount >= 50 per section
11. WHEN the Content_Pipeline scans `cs-reference-guide/content/`, THE Content_Pipeline SHALL find and process a Topic_File for Security that contains a dedicated H2 section for each of: Log4Shell remediation, CVE response processes, OWASP Top 10, and Spring Security configuration, producing a manifest entry with sectionCount >= 4 and wordCount >= 50 per section
12. WHEN the Content_Pipeline scans `cs-reference-guide/content/`, THE Content_Pipeline SHALL find and process a Topic_File for Incident Response that contains a dedicated H2 section for each of: runbook creation, severity classification, communication protocols, post-mortem processes, and on-call practices, producing a manifest entry with sectionCount >= 5 and wordCount >= 50 per section
13. WHEN the Content_Pipeline processes any Topic_File specified in criteria 1-12, THE Content_Pipeline SHALL assign it to a category via CATEGORY_MAPPINGS so that the topic appears in the content manifest under a non-null category and is navigable from the sidebar
14. IF a Topic_File specified in criteria 1-12 is missing from `cs-reference-guide/content/` or contains no H2 sections, THEN THE Content_Pipeline SHALL either skip the file (if missing) or produce a manifest entry with sectionCount of 0, causing the acceptance test for that criterion to fail

### Requirement 4: Add Missing Frontend Topics

**User Story:** As a full-stack engineer, I want the reference guide to cover frontend technologies comprehensively, so that I can prepare for frontend system design and coding interviews.

#### Acceptance Criteria

1. WHEN the Content_Pipeline scans `cs-reference-guide/content/`, THE Content_Pipeline SHALL find and process a Topic_File for React that contains at least 5 H2-level sections individually addressing hooks, state management patterns, performance optimization, component patterns, and testing strategies, producing a manifest entry with sectionCount >= 5 and wordCount > 0
2. WHEN the Content_Pipeline scans `cs-reference-guide/content/`, THE Content_Pipeline SHALL find and process a Topic_File for TypeScript that contains at least 6 H2-level sections individually addressing the type system, generics, utility types, conditional types, mapped types, and declaration files, producing a manifest entry with sectionCount >= 6 and wordCount > 0
3. WHEN the Content_Pipeline scans `cs-reference-guide/content/`, THE Content_Pipeline SHALL find and process a Topic_File for Angular that contains at least 6 H2-level sections individually addressing modules, components, services, dependency injection, RxJS operators, and change detection, producing a manifest entry with sectionCount >= 6 and wordCount > 0
4. WHEN the Content_Pipeline scans `cs-reference-guide/content/`, THE Content_Pipeline SHALL find and process a Topic_File for Next.js that contains at least 6 H2-level sections individually addressing SSR, SSG, ISR, API routes, middleware, and App Router patterns, producing a manifest entry with sectionCount >= 6 and wordCount > 0
5. WHEN the Content_Pipeline scans `cs-reference-guide/content/`, THE Content_Pipeline SHALL find and process a Topic_File for HTML and CSS that contains at least 6 H2-level sections individually addressing semantic HTML, accessibility, Flexbox, Grid, responsive design, and CSS custom properties, producing a manifest entry with sectionCount >= 6 and wordCount > 0
6. WHEN the Content_Pipeline scans `cs-reference-guide/content/`, THE Content_Pipeline SHALL find and process a Topic_File for JavaScript that contains at least 7 H2-level sections individually addressing ES6+ features, closures, prototypes, the event loop, promises, generators, and module systems, producing a manifest entry with sectionCount >= 7 and wordCount > 0
7. THE Content_Pipeline SHALL map all frontend Topic_Files located under `cs-reference-guide/content/frontend/` to a "Frontend" category via a CATEGORY_MAPPINGS entry so that resolveCategory returns "Frontend" for each frontend Topic_File path
8. IF a frontend Topic_File is missing from `cs-reference-guide/content/frontend/` or contains no parseable content below its H1 heading, THEN THE Content_Pipeline SHALL log a warning and exclude that topic from the manifest without failing the build

### Requirement 5: Add Missing CS Fundamentals Topics

**User Story:** As a software engineer preparing for system design interviews, I want the reference guide to cover core CS fundamentals at depth, so that I can articulate distributed systems concepts and design trade-offs confidently.

#### Acceptance Criteria

1. WHEN the Content_Pipeline scans `cs-reference-guide/content/`, THE Content_Pipeline SHALL find and process a Topic_File for Operating Systems containing H2-level sections for each of: process scheduling, memory management, virtual memory, file systems, concurrency primitives, and inter-process communication, where each section contains at least 150 words of explanatory content and the parsed output produces a sectionCount of at least 6 and a non-zero wordCount
2. WHEN the Content_Pipeline scans `cs-reference-guide/content/`, THE Content_Pipeline SHALL find and process a Topic_File for Networking containing H2-level sections for each of: TCP/IP stack, HTTP/HTTPS, DNS resolution, load balancing algorithms, CDNs, and WebSockets, where each section contains at least 150 words of explanatory content and the parsed output produces a sectionCount of at least 6 and a non-zero wordCount
3. WHEN the Content_Pipeline scans `cs-reference-guide/content/`, THE Content_Pipeline SHALL find and process a Topic_File for Design Patterns containing H2-level sections for each of: GoF patterns, enterprise integration patterns, and microservice patterns with Java/Spring examples, where each section contains at least 150 words of explanatory content and the parsed output produces a sectionCount of at least 3 and a non-zero wordCount
4. WHEN the Content_Pipeline scans `cs-reference-guide/content/`, THE Content_Pipeline SHALL find and process a Topic_File for System Design containing H2-level sections for each of: distributed systems fundamentals, CAP theorem, consistency models, horizontal scaling, database sharding, and caching strategies, where each section contains at least 150 words of explanatory content and the parsed output produces a sectionCount of at least 6 and a non-zero wordCount
5. WHEN the Content_Pipeline processes the Operating Systems, Networking, Design Patterns, and System Design Topic_Files, THE Content_Pipeline SHALL map them to a CATEGORY_MAPPINGS entry so that each topic appears in the content manifest under a category and is accessible via sidebar navigation
6. IF a Topic_File for Operating Systems, Networking, Design Patterns, or System Design does not exist in `cs-reference-guide/content/` at build time, THEN THE Content_Pipeline SHALL log a warning message indicating the missing topic file and continue processing remaining files without failure

### Requirement 6: Reorganize File Structure Into cs-reference-guide

**User Story:** As a maintainer of the reference guide, I want all content organized into a clean, logical hierarchy inside the `cs-reference-guide/` application directory, so that the sidebar navigation is intuitive, topics are easy to locate, and the project is self-contained.

#### Acceptance Criteria

1. THE `cs-reference-guide/content/` directory SHALL organize Topic_Files into the following category subdirectories: `backend/`, `frontend/`, `infrastructure/`, `data-structures-and-algorithms/`, `system-design/`, `interview-prep/`, and `git/`
2. WHEN migrating content from the Legacy_Content_Directories, THE workspace SHALL move Topic_Files from `Infosys/Java/`, `Infosys/Spring/`, `Infosys/MongoDB/`, `Infosys/Introduction to Apache Kafka/`, `Infosys/Apache Maven/`, and `Infosys/Gradle/` into `cs-reference-guide/content/backend/`
3. WHEN migrating content from the Legacy_Content_Directories, THE workspace SHALL move or create frontend Topic_Files (React, TypeScript, Angular, Next.js, HTML-CSS-JavaScript) inside `cs-reference-guide/content/frontend/`
4. WHEN migrating content from the Legacy_Content_Directories, THE workspace SHALL move or create infrastructure Topic_Files (Docker, Kubernetes, AWS, CI-CD, Linux, Observability) inside `cs-reference-guide/content/infrastructure/`
5. WHEN migrating content from the Legacy_Content_Directories, THE workspace SHALL move Topic_Files from `Data Structures and Algorithms/` into `cs-reference-guide/content/data-structures-and-algorithms/`
6. WHEN migrating content from the Legacy_Content_Directories, THE workspace SHALL move or create system design Topic_Files (DDIA content, System Design) inside `cs-reference-guide/content/system-design/`
7. WHEN migrating content from the Legacy_Content_Directories, THE workspace SHALL move Topic_Files from `Cracking the Coding Interview/`, `Grokking Algorithms/`, and interview-related content into `cs-reference-guide/content/interview-prep/`
8. WHEN migrating content from the Legacy_Content_Directories, THE workspace SHALL move Topic_Files from `Git/` into `cs-reference-guide/content/git/`
9. THE Category_Mapping configuration SHALL contain a pattern entry for every subdirectory under `cs-reference-guide/content/` so that resolveCategory returns a non-null category string for all non-excluded Topic_Files
10. IF a Topic_File's directory path does not match any entry in the Category_Mapping configuration, THEN THE Content_Pipeline SHALL log a warning identifying the unmatched file path and exclude it from the content manifest without causing a build failure
11. WHEN the Category_Mapping is updated to reflect the new `cs-reference-guide/content/` structure, THE Content_Pipeline SHALL ensure all previously resolved Topic_Files retain a valid category assignment after migration
12. THE Content_Pipeline SHALL scan content exclusively from `cs-reference-guide/content/` and SHALL NOT scan markdown files from the workspace root or Legacy_Content_Directories

### Requirement 7: Delete Irrelevant Files and Clean Up Legacy Directories

**User Story:** As a maintainer, I want the workspace free of irrelevant or duplicate content and the old scattered directory structure cleaned up, so that the Content_Pipeline processes only meaningful study material from within `cs-reference-guide/` and the build is clean.

#### Acceptance Criteria

1. THE workspace SHALL NOT contain the `public/` directory at the workspace root (old static HTML guides) after migration is complete
2. THE workspace SHALL NOT contain `.png` image files inside `cs-reference-guide/content/` whose filename does not appear in a markdown image reference (`![...](...filename...)`) within any Topic_File in `cs-reference-guide/content/`
3. THE workspace SHALL NOT contain `resume.tex` at the workspace root or in any directory that contains Topic_Files
4. THE workspace SHALL NOT contain markdown files whose filename includes "Scope Document" (files that consist only of course outlines listing objectives and key topics without explanatory prose, code examples, or diagrams)
5. THE Content_Pipeline exclusion filter SHALL exclude files matching the patterns: `*.tex`, `public/**`, `*Scope Document*`, and files in dot-prefixed directories
6. WHEN a directory contains only files identified for deletion (no remaining Topic_Files or referenced images), THE workspace SHALL NOT contain that empty directory
7. WHEN all relevant content has been migrated into `cs-reference-guide/content/`, THE workspace SHALL remove the Legacy_Content_Directories (`Infosys/`, `Data Structures and Algorithms/`, `Git/`, `Grokking Algorithms/`, `Cracking the Coding Interview/`) from the workspace root, as their content now lives inside `cs-reference-guide/content/`
8. THE workspace SHALL NOT contain the `markdowns/` directory at the workspace root after migration, as all markdown content is consolidated inside `cs-reference-guide/content/`

### Requirement 8: Update Content Pipeline Category Mappings

**User Story:** As a user navigating the sidebar, I want every content directory inside `cs-reference-guide/content/` to map to a visible category, so that no topics are silently dropped from the build.

#### Acceptance Criteria

1. THE Category_Mapping configuration SHALL contain entries that map each subdirectory under `cs-reference-guide/content/` (backend, frontend, infrastructure, data-structures-and-algorithms, system-design, interview-prep, git, and all new directories) to a named category, such that every markdown file in those directories resolves to exactly one category
2. WHEN a new markdown file is added to a directory inside `cs-reference-guide/content/` that already has a Category_Mapping entry, THE Content_Pipeline SHALL include it in the Content_Manifest on the next build without requiring changes to the Category_Mapping configuration
3. IF a markdown file exists in a directory inside `cs-reference-guide/content/` that has no Category_Mapping entry, THEN THE Content_Pipeline SHALL log a warning to the build console that includes the relative file path of the unmapped file
4. WHEN the Content_Pipeline processes all mapped directories under `cs-reference-guide/content/`, THE Content_Manifest SHALL contain at least one topic entry for every category defined in the Category_Mapping configuration that contains at least one non-empty markdown file

### Requirement 9: Standardize Topic File Formatting

**User Story:** As a user reading topics, I want a consistent, thorough structure across all files inside `cs-reference-guide/content/`, so that I can quickly find cheat sheets, code examples, diagrams, interview questions, and related topics in a predictable layout.

#### Acceptance Criteria

1. THE Topic_File SHALL begin with a Quick Reference or Cheat Sheet section containing at least 3 key facts, syntax summaries, or command references presented as a bulleted or numbered list
2. THE Topic_File SHALL contain a Code Examples section with at least 2 code snippets that demonstrate typical usage of the topic, using language-annotated fenced code blocks
3. IF the topic involves system interactions, data flow, or data structures, THEN THE Topic_File SHALL contain at least 1 Mermaid_Diagram block visualizing architecture, data flow, or structural relationships
4. THE Topic_File SHALL contain a Common Interview Questions section with at least 3 questions, each followed by a model answer of 1 to 3 sentences
5. THE Topic_File SHALL contain a Production Tips section with at least 2 tips covering operational trade-offs, monitoring metrics, or known failure modes
6. THE Topic_File SHALL contain a Related Topics section as the last section in the file, with links to at least 2 other Topic_Files in `cs-reference-guide/content/` that share concepts, prerequisites, or use cases with the current topic
7. THE Topic_File SHALL present sections in the following fixed order: Quick Reference, Code Examples, Mermaid Diagrams (if applicable), Common Interview Questions, Production Tips, Related Topics
8. THE Topic_File SHALL use consistent markdown formatting throughout: H1 for the topic title, H2 for major sections, H3 for subsections, and consistent use of bold, italic, and code formatting for technical terms

### Requirement 10: Fix Dashboard Page

**User Story:** As a user, I want the dashboard to display study progress, widgets, and recently studied topics, so that I have a useful landing page for my study sessions.

#### Acceptance Criteria

1. WHEN the user navigates to the root route `/`, THE Dashboard page SHALL render a progress overview section displaying the count of topics with at least one completed section, the total topic count from the Content_Manifest, and an overall progress percentage
2. WHEN the user navigates to the root route `/`, THE Dashboard page SHALL render the WeeklyStats, DueForReview, DailyGoal, PomodoroTimer, and ResumePrompt study components, each within its own labelled section element
3. THE Dashboard page SHALL apply CSS styles for `.page-dashboard`, `.dashboard-widgets` grid layout, `.dashboard-progress` stats section, `.dashboard-review` section, and `.dashboard-bookmarks` section so that all elements have defined dimensions, spacing, and visual hierarchy
4. THE Dashboard page SHALL render the BookmarksList component displaying all user bookmarks as clickable links with bookmark title and creation date, and showing an empty-state message when no bookmarks exist
5. IF the Content_Manifest fetch fails or returns a non-OK response, THEN THE Dashboard page SHALL render the progress overview section with zero values for topics started, total topics, and overall progress without displaying an error to the user
6. WHEN the user navigates to the root route `/`, THE Dashboard page SHALL render a "Recently Studied" section that lists up to 5 topics the user has previously visited, ordered by most recent access timestamp, each linking to the corresponding topic page

### Requirement 11: Fix Interactive Components

**User Story:** As a user studying data structures and algorithms, I want interactive components like BigOChart, CodePlayground, and Quiz to render and function, so that I can engage with content beyond static text.

#### Acceptance Criteria

1. WHEN a Topic_File contains an interactive content node of type "bigo-chart", THE application SHALL render the BigOChart component, passing the node's configuration data as props so that the chart displays algorithm complexity curves
2. WHEN a Topic_File contains an interactive content node of type "playground", THE application SHALL render the CodePlayground component with the node's code content pre-populated in an editable text area
3. WHEN a Topic_File contains an interactive content node of type "visualization", THE application SHALL render the DSVisualization component with the node's configuration data as props
4. WHEN a Topic_File contains an interactive content node of type "quiz", THE application SHALL render the Quiz component with questions and answer validation, displaying at least one question with selectable answer options
5. WHEN a Topic_File contains an interactive content node of type "sql-playground", THE application SHALL render the SQLPlayground component with the node's configuration data as props
6. THE application SHALL lazy-load interactive components using React.lazy with a Suspense fallback that displays a visible loading indicator until the component is ready to render
7. IF an interactive component fails to load or throws a runtime error during rendering, THEN THE application SHALL display an inline error message indicating the component could not be loaded, without crashing the surrounding ContentCard or page
8. IF a Topic_File contains an interactive content node with an unrecognized interactiveType value (not one of "bigo-chart", "playground", "visualization", "quiz", or "sql-playground"), THEN THE application SHALL render nothing for that node and SHALL NOT display placeholder text

### Requirement 12: Fix Content View Modes

**User Story:** As a user with varying study needs, I want to toggle between Full, Cheat Sheet, and ELI5 views of a topic, so that I can choose the depth appropriate for my current study context.

#### Acceptance Criteria

1. WHEN the user selects "Full" view mode, THE TopicPage SHALL display all sections and all content nodes within each section without truncation
2. WHEN the user selects "Cheat Sheet" view mode, THE TopicPage SHALL display each section's content truncated to a maximum of 500 words, including code blocks and non-text nodes in full while truncating paragraph and list text to fit within the word budget
3. WHEN the user selects "ELI5" view mode, THE TopicPage SHALL display only paragraph and blockquote nodes from each section, truncated to a maximum of 3 sentences total per section, omitting code blocks, tables, lists, and other non-text nodes
4. THE ViewToggle component SHALL apply CSS styles for `.view-toggle`, `.view-toggle-btn`, and `.view-toggle-btn--active` such that the active mode button has a visually distinct background color from inactive buttons, and inactive buttons have a visible hover state
5. WHEN the TopicPage loads and no view preference exists in localStorage, THE TopicPage SHALL default to "Full" view mode
6. WHEN the user selects a view mode, THE ViewToggle component SHALL persist the selection to localStorage under the storage key `view-preference` so that subsequent topic page visits restore the last selected mode

### Requirement 13: Add Missing Pages and Routes

**User Story:** As a user, I want dedicated pages for progress tracking, search results, settings, and category overviews, so that the application provides a complete navigation experience.

#### Acceptance Criteria

1. WHEN the user navigates to `/progress`, THE application SHALL render a progress dashboard page displaying per-category completion data sourced from the Content_Manifest, where completion for each category is calculated as the number of topics with at least one section marked complete divided by the total topics in that category
2. WHEN the user navigates to `/search`, THE application SHALL render a dedicated search results page that reads the query from a URL query parameter (e.g., `?q=term`), displays results at the section level with topic title and matching section title, and provides category filter controls to narrow results
3. IF the user navigates to `/search` without a query parameter or with an empty query, THEN THE application SHALL display a prompt instructing the user to enter a search term
4. WHEN the user navigates to `/settings`, THE application SHALL render a user preferences page with controls for theme selection (light or dark), daily goal (an integer from 1 to 20 topics per day), and notification toggle (enabled or disabled), persisting selections to local storage
5. WHEN the user navigates to `/category/:categorySlug`, THE application SHALL render a category overview page listing all topics in that category from the Content_Manifest, displaying each topic title and its completion status (not started, in progress, or complete)
6. IF the user navigates to `/category/:categorySlug` with a categorySlug that does not match any category in the Content_Manifest, THEN THE application SHALL render the NotFound page
7. THE App.tsx routes configuration SHALL include lazy-loaded route definitions for `/progress`, `/search`, `/settings`, and `/category/:categorySlug` within the AppShell layout, following the existing lazy-import pattern

### Requirement 14: Support Mermaid Diagrams in Content Pipeline

**User Story:** As a content author, I want Mermaid code blocks in markdown to render as diagrams in the application, so that I can create visual content using text-based syntax without external image files.

#### Acceptance Criteria

1. WHEN the Content_Pipeline encounters a fenced code block with language identifier `mermaid`, THE Content_Pipeline SHALL parse it as a Mermaid_Diagram content node rather than a standard code block
2. WHEN the application renders a Mermaid_Diagram content node, THE application SHALL produce a visible vector graphic (SVG) representation of the diagram within 5 seconds of initiating render
3. IF a Mermaid_Diagram contains invalid syntax, THEN THE application SHALL display the raw source text accompanied by a visible text label indicating a syntax error, and SHALL NOT crash or leave the content area blank
4. IF a Mermaid_Diagram does not complete rendering within 5 seconds, THEN THE application SHALL abort the render attempt and display the raw source text with a visible text label indicating a rendering timeout
5. THE Content_Pipeline SHALL support Mermaid_Diagram nodes containing source text up to 50,000 characters in length

### Requirement 15: Support Admonitions and Extended Markdown

**User Story:** As a content author, I want to use callout blocks, task lists, and footnotes in markdown, so that I can create richer, more structured content.

#### Acceptance Criteria

1. WHEN the Content_Pipeline encounters a blockquote starting with `[!NOTE]`, `[!WARNING]`, or `[!TIP]`, THE Content_Pipeline SHALL parse it as an admonition content node with the corresponding type
2. WHEN the application renders an admonition content node, THE application SHALL display it with a type-specific icon, a type-specific background color, and a type-specific left border so that each admonition type is visually distinguishable from the others
3. WHEN the Content_Pipeline encounters task list syntax (`- [ ]` or `- [x]`), THE Content_Pipeline SHALL parse it as a task list content node preserving checked/unchecked state, and THE application SHALL render task list items as read-only checkboxes reflecting the authored state
4. WHEN the Content_Pipeline encounters footnote reference syntax (`[^identifier]`) and footnote definition syntax (`[^identifier]: text`), THE Content_Pipeline SHALL parse them as linked footnote content nodes, and THE application SHALL render footnote definitions at the bottom of the topic page with bidirectional links between each reference and its definition
5. IF the Content_Pipeline encounters a blockquote starting with an unrecognized admonition type (not `[!NOTE]`, `[!WARNING]`, or `[!TIP]`), THEN THE Content_Pipeline SHALL parse it as a standard blockquote content node

### Requirement 16: Add Code Block Enhancements

**User Story:** As a user reading code examples, I want a copy button and language label on code blocks, so that I can quickly copy snippets and identify the programming language.

#### Acceptance Criteria

1. WHEN the application renders a code block content node, THE application SHALL display a "Copy" button positioned within the code block header area
2. WHEN the user clicks the "Copy" button on a code block, THE application SHALL copy the full text content of the code block to the system clipboard
3. WHEN the application renders a code block content node with a non-empty language identifier, THE application SHALL display the language name as a text label in the code block header
4. WHEN the application renders a code block content node with an empty or missing language identifier, THE application SHALL not display a language label
5. WHEN the user clicks the "Copy" button and the copy operation succeeds, THE application SHALL change the button label to a confirmation state (e.g., "Copied") for a duration between 1 and 3 seconds, then revert to the default "Copy" label
6. IF the clipboard write operation fails when the user clicks the "Copy" button, THEN THE application SHALL display an error indication on the button for at least 1 second

### Requirement 17: Improve Search Functionality

**User Story:** As a user searching for specific content, I want search to index code blocks, support category filters, and return section-level results, so that I can find precise information quickly.

#### Acceptance Criteria

1. WHEN the Search_Index is built from Topic_Files in `cs-reference-guide/content/`, THE application SHALL include the full text content of code blocks (the `code` field of code-type ContentNodes) in the searchable content for each section, concatenated with prose text
2. WHEN the user performs a search, THE application SHALL display a category filter control that lists all available categories from the content manifest, allowing the user to select one category to restrict results to topics belonging to that category, or select no filter to search across all categories
3. IF the user has selected a category filter, THEN THE application SHALL return only search results whose topicId belongs to the selected category
4. WHEN the user performs a search, THE application SHALL return results at the section level, displaying the section heading as the result title and a text snippet of up to 120 characters centered around the first matching term
5. WHEN the user selects a search result, THE application SHALL navigate to the topic page at the URL `/topic/:categorySlug/:topicSlug#sectionId` and scroll the matching section element into the visible viewport within 500 milliseconds of page load

### Requirement 18: Mobile Responsiveness

**User Story:** As a user studying on a mobile device, I want the application to be fully usable on screens smaller than 768px, so that I can review topics on my phone during commutes.

#### Acceptance Criteria

1. WHEN the viewport width is less than 768px, THE AppShell SHALL hide the sidebar and display a hamburger menu icon that, when tapped, opens the sidebar as a full-height overlay anchored to the left edge of the screen
2. WHEN the user taps outside the sidebar overlay or taps a close button within the overlay, THE AppShell SHALL dismiss the sidebar overlay and return focus to the main content area
3. WHEN the viewport width is less than 768px, THE application SHALL display a fixed bottom navigation bar containing no more than 5 primary navigation items (topics list, search, bookmarks, settings, and home)
4. WHEN the viewport width is less than 768px, THE application SHALL render content cards at 100% of the available container width with no horizontal margin
5. WHEN a code block's content exceeds the viewport width and the viewport width is less than 768px, THE application SHALL enable horizontal scrolling within that code block without causing the page itself to scroll horizontally
6. WHILE the viewport width is less than 768px, THE application SHALL ensure all interactive tap targets have a minimum size of 44x44 CSS pixels with at least 8px spacing between adjacent targets
7. WHILE the viewport width is less than 768px, THE application SHALL render body text at a minimum font size of 16px CSS pixels to ensure readability without zooming

### Requirement 19: PWA and Offline Support

**User Story:** As a user who studies in environments with unreliable internet, I want the application to work offline after initial load, so that I can access my reference material anywhere.

#### Acceptance Criteria

1. WHEN the application loads for the first time, THE Service_Worker SHALL pre-cache the Content_Manifest, all topic JSON files, and the application shell assets so that subsequent visits function without network connectivity
2. THE application SHALL include a web app manifest (`manifest.json`) with app name, icons (at minimum 192x192 and 512x512 pixels), theme color, and display mode set to "standalone" to satisfy browser installability criteria
3. WHEN the application detects no network connectivity, THE application SHALL display an "Offline" indicator in the header within 3 seconds of connectivity loss
4. WHILE the application is offline, THE PomodoroTimer component SHALL allow the user to start, pause, and reset the timer using local state without requiring network requests
5. WHEN the application regains network connectivity after being offline, THE Service_Worker SHALL compare cached content versions against the server and update changed assets in the background within 30 seconds of reconnection
6. IF the Service_Worker fails to pre-cache all required assets during installation, THEN THE application SHALL display a notification indicating that offline access is unavailable and retry caching on the next page load
7. WHEN the Service_Worker has updated cached content in the background, THE application SHALL display a non-blocking notification informing the user that new content is available and offering a refresh action

### Requirement 20: Performance and Polish

**User Story:** As a user, I want the application to feel fast and polished with smooth transitions, loading states, and keyboard shortcuts, so that my study experience is efficient and pleasant.

#### Acceptance Criteria

1. WHEN navigating between routes, THE application SHALL apply a fade transition animation lasting between 150ms and 300ms to the outgoing and incoming page content
2. WHILE content is loading, THE application SHALL display skeleton loading states with placeholder shapes corresponding to the page's structural elements (header, cards, sidebar) until the content is ready to render
3. WHILE no text input field, textarea, or contenteditable element has focus, THE application SHALL support keyboard shortcuts: `/` for search focus, `[` for previous topic navigation, `]` for next topic navigation, and `b` for bookmark toggle on the current Content_Section
4. WHEN the user scrolls past the first viewport height, THE application SHALL display a "Back to top" floating button that, when activated, scrolls the page to the top
5. THE TopicPage SHALL display an estimated reading time below the topic title, calculated as the total word count of all sections divided by 200 words per minute, rounded up to the nearest minute, formatted as "X min read"
6. IF a Topic has more than 5 sections, THEN THE TopicPage SHALL display a table of contents sidebar listing each section heading as a clickable link that scrolls the corresponding section into view

### Requirement 21: Deployment Readiness

**User Story:** As a developer deploying the application, I want proper meta tags, sitemap, error boundaries, and static hosting support, so that the application is production-ready for Netlify or Vercel deployment.

#### Acceptance Criteria

1. WHEN a user navigates to a topic page, THE application SHALL set the document title to the topic name (truncated to 60 characters), the meta description to the topic's first section summary (truncated to 160 characters), and og:image to the application's default social image
2. IF a page has no topic-specific data available (e.g., the home page or a non-topic route), THEN THE application SHALL set the document title to the application name and the meta description to a generic application description
3. THE Content_Pipeline SHALL generate a `sitemap.xml` file from the Content_Manifest listing all topic URLs as valid XML with `<urlset>`, `<url>`, and `<loc>` elements
4. IF a route component throws a rendering error, THEN THE application SHALL display an error boundary containing a visible error message indicating that something went wrong and a button that reloads the current page, rather than rendering a blank screen
5. THE application SHALL expose callable event hook functions for page view events (carrying the page path), search query events (carrying the query string), and topic completion events (carrying the topic identifier), such that an analytics provider can subscribe to them without modifying application code
6. THE application SHALL include static hosting configuration for SPA redirects compatible with Netlify (`_redirects` file with a `/* /index.html 200` rule) or Vercel (`vercel.json` with a rewrites rule directing all paths to `/index.html`)
