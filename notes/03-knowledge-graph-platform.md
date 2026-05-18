# Direction 3: Knowledge Graph Platform

## Identity

A domain-agnostic operational knowledge system. Content becomes nodes in a traversable graph with relationships, competencies, and workflows. The CS content is just the first "domain pack" — the platform works for any knowledge-intensive field.

## Why This Direction

- Transforms a single-purpose app into a reusable platform
- Unlocks cross-industry expansion without rebuilding
- Makes AI dramatically smarter (structured context > raw text)
- Creates defensible architecture that competitors can't easily replicate
- Your content pipeline already thinks in structured hierarchies — this is the natural evolution

## Target User

Initially: same CS learners. Eventually: any organization or individual with structured knowledge to master.

## Core Concept: Universal Knowledge Primitive

Stop thinking in "topics." Think in "knowledge nodes."

```typescript
interface KnowledgeNode {
  id: string;
  type: 'concept' | 'procedure' | 'pattern' | 'tool' | 'principle';
  title: string;
  content: ContentBlock[];
  metadata: {
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    estimatedMinutes: number;
    domain: string;
  };
  relationships: Edge[];
  competencies: CompetencyTag[];
  assessments?: Assessment[];
  simulations?: Simulation[];
}

interface Edge {
  type: 'prerequisite' | 'related' | 'builds-on' | 'contrasts' | 'applies-to';
  targetId: string;
  strength: number; // 0-1, how strong the relationship is
}
```

Now "Kafka consumer groups" and "HIPAA incident escalation" are the same primitive.

## What Changes

### Must Build

1. **Graph Data Model**
   - Replace tree hierarchy with graph relationships
   - Every node declares: prerequisites, related concepts, competency tags
   - Edges are typed and weighted

2. **Metadata Layer on Existing Content**
   - Add frontmatter to every subtopic:
     ```yaml
     ---
     id: kafka-consumer-groups
     competencies: [distributed-systems, event-processing]
     prerequisites: [kafka-basics, async-processing]
     related: [rabbitmq-routing, kafka-partitions]
     difficulty: intermediate
     estimatedMinutes: 45
     ---
     ```

3. **Graph Resolver**
   - Runtime traversal: "what should I learn next given my state?"
   - Path finding: "shortest path from current knowledge to target competency"
   - Cluster detection: "what concepts form a natural learning unit?"

4. **Competency Engine**
   ```typescript
   interface CompetencyModel {
     competencyId: string;
     mastery: number;
     confidence: number;
     lastAssessed: Date;
     evidenceNodes: string[]; // which nodes contributed to this score
   }
   ```

5. **Domain Packs (future)**
   ```
   domains/
     cs-engineering/       ← current content
     cybersecurity/        ← future
     medical/              ← future
     sales-enablement/     ← future
   ```
   Each domain provides: taxonomy, competency model, interaction types, AI templates.

## Architecture Impact

High. This is a fundamental restructuring:
- Content model changes from tree → graph
- Build pipeline needs to process relationship metadata
- Frontend needs graph-aware navigation (not just sidebar tree)
- State tracking becomes competency-based, not completion-based
- AI layer gets structured context instead of raw text

## Graph Navigation UX

Instead of just a sidebar tree, users can:
- See a visual concept map of their domain
- Click any node to see: prerequisites, related, what it unlocks
- Get "learning paths" generated from graph traversal
- See their mastery overlaid on the graph (color-coded)

## Execution Plan (4-6 weeks)

1. Design graph schema + relationship types (2 days)
2. Add metadata frontmatter to all 182 subtopic files (3-5 days, partially automatable)
3. Extend content pipeline to parse relationships (2 days)
4. Build graph data structure + resolver (3 days)
5. Competency model + state tracking (3 days)
6. Graph-aware session recommendations (2 days)
7. Visual graph explorer component (3-5 days)
8. Path-finding: "get me from A to B" (2 days)

## Risks

- High upfront effort before visible user value
- Metadata quality is critical — bad relationships = bad recommendations
- Graph visualization can become overwhelming UX
- Premature abstraction: building platform before validating single-domain product
- Cross-industry expansion requires domain expertise you may not have

## Growth Path

This direction naturally leads into:
- → Direction 5 (cybersecurity) as a second domain pack
- → Direction 6 (enterprise onboarding) as B2B application
- → Direction 8 (AI tutor) with graph-structured context

## Bottom Line

This is the "become a platform" direction. Highest long-term ceiling, but also highest upfront investment. The graph model makes everything else smarter — AI, recommendations, cross-industry expansion all become configuration rather than code.

Best pursued after Direction 1 (revenue) and Direction 2 (retention loop) are validated. Don't build a platform before you have users.
