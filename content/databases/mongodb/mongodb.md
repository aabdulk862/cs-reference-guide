# MongoDB and Document Databases

## Quick Reference

- MongoDB is a document-oriented NoSQL database storing data as flexible BSON (Binary JSON) documents
- Collections are analogous to tables; documents are analogous to rows but with dynamic schemas
- CRUD operations: `insertOne`/`insertMany`, `find`/`findOne`, `updateOne`/`updateMany`, `deleteOne`/`deleteMany`
- Query operators: `$eq`, `$gt`, `$lt`, `$in`, `$and`, `$or`, `$regex`, `$exists`
- Aggregation pipeline stages: `$match`, `$group`, `$sort`, `$project`, `$lookup`, `$unwind`
- Index types: Single field, compound, multikey, text, geospatial, hashed, wildcard
- Replication via replica sets (primary + secondaries); sharding for horizontal scaling
- Write concern controls durability guarantees; read preference controls read routing

## When to Use

MongoDB is ideal for applications with evolving schemas, hierarchical data, or document-centric access patterns. Choose MongoDB when your data naturally fits a document model (product catalogs, content management, user profiles), when you need flexible schemas that evolve without migrations, or when your read patterns align with document boundaries eliminating the need for joins. MongoDB excels at horizontal scaling through sharding for write-heavy workloads and geographically distributed deployments. It is particularly strong for rapid prototyping, real-time analytics with the aggregation framework, and applications requiring low-latency reads with embedded documents. The document model maps naturally to object-oriented programming, eliminating the impedance mismatch between application objects and database rows that plagues relational ORMs. MongoDB Atlas provides a fully managed cloud offering with automated backups, monitoring, and scaling, making it accessible for teams without dedicated database administrators. Time-series collections (5.0+) with automatic bucketing efficiently store sensor data and telemetry with built-in compression and expiration.

## Code Examples

### Document Modeling and CRUD Operations

```javascript
// Schema design: embedding vs referencing
// Embedded document - data accessed together, one-to-few relationship
db.orders.insertOne({
  customerId: ObjectId("64a7b2c3d4e5f6a7b8c9d0e1"),
  items: [
    { productId: "SKU-001", name: "Laptop", quantity: 1, price: 999.99 },
    { productId: "SKU-042", name: "Mouse", quantity: 2, price: 29.99 }
  ],
  status: "pending",
  totalAmount: 1059.97,
  createdAt: new Date(),
  shippingAddress: {
    street: "123 Main St",
    city: "Seattle",
    state: "WA",
    zip: "98101"
  },
  statusHistory: [
    { status: "created", timestamp: new Date(), actor: "customer" }
  ]
});

// Query with filters, projection, sort, and limit
db.orders.find(
  {
    status: "pending",
    totalAmount: { $gte: 100 },
    "shippingAddress.state": "WA",
    createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
  },
  { customerId: 1, totalAmount: 1, status: 1, _id: 0 }
).sort({ createdAt: -1 }).limit(10);

// Atomic update with multiple operators
db.orders.updateOne(
  { _id: ObjectId("64a7b2c3d4e5f6a7b8c9d0e1") },
  {
    $set: { status: "shipped", shippedAt: new Date() },
    $push: {
      statusHistory: {
        status: "shipped",
        timestamp: new Date(),
        actor: "fulfillment-service"
      }
    },
    $inc: { version: 1 }
  }
);

// Bulk write for efficient batch operations
db.orders.bulkWrite([
  { updateOne: { filter: { _id: id1 }, update: { $set: { status: "archived" } } } },
  { updateOne: { filter: { _id: id2 }, update: { $set: { status: "archived" } } } },
  { deleteMany: { filter: { status: "cancelled", createdAt: { $lt: cutoffDate } } } }
], { ordered: false }); // unordered for parallel execution
```

### Aggregation Pipeline

```javascript
// Revenue analysis with multi-stage pipeline
db.orders.aggregate([
  { $match: { status: "completed", createdAt: { $gte: ISODate("2024-01-01") } } },
  { $unwind: "$items" },
  {
    $lookup: {
      from: "products",
      localField: "items.productId",
      foreignField: "sku",
      as: "productDetails"
    }
  },
  { $unwind: "$productDetails" },
  {
    $group: {
      _id: {
        category: "$productDetails.category",
        month: { $month: "$createdAt" }
      },
      totalRevenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
      orderCount: { $sum: 1 },
      avgOrderValue: { $avg: { $multiply: ["$items.price", "$items.quantity"] } },
      uniqueCustomers: { $addToSet: "$customerId" }
    }
  },
  {
    $project: {
      category: "$_id.category",
      month: "$_id.month",
      totalRevenue: { $round: ["$totalRevenue", 2] },
      orderCount: 1,
      avgOrderValue: { $round: ["$avgOrderValue", 2] },
      uniqueCustomerCount: { $size: "$uniqueCustomers" },
      _id: 0
    }
  },
  { $sort: { totalRevenue: -1 } }
]);

// Window functions with $setWindowFields (MongoDB 5.0+)
db.sales.aggregate([
  {
    $setWindowFields: {
      partitionBy: "$region",
      sortBy: { date: 1 },
      output: {
        runningTotal: {
          $sum: "$amount",
          window: { documents: ["unbounded", "current"] }
        },
        movingAvg: {
          $avg: "$amount",
          window: { documents: [-6, 0] } // 7-day moving average
        }
      }
    }
  }
]);
```

### Indexing and Performance

```javascript
// Compound index following ESR rule (Equality, Sort, Range)
db.orders.createIndex(
  { status: 1, createdAt: -1, totalAmount: 1 },
  { name: "status_date_amount_idx" }
);

// Partial index for active records only
db.orders.createIndex(
  { customerId: 1, createdAt: -1 },
  {
    partialFilterExpression: { status: { $in: ["pending", "processing"] } },
    name: "active_orders_by_customer_idx"
  }
);

// TTL index for automatic document expiration
db.sessions.createIndex(
  { lastAccessedAt: 1 },
  { expireAfterSeconds: 3600, name: "session_ttl_idx" }
);

// Wildcard index for dynamic schemas
db.products.createIndex(
  { "attributes.$**": 1 },
  { name: "product_attributes_wildcard" }
);

// Text index with weights for relevance scoring
db.products.createIndex(
  { name: "text", description: "text", tags: "text" },
  { weights: { name: 10, tags: 5, description: 1 }, name: "product_search_idx" }
);

// Check index usage statistics
db.orders.aggregate([{ $indexStats: {} }]);

// Analyze query execution plan
db.orders.find({ status: "pending" }).explain("executionStats");
```

## Common Pitfalls

- **Unbounded document growth**: Using `$push` without limits causes documents to exceed the 16MB BSON limit. Use the bucket pattern, capped arrays with `$slice`, or move growing arrays to a separate collection. Monitor document sizes with `Object.bsonsize()` and set application-level limits before documents approach the BSON ceiling.

- **Missing indexes on query fields**: Full collection scans (COLLSCAN) on large collections cause severe performance degradation. Always use `explain("executionStats")` to verify queries use indexes. The `totalDocsExamined` vs `nReturned` ratio should be close to 1:1 for well-indexed queries.

- **Over-embedding vs. over-referencing**: Embedding everything creates large documents with wasted bandwidth on partial reads. Referencing everything requires multiple queries since MongoDB has no native joins (only `$lookup` in aggregation). Design based on access patterns: embed data accessed together, reference data accessed independently or that grows unboundedly.

- **Write concern too low for critical data**: Using `w: 0` or `w: 1` without `j: true` risks data loss during primary failover. For critical data, use `w: "majority"` with `j: true` to ensure writes survive replica set elections. Understand that higher write concern increases write latency but provides durability guarantees.

- **Schema design without considering queries**: Designing schemas based on data relationships (like relational modeling) rather than query patterns leads to poor performance. Always design your schema around your most common read and write operations. The question is not "what are the relationships?" but "how will the application access this data?"

- **Ignoring the aggregation pipeline for complex queries**: Developers often pull large datasets into application memory for processing when the aggregation pipeline could perform the work server-side. Pipeline stages like `$group`, `$bucket`, and `$facet` handle complex analytics efficiently without transferring unnecessary data over the network.

## Real-World Use Cases

- **Content management systems**: MongoDB's flexible schema handles diverse content types (articles, videos, podcasts) with varying metadata fields without requiring schema migrations as content types evolve. Publishers like Forbes and The New York Times use MongoDB to manage millions of content documents with complex taxonomies and real-time personalization. The document model naturally represents content hierarchies with embedded sections, tags, and author references.

- **Real-time analytics dashboards**: The aggregation framework with change streams enables real-time dashboards that react to data changes, computing metrics like active users, conversion rates, and revenue in near real-time. Change streams provide a reliable event-driven interface for triggering downstream processing without polling, enabling architectures where dashboard updates are pushed within seconds of underlying data changes.

- **E-commerce product catalogs**: Products with vastly different attributes (electronics vs. clothing vs. books) fit naturally into MongoDB's document model without sparse columns or entity-attribute-value anti-patterns. Faceted search and dynamic filtering are straightforward with compound indexes and the aggregation framework. The schema-per-document flexibility means adding a new product category requires no database migrations.

- **IoT and time-series data**: MongoDB's time-series collections (5.0+) with automatic bucketing efficiently store and query sensor data, telemetry, and event logs with built-in compression and expiration. The columnar compression achieves up to 90% storage reduction compared to regular collections for time-series workloads, while the bucketing strategy optimizes both write throughput and range query performance.

- **Multi-tenant SaaS platforms**: MongoDB supports multi-tenancy through database-per-tenant (strongest isolation), collection-per-tenant (moderate isolation), or shared collections with tenant discriminator fields (highest density). The flexible schema allows tenants to customize their data model without affecting others, and sharding by tenant ID provides horizontal scaling as the customer base grows.

## Interview Questions

**Q: When would you choose MongoDB over a relational database?**

A: Choose MongoDB when your data has a natural document structure, schemas need to evolve frequently without downtime, you need horizontal scaling for write-heavy workloads, or your access patterns align with document boundaries. MongoDB excels when data is hierarchical, when different records have different fields, and when you need sub-millisecond reads without complex joins. Relational databases are better when you need complex multi-table transactions, strict referential integrity, or your data is highly normalized with many relationships requiring frequent joins.

**Q: Explain the difference between embedding and referencing in MongoDB schema design.**

A: Embedding stores related data within a single document, providing atomic operations and single-query reads but increasing document size and potentially duplicating data. Referencing stores related data in separate collections with ObjectId links, reducing duplication but requiring multiple queries or `$lookup`. Embed for one-to-few relationships accessed together where the embedded data does not grow unboundedly. Reference for one-to-many relationships, frequently updated subdocuments, or data exceeding 16MB limits. The decision should be driven by read/write patterns, not by data relationships alone.

**Q: How does MongoDB ensure high availability?**

A: MongoDB uses replica sets with automatic failover. A replica set has one primary (handles writes) and multiple secondaries (replicate via the oplog). If the primary fails, secondaries hold an election using the Raft-like protocol to choose a new primary, typically completing failover within 10-12 seconds. Write concern `majority` ensures acknowledged writes survive failover. Read preference settings allow routing reads to secondaries for scaling, with configurable staleness tolerance.

**Q: What is the aggregation pipeline and when would you use it over simple queries?**

A: The aggregation pipeline processes documents through sequential stages (match, group, sort, project, lookup, unwind, etc.) for complex data transformations. Use it for analytics (grouping, counting, averaging), data reshaping, joining collections via `$lookup`, computing derived fields, or any operation that requires multiple transformation steps. Simple `find()` queries suffice for basic filtering and projection without transformation. The pipeline executes server-side, avoiding the need to transfer large datasets to the application for processing.

## Production Tips

- **Connection pooling and driver configuration**: Configure `maxPoolSize` based on your application's concurrency (default 100 is often too high for small services). Set `minPoolSize` to avoid cold-start latency during traffic spikes. Monitor `connections.current` and `connections.available` server metrics. Use `retryWrites: true` and `retryReads: true` for automatic retry of transient network errors during replica set elections.

- **Read preference strategy**: Use `primaryPreferred` for consistency-critical reads, `secondaryPreferred` for analytics queries to offload the primary, and `nearest` for geographically distributed deployments to minimize latency. Configure `maxStalenessSeconds` to prevent reading from severely lagging secondaries. For time-sensitive data, always read from primary; for eventually-consistent analytics, secondary reads reduce primary load significantly.

- **Index maintenance and monitoring**: Regularly review indexes with `db.collection.getIndexes()` and remove unused ones (they consume RAM and slow writes). Use the `$indexStats` aggregation stage to identify indexes with zero usage. Build indexes in the background on secondaries first, then step down the primary to minimize production impact. Monitor the WiredTiger cache hit ratio — if it drops below 95%, your working set exceeds available RAM.

- **Schema versioning for zero-downtime migrations**: Use a `schemaVersion` field in documents to handle schema evolution gracefully. Implement lazy migration patterns where documents are upgraded to the latest schema version on read, avoiding expensive bulk migrations. Application code handles multiple schema versions simultaneously during the migration window, with background jobs gradually migrating old documents during low-traffic periods.

## Related Topics

- [SQL Performance Tuning](./sql-performance-tuning.md) — Complementary relational database optimization techniques for hybrid architectures
- [Database Design Patterns](./database-design-patterns.md) — Schema design principles applicable to both document and relational databases
- [Transactions and Consistency](./transactions-and-consistency.md) — MongoDB multi-document transactions and consistency guarantees
