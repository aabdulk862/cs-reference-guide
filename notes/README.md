# Product Directions

This directory contains different strategic directions this project can evolve toward. Each file is a self-contained path with its own rationale, architecture, and execution plan.

These are not mutually exclusive — some can be combined or sequenced. But each represents a distinct product identity and business model.

## Directions

| File | Direction | TL;DR |
|------|-----------|-------|
| `01-premium-study-app.md` | Monetized CS learning product | Auth + payments + content gating. Ship fast, charge money. |
| `02-adaptive-learning-engine.md` | AI-powered guided learning | Core loop + session engine + weak-area detection. Retention-first. |
| `03-knowledge-graph-platform.md` | Domain-agnostic knowledge OS | Graph model + competency tracking. Becomes cross-industry. |
| `04-incident-simulator.md` | Distributed systems training lab | Production debugging scenarios. LeetCode for backend engineers. |
| `05-cybersecurity-training.md` | Security operations platform | Cyber range + SOC simulation. Aligned with "Adverse" brand. |
| `06-enterprise-onboarding.md` | Internal training SaaS | Companies upload SOPs → adaptive learning paths. B2B play. |
| `07-interview-prep-platform.md` | Full-stack interview product | Mock interviews + coding + system design + behavioral. |
| `08-ai-engineering-tutor.md` | Personalized AI mentor | Memory + context graph + adaptive teaching. AI-native product. |

## Current State

- 13 categories, 46 topics, 182+ subtopics
- Interactive: code playground, SQL sandbox, DS visualization, quizzes
- Study tools: spaced repetition, Pomodoro, progress tracking, bookmarks
- PWA with offline support
- Deployed on Netlify

## Key Insight

Underneath the "CS study app" surface, the real architecture is:
- Structured content pipeline (markdown → JSON graph)
- State tracking (progress, completion, review scheduling)
- Interactive runtimes (code execution, SQL, visualization)
- AI-friendly structure (steering files, content contracts)

That foundation supports far more than education.
