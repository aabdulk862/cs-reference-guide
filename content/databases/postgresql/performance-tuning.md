# Performance Tuning

PostgreSQL performance tuning is a systematic discipline that combines query analysis (EXPLAIN ANALYZE), strategic indexing, configuration optimization, and ongoing maintenance (VACUUM, ANALYZE) to achieve consistent sub-millisecond response times under production workloads. Unlike simpler databases where "add an index" solves most problems, PostgreSQL's sophisticated query planner requires understanding cost estimation, statistics collection, and the interaction between shared_buffers, work_mem, and the operating system's page cache. The pg_stat_statements extension is the single most important tool for production PostgreSQL performance — it tracks execution statistics for every normalized query, revealing which queries consume the most total time, which have the worst per-execution performance, and which are called most frequently. Effective PostgreSQL tuning follows a data-driven approach: identify the problem queries using pg_stat_statements, understand their execution plans with EXPLAIN (ANALYZE, BUFFERS, TIMING), create targeted indexes or rewrite queries, and verify improvement with before/after metrics.

## Quick Reference

- **EXPLAIN ANALYZE**: Executes the query and shows actual vs estimated rows, execution time per node, buffer hits/reads, and sort/hash memory usage
- **Index types**: B-tree (default, equality/range/sorting), GIN (full-text/JSONB/arrays), GiST (geometric/range/nearest-neighbor), BRIN (large sequential/time-series), Hash (equality-only)
- **pg_stat_statements**: Tracks query execution statistics; `total_exec_time`, `calls`, `mean_exec_time`, `rows`, `shared_blks_hit/read` per normalized query
- **VACUUM**: Reclaims dead tuples from MVCC; VACUUM FULL rewrites the table (locks it); autovacuum handles routine maintenance but needs tuning for write-heavy tables
- **ANALYZE**: Updates table statistics (row counts, value distributions, most common values, histograms) used by the query planner for cost estimation
- **shared_buffers**: PostgreSQL's buffer cache; typically 25% of RAM (max ~8-16GB due to diminishing returns); remainder used by OS page cache
- **work_mem**: Per-operation memory for sorts and hash joins; set conservatively globally (32-256MB), increase per-session for complex analytics queries
- **effective_cache_size**: Hint to planner about total available cache (shared_buffers + OS cache); typically 75% of RAM; affects index vs sequential scan decisions
- **Partial indexes**: Index only rows matching a WHERE condition; dramatically smaller for selective queries on large tables
- **Index-only scans**: When all required columns are in the index (or INCLUDE clause), PostgreSQL reads only the index, skipping the heap entirely

## When to Use

Performance tuning should begin with measurement, not guessing. Use pg_stat_statements to identify the top queries by total execution time — these represent the highest-impact optimization targets. A query called 10,000 times per second at 5ms each contributes more total load than a query called once per hour at 30 seconds. Focus on total_exec_time first, then mean_exec_time for latency-sensitive paths.

Use EXPLAIN ANALYZE when you've identified a slow query and need to understand why it's slow. Look for sequential scans on large tables (missing index), nested loop joins with high row estimates (missing statistics or bad join order), sort operations spilling to disk (insufficient work_mem), and large differences between estimated and actual rows (stale statistics requiring ANALYZE).

Index tuning is appropriate when EXPLAIN shows sequential scans on tables with selective WHERE clauses, or when sort operations could be eliminated by an ordered index. Create partial indexes when queries consistently filter on a specific condition (e.g., `WHERE status = 'active'` on a table where 95% of rows are archived). Use covering indexes (INCLUDE clause) when you need index-only scans for frequently-executed queries.

VACUUM tuning is critical for write-heavy tables. Default autovacuum settings (vacuum after 20% dead tuples) are too conservative for tables with millions of rows — a 100M row table won't vacuum until 20M dead tuples accumulate. Set per-table autovacuum thresholds for high-write tables: `autovacuum_vacuum_scale_factor = 0.01` or use `autovacuum_vacuum_threshold` with a fixed count.

Configuration tuning (shared_buffers, work_mem, effective_io_concurrency) should be done once during initial deployment and revisited when hardware changes or workload patterns shift significantly. Don't micro-tune configuration parameters — the biggest gains come from query optimization and indexing.

## Code Examples

### EXPLAIN ANALYZE Deep Dive

```sql
-- Full diagnostic EXPLAIN with all options
EXPLAIN (ANALYZE, BUFFERS, TIMING, VERBOSE, FORMAT TEXT)
SELECT o.order_id, o.total_amount, c.name, c.email
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.status = 'PENDING'
  AND o.created_at > NOW() - INTERVAL '7 days'
ORDER BY o.created_at DESC
LIMIT 50;

-- Example output analysis:
-- Limit  (cost=0.87..152.34 rows=50 width=86) (actual time=0.089..0.234 rows=50 loops=1)
--   Buffers: shared hit=156
--   ->  Nested Loop  (cost=0.87..4521.23 rows=1489 width=86) (actual time=0.087..0.228 rows=50 loops=1)
--         Buffers: shared hit=156
--         ->  Index Scan Backward using idx_orders_pending_created
--               on orders o  (cost=0.43..2145.67 rows=1489 width=48)
--               (actual time=0.045..0.098 rows=50 loops=1)
--               Index Cond: (created_at > (now() - '7 days'::interval))
--               Filter: (status = 'PENDING')
--               Buffers: shared hit=55
--         ->  Index Scan using customers_pkey on customers c  (cost=0.43..1.59 rows=1 width=42)
--               (actual time=0.002..0.002 rows=1 loops=50)
--               Index Cond: (id = o.customer_id)
--               Buffers: shared hit=101

-- KEY METRICS TO CHECK:
-- 1. actual rows vs estimated rows (large differences = stale statistics)
-- 2. shared hit vs shared read (reads = cache misses = disk I/O)
-- 3. Sort Method: external merge (= spilling to disk, increase work_mem)
-- 4. Rows Removed by Filter (= index not selective enough)
```

### Strategic Index Creation

```sql
-- Composite index matching common query patterns (leftmost prefix rule applies)
CREATE INDEX idx_orders_customer_status_date
ON orders (customer_id, status, created_at DESC);
-- Supports: WHERE customer_id = X
--           WHERE customer_id = X AND status = Y
--           WHERE customer_id = X AND status = Y ORDER BY created_at DESC

-- Partial index for active records (95% of queries filter on active)
CREATE INDEX idx_users_active_email ON users (email)
WHERE is_active = true AND deleted_at IS NULL;
-- Index size: ~5% of full index if only 5% of users are active

-- Covering index for index-only scans (avoids heap access entirely)
CREATE INDEX idx_products_category_covering
ON products (category_id, price)
INCLUDE (name, sku, stock_quantity);
-- SELECT name, sku, price FROM products WHERE category_id = 5 AND price < 100
-- → Index Only Scan (no heap access needed)

-- GIN index for JSONB containment queries
CREATE INDEX idx_events_payload ON events USING GIN (payload jsonb_path_ops);
-- jsonb_path_ops: smaller index, supports @> operator only (not ? or ?|)
-- Default GIN ops: larger index, supports all JSONB operators

-- BRIN index for time-series data (tiny index, huge tables)
CREATE INDEX idx_logs_timestamp ON application_logs USING BRIN (created_at)
WITH (pages_per_range = 64);
-- BRIN stores min/max per block range; effective when data is physically ordered
-- 1TB table: B-tree index = ~20GB, BRIN index = ~1MB

-- Expression index for case-insensitive lookups
CREATE INDEX idx_users_email_lower ON users (LOWER(email));
-- Query must use LOWER(email) = 'user@example.com' to hit this index

-- Index for pattern matching (trigram)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_products_name_trgm ON products USING GIN (name gin_trgm_ops);
-- Supports: WHERE name LIKE '%search%' and WHERE name % 'fuzzy'
```

### pg_stat_statements Analysis

```sql
-- Enable pg_stat_statements (requires restart for shared_preload_libraries)
-- postgresql.conf:
-- shared_preload_libraries = 'pg_stat_statements'
-- pg_stat_statements.track = all
-- pg_stat_statements.max = 10000

CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Top 20 queries by total execution time (highest impact)
SELECT
    substring(query, 1, 100) AS short_query,
    calls,
    round(total_exec_time::numeric, 2) AS total_ms,
    round(mean_exec_time::numeric, 2) AS avg_ms,
    round((100 * total_exec_time / sum(total_exec_time) OVER())::numeric, 2) AS pct_total,
    rows,
    round((shared_blks_hit::numeric / NULLIF(shared_blks_hit + shared_blks_read, 0) * 100), 2) AS cache_hit_pct
FROM pg_stat_statements
WHERE userid = (SELECT usesysid FROM pg_user WHERE usename = current_user)
ORDER BY total_exec_time DESC
LIMIT 20;

-- Queries with worst cache hit ratio (I/O bound)
SELECT
    substring(query, 1, 80) AS short_query,
    calls,
    shared_blks_read,
    shared_blks_hit,
    round((shared_blks_hit::numeric / NULLIF(shared_blks_hit + shared_blks_read, 0) * 100), 2) AS hit_ratio
FROM pg_stat_statements
WHERE calls > 100
  AND shared_blks_hit + shared_blks_read > 1000
ORDER BY hit_ratio ASC
LIMIT 20;

-- Queries with high row estimation errors (need ANALYZE)
SELECT
    substring(query, 1, 80) AS short_query,
    calls,
    rows / NULLIF(calls, 0) AS avg_rows_returned,
    round(mean_exec_time::numeric, 2) AS avg_ms
FROM pg_stat_statements
WHERE calls > 50
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Reset statistics (do this periodically to get fresh data)
SELECT pg_stat_statements_reset();
```

### VACUUM and Autovacuum Tuning

```sql
-- Check table bloat and dead tuple counts
SELECT
    schemaname, relname,
    n_live_tup, n_dead_tup,
    round(n_dead_tup::numeric / NULLIF(n_live_tup + n_dead_tup, 0) * 100, 2) AS dead_pct,
    last_vacuum, last_autovacuum, last_analyze, last_autoanalyze,
    vacuum_count, autovacuum_count
FROM pg_stat_user_tables
WHERE n_dead_tup > 10000
ORDER BY n_dead_tup DESC;

-- Per-table autovacuum tuning for high-write tables
ALTER TABLE orders SET (
    autovacuum_vacuum_scale_factor = 0.01,      -- vacuum at 1% dead tuples (vs default 20%)
    autovacuum_vacuum_threshold = 1000,          -- minimum dead tuples before considering vacuum
    autovacuum_analyze_scale_factor = 0.005,     -- analyze at 0.5% changes
    autovacuum_vacuum_cost_delay = 2,            -- less throttling (default 2ms, set to 0 for aggressive)
    autovacuum_vacuum_cost_limit = 1000          -- higher budget per round (default 200)
);

-- Check if autovacuum is keeping up
SELECT
    relname,
    n_dead_tup,
    last_autovacuum,
    EXTRACT(EPOCH FROM (now() - last_autovacuum)) / 3600 AS hours_since_vacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 100000
ORDER BY n_dead_tup DESC;

-- Monitor autovacuum workers
SELECT pid, datname, relid::regclass AS table_name,
       phase, heap_blks_total, heap_blks_scanned, heap_blks_vacuumed,
       index_vacuum_count, max_dead_tuples
FROM pg_stat_progress_vacuum;

-- Identify tables needing VACUUM FULL (extreme bloat)
-- WARNING: VACUUM FULL locks the table exclusively
SELECT
    schemaname || '.' || relname AS table_name,
    pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
    pg_size_pretty(pg_relation_size(relid)) AS table_size,
    n_live_tup,
    n_dead_tup
FROM pg_stat_user_tables
WHERE pg_relation_size(relid) > 1073741824  -- tables > 1GB
ORDER BY pg_relation_size(relid) DESC;
```

### Configuration Tuning

```sql
-- Memory configuration for a 64GB RAM, 16-core server
-- postgresql.conf

-- Buffer cache: 25% of RAM
-- shared_buffers = '16GB'

-- Planner hint: total cache available (shared_buffers + OS cache)
-- effective_cache_size = '48GB'

-- Per-operation sort/hash memory (careful: multiplied by concurrent operations)
-- work_mem = '256MB'              -- for analytics; use 32-64MB for OLTP
-- maintenance_work_mem = '2GB'    -- for VACUUM, CREATE INDEX, ALTER TABLE

-- WAL configuration
-- wal_buffers = '64MB'
-- checkpoint_completion_target = 0.9
-- max_wal_size = '4GB'
-- min_wal_size = '1GB'

-- Parallelism (16 cores)
-- max_parallel_workers_per_gather = 4
-- max_parallel_workers = 8
-- max_parallel_maintenance_workers = 4
-- parallel_tuple_cost = 0.01
-- parallel_setup_cost = 100

-- I/O configuration (NVMe SSD)
-- effective_io_concurrency = 200
-- random_page_cost = 1.1          -- SSD: nearly same as seq (default 4.0 is for HDD)
-- seq_page_cost = 1.0

-- Connection and process limits
-- max_connections = 200           -- use PgBouncer for more
-- huge_pages = try                -- reduce TLB misses for large shared_buffers

-- Verify current settings
SHOW shared_buffers;
SHOW work_mem;
SHOW effective_cache_size;

-- Check buffer cache hit ratio (should be > 99% for OLTP)
SELECT
    sum(heap_blks_hit) AS heap_hits,
    sum(heap_blks_read) AS heap_reads,
    round(sum(heap_blks_hit)::numeric / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0) * 100, 2) AS hit_ratio
FROM pg_statio_user_tables;
```

## Common Pitfalls

**Over-indexing tables**: Every index adds write overhead (INSERT/UPDATE/DELETE must maintain all indexes) and consumes disk space and memory. A table with 15 indexes will have significantly slower writes. Audit indexes regularly using `pg_stat_user_indexes` — indexes with `idx_scan = 0` over a month are candidates for removal. Each unused index wastes space in shared_buffers and slows down VACUUM.

**Setting work_mem too high globally**: work_mem is allocated per-sort-operation per-query, not per-connection. A complex query with 5 sort/hash operations and `work_mem = 1GB` could use 5GB. With 100 concurrent connections, that's potentially 500GB — far exceeding available RAM. Set work_mem conservatively globally (32-64MB for OLTP) and increase per-session for specific analytics queries: `SET LOCAL work_mem = '1GB'` within a transaction.

**Ignoring statistics staleness**: The query planner relies on `pg_statistic` for row count estimates, value distributions, and correlation data. If statistics are stale (table changed significantly since last ANALYZE), the planner makes bad decisions — choosing nested loops when hash joins are better, or sequential scans when index scans are faster. Run `ANALYZE` after bulk loads, and tune `autovacuum_analyze_scale_factor` for tables with frequent updates.

**Creating indexes without CONCURRENTLY**: `CREATE INDEX` locks the table against writes for the entire build duration. On a 100GB table, this could mean 30+ minutes of downtime. Always use `CREATE INDEX CONCURRENTLY` in production — it takes longer but allows concurrent writes. Note: CONCURRENTLY cannot run inside a transaction and may leave invalid indexes if it fails (check `pg_index.indisvalid`).

**Misunderstanding EXPLAIN cost numbers**: EXPLAIN's cost values are arbitrary units, not milliseconds. `cost=0.00..1234.56` means startup cost of 0 and total cost of 1234.56 in planner units. These are useful for comparing plans but meaningless in absolute terms. Always use `EXPLAIN ANALYZE` to see actual execution times. Also, EXPLAIN ANALYZE actually executes the query — don't run it on destructive statements without wrapping in a transaction and rolling back.

**Not using connection pooling**: Each PostgreSQL connection forks a backend process consuming ~10MB of RSS memory. With 1,000 direct connections, that's 10GB just for connection overhead, plus context-switching costs. Applications using connection-per-request patterns (common in PHP, short-lived serverless functions) should always use PgBouncer. Even with connection pools in the application (HikariCP, etc.), PgBouncer provides an additional layer of protection against connection storms.

**Neglecting index maintenance**: B-tree indexes can become bloated over time as pages split and are never reclaimed. Monitor index size relative to table size using `pg_relation_size()`. If an index is significantly larger than expected, `REINDEX CONCURRENTLY` rebuilds it without locking. Also, after bulk deletes, indexes retain entries for dead tuples until VACUUM marks them as reusable — run VACUUM before expecting index performance to improve after large deletes.

## Real-World Use Cases

**High-frequency trading platform query optimization**: A fintech company processing 50,000 orders per second identified through pg_stat_statements that their order matching query consumed 40% of total database CPU. EXPLAIN ANALYZE revealed a hash join on a 500M-row trades table with poor row estimates (estimated 100 rows, actual 50,000). Running ANALYZE on the trades table with increased `default_statistics_target = 1000` for the relevant columns fixed the estimate. They also added a partial index on `trades(symbol, price) WHERE status = 'OPEN'` reducing the query from 45ms to 0.3ms. Combined with covering indexes to enable index-only scans, they achieved 99th percentile latency under 1ms.

**E-commerce catalog search optimization**: An online marketplace with 50M products found their search queries degrading as the catalog grew. pg_stat_statements showed the product search query averaging 800ms. The issue: a sequential scan on the products table with multiple LIKE conditions. Solution: installed pg_trgm extension, created GIN trigram indexes on product name and description, and rewrote queries to use similarity operators. Added a composite BRIN index on `(category_id, created_at)` for category browsing (table was naturally ordered by insertion time). Result: search latency dropped to 15ms, category browsing to 3ms.

**SaaS platform autovacuum tuning**: A multi-tenant SaaS platform noticed increasing query latency over time, with periodic "spikes" during autovacuum runs. Investigation revealed their largest table (500M rows, 200GB) had default autovacuum settings — it wouldn't vacuum until 100M dead tuples accumulated, then the vacuum would run for hours, competing with production queries for I/O. Solution: set per-table `autovacuum_vacuum_scale_factor = 0.005` (vacuum at 2.5M dead tuples), increased `autovacuum_vacuum_cost_limit = 2000` for faster completion, and set `autovacuum_max_workers = 6`. Vacuum runs became frequent but short (minutes instead of hours), eliminating the latency spikes.

## Interview Questions

**Q: How do you identify and fix a slow query in PostgreSQL? Walk through your systematic approach.**

A: Start with pg_stat_statements to identify the query by total_exec_time (highest impact) or mean_exec_time (worst latency). Then run `EXPLAIN (ANALYZE, BUFFERS)` to see the actual execution plan. Look for: sequential scans on large tables (add an index), large differences between estimated and actual rows (run ANALYZE or increase statistics_target), sorts spilling to disk (increase work_mem for that session), and nested loops with high loop counts (consider hash or merge joins by adjusting join_collapse_limit or rewriting the query). After creating an index, verify with EXPLAIN that the planner uses it. Monitor pg_stat_statements after the fix to confirm improvement in production, not just in isolation.

**Q: Explain the difference between B-tree, GIN, GiST, and BRIN indexes. When would you use each?**

A: B-tree is the default, supporting equality, range, sorting, and prefix LIKE queries — use for most columns in WHERE/ORDER BY/JOIN clauses. GIN (Generalized Inverted Index) indexes individual elements within composite values — use for full-text search (tsvector), JSONB containment queries (@>), array element queries, and trigram similarity. GiST (Generalized Search Tree) supports geometric operations, range type overlaps, and nearest-neighbor searches — use for PostGIS spatial queries, range exclusion constraints, and KNN lookups. BRIN (Block Range Index) stores min/max summaries per block range — use for very large tables where data is physically ordered (time-series, append-only logs). BRIN indexes are tiny (MBs vs GBs for B-tree) but only effective when physical row order correlates with the indexed column.

**Q: What is the difference between VACUUM and VACUUM FULL? When would you use each?**

A: VACUUM marks dead tuples as reusable space within existing pages but doesn't return space to the OS or shrink the table file. It runs concurrently with reads and writes (no exclusive lock). VACUUM FULL rewrites the entire table to a new file, eliminating all bloat and returning space to the OS, but requires an exclusive lock for the entire duration (no reads or writes). Use regular VACUUM (via autovacuum) for routine maintenance — it's fast and non-blocking. Use VACUUM FULL only when a table has extreme bloat (e.g., after deleting 90% of rows) and you need to reclaim disk space. In production, prefer `pg_repack` over VACUUM FULL — it achieves the same result without an exclusive lock by creating a new copy and swapping atomically.

**Q: How does PostgreSQL's query planner decide between a sequential scan and an index scan?**

A: The planner estimates the total cost of each access method using statistics from pg_statistic and configuration parameters. For an index scan, it estimates: index page reads + heap page reads (for non-covering indexes) + CPU processing. For a sequential scan: total table pages read sequentially + CPU filtering. Key factors: selectivity (what fraction of rows match the WHERE clause), `random_page_cost` vs `seq_page_cost` (random I/O is 4x more expensive on HDD, nearly equal on SSD), table size, and correlation (how well physical row order matches index order — high correlation makes index scans cheaper because sequential heap access is likely). If the query returns more than ~5-20% of the table, a sequential scan is usually cheaper because sequential I/O is faster than random I/O, even with an index available.

**Q: How would you tune autovacuum for a table receiving 100,000 updates per second?**

A: Default autovacuum triggers at 20% dead tuples, which for a 100M-row table means 20M dead tuples before vacuum starts — unacceptable for a high-write table. Set per-table parameters: `autovacuum_vacuum_scale_factor = 0.01` (1% = 1M dead tuples trigger), `autovacuum_vacuum_threshold = 50000`, `autovacuum_vacuum_cost_delay = 0` (no throttling — vacuum as fast as possible), `autovacuum_vacuum_cost_limit = 2000`. Also increase `autovacuum_max_workers` globally to 6-8 so this table's vacuum doesn't block other tables. Monitor with `pg_stat_user_tables.n_dead_tup` and ensure dead tuple count stays below 5% of live tuples. Consider partitioning the table by time so old partitions have minimal write activity and vacuum completes quickly.

## Production Tips

**Establish a query performance baseline**: After deploying pg_stat_statements, let it collect data for a full business cycle (typically one week). Export the top 50 queries by total_exec_time as your baseline. Set up weekly automated reports comparing current performance to baseline — any query whose mean_exec_time increases by more than 50% should trigger investigation. This catches performance regressions from schema changes, data growth, or statistics drift before users notice.

**Use pg_stat_statements for capacity planning**: Track the growth rate of total_exec_time across all queries. If total database CPU time is growing 10% monthly while traffic grows 5% monthly, you have a query efficiency problem that will eventually require hardware scaling. Address it proactively by optimizing the top queries rather than reactively adding hardware.

**Monitor index usage and bloat**: Query `pg_stat_user_indexes` weekly to find unused indexes (idx_scan = 0). Each unused index wastes write I/O, disk space, and shared_buffers memory. Also monitor index size vs table size — if an index is larger than the table it indexes, it's likely bloated and needs `REINDEX CONCURRENTLY`. Automate this monitoring with a scheduled job that alerts when indexes exceed expected size ratios.

**Configure huge pages for large shared_buffers**: When shared_buffers exceeds 8GB, the number of page table entries becomes significant (2M entries for 8GB with 4KB pages). Enable huge pages (`huge_pages = try` in postgresql.conf, configure OS with `vm.nr_hugepages`) to reduce TLB misses by 1000x. This can improve throughput by 5-15% for memory-intensive workloads. Verify with `grep HugePages /proc/meminfo` that pages are actually allocated.

## Related Topics

- [PostgreSQL Deep Dive](./postgresql.md) — Core PostgreSQL concepts, MVCC architecture, and data types
- [Replication and High Availability](./replication-and-ha.md) — Streaming replication, Patroni, and PgBouncer configuration
- [Advanced Features](./advanced-features.md) — JSONB, full-text search, partitioning, and extensions
- [SQL Performance Tuning](../sql-foundations/sql-performance-tuning.md) — General SQL optimization principles and patterns
- [SQL Design Patterns](../sql-foundations/database-design-patterns.md) — Schema design patterns that impact query performance
