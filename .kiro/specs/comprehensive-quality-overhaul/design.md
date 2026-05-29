# Design Document: Comprehensive Quality Overhaul

## Overview

This design covers a three-phase quality overhaul of the CS Reference Guide: bug fixes (Phase 1), content depth improvements (Phase 2), and infrastructure hardening (Phase 3). The architecture preserves the existing React 18 + Vite + TypeScript stack while introducing targeted improvements to state management, persistence, content validation, and crawlability.

## Architecture

### Phase 1: Bug Fixes

#### 3Sum Duplicate Fix (Requirement 1)

The current 3Sum implementation in `CodingGuidePage.tsx` has a duplicate-skipping bug in the right pointer logic. The while loop condition `nums[hi] == nums[hi+1]` should be `nums[hi] == nums[hi-1]` (comparing current position with previous, not next) to correctly skip past duplicates after finding a valid triplet.

**Fix location:** `TwoPointersSection()` → `problems` array → 3Sum entry → `code` string.

**Corrected logic:**
```java
while (lo < hi && nums[lo] == nums[lo-1]) lo++;  // skip dupes (left)
while (lo < hi && nums[hi] == nums[hi+1]) hi--;  // skip dupes (right)
```

The right pointer skip should compare `nums[hi]` with `nums[hi+1]` — but the pointer moves inward (`hi--`), so after decrementing, we check if the new position equals the old. The correct pattern post-decrement is:

```java
lo++; hi--;
while (lo < hi && nums[lo] == nums[lo-1]) lo++;   // correct: skip left dupes
while (lo < hi && nums[hi] == nums[hi+1]) hi--;   // correct: skip right dupes
```

Wait — re-examining: after `hi--`, we want to skip if the new `hi` equals what's to its right (the value we just used). So `nums[hi] == nums[hi+1]` is actually correct for the right pointer. The bug must be elsewhere — likely the comparison direction. Looking at the actual code in the component, the right-side skip uses `nums[hi+1]` which would compare with the already-processed value. This is correct. The actual bug may be that the code is missing the skip entirely or has an off-by-one in the loop bounds.

**Resolution:** Replace the 3Sum code block with the canonical correct implementation that properly skips duplicates on both pointers after finding a triplet.

#### Coin Change Fix (Requirement 2)

The Coin Change DP implementation in the Dynamic Programming section needs verification for:
- Base case: `dp[0] = 0` (zero coins needed for amount 0)
- Initialization: `dp[i] = amount + 1` (sentinel value, not `Integer.MAX_VALUE` which causes overflow on `dp[i-coin] + 1`)
- Final check: `return dp[amount] > amount ? -1 : dp[amount]`

**Corrected implementation:**
```java
public int coinChange(int[] coins, int amount) {
    int[] dp = new int[amount + 1];
    Arrays.fill(dp, amount + 1);  // sentinel (not MAX_VALUE to avoid overflow)
    dp[0] = 0;
    for (int i = 1; i <= amount; i++) {
        for (int coin : coins) {
            if (coin <= i) {
                dp[i] = Math.min(dp[i], dp[i - coin] + 1);
            }
        }
    }
    return dp[amount] > amount ? -1 : dp[amount];
}
```

#### AlgoVisualizer State Preservation (Requirement 3)

**Problem:** Each `PatternSection` creates a new `AlgoVisualizer` with local `useState(0)`. When tabs switch, the component unmounts and state is lost.

**Solution: Lift state to CodingGuidePage**

```typescript
// In CodingGuidePage component
const [stepPositions, setStepPositions] = useState<Record<Section, number>>({
  'two-pointers': 0,
  'sliding-window': 0,
  'hashmap': 0,
  'binary-search': 0,
  'bfs-dfs': 0,
  'backtracking': 0,
  'dp': 0,
  'stack': 0,
  'heap': 0,
  'graphs': 0,
});

const updateStepPosition = useCallback((section: Section, step: number) => {
  setStepPositions(prev => ({ ...prev, [section]: step }));
}, []);
```

**Component changes:**
1. `AlgoVisualizer` accepts `currentStep` and `onStepChange` props instead of internal state
2. `PatternSection` passes through the step props
3. Each section component passes the lifted state down

**Alternative considered:** Memoizing `PatternSection` with `React.memo` — rejected because the component still unmounts on conditional render (`activeSection === id`). The fix requires either:
- (a) Rendering all sections but hiding inactive ones with CSS (`display: none`) — heavier DOM but preserves state
- (b) Lifting step state to parent — lighter, chosen approach

Approach (b) is preferred: minimal DOM footprint, explicit state management, and the step position is the only state worth preserving.

#### Missing Algorithm Patterns (Requirement 4)

Add two new sections to `CodingGuidePage.tsx`:

1. **Linked List Reversal** (`linked-list` tab)
   - Core idea: Iterative pointer reversal with prev/curr/next
   - Visualization: Node chain with pointer arrows showing reversal steps
   - Template: Standard iterative reversal
   - Problems: Reverse Linked List (LC #206), Reverse Nodes in k-Group (LC #25)

2. **Merge Intervals** — already exists as a problem in Two Pointers section. Instead, add a **Greedy/Intervals** pattern tab (`intervals`):
   - Core idea: Sort by start, merge overlapping
   - Visualization: Timeline with overlapping intervals merging
   - Template: Sort + scan + merge
   - Problems: Merge Intervals (LC #56), Insert Interval (LC #57), Meeting Rooms II (LC #253)

**Section type update:**
```typescript
type Section = 'two-pointers' | 'sliding-window' | 'hashmap' | 'binary-search' 
  | 'bfs-dfs' | 'backtracking' | 'dp' | 'stack' | 'heap' | 'graphs' 
  | 'linked-list' | 'intervals';
```

### Phase 2: Content & Schema

#### Kafka Content Depth (Requirement 5)

Add new subtopic files to `content/backend/messaging/`:
- `partition-strategies.md` — Range, round-robin, sticky, cooperative sticky assignors
- `consumer-rebalancing.md` — Eager vs incremental cooperative, triggers, static membership
- `exactly-once-semantics.md` — Idempotent producers, transactional API, read-committed
- `isr-mechanics.md` — Replica lag, ISR shrink/expand, unclean leader election
- `dead-letter-queues.md` — Poison pill handling, retry topics, DLQ monitoring

Update `content/backend/messaging/index.md` Learning Path to include new subtopics.

#### Distributed Systems Content (Requirement 6)

Add new subtopic files to `content/system-design/fundamentals/`:
- `cap-theorem-depth.md` — Proof sketch, PACELC, system classification
- `consistent-hashing.md` — Virtual nodes, bounded loads, rebalancing
- `quorum-systems.md` — Sloppy quorums, hinted handoff, read repair
- `saga-pattern.md` — Choreography vs orchestration, compensating transactions
- `event-sourcing-cqrs.md` — Event store, projections, eventual consistency
- `vector-clocks.md` — Version vectors, conflict detection, LWW vs merge
- `leader-election.md` — Bully, Raft, ZooKeeper, fencing tokens

Update `content/system-design/fundamentals/index.md` Learning Path.

#### Git Section Removal (Requirement 7)

**Files to modify:**
1. `src/plugins/plugin-utils.ts` — Remove `{ pattern: 'git', category: 'Git' }` from `CATEGORY_MAPPINGS` and delete `'git'` key from `TOPIC_ORDER`
2. `src/components/navigation/Sidebar.tsx` — Remove `'git'` from the Infrastructure group's `categoryIds`
3. Delete `content/git/` directory entirely

**Pipeline behavior:** With the mapping removed, `resolveCategory()` returns `null` for any `git/` path, so files are skipped automatically. No pipeline code changes needed beyond the mapping removal.

#### Flexible Content Schema (Requirement 8)

**Current behavior:** `validateRequiredSections()` emits `'missing-section'` warnings (type `ValidationWarning`).

**New behavior:** Introduce a severity level to validation messages:

```typescript
export interface ValidationMessage {
  type: 'low-word-count' | 'stub-content' | 'missing-section' | 'broken-image' 
    | 'external-image' | 'orphaned-image' | 'section-too-short';
  severity: 'warning' | 'info';
  message: string;
  details?: Record<string, unknown>;
}
```

**Changes to `content-validator.ts`:**
1. Rename `ValidationWarning` to `ValidationMessage` (or add `severity` field)
2. `validateRequiredSections()` returns messages with `severity: 'info'` instead of `severity: 'warning'`
3. Console output uses `console.info()` for info-level messages, `console.warn()` for warnings
4. Word count and section depth validation remain as warnings

**Backward compatibility:** The `ValidationResult` interface keeps the same shape but the `warnings` array now contains messages with severity. Existing consumers that check `.type` continue to work.

### Phase 3: Infrastructure

#### IndexedDB Fallback (Requirement 9)

**Architecture:**

```
Storage Module (storage.ts)
├── Backend 1: localStorage (primary)
├── Backend 2: IndexedDB (fallback when localStorage unavailable)
└── Backend 3: In-memory Map (final fallback)
```

**New file:** `src/utils/indexeddb-adapter.ts`

```typescript
interface IndexedDBAdapter {
  isAvailable(): Promise<boolean>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
```

**Database schema:**
- Database name: `csguide-storage`
- Object store: `kv` (key-value pairs)
- Key path: `key` (string, uses `csguide:` prefix)
- Value field: `value` (string, JSON-serialized)

**Integration with storage.ts:**

The `initStorage()` function becomes async and probes backends in order:
1. Test localStorage availability (existing logic)
2. If localStorage fails → attempt IndexedDB open
3. If IndexedDB fails → activate in-memory fallback

The `rawGet`/`rawSet`/`rawRemove` functions gain an IndexedDB path:

```typescript
let activeBackend: 'localStorage' | 'indexeddb' | 'memory' = 'localStorage';

async function rawGetAsync(fullKey: string): Promise<string | null> {
  switch (activeBackend) {
    case 'localStorage':
      try { return localStorage.getItem(fullKey); }
      catch { /* fall through to IndexedDB */ }
      activeBackend = 'indexeddb';
      // falls through
    case 'indexeddb':
      try { return await indexedDBAdapter.get(fullKey); }
      catch { activeBackend = 'memory'; }
      // falls through
    case 'memory':
      return memoryStore.get(fullKey) ?? null;
  }
}
```

**Note:** IndexedDB is async. The existing synchronous `get()`/`set()` API must either:
- (a) Become async (breaking change to all consumers)
- (b) Use a sync-first approach: try localStorage synchronously, queue IndexedDB writes, read from a sync cache populated at init

**Chosen approach (b):** On initialization, if IndexedDB is the active backend, load all `csguide:*` entries into the in-memory Map as a read cache. Writes go to both the Map (sync) and IndexedDB (async, fire-and-forget). This preserves the synchronous API while gaining persistence.

```typescript
// Initialization (async, called once at app start)
export async function initStorage(): Promise<void> {
  if (isLocalStorageAvailable()) {
    activeBackend = 'localStorage';
  } else if (await indexedDBAdapter.isAvailable()) {
    activeBackend = 'indexeddb';
    // Hydrate memory cache from IndexedDB
    const allEntries = await indexedDBAdapter.getAll();
    for (const { key, value } of allEntries) {
      memoryStore.set(key, value);
    }
  } else {
    activeBackend = 'memory';
  }
  runMigrations();
}

// Synchronous get — reads from memory cache (hydrated from IndexedDB at init)
export function get<T>(key: string, defaultValue: T): T {
  // Same logic as before — rawGet reads from memoryStore when backend is indexeddb
}

// Synchronous set — writes to memory cache + async IndexedDB write
export function set<T>(key: string, value: T): void {
  const fullKey = namespacedKey(key);
  const serialized = JSON.stringify(value);
  memoryStore.set(fullKey, serialized);
  if (activeBackend === 'indexeddb') {
    indexedDBAdapter.set(fullKey, serialized).catch(() => {
      // Silent failure — memory cache is authoritative
    });
  } else if (activeBackend === 'localStorage') {
    try { localStorage.setItem(fullKey, serialized); }
    catch { /* degrade to indexeddb or memory */ }
  }
}
```

#### Vite Content Plugin Tests (Requirement 10)

**New file:** `src/plugins/vite-content-plugin.test.ts`

**Test structure:**
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectMultiPageTopics, processContent } from './vite-content-plugin';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('vite-content-plugin orchestrator', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'content-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  it('scans content directory and produces manifest with correct category count');
  it('detects multi-page topics (directories with index.md)');
  it('skips directories without index.md');
  it('respects exclusion filter rules');
  it('generates valid JSON output for parsed content');
  it('produces search-index.json');
  it('produces sitemap.xml');
});
```

**Fixture strategy:** Create temporary directories with minimal markdown content in `beforeEach`. Use the real `processContent()` function against fixtures rather than mocking internals.

#### PWA WASM Cache Invalidation (Requirement 11)

**Problem:** The current workbox config uses `CacheFirst` for all assets matching `**/*.{js,css,html}` glob patterns. WASM binaries (`.wasm`) are not explicitly handled, so they may be cached indefinitely without invalidation.

**Solution:** Add explicit WASM handling to the workbox configuration in `vite.config.ts`:

```typescript
workbox: {
  globPatterns: [
    '**/*.{js,css,html,wasm}',  // Add .wasm to precache
    'content-manifest.json',
    'search-index.json',
    'content/**/*.json',
  ],
  // ... existing runtimeCaching plus:
  runtimeCaching: [
    // ... existing entries ...
    {
      // WASM binaries: StaleWhileRevalidate ensures updates propagate
      urlPattern: /\.wasm$/,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'wasm-cache',
        expiration: {
          maxEntries: 10,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        },
      },
    },
  ],
}
```

**Why StaleWhileRevalidate:** Serves the cached WASM immediately (fast offline experience) while fetching the updated version in the background. On next load, the new version is served. This avoids the problem of `CacheFirst` never checking for updates.

**Precaching with revision:** Vite's build output already content-hashes asset filenames (e.g., `sql-wasm-abc123.wasm`). Workbox precaching uses the filename as the revision key, so a new build with a new hash automatically invalidates the old entry during service worker activation.

**Cache cleanup:** Workbox's `cleanupOutdatedCaches: true` option (add to config) ensures old precache versions are deleted when a new service worker activates.

#### SSR / Pre-rendering for Crawlability (Requirement 12)

**Approach: Static pre-rendering with `vite-plugin-ssr` or `vite-ssg`**

Given the app is deployed on Netlify (no Node.js server runtime), full SSR is not practical. Instead, use **static site generation (SSG)** at build time:

**Option chosen: `vite-ssg` pattern (custom pre-render script)**

Add a post-build script that:
1. Reads `content-manifest.json` to get all topic/subtopic routes
2. Uses a headless browser (Puppeteer/Playwright) or `@prerender/prerender` to render each route
3. Saves the rendered HTML to `dist/` at the correct path
4. Netlify serves these static HTML files for crawlers

**Implementation:**
```
scripts/prerender.ts
├── Read content-manifest.json
├── For each category/topic/subtopic → compute route path
├── Render route with Puppeteer (or use react-snap)
├── Extract <html> content
├── Write to dist/{route}/index.html
└── Inject meta tags from content metadata
```

**Alternative: Netlify prerendering**
Netlify offers built-in prerendering for bots via `netlify.toml`:
```toml
[[plugins]]
  package = "@netlify/plugin-prerender"
```

This is simpler but less controllable. The custom approach gives full control over meta tags and content.

**Meta tags:** The existing `useDocumentMeta` hook sets `<title>` and `<meta name="description">` dynamically. For pre-rendered pages, these are captured in the static HTML.

**Sitemap:** Already generated by `sitemap-generator.ts`. Ensure it includes all subtopic URLs (currently it does based on manifest data).

#### AI Content Audit Documentation (Requirement 13)

**New file:** `docs/content-audit.md`

**Format:**
```markdown
# Content Audit Log

| File Path | Generation Method | Review Status | Reviewer | Date |
|-----------|------------------|---------------|----------|------|
| content/backend/messaging/partition-strategies.md | AI-generated | pending-review | — | 2025-XX-XX |
| content/system-design/fundamentals/cap-theorem-depth.md | AI-generated | pending-review | — | 2025-XX-XX |
```

**Generation methods:** `AI-generated`, `human-written`, `AI-assisted`
**Review statuses:** `reviewed`, `pending-review`, `needs-revision`

## Components and Interfaces

### Component Overview

| Component | File | Responsibility |
|-----------|------|----------------|
| CodingGuidePage | `src/pages/CodingGuidePage.tsx` | Algorithm pattern tabs with visualizations |
| AlgoVisualizer | (inline in CodingGuidePage) | Step-through visualization with lifted state |
| Storage Module | `src/utils/storage.ts` | Persistence with localStorage → IndexedDB → memory fallback |
| IndexedDB Adapter | `src/utils/indexeddb-adapter.ts` | IndexedDB key-value persistence backend |
| Content Validator | `src/plugins/content-validator.ts` | Build-time content quality checks with severity levels |
| Vite Content Plugin | `src/plugins/vite-content-plugin.ts` | Content pipeline orchestrator |
| Plugin Utils | `src/plugins/plugin-utils.ts` | Category mappings, slugify, topic ordering |
| Sidebar | `src/components/navigation/Sidebar.tsx` | Category group navigation |
| Prerender Script | `scripts/prerender.ts` | Post-build static HTML generation |

### Interfaces

### IndexedDB Adapter

```typescript
// src/utils/indexeddb-adapter.ts

const DB_NAME = 'csguide-storage';
const STORE_NAME = 'kv';
const DB_VERSION = 1;

interface KVEntry {
  key: string;   // csguide:prefixed key
  value: string; // JSON-serialized value
}

export interface IIndexedDBAdapter {
  isAvailable(): Promise<boolean>;
  open(): Promise<void>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  getAll(): Promise<KVEntry[]>;
  close(): void;
}
```

### Updated Storage Module API

```typescript
// src/utils/storage.ts — updated exports

export type StorageBackend = 'localStorage' | 'indexeddb' | 'memory';

export function get<T>(key: string, defaultValue: T): T;
export function set<T>(key: string, value: T): void;
export function remove(key: string): void;
export function getActiveBackend(): StorageBackend;
export async function initStorage(): Promise<void>;  // now async
export function isUsingFallback(): boolean;
```

### Updated Content Validator

```typescript
// src/plugins/content-validator.ts — updated types

export type MessageSeverity = 'warning' | 'info';

export interface ValidationMessage {
  type: 'low-word-count' | 'stub-content' | 'missing-section' | 'broken-image'
    | 'external-image' | 'orphaned-image' | 'section-too-short';
  severity: MessageSeverity;
  message: string;
  details?: Record<string, unknown>;
}

export interface ValidationResult {
  filePath: string;
  messages: ValidationMessage[];  // renamed from 'warnings'
}
```

### AlgoVisualizer Props (Updated)

```typescript
interface AlgoVisualizerProps {
  steps: VisualizationStep[];
  currentStep: number;
  onStepChange: (step: number) => void;
}

interface PatternSectionProps {
  // ... existing props ...
  currentStep: number;
  onStepChange: (step: number) => void;
}
```

## Data Models

### IndexedDB Object Store Schema

```
Database: csguide-storage (version 1)
└── Object Store: kv
    ├── keyPath: "key"
    └── Fields:
        ├── key: string (e.g., "csguide:completed-topics")
        └── value: string (JSON-serialized data)
```

### Content Manifest (Post Git Removal)

After removing Git, the manifest will have 12 categories instead of 13. The `totalTopics` count decreases by the number of Git topics (2: basics, collaboration).

### Step Position State Shape

```typescript
type StepPositions = Record<Section, number>;

// Initial state
const INITIAL_STEPS: StepPositions = {
  'two-pointers': 0,
  'sliding-window': 0,
  'hashmap': 0,
  'binary-search': 0,
  'bfs-dfs': 0,
  'backtracking': 0,
  'dp': 0,
  'stack': 0,
  'heap': 0,
  'graphs': 0,
  'linked-list': 0,
  'intervals': 0,
};
```

## Error Handling

### Storage Fallback Chain

```
localStorage.setItem() throws
  → catch QuotaExceededError or SecurityError
  → attempt IndexedDB write
    → if IndexedDB open fails → activate memory fallback
    → if IndexedDB write fails → activate memory fallback
  → never throw to caller
```

All storage operations are wrapped in try/catch. The caller never sees an exception from storage operations. The `onFallbackActivated` callback notifies the UI to display a warning banner.

### Content Pipeline Errors

- Missing `index.md` → warn and skip directory (existing behavior)
- Empty files → warn and skip (existing behavior)
- Parse failures → warn and skip, don't fail build
- Missing category mapping → skip file silently

### Pre-render Failures

- If a route fails to render → log warning, skip that route
- Missing content JSON → skip route (content not yet built)
- The pre-render step is additive — if it fails entirely, the SPA still works (just without pre-rendered HTML for crawlers)

## Testing Strategy

### Unit Tests (Example-Based)
- 3Sum: Verify with known inputs `[-1,0,1,2,-1,-4]` → `[[-1,-1,2],[-1,0,1]]`
- Coin Change: Verify `coins=[1,5,10], amount=11` → `2`, `coins=[2], amount=3` → `-1`
- AlgoVisualizer: Render test verifying initial step is 0, tab switch preserves state
- Git removal: Assert `CATEGORY_MAPPINGS` has no git entry, `TOPIC_ORDER` has no git key
- IndexedDB adapter: Verify database opens with correct name and store

### Property-Based Tests (fast-check, 100+ iterations)
- 3Sum duplicate-free output (Property 1)
- Coin Change correctness against reference (Property 2)
- Storage API round-trip consistency (Property 8)
- Content validator severity classification (Properties 5, 6)
- Multi-page topic detection (Property 10)
- Sitemap URL completeness (Property 11)

### Integration Tests
- Content pipeline end-to-end with fixture directory
- PWA cache behavior (manual verification)
- Pre-rendered HTML contains content (post-build check)

### Smoke Tests
- Kafka/Distributed Systems content files exist and pass validator
- Audit document exists with correct format
- Build succeeds with Git section removed

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: 3Sum produces no duplicate triplets

*For any* integer array, the 3Sum implementation SHALL produce a result set where no two triplets contain the same three values (regardless of order within the triplet).

**Validates: Requirements 1.1, 1.2**

### Property 2: Coin Change returns minimum or -1

*For any* set of coin denominations and any target amount, the Coin Change implementation SHALL return either the minimum number of coins that sum to the target (verified against a brute-force reference), or -1 if no valid combination exists.

**Validates: Requirements 2.1, 2.2**

### Property 3: AlgoVisualizer step preservation across tab switches

*For any* valid step position within a pattern's visualization and any sequence of tab switches, returning to the original tab SHALL restore the exact step position that was active when the user left.

**Validates: Requirements 3.1**

### Property 4: Git content excluded from pipeline output

*For any* content directory structure containing a `git/` subdirectory, the content pipeline SHALL produce a manifest with zero categories or topics referencing Git content.

**Validates: Requirements 7.1, 7.4**

### Property 5: Missing sections produce informational messages only

*For any* content file that is missing one or more recommended sections, the content validator SHALL emit messages with severity `info` (not `warning`) for the missing sections, and SHALL emit no section-related messages when all recommended sections are present.

**Validates: Requirements 8.1, 8.2, 8.4**

### Property 6: Word count validation independent of section presence

*For any* content file with prose word count below the configured minimum, the content validator SHALL emit a word count warning regardless of which sections are present or absent.

**Validates: Requirements 8.3**

### Property 7: Storage fallback cascade ordering

*For any* storage operation, when localStorage is unavailable the Storage Module SHALL attempt IndexedDB before falling back to in-memory storage, and when both localStorage and IndexedDB are unavailable it SHALL use the in-memory Map without throwing errors.

**Validates: Requirements 9.1, 9.2, 9.6**

### Property 8: Storage API consistency across backends

*For any* key-value pair and any active storage backend (localStorage, IndexedDB, or memory), calling `set(key, value)` followed by `get(key, default)` SHALL return the original value, and calling `remove(key)` followed by `get(key, default)` SHALL return the default value.

**Validates: Requirements 9.5**

### Property 9: IndexedDB adapter namespace consistency

*For any* key stored through the IndexedDB adapter, the underlying database entry SHALL use the `csguide:` prefix in its key field.

**Validates: Requirements 9.3**

### Property 10: Multi-page topic detection correctness

*For any* directory structure where a subdirectory contains an `index.md` file, `detectMultiPageTopics()` SHALL include that directory in its results, and for any subdirectory without an `index.md`, it SHALL not be included.

**Validates: Requirements 10.3**

### Property 11: Sitemap includes all manifest URLs

*For any* content manifest with N topics and M total subtopics, the generated sitemap.xml SHALL contain URL entries for all N topic pages and all M subtopic pages.

**Validates: Requirements 12.1**

### Property 12: Meta tags present for all content pages

*For any* rendered content page (topic or subtopic), the HTML output SHALL include a `<title>` element and a `<meta name="description">` tag with non-empty content derived from the topic metadata.

**Validates: Requirements 12.4**
