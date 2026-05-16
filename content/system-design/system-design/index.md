# System Design

System design is the discipline of defining the architecture, components, modules, interfaces, and data flows of a system to satisfy specified requirements at scale. It bridges the gap between abstract requirements and concrete implementation by addressing how software systems handle millions of users, terabytes of data, and continuous availability demands. The field encompasses distributed computing fundamentals, data storage and retrieval patterns, network communication protocols, and the operational concerns that emerge when systems grow beyond a single machine.

For senior engineers and interview candidates, system design requires reasoning about tradeoffs rather than memorizing solutions. Every architectural decision involves balancing consistency against availability, latency against throughput, simplicity against flexibility, and cost against performance. The ability to articulate these tradeoffs clearly, justify decisions with quantitative reasoning, and adapt designs to changing requirements distinguishes senior engineers from those who simply implement prescribed architectures.

This guide covers the foundational concepts that underpin all large-scale system design, organized as a progressive learning path from fundamentals through specialized topics.

## Learning Path

1. [Distributed Systems](./distributed-systems.md) — Fundamentals of distributed computing, failure modes, and coordination primitives
2. [Consistency Models](./consistency-models.md) — CAP theorem, consistency guarantees, and choosing the right model
3. [Scalability](./scalability.md) — Horizontal and vertical scaling patterns, stateless design, and capacity planning
4. [Load Balancing](./load-balancing.md) — Traffic distribution algorithms, health checking, and high availability
5. [Caching](./caching.md) — Cache hierarchies, invalidation strategies, and distributed cache patterns
6. [Database Sharding](./database-sharding.md) — Data partitioning strategies, shard key selection, and operational concerns
7. [Rate Limiting](./rate-limiting.md) — Token bucket, leaky bucket, sliding window algorithms, and distributed rate limiting patterns
8. [API Design](./api-design.md) — REST principles, versioning strategies, pagination, error handling, and GraphQL vs REST tradeoffs
9. [Event-Driven Architecture](./event-driven-architecture.md) — Event sourcing, CQRS, saga pattern, choreography vs orchestration, and exactly-once delivery
10. [Common Interview Problems](./common-interview-problems.md) — URL shortener, chat system, notification service, news feed, and distributed cache design
11. [Design Patterns](./design-patterns.md) — GoF patterns, architectural patterns, and their application in distributed systems
