# Direction 6: Enterprise Onboarding & Internal Training SaaS

## Identity

A B2B platform where companies upload their internal knowledge (SOPs, runbooks, architecture docs, onboarding materials) and the system transforms it into adaptive learning paths with assessments, simulations, and progress tracking.

## Why This Direction

- Enterprise training is a $370B+ market
- Most internal knowledge bases are terrible (Confluence wikis nobody reads)
- Companies already budget for training tools
- Your content pipeline architecture is literally designed to ingest markdown → structured learning
- Recurring B2B revenue is more stable than consumer subscriptions
- Your experience at Infosys/Charter (40+ microservices, onboarding complexity) gives you firsthand understanding of the problem

## Target User

- Engineering managers onboarding new hires
- L&D (Learning & Development) teams
- DevOps teams with complex runbooks
- Compliance officers needing training verification
- Any team where "read the wiki" is the current onboarding strategy

## Core Problem

Every engineering org has this:
```
New hire joins
    → Gets pointed to Confluence/Notion
    → 200+ pages of unstructured docs
    → No guidance on what to read first
    → No way to verify understanding
    → Takes 3-6 months to become productive
    → Knowledge is tribal, not systematic
```

Your system solves this:
```
Company uploads docs
    → System structures into learning graph
    → Generates assessments automatically
    → Creates guided onboarding path
    → Tracks competency progression
    → Manager sees: "New hire is 60% through backend onboarding"
    → AI answers questions using company context
```

## What Changes

### Must Build

1. **Document Ingestion Pipeline**
   - Accept: Markdown, Confluence export, Notion export, PDF, Google Docs
   - Parse into knowledge nodes
   - AI-assisted: auto-detect relationships, prerequisites, competencies
   - Human review: confirm/adjust generated structure

2. **Multi-Tenant Architecture**
   - Organization accounts with team management
   - Role-based access (admin, manager, learner)
   - Custom branding per org
   - Data isolation between tenants

3. **Auto-Assessment Generation**
   - AI generates quiz questions from content
   - Configurable difficulty levels
   - Manager can review/edit generated assessments
   - Track: who passed, who needs review

4. **Manager Dashboard**
   ```
   Team Progress Overview
   ├── Engineer A: 85% complete, strong in backend, weak in deployment
   ├── Engineer B: 40% complete, blocked on prerequisites
   └── Engineer C: 95% complete, ready for independent work
   ```

5. **Onboarding Path Builder**
   - Drag-and-drop path creation
   - Set milestones and deadlines
   - Prerequisite enforcement
   - Notification system (reminders, completions)

6. **AI Knowledge Assistant**
   - "Ask about our system" chat interface
   - Answers grounded in company's uploaded docs
   - Cites sources (links to specific sections)
   - Escalates to human when uncertain

## Architecture Impact

High. Requires:
- Backend server (can't be client-only anymore)
- Multi-tenant database
- File ingestion pipeline
- AI integration (embeddings + generation)
- Admin UI
- API layer

Leverages existing:
- Content pipeline (core parsing logic)
- Markdown parser (already handles complex structures)
- Progress tracking (per-user state)
- Interactive components (quizzes, code playground)
- PWA (offline access for field workers)

## Execution Plan (8-12 weeks)

1. Backend: Supabase or custom (auth, multi-tenant, storage) — 1 week
2. Document ingestion: Markdown + Confluence import — 1 week
3. AI structuring: auto-generate graph from raw docs — 1 week
4. Assessment generation: AI quiz creation — 1 week
5. Manager dashboard: team progress view — 1 week
6. Onboarding path builder: drag-and-drop UI — 1 week
7. AI assistant: RAG over company docs — 1 week
8. Landing page + sales materials — 3 days
9. Pilot with 2-3 companies — 2 weeks

## Monetization

| Plan | Price | Features |
|------|-------|----------|
| Starter | $29/user/mo | 5 users, basic paths, assessments |
| Team | $19/user/mo | 20 users, AI assistant, analytics |
| Enterprise | Custom | Unlimited, SSO, custom integrations, SLA |

Revenue potential:
- 10 companies × 20 users × $19/mo = $3,800/mo
- 50 companies × 50 users × $19/mo = $47,500/mo
- Enterprise deals: $50K-200K/yr each

## Competitive Landscape

| Competitor | Weakness |
|-----------|----------|
| Confluence | No learning paths, no assessments, no progress tracking |
| Notion | Same — it's a wiki, not a training system |
| Lessonly/Seismic | Expensive, not engineering-focused |
| Docebo | Generic LMS, not knowledge-graph-aware |
| **This** | **Turns existing docs into adaptive learning — no content creation needed** |

## Risks

- Enterprise sales cycle is 3-6 months
- Multi-tenant architecture is complex
- AI-generated assessments need quality control
- Companies are protective of internal docs (security/compliance concerns)
- You'd need to handle SOC2 compliance yourself
- Very different from consumer product — different skills needed

## Growth Path

This direction naturally leads into:
- → Direction 3 (graph) — knowledge graph is the core data model
- → Direction 5 (cybersecurity) — compliance training as a vertical
- → Direction 4 (incident sim) — company-specific incident training

## Bottom Line

Highest revenue ceiling, but also highest complexity and longest time-to-market. This is a real B2B SaaS play that requires: backend infrastructure, sales process, security compliance, and enterprise-grade reliability. 

Best pursued if you want to build a company, not just a product. The CS app becomes your proof-of-concept / demo of the platform's capabilities.
