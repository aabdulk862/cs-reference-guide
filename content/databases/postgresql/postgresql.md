# PostgreSQL

PostgreSQL is the most advanced open-source relational database, combining strict SQL standards compliance with a powerful extension ecosystem that makes it suitable for workloads ranging from simple CRUD applications to geospatial analysis, full-text search, and time-series data. Unlike MySQL which historically prioritized speed over correctness, PostgreSQL has always prioritized data integrity, ACID compliance, and standards adherence — making it the default choice for systems where correctness matters more than raw throughput on simple queries. PostgreSQL's Multi-Version Concurrency Control (MVCC) implementation allows readers to never block writers and vice versa, enabling high concurrency without the locking overhead found in traditional databases. The extension system is PostgreSQL's defining architectural advantage: PostGIS transforms it into a geospatial database rivaling commercial GIS systems, pg_trgm enables fuzzy text matching, and TimescaleDB adds time-series capabilities — all without forking the core engine. Modern PostgreSQL (versions 14-17) has closed the performance gap with MySQL for simple workloads while maintaining its advantages in complex queries, advanced data types, and operational features like logical replication and declarative partitioning.

## Quick Reference

- **MVCC**: Every transaction sees a snapshot; dead tuples accumulate until VACUUM reclaims space; autovacuum handles this automatically but must be tuned for write-heavy tables
- **Index types**: B-tree (default, equality/range), GIN (full-text, JSONB, arrays), GiST (geometric, range types, nearest-neighbor), BRIN (large sequential tables like time-series), Hash (equality only, rarely useful)
- **Partial indexes**: `CREATE INDEX idx ON orders(status) WHERE status = 'PENDING'` — indexes only matching rows, dramatically smaller and faster for selective queries
- **JSONB**: Binary JSON with indexing support; use GIN indexes for containment queries (`@>`) and path existence (`?`); 10-30% larger than JSON but orders of magnitude faster for queries
- **Declarative partitioning**: Native since PostgreSQL 10; supports RANGE, LIST, and HASH partitioning with automatic partition pruning in query plans
- **Connection pooling**: PostgreSQL forks a process per connection (~10MB each); PgBouncer in transaction mode supports 10,000+ application connections with 100-200 server connections
- **Streaming replication**: Byte-level WAL shipping for hot standby replicas; synchronous mode guarantees zero data loss at the cost of write latency
- **Logical replication**: Table-level selective replication; enables zero-downtime major version upgrades and cross-version replication
- **CTEs**: Non-recursive CTEs are inlined (optimized) since PostgreSQL 12; use `MATERIALIZED` hint to force separate execution when needed
- **Extensions**: Over 1,000 available; `CREATE EXTENSION` installs them; no restart required for most extensions

## When to Use

PostgreSQL is the right choice for the majority of production applications that need a relational database. Choose PostgreSQL when you need complex queries with multiple joins, subqueries, and window functions — its optimizer handles these significantly better than MySQL. It excels for applications requiring advanced data types: JSONB for semi-structured data (eliminating the need for a separate document store), arrays and hstore for denormalized attributes, range types for scheduling systems, and geometric types for spatial queries. PostgreSQL is essential when you need strong consistency guarantees with serializable isolation, row-level security for multi-tenant applications, or foreign data wrappers to query external systems. For geospatial applications, PostGIS makes PostgreSQL the only viable open-source option. Choose PostgreSQL for analytics workloads that benefit from parallel query execution, partitioning, and materialized views. It's also the best choice when you anticipate needing logical replication for zero-downtime migrations or selective data distribution. The main scenarios where PostgreSQL is NOT the best choice: extremely simple key-value workloads (use Redis), massive write-heavy append-only logs (use Kafka or a time-series database), or when your team has deep MySQL expertise and the workload doesn't require PostgreSQL's advanced features.

## Code Examples

### Advanced Indexing Strategies

```sql
-- GIN index on JSONB for containment queries
CREATE INDEX idx_orders_metadata ON orders USING GIN (metadata jsonb_path_ops);

-- Query using the GIN index: find orders with specific attributes
SELECT order_id, total
FROM orders
WHERE metadata @> '{"priority": "high", "region": "us-east"}';

-- GiST index for range type queries (scheduling/booking systems)
CREATE TABLE reservations (
    id SERIAL PRIMARY KEY,
    room_id INT NOT NULL,
    during TSTZRANGE NOT NULL,
    EXCLUDE USING GIST (room_id WITH =, during WITH &&)  -- prevent overlaps
);

-- BRIN index for time-series data (1000x smaller than B-tree)
CREATE INDEX idx_events_created ON events USING BRIN (created_at)
    WITH (pages_per_range = 32);

-- Partial index: only index rows that queries actually filter on
CREATE INDEX idx_orders_pending ON orders (created_at)
    WHERE status = 'PENDING' AND total_amount > 100;

-- Covering index: include columns to enable index-only scans
CREATE INDEX idx_users_email ON users (email) INCLUDE (name, created_at);

-- Expression index: index computed values
CREATE INDEX idx_users_lower_email ON users (LOWER(email));

-- Multicolumn index with specific operator class for text search
CREATE INDEX idx_products_search ON products
    USING GIN (to_tsvector('english', name || ' ' || description));
```

### JSONB Operations and Querying

```sql
-- Create table with JSONB column for flexible attributes
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    base_price NUMERIC(10,2) NOT NULL,
    attributes JSONB NOT NULL DEFAULT '{}'
);

-- Insert with nested JSONB
INSERT INTO products (name, base_price, attributes) VALUES
('Laptop Pro', 1299.99, '{
    "specs": {"ram_gb": 16, "storage_gb": 512, "cpu": "M3"},
    "tags": ["electronics", "portable", "premium"],
    "dimensions": {"weight_kg": 1.4, "screen_inches": 14.2}
}');

-- Path extraction with type casting
SELECT name,
       attributes->'specs'->>'cpu' AS cpu,
       (attributes->'specs'->'ram_gb')::int AS ram_gb,
       attributes->'tags' AS tags
FROM products
WHERE attributes @> '{"specs": {"ram_gb": 16}}'  -- uses GIN index
  AND attributes ? 'dimensions';                  -- key existence

-- JSONB aggregation: build summary JSON from relational data
SELECT jsonb_build_object(
    'total_orders', COUNT(*),
    'revenue', SUM(total),
    'avg_order_value', ROUND(AVG(total), 2),
    'top_products', jsonb_agg(DISTINCT product_name ORDER BY product_name)
) AS summary
FROM orders
WHERE order_date >= CURRENT_DATE - INTERVAL '30 days';

-- Update nested JSONB without replacing the entire document
UPDATE products
SET attributes = jsonb_set(
    attributes,
    '{specs,ram_gb}',
    '32'::jsonb
)
WHERE id = 1;

-- Remove a key from JSONB
UPDATE products
SET attributes = attributes #- '{dimensions,weight_kg}'
WHERE id = 1;
```

### Partitioning and Window Functions

```sql
-- Declarative range partitioning for time-series data
CREATE TABLE events (
    event_id BIGSERIAL,
    event_type TEXT NOT NULL,
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Create monthly partitions
CREATE TABLE events_2024_01 PARTITION OF events
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE events_2024_02 PARTITION OF events
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

-- Automatic partition creation with pg_partman extension
CREATE EXTENSION pg_partman;
SELECT partman.create_parent(
    p_parent_table := 'public.events',
    p_control := 'created_at',
    p_type := 'native',
    p_interval := '1 month',
    p_premake := 3
);

-- Window functions with complex framing
SELECT
    date,
    daily_revenue,
    -- Running total within each month
    SUM(daily_revenue) OVER (
        PARTITION BY DATE_TRUNC('month', date)
        ORDER BY date
    ) AS mtd_revenue,
    -- 7-day moving average
    AVG(daily_revenue) OVER (
        ORDER BY date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ) AS seven_day_avg,
    -- Percent rank within the quarter
    PERCENT_RANK() OVER (
        PARTITION BY DATE_TRUNC('quarter', date)
        ORDER BY daily_revenue
    ) AS percentile_in_quarter,
    -- Previous day comparison
    daily_revenue - LAG(daily_revenue, 1) OVER (ORDER BY date) AS day_over_day_change
FROM daily_revenue_summary;

-- Recursive CTE: find all downstream dependencies
WITH RECURSIVE deps AS (
    SELECT service_id, depends_on, 1 AS depth
    FROM service_dependencies
    WHERE service_id = 'payment-service'
    
    UNION ALL
    
    SELECT sd.service_id, sd.depends_on, d.depth + 1
    FROM service_dependencies sd
    JOIN deps d ON sd.service_id = d.depends_on
    WHERE d.depth < 10  -- prevent infinite recursion
)
SELECT DISTINCT depends_on, MIN(depth) AS min_depth
FROM deps
GROUP BY depends_on
ORDER BY min_depth;
```

### Replication and Connection Pooling Configuration

```ini
# postgresql.conf - Primary server settings for streaming replication
wal_level = replica
max_wal_senders = 10
wal_keep_size = 1GB
synchronous_standby_names = 'first 1 (replica1, replica2)'

# Hot standby settings (replica)
hot_standby = on
max_standby_streaming_delay = 30s
hot_standby_feedback = on
```

```ini
# pgbouncer.ini - Transaction-mode pooling configuration
[databases]
myapp = host=127.0.0.1 port=5432 dbname=myapp pool_size=50

[pgbouncer]
listen_port = 6432
listen_addr = 0.0.0.0
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt

pool_mode = transaction
max_client_conn = 10000
default_pool_size = 50
min_pool_size = 10
reserve_pool_size = 5
reserve_pool_timeout = 3

# Timeouts
server_idle_timeout = 600
server_lifetime = 3600
client_idle_timeout = 0
query_timeout = 300

# Logging
log_connections = 0
log_disconnections = 0
log_pooler_errors = 1
stats_period = 60
```

## Common Pitfalls

**Not tuning autovacuum for write-heavy tables.** The default autovacuum settings (threshold=50, scale_factor=0.2) mean a table with 10 million rows won't vacuum until 2 million dead tuples accumulate. For high-write tables, set per-table overrides: `ALTER TABLE hot_table SET (autovacuum_vacuum_scale_factor = 0.01, autovacuum_vacuum_threshold = 1000)`. Unvacuumed tables suffer from index bloat, increased I/O from scanning dead tuples, and eventually transaction ID wraparound — a catastrophic event that forces the database into single-user mode.

**Using PgBouncer in transaction mode with session-level features.** Transaction pooling reassigns server connections between transactions, breaking any session-level state. This means prepared statements (`PREPARE`/`EXECUTE`), advisory locks, `SET` commands, `LISTEN`/`NOTIFY`, and temporary tables all fail unpredictably. Either use session mode for connections that need these features (at the cost of pooling efficiency) or redesign the application to avoid session state. Most ORMs use prepared statements by default — configure them to use protocol-level prepared statements or disable them entirely when behind PgBouncer.

**Creating GIN indexes without understanding their write amplification.** GIN indexes are excellent for read-heavy JSONB and full-text search workloads, but each insert or update to the indexed column requires updating the inverted index structure. On write-heavy tables, GIN indexes can slow inserts by 3-5x compared to B-tree. Use `fastupdate = on` (default) to batch GIN index updates into a pending list, and tune `gin_pending_list_limit` based on your read/write ratio. For tables with >50% write operations, consider GiST as an alternative (faster writes, slower reads).

**Ignoring connection overhead and not using a connection pooler.** PostgreSQL forks a new OS process for each connection, consuming approximately 10MB of memory per connection. An application with 500 direct connections wastes 5GB of RAM on connection overhead alone, and context switching between hundreds of processes degrades performance. Always deploy PgBouncer or PgPool-II in front of PostgreSQL. A typical production setup uses 50-200 server connections to handle thousands of application connections. The connection pooler also protects against connection storms during application deployments.

**Misusing CTEs as optimization barriers (pre-PostgreSQL 12 habit).** Before version 12, CTEs were always materialized — they acted as optimization fences that prevented the planner from pushing predicates into the CTE. Engineers exploited this for plan stability. Since PostgreSQL 12, non-recursive CTEs are inlined by default. If you need the old materialization behavior (for plan stability or to prevent repeated evaluation), explicitly use `WITH cte AS MATERIALIZED (...)`. Conversely, if you're on PostgreSQL 12+ and a CTE seems slow, check if materialization is being forced unnecessarily.

**Over-partitioning tables that don't need it.** Partitioning adds planning overhead — the query planner must evaluate partition pruning for every query. Tables under 10 million rows rarely benefit from partitioning. Each partition also needs its own indexes, constraints, and vacuum processes. Start with a single table and proper indexing; add partitioning only when you have clear evidence that table size is causing maintenance problems (vacuum duration, index size) or query performance issues that partitioning specifically addresses.

## Real-World Use Cases

**Geospatial ride-sharing platform.** A ride-sharing service uses PostGIS to match riders with nearby drivers in real-time. The system stores driver locations as `GEOMETRY(Point, 4326)` with a GiST spatial index, enabling sub-millisecond nearest-neighbor queries using `ORDER BY location <-> ST_SetSRID(ST_MakePoint(lng, lat), 4326) LIMIT 10`. The platform processes 50,000 location updates per second using batch inserts with `ON CONFLICT DO UPDATE`. Partitioning by city reduces index sizes and enables region-specific maintenance windows. PgBouncer handles 8,000 application connections with 150 server connections in transaction mode.

**Multi-tenant SaaS with row-level security.** A B2B analytics platform serves 5,000 tenants from a single PostgreSQL cluster. Row-level security policies enforce tenant isolation at the database level: `CREATE POLICY tenant_isolation ON analytics_data USING (tenant_id = current_setting('app.tenant_id')::int)`. The application sets the tenant context per request via `SET LOCAL app.tenant_id = ?`. This approach eliminates the risk of cross-tenant data leaks from application bugs. JSONB columns store tenant-specific custom fields without schema migrations, and GIN indexes enable efficient querying across heterogeneous attribute structures.

**Event sourcing with logical replication.** A financial services platform uses PostgreSQL as its event store, appending immutable events to a partitioned table (monthly partitions, 500 million events total). Logical replication selectively publishes events to downstream consumers: the reporting database receives all events, the fraud detection system receives only transaction events, and the notification service receives only user-facing events. This eliminates the need for a separate message broker for event distribution. The system achieves 15,000 events/second sustained write throughput with synchronous replication to one standby for durability.

**Full-text search replacing Elasticsearch.** A content management system migrated from Elasticsearch to PostgreSQL's built-in full-text search for its 2 million document corpus. Using `tsvector` columns with GIN indexes, the system achieves sub-50ms search latency for most queries. The `pg_trgm` extension enables fuzzy matching and typo tolerance with trigram similarity indexes. This eliminated an entire infrastructure component (Elasticsearch cluster), reduced operational complexity, and maintained transactional consistency between content updates and search index updates — something that required complex synchronization logic with the external search engine.

## Interview Questions

**Q: Explain PostgreSQL's MVCC implementation and why VACUUM is necessary.**

A: PostgreSQL implements MVCC by keeping multiple physical versions of each row (tuples). When a row is updated, PostgreSQL creates a new tuple with the new values and marks the old tuple's `xmax` with the updating transaction's ID. Readers with older snapshots still see the old tuple; newer transactions see the new one. DELETE similarly marks tuples as dead without physically removing them. VACUUM is necessary because these dead tuples accumulate and waste space — they bloat tables and indexes, slow sequential scans, and consume I/O. VACUUM marks dead tuple space as reusable (but doesn't return it to the OS unless VACUUM FULL). Additionally, PostgreSQL uses 32-bit transaction IDs that wrap around after ~4 billion transactions; VACUUM freezes old tuples to prevent wraparound. If VACUUM falls behind, the database eventually shuts down to prevent data corruption.

**Q: When would you choose a GIN index over a GiST index, and vice versa?**

A: GIN (Generalized Inverted Index) is optimized for values that contain multiple elements — full-text search vectors, JSONB documents, arrays, and hstore. It provides exact matches and is faster for reads but slower for writes due to the inverted index structure. GiST (Generalized Search Tree) is a balanced tree that supports approximate matches, nearest-neighbor searches, and range operations. Choose GIN when: read-heavy workload, need exact containment queries on JSONB (`@>`), or full-text search. Choose GiST when: write-heavy workload (GiST updates are cheaper), need nearest-neighbor queries (`ORDER BY ... <->` for PostGIS), range type exclusion constraints, or fuzzy text matching with pg_trgm. For JSONB specifically, GIN with `jsonb_path_ops` is 2-3x smaller and faster than default GIN for containment queries, but only supports the `@>` operator.

**Q: How does declarative partitioning improve performance and what are its limitations?**

A: Declarative partitioning splits a logical table into physical partitions based on a partition key (range, list, or hash). Performance benefits include: partition pruning eliminates irrelevant partitions from query plans (a query for January data only scans the January partition), smaller indexes per partition fit in memory better, VACUUM operates on individual partitions reducing lock contention, and old data can be dropped instantly by detaching a partition. Limitations: queries without the partition key in the WHERE clause must scan all partitions; each partition needs its own indexes (more total index maintenance); unique constraints must include the partition key; foreign keys referencing partitioned tables weren't supported until PostgreSQL 12; and the query planner adds overhead evaluating partition pruning — tables with hundreds of partitions can see planning time increase significantly. The sweet spot is 10-100 partitions with clear access patterns aligned to the partition key.

**Q: Describe a production PgBouncer configuration and explain the trade-offs between pooling modes.**

A: PgBouncer offers three modes: session (connection held for entire client session), transaction (released after each transaction), and statement (released after each statement). Transaction mode is standard for production — it provides 10-50x connection multiplexing while supporting most application patterns. A typical config: `default_pool_size=50` (server connections per database/user pair), `max_client_conn=5000`, `reserve_pool_size=5` (extra connections for burst traffic), `server_idle_timeout=600` (close idle server connections after 10 minutes). The trade-off: transaction mode breaks session-level features (prepared statements, SET commands, advisory locks, LISTEN/NOTIFY, temp tables). Statement mode offers maximum multiplexing but breaks multi-statement transactions entirely. Most applications use transaction mode with application-level workarounds for prepared statements (either disable them or use protocol-level extended query protocol).

## Production Tips

**Monitor and tune autovacuum aggressively for high-write tables.** Track `n_dead_tup` in `pg_stat_user_tables` and alert when dead tuple ratio exceeds 10% of `n_live_tup`. For tables with millions of writes per day, set per-table autovacuum parameters: `autovacuum_vacuum_cost_delay = 2ms` (default 20ms makes vacuum too slow), `autovacuum_vacuum_scale_factor = 0.01`, and increase `autovacuum_max_workers` from the default 3 to 5-8. Monitor `pg_stat_progress_vacuum` to track vacuum progress on large tables. Set up alerting on `age(datfrozenxid)` approaching 1 billion to prevent transaction ID wraparound emergencies.

**Use `pg_stat_statements` for query performance monitoring.** Enable this extension in production (`shared_preload_libraries = 'pg_stat_statements'`) to track execution statistics for every normalized query. Query it to find the top consumers: `SELECT query, calls, mean_exec_time, total_exec_time FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20`. This reveals which queries consume the most total time (high frequency × moderate latency) versus which are individually slowest. Reset statistics periodically with `pg_stat_statements_reset()` to track changes after deployments. Combine with `auto_explain` (configured with `auto_explain.log_min_duration = 100ms`) to automatically log execution plans for slow queries.

**Implement connection pooling with proper health checks and failover.** Deploy PgBouncer on each application server (sidecar pattern) rather than as a centralized proxy to eliminate the pooler as a single point of failure. Configure `server_check_query = 'SELECT 1'` with `server_check_delay = 30` to detect dead connections. For high availability, use Patroni to manage PostgreSQL failover and configure PgBouncer to follow the primary via consul or etcd service discovery. Monitor PgBouncer's `SHOW POOLS` output for `sv_active`, `sv_idle`, `cl_waiting` — if `cl_waiting` is consistently above 0, increase `default_pool_size` or optimize transaction duration.

## Related Topics

- [SQL Fundamentals](../sql-foundations/sql-fundamentals.md) — Core SQL concepts that PostgreSQL extends with advanced features like JSONB, arrays, and range types
- [SQL Performance Tuning](../sql-foundations/sql-performance-tuning.md) — General query optimization principles applied with PostgreSQL-specific tools like pg_stat_statements and EXPLAIN ANALYZE
- [Transactions and Consistency](../sql-foundations/transactions-and-consistency.md) — PostgreSQL's MVCC implementation and isolation levels in the context of broader consistency guarantees
- [Database Design Patterns](../sql-foundations/database-design-patterns.md) — Schema design approaches that leverage PostgreSQL-specific features like JSONB columns and partial indexes
