# Shared Infrastructure Specs

These four systems unlock the most directions simultaneously. Build these and you have the foundation for Directions 1–8.

---

## 1. Supabase Backend (Unlocks: Directions 1, 2, 6, 7, 8)

### What It Is

A hosted backend providing auth, PostgreSQL database, realtime subscriptions, and edge functions. Replaces localStorage as the persistence layer while keeping the app client-rendered.

### Architecture

```
React App (Vite SPA)
    ↓ Supabase JS Client
Supabase
    ├── Auth (email, Google, GitHub OAuth)
    ├── PostgreSQL (user data, progress, competencies)
    ├── Realtime (live sync across tabs/devices)
    ├── Storage (user uploads, if needed later)
    └── Edge Functions (server-side logic, webhooks)
```

### Database Schema

```sql
-- Users (managed by Supabase Auth, extended with profile)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- User preferences/settings
create table public.user_settings (
  user_id uuid references public.profiles(id) on delete cascade primary key,
  theme text default 'dark',
  work_duration int default 25,
  break_duration int default 5,
  daily_goal int default 3,
  updated_at timestamptz default now()
);

-- Progress tracking (replaces localStorage completed-topics)
create table public.progress (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  node_id text not null,           -- e.g. "backend/api-design/rest-api-design"
  node_type text not null,         -- 'topic' | 'subtopic'
  completed boolean default false,
  completed_at timestamptz,
  created_at timestamptz default now(),
  unique(user_id, node_id)
);

-- Bookmarks
create table public.bookmarks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  topic_id text not null,
  section_id text not null,
  title text not null,
  created_at timestamptz default now(),
  unique(user_id, topic_id, section_id)
);

-- Study sessions (for weekly stats, streaks)
create table public.study_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds int,
  topics_covered text[],           -- array of node_ids studied
  pomodoros_completed int default 0
);

-- Spaced repetition schedule
create table public.review_schedule (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  node_id text not null,
  next_review_at timestamptz not null,
  interval_days int default 1,
  ease_factor numeric default 2.5,
  repetitions int default 0,
  last_reviewed_at timestamptz,
  unique(user_id, node_id)
);

-- Row Level Security (every table)
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.progress enable row level security;
alter table public.bookmarks enable row level security;
alter table public.study_sessions enable row level security;
alter table public.review_schedule enable row level security;

-- Policy: users can only access their own data
create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- (Similar policies for all tables — user_id = auth.uid())
```

### Client Integration

```typescript
// src/utils/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

```typescript
// src/hooks/useAuth.ts
import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase';
import type { User, Session } from '@supabase/supabase-js';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = () => supabase.auth.signInWithOAuth({ provider: 'google' });
  const signInWithGitHub = () => supabase.auth.signInWithOAuth({ provider: 'github' });
  const signOut = () => supabase.auth.signOut();

  return { user, session, loading, signInWithGoogle, signInWithGitHub, signOut };
}
```

### Sync Strategy (localStorage ↔ Supabase)

```
User not logged in:
    → All data stays in localStorage (current behavior, unchanged)

User logs in for first time:
    → Migrate localStorage data to Supabase (one-time upload)
    → Clear localStorage sync keys
    → All future reads/writes go to Supabase

User logs in on new device:
    → Pull all data from Supabase
    → Populate local cache for offline support

Offline mode:
    → Write to localStorage queue
    → Sync to Supabase when back online (conflict resolution: last-write-wins)
```

### What This Enables

- Cross-device progress sync
- Data survives browser clear
- Foundation for payments (user identity exists)
- Foundation for AI features (user state accessible server-side)
- Foundation for enterprise (multi-tenant ready with RLS)
- Realtime: open on two tabs, progress syncs instantly

### Effort: 3-4 days

1. Supabase project setup + schema (0.5 day)
2. Auth hook + login/signup UI (1 day)
3. Sync layer: migrate existing hooks to read/write Supabase (1.5 days)
4. Offline queue + conflict resolution (1 day)

### Cost: $0 (free tier)

Supabase free tier includes:
- 50,000 monthly active users
- 500 MB database
- 1 GB storage
- Unlimited API requests

More than enough for years.

---

## 2. Competency Model (Unlocks: Directions 2, 3, 4, 8)

### What It Is

A data model that tracks mastery per knowledge concept — not just "completed/not completed" but a continuous score reflecting understanding depth, recency, and confidence.

### Data Model

```typescript
// src/types/competency.ts

/** A single competency represents mastery of a concept area */
export interface Competency {
  id: string;                    // e.g. "distributed-systems", "graph-traversal"
  name: string;                  // Human-readable: "Distributed Systems"
  category: string;              // Parent category: "system-design"
}

/** User's state for a single competency */
export interface CompetencyState {
  competencyId: string;
  mastery: number;               // 0.0 - 1.0 (0 = never seen, 1 = fully mastered)
  confidence: number;            // 0.0 - 1.0 (based on quiz/assessment performance)
  exposure: number;              // How many nodes contributing to this competency were visited
  lastAssessedAt: Date | null;   // Last time a quiz/assessment was completed
  lastStudiedAt: Date | null;    // Last time any related content was read
  retentionEstimate: number;     // 0.0 - 1.0 (decays over time via Ebbinghaus curve)
}

/** Evidence that contributes to a competency score */
export interface CompetencyEvidence {
  nodeId: string;                // Which content node generated this evidence
  type: 'read' | 'quiz' | 'code' | 'simulation';
  score: number;                 // 0.0 - 1.0 for this specific interaction
  timestamp: Date;
}

/** Aggregated user competency profile */
export interface CompetencyProfile {
  userId: string;
  competencies: Map<string, CompetencyState>;
  weakAreas: string[];           // Top 5 lowest-mastery competency IDs
  strongAreas: string[];         // Top 5 highest-mastery competency IDs
  overallMastery: number;        // Weighted average across all competencies
  lastUpdated: Date;
}
```

### Competency Taxonomy (maps to content)

```typescript
// src/data/competency-taxonomy.ts

/** 
 * Each content node (subtopic) maps to 1-3 competencies.
 * This is the bridge between "content you read" and "skills you have."
 */
export const COMPETENCY_MAP: Record<string, string[]> = {
  // DSA
  'array-fundamentals': ['arrays', 'time-complexity'],
  'two-pointers-and-sliding-window': ['arrays', 'algorithm-patterns'],
  'binary-trees': ['trees', 'recursion'],
  'graph-traversal': ['graphs', 'search-algorithms'],
  'dynamic-programming-fundamentals': ['dynamic-programming', 'optimization'],
  
  // Backend
  'rest-api-design': ['api-design', 'http'],
  'kafka-basics': ['messaging', 'distributed-systems'],
  'spring-boot': ['java-frameworks', 'backend-architecture'],
  
  // System Design
  'distributed-systems': ['distributed-systems', 'scalability'],
  'caching': ['caching', 'performance'],
  'load-balancing': ['scalability', 'networking'],
  
  // ... (every subtopic maps to competencies)
};

/** All competency definitions */
export const COMPETENCIES: Competency[] = [
  { id: 'arrays', name: 'Arrays & Strings', category: 'dsa' },
  { id: 'trees', name: 'Trees', category: 'dsa' },
  { id: 'graphs', name: 'Graphs', category: 'dsa' },
  { id: 'dynamic-programming', name: 'Dynamic Programming', category: 'dsa' },
  { id: 'distributed-systems', name: 'Distributed Systems', category: 'system-design' },
  { id: 'api-design', name: 'API Design', category: 'backend' },
  { id: 'messaging', name: 'Messaging Systems', category: 'backend' },
  { id: 'caching', name: 'Caching', category: 'system-design' },
  { id: 'scalability', name: 'Scalability', category: 'system-design' },
  // ... ~30-50 total competencies
];
```

### Scoring Algorithm

```typescript
// src/utils/competency-scoring.ts

const DECAY_HALF_LIFE_DAYS = 14; // Mastery halves every 14 days without review

/** Calculate retention decay based on time since last study */
export function calculateRetention(lastStudiedAt: Date, now: Date): number {
  const daysSince = (now.getTime() - lastStudiedAt.getTime()) / (1000 * 60 * 60 * 24);
  // Ebbinghaus forgetting curve approximation
  return Math.exp(-0.693 * daysSince / DECAY_HALF_LIFE_DAYS);
}

/** Update competency state after a learning event */
export function updateCompetency(
  current: CompetencyState,
  evidence: CompetencyEvidence
): CompetencyState {
  const now = new Date();
  
  // Weight new evidence against existing mastery
  const evidenceWeight = evidence.type === 'quiz' ? 0.3 
                       : evidence.type === 'code' ? 0.25
                       : evidence.type === 'simulation' ? 0.35
                       : 0.1; // 'read' has lowest weight
  
  const newMastery = current.mastery * (1 - evidenceWeight) + evidence.score * evidenceWeight;
  
  // Confidence increases with more assessments, decreases with failures
  const confidenceAdjust = evidence.type === 'read' ? 0 
                         : evidence.score > 0.7 ? 0.05 
                         : -0.1;
  const newConfidence = Math.max(0, Math.min(1, current.confidence + confidenceAdjust));
  
  return {
    ...current,
    mastery: Math.max(0, Math.min(1, newMastery)),
    confidence: newConfidence,
    exposure: current.exposure + 1,
    lastStudiedAt: now,
    lastAssessedAt: evidence.type !== 'read' ? now : current.lastAssessedAt,
    retentionEstimate: 1.0, // Just studied, full retention
  };
}

/** Get weak areas (lowest effective mastery considering decay) */
export function getWeakAreas(profile: CompetencyProfile, topN: number = 5): string[] {
  const now = new Date();
  
  return Array.from(profile.competencies.entries())
    .map(([id, state]) => ({
      id,
      effectiveMastery: state.lastStudiedAt 
        ? state.mastery * calculateRetention(state.lastStudiedAt, now)
        : 0,
    }))
    .sort((a, b) => a.effectiveMastery - b.effectiveMastery)
    .slice(0, topN)
    .map(item => item.id);
}
```

### Hook Interface

```typescript
// src/hooks/useCompetency.ts

export function useCompetency() {
  // Returns:
  return {
    profile: CompetencyProfile;           // Full competency state
    weakAreas: string[];                  // Current weak competencies
    strongAreas: string[];                // Current strong competencies
    overallMastery: number;               // 0-1 aggregate score
    
    recordEvidence: (evidence: CompetencyEvidence) => void;  // Log a learning event
    getCompetency: (id: string) => CompetencyState;          // Get single competency
    getRecommendations: () => string[];                      // What to study next
  };
}
```

### Storage

- **Without Supabase**: localStorage (`csguide:competency-profile`)
- **With Supabase**: `competency_states` table + `competency_evidence` table

```sql
-- If using Supabase
create table public.competency_states (
  user_id uuid references public.profiles(id) on delete cascade,
  competency_id text not null,
  mastery numeric default 0,
  confidence numeric default 0,
  exposure int default 0,
  last_assessed_at timestamptz,
  last_studied_at timestamptz,
  primary key (user_id, competency_id)
);

create table public.competency_evidence (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  competency_id text not null,
  node_id text not null,
  evidence_type text not null,
  score numeric not null,
  created_at timestamptz default now()
);
```

### What This Enables

- Session engine knows what's weak → recommends the right topics
- AI tutor knows your level → adapts explanations
- Incident simulator knows your gaps → picks appropriate scenarios
- Progress page shows mastery heatmap, not just checkboxes
- Spaced repetition becomes competency-aware (review weak skills, not random topics)

### Effort: 3-4 days

1. Define competency taxonomy + mapping to content (1 day)
2. Scoring algorithm + decay logic (1 day)
3. Hook implementation + storage (1 day)
4. Wire into existing progress/quiz flows (1 day)

### Cost: $0

Pure client-side logic. No external services needed.

---

## 3. Graph Data Model (Unlocks: Directions 3, 4, 5, 8)

### What It Is

Relationships between knowledge nodes — prerequisites, related concepts, and competency mappings. Transforms the content tree into a traversable graph that enables intelligent navigation, path-finding, and recommendations.

### Data Model

```typescript
// src/types/graph.ts

/** Types of relationships between knowledge nodes */
export type EdgeType = 
  | 'prerequisite'    // Must understand A before B
  | 'builds-on'      // B extends concepts from A
  | 'related'        // A and B cover similar ground
  | 'contrasts'      // A and B are alternatives/opposites
  | 'applies-to'     // A is a pattern used in B

/** A directed edge between two knowledge nodes */
export interface Edge {
  source: string;     // Node ID
  target: string;     // Node ID
  type: EdgeType;
  weight: number;     // 0-1, strength of relationship
}

/** A knowledge node (extends existing topic/subtopic concept) */
export interface GraphNode {
  id: string;                    // e.g. "backend/api-design/rest-api-design"
  title: string;
  category: string;
  topic: string;
  competencies: string[];        // Which competencies this node teaches
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedMinutes: number;
  prerequisites: string[];       // Node IDs that should be completed first
  related: string[];             // Node IDs of related content
}

/** The full knowledge graph */
export interface KnowledgeGraph {
  nodes: Map<string, GraphNode>;
  edges: Edge[];
  
  // Computed indexes for fast lookup
  prerequisitesOf: Map<string, string[]>;   // nodeId → what it requires
  dependentsOf: Map<string, string[]>;      // nodeId → what depends on it
  relatedTo: Map<string, string[]>;         // nodeId → related nodes
}
```

### Content Frontmatter Extension

Add to each subtopic `.md` file:

```yaml
---
prerequisites:
  - backend/api-design/rest-api-design
  - networking/protocols/http
related:
  - backend/api-design/grpc
  - backend/spring-framework/spring-rest
competencies:
  - api-design
  - http
difficulty: intermediate
estimatedMinutes: 45
---
```

### Pipeline Extension

```typescript
// In vite-content-plugin.ts — extend parsing to extract frontmatter

interface SubtopicMetadata {
  prerequisites?: string[];
  related?: string[];
  competencies?: string[];
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  estimatedMinutes?: number;
}

// During build: collect all metadata → generate graph.json
// Output: public/content/graph.json
```

### Graph Operations

```typescript
// src/utils/graph-operations.ts

/** Find shortest learning path from current state to target node */
export function findLearningPath(
  graph: KnowledgeGraph,
  completedNodes: Set<string>,
  targetNodeId: string
): string[] {
  // BFS from target backwards through prerequisites
  // Filter out already-completed nodes
  // Return ordered list of nodes to study
}

/** Get all nodes that are "unlocked" (prerequisites met) */
export function getUnlockedNodes(
  graph: KnowledgeGraph,
  completedNodes: Set<string>
): string[] {
  return Array.from(graph.nodes.keys()).filter(nodeId => {
    const prereqs = graph.prerequisitesOf.get(nodeId) ?? [];
    return prereqs.every(p => completedNodes.has(p));
  });
}

/** Get recommended next nodes based on competency gaps + prerequisites */
export function getRecommendations(
  graph: KnowledgeGraph,
  completedNodes: Set<string>,
  competencyProfile: CompetencyProfile,
  count: number = 5
): string[] {
  const unlocked = getUnlockedNodes(graph, completedNodes);
  
  // Score each unlocked node by:
  // - How much it improves weak competencies
  // - Difficulty appropriateness
  // - Recency (haven't studied this area recently)
  
  return unlocked
    .map(nodeId => ({ nodeId, score: scoreNode(graph, nodeId, competencyProfile) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map(item => item.nodeId);
}

/** Detect circular prerequisites (validation) */
export function detectCycles(graph: KnowledgeGraph): string[][] {
  // Tarjan's algorithm or DFS-based cycle detection
  // Returns array of cycles found (should be empty)
}
```

### Visual Graph Explorer

```typescript
// src/components/interactive/GraphExplorer.tsx
// Uses Cytoscape.js (already in your bundle)

// Features:
// - Pan/zoom interactive graph
// - Nodes colored by mastery level (red → yellow → green)
// - Click node → see details + navigate to content
// - Highlight prerequisites when hovering
// - Filter by category, difficulty, completion status
// - "Show path to X" mode
```

### Build Output

```json
// public/content/graph.json
{
  "nodes": [
    {
      "id": "backend/api-design/rest-api-design",
      "title": "REST API Design",
      "category": "backend",
      "topic": "api-design",
      "competencies": ["api-design", "http"],
      "difficulty": "intermediate",
      "estimatedMinutes": 45,
      "prerequisites": ["networking/protocols/http"],
      "related": ["backend/api-design/grpc", "backend/spring-framework/spring-rest"]
    }
  ],
  "edges": [
    { "source": "networking/protocols/http", "target": "backend/api-design/rest-api-design", "type": "prerequisite", "weight": 0.9 },
    { "source": "backend/api-design/rest-api-design", "target": "backend/api-design/grpc", "type": "related", "weight": 0.7 }
  ]
}
```

### What This Enables

- "What should I learn next?" becomes a graph traversal problem
- Visual concept map shows the full knowledge landscape
- Prerequisites prevent users from jumping into advanced content unprepared
- AI tutor can reference related concepts the user already knows
- Incident simulator can check if user has prerequisite knowledge for a scenario
- Path-finding: "Get me from zero to system design interview ready"

### Effort: 5-7 days

1. Define graph schema + edge types (0.5 day)
2. Add frontmatter to 182 subtopic files (3-4 days, partially automatable)
3. Extend pipeline to parse + generate graph.json (1 day)
4. Graph operations utility (path-finding, recommendations) (1 day)
5. Graph explorer component with Cytoscape (2-3 days)

### Cost: $0

All client-side. Cytoscape.js is already bundled.

---

## 4. Landing Page / SEO (Unlocks: Directions 1, 5, 7)

### What It Is

A marketing-optimized entry point that's discoverable by Google, communicates value, and converts visitors into users. Separate from the SPA — either pre-rendered or a lightweight static site.

### The Problem

Your current app is a client-rendered SPA. Google sees an empty `<div id="root">` and indexes nothing. No organic traffic, no discoverability.

### Options

| Approach | Effort | Trade-off |
|----------|--------|-----------|
| **Vite SSG plugin** (vite-ssg) | 2 days | Minimal change, pre-renders routes at build time |
| **Separate Next.js marketing site** | 3-4 days | Full SSR, best SEO, separate deploy |
| **Static HTML landing + existing SPA** | 1 day | Quick, manual, limited |
| **Astro marketing site** | 2-3 days | Fast static site, great DX, separate from app |

**Recommended: Astro or static HTML for landing + keep SPA as-is.**

Why: Your app doesn't need SSR (it's a tool, not a content site for Google). You just need a landing page that ranks and funnels people into the app.

### Landing Page Structure

```
/ (landing page — static, SEO-optimized)
├── Hero: headline + value prop + CTA
├── Features: 4-6 key differentiators with visuals
├── Content preview: show topic breadth
├── Social proof: GitHub stars, user count, testimonials
├── Pricing (if applicable) or "Get Started Free"
├── FAQ
└── Footer: links, legal

/app (the actual SPA — unchanged)
├── Dashboard
├── Topics
├── Progress
└── ...
```

### SEO Strategy

```html
<!-- Meta tags for landing page -->
<title>CS Reference Guide — Interactive Computer Science Study System</title>
<meta name="description" content="Master DSA, system design, and backend engineering with interactive playgrounds, spaced repetition, and guided learning paths. Free and open source." />
<meta property="og:title" content="CS Reference Guide" />
<meta property="og:description" content="All-in-one CS interview prep with interactive code playgrounds, SQL sandbox, and adaptive study tools." />
<meta property="og:image" content="/og-image.png" />
<link rel="canonical" href="https://cs-reference-guide.netlify.app/" />
```

```
<!-- Sitemap (already generated by your pipeline) -->
<!-- robots.txt -->
User-agent: *
Allow: /
Sitemap: https://cs-reference-guide.netlify.app/sitemap.xml
```

### Content SEO (free traffic)

Pre-render topic overview pages as static HTML so Google indexes them:

```
/topics/data-structures-algorithms    → "Data Structures & Algorithms Guide"
/topics/system-design                 → "System Design Interview Prep"
/topics/backend                       → "Backend Engineering Reference"
```

Each page has:
- H1 title
- Description paragraph
- List of subtopics with brief descriptions
- "Open in App" CTA button
- Schema.org structured data (Course, LearningResource)

### Implementation (Static HTML approach — simplest)

```html
<!-- public/index.html (landing page, served at /) -->
<!-- Netlify serves this for / -->
<!-- App lives at /app/* -->
```

Or with Netlify redirects:

```toml
# netlify.toml addition
[[redirects]]
  from = "/app/*"
  to = "/app/index.html"
  status = 200

# Landing page is just public/index.html (static)
# App is at /app/ with its own index.html
```

### What This Enables

- Google indexes your content → organic traffic
- Visitors understand value before entering the app
- Conversion funnel: Google → landing → sign up → app
- Professional appearance for portfolio/job applications
- Foundation for content marketing (blog posts linking to topics)

### Effort: 1-3 days

| Approach | Time |
|----------|------|
| Static HTML landing page | 1 day |
| Pre-rendered topic pages (vite-ssg) | 2 days |
| Separate Astro site | 2-3 days |

### Cost: $0

Static HTML on Netlify free tier. No additional services.

---

## Combined Build Order

If you build all four in sequence:

```
Week 1-2: Competency Model (pure frontend, no dependencies)
    → Immediately improves session recommendations
    → Foundation for everything else

Week 2-3: Graph Data Model (extends content pipeline)
    → Add frontmatter metadata to content files
    → Build graph.json generation
    → Wire into competency model for smarter scoring

Week 3-4: Supabase Backend (auth + sync)
    → Persist competency state to cloud
    → Cross-device sync
    → User identity for future features

Week 4-5: Landing Page / SEO
    → Drive organic traffic to the now-smarter app
    → Professional presentation layer
```

### After these four, you can bolt on ANY direction:

| Direction | What's left after shared infra |
|-----------|-------------------------------|
| 1 (Premium) | Just Stripe + content gating |
| 2 (Adaptive) | Just session UI + "Start Session" button |
| 3 (Graph Platform) | Just visual explorer + domain packs |
| 4 (Incident Sim) | Just scenario content + log viewer |
| 5 (Cybersecurity) | Just security content + SIEM UI |
| 6 (Enterprise) | Multi-tenant + ingestion pipeline |
| 7 (Interview) | Coding problems + test runner |
| 8 (AI Tutor) | OpenAI integration + RAG pipeline |

The shared infrastructure is the multiplier. Build it once, unlock everything.
