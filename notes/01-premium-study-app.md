# Direction 1: Premium CS Study App

## Identity

A paid, all-in-one CS learning product for engineers preparing for interviews and leveling up. Think NeetCode + DesignGuru + Educative combined into one app with better interactivity and study tools.

## Why This Direction

- Fastest path to revenue
- Minimal architectural changes needed
- Clear market with proven willingness to pay
- Your content depth + interactive features already exceed most competitors
- Can ship in 1-2 weeks

## Target User

Mid-level software engineers preparing for FAANG/senior interviews. Willing to pay $50-100 for a comprehensive prep tool.

## What Changes

### Must Build
1. **Authentication** — Supabase (auth + Postgres + realtime in one)
2. **Cloud sync** — Progress, bookmarks, spaced repetition state
3. **Payments** — Stripe Checkout or Lemon Squeezy
4. **Content gating** — Freemium: 5-10 topics free, rest behind paywall
5. **Landing page** — SEO-optimized marketing site (Next.js or Framer)
6. **More content** — DSA patterns, system design case studies

### Pricing Model
| Model | Price | Rationale |
|-------|-------|-----------|
| Lifetime | $49-79 | One-time, high conversion |
| Monthly | $9-12/mo | Recurring, lower barrier |
| Annual | $59-79/yr | Best balance |

### Competitive Edge
| Competitor | Price | Gap You Fill |
|-----------|-------|--------------|
| NeetCode Pro | $99/yr | No backend/infra/system design depth |
| DesignGuru | $79 | No coding practice, no study tools |
| AlgoExpert | $99/yr | No interactive playgrounds |
| Educative.io | $59/mo | Expensive, no spaced repetition |
| **This** | **$49-79** | **All-in-one: content + interactive + study tools** |

## Architecture Impact

Minimal. Add:
- Supabase client SDK
- Auth context provider
- Sync layer (replace localStorage writes with Supabase upserts)
- Payment webhook handler
- Protected route wrapper

No fundamental architecture changes needed.

## Execution Plan (1-2 weeks)

1. Supabase project setup + auth (1 day)
2. Migration layer: localStorage → cloud sync (1-2 days)
3. Stripe integration + content gating logic (1 day)
4. Landing page with value prop + feature showcase (1 day)
5. SEO: pre-render key pages or add Next.js marketing layer (1 day)
6. Content expansion: 10+ DSA topics with problems (ongoing)
7. Flashcard mode from existing Quick Reference data (1 day)

## Risks

- SPA is invisible to Google without SSR/pre-rendering
- Content alone isn't sticky — needs retention loop eventually
- One-time payment means no recurring revenue unless you add subscription features
- Market is crowded — differentiation is breadth + interactivity, not depth in any single area

## Growth Path

This direction naturally leads into:
- → Direction 2 (adaptive learning) for retention
- → Direction 7 (interview prep) for deeper specialization
- → Direction 8 (AI tutor) for wow factor

## Bottom Line

Lowest risk, fastest revenue. But ceiling is limited without evolving into a smarter system. Good "Phase 1" regardless of long-term direction.
