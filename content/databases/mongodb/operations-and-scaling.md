# Operations and Scaling

MongoDB's operational model is built around replica sets for high availability and sharded clusters for horizontal scalability, providing a clear path from single-server deployments to globally distributed architectures handling millions of operations per second. Unlike relational databases where scaling typically means vertical upgrades or complex read-replica configurations, MongoDB's sharding distributes both data and query load across commodity servers with automatic balancing and transparent routing.
 Replica sets provide automatic failover with elections completing in 10-12 seconds, while sharded clusters can scale to petabytes of data across hundreds of shards. The choice of shard key is the single most important operational decision in a sharded MongoDB deployment — it determines data distribution, query routing efficiency, and the ability to scale writes. Change streams enable real-time event-driven architectures by providing a reliable, ordered stream of all data changes in a collection, database, or entire cluster. MongoDB Atlas (the managed cloud service) abstracts much of the operational complexity but understanding the underlying architecture is essential for capacity planning, performance troubleshooting, and disaster recovery design.

## Quick Reference

- **Replica set**: Minimum 3 members (1 primary + 2 secondaries); automatic failover via election; primary handles all writes; secondaries can serve reads with configurable read preference
- **Shard key**: Immutable field(s) determining data distribution across shards; must be present in every document; cannot be changed after sharding (until MongoDB 5.0 resharding)
- **Mongos router**: Stateless query router for sharded clusters; directs queries to appropriate shard(s); merges results from multiple shards for scatter-gather queries
- **Config servers**: Store cluster metadata (chunk ranges, shard locations); deployed as a 3-member replica set; critical for cluster operation
- **Balancer**: Background process that migrates chunks between shards to maintain even distribution; runs during configurable windows to minimize production impact
- **Change streams**: Real-time notification of data changes (insert, update, delete, replace); resumable with resume tokens; available on collections, databases, or entire deployments
- **Oplog**: Capped collection recording all write operations; foundation for replication; size determines maximum replication lag tolerance before full resync required
- **Read preference**: `primary` (default), `primaryPreferred`, `secondary`, `secondaryPreferred`, `nearest` — controls which replica set members serve read queries
- **Write concern**: `w:1` (primary acknowledged), `w:majority` (majority acknowledged), `w:0` (fire-and-forget) — controls durability guarantees for writes
- **Atlas**: MongoDB's managed cloud service; provides automated backups, monitoring, scaling, global clusters, and serverless instances

## When to Use

Sharding is necessary when a single replica set cannot handle the workload — either the data volume exceeds single-server storage capacity (typically >2TB for optimal performance), write throughput exceeds what a single primary can handle, or read throughput exceeds what a replica set with read preference secondary can serve. Don't shard prematurely — a well-configured replica set on modern hardware handles most workloads. Shard when you have concrete evidence of capacity limits, not speculatively.

Replica sets should be deployed for every production MongoDB workload, even single-server deployments. A 3-member replica set provides automatic failover (10-12 second election), data redundancy (survive disk failures), and read scaling (secondary reads for analytics/reporting). Use `w:majority` write concern for data that cannot be lost, and `readPreference: secondaryPreferred` for read-heavy workloads that can tolerate slight staleness.

Change streams are appropriate for event-driven architectures, real-time synchronization between services, cache invalidation, audit logging, and triggering downstream processing when data changes. They replace polling patterns (repeatedly querying for changes) with push-based notifications, reducing database load and providing lower latency. Use change streams instead of triggers (which MongoDB doesn't have) or application-level event publishing (which can lose events during failures).

MongoDB Atlas is the right choice when you want to minimize operational overhead — it handles backups, monitoring, patching, scaling, and security configuration. Use Atlas for: teams without dedicated MongoDB DBAs, applications requiring global distribution (Atlas Global Clusters), serverless workloads with unpredictable traffic (Atlas Serverless), and when you need integrated search (Atlas Search powered by Lucene). Self-managed MongoDB is appropriate when you need full control over configuration, have strict data residency requirements, or when cost optimization at scale justifies the operational investment.

## Code Examples

### Replica Set Configuration and Operations

```javascript
// Initialize a replica set
rs.initiate({
  _id: "prod-rs",
  members: [
    { _id: 0, host: "mongo1.internal:27017", priority: 2 },  // preferred primary
    { _id: 1, host: "mongo2.internal:27017", priority: 1 },
    { _id: 2, host: "mongo3.internal:27017", priority: 1 }
  ],
  settings: {
    chainingAllowed: true,
    heartbeatTimeoutSecs: 10,
    electionTimeoutMillis: 10000
  }
});

// Add an arbiter (for cost savings - not recommended for production)
rs.addArb("mongo-arbiter.internal:27017");

// Add a hidden member for analytics (never becomes primary, invisible to clients)
rs.add({
  host: "mongo-analytics.internal:27017",
  priority: 0,
  hidden: true,
  votes: 0,
  tags: { purpose: "analytics" }
});

// Add a delayed member (disaster recovery - 1 hour behind)
rs.add({
  host: "mongo-delayed.internal:27017",
  priority: 0,
  hidden: true,
  votes: 0,
  secondaryDelaySecs: 3600,  // 1 hour delay
  tags: { purpose: "delayed-recovery" }
});

// Configure read preference in connection string
// mongodb://mongo1:27017,mongo2:27017,mongo3:27017/mydb?replicaSet=prod-rs&readPreference=secondaryPreferred

// Application-level read preference (Node.js driver)
const collection = db.collection('orders');

// Read from nearest member (lowest latency)
const result = await collection.find({ status: 'active' })
  .readPreference('nearest')
  .toArray();

// Read from secondary with max staleness
const analytics = await collection.find({ created_at: { $gte: lastHour } })
  .readPreference('secondary', [], { maxStalenessSeconds: 120 })
  .toArray();

// Write concern examples
// Majority write concern (recommended for important data)
await collection.insertOne(
  { order_id: "ORD-123", amount: 99.99 },
  { writeConcern: { w: "majority", j: true, wtimeout: 5000 } }
);

// Monitor replica set status
rs.status();  // member states, optime, election info
rs.printReplicationInfo();  // oplog size and time range
rs.printSecondaryReplicationInfo();  // secondary lag
```

### Sharding Configuration and Shard Key Selection

```javascript
// Enable sharding on a database
sh.enableSharding("ecommerce");

// GOOD shard key: High cardinality, even distribution, supports query patterns
// Hashed shard key for even distribution (good for writes, bad for range queries)
sh.shardCollection("ecommerce.events", { event_id: "hashed" });

// Compound shard key (supports targeted queries on tenant_id)
sh.shardCollection("ecommerce.orders", { tenant_id: 1, order_date: 1 });
// Queries with tenant_id are targeted to specific shard
// Range queries on order_date within a tenant are efficient

// Zone-based sharding (data locality / compliance)
sh.addShardTag("shard-us-east", "US");
sh.addShardTag("shard-eu-west", "EU");

sh.addTagRange(
  "ecommerce.users",
  { region: "US", _id: MinKey },
  { region: "US", _id: MaxKey },
  "US"
);
sh.addTagRange(
  "ecommerce.users",
  { region: "EU", _id: MinKey },
  { region: "EU", _id: MaxKey },
  "EU"
);

// Monitor sharding status
sh.status();           // chunk distribution, balancer state
db.orders.getShardDistribution();  // data distribution per shard

// Check balancer status
sh.getBalancerState();
sh.isBalancerRunning();

// Configure balancer window (only balance during off-peak)
db.settings.updateOne(
  { _id: "balancer" },
  { $set: { activeWindow: { start: "02:00", stop: "06:00" } } },
  { upsert: true }
);

// Resharding (MongoDB 5.0+) - change shard key without downtime
db.adminCommand({
  reshardCollection: "ecommerce.orders",
  key: { customer_id: 1, order_date: 1 }  // new shard key
});

// Pre-split chunks for predictable distribution (before bulk load)
sh.splitAt("ecommerce.orders", { tenant_id: "tenant_100", order_date: ISODate("2024-01-01") });
sh.splitAt("ecommerce.orders", { tenant_id: "tenant_200", order_date: ISODate("2024-01-01") });
```

### Backup and Restore Operations

```javascript
// mongodump: Logical backup (for smaller databases < 100GB)
// $ mongodump --uri="mongodb://user:pass@mongo1:27017/mydb?replicaSet=prod-rs&readPreference=secondary" \
//   --out=/backup/2024-03-15 --oplog --gzip

// mongorestore: Restore from logical backup
// $ mongorestore --uri="mongodb://user:pass@mongo1:27017/mydb" \
//   --dir=/backup/2024-03-15 --oplogReplay --gzip --drop

// Point-in-time restore with oplog replay
// $ mongorestore --oplogReplay --oplogLimit="1710500000:1" \
//   --dir=/backup/2024-03-15

// Atlas: Continuous backup with point-in-time recovery
// Configured via Atlas UI or API - automated snapshots every 6 hours
// PITR available to any second within the retention window

// Filesystem snapshot backup (for large databases)
// 1. Lock writes (or use secondary)
db.fsyncLock();
// 2. Take LVM/EBS snapshot (external to MongoDB)
// 3. Unlock
db.fsyncUnlock();

// Verify backup integrity
// $ mongorestore --dryRun --dir=/backup/2024-03-15

// Export specific collection to JSON (for data migration)
// $ mongoexport --uri="mongodb://..." --collection=orders \
//   --query='{"status":"completed","date":{"$gte":{"$date":"2024-01-01T00:00:00Z"}}}' \
//   --out=completed_orders.json
```

### Change Streams

```javascript
// Watch a collection for all changes
const changeStream = db.collection('orders').watch([], {
  fullDocument: 'updateLookup'  // include full document on updates
});

changeStream.on('change', (change) => {
  console.log('Operation:', change.operationType);
  console.log('Document:', change.fullDocument);
  console.log('Resume Token:', change._id);

  switch (change.operationType) {
    case 'insert':
      // Trigger order processing pipeline
      processNewOrder(change.fullDocument);
      break;
    case 'update':
      // Invalidate cache, notify customer
      if (change.updateDescription.updatedFields.status) {
        notifyStatusChange(change.fullDocument);
      }
      break;
    case 'delete':
      // Clean up related data
      cleanupOrderReferences(change.documentKey._id);
      break;
  }
});

// Watch with pipeline filter (only specific changes)
const pipeline = [
  { $match: {
    'operationType': { $in: ['insert', 'update'] },
    'fullDocument.status': 'payment_confirmed'
  }},
  { $project: {
    'fullDocument.order_id': 1,
    'fullDocument.customer_id': 1,
    'fullDocument.total': 1,
    'operationType': 1
  }}
];

const filteredStream = db.collection('orders').watch(pipeline);

// Resume from a specific point (crash recovery)
const resumeToken = loadResumeTokenFromStorage();
const resumedStream = db.collection('orders').watch([], {
  resumeAfter: resumeToken,
  fullDocument: 'updateLookup'
});

// Watch entire database (all collections)
const dbStream = db.watch([
  { $match: { 'ns.coll': { $in: ['orders', 'payments', 'shipments'] } } }
]);

// Change stream with pre-image and post-image (MongoDB 6.0+)
db.createCollection('orders', {
  changeStreamPreAndPostImages: { enabled: true }
});

const streamWithImages = db.collection('orders').watch([], {
  fullDocument: 'required',
  fullDocumentBeforeChange: 'required'
});

streamWithImages.on('change', (change) => {
  console.log('Before:', change.fullDocumentBeforeChange);
  console.log('After:', change.fullDocument);
});
```

### Monitoring and Performance

```javascript
// Server status overview
db.serverStatus();

// Current operations (find slow/blocking operations)
db.currentOp({
  "active": true,
  "secs_running": { "$gt": 5 },
  "op": { "$ne": "none" }
});

// Kill a long-running operation
db.killOp(opId);

// Collection statistics
db.orders.stats({ scale: 1024 * 1024 });  // sizes in MB

// Index usage statistics
db.orders.aggregate([{ $indexStats: {} }]);

// Profiler: Log slow queries
db.setProfilingLevel(1, { slowms: 100 });  // log queries > 100ms
db.system.profile.find().sort({ ts: -1 }).limit(10);

// Explain query execution
db.orders.find({ customer_id: "cust123", status: "active" })
  .explain("executionStats");

// Key metrics to monitor:
// - opcounters (insert/query/update/delete rates)
// - connections.current vs connections.available
// - globalLock.currentQueue (read/write queue depth)
// - wiredTiger.cache.bytes currently in the cache
// - wiredTiger.cache.tracked dirty bytes in the cache
// - repl.apply.ops (replication apply rate)
// - repl.buffer.count (oplog buffer)

// Atlas monitoring equivalent: Performance Advisor
// Suggests indexes based on slow query log analysis
// Available via Atlas UI or API
```

## Architecture / Diagrams

```mermaid
graph TB
    subgraph "Sharded Cluster Architecture"
        subgraph "Application Layer"
            APP1[App Server 1]
            APP2[App Server 2]
            APP3[App Server 3]
        end

        subgraph "Query Routing"
            MONGOS1[mongos Router 1]
            MONGOS2[mongos Router 2]
        end

        subgraph "Config Servers (Replica Set)"
            CFG1[(Config 1)]
            CFG2[(Config 2)]
            CFG3[(Config 3)]
        end

        subgraph "Shard 1 (Replica Set)"
            S1P[(Primary)]
            S1S1[(Secondary)]
            S1S2[(Secondary)]
        end

        subgraph "Shard 2 (Replica Set)"
            S2P[(Primary)]
            S2S1[(Secondary)]
            S2S2[(Secondary)]
        end

        subgraph "Shard 3 (Replica Set)"
            S3P[(Primary)]
            S3S1[(Secondary)]
            S3S2[(Secondary)]
        end
    end

    APP1 --> MONGOS1
    APP2 --> MONGOS1
    APP3 --> MONGOS2
    MONGOS1 --> CFG1
    MONGOS2 --> CFG1
    MONGOS1 --> S1P
    MONGOS1 --> S2P
    MONGOS1 --> S3P
    MONGOS2 --> S1P
    MONGOS2 --> S2P
    MONGOS2 --> S3P
    S1P --> S1S1
    S1P --> S1S2
    S2P --> S2S1
    S2P --> S2S2
    S3P --> S3S1
    S3P --> S3S2
```

```mermaid
sequenceDiagram
    participant App as Application
    participant MS as mongos Router
    participant CFG as Config Server
    participant S1 as Shard 1
    participant S2 as Shard 2

    Note over App,S2: Targeted Query (shard key in filter)
    App->>MS: find({tenant_id: "T1", status: "active"})
    MS->>CFG: Lookup chunk ranges for tenant_id="T1"
    CFG->>MS: Chunk on Shard 1
    MS->>S1: Forward query to Shard 1 only
    S1->>MS: Results
    MS->>App: Results (single shard, fast)

    Note over App,S2: Scatter-Gather Query (no shard key)
    App->>MS: find({status: "active"}).sort({date: -1}).limit(10)
    MS->>S1: Forward query to all shards
    MS->>S2: Forward query to all shards
    S1->>MS: Partial results
    S2->>MS: Partial results
    MS->>MS: Merge and sort results
    MS->>App: Final merged results (slower)
```

## Common Pitfalls

**Choosing a monotonically increasing shard key**: Using `_id` (ObjectId), timestamps, or auto-incrementing values as the shard key creates a "hot shard" problem — all new writes go to the shard owning the maximum chunk range. This single shard becomes the write bottleneck while other shards sit idle. Solutions: use a hashed shard key for even write distribution, or use a compound shard key with a high-cardinality prefix (e.g., `{tenant_id: 1, created_at: 1}`).

**Undersizing the oplog**: The oplog is a capped collection that determines how far behind a secondary can fall before requiring a full resync (hours-long process). If the oplog is too small and a secondary goes offline for maintenance, it may not be able to catch up from the oplog and requires a full initial sync. Size the oplog to cover at least 24-48 hours of write activity. Monitor with `rs.printReplicationInfo()` — if the oplog window is less than your maintenance window, increase it.

**Not using write concern majority for important data**: Default write concern `w:1` only waits for the primary to acknowledge the write. If the primary fails before replicating to secondaries, the write is lost (rolled back when the old primary rejoins as a secondary). For data that cannot be lost (financial transactions, user registrations), always use `w:"majority"` which waits for the write to be replicated to a majority of members before acknowledging.

**Running scatter-gather queries on sharded collections**: Queries that don't include the shard key in the filter must be sent to ALL shards (scatter-gather), which is significantly slower than targeted queries. If your most frequent query doesn't include the shard key, you've chosen the wrong shard key. Analyze your query patterns before selecting a shard key — the shard key should be present in 80%+ of your queries.

**Ignoring chunk migration impact on performance**: The balancer migrates chunks between shards to maintain even distribution. Each migration copies data over the network and can impact query latency on the source and destination shards. Schedule the balancer window during off-peak hours, monitor migration rate, and investigate if chunks are splitting/migrating excessively (indicates a poor shard key choice with hot spots).

**Not configuring change stream resume tokens**: Change streams can disconnect due to network issues, server restarts, or elections. Without storing and using resume tokens, you'll miss events during disconnection. Always persist the resume token after processing each change event (to a separate collection or external store), and use `resumeAfter` when reconnecting. For critical event processing, implement at-least-once delivery with idempotent consumers.

## Real-World Use Cases

**Global e-commerce with zone sharding**: A multinational retailer uses MongoDB zone sharding to keep customer data in the region where the customer resides (GDPR compliance). US customers' data lives on shards in us-east-1, EU customers on shards in eu-west-1, and APAC customers on shards in ap-southeast-1. The shard key is `{region: 1, customer_id: 1}`, with zone ranges configured per region. Each region's application servers connect to local mongos routers, ensuring low-latency reads. Cross-region queries (global analytics) use scatter-gather but run on dedicated analytics mongos routers with higher timeouts.

**Real-time fraud detection with change streams**: A payment processor uses MongoDB change streams to trigger real-time fraud analysis. When a new transaction is inserted into the `transactions` collection, a change stream consumer picks it up within 50ms, enriches it with customer history (from a read-optimized secondary), runs it through ML scoring, and either approves or flags it. The change stream consumer runs on 3 instances for redundancy, with resume tokens stored in a separate `stream_checkpoints` collection. If a consumer crashes, another instance resumes from the last checkpoint with at-most 1 second of reprocessing.

**IoT platform scaling from startup to enterprise**: A smart home company started with a single replica set handling 10,000 devices. As they grew to 2M devices generating 50,000 writes/second, they sharded the `device_events` collection with a compound shard key `{device_id: "hashed"}` for even write distribution. They added shards incrementally (started with 3, grew to 12) without application changes — mongos routing is transparent. For time-based queries (show device history), they maintain a secondary index on `{device_id: 1, timestamp: -1}` which enables targeted queries since device_id is the shard key prefix.

**Content management with Atlas Search**: A media company stores 50M articles in MongoDB Atlas with full-text search powered by Atlas Search (Lucene-based). Articles are stored with rich metadata, embedded author information (extended reference pattern), and content in multiple formats. Atlas Search indexes provide faceted search, autocomplete, fuzzy matching, and relevance scoring without a separate Elasticsearch cluster. Change streams trigger re-indexing when articles are updated. Atlas's auto-scaling handles traffic spikes during breaking news events (10x normal read traffic) by automatically adding read capacity.

## Interview Questions

**Q: How do you choose a shard key for a MongoDB collection? What properties make a good shard key?**

A: A good shard key has four properties: (1) High cardinality — many distinct values to enable fine-grained distribution (avoid boolean or enum fields with few values). (2) Even distribution — values should be uniformly distributed to prevent hot shards (avoid monotonically increasing values like timestamps or ObjectIds). (3) Query targeting — the shard key should be present in your most frequent queries so mongos can route to a single shard instead of scatter-gathering. (4) Non-monotonic writes — new documents should distribute across shards, not concentrate on one. A compound shard key like `{tenant_id: 1, created_at: 1}` often works well: tenant_id provides query targeting and distribution, while created_at provides ordering within a tenant. For write-heavy workloads with no natural distribution key, a hashed shard key provides even distribution at the cost of range query efficiency.

**Q: Explain MongoDB's replica set election process. What happens during a failover?**

A: When the primary becomes unreachable (heartbeat timeout, default 10 seconds), secondaries initiate an election. The election protocol (Raft-based since MongoDB 3.6) works as follows: an eligible secondary (priority > 0, not hidden, data is recent enough) calls for a vote. Other members vote based on: the candidate's optime (must be at least as up-to-date as the voter), priority (higher priority preferred), and whether they've already voted in this term. A candidate needs votes from a majority of members to win. The election typically completes in 10-12 seconds. During this window, the replica set cannot accept writes (reads from secondaries continue if read preference allows). After election, the new primary accepts writes and the old primary (when it recovers) performs a rollback of any writes not replicated to the new primary, then syncs as a secondary.

**Q: What are the trade-offs between different MongoDB write concern levels?**

A: `w:0` (unacknowledged): fastest, no durability guarantee, application doesn't know if write succeeded. Use only for non-critical telemetry data. `w:1` (primary acknowledged): write confirmed on primary's memory, but not yet replicated. If primary fails before replication, write is lost (rolled back). Default for most drivers. `w:"majority"`: write confirmed replicated to majority of members. Survives primary failure — the write exists on enough members to be preserved during any election. Adds latency (must wait for replication). `j:true` (journaled): write confirmed written to the on-disk journal. Survives primary crash without data loss even for w:1. Adds disk I/O latency. For production: use `w:"majority", j:true` for financial/critical data (highest durability, ~2-5ms additional latency), `w:1` for general application data (good balance), and `w:0` only for metrics/logs where occasional loss is acceptable.

**Q: How do change streams work internally, and how do you handle failures in change stream consumers?**

A: Change streams are built on top of the oplog (replication log). When you open a change stream, MongoDB tails the oplog and filters for changes matching your pipeline. Each change event includes a resume token (an opaque BSON value encoding the oplog position). Internally, the driver maintains a cursor on the oplog with a `$changeStream` aggregation stage. For failure handling: (1) Store the resume token after successfully processing each event (in a separate collection or external store like Redis). (2) On consumer restart, open the change stream with `resumeAfter: lastToken` to continue from where you left off. (3) Handle `invalidate` events (collection dropped, renamed) by restarting the stream without a resume token. (4) Implement idempotent processing since at-least-once delivery means events may be replayed after a crash. (5) Monitor consumer lag by comparing the resume token's cluster time to the current cluster time.

**Q: When would you choose MongoDB Atlas over self-managed MongoDB? What are the operational differences?**

A: Choose Atlas when: your team lacks dedicated MongoDB expertise, you need global distribution (Atlas Global Clusters with zone sharding across regions), you want integrated features (Atlas Search, Atlas Data Lake, Charts) without managing separate infrastructure, you need automated compliance (SOC2, HIPAA, PCI-DSS certifications), or when operational simplicity outweighs cost optimization. Choose self-managed when: you need full control over configuration and versions, have strict data residency requirements that Atlas regions don't satisfy, need custom storage engines or plugins, or when cost at scale (>$50K/month) justifies dedicated operations staff. Operational differences: Atlas handles backups (continuous with PITR), monitoring (built-in alerts and Performance Advisor), scaling (auto-scale compute and storage), patching (rolling upgrades), and security (encryption, VPC peering, private endpoints). Self-managed requires you to build all of this with tools like Ops Manager, custom monitoring, and manual upgrade procedures.

## Production Tips

**Size your oplog for at least 48 hours of write activity**: The oplog window determines how long a secondary can be offline before requiring a full resync. Calculate your write rate: `db.getReplicationInfo()` shows current oplog window. For a 50GB oplog with 1GB/hour write rate, you have ~50 hours. If maintenance windows or network issues could take a secondary offline for longer, increase the oplog. Use `replSetResizeOplog` command (MongoDB 3.6+) to resize without restart.

**Implement connection pool tuning for your driver**: Default connection pool settings are often too conservative for production. For the Node.js driver: set `maxPoolSize` to 100-200 (default 100), `minPoolSize` to 10-20 for warm connections, `maxIdleTimeMS` to 60000, and `serverSelectionTimeoutMS` to 5000. Monitor `serverStatus().connections` to ensure you're not exhausting the server's connection limit (default 65536). Each mongos in a sharded cluster maintains separate connection pools to each shard.

**Use read preference tags for workload isolation**: Tag replica set members by purpose (`{ purpose: "analytics" }`, `{ purpose: "realtime" }`) and configure read preferences with tag sets. Analytics queries use `readPreference: secondary, readPreferenceTags: [{purpose: "analytics"}]` to hit dedicated analytics secondaries without impacting the primary or real-time read secondaries. This provides workload isolation without separate clusters.

**Monitor and alert on replication lag**: Set up alerts when secondary lag exceeds 10 seconds (warning) and 60 seconds (critical). Sustained lag indicates the secondary cannot keep up with write volume (CPU/IO bottleneck) or network issues. Use `rs.printSecondaryReplicationInfo()` for manual checks and integrate with monitoring (Prometheus mongodb_exporter, Datadog, Atlas alerts). Lag approaching the oplog window is an emergency — the secondary will need a full resync if it falls off the oplog.

## Related Topics

- [MongoDB and Document Databases](./mongodb.md) — Core MongoDB concepts, aggregation pipelines, and indexing strategies
- [Schema Design](./schema-design.md) — Document modeling patterns, embedding vs referencing, and schema evolution
- [PostgreSQL Replication and HA](../postgresql/replication-and-ha.md) — Comparative HA approach with streaming replication
- [Redis Clustering and Persistence](../redis/clustering-and-ha.md) — Alternative distributed architecture with Redis Cluster
