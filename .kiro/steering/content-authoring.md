# Content Authoring Guidelines

inclusion: auto

## Purpose

This steering file provides guidelines for authoring and editing markdown content inside `cs-reference-guide/content/`. All content must be consistent, thorough, and production-oriented.

## Content Location

All markdown content lives exclusively in `cs-reference-guide/content/` organized by category, with each topic as a multi-page directory:

```
cs-reference-guide/content/
├── backend/
│   ├── api-design/         (REST, GraphQL, gRPC)
│   ├── build-tools/        (Maven, Gradle)
│   ├── java/               (Core Language, Collections, Concurrency, Streams, JVM, Java 8+)
│   ├── messaging/          (Kafka, RabbitMQ, Patterns)
│   └── spring-framework/   (Core, Boot, MVC, REST, Data, Security, Batch, Microservices)
├── frontend/
│   ├── javascript/         (Core, Closures, Async, Prototypes, Modules)
│   ├── react/              (Hooks, Components, State, Performance, Testing)
│   ├── typescript/         (Type System, Generics, Advanced Types, Declarations, Patterns)
│   ├── html-css/           (Fundamentals, Modern CSS)
│   ├── angular/            (Overview, Components, Services/DI, Routing, RxJS)
│   ├── nextjs/             (Overview, Fundamentals)
│   ├── state-management/   (Redux, Redux Patterns, Zustand, Modern Alternatives)
│   └── web-performance/    (Performance, Accessibility)
├── databases/
│   ├── sql-foundations/    (SQL Fundamentals, Performance Tuning, Design Patterns, Transactions)
│   ├── postgresql/         (Core, Replication/HA, Performance Tuning, Advanced Features, Indexing)
│   ├── oracle/             (Core, Performance Diagnostics, High Availability, RAC/Data Guard)
│   ├── mongodb/            (Core, Schema Design, Schema Patterns, Operations/Scaling, Replication)
│   └── redis/              (Core, Data Structures Deep Dive, Clustering/HA)
├── infrastructure/
│   ├── aws/                (Core Services, IAM, VPC, S3, Compute, Serverless, Architecture)
│   ├── ci-cd/              (Fundamentals, Pipelines, Infrastructure as Code, Terraform)
│   ├── docker/             (Fundamentals, Compose, Dockerfile, Networking, Security)
│   ├── kubernetes/         (Core, Workloads, Networking, Config, EKS)
│   ├── linux/              (Essentials, Administration)
│   └── observability/      (Metrics, Tracing, Logging, Alerting)
├── data-structures-and-algorithms/
│   ├── fundamental-data-structures/  (Big O, Hash Tables, Heap, Linked Lists, Queue, Ring Buffer, Sets, Trie)
│   ├── arrays-and-strings/           (Fundamentals, Two Pointers, Prefix Sums, String Manipulation, Matching)
│   ├── trees-and-graphs/             (Binary Trees, Balanced Trees, Graph Traversal, Shortest Path, Advanced)
│   ├── sorting-and-searching/        (Comparison, Non-comparison, Binary Search, Specialized)
│   └── dynamic-programming/          (Fundamentals, Knapsack, Grid, Sequence, Advanced)
├── system-design/
│   └── system-design/     (Distributed Systems, Consistency, Scalability, Load Balancing, Caching, Sharding, Rate Limiting, API Design, Event-Driven, Interview Problems, Design Patterns, Microservices, Data Pipelines)
├── networking/
│   └── networking/         (TCP/IP, DNS, HTTP, WebSockets, Load Balancing, TLS/mTLS)
├── operating-systems/
│   └── operating-systems/  (Processes, Memory, File Systems, Concurrency, I/O)
├── security/
│   └── security/           (Crypto, Auth, Web Security, Network Security, Container Security, Backend Security)
├── testing/
│   ├── unit-testing/       (Unit Testing, Mocking Strategies)
│   ├── integration-testing/ (Integration Testing, API/Contract Testing, Database Testing, E2E)
│   └── test-strategy/      (Test Architecture, Property-Based Testing)
├── software-engineering/
│   └── software-engineering/ (SOLID, Clean Architecture, Refactoring, Code Review, Tech Debt)
├── interview-prep/
│   └── interview-prep/     (Coding, System Design, Behavioral, Communication, Negotiation)
└── git/
    └── git/                (What is Git, Commands, Branching, Local/Remote, Merge Conflicts, PRs, .gitignore)
```

## Multi-Page Topic Structure

Every topic MUST be a directory with an `index.md` and subtopic files:

```
content/{category}/{topic-name}/
├── index.md           # Required: title + description + Learning Path
├── subtopic-1.md      # Individual subtopic content
├── subtopic-2.md
└── ...
```

### index.md Format

```markdown
# Topic Title

[1-2 paragraph description of the topic area, its importance, and what it covers]

## Learning Path

1. [Subtopic Title](./filename.md) — Brief one-line description
2. [Another Subtopic](./another-file.md) — Brief description
...
```

The Learning Path determines the order subtopics appear in the sidebar.

## Mandatory Subtopic File Structure

Every subtopic `.md` file MUST follow this exact section order:

1. **H1 Title** — The subtopic name
2. **## Quick Reference** — At least 3 bullet points of key facts, syntax, or commands
3. **## When to Use** — Scenarios where this technology/pattern applies
4. **## Code Examples** — At least 2 language-annotated fenced code blocks
5. **## Architecture / Diagrams** (if applicable) — Mermaid diagrams for flows, relationships
6. **## Common Pitfalls** — At least 3 mistakes developers make
7. **## Real-World Use Cases** — Production scenarios with context
8. **## Interview Questions** — At least 3 Q&A pairs with concise model answers
9. **## Production Tips** — At least 2 operational tips (monitoring, failure modes, scaling)
10. **## Related Topics** — Links to at least 2 other subtopic files using correct relative paths

## Quality Standards

- Minimum 2000 words per subtopic file (excluding code blocks, headings, diagrams)
- No section should have fewer than 100 words unless it's purely code/diagram
- Target audience: senior-level software engineer preparing for interviews
- Content should be production-oriented, not tutorial-level
- Use specific numbers, real tool names, and concrete examples

## Formatting Rules

- H1 for topic title, H2 for major sections, H3 for subsections
- Use `**bold**` for key terms on first mention
- Use `` `code` `` for commands, function names, config values
- Use language-annotated fenced code blocks: ```java, ```typescript, ```yaml, etc.
- Use Mermaid diagrams (```mermaid) instead of images
- NO external image URLs
- NO local .png references (use Mermaid or ASCII art)
- Use admonitions for important callouts: `> [!NOTE]`, `> [!WARNING]`, `> [!TIP]`

## Related Topics — Link Paths

When linking between files, use correct relative paths based on directory structure:

```markdown
## Related Topics

- [Same directory](./sibling-file.md) — Description
- [Sibling topic in same category](../other-topic/file.md) — Description
- [Different category](../../other-category/topic/file.md) — Description
```

Common patterns:
- Within same topic directory: `./filename.md`
- To another topic in same category: `../other-topic/filename.md`
- To another category: `../../other-category/topic-dir/filename.md`

## Mermaid Diagram Guidelines

Use Mermaid for:
- Architecture diagrams (graph TB/LR)
- Sequence diagrams (sequenceDiagram)
- Class diagrams (classDiagram)
- State machines (stateDiagram-v2)
- Flowcharts (flowchart TD)

## Interview Questions Format

```markdown
**Q: What is the difference between X and Y?**

A: X handles [specific behavior] while Y handles [different behavior]. In production, you'd choose X when [condition] because [reason]. The key trade-off is [trade-off].
```
