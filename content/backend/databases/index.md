# Databases

Databases are the foundation of virtually every production system, providing durable storage, efficient retrieval, and transactional guarantees for application data. Modern backend engineers must understand both relational databases (SQL) with their ACID guarantees and normalized schemas, and document databases (NoSQL) with their flexible schemas and horizontal scalability. The choice between SQL and NoSQL is rarely binary — most production systems use both, selecting the right tool based on data access patterns, consistency requirements, and scaling needs.

This multi-page guide covers database technologies from fundamentals through advanced performance optimization, targeting senior engineers who need to design schemas, tune queries, and operate databases at scale. Each subtopic provides production-oriented depth with real-world examples, common failure modes, and interview preparation material.

## Learning Path

1. [MongoDB and Document Databases](./mongodb.md) — Document modeling, aggregation pipelines, indexing strategies, and replica set operations
2. [SQL Performance Tuning](./sql-performance-tuning.md) — Query plan analysis, indexing strategies, partitioning, and query optimization techniques
3. [Database Design Patterns](./database-design-patterns.md) — Schema design, normalization, denormalization, and data modeling for different workloads
4. [Transactions and Consistency](./transactions-and-consistency.md) — ACID properties, isolation levels, distributed transactions, and eventual consistency patterns
