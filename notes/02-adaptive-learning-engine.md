# Direction 2: Adaptive Learning Engine

## Identity

A guided, retention-first learning system that tells users exactly what to study next. Not a content library — a system that drives daily behavior through intelligent session management.

## Why This Direction

- Solves the #1 problem with study apps: users browse but don't retain
- Transforms the app from "reference site" to "daily habit"
- Retention = recurring revenue justification
- You already have spaced repetition logic, progress tracking, and content structure
- This is the architectural foundation that makes every other direction stronger

## Target User

Anyone studying CS who wants structure, not just content. Engineers who open the app daily for 15-30 minutes of guided practice.

## Core Concept: The Daily Loop

```
User opens app
    → System selects 1-3 learning units
        (based on: weakness + recency + goals)
    → User engages with content
    → User completes active task (quiz/recall/code)
    → System evaluates performance
    → Competency state updates
    → Next session adjusts
```

This is the shift from "browse and learn" to "guided progression engine."

## What Changes

### Must Build

1. **Session Generator**
   - Input: user progress + completion history + competency scores
   - Output: ordered list of activities (read → practice → assess)
   - Start with simple heuristics, evolve to ML later

2. **"Start Today's Session" UX**
   - Dashboard prominently shows: "Your session is ready"
   - Not: browse topics, pick category, explore
   - Single entry point into guided flow

3. **Competency Model**
   ```typescript
   interface CompetencyState {
     nodeId: string;
     mastery: number;        // 0-1 scale
     confidence: number;     // based on quiz performance
     lastReviewed: Date;
     retentionDecay: number; // Ebbinghaus curve
     attempts: number;
   }
   ```

4. **Active Recall Integration**
   - After reading: immediate recall prompt
   - Spaced review: resurface weak nodes at optimal intervals
   - Quiz performance feeds back into competency scores

5. **Weak-Area Detection**
   - Track quiz failures, time-on-topic, skip patterns
   - Surface: "You struggle with graph traversal — here's focused review"
   - Adjust session weighting toward weak areas

### Session Scoring Algorithm (v1 — simple heuristic)

```typescript
function scoreNode(node: KnowledgeNode, state: CompetencyState): number {
  const recencyWeight = daysSince(state.lastReviewed) / 14; // higher = more overdue
  const weaknessWeight = 1 - state.mastery;
  const prerequisiteBonus = allPrereqsMet(node) ? 1 : 0;
  
  return (recencyWeight * 0.4) + (weaknessWeight * 0.5) + (prerequisiteBonus * 0.1);
}
```

Pick top 3 nodes by score → that's today's session.

## Architecture Impact

Medium. Requires:
- Competency state layer (new data model)
- Session generator service (new module)
- Dashboard redesign (session-first UX)
- Feedback loops from quizzes/interactions back to state

Does NOT require:
- Graph database
- AI/LLM integration
- Backend server (can still be client-side with localStorage/Supabase)

## Execution Plan (2-3 weeks)

1. Define competency model + state schema (1 day)
2. Build session scoring algorithm (2 days)
3. Create "Start Session" flow + UI (2 days)
4. Wire quiz results → competency updates (1 day)
5. Add weak-area detection + messaging (2 days)
6. Spaced repetition integration with competency decay (2 days)
7. Dashboard redesign: session-first layout (2 days)

## Risks

- Cold start problem: new users have no competency data yet
- Over-engineering the algorithm before validating the UX
- Users might resist "being told what to do" — need opt-out/browse mode
- Requires enough quiz/assessment content per topic to measure mastery

## Growth Path

This direction naturally leads into:
- → Direction 3 (knowledge graph) for smarter recommendations
- → Direction 8 (AI tutor) for personalized explanations
- → Direction 7 (interview prep) for goal-oriented sessions

## Bottom Line

This is the "make users come back daily" direction. Without this, every other direction is just features on a content site. With it, you have a retention engine that justifies subscriptions and makes AI/graph features dramatically more powerful.

Best "Phase 2" after monetization basics are in place.
