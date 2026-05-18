# Direction 4: Distributed Systems Incident Simulator

## Identity

"LeetCode for backend engineers." A training platform where engineers practice diagnosing and resolving production incidents in simulated distributed systems. Not algorithm puzzles — real operational scenarios.

## Why This Direction

- Directly aligned with your actual job experience (40+ microservices, millions of messages/day, incident response)
- No good competitor exists in this space
- LeetCode dominates DSA practice, but nothing dominates operational/debugging practice
- Your resume gives you authentic credibility to build this
- You already have: code playground, SQL sandbox, content pipeline, interactive components
- High willingness to pay from senior engineers and companies

## Target User

Mid-to-senior backend engineers who:
- Want to practice incident response without waiting for real outages
- Are preparing for senior/staff-level interviews (system design + debugging)
- Work in microservices environments and want to sharpen operational skills

## Core Concept: Simulated Production Scenarios

```
User enters scenario
    → Sees: system architecture diagram
    → Receives: alert/symptom description
    → Explores: logs, metrics, traces (simulated)
    → Forms hypothesis
    → Applies fix
    → System evaluates: correct diagnosis? proper fix? rollback plan?
    → Debrief: what actually happened, what was missed
```

## Example Scenarios

### Scenario: Silent Message Loss
- **Setup**: Communications platform, 40+ microservices, Kafka + RabbitMQ
- **Symptom**: Customer reports missing SMS notifications
- **Clues**: CloudWatch shows throughput drop, no errors in primary service logs
- **Root cause**: NPE in MapStruct mapping silently dropping ~16,000 messages/hour
- **Solution**: Trace async execution boundaries, find crash vector, deploy fix
- **Evaluation**: Did user check async boundaries? Did they validate with metrics?

### Scenario: Duplicate Records from Fallback
- **Setup**: Multi-channel messaging (Email, SMS, RCS, IVR)
- **Symptom**: Duplicate appointment records appearing in database
- **Clues**: RCS channel fallback creating extra rows, multi-row query conflict
- **Root cause**: Fallback logic inserting without checking existing records
- **Solution**: Zero-downtime SQL fix, props-only deployment across 7 configs
- **Evaluation**: Did user identify the fallback path? Validate against live data?

### Scenario: CVE Remediation Under Pressure
- **Setup**: 14 Logstash services across 5 environments
- **Symptom**: Qualys scan flagging Log4Shell (CVE-2021-44228)
- **Challenge**: Distinguish active vulnerabilities from false positives in stale Docker layers
- **Solution**: Rebuild images, verify scans, document findings
- **Evaluation**: Did user identify false positives? Proper verification?

## What Changes

### Must Build

1. **Scenario Engine**
   ```typescript
   interface Scenario {
     id: string;
     title: string;
     difficulty: 'junior' | 'mid' | 'senior' | 'staff';
     architecture: SystemDiagram;
     symptoms: Alert[];
     clues: ClueSet; // logs, metrics, traces — revealed progressively
     rootCause: RootCause;
     validFixes: Fix[];
     evaluation: EvaluationCriteria;
     debrief: string;
   }
   ```

2. **Simulated Observability Dashboard**
   - Log viewer (CloudWatch-style, searchable)
   - Metrics charts (latency, throughput, error rate)
   - Service map with health indicators
   - Trace viewer (distributed tracing spans)

3. **Decision Tree Evaluator**
   - Track user's investigation path
   - Score: did they check the right things?
   - Partial credit for reasonable hypotheses
   - Penalize: random guessing, skipping verification

4. **Scenario Builder** (for content creation)
   - Markdown-based scenario definitions
   - Simulated log generators
   - Metric pattern templates
   - Reusable architecture components

5. **Debrief System**
   - After completion: show optimal investigation path
   - Compare user's path vs expert path
   - Highlight missed signals
   - Link to relevant learning content

## Architecture Impact

Medium-high. New systems needed:
- Scenario data model + content format
- Simulated dashboard components (log viewer, metrics, service map)
- Decision tracking + evaluation engine
- Timer + scoring system

Leverages existing:
- Content pipeline (scenarios as structured markdown)
- Code playground (for fix implementation)
- SQL sandbox (for database scenarios)
- Progress tracking (scenario completion + scores)

## Execution Plan (4-6 weeks)

1. Design scenario schema + 3 pilot scenarios (3 days)
2. Build log viewer component (3 days)
3. Build metrics dashboard component (3 days)
4. Build service map visualization (2 days)
5. Scenario engine: progressive clue revelation (3 days)
6. Decision tracking + evaluation logic (3 days)
7. Debrief/review system (2 days)
8. Write 10 scenarios from real experience (ongoing)
9. Scoring + leaderboard (2 days)

## Monetization

- Premium scenarios behind paywall
- Company licenses for team training
- Scenario packs by domain (Kafka, Kubernetes, Database, Security)
- Certification: "Completed 20 incident scenarios at Senior level"

## Risks

- Scenario creation is labor-intensive
- Simulated environments are never fully realistic
- Narrow audience (backend/infra engineers only)
- Hard to validate "correct" answers in open-ended debugging
- Could feel artificial without real system behavior

## Growth Path

This direction naturally leads into:
- → Direction 5 (cybersecurity) — security incident scenarios
- → Direction 6 (enterprise) — company-specific incident training
- → Direction 3 (graph) — scenarios linked to knowledge prerequisites

## Bottom Line

This is your highest-differentiation direction. Nobody else is building this well. Your actual production experience (Charter/Spectrum incidents) gives you authentic scenario content that can't be faked. The audience (senior backend engineers) has high willingness to pay and few alternatives.

Best as a focused product or a premium tier within the broader learning platform.
