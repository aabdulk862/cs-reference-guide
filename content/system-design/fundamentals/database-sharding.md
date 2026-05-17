# Database Sharding

## Quick Reference

- Database sharding horizontally partitions data across multiple database instances (shards), where each shard holds a subset of the total data and operates independently
- The shard key determines data distribution; a good shard key distributes data evenly, aligns with query patterns, and avoids hot spots
- Hash-based sharding uses consistent hashing for uniform distribution; range-based sharding maps contiguous key ranges to shards for range query support
- Cross-shard queries require scatter-gather across multiple shards and result merging, making them significantly more expensive than single-shard queries
- Resharding (adding or removing shards) requires online data migration using techniques like dual-writes, virtual sharding, or shadow traffic
- Virtual sharding maps many logical shards to fewer physical shards, enabling resharding by reassigning logical shards without data movement within a shard
- Two-phase commit or saga patterns handle cross-shard transactions at the cost of performance and complexity
- NewSQL databases (CockroachDB, TiDB, Spanner) provide automatic sharding with distributed transactions, trading operational simplicity for some performance overhead

## When to Use

Database sharding becomes necessary when a single database instance cannot handle the write throughput required by your application, when the dataset exceeds the storage capacity of a single machine, or when write latency is unacceptable due to lock contention on a single instance. Sharding is appropriate for applications with clear partition boundaries in their data model (multi-tenant SaaS sharded by tenant, social networks sharded by user, e-commerce sharded by merchant), where most queries can be satisfied by a single shard, and where the operational complexity of managing multiple database instances is justified by the scale requirements. Sharding is not appropriate when read replicas can solve your scaling problem (read-heavy workloads with acceptable replication lag), when your dataset fits comfortably on a single machine with room to grow, or when your query patterns require frequent cross-shard joins. Consider sharding as a last resort after exhausting vertical scaling, read replicas, caching, and query optimization, because it introduces significant operational complexity that persists for the lifetime of the system.

## Code Examples

### Shard Router with Virtual Sharding

```java
/**
 * Shard router using virtual sharding for flexible resharding.
 * Maps logical shards (many) to physical shards (few), enabling
 * resharding by reassigning logical shards without moving data within a shard.
 */
public class VirtualShardRouter {
    private final int virtualShardCount; // e.g., 1024 logical shards
    private volatile Map<Integer, PhysicalShard> shardMapping; // logical -> physical
    private final ConsistentHasher hasher;

    public VirtualShardRouter(int virtualShardCount, List<PhysicalShard> physicalShards) {
        this.virtualShardCount = virtualShardCount;
        this.hasher = new ConsistentHasher();
        this.shardMapping = buildInitialMapping(virtualShardCount, physicalShards);
    }

    /**
     * Route a key to its physical shard.
     * Two-level mapping: key -> virtual shard -> physical shard
     */
    public PhysicalShard route(String shardKey) {
        int virtualShard = getVirtualShard(shardKey);
        PhysicalShard physical = shardMapping.get(virtualShard);
        if (physical == null) {
            throw new ShardRoutingException(
                "No physical shard mapped for virtual shard " + virtualShard
            );
        }
        return physical;
    }

    /**
     * Get the virtual shard for a key using consistent hashing.
     * The virtual shard count never changes, providing stable key-to-logical-shard mapping.
     */
    private int getVirtualShard(String shardKey) {
        long hash = hasher.hash(shardKey);
        return (int) (Math.abs(hash) % virtualShardCount);
    }

    /**
     * Scatter-gather query across all physical shards.
     * Used for queries that cannot be routed to a single shard.
     */
    public <T> List<T> scatterGather(
            Function<PhysicalShard, List<T>> queryExecutor,
            Comparator<T> resultOrdering,
            int limit) {

        Set<PhysicalShard> uniqueShards = new HashSet<>(shardMapping.values());

        List<CompletableFuture<List<T>>> futures = uniqueShards.stream()
            .map(shard -> CompletableFuture.supplyAsync(() -> queryExecutor.apply(shard)))
            .collect(Collectors.toList());

        // Wait for all shards to respond (with timeout)
        List<T> allResults = futures.stream()
            .map(f -> {
                try {
                    return f.get(5, TimeUnit.SECONDS);
                } catch (Exception e) {
                    throw new ShardQueryException("Shard query failed", e);
                }
            })
            .flatMap(List::stream)
            .sorted(resultOrdering)
            .limit(limit)
            .collect(Collectors.toList());

        return allResults;
    }

    /**
     * Resharding: move virtual shards from one physical shard to another.
     * This is the atomic switch after data migration is complete.
     */
    public void reassignVirtualShards(
            List<Integer> virtualShards,
            PhysicalShard newPhysicalShard) {

        Map<Integer, PhysicalShard> newMapping = new HashMap<>(shardMapping);
        for (int vs : virtualShards) {
            newMapping.put(vs, newPhysicalShard);
        }
        // Atomic swap of the mapping (volatile write)
        this.shardMapping = Collections.unmodifiableMap(newMapping);
    }

    private Map<Integer, PhysicalShard> buildInitialMapping(
            int virtualCount, List<PhysicalShard> physical) {
        Map<Integer, PhysicalShard> mapping = new HashMap<>();
        for (int i = 0; i < virtualCount; i++) {
            // Distribute virtual shards evenly across physical shards
            PhysicalShard target = physical.get(i % physical.size());
            mapping.put(i, target);
        }
        return Collections.unmodifiableMap(mapping);
    }
}
```

### Online Resharding with Dual-Write Strategy

```typescript
/**
 * Online resharding manager that migrates data between shards
 * without downtime using a dual-write strategy.
 *
 * Phases:
 * 1. DUAL_WRITE: Write to both old and new shard
 * 2. BACKFILL: Copy historical data from old to new shard
 * 3. VERIFY: Compare data between shards for consistency
 * 4. CUTOVER: Switch reads to new shard, stop writing to old
 * 5. CLEANUP: Remove data from old shard
 */
enum ReshardPhase {
  IDLE = 'IDLE',
  DUAL_WRITE = 'DUAL_WRITE',
  BACKFILL = 'BACKFILL',
  VERIFY = 'VERIFY',
  CUTOVER = 'CUTOVER',
  CLEANUP = 'CLEANUP'
}

class OnlineResharder {
  private phase: ReshardPhase = ReshardPhase.IDLE;
  private readonly sourceShards: Map<string, DatabaseClient>;
  private readonly targetShards: Map<string, DatabaseClient>;
  private readonly router: ShardRouter;
  private readonly metrics: ReshardMetrics;

  constructor(
    sourceShards: Map<string, DatabaseClient>,
    targetShards: Map<string, DatabaseClient>,
    router: ShardRouter
  ) {
    this.sourceShards = sourceShards;
    this.targetShards = targetShards;
    this.router = router;
    this.metrics = new ReshardMetrics();
  }

  /**
   * Write operation during resharding.
   * In DUAL_WRITE phase, writes go to both source and target.
   */
  async write(key: string, data: Record<string, unknown>): Promise<void> {
    const sourceShard = this.router.routeSource(key);
    const targetShard = this.router.routeTarget(key);

    switch (this.phase) {
      case ReshardPhase.IDLE:
        // Normal operation: write to source only
        await this.sourceShards.get(sourceShard)!.write(key, data);
        break;

      case ReshardPhase.DUAL_WRITE:
      case ReshardPhase.BACKFILL:
      case ReshardPhase.VERIFY:
        // Dual-write: write to both source and target
        await Promise.all([
          this.sourceShards.get(sourceShard)!.write(key, data),
          this.targetShards.get(targetShard)!.write(key, data)
        ]);
        this.metrics.dualWrites++;
        break;

      case ReshardPhase.CUTOVER:
      case ReshardPhase.CLEANUP:
        // Post-cutover: write to target only
        await this.targetShards.get(targetShard)!.write(key, data);
        break;
    }
  }

  /**
   * Read operation during resharding.
   * Reads from source until cutover, then from target.
   */
  async read(key: string): Promise<Record<string, unknown> | null> {
    if (this.phase === ReshardPhase.CUTOVER || this.phase === ReshardPhase.CLEANUP) {
      const targetShard = this.router.routeTarget(key);
      return this.targetShards.get(targetShard)!.read(key);
    }

    const sourceShard = this.router.routeSource(key);
    return this.sourceShards.get(sourceShard)!.read(key);
  }

  /**
   * Backfill historical data from source to target shards.
   * Processes in batches with rate limiting to avoid overloading.
   */
  async backfill(batchSize: number = 1000, rateLimit: number = 5000): Promise<void> {
    this.phase = ReshardPhase.BACKFILL;
    let cursor: string | null = null;
    let totalMigrated = 0;

    for (const [shardId, client] of this.sourceShards) {
      do {
        const batch = await client.scan(cursor, batchSize);
        cursor = batch.nextCursor;

        for (const record of batch.records) {
          const targetShard = this.router.routeTarget(record.key);
          const targetClient = this.targetShards.get(targetShard)!;

          // Only copy if not already present (dual-write may have written it)
          const existing = await targetClient.read(record.key);
          if (!existing || existing.version < record.version) {
            await targetClient.write(record.key, record.data);
            totalMigrated++;
          }

          // Rate limiting
          if (totalMigrated % rateLimit === 0) {
            await this.sleep(1000); // 1 second pause every rateLimit records
          }
        }

        this.metrics.backfilledRecords = totalMigrated;
      } while (cursor !== null);
    }
  }

  /**
   * Verify data consistency between source and target shards.
   * Samples records and compares values.
   */
  async verify(sampleRate: number = 0.01): Promise<VerificationResult> {
    this.phase = ReshardPhase.VERIFY;
    let checked = 0;
    let mismatches = 0;

    for (const [shardId, client] of this.sourceShards) {
      let cursor: string | null = null;
      do {
        const batch = await client.scan(cursor, 1000);
        cursor = batch.nextCursor;

        for (const record of batch.records) {
          if (Math.random() > sampleRate) continue;

          const targetShard = this.router.routeTarget(record.key);
          const targetRecord = await this.targetShards.get(targetShard)!.read(record.key);

          checked++;
          if (!targetRecord || !this.deepEqual(record.data, targetRecord)) {
            mismatches++;
          }
        }
      } while (cursor !== null);
    }

    return {
      checked,
      mismatches,
      mismatchRate: checked > 0 ? mismatches / checked : 0,
      passed: mismatches === 0
    };
  }

  async cutover(): Promise<void> {
    this.phase = ReshardPhase.CUTOVER;
    // Update router to use new shard mapping for reads
    this.router.activateTargetMapping();
    this.metrics.cutoverTimestamp = Date.now();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private deepEqual(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }
}
```

### Shard-Aware Repository Pattern

```java
/**
 * Repository that transparently routes queries to the correct shard
 * based on the entity's shard key.
 */
@Repository
public class ShardedOrderRepository {
    private final VirtualShardRouter router;
    private final JdbcTemplateFactory templateFactory;

    public ShardedOrderRepository(VirtualShardRouter router,
                                   JdbcTemplateFactory templateFactory) {
        this.router = router;
        this.templateFactory = templateFactory;
    }

    /**
     * Single-shard query: route by customer ID (shard key).
     * Most efficient — hits exactly one shard.
     */
    public List<Order> findByCustomerId(String customerId) {
        PhysicalShard shard = router.route(customerId);
        JdbcTemplate template = templateFactory.getTemplate(shard);

        return template.query(
            "SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC",
            new OrderRowMapper(),
            customerId
        );
    }

    /**
     * Single-shard write: route by customer ID.
     */
    public Order save(Order order) {
        PhysicalShard shard = router.route(order.getCustomerId());
        JdbcTemplate template = templateFactory.getTemplate(shard);

        template.update(
            "INSERT INTO orders (id, customer_id, total, status, created_at) " +
            "VALUES (?, ?, ?, ?, ?)",
            order.getId(),
            order.getCustomerId(),
            order.getTotal(),
            order.getStatus().name(),
            order.getCreatedAt()
        );

        return order;
    }

    /**
     * Cross-shard query: scatter-gather across all shards.
     * Used for admin queries or analytics that span all customers.
     * Significantly more expensive than single-shard queries.
     */
    public List<Order> findRecentOrders(Instant since, int limit) {
        return router.scatterGather(
            shard -> {
                JdbcTemplate template = templateFactory.getTemplate(shard);
                return template.query(
                    "SELECT * FROM orders WHERE created_at > ? " +
                    "ORDER BY created_at DESC LIMIT ?",
                    new OrderRowMapper(),
                    since,
                    limit
                );
            },
            Comparator.comparing(Order::getCreatedAt).reversed(),
            limit
        );
    }

    /**
     * Cross-shard aggregation: compute total revenue across all shards.
     * Each shard computes its partial aggregate, then results are combined.
     */
    public BigDecimal getTotalRevenue(Instant from, Instant to) {
        List<BigDecimal> partialSums = router.scatterGather(
            shard -> {
                JdbcTemplate template = templateFactory.getTemplate(shard);
                BigDecimal sum = template.queryForObject(
                    "SELECT COALESCE(SUM(total), 0) FROM orders " +
                    "WHERE created_at BETWEEN ? AND ? AND status = 'COMPLETED'",
                    BigDecimal.class,
                    from, to
                );
                return List.of(sum);
            },
            Comparator.naturalOrder(),
            Integer.MAX_VALUE
        );

        return partialSums.stream()
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /**
     * Paginated cross-shard query using cursor-based pagination.
     * Each shard maintains its own cursor; the router merges results.
     */
    public PagedResult<Order> findAllPaginated(
            Map<String, String> shardCursors, int pageSize) {

        Map<String, String> newCursors = new HashMap<>();
        List<Order> allResults = new ArrayList<>();

        Set<PhysicalShard> shards = new HashSet<>(
            router.getAllPhysicalShards()
        );

        for (PhysicalShard shard : shards) {
            String cursor = shardCursors.getOrDefault(shard.getId(), "");
            JdbcTemplate template = templateFactory.getTemplate(shard);

            List<Order> shardResults = template.query(
                "SELECT * FROM orders WHERE id > ? ORDER BY id LIMIT ?",
                new OrderRowMapper(),
                cursor,
                pageSize
            );

            allResults.addAll(shardResults);
            if (!shardResults.isEmpty()) {
                newCursors.put(shard.getId(),
                    shardResults.get(shardResults.size() - 1).getId());
            }
        }

        // Sort merged results and take page size
        allResults.sort(Comparator.comparing(Order::getId));
        List<Order> page = allResults.subList(0, Math.min(pageSize, allResults.size()));

        return new PagedResult<>(page, newCursors, allResults.size() >= pageSize);
    }
}
```

## Common Pitfalls

- Choosing a shard key that creates hot spots: sharding by a monotonically increasing value (auto-increment ID, timestamp) sends all recent writes to a single shard while older shards sit idle. This defeats the purpose of sharding for write scaling. Choose keys with high cardinality and uniform distribution, or use hash-based sharding to randomize distribution.

- Not planning for resharding from the start: starting with a fixed number of shards without virtual sharding or a migration strategy means painful, often downtime-requiring resharding when capacity limits are reached. Design with virtual shards (1024+ logical shards mapped to fewer physical shards) from day one, enabling resharding by reassigning logical shards rather than moving individual records.

- Underestimating cross-shard query complexity: queries that span multiple shards require scatter-gather, which is O(N) in the number of shards for both latency (parallel) and throughput (total work). Pagination across shards is particularly complex because each shard has its own ordering. Design your shard key to align with your most common query patterns so that 90%+ of queries hit a single shard.

- Implementing cross-shard transactions naively: distributed transactions using two-phase commit block all participating shards until the coordinator decides commit or abort. A slow or failed coordinator can lock shards indefinitely. Use saga patterns (compensating transactions) for cross-shard operations, accepting eventual consistency in exchange for availability and performance.

- Ignoring shard size imbalance over time: even with a good initial distribution, data growth patterns can cause some shards to grow much larger than others (e.g., power-law distributions where some tenants generate far more data). Monitor shard sizes and implement automatic rebalancing or split large shards when they exceed thresholds.

- Sharding too early: sharding adds significant operational complexity (backup coordination, schema migrations across shards, monitoring per-shard health, cross-shard query support). If your database can handle the load with vertical scaling, read replicas, and query optimization, those approaches are simpler and cheaper to operate. Shard only when you have exhausted simpler alternatives.

- Not considering the impact on secondary indexes: global secondary indexes across shards require either maintaining a separate index service (adding latency and consistency challenges) or scatter-gather queries on every indexed lookup. Local secondary indexes (per-shard) only work for queries that include the shard key. Design your data model and access patterns before choosing a sharding strategy.

## Real-World Use Cases

**Vitess (YouTube/PlanetScale)**: Vitess is a database clustering system for horizontal scaling of MySQL, originally built at YouTube to handle their massive write throughput. It introduces a vtgate proxy layer that routes queries to the correct shard based on a vindex (virtual index) that maps shard keys to shards. Vitess handles cross-shard queries by rewriting them into per-shard queries and merging results. It supports online schema changes across hundreds of shards, automated resharding with minimal downtime, and connection pooling that multiplexes thousands of application connections over fewer MySQL connections. PlanetScale offers Vitess as a managed service.

**Instagram's Sharded PostgreSQL**: Instagram shards their PostgreSQL databases by user ID, with each logical shard containing data for a range of user IDs. They use thousands of logical shards mapped to dozens of physical PostgreSQL instances. The shard mapping is stored in a configuration service, enabling resharding by updating the mapping and migrating data. Their approach demonstrates that traditional RDBMS can scale horizontally with application-level sharding, preserving SQL capabilities and ACID transactions within each shard while accepting eventual consistency for cross-shard operations.

**Discord's Message Storage**: Discord shards message data by channel ID, ensuring all messages in a channel reside on the same shard for efficient retrieval. They migrated from MongoDB to Cassandra for message storage, using channel_id as the partition key. This design enables fast message history retrieval (single-partition query) while distributing write load across the cluster. For channels with extremely high message volume (large servers), they implement per-channel rate limiting and archival to prevent individual partitions from growing unbounded.

**Stripe's Payment Processing**: Stripe shards their payment data by merchant ID, keeping all of a merchant's transactions, customers, and payment methods on the same shard. This enables efficient per-merchant queries (the most common access pattern) while distributing write load across shards. Cross-merchant queries (platform-level analytics, compliance reporting) use dedicated analytics replicas that aggregate data from all shards. Their online migration system supports resharding without downtime using dual-writes and gradual traffic shifting.

**Slack's Workspace Sharding**: Slack shards data by workspace (organization), with each workspace's messages, channels, and files stored on the same shard. This natural partition boundary means most operations (sending messages, searching within a workspace) hit a single shard. Cross-workspace operations (Slack Connect channels shared between organizations) require cross-shard coordination using an event-driven architecture. When a workspace grows too large for its shard, Slack migrates it to a dedicated shard using their online migration tooling.

## Interview Questions

**Q: How would you choose a shard key for a multi-tenant SaaS application?**

A: Tenant ID is the natural shard key for multi-tenant applications because: (1) Most queries are scoped to a single tenant (user sees only their organization's data). (2) It provides good distribution if tenants are numerous. (3) It aligns with data isolation requirements. The main risk is tenant size imbalance: a few large tenants may overwhelm their shard while small tenants leave their shards underutilized. Mitigate with: virtual sharding (large tenants span multiple virtual shards), dedicated shards for the largest tenants, and monitoring shard utilization with automated alerts when imbalance exceeds thresholds. For queries that span tenants (admin dashboards, billing aggregation), maintain separate analytics replicas or use a CQRS pattern with a denormalized read model.

**Q: When would you choose range-based sharding over hash-based sharding?**

A: Range-based sharding maps contiguous key ranges to shards (e.g., users A-H on shard 1, I-P on shard 2). Choose it when your primary access pattern involves range queries (time-series data queried by date range, alphabetical listings, sequential ID ranges). The tradeoff is potential hot spots: if recent data is accessed most frequently and new data always goes to the latest range, one shard handles disproportionate load. Hash-based sharding distributes keys uniformly regardless of their natural ordering, eliminating hot spots but making range queries impossible without scatter-gather. Choose hash-based when distribution uniformity matters more than range query efficiency, which is the common case for most OLTP workloads.

**Q: How do you handle database migrations (schema changes) across a sharded database?**

A: Schema changes across shards must be coordinated carefully: (1) Use online DDL tools (pt-online-schema-change for MySQL, pg_repack for PostgreSQL) that create a new table, copy data, and swap atomically without locking. (2) Roll out changes shard-by-shard rather than simultaneously, monitoring for issues after each shard. (3) Make changes backward-compatible: add columns as nullable first, deploy application code that handles both schemas, then make columns non-nullable in a subsequent migration. (4) For Vitess/similar systems, use their built-in online DDL that coordinates across shards automatically. (5) Never run ALTER TABLE directly on production shards; always use tooling that avoids long-running locks.

**Q: Explain the tradeoffs between application-level sharding and using a NewSQL database like CockroachDB.**

A: Application-level sharding gives you full control over data placement, query routing, and shard management. You can optimize for your specific access patterns and use any database engine. The cost is significant engineering effort for the sharding layer, cross-shard queries, resharding tooling, and operational complexity. NewSQL databases (CockroachDB, TiDB, Spanner) handle sharding transparently with automatic data distribution, rebalancing, and distributed transactions. The tradeoffs are: higher per-query latency (distributed transaction coordination), less control over data placement, vendor lock-in to the NewSQL engine, and potentially higher infrastructure cost. Choose application-level sharding when you need maximum performance, have well-defined access patterns, and can invest in the engineering. Choose NewSQL when you need distributed transactions, want operational simplicity, and can accept the latency overhead.

## Production Tips

- Monitor per-shard metrics independently: query latency, connection count, disk usage, replication lag, and lock contention. A single overloaded shard degrades the experience for all users on that shard. Set up alerts for shard-level metrics that trigger before user impact (e.g., alert when any shard exceeds 70% disk capacity or P99 latency exceeds 100ms).

- Implement a shard health dashboard that shows the distribution of data and traffic across shards. Visualize shard sizes, query rates, and latency percentiles side-by-side to quickly identify imbalances. Include the virtual-to-physical shard mapping so operators can plan resharding operations.

- Use connection pooling between the application tier and each shard. As you scale application instances, the total connection count to each shard grows multiplicatively. PgBouncer (PostgreSQL) or ProxySQL (MySQL) between the application and database multiplexes many application connections over fewer database connections, preventing connection exhaustion.

- Test resharding procedures regularly in staging environments. Online resharding is complex and error-prone; discovering issues during a production resharding event is extremely costly. Run resharding drills quarterly, measuring data consistency, migration throughput, and application impact during the process.

- Design your shard key to be immutable. If the shard key can change (e.g., a user changes their username and you shard by username), you must move their data between shards atomically. Shard by immutable identifiers (UUIDs, auto-increment IDs) and maintain lookup indexes for mutable attributes.

- Implement automated shard health scoring that combines multiple signals (disk usage percentage, query latency percentiles, replication lag, connection saturation, and error rates) into a single health score per shard. Use this score to trigger automated alerts at different severity levels and to inform resharding priority decisions. A shard scoring below threshold for sustained periods should automatically page the on-call engineer with context about which metrics are degraded.

- Plan for shard-level disaster recovery independently. Each shard should have its own backup schedule, point-in-time recovery capability, and failover procedure. Test shard-level recovery regularly because restoring a single shard from backup while other shards continue serving traffic is operationally different from restoring an entire database. Document the procedure for rebuilding a shard from its replicas and validate that the process completes within your recovery time objective.

## Related Topics

- [Scalability](./scalability.md) — Sharding is the primary strategy for scaling write throughput beyond a single database instance
- [Consistency Models](./consistency-models.md) — Cross-shard operations involve consistency tradeoffs between shards
- [Caching](./caching.md) — Caching reduces database load, potentially deferring the need for sharding
- [Distributed Systems](./distributed-systems.md) — Sharded databases are distributed systems subject to the same failure modes and coordination challenges
