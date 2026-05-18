# Feature Requirements by Direction

What each direction actually needs built, broken into concrete features.

---

## Direction 1: Premium Study App

### Features Needed

| Feature | Description | Effort |
|---------|-------------|--------|
| **Auth system** | Email + OAuth (Google/GitHub) sign-up/login | 2 days |
| **User database** | Store user profiles, preferences | 1 day |
| **Cloud sync** | Sync progress, bookmarks, SRS state to server | 2 days |
| **Payment integration** | Stripe Checkout, webhook handler | 1 day |
| **Content gating** | Free tier (5-10 topics), premium wall for rest | 1 day |
| **Protected routes** | Redirect non-paying users to upgrade page | 0.5 day |
| **Landing page** | Marketing site with value prop, features, pricing | 2 days |
| **SEO layer** | Pre-rendering or SSR for Google discoverability | 2 days |
| **Account settings** | Manage subscription, cancel, update payment | 1 day |
| **Email system** | Welcome email, payment receipts, reminders | 1 day |

**Tech needed**: Supabase (or Firebase), Stripe, Next.js (or pre-renderer)

---

## Direction 2: Adaptive Learning Engine

### Features Needed

| Feature | Description | Effort |
|---------|-------------|--------|
| **Competency model** | Data schema tracking mastery per concept (0-1 scale) | 1 day |
| **Session scoring algorithm** | Rank topics by: recency + weakness + prerequisites | 2 days |
| **"Start Session" button** | Dashboard entry point into guided flow | 1 day |
| **Session flow UI** | Sequential: read → practice → assess, with progress bar | 2 days |
| **Quiz feedback loop** | Quiz results update competency scores | 1 day |
| **Weak-area detection** | Identify lowest-scoring competencies, surface to user | 2 days |
| **Spaced repetition v2** | Integrate SRS with competency decay (Ebbinghaus curve) | 2 days |
| **Session history** | Log past sessions, show streak/consistency | 1 day |
| **Daily goal integration** | Connect session completion to existing daily goal system | 0.5 day |
| **Cold start flow** | First-time user: pick goals, assess baseline level | 2 days |

**Tech needed**: Mostly frontend logic + localStorage/Supabase. No new dependencies.

---

## Direction 3: Knowledge Graph Platform

### Features Needed

| Feature | Description | Effort |
|---------|-------------|--------|
| **Metadata frontmatter** | Add prerequisites, related, competencies to all 182 files | 5 days |
| **Graph schema** | Define node types, edge types, relationship weights | 1 day |
| **Pipeline extension** | Parse frontmatter relationships during build | 2 days |
| **Graph data structure** | Runtime traversable graph (nodes + edges) | 2 days |
| **Graph resolver** | "What should I learn next?" based on state + graph | 2 days |
| **Path finder** | "Shortest path from A to B" through prerequisites | 2 days |
| **Visual graph explorer** | Interactive concept map (cytoscape or d3) | 4 days |
| **Mastery overlay** | Color-code graph nodes by user's competency level | 1 day |
| **Prerequisite enforcement** | Warn/block if prerequisites not met | 1 day |
| **Domain pack structure** | Abstract content into pluggable domain modules | 3 days |

**Tech needed**: Cytoscape.js (already in config), graph traversal algorithms, extended markdown frontmatter.

---

## Direction 4: Incident Simulator

### Features Needed

| Feature | Description | Effort |
|---------|-------------|--------|
| **Scenario schema** | Data model: architecture, symptoms, clues, root cause, fixes | 2 days |
| **Scenario content** | Write 10+ scenarios from real experience | 5 days |
| **Log viewer component** | CloudWatch-style searchable log display | 3 days |
| **Metrics dashboard** | Simulated charts: latency, throughput, error rate | 3 days |
| **Service map** | Interactive architecture diagram with health indicators | 3 days |
| **Progressive clue system** | Reveal clues as user investigates (not all at once) | 2 days |
| **Hypothesis tracker** | User records their theory, system evaluates | 2 days |
| **Fix implementation** | Code editor for writing the fix (extends playground) | 2 days |
| **Evaluation engine** | Score: correct diagnosis? proper fix? verification? | 3 days |
| **Debrief view** | Show optimal path vs user's path, missed signals | 2 days |
| **Timer** | Incident clock (how fast did they resolve?) | 0.5 day |
| **Scenario browser** | List scenarios by difficulty, domain, status | 1 day |

**Tech needed**: Custom components (log viewer, metrics charts via Recharts, service map via cytoscape), scenario content format.

---

## Direction 5: Cybersecurity Training

### Features Needed

| Feature | Description | Effort |
|---------|-------------|--------|
| **Security content** | 5 categories, 15+ topics in security domain | 1 week |
| **SIEM simulator** | Alert feed, log search, timeline visualization | 4 days |
| **Network diagram** | Interactive network with traffic flows, compromised nodes | 3 days |
| **Attack chain visualizer** | Kill chain / MITRE ATT&CK mapping display | 3 days |
| **Security scenarios** | 10+ interactive security incident scenarios | 1 week |
| **IOC tracker** | Indicators of Compromise collection during investigation | 2 days |
| **Incident report builder** | Structured form for documenting findings | 2 days |
| **Certification system** | Track completions, issue certificates/badges | 3 days |
| **Badge generator** | Shareable images for LinkedIn/portfolio | 1 day |
| **Compliance modules** | HIPAA, PCI, SOC2 scenario packs | 1 week |
| **Separate landing page** | adversesolutions.com/training or adverselabs.com | 2 days |

**Tech needed**: Same as Direction 4 (shared scenario engine) + security-specific content + certificate generation.

---

## Direction 6: Enterprise Onboarding

### Features Needed

| Feature | Description | Effort |
|---------|-------------|--------|
| **Backend server** | API layer (can't be client-only anymore) | 3 days |
| **Multi-tenant auth** | Organization accounts, team management, roles | 3 days |
| **Document ingestion** | Accept Markdown, Confluence export, Notion, PDF | 1 week |
| **AI structuring** | Auto-generate graph from raw docs (LLM + embeddings) | 1 week |
| **Auto-assessment generation** | AI creates quizzes from uploaded content | 3 days |
| **Manager dashboard** | Team progress overview, per-person stats | 3 days |
| **Onboarding path builder** | Drag-and-drop path creation with milestones | 4 days |
| **Deadline/notification system** | Reminders, completion alerts, overdue warnings | 2 days |
| **AI knowledge assistant** | RAG chat over company docs | 3 days |
| **SSO integration** | SAML/OIDC for enterprise auth | 2 days |
| **Admin panel** | Manage content, users, paths, assessments | 3 days |
| **Billing (per-seat)** | Stripe with seat-based pricing, invoicing | 2 days |
| **Data isolation** | Tenant separation, encryption at rest | 2 days |
| **Audit logging** | Track who accessed what, when | 1 day |

**Tech needed**: Backend (Node/Express or Supabase Edge Functions), PostgreSQL, OpenAI API, file parsers, enterprise auth (Auth0 or WorkOS).

---

## Direction 7: Interview Prep Platform

### Features Needed

| Feature | Description | Effort |
|---------|-------------|--------|
| **Problem schema** | Data model: problem statement, test cases, hints, solutions | 2 days |
| **100+ coding problems** | Curated problems mapped to topics | 2-3 weeks |
| **Test case runner** | Execute user code against test cases, report pass/fail | 3 days |
| **Multi-language support** | Python, Java, JavaScript, TypeScript execution | 3 days |
| **Problem difficulty calibration** | Easy/Medium/Hard with time expectations | 1 day |
| **System design canvas** | Drawing tool for architecture diagrams | 4 days |
| **System design templates** | Structured flow: requirements → estimation → design | 2 days |
| **System design scenarios** | 20+ real scenarios (Design Twitter, URL Shortener, etc.) | 1 week |
| **Behavioral question bank** | 50+ questions with STAR framework prompts | 3 days |
| **Audio recording** | Record verbal answers for self-review | 2 days |
| **Mock interview mode** | Timed session, random problems, hint system | 3 days |
| **Readiness score** | Composite score across coding + design + behavioral | 2 days |
| **Company-specific paths** | Question patterns by company (FAANG, startups) | 2 days |
| **Performance history** | Track solve rate, time trends, improvement | 1 day |
| **Hint system** | Progressive hints (costs points) | 1 day |

**Tech needed**: Judge0 API (or extended Web Worker), canvas library (excalidraw or tldraw), audio recording API, problem content.

---

## Direction 8: AI Engineering Tutor

### Features Needed

| Feature | Description | Effort |
|---------|-------------|--------|
| **AI integration** | OpenAI/Anthropic API with streaming responses | 2 days |
| **Context assembly engine** | Pull user state + relevant content + history into prompt | 3 days |
| **RAG pipeline** | Embed all content, retrieve relevant nodes per query | 3 days |
| **Conversation memory** | Persist chat history, extract learning signals | 2 days |
| **Chat UI** | Streaming markdown + code rendering in chat interface | 2 days |
| **Adaptive explanation modes** | ELI5, Technical, Interview, Comparative toggles | 1 day |
| **AI-generated quizzes** | Generate questions calibrated to user's level | 2 days |
| **AI mock interviewer** | Simulated interviewer with follow-up questions | 3 days |
| **Diagnostic mode** | "Why do I fail at X?" — analyze history, prescribe plan | 2 days |
| **Citation system** | Ground responses in verified content, link to sources | 1 day |
| **Cost management** | Response caching, model routing (mini vs full), rate limits | 2 days |
| **Feedback loop** | AI interactions update competency model | 1 day |

**Tech needed**: OpenAI API (or Anthropic), vector database (Supabase pgvector or Pinecone), embedding pipeline, streaming UI.

---

## Shared Infrastructure (Needed by Multiple Directions)

| Feature | Needed By | Description |
|---------|-----------|-------------|
| **Supabase backend** | 1, 2, 6, 7, 8 | Auth + database + realtime |
| **Stripe payments** | 1, 5, 6, 7 | Subscriptions + one-time payments |
| **OpenAI API integration** | 6, 7, 8 | LLM calls for generation + evaluation |
| **Embeddings pipeline** | 6, 8 | Vector search over content |
| **Competency model** | 2, 3, 4, 8 | Mastery tracking per concept |
| **Graph data model** | 3, 4, 5, 8 | Relationships between knowledge nodes |
| **Scenario engine** | 4, 5 | Shared simulation framework |
| **Enhanced code execution** | 4, 7 | Test case runner, multi-language |
| **Certificate/badge system** | 5, 7 | Completion credentials |
| **Landing page / SEO** | 1, 5, 7 | Marketing + discoverability |

---

## Minimum Viable Combinations

### "Ship and charge" (2-3 weeks)
- Auth + sync (Direction 1)
- Content gating + Stripe (Direction 1)
- Session engine (Direction 2)
- Landing page (Direction 1)

### "Best product" (4-6 weeks)
- Session engine + competency model (Direction 2)
- AI explain + quiz generation (Direction 8)
- 20 coding problems + runner (Direction 7)
- Auth + payments (Direction 1)

### "Maximum differentiation" (6-8 weeks)
- Incident simulator with 10 scenarios (Direction 4)
- Session engine (Direction 2)
- Auth + payments (Direction 1)
- Debrief + scoring system (Direction 4)

### "Platform play" (3-4 months)
- Graph model + metadata (Direction 3)
- Competency engine (Direction 2)
- AI tutor with RAG (Direction 8)
- Auth + payments (Direction 1)
- Document ingestion (Direction 6)

---

## Zero-Cost Path: Portfolio + Skill Compound (No payments, no API keys)

No Stripe. No OpenAI bills. No Supabase. Everything runs client-side, free to host on Netlify, and the value is in what it does for your career — not revenue.

### Why this path makes sense
- You're early career with a strong job already
- The app becomes a living portfolio piece that demonstrates systems thinking
- Every feature you add sharpens skills directly applicable to your day job
- Free tools attract users → GitHub stars → visibility → job leverage
- No pressure to monetize means you can experiment freely

### Phase 1: Make it sticky (1-2 weeks)

| Feature | What it does | Why it matters for you |
|---------|-------------|----------------------|
| **Session engine** | Score topics by recency + weakness, show "Start Session" | Proves you can build recommendation systems |
| **Competency model** | Track mastery per topic in localStorage | State machine design — interview gold |
| **Streak tracker** | Visual streak counter + calendar heatmap | Retention UX pattern, GitHub-contributions style |
| **Better onboarding** | First-visit flow: pick goals, set daily target | Product thinking demonstration |

### Phase 2: Make it smart (2-3 weeks)

| Feature | What it does | Why it matters for you |
|---------|-------------|----------------------|
| **Prerequisite graph** | Add frontmatter to content, enforce learning order | Graph algorithms in practice |
| **Visual concept map** | Cytoscape.js graph explorer (already in your bundle) | Data visualization portfolio piece |
| **Weak-area dashboard** | Show lowest-mastery areas with drill recommendations | Analytics/observability thinking |
| **Flashcard mode** | Auto-generate cards from Quick Reference sections | Leverages existing content, zero new content needed |
| **Keyboard shortcuts** | Vim-style navigation, power-user UX | Shows attention to developer ergonomics |

### Phase 3: Make it impressive (3-4 weeks)

| Feature | What it does | Why it matters for you |
|---------|-------------|----------------------|
| **Incident scenarios (5)** | Simulated production debugging from your real experience | Highest differentiation, nobody else has this |
| **Log viewer component** | CloudWatch-style searchable logs (simulated data) | Directly mirrors your job skills |
| **Service map** | Interactive architecture diagram with health states | System design visualization |
| **Coding problems (10)** | Embedded problems with Web Worker execution (no API) | Extends existing playground, no external cost |
| **Performance budget** | Lighthouse CI in GitHub Actions, track bundle size | Shows production engineering discipline |

### Phase 4: Make it a platform showcase (ongoing)

| Feature | What it does | Why it matters for you |
|---------|-------------|----------------------|
| **Export/import progress** | JSON export of all user state (portable, no server) | Solves sync without a backend |
| **PWA enhancements** | Background sync, push notifications (free via browser) | Advanced PWA patterns |
| **Accessibility audit** | Full WCAG 2.1 AA compliance pass | Enterprise-grade quality signal |
| **Open source community** | MIT license, contributor guide, issue templates | Community building, GitHub presence |
| **Blog/changelog** | Document what you built and why (on the site itself) | Content marketing without paying for anything |

### Tech stack (all free)

| Need | Solution | Cost |
|------|----------|------|
| Hosting | Netlify free tier | $0 |
| Auth (if ever needed) | Netlify Identity or localStorage-only | $0 |
| Database | localStorage + IndexedDB | $0 |
| Code execution | Web Workers (already have) | $0 |
| Search | FlexSearch (already have) | $0 |
| Graphs | Cytoscape.js (already bundled) | $0 |
| Charts | Recharts (already have) | $0 |
| CI/CD | GitHub Actions free tier | $0 |
| Analytics | Plausible (self-host) or none | $0 |
| Diagrams | Mermaid (already have) | $0 |

### What this path gives you (career value)

- **Portfolio**: A live, complex system you can demo in any interview
- **GitHub presence**: Stars, contributions, activity graph
- **Writing material**: Each feature becomes a blog post or LinkedIn post
- **Interview stories**: "I built a recommendation engine" / "I built an incident simulator"
- **Skill compounding**: Graph algorithms, state machines, visualization, PWA, accessibility
- **Open source credibility**: Contributors, issues, community engagement

### What this path does NOT give you

- Revenue
- Users who pay (though free users still validate the product)
- Enterprise credibility (no "customers" to reference)
- Motivation from external accountability (no paying users expecting features)

### The honest trade-off

This path optimizes for:
> **Skill growth + portfolio strength + career leverage**

Not for:
> **Income or business building**

Both are valid. This path is especially strong if:
- You're happy at your current job and not trying to go indie
- You want the app to be a career accelerator, not a business
- You'd rather ship features than deal with billing/support/marketing
- You want to keep it fun and pressure-free

### Suggested first commit

Build the session engine. It's the single highest-leverage feature regardless of direction, costs nothing, and demonstrates recommendation system design in interviews.

```typescript
// Pseudocode for v1 session scoring
function getNextSession(progress: TopicProgress[]): SessionPlan {
  const scored = progress
    .map(topic => ({
      ...topic,
      score: (daysSince(topic.lastVisited) / 14) * 0.4
           + (1 - topic.mastery) * 0.5
           + (topic.prerequisitesMet ? 0.1 : 0)
    }))
    .sort((a, b) => b.score - a.score);

  return { topics: scored.slice(0, 3) };
}
```
