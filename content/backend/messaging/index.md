# Messaging

Message-oriented middleware is the backbone of modern distributed systems, enabling asynchronous communication between services that decouples producers from consumers in both time and space. Whether you are building event-driven microservices, real-time data pipelines, or task distribution systems, understanding messaging patterns and platforms is essential for designing resilient, scalable architectures. The two dominant paradigms — event streaming (log-based) and traditional message brokering (queue-based) — serve different use cases and offer different guarantees around ordering, persistence, and delivery semantics.

This multi-page guide covers the major messaging platforms and patterns used in production systems, targeting senior engineers who need to design messaging architectures, choose between platforms, and operate them at scale. Each subtopic provides in-depth coverage with production configuration, failure mode analysis, and interview preparation material.

## Learning Path

1. [Apache Kafka](./apache-kafka.md) — Distributed event streaming platform for high-throughput, fault-tolerant messaging with log-based persistence
2. [RabbitMQ](./rabbitmq.md) — Traditional message broker with sophisticated routing, delivery guarantees, and multiple messaging patterns
3. [Messaging Patterns and Architecture](./messaging-patterns.md) — Event-driven architecture, CQRS, event sourcing, and choosing between messaging platforms
