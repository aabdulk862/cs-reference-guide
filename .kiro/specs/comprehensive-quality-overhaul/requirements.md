# Requirements Document

## Introduction

A comprehensive quality overhaul of the CS Reference Guide application, organized into three prioritized phases: bug fixes for algorithm implementations and UI state management, content depth improvements for Kafka and Distributed Systems topics with Git section removal and flexible content schema, and infrastructure hardening including IndexedDB persistence fallback, plugin test coverage, PWA cache invalidation, and crawlability improvements.

## Glossary

- **Application**: The CS Reference Guide React single-page application built with React 18, TypeScript 5.6, and Vite 5.4
- **CodingGuidePage**: The page component at `src/pages/CodingGuidePage.tsx` that renders algorithm pattern tabs with interactive visualizations
- **AlgoVisualizer**: The step-through visualization component rendered inside PatternSection on the CodingGuidePage
- **PatternSection**: The component that renders a full algorithm pattern (idea, visualization, code, problems) within CodingGuidePage
- **Content_Validator**: The build-time validation module at `src/plugins/content-validator.ts` that checks content structure and quality
- **Storage_Module**: The persistence utility at `src/utils/storage.ts` that manages localStorage read/write with namespace prefix `csguide:`
- **Content_Pipeline**: The custom Vite plugin system at `src/plugins/vite-content-plugin.ts` that transforms markdown into structured JSON
- **Category_Mappings**: The array in `src/plugins/plugin-utils.ts` that maps content directory patterns to sidebar category names
- **Sidebar_Groups**: The `CATEGORY_GROUPS` array in `src/components/navigation/Sidebar.tsx` that organizes categories into visual groups
- **Service_Worker**: The PWA service worker managed by vite-plugin-pwa (workbox) that handles offline caching
- **IndexedDB_Adapter**: A new persistence backend using the IndexedDB API as a fallback when localStorage is unavailable

## Requirements

### Requirement 1: Fix 3Sum Duplicate Skipping Logic

**User Story:** As a user studying algorithm patterns, I want the 3Sum implementation to correctly skip duplicate triplets, so that the code example produces accurate results.

#### Acceptance Criteria

1. WHEN the 3Sum implementation encounters a duplicate value at the right pointer after finding a valid triplet, THE Application SHALL skip the right pointer past consecutive duplicates by comparing `nums[hi]` with `nums[hi+1]` instead of `nums[hi+1]`
2. WHEN the 3Sum implementation is executed with an input array containing duplicate values, THE Application SHALL produce a result set containing no duplicate triplets
3. THE Application SHALL display the corrected 3Sum code in the Two Pointers pattern section of the CodingGuidePage

### Requirement 2: Fix Coin Change Algorithm Bug

**User Story:** As a user studying dynamic programming patterns, I want the Coin Change implementation to produce correct minimum coin counts, so that I can trust the reference material.

#### Acceptance Criteria

1. WHEN the Coin Change algorithm processes an amount with a valid coin combination, THE Application SHALL return the minimum number of coins required to make that amount
2. WHEN the Coin Change algorithm processes an amount that cannot be formed by any combination of available coins, THE Application SHALL return -1
3. IF the Coin Change implementation contains an off-by-one error or incorrect base case, THEN THE Application SHALL be updated with the corrected implementation

### Requirement 3: Fix AlgoVisualizer State Reset on Tab Change

**User Story:** As a user stepping through algorithm visualizations, I want the visualizer to preserve its step position when I switch between pattern tabs and return, so that I do not lose my progress.

#### Acceptance Criteria

1. WHEN a user navigates away from a pattern tab and returns to the same tab, THE AlgoVisualizer SHALL restore the previously viewed step position
2. WHILE a pattern tab is not the active tab, THE Application SHALL retain the AlgoVisualizer state for that tab in memory rather than destroying and re-creating the component
3. WHEN the CodingGuidePage first renders a pattern tab, THE AlgoVisualizer SHALL initialize at step 0
4. THE Application SHALL implement state preservation using either state lifting to the parent component or memoization of the PatternSection component

### Requirement 4: Add Missing Algorithm Patterns

**User Story:** As a user preparing for coding interviews, I want linked list reversal and merge intervals patterns included in the coding guide, so that I have comprehensive coverage of common interview patterns.

#### Acceptance Criteria

1. THE Application SHALL include a linked list reversal pattern with core idea, visualization steps, template code, and at least 2 full problem solutions
2. THE Application SHALL include a merge intervals pattern with core idea, visualization steps, template code, and at least 2 full problem solutions
3. WHEN a user navigates to the new pattern tabs on the CodingGuidePage, THE Application SHALL render the pattern content with the same structure as existing patterns (idea, complexity, visualization, solves list, insight, template code, problems)

### Requirement 5: Deepen Kafka Content

**User Story:** As a senior engineer studying messaging systems, I want in-depth Kafka content covering advanced operational topics, so that I can prepare for system design interviews and production work.

#### Acceptance Criteria

1. THE Application SHALL include content covering partition assignment strategies (range, round-robin, sticky, cooperative sticky) in the Kafka topic
2. THE Application SHALL include content covering consumer group rebalancing mechanics (eager vs incremental cooperative rebalancing, rebalance triggers, static group membership) in the Kafka topic
3. THE Application SHALL include content covering exactly-once semantics (idempotent producers, transactional API, read-committed isolation) in the Kafka topic
4. THE Application SHALL include content covering ISR (In-Sync Replicas) mechanics (replica lag, ISR shrink/expand, unclean leader election trade-offs) in the Kafka topic
5. THE Application SHALL include content covering dead letter queue patterns (poison pill handling, retry topics, DLQ monitoring) in the Kafka topic

### Requirement 6: Deepen Distributed Systems Content

**User Story:** As a senior engineer preparing for system design interviews, I want comprehensive distributed systems content covering advanced consensus and data patterns, so that I can demonstrate deep understanding of distributed architectures.

#### Acceptance Criteria

1. THE Application SHALL include content covering CAP theorem depth (proof sketch, PACELC extension, real-world system classification) in the Distributed Systems topic
2. THE Application SHALL include content covering consistent hashing (virtual nodes, bounded loads, rebalancing mechanics) in the Distributed Systems topic
3. THE Application SHALL include content covering quorum reads and writes (sloppy quorums, hinted handoff, read repair) in the Distributed Systems topic
4. THE Application SHALL include content covering the saga pattern (choreography vs orchestration, compensating transactions, failure modes) in the Distributed Systems topic
5. THE Application SHALL include content covering event sourcing vs CQRS (event store design, projection rebuilding, eventual consistency trade-offs) in the Distributed Systems topic
6. THE Application SHALL include content covering vector clocks (version vectors, conflict detection, last-writer-wins vs merge) in the Distributed Systems topic
7. THE Application SHALL include content covering leader election (Bully algorithm, Raft leader election, ZooKeeper ephemeral nodes, fencing tokens) in the Distributed Systems topic

### Requirement 7: Remove Git Section

**User Story:** As a maintainer of the reference guide, I want the Git section removed entirely, so that the guide focuses on higher-value technical content.

#### Acceptance Criteria

1. WHEN the Content_Pipeline processes the content directory, THE Content_Pipeline SHALL exclude the `content/git/` directory and all files within it
2. THE Category_Mappings SHALL not contain an entry with pattern `git`
3. THE Sidebar_Groups SHALL not include `git` in any category group's `categoryIds` array
4. WHEN the Application builds, THE Content_Pipeline SHALL produce a manifest with no Git category
5. THE Application SHALL remove the `TOPIC_ORDER` entry for the `git` key in `plugin-utils.ts`

### Requirement 8: Make Content Section Schema Flexible

**User Story:** As a content author, I want the section structure to be a recommended default rather than a mandatory requirement, so that topics can omit sections that do not apply to their subject matter.

#### Acceptance Criteria

1. WHEN the Content_Validator validates a content file, THE Content_Validator SHALL treat the required sections list as recommended rather than mandatory
2. WHEN a content file is missing a recommended section, THE Content_Validator SHALL emit an informational message rather than a warning
3. THE Content_Validator SHALL continue to validate word count minimums and section depth regardless of which sections are present
4. WHEN a content file contains all recommended sections, THE Content_Validator SHALL not emit any informational messages about missing sections

### Requirement 9: Add IndexedDB Fallback for Progress Persistence

**User Story:** As a user on iOS Safari in private browsing mode, I want my study progress persisted even when localStorage is unavailable, so that I do not lose progress during a study session.

#### Acceptance Criteria

1. WHEN localStorage is unavailable or throws a QuotaExceededError, THE Storage_Module SHALL attempt to use the IndexedDB_Adapter as a fallback persistence layer
2. WHEN both localStorage and IndexedDB are unavailable, THE Storage_Module SHALL fall back to the existing in-memory Map store
3. THE IndexedDB_Adapter SHALL use the same `csguide:` namespace convention for stored keys
4. WHEN the IndexedDB_Adapter initializes, THE IndexedDB_Adapter SHALL open a database named `csguide-storage` with an object store for key-value pairs
5. THE Storage_Module SHALL provide the same typed get/set/remove API regardless of which backend is active
6. IF IndexedDB operations fail after initial connection, THEN THE Storage_Module SHALL degrade to the in-memory fallback without throwing errors to the caller

### Requirement 10: Add Tests for Vite Content Plugin Orchestrator

**User Story:** As a developer maintaining the content pipeline, I want test coverage for the vite-content-plugin orchestrator, so that pipeline regressions are caught before deployment.

#### Acceptance Criteria

1. THE Application SHALL include a test file for `src/plugins/vite-content-plugin.ts` using Vitest
2. THE test suite SHALL verify that the plugin scans the content directory and produces a manifest with the expected category count
3. THE test suite SHALL verify that multi-page topic detection correctly identifies directories containing `index.md`
4. THE test suite SHALL verify that the plugin respects exclusion filter rules
5. THE test suite SHALL verify that generated JSON output files contain valid parsed content structures

### Requirement 11: Fix PWA WASM Cache Invalidation

**User Story:** As a user of the offline-capable PWA, I want the service worker to correctly invalidate cached WASM binaries when updates are available, so that I always run the latest version of sql.js.

#### Acceptance Criteria

1. WHEN a new version of the sql.js WASM binary is deployed, THE Service_Worker SHALL detect the updated asset and replace the cached version
2. THE Service_Worker SHALL use a versioned cache key or content-hash strategy for WASM binary assets
3. WHILE the Application is offline, THE Service_Worker SHALL serve the most recently cached WASM binary
4. WHEN the Service_Worker activates a new version, THE Service_Worker SHALL delete stale WASM entries from previous cache versions

### Requirement 12: Improve SSR and Crawlable Content

**User Story:** As a maintainer concerned with SEO, I want the application to provide crawlable content to search engines, so that the reference guide is discoverable via organic search.

#### Acceptance Criteria

1. THE Application SHALL generate a comprehensive sitemap.xml that includes all topic and subtopic URLs
2. THE Application SHALL implement either pre-rendering of static routes or server-side rendering for content pages
3. WHEN a search engine crawler requests a topic page, THE Application SHALL serve HTML containing the topic content rather than an empty shell requiring JavaScript execution
4. THE Application SHALL include appropriate meta tags (title, description) for each content page

### Requirement 13: AI-Generated Content Audit Documentation

**User Story:** As a maintainer, I want documentation of which content was AI-generated and its review status, so that content quality can be tracked and audited over time.

#### Acceptance Criteria

1. THE Application repository SHALL include an audit document listing content files with their generation method (AI-generated, human-written, AI-assisted)
2. THE audit document SHALL include a review status field for each entry (reviewed, pending-review, needs-revision)
3. WHEN new AI-generated content is added to the repository, THE audit document SHALL be updated with the new entry
