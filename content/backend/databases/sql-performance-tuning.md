# SQL Performance Tuning

## Quick Reference

- Use `EXPLAIN ANALYZE` to inspect actual execution plans, row estimates, and timing for any query
- B-tree indexes are the default and best for equality and range queries; use composite indexes with the most selective column first
- Covering indexes include all columns needed by a query, eliminating table lookups entirely (Index Only Scan)
- Partitioning splits large tables into smaller physical segments by range, list, or hash for faster scans and easier maintenance
- The query optimizer chooses between sequential scans, index scans, and bitmap scans based on table statistics and cost estimates
- Avoid `SELECT *`, implicit type conversions, and functions on indexed columns in WHERE clauses
- Keep statistics up to date with `ANALYZE` (PostgreSQL) or `UPDATE STATISTICS` (SQL Server) for accurate optimizer decisions
- Connection pooling (PgBouncer, HikariCP) prevents connection overhead from degrading throughput under load

## When to Use

SQL performance tuning is essential whenever database queries become a bottleneck in application response times or system throughput. Invest in tuning when queries exceed acceptable latency thresholds (typically 100ms for user-facing operations), when database CPU or I/O utilization is consistently high, or when slow query logs reveal repeated problematic patterns. Performance tuning is particularly critical during scaling events where data volume grows beyond what unoptimized queries can handle, during migration from monolithic to microservice architectures where database access patterns change fundamentally, and when preparing for production launches where load testing reveals query bottlenecks. Start with query plan analysis to identify the root cause before applying any optimization, as premature indexing or denormalization without understanding the actual execution path often introduces new problems rather than solving existing ones. The cost-based optimizer makes intelligent decisions when given accurate statistics and appropriate indexes, so the tuning process is primarily about providing the optimizer with the right tools and information.

## Code Examples

### Query Plan Analysis

```sql
-- PostgreSQL: EXPLAIN ANALYZE shows actual execution time and row counts
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT o.order_id, o.total_amount, c.name, c.email
FROM orders o
JOIN customers c ON o.customer_id = c.customer_id
WHERE o.order_date >= '2024-01-01'
  AND o.status = 'SHIPPED'
ORDER BY o.order_date DESC
LIMIT 50;

-- Key metrics to examine in the output:
-- 1. actual time vs estimated cost (large discrepancies = stale statistics)
-- 2. rows (estimated vs actual) - if wildly different, run ANALYZE
-- 3. Sort Method - external merge sort indicates insufficient work_mem
-- 4. Seq Scan on large tables - potential missing index
-- 5. Buffers: shared hit vs read - cache hit ratio
-- 6. Planning Time vs Execution Time - high planning time = complex query

-- Identify slow queries with pg_stat_statements
SELECT query, calls, mean_exec_time, total_exec_time,
       rows / calls AS avg_rows,
       shared_blks_hit::float / (shared_blks_hit + shared_blks_read) AS cache_hit_ratio
FROM pg_stat_statements
WHERE mean_exec_time > 100  -- queries averaging over 100ms
ORDER BY total_exec_time DESC
LIMIT 20;

-- Find missing indexes by examining sequential scans on large tables
SELECT schemaname, relname, seq_scan, seq_tup_read,
       idx_scan, n_live_tup,
       seq_tup_read / GREATEST(seq_scan, 1) AS avg_rows_per_scan
FROM pg_stat_user_tables
WHERE seq_scan > 100
  AND n_live_tup > 10000
ORDER BY seq_tup_read DESC;
```

### Indexing Strategies

```sql
-- Composite index following ESR rule: Equality, Sort, Range
-- Equality columns first, then sort columns, then range columns
CREATE INDEX idx_orders_status_date_amount
ON orders (status, order_date DESC, total_amount);

-- Covering index: includes all columns needed by the query
-- Enables Index Only Scan, avoiding heap table access entirely
CREATE INDEX idx_orders_covering
ON orders (status, order_date DESC)
INCLUDE (order_id, total_amount, customer_id);

-- Partial index: only indexes rows matching a condition
-- Dramatically smaller for queries that always filter on this condition
CREATE INDEX idx_orders_active
ON orders (customer_id, order_date DESC)
WHERE status IN ('PENDING', 'PROCESSING', 'SHIPPED');

-- Expression index: for queries applying functions to columns
CREATE INDEX idx_customers_lower_email
ON customers (LOWER(email));

-- GIN index for full-text search
CREATE INDEX idx_products_search
ON products USING gin (to_tsvector('english', name || ' ' || description));

-- BRIN index for naturally ordered data (time-series, sequential IDs)
-- Much smaller than B-tree, effective when physical order correlates with value
CREATE INDEX idx_events_created_brin
ON events USING brin (created_at) WITH (pages_per_range = 32);

-- Monitor index usage to identify unused indexes consuming resources
SELECT schemaname, relname, indexrelname,
       idx_scan, idx_tup_read, idx_tup_fetch,
       pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE idx_scan = 0 AND indexrelname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(indexrelid) DESC;
```

### Table Partitioning

```sql
-- Range partitioning by date (PostgreSQL declarative partitioning)
CREATE TABLE orders (
    order_id    BIGSERIAL,
    customer_id BIGINT NOT NULL,
    order_date  DATE NOT NULL,
    total_amount DECIMAL(10,2),
    status      VARCHAR(20),
    PRIMARY KEY (order_id, order_date)
) PARTITION BY RANGE (order_date);

-- Create quarterly partitions
CREATE TABLE orders_2024_q1 PARTITION OF orders
    FOR VALUES FROM ('2024-01-01') TO ('2024-04-01');
CREATE TABLE orders_2024_q2 PARTITION OF orders
    FOR VALUES FROM ('2024-04-01') TO ('2024-07-01');
CREATE TABLE orders_2024_q3 PARTITION OF orders
    FOR VALUES FROM ('2024-07-01') TO ('2024-10-01');
CREATE TABLE orders_2024_q4 PARTITION OF orders
    FOR VALUES FROM ('2024-10-01') TO ('2025-01-01');
CREATE TABLE orders_default PARTITION OF orders DEFAULT;

-- Hash partitioning for even distribution across shards
CREATE TABLE audit_logs (
    log_id      BIGSERIAL,
    user_id     BIGINT NOT NULL,
    action      VARCHAR(50),
    created_at  TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (log_id, user_id)
) PARTITION BY HASH (user_id);

CREATE TABLE audit_logs_p0 PARTITION OF audit_logs
    FOR VALUES WITH (MODULUS 4, REMAINDER 0);
CREATE TABLE audit_logs_p1 PARTITION OF audit_logs
    FOR VALUES WITH (MODULUS 4, REMAINDER 1);
CREATE TABLE audit_logs_p2 PARTITION OF audit_logs
    FOR VALUES WITH (MODULUS 4, REMAINDER 2);
CREATE TABLE audit_logs_p3 PARTITION OF audit_logs
    FOR VALUES WITH (MODULUS 4, REMAINDER 3);

-- Automate partition creation for future months
CREATE OR REPLACE FUNCTION create_monthly_partition()
RETURNS void AS $$
DECLARE
    partition_date DATE := date_trunc('month', NOW() + interval '1 month');
    partition_name TEXT;
    start_date TEXT;
    end_date TEXT;
BEGIN
    partition_name := 'orders_' || to_char(partition_date, 'YYYY_MM');
    start_date := to_char(partition_date, 'YYYY-MM-DD');
    end_date := to_char(partition_date + interval '1 month', 'YYYY-MM-DD');

    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF orders FOR VALUES FROM (%L) TO (%L)',
        partition_name, start_date, end_date
    );
END;
$$ LANGUAGE plpgsql;
```

### Query Optimization Techniques

```sql
-- Replace correlated subquery with JOIN + aggregation
-- BEFORE: executes subquery once per row in outer query
SELECT c.name, c.email,
    (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.customer_id) AS order_count
FROM customers c WHERE c.region = 'US';

-- AFTER: single pass with LEFT JOIN
SELECT c.name, c.email, COALESCE(o.order_count, 0) AS order_count
FROM customers c
LEFT JOIN (
    SELECT customer_id, COUNT(*) AS order_count
    FROM orders GROUP BY customer_id
) o ON o.customer_id = c.customer_id
WHERE c.region = 'US';

-- Keyset pagination instead of OFFSET for large datasets
-- BEFORE: OFFSET scans and discards rows (O(offset) per page)
SELECT * FROM orders ORDER BY order_date DESC, order_id DESC
OFFSET 100000 LIMIT 50;

-- AFTER: keyset pagination uses index efficiently (O(1) per page)
SELECT * FROM orders
WHERE (order_date, order_id) < ('2024-03-15', 987654)
ORDER BY order_date DESC, order_id DESC
LIMIT 50;

-- Batch processing to avoid long-running locks
DO $$
DECLARE
    batch_size INT := 5000;
    rows_affected INT;
BEGIN
    LOOP
        WITH batch AS (
            SELECT order_id FROM orders
            WHERE order_date < '2023-01-01' AND status != 'ARCHIVED'
            LIMIT batch_size
            FOR UPDATE SKIP LOCKED
        )
        UPDATE orders SET status = 'ARCHIVED'
        WHERE order_id IN (SELECT order_id FROM batch);

        GET DIAGNOSTICS rows_affected = ROW_COUNT;
        COMMIT;
        EXIT WHEN rows_affected = 0;
        PERFORM pg_sleep(0.1);
    END LOOP;
END $$;

-- Use materialized views for expensive aggregations
CREATE MATERIALIZED VIEW daily_revenue AS
SELECT date_trunc('day', order_date) AS day,
       COUNT(*) AS order_count,
       SUM(total_amount) AS revenue,
       AVG(total_amount) AS avg_order_value
FROM orders
WHERE status = 'completed'
GROUP BY date_trunc('day', order_date);

CREATE UNIQUE INDEX idx_daily_revenue_day ON daily_revenue (day);

-- Refresh concurrently (no lock on reads during refresh)
REFRESH MATERIALIZED VIEW CONCURRENTLY daily_revenue;
```

## Common Pitfalls

- **Stale statistics causing bad plans**: The optimizer relies on table statistics (row counts, value distributions, correlation) to estimate costs. After bulk loads, large deletes, or significant data changes, statistics become stale and the optimizer chooses suboptimal plans. Run `ANALYZE` on affected tables after major data changes, and configure `autovacuum_analyze_threshold` appropriately for high-churn tables.

- **Functions on indexed columns preventing index usage**: Applying a function to an indexed column in a WHERE clause (e.g., `WHERE YEAR(order_date) = 2024`) prevents the optimizer from using the index because it cannot match transformed values against the B-tree. Rewrite as range conditions (`WHERE order_date >= '2024-01-01' AND order_date < '2025-01-01'`) or create expression indexes.

- **N+1 query pattern from ORMs**: Object-relational mappers frequently produce N+1 queries through lazy loading, executing one query per related entity instead of a single JOIN. Always inspect generated SQL with logging enabled, use eager loading annotations (`@EntityGraph` in JPA), or write explicit JPQL with `JOIN FETCH` for known access patterns.

- **OFFSET pagination on large datasets**: Using `OFFSET 100000 LIMIT 50` requires the database to scan and discard 100,000 rows before returning 50, making deep pages progressively slower. Switch to keyset pagination using a WHERE clause with the last seen value for constant-time page access regardless of depth.

- **Over-indexing write-heavy tables**: Each index adds overhead to every INSERT, UPDATE, and DELETE operation. Tables with high write-to-read ratios suffer from excessive indexing. Audit index usage regularly and remove indexes with zero or near-zero scans. For bulk load operations, consider dropping indexes, loading data, and rebuilding indexes.

- **Implicit type conversions in WHERE clauses**: Comparing a VARCHAR column to an integer (`WHERE phone_number = 12345`) forces a full table scan because the database must convert every row's value for comparison. Ensure parameter types match column types exactly, and use explicit casts when necessary.

## Real-World Use Cases

- **E-commerce order search optimization**: A retail platform with 500 million orders experienced 8-second response times on the order history page. Analysis revealed a sequential scan due to a missing composite index on `(customer_id, order_date)`. Adding a covering index with INCLUDE columns for display fields reduced query time to 12ms. Partitioning by quarter further improved archival queries and enabled instant partition drops for GDPR data deletion requests.

- **Financial transaction reporting**: A payment processing system needed sub-second aggregation across billions of transactions for daily settlement reports. The solution combined range partitioning by transaction date with materialized views that pre-compute daily summaries. Incremental refresh during off-peak hours keeps reports current without impacting OLTP workload, while partition pruning ensures ad-hoc queries only scan relevant date ranges.

- **Multi-tenant SaaS query isolation**: A B2B platform serving 10,000 tenants on a shared database experienced noisy-neighbor problems where one tenant's analytical queries degraded performance for others. Hash partitioning by tenant_id combined with connection pool isolation and query timeout enforcement resolved contention. Partial indexes filtered by tenant_id for the largest tenants eliminated unnecessary index bloat for smaller accounts.

- **Real-time analytics dashboard**: A logistics company needed sub-200ms dashboard queries across 2 billion GPS tracking points. The solution used TimescaleDB hypertables (automatic time-based partitioning) with continuous aggregates for pre-computed hourly and daily rollups. Chunk exclusion ensures real-time queries only touch the most recent chunks, while compressed older chunks reduce storage by 90%.

## Interview Questions

**Q: How do you identify a slow query and determine the root cause?**

A: Start with the slow query log or `pg_stat_statements` to identify problematic queries by total execution time. Then use `EXPLAIN ANALYZE` to examine the actual execution plan. Look for sequential scans on large tables (missing index), large discrepancies between estimated and actual rows (stale statistics), sort operations spilling to disk (insufficient `work_mem`), nested loop joins on large result sets (missing join index), and high buffer read counts (poor cache utilization). The ratio of rows examined to rows returned indicates index effectiveness.

**Q: When would you choose not to add an index?**

A: Avoid adding indexes on tables with very high write-to-read ratios (each index adds write overhead), on columns with very low cardinality where the optimizer would choose a sequential scan anyway (e.g., a boolean column), on small tables where a full scan is faster than index traversal overhead, and when the index would duplicate coverage already provided by an existing composite index. Also avoid indexing columns that are frequently updated, as each update requires index maintenance.

**Q: Explain the difference between a clustered and non-clustered index.**

A: A clustered index determines the physical storage order of table rows (only one per table in SQL Server; PostgreSQL uses CLUSTER command). Range scans on the clustering key are extremely efficient since data is contiguous on disk. Non-clustered indexes store a separate B-tree structure with pointers back to the heap or clustered index key, requiring an additional lookup (key lookup) to retrieve non-covered columns. Covering indexes eliminate this extra lookup by including all needed columns in the index itself.

**Q: How does partitioning improve query performance?**

A: Partitioning enables partition pruning where the query planner eliminates entire partitions from scans based on WHERE clause filters on the partition key. A query filtering on `order_date = '2024-03-15'` against a monthly-partitioned table only scans one partition instead of the entire table, reducing I/O proportionally. It also enables parallel scans across partitions, simplifies data lifecycle management (dropping old partitions is instantaneous vs. deleting millions of rows), and reduces index sizes per partition improving cache efficiency.

## Production Tips

- **Monitor query plan regressions**: Use `pg_stat_statements` to track execution time trends. A query that was fast yesterday may become slow today if the optimizer switches plans due to changed statistics or data growth. Set up alerts for queries whose mean execution time increases by more than 3x from their baseline, and investigate immediately before user impact accumulates.

- **Right-size connection pools**: Set pool size to `(core_count * 2) + effective_spindle_count` as a starting point (typically 10-30 connections). Too many connections cause context switching overhead and lock contention; too few cause request queuing. Monitor pool wait time and active connection count. For PostgreSQL, use PgBouncer in transaction mode to multiplex thousands of application connections across a smaller number of database connections.

- **Automate partition maintenance**: Create future partitions ahead of time with scheduled jobs (at least one period ahead). Set up alerts for partition boundary violations and automate detaching or dropping expired partitions during low-traffic windows. Missing partitions cause INSERT failures, so proactive creation is critical for time-series workloads.

- **Index maintenance schedule**: B-tree indexes accumulate bloat from updates and deletes. Monitor index bloat with `pgstattuple` extension and schedule `REINDEX CONCURRENTLY` (PostgreSQL 12+) when bloat exceeds 30-40%. For high-write tables, consider using `pg_repack` which rebuilds indexes without holding exclusive locks, allowing continued read/write access during maintenance.

## Related Topics

- [MongoDB and Document Databases](./mongodb.md) — Comparison of document store indexing strategies with relational B-tree indexes
- [Database Design Patterns](./database-design-patterns.md) — Schema normalization and denormalization decisions that affect query performance
- [Transactions and Consistency](./transactions-and-consistency.md) — Transaction isolation levels and their performance implications
