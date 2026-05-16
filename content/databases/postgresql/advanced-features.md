# Advanced Features

PostgreSQL's advanced features transform it from a standard relational database into a versatile data platform capable of handling document storage (JSONB), search engine functionality (full-text search), time-series workloads (partitioning with BRIN indexes), geospatial analysis (PostGIS), and complex analytical queries (window functions, CTEs, LATERAL joins). These features often eliminate the need for specialized databases — a single PostgreSQL instance can replace separate deployments of Elasticsearch (for search), MongoDB (for document storage), and Redis (for certain caching patterns). The extension ecosystem is PostgreSQL's architectural superpower: extensions run inside the database process with full access to the storage engine, query planner, and index infrastructure, enabling capabilities that would require forking the database in other systems. Understanding when and how to leverage these advanced features is what separates a PostgreSQL user from a PostgreSQL expert — the difference between running a basic CRUD application and building a sophisticated data platform.

## Quick Reference

- **JSONB**: Binary JSON with GIN indexing; supports containment (`@>`), existence (`?`), path queries (`#>>`), and modification (`jsonb_set`, `||`); 10-30% storage overhead vs JSON but orders of magnitude faster for queries
- **Full-text search**: Built-in `tsvector`/`tsquery` with language-aware stemming, ranking, phrase search, and GIN/GiST indexing; eliminates need for Elasticsearch for most use cases
- **Partitioning**: Declarative RANGE/LIST/HASH partitioning with automatic partition pruning; essential for tables exceeding 100M rows or requiring efficient data lifecycle management
- **Window functions**: `ROW_NUMBER()`, `RANK()`, `LAG()`/`LEAD()`, `SUM() OVER()`, `NTILE()` — perform calculations across related rows without collapsing results like GROUP BY
- **CTEs**: `WITH` clauses for readable complex queries; recursive CTEs for hierarchical data (org charts, bill of materials); inlined by default since PostgreSQL 12
- **LATERAL joins**: Correlated subqueries in FROM clause; enables "for each row, compute X" patterns impossible with regular joins
- **PostGIS**: Spatial extension supporting geometry/geography types, spatial indexes (GiST), distance calculations, polygon containment, and routing
- **pg_cron**: Job scheduler running inside PostgreSQL; schedules SQL commands using cron syntax without external cron dependencies
- **TimescaleDB**: Time-series extension with automatic partitioning (hypertables), continuous aggregates, compression, and retention policies
- **Generated columns**: `GENERATED ALWAYS AS (expression) STORED` — automatically computed columns maintained by the database engine

## When to Use

Use JSONB when you need schema flexibility within a relational model — product attributes that vary by category, user preferences, API response caching, or event payloads with evolving schemas. JSONB excels when you query specific paths within documents (`WHERE metadata->>'region' = 'us-east'`) and need indexing support. Don't use JSONB for data that has a consistent structure across all rows — normalized columns with proper types are faster and more space-efficient.

Full-text search is appropriate when you need language-aware search with stemming, ranking, and phrase matching across text columns. It handles 90% of search use cases without Elasticsearch's operational complexity. Use it for product search, article search, documentation search, and any scenario where users type natural language queries. Consider Elasticsearch only when you need faceted search across millions of documents with sub-50ms latency, or complex analyzers for non-Latin languages.

Partitioning becomes essential when tables exceed 100M rows or when you need efficient data lifecycle management (drop old partitions instead of DELETE). Range partitioning by date is the most common pattern — each month or week becomes a partition, enabling partition pruning (queries touching only recent data skip old partitions entirely). Use LIST partitioning for multi-tenant tables (partition per tenant) and HASH partitioning for even distribution when no natural range exists.

Window functions should be used whenever you need to compute values relative to other rows in a result set: running totals, rankings, moving averages, gap detection, or comparing each row to the previous/next row. They're essential for analytics queries and often replace complex self-joins or correlated subqueries with cleaner, faster alternatives.

Use CTEs for query readability when breaking complex queries into logical steps. Use recursive CTEs for hierarchical data traversal — org charts, category trees, bill of materials, graph traversal. Since PostgreSQL 12, non-recursive CTEs are inlined (optimized as subqueries), so there's no performance penalty for using them for readability.

## Code Examples

### JSONB Operations

```sql
-- Table with JSONB for flexible product attributes
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    base_price NUMERIC(10,2) NOT NULL,
    attributes JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- GIN index for containment queries (most common pattern)
CREATE INDEX idx_products_attrs ON products USING GIN (attributes jsonb_path_ops);

-- Insert documents with varying structures
INSERT INTO products (name, category, base_price, attributes) VALUES
('MacBook Pro 16"', 'laptops', 2499.99, '{
    "specs": {"cpu": "M3 Max", "ram_gb": 36, "storage_gb": 1000},
    "display": {"size_inches": 16.2, "resolution": "3456x2234", "type": "Liquid Retina XDR"},
    "ports": ["thunderbolt4", "hdmi", "sdcard", "magsafe"],
    "weight_kg": 2.14
}'),
('Sony WH-1000XM5', 'headphones', 349.99, '{
    "specs": {"driver_mm": 30, "frequency_range": "4Hz-40kHz", "battery_hours": 30},
    "features": ["anc", "multipoint", "speak-to-chat", "ldac"],
    "colors": ["black", "silver", "midnight_blue"]
}');

-- Query: Find laptops with > 32GB RAM
SELECT name, base_price,
       attributes->'specs'->>'cpu' AS cpu,
       (attributes->'specs'->>'ram_gb')::int AS ram_gb
FROM products
WHERE category = 'laptops'
  AND (attributes->'specs'->>'ram_gb')::int > 32;

-- Query: Find products containing specific features (GIN index used)
SELECT name FROM products
WHERE attributes @> '{"features": ["anc", "ldac"]}';

-- Update nested JSONB value
UPDATE products
SET attributes = jsonb_set(attributes, '{specs,ram_gb}', '64')
WHERE name = 'MacBook Pro 16"';

-- Add new key to JSONB
UPDATE products
SET attributes = attributes || '{"on_sale": true, "discount_pct": 15}'
WHERE category = 'headphones';

-- Remove a key
UPDATE products
SET attributes = attributes - 'on_sale'
WHERE id = 2;

-- Aggregate JSONB array elements
SELECT name, jsonb_array_elements_text(attributes->'ports') AS port
FROM products
WHERE attributes ? 'ports';

-- JSONB path queries (PostgreSQL 12+)
SELECT name, jsonb_path_query(attributes, '$.specs.ram_gb') AS ram
FROM products
WHERE jsonb_path_exists(attributes, '$.specs ? (@.ram_gb > 16)');
```

### Full-Text Search

```sql
-- Add tsvector column with trigger for automatic updates
ALTER TABLE articles ADD COLUMN search_vector tsvector;

-- Populate search vector from multiple columns with weights
UPDATE articles SET search_vector =
    setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(abstract, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(body, '')), 'C');

-- GIN index for fast full-text search
CREATE INDEX idx_articles_search ON articles USING GIN (search_vector);

-- Trigger to keep search_vector updated
CREATE OR REPLACE FUNCTION articles_search_trigger() RETURNS trigger AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.abstract, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.body, '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trig_articles_search
    BEFORE INSERT OR UPDATE OF title, abstract, body ON articles
    FOR EACH ROW EXECUTE FUNCTION articles_search_trigger();

-- Search with ranking (ts_rank considers weight)
SELECT id, title,
       ts_rank(search_vector, query) AS rank,
       ts_headline('english', body, query, 'MaxWords=50, MinWords=20, StartSel=<b>, StopSel=</b>') AS snippet
FROM articles, to_tsquery('english', 'distributed & systems & !monolith') AS query
WHERE search_vector @@ query
ORDER BY rank DESC
LIMIT 20;

-- Phrase search (PostgreSQL 9.6+)
SELECT title FROM articles
WHERE search_vector @@ phraseto_tsquery('english', 'machine learning pipeline');

-- Prefix search (autocomplete)
SELECT title FROM articles
WHERE search_vector @@ to_tsquery('english', 'micro:*');

-- Fuzzy matching with pg_trgm (typo tolerance)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
SELECT title, similarity(title, 'postgrsql replicaton') AS sim
FROM articles
WHERE title % 'postgrsql replicaton'  -- trigram similarity > 0.3
ORDER BY sim DESC;
```

### Declarative Partitioning

```sql
-- Range partitioning by date (most common pattern)
CREATE TABLE events (
    id BIGSERIAL,
    event_type TEXT NOT NULL,
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tenant_id INT NOT NULL
) PARTITION BY RANGE (created_at);

-- Create monthly partitions
CREATE TABLE events_2024_01 PARTITION OF events
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE events_2024_02 PARTITION OF events
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
CREATE TABLE events_2024_03 PARTITION OF events
    FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');

-- Default partition catches rows that don't match any partition
CREATE TABLE events_default PARTITION OF events DEFAULT;

-- Indexes are created per-partition automatically
CREATE INDEX idx_events_tenant_created ON events (tenant_id, created_at DESC);
CREATE INDEX idx_events_type ON events (event_type);

-- Partition pruning in action (only scans relevant partitions)
EXPLAIN SELECT * FROM events
WHERE created_at >= '2024-02-15' AND created_at < '2024-03-01';
-- Shows: Scan only on events_2024_02, events_2024_03 pruned

-- Sub-partitioning (partition by range, then by list)
CREATE TABLE events_2024_01 PARTITION OF events
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01')
    PARTITION BY LIST (tenant_id);

-- Automated partition management with pg_partman
CREATE EXTENSION pg_partman;
SELECT partman.create_parent(
    p_parent_table := 'public.events',
    p_control := 'created_at',
    p_type := 'native',
    p_interval := '1 month',
    p_premake := 3  -- create 3 future partitions
);

-- Drop old partitions (data lifecycle management)
-- Much faster than DELETE: drops the file instantly
DROP TABLE events_2024_01;
-- Or detach first for safety (can reattach if needed)
ALTER TABLE events DETACH PARTITION events_2024_01;
```

### Window Functions

```sql
-- Running total and percentage of total
SELECT
    order_date,
    amount,
    SUM(amount) OVER (ORDER BY order_date) AS running_total,
    ROUND(amount / SUM(amount) OVER () * 100, 2) AS pct_of_total
FROM daily_sales;

-- Ranking within groups (top 3 products per category)
WITH ranked_products AS (
    SELECT
        category,
        name,
        revenue,
        ROW_NUMBER() OVER (PARTITION BY category ORDER BY revenue DESC) AS rank,
        RANK() OVER (PARTITION BY category ORDER BY revenue DESC) AS rank_with_ties,
        DENSE_RANK() OVER (PARTITION BY category ORDER BY revenue DESC) AS dense_rank
    FROM products
)
SELECT * FROM ranked_products WHERE rank <= 3;

-- LAG/LEAD: Compare to previous/next row
SELECT
    month,
    revenue,
    LAG(revenue) OVER (ORDER BY month) AS prev_month,
    revenue - LAG(revenue) OVER (ORDER BY month) AS month_over_month,
    ROUND((revenue - LAG(revenue) OVER (ORDER BY month))::numeric /
          LAG(revenue) OVER (ORDER BY month) * 100, 1) AS growth_pct
FROM monthly_revenue;

-- Moving average (7-day window)
SELECT
    date,
    daily_users,
    ROUND(AVG(daily_users) OVER (
        ORDER BY date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ), 0) AS seven_day_avg
FROM user_metrics;

-- Gap detection (find missing sequence numbers)
SELECT
    id,
    LEAD(id) OVER (ORDER BY id) AS next_id,
    LEAD(id) OVER (ORDER BY id) - id AS gap
FROM orders
WHERE LEAD(id) OVER (ORDER BY id) - id > 1;

-- NTILE: Divide into equal buckets (percentiles)
SELECT
    customer_id,
    total_spend,
    NTILE(4) OVER (ORDER BY total_spend DESC) AS spending_quartile
FROM customer_summary;

-- Frame specification: RANGE vs ROWS vs GROUPS
SELECT
    date, amount,
    -- ROWS: physical row count
    SUM(amount) OVER (ORDER BY date ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) AS sum_3_rows,
    -- RANGE: logical value range (handles ties differently)
    SUM(amount) OVER (ORDER BY date RANGE BETWEEN INTERVAL '7 days' PRECEDING AND CURRENT ROW) AS sum_7_days
FROM transactions;
```

### Recursive CTEs and LATERAL Joins

```sql
-- Recursive CTE: Organizational hierarchy
WITH RECURSIVE org_tree AS (
    -- Base case: top-level managers (no manager_id)
    SELECT id, name, title, manager_id, 1 AS depth,
           ARRAY[name] AS path
    FROM employees
    WHERE manager_id IS NULL

    UNION ALL

    -- Recursive case: employees reporting to someone in the tree
    SELECT e.id, e.name, e.title, e.manager_id, ot.depth + 1,
           ot.path || e.name
    FROM employees e
    JOIN org_tree ot ON e.manager_id = ot.id
    WHERE ot.depth < 10  -- prevent infinite recursion
)
SELECT depth, repeat('  ', depth - 1) || name AS org_chart, title
FROM org_tree
ORDER BY path;

-- Recursive CTE: Bill of materials (product components)
WITH RECURSIVE bom AS (
    SELECT part_id, component_id, quantity, 1 AS level
    FROM assemblies
    WHERE part_id = 'WIDGET-100'

    UNION ALL

    SELECT a.part_id, a.component_id, a.quantity * bom.quantity, bom.level + 1
    FROM assemblies a
    JOIN bom ON a.part_id = bom.component_id
)
SELECT component_id, SUM(quantity) AS total_needed, MAX(level) AS deepest_level
FROM bom
GROUP BY component_id;

-- LATERAL join: Top 3 recent orders per customer
SELECT c.id, c.name, recent_orders.*
FROM customers c
CROSS JOIN LATERAL (
    SELECT order_id, total_amount, created_at
    FROM orders o
    WHERE o.customer_id = c.id
    ORDER BY created_at DESC
    LIMIT 3
) AS recent_orders
WHERE c.is_active = true;

-- LATERAL with aggregation: Customer stats computed per-row
SELECT c.name, stats.*
FROM customers c
CROSS JOIN LATERAL (
    SELECT
        COUNT(*) AS order_count,
        SUM(total_amount) AS lifetime_value,
        MAX(created_at) AS last_order_date,
        AVG(total_amount) AS avg_order_value
    FROM orders
    WHERE customer_id = c.id
      AND created_at > NOW() - INTERVAL '1 year'
) AS stats
WHERE stats.order_count > 0
ORDER BY stats.lifetime_value DESC;
```

### Extensions

```sql
-- PostGIS: Geospatial queries
CREATE EXTENSION postgis;

CREATE TABLE stores (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    location GEOGRAPHY(POINT, 4326) NOT NULL
);

-- Spatial index
CREATE INDEX idx_stores_location ON stores USING GIST (location);

-- Find stores within 5km of a point
SELECT name, ST_Distance(location, ST_MakePoint(-73.9857, 40.7484)::geography) AS distance_m
FROM stores
WHERE ST_DWithin(location, ST_MakePoint(-73.9857, 40.7484)::geography, 5000)
ORDER BY distance_m;

-- pg_cron: Schedule maintenance tasks
CREATE EXTENSION pg_cron;

-- Refresh materialized view every hour
SELECT cron.schedule('refresh-dashboard', '0 * * * *',
    'REFRESH MATERIALIZED VIEW CONCURRENTLY dashboard_stats');

-- Partition maintenance: create next month's partition daily
SELECT cron.schedule('create-partitions', '0 3 * * *',
    $$SELECT partman.run_maintenance()$$);

-- Clean up old data nightly
SELECT cron.schedule('cleanup-logs', '0 2 * * *',
    $$DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days'$$);

-- TimescaleDB: Time-series data
CREATE EXTENSION timescaledb;

-- Convert regular table to hypertable (auto-partitioned by time)
CREATE TABLE metrics (
    time TIMESTAMPTZ NOT NULL,
    device_id INT NOT NULL,
    temperature DOUBLE PRECISION,
    humidity DOUBLE PRECISION
);

SELECT create_hypertable('metrics', 'time', chunk_time_interval => INTERVAL '1 day');

-- Continuous aggregate (materialized view that updates incrementally)
CREATE MATERIALIZED VIEW metrics_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS hour,
    device_id,
    AVG(temperature) AS avg_temp,
    MAX(temperature) AS max_temp,
    MIN(temperature) AS min_temp,
    COUNT(*) AS readings
FROM metrics
GROUP BY hour, device_id;

-- Compression policy (compress chunks older than 7 days)
ALTER TABLE metrics SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'device_id',
    timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('metrics', INTERVAL '7 days');

-- Retention policy (drop data older than 1 year)
SELECT add_retention_policy('metrics', INTERVAL '1 year');
```

## Common Pitfalls

**Using JSON instead of JSONB**: The `json` type stores text verbatim and must be reparsed on every access — it cannot be indexed and every query requires full document parsing. Always use `jsonb` unless you need to preserve exact formatting (whitespace, key order) of the original JSON. JSONB is binary, indexable, and supports efficient operators. The only trade-off is slightly more storage space and slower INSERT (due to parsing on write).

**Full-text search without proper weights**: Using `to_tsvector` on a single concatenated string loses the ability to weight matches by field importance. A title match should rank higher than a body match. Always use `setweight()` to assign weights (A=highest, D=lowest) to different fields, and use `ts_rank()` or `ts_rank_cd()` for relevance scoring. Without weights, a document mentioning "PostgreSQL" once in the title ranks the same as one mentioning it once in a 10,000-word body.

**Partitioning tables that are too small**: Partitioning adds query planning overhead (the planner must evaluate partition pruning for every query) and operational complexity (managing partition creation, index maintenance per partition). Don't partition tables under 10M rows — the overhead exceeds the benefit. Partitioning shines at 100M+ rows where full table scans become impractical and data lifecycle management (dropping old partitions) provides massive operational benefits.

**Window functions without proper indexing**: Window functions with `PARTITION BY` and `ORDER BY` require sorting the entire result set. Without an index matching the partition/order columns, PostgreSQL must sort in memory (or spill to disk). For frequently-executed window function queries, create an index matching the `PARTITION BY` and `ORDER BY` columns to enable index-based sorting.

**Recursive CTEs without termination conditions**: A recursive CTE without a proper termination condition (cycle detection or depth limit) will run until it exhausts memory or hits `statement_timeout`. Always include either a depth counter (`WHERE depth < 100`) or use PostgreSQL 14+'s `CYCLE` clause for automatic cycle detection. For graph traversal, track visited nodes in an array to prevent infinite loops.

**Over-relying on JSONB for relational data**: JSONB is powerful but shouldn't replace proper relational modeling. Data that is consistently structured, frequently joined, or needs referential integrity belongs in normalized columns. JSONB queries are slower than column queries (even with GIN indexes), don't support foreign keys, and make schema evolution harder to track. Use JSONB for genuinely variable attributes, not as a shortcut to avoid schema design.

## Real-World Use Cases

**Multi-tenant SaaS with JSONB configuration**: A B2B SaaS platform stores tenant-specific configuration in JSONB columns — each tenant has different feature flags, UI customizations, integration settings, and billing rules. The schema varies significantly between tenants (enterprise tenants have SSO config, small tenants don't). JSONB with GIN indexes allows efficient queries like "find all tenants with Slack integration enabled" without schema migrations when new integrations are added. They combine this with row-level security policies that filter by tenant_id, ensuring data isolation.

**E-commerce product search replacing Elasticsearch**: An online marketplace migrated from Elasticsearch to PostgreSQL full-text search for their 5M product catalog. They use weighted tsvectors (product name weight A, brand weight B, description weight C, tags weight D) with GIN indexes. Phrase search handles exact product name lookups, while trigram indexes (pg_trgm) provide typo tolerance. The result: eliminated Elasticsearch operational overhead (cluster management, index rebuilds, data synchronization) while maintaining sub-50ms search latency. They only kept Elasticsearch for faceted search on specific high-traffic category pages.

**IoT platform with TimescaleDB**: A smart building company ingests 500,000 sensor readings per second from 100,000 devices. TimescaleDB hypertables automatically partition by time (1-hour chunks), with continuous aggregates pre-computing hourly and daily rollups. Compression reduces storage by 95% for data older than 7 days. Retention policies automatically drop raw data after 30 days while keeping aggregates for 5 years. The combination of PostgreSQL's relational capabilities (device metadata, alert rules, user management) with TimescaleDB's time-series performance eliminates the need for a separate time-series database.

**Financial reporting with window functions**: A fintech company generates complex financial reports using window functions — running balances, period-over-period comparisons, percentile rankings, and moving averages. A single query computes a customer's running balance, flags transactions that deviate more than 3 standard deviations from their rolling average (fraud detection), and ranks customers by transaction volume within their segment. Previously, this required multiple queries and application-level computation; window functions reduced report generation from 45 seconds to 2 seconds.

## Interview Questions

**Q: When would you use JSONB vs a normalized relational schema in PostgreSQL?**

A: Use JSONB for genuinely variable/sparse attributes where different rows have different structures — product attributes varying by category, user preferences, event payloads with evolving schemas, or third-party API responses you need to store and query. Use normalized columns for data that is consistently structured across rows, frequently used in JOINs or WHERE clauses, needs referential integrity (foreign keys), or requires strict type enforcement. The hybrid approach is common: core relational columns for structured data (id, name, status, created_at) plus a JSONB column for flexible metadata. Key trade-offs: JSONB queries are slower than column queries even with indexes, JSONB doesn't support CHECK constraints on nested values (use application validation), and schema evolution in JSONB is invisible to database tooling.

**Q: Explain PostgreSQL's full-text search architecture. How does it compare to Elasticsearch?**

A: PostgreSQL FTS converts text to `tsvector` (sorted list of lexemes with positions) using language-specific dictionaries that handle stemming, stop words, and normalization. Queries use `tsquery` with boolean operators (&, |, !) and phrase matching (<->). GIN indexes on tsvector columns provide fast lookup. Compared to Elasticsearch: PostgreSQL FTS is simpler to operate (no separate cluster), supports ACID transactions (search is always consistent with data), and handles most search use cases adequately. Elasticsearch wins for: massive scale (billions of documents), complex analyzers (CJK languages, custom tokenizers), faceted search with aggregations, near-real-time indexing across distributed nodes, and sub-10ms latency requirements at scale. Choose PostgreSQL FTS when search is a feature of your application; choose Elasticsearch when search IS your application.

**Q: How does declarative partitioning work in PostgreSQL? What are the performance implications?**

A: Declarative partitioning splits a logical table into physical partitions based on a partition key (RANGE, LIST, or HASH). The query planner performs partition pruning — eliminating partitions that cannot contain matching rows based on WHERE clause conditions. For a time-partitioned table with 60 monthly partitions, a query filtering on `created_at > '2024-01-01'` only scans relevant partitions, not all 60. Performance benefits: smaller indexes per partition (fit in memory), efficient bulk deletion (DROP partition vs DELETE), parallel scans across partitions, and better vacuum performance (each partition vacuumed independently). Costs: slightly higher planning time, partition-wise joins require matching partition schemes, unique constraints must include the partition key, and foreign keys referencing partitioned tables have limitations.

**Q: What are LATERAL joins and when are they more appropriate than regular subqueries?**

A: LATERAL allows a subquery in the FROM clause to reference columns from preceding tables — essentially a correlated subquery that returns multiple rows/columns. Use LATERAL when you need "for each row in table A, compute something from table B" patterns: top-N per group (top 3 orders per customer), set-returning functions that depend on outer row values, or complex aggregations that vary per row. Without LATERAL, you'd need window functions (which can't LIMIT per group) or multiple queries in application code. LATERAL is more readable than equivalent window function approaches for top-N queries and more efficient than correlated subqueries because the planner can choose optimal join strategies. The key insight: LATERAL turns a subquery into a parameterized function called once per outer row.

**Q: How would you implement a job scheduling system using pg_cron and what are its limitations?**

A: pg_cron runs scheduled SQL commands inside PostgreSQL using cron syntax. Implementation: create a jobs table tracking scheduled tasks, use pg_cron to trigger a dispatcher function that picks up pending jobs and executes them. Advantages: no external scheduler dependency, jobs run in the same transaction context as the database, and scheduling survives application restarts. Limitations: pg_cron runs only on one node (the primary in a replicated setup), has no built-in retry logic or dead-letter queue, cannot schedule sub-minute intervals, and jobs that fail silently unless you implement logging. For production, combine pg_cron with a jobs table that tracks execution status, implements retry with exponential backoff, and alerts on failures. For complex workflows requiring DAGs, dependencies, or distributed execution, use a dedicated scheduler (Airflow, Temporal) instead.

## Production Tips

**Use materialized views with CONCURRENTLY refresh for dashboards**: Materialized views pre-compute expensive aggregations, but `REFRESH MATERIALIZED VIEW` locks the view during refresh (reads block). Use `REFRESH MATERIALIZED VIEW CONCURRENTLY` to refresh without blocking reads — it builds a new version and swaps atomically. Requires a unique index on the materialized view. Schedule refreshes with pg_cron at appropriate intervals (every 5 minutes for near-real-time dashboards, hourly for reports).

**Implement JSONB schema validation at the application layer**: PostgreSQL doesn't enforce JSONB structure natively (no JSON Schema validation in CHECK constraints before PostgreSQL 17). Implement validation in your application layer or use a trigger function that validates JSONB structure on INSERT/UPDATE. Document expected JSONB schemas in code comments or a schema registry. Consider using `jsonb_typeof()` and path existence checks in CHECK constraints for critical fields: `CHECK (attributes ? 'required_field' AND jsonb_typeof(attributes->'required_field') = 'string')`.

**Monitor partition count and plan ahead**: Each partition adds planning overhead. Tables with 1,000+ partitions can have noticeably slower query planning (10-50ms overhead). Plan partition granularity based on query patterns and data volume — monthly partitions for most time-series data, daily only if you need to drop data daily. Use pg_partman for automated partition creation and ensure future partitions are pre-created (avoid INSERT failures when the next partition doesn't exist).

**Combine full-text search with trigram for best UX**: Use tsvector/GIN for primary search (fast, language-aware) and pg_trgm as a fallback for typo tolerance. First query with `@@` (full-text match); if no results, fall back to trigram similarity (`%` operator). This gives users the best experience: exact and stemmed matches rank highest, while misspelled queries still return relevant results. Index both: GIN on tsvector for FTS, GIN with gin_trgm_ops for similarity.

## Related Topics

- [PostgreSQL Deep Dive](./postgresql.md) — Core PostgreSQL concepts, MVCC, and foundational indexing
- [Performance Tuning](./performance-tuning.md) — EXPLAIN ANALYZE, index strategies, and query optimization
- [Replication and High Availability](./replication-and-ha.md) — Streaming replication, Patroni, and failover
- [SQL Design Patterns](../sql-foundations/database-design-patterns.md) — Schema design patterns complementing PostgreSQL features
- [SQL Fundamentals](../sql-foundations/sql-fundamentals.md) — Core SQL knowledge underlying advanced PostgreSQL features
