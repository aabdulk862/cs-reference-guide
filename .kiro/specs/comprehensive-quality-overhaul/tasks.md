# Implementation Plan: Comprehensive Quality Overhaul

## Overview

Three-phase implementation: Phase 1 fixes algorithm bugs and UI state issues in CodingGuidePage, Phase 2 expands Kafka/Distributed Systems content and removes Git, Phase 3 hardens infrastructure with IndexedDB fallback, plugin tests, PWA caching, pre-rendering, and audit documentation. All code is TypeScript/React with Vitest + fast-check for testing.

## Tasks

- [x] 1. Phase 1 — Algorithm Bug Fixes and UI State
  - [x] 1.1 Fix 3Sum duplicate-skipping logic in CodingGuidePage
    - Locate the 3Sum code block in the Two Pointers section of `src/pages/CodingGuidePage.tsx`
    - Replace with the canonical implementation that correctly skips duplicates on both left and right pointers after finding a valid triplet
    - Ensure the right pointer skip compares `nums[hi]` with `nums[hi+1]` and decrements correctly
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ]* 1.2 Write property test for 3Sum duplicate-free output
    - **Property 1: 3Sum produces no duplicate triplets**
    - For any integer array, verify the result set contains no duplicate triplets (regardless of internal order)
    - Use fast-check to generate random integer arrays and validate uniqueness of output
    - **Validates: Requirements 1.1, 1.2**

  - [x] 1.3 Fix Coin Change algorithm in CodingGuidePage
    - Locate the Coin Change DP implementation in the Dynamic Programming section of `src/pages/CodingGuidePage.tsx`
    - Fix base case (`dp[0] = 0`), initialization (`Arrays.fill(dp, amount + 1)` instead of `Integer.MAX_VALUE`), and final check (`dp[amount] > amount ? -1 : dp[amount]`)
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ]* 1.4 Write property test for Coin Change correctness
    - **Property 2: Coin Change returns minimum or -1**
    - For any set of coin denominations and target amount, verify result matches brute-force reference or returns -1 when no combination exists
    - Use fast-check with small amounts (≤20) and small coin sets for tractable brute-force verification
    - **Validates: Requirements 2.1, 2.2**

  - [x] 1.5 Lift AlgoVisualizer state to CodingGuidePage
    - Add `stepPositions` state (`Record<Section, number>`) to `CodingGuidePage` component
    - Create `updateStepPosition` callback using `useCallback`
    - Update `AlgoVisualizer` to accept `currentStep` and `onStepChange` props instead of internal `useState`
    - Update `PatternSection` to pass through step props from parent
    - Wire each section to read/write from the lifted state
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 1.6 Write property test for AlgoVisualizer step preservation
    - **Property 3: AlgoVisualizer step preservation across tab switches**
    - For any valid step position and any sequence of tab switches, verify returning to original tab restores the exact step position
    - Use fast-check to generate random tab switch sequences
    - **Validates: Requirements 3.1**

  - [x] 1.7 Add Linked List Reversal pattern tab
    - Add `'linked-list'` to the `Section` type union in `src/pages/CodingGuidePage.tsx`
    - Create the Linked List Reversal section with: core idea (iterative pointer reversal), visualization steps, template code, and problems (Reverse Linked List LC #206, Reverse Nodes in k-Group LC #25)
    - Add tab button and wire to section rendering
    - Include the new section in `stepPositions` initial state
    - _Requirements: 4.1, 4.3_

  - [x] 1.8 Add Greedy/Intervals pattern tab
    - Add `'intervals'` to the `Section` type union in `src/pages/CodingGuidePage.tsx`
    - Create the Merge Intervals section with: core idea (sort by start, merge overlapping), visualization steps, template code, and problems (Merge Intervals LC #56, Insert Interval LC #57, Meeting Rooms II LC #253)
    - Add tab button and wire to section rendering
    - Include the new section in `stepPositions` initial state
    - _Requirements: 4.2, 4.3_

- [x] 2. Checkpoint — Phase 1 verification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Phase 2 — Content Depth and Schema Changes
  - [x] 3.1 Remove Git section from pipeline and sidebar
    - Remove `{ pattern: 'git', category: 'Git' }` from `CATEGORY_MAPPINGS` in `src/plugins/plugin-utils.ts`
    - Remove `'git'` key from `TOPIC_ORDER` in `src/plugins/plugin-utils.ts`
    - Remove `'git'` from the Infrastructure group's `categoryIds` in `src/components/navigation/Sidebar.tsx`
    - Delete `content/git/` directory entirely
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 3.2 Write property test for Git content exclusion
    - **Property 4: Git content excluded from pipeline output**
    - For any content directory structure containing a `git/` subdirectory, verify the manifest contains zero categories or topics referencing Git
    - **Validates: Requirements 7.1, 7.4**

  - [x] 3.3 Make content validator schema flexible
    - In `src/plugins/content-validator.ts`, add `severity` field to validation messages (`'warning' | 'info'`)
    - Change `validateRequiredSections()` to emit `severity: 'info'` instead of `severity: 'warning'` for missing sections
    - Keep word count and section depth validation as `severity: 'warning'`
    - Update console output to use `console.info()` for info-level, `console.warn()` for warnings
    - Update `ValidationResult` interface (rename `warnings` to `messages` or add severity)
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ]* 3.4 Write property test for missing sections severity
    - **Property 5: Missing sections produce informational messages only**
    - For any content file missing recommended sections, verify emitted messages have `severity: 'info'` (not `'warning'`), and no section messages when all present
    - **Validates: Requirements 8.1, 8.2, 8.4**

  - [ ]* 3.5 Write property test for word count independence
    - **Property 6: Word count validation independent of section presence**
    - For any content file below minimum word count, verify a word count warning is emitted regardless of which sections are present or absent
    - **Validates: Requirements 8.3**

  - [x] 3.6 Add Kafka deep-dive subtopics
    - Create `content/backend/messaging/partition-strategies.md` — Range, round-robin, sticky, cooperative sticky assignors
    - Create `content/backend/messaging/consumer-rebalancing.md` — Eager vs incremental cooperative, triggers, static membership
    - Create `content/backend/messaging/exactly-once-semantics.md` — Idempotent producers, transactional API, read-committed
    - Create `content/backend/messaging/isr-mechanics.md` — Replica lag, ISR shrink/expand, unclean leader election
    - Create `content/backend/messaging/dead-letter-queues.md` — Poison pill handling, retry topics, DLQ monitoring
    - Update `content/backend/messaging/index.md` Learning Path to include new subtopics
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 3.7 Add Distributed Systems deep-dive subtopics
    - Create `content/system-design/fundamentals/cap-theorem-depth.md` — Proof sketch, PACELC, system classification
    - Create `content/system-design/fundamentals/consistent-hashing.md` — Virtual nodes, bounded loads, rebalancing
    - Create `content/system-design/fundamentals/quorum-systems.md` — Sloppy quorums, hinted handoff, read repair
    - Create `content/system-design/fundamentals/saga-pattern.md` — Choreography vs orchestration, compensating transactions
    - Create `content/system-design/fundamentals/event-sourcing-cqrs.md` — Event store, projections, eventual consistency
    - Create `content/system-design/fundamentals/vector-clocks.md` — Version vectors, conflict detection, LWW vs merge
    - Create `content/system-design/fundamentals/leader-election.md` — Bully, Raft, ZooKeeper, fencing tokens
    - Update `content/system-design/fundamentals/index.md` Learning Path to include new subtopics
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [x] 4. Checkpoint — Phase 2 verification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Phase 3 — Infrastructure Hardening
  - [x] 5.1 Create IndexedDB adapter module
    - Create `src/utils/indexeddb-adapter.ts` implementing `IIndexedDBAdapter` interface
    - Database name: `csguide-storage`, object store: `kv`, key path: `key`
    - Implement `isAvailable()`, `open()`, `get()`, `set()`, `remove()`, `getAll()`, `close()`
    - Use `csguide:` prefix convention for all keys
    - _Requirements: 9.3, 9.4_

  - [ ]* 5.2 Write property test for IndexedDB namespace consistency
    - **Property 9: IndexedDB adapter namespace consistency**
    - For any key stored through the adapter, verify the underlying entry uses the `csguide:` prefix
    - **Validates: Requirements 9.3**

  - [x] 5.3 Integrate IndexedDB fallback into storage module
    - Update `src/utils/storage.ts` to add `StorageBackend` type and `activeBackend` state
    - Make `initStorage()` async: probe localStorage → IndexedDB → memory in order
    - Implement sync-first approach: hydrate in-memory Map from IndexedDB at init, writes go to both Map and IndexedDB (fire-and-forget)
    - Preserve synchronous `get()`/`set()`/`remove()` API for all consumers
    - Add `getActiveBackend()` and `isUsingFallback()` exports
    - Wrap all operations in try/catch — never throw to caller
    - _Requirements: 9.1, 9.2, 9.5, 9.6_

  - [ ]* 5.4 Write property test for storage fallback cascade
    - **Property 7: Storage fallback cascade ordering**
    - For any storage operation when localStorage is unavailable, verify IndexedDB is attempted before memory, and when both unavailable, memory is used without errors
    - **Validates: Requirements 9.1, 9.2, 9.6**

  - [ ]* 5.5 Write property test for storage API round-trip consistency
    - **Property 8: Storage API consistency across backends**
    - For any key-value pair and any active backend, verify `set(key, value)` then `get(key, default)` returns original value, and `remove(key)` then `get(key, default)` returns default
    - **Validates: Requirements 9.5**

  - [x] 5.6 Add Vite content plugin orchestrator tests
    - Create `src/plugins/vite-content-plugin.test.ts` using Vitest
    - Use temp directories with minimal markdown fixtures in `beforeEach`/`afterEach`
    - Test: scans content directory and produces manifest with correct category count
    - Test: detects multi-page topics (directories with `index.md`)
    - Test: skips directories without `index.md`
    - Test: respects exclusion filter rules
    - Test: generates valid JSON output for parsed content
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [ ]* 5.7 Write property test for multi-page topic detection
    - **Property 10: Multi-page topic detection correctness**
    - For any directory structure, verify directories with `index.md` are included and those without are excluded
    - **Validates: Requirements 10.3**

  - [x] 5.8 Configure PWA WASM cache invalidation
    - In `vite.config.ts`, add `.wasm` to `globPatterns` for precaching
    - Add `StaleWhileRevalidate` runtime caching rule for `.wasm` files with `wasm-cache` cache name, 30-day expiration, max 10 entries
    - Add `cleanupOutdatedCaches: true` to workbox config
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [x] 5.9 Implement pre-rendering for crawlability
    - Create `scripts/prerender.ts` that reads `content-manifest.json` and renders all routes to static HTML
    - For each category/topic/subtopic, compute route path and generate `dist/{route}/index.html`
    - Ensure meta tags (title, description) from `useDocumentMeta` are captured in static HTML
    - Add pre-render step to build pipeline (post-build script in `package.json`)
    - _Requirements: 12.2, 12.3, 12.4_

  - [ ]* 5.10 Write property test for sitemap URL completeness
    - **Property 11: Sitemap includes all manifest URLs**
    - For any manifest with N topics and M subtopics, verify sitemap.xml contains URL entries for all N + M pages
    - **Validates: Requirements 12.1**

  - [ ]* 5.11 Write property test for meta tags presence
    - **Property 12: Meta tags present for all content pages**
    - For any rendered content page, verify HTML includes `<title>` and `<meta name="description">` with non-empty content
    - **Validates: Requirements 12.4**

  - [x] 5.12 Create AI content audit document
    - Create `docs/content-audit.md` with table format: File Path, Generation Method, Review Status, Reviewer, Date
    - Add entries for all new Kafka subtopics (5 files) as `AI-generated`, `pending-review`
    - Add entries for all new Distributed Systems subtopics (7 files) as `AI-generated`, `pending-review`
    - _Requirements: 13.1, 13.2, 13.3_

- [x] 6. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation between phases
- Property tests validate universal correctness properties from the design document (12 total)
- Unit tests validate specific examples and edge cases
- The project uses TypeScript with Vitest + fast-check for all testing
- Content files must follow the mandatory subtopic structure (Quick Reference, When to Use, Code Examples, etc.)
- All content is multi-page topic format with `index.md` + subtopic files

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "3.1", "5.1"] },
    { "id": 1, "tasks": ["1.2", "1.4", "1.5", "3.3", "5.6"] },
    { "id": 2, "tasks": ["1.6", "1.7", "1.8", "3.2", "3.4", "3.5", "5.2", "5.8"] },
    { "id": 3, "tasks": ["3.6", "3.7", "5.3", "5.7"] },
    { "id": 4, "tasks": ["5.4", "5.5", "5.9", "5.12"] },
    { "id": 5, "tasks": ["5.10", "5.11"] }
  ]
}
```
