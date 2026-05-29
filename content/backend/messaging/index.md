# Messaging

Message-oriented middleware is the backbone of modern distributed systems, enabling asynchronous communication between services that decouples producers from consumers in both time and space. Whether you are building event-driven microservices, real-time data pipelines, or task distribution systems, understanding messaging patterns and platforms is essential for designing resilient, scalable architectures. The two dominant paradigms — event streaming (log-based) and traditional message brokering (queue-based) — serve different use cases and offer different guarantees around ordering, persistence, and delivery semantics.

This multi-page guide covers the major messaging platforms and patterns used in production systems, targeting senior engineers who need to design messaging architectures, choose between platforms, and operate them at scale. Each subtopic provides in-depth coverage with production configuration, failure mode analysis, and interview preparation material.

## Learning Path

1. [Apache Kafka](./apache-kafka.md) — Distributed event streaming platform for high-throughput, fault-tolerant messaging with log-based persistence
2. [Partition Assignment Strategies](./partition-strategies.md) — Range, round-robin, sticky, and cooperative sticky assignors for consumer group partition distribution
3. [Consumer Group Rebalancing](./consumer-rebalancing.md) — Eager vs incremental cooperative rebalancing, triggers, static membership, and rebalance optimization
4. [Exactly-Once Semantics](./exactly-once-semantics.md) — Idempotent producers, transactional API, read-committed isolation, and end-to-end EOS guarantees
5. [ISR Mechanics](./isr-mechanics.md) — Replica lag detection, ISR shrink/expand, unclean leader election, and durability configuration
6. [Dead Letter Queues](./dead-letter-queues.md) — Poison pill handling, retry topic patterns, DLQ monitoring, and message reprocessing strategies
7. [RabbitMQ](./rabbitmq.md) — Traditional message broker with sophisticated routing, delivery guarantees, and multiple messaging patterns
8. [Messaging Patterns and Architecture](./messaging-patterns.md) — Event-driven architecture, CQRS, event sourcing, and choosing between messaging platforms
