# SQL Fundamentals

Structured Query Language remains the dominant interface for relational database management systems after more than four decades of production use. Every major RDBMS — PostgreSQL, MySQL, Oracle, SQL Server, and SQLite — implements the SQL standard with vendor-specific extensions, but the core language semantics are portable across engines. Senior engineers must internalize not just the syntax but the declarative execution model: you describe *what* data you want, and the query optimizer determines *how* to retrieve it. Understanding this separation between logical intent and physical execution is what distinguishes engineers who write correct queries from those who write performant ones. SQL operates across three distinct sublanguages — DDL for schema definition, DML for data manipulation, and DCL for access control — each with different transactional semantics and operational implications. Mastery of joins, subqueries, aggregations, and set operations forms the foundation upon which advanced topics like window functions, recursive CTEs, and query optimization are built.

## Quick Reference

- **DDL** (Data Definition Language): `CREATE`, `ALTER`, `DROP`, `TRUNCATE` — defines schema objects; most engines auto-commit DDL statements
- **DML** (Data Manipulation Language): `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `MERGE` — manipulates data within transactions
- **DCL** (Data Control Language): `GRANT`, `REVOKE`, `DENY` — controls access permissions at table, column, or row level
- JOIN order in the FROM clause does not determine execution order; the optimizer reorders joins based on statistics and cost estimates
- `NULL` is not a value but a marker for missing information; any comparison with NULL yields UNKNOWN, not TRUE or FALSE
- `GROUP BY` logically executes before `SELECT`, so column aliases defined in SELECT cannot be referenced in GROUP BY (except in MySQL)
- Set operations (`UNION`, `INTERSECT`, `EXCEPT`) operate on the entire result set and require compatible column types and counts
- Correlated subqueries execute once per row of the outer query, making them O(n×m) in the worst case without optimizer rewrites
- Materialized views store precomputed results physically, trading storage and staleness for read performance
- Triggers fire automatically on DML events and execute within the same transaction as the triggering statement

## When to Use

SQL fundamentals apply whenever you interact with a relational database, which covers the vast majority of transactional systems in production. You need solid SQL skills when designing schemas for new services, writing data access layers, building reporting queries, debugging slow queries in production, and migrating data between systems. These fundamentals are especially critical during system design interviews where candidates must demonstrate they can model relationships correctly, write efficient joins across normalized tables, and reason about query execution without running the query. Engineers working with ORMs still need raw SQL knowledge because ORMs generate SQL — and when the generated queries perform poorly or produce incorrect results, you need to read and rewrite the underlying SQL. Data pipeline engineers use SQL for ETL transformations, analytics engineers use it for dimensional modeling, and backend engineers use it for CRUD operations, aggregations, and batch processing. Even in systems that primarily use NoSQL stores, SQL often appears in the analytics layer, audit systems, or configuration databases.

## Code Examples

### Joins and Set Operations

```sql
-- INNER JOIN: returns only matching rows from both tables
SELECT e.employee_id, e.name, d.department_name, m.name AS manager_name
FROM employees e
INNER JOIN departments d ON e.department_id = d.department_id
LEFT JOIN employees m ON e.manager_id = m.employee_id
WHERE d.active = TRUE;

-- Self-join: find employees who earn more than their manager
SELECT e.name AS employee, e.salary AS emp_salary,
       m.name AS manager, m.salary AS mgr_salary
FROM employees e
INNER JOIN employees m ON e.manager_id = m.employee_id
WHERE e.salary > m.salary;

-- FULL OUTER JOIN: all rows from both tables, NULLs where no match
SELECT c.customer_id, c.name, o.order_id, o.total
FROM customers c
FULL OUTER JOIN orders o ON c.customer_id = o.customer_id;

-- CROSS JOIN: cartesian product, useful for generating date ranges
SELECT d.date, p.product_id
FROM generate_series('2024-01-01'::date, '2024-12-31'::date, '1 day') AS d(date)
CROSS JOIN products p
WHERE p.track_daily_inventory = TRUE;

-- UNION removes duplicates; UNION ALL preserves them (faster)
SELECT customer_id, email FROM active_customers
UNION ALL
SELECT customer_id, email FROM churned_customers;

-- EXCEPT: customers who placed orders but never left a review
SELECT customer_id FROM orders
EXCEPT
SELECT customer_id FROM reviews;

-- INTERSECT: customers who both ordered AND reviewed
SELECT customer_id FROM orders
INTERSECT
SELECT customer_id FROM reviews;
```

### Subqueries, CTEs, and Window Functions

```sql
-- Correlated subquery: find each department's highest-paid employee
SELECT e.name, e.salary, e.department_id
FROM employees e
WHERE e.salary = (
    SELECT MAX(e2.salary)
    FROM employees e2
    WHERE e2.department_id = e.department_id
);

-- Equivalent using window function (typically more efficient)
SELECT name, salary, department_id
FROM (
    SELECT name, salary, department_id,
           RANK() OVER (PARTITION BY department_id ORDER BY salary DESC) AS rnk
    FROM employees
) ranked
WHERE rnk = 1;

-- Recursive CTE: traverse an org chart hierarchy
WITH RECURSIVE org_tree AS (
    -- Anchor: start from the CEO (no manager)
    SELECT employee_id, name, manager_id, 1 AS depth
    FROM employees
    WHERE manager_id IS NULL
    
    UNION ALL
    
    -- Recursive: join children to current level
    SELECT e.employee_id, e.name, e.manager_id, ot.depth + 1
    FROM employees e
    INNER JOIN org_tree ot ON e.manager_id = ot.employee_id
)
SELECT * FROM org_tree ORDER BY depth, name;

-- Window functions: running total and moving average
SELECT order_date,
       daily_revenue,
       SUM(daily_revenue) OVER (ORDER BY order_date) AS running_total,
       AVG(daily_revenue) OVER (
           ORDER BY order_date
           ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
       ) AS seven_day_avg
FROM daily_sales;

-- GROUP BY with HAVING: filter aggregated results
SELECT department_id, COUNT(*) AS headcount, AVG(salary) AS avg_salary
FROM employees
GROUP BY department_id
HAVING COUNT(*) >= 5 AND AVG(salary) > 75000
ORDER BY avg_salary DESC;
```

### Views, Stored Procedures, and Triggers

```sql
-- Materialized view: precompute expensive aggregation
CREATE MATERIALIZED VIEW monthly_revenue AS
SELECT DATE_TRUNC('month', order_date) AS month,
       product_category,
       SUM(total_amount) AS revenue,
       COUNT(DISTINCT customer_id) AS unique_customers
FROM orders o
JOIN order_items oi ON o.order_id = oi.order_id
JOIN products p ON oi.product_id = p.product_id
GROUP BY DATE_TRUNC('month', order_date), product_category;

-- Refresh concurrently (no lock on reads during refresh)
REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_revenue;

-- Stored procedure with error handling (PostgreSQL syntax)
CREATE OR REPLACE FUNCTION transfer_funds(
    p_from_account INT,
    p_to_account INT,
    p_amount NUMERIC
) RETURNS VOID AS $$
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Transfer amount must be positive: %', p_amount;
    END IF;

    UPDATE accounts SET balance = balance - p_amount
    WHERE account_id = p_from_account AND balance >= p_amount;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Insufficient funds in account %', p_from_account;
    END IF;

    UPDATE accounts SET balance = balance + p_amount
    WHERE account_id = p_to_account;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Destination account % not found', p_to_account;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger: audit trail for sensitive table changes
CREATE OR REPLACE FUNCTION audit_employee_changes()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO employee_audit (
        employee_id, action, old_salary, new_salary, changed_by, changed_at
    ) VALUES (
        COALESCE(NEW.employee_id, OLD.employee_id),
        TG_OP,
        OLD.salary,
        NEW.salary,
        current_user,
        NOW()
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_employee_audit
AFTER UPDATE OF salary ON employees
FOR EACH ROW
EXECUTE FUNCTION audit_employee_changes();
```

## Common Pitfalls

**Using SELECT * in production queries.** Beyond pulling unnecessary data across the network, `SELECT *` prevents covering index usage, breaks applications when columns are added or reordered, and makes query plans unstable. Always enumerate the columns you need. In high-throughput systems, the difference between selecting 3 columns versus 30 can be a 10x reduction in I/O and network transfer.

**Ignoring NULL semantics in comparisons and aggregations.** `WHERE status != 'ACTIVE'` does NOT return rows where status is NULL — you need `WHERE status != 'ACTIVE' OR status IS NULL`. Similarly, `COUNT(column)` excludes NULLs while `COUNT(*)` counts all rows. `SUM()` over an empty set returns NULL, not 0. These semantics cause subtle bugs in reporting queries that go undetected until someone notices missing data.

**Writing correlated subqueries where joins or window functions suffice.** A correlated subquery re-executes for every row in the outer query. While modern optimizers can sometimes decorrelate these into joins, they often cannot — especially with complex predicates. Rewriting as a JOIN or window function gives the optimizer more flexibility and typically reduces execution time by orders of magnitude on large tables.

**Misunderstanding GROUP BY and HAVING execution order.** The logical execution order is FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT. Filtering in WHERE (before grouping) is always more efficient than filtering in HAVING (after grouping) when the predicate doesn't involve an aggregate. Placing a non-aggregate filter in HAVING forces the engine to compute groups that will be discarded.

**Relying on implicit type conversions in WHERE clauses.** When you compare a VARCHAR column to an integer literal, the database may cast every row's value to integer for comparison, preventing index usage. This is especially dangerous in PostgreSQL where `WHERE phone_number = 5551234` on a text column triggers a sequential scan. Always match types explicitly.

**Using OFFSET for pagination on large result sets.** `OFFSET 100000 LIMIT 20` still scans and discards 100,000 rows before returning 20. For deep pagination, use keyset pagination (WHERE id > last_seen_id ORDER BY id LIMIT 20) which leverages the index directly and maintains constant performance regardless of page depth.

## Real-World Use Cases

**E-commerce order analytics pipeline.** A retail platform processes 2 million orders daily and needs real-time dashboards showing revenue by category, region, and time period. The analytics layer uses materialized views refreshed every 5 minutes with `REFRESH MATERIALIZED VIEW CONCURRENTLY`, allowing reads during refresh. CTEs decompose complex aggregations into readable stages, and window functions compute period-over-period growth rates without multiple table scans. The query layer uses connection pooling through PgBouncer with 200 server connections serving 2,000 application connections.

**Multi-tenant SaaS access control.** A B2B platform stores data for 10,000 tenants in a shared database using row-level security. Views abstract the tenant filtering logic so application queries don't need to include `WHERE tenant_id = ?` in every statement. Stored procedures enforce business rules (like subscription limits) at the database level, preventing bypass through direct SQL access. Triggers maintain audit logs for compliance, recording every data modification with the authenticated user and timestamp.

**Financial reconciliation batch processing.** A payment processor reconciles transactions between internal ledgers and external bank feeds nightly. The reconciliation uses FULL OUTER JOINs to identify transactions present in one system but not the other, EXCEPT operations to find unmatched records, and recursive CTEs to trace transaction chains through split payments and refunds. The batch runs within a single transaction with SERIALIZABLE isolation to prevent concurrent modifications during reconciliation.

**Healthcare data warehouse ETL.** A hospital system consolidates patient records from 15 source systems into a unified data warehouse. The ETL pipeline uses MERGE (UPSERT) statements to handle both new records and updates in a single pass, window functions to deduplicate records by selecting the most recent version, and self-joins to link related encounters across systems. Stored procedures encapsulate the transformation logic with comprehensive error handling, rolling back individual patient loads without affecting the entire batch.

## Interview Questions

**Q: Explain the logical execution order of a SQL SELECT statement and why it matters.**

A: The logical order is: FROM/JOIN → WHERE → GROUP BY → HAVING → SELECT → DISTINCT → ORDER BY → LIMIT/OFFSET. This matters because it determines what's visible at each stage. You cannot reference a SELECT alias in WHERE because WHERE executes first. You cannot use window functions in WHERE because they compute after SELECT. HAVING can reference aggregates because it executes after GROUP BY. Understanding this order helps you write correct queries and predict which optimizations are possible — for example, pushing filters from HAVING into WHERE when they don't involve aggregates.

**Q: What is the difference between a correlated and non-correlated subquery? When would you use each?**

A: A non-correlated subquery executes once independently and its result is reused for every row of the outer query — like `WHERE id IN (SELECT id FROM other_table WHERE condition)`. A correlated subquery references columns from the outer query and re-executes for each outer row — like `WHERE salary > (SELECT AVG(salary) FROM employees e2 WHERE e2.dept_id = e1.dept_id)`. Use non-correlated subqueries for existence checks and static lookups. Use correlated subqueries when the inner query depends on the current outer row, but prefer rewriting as a JOIN or window function for performance. The optimizer can sometimes decorrelate subqueries automatically, but explicit joins give it more optimization paths.

**Q: When would you choose a materialized view over a regular view?**

A: Regular views are query aliases — they execute the underlying query every time and add no performance benefit. Materialized views store computed results physically, trading freshness for speed. Choose materialized views when: the underlying query is expensive (complex joins, aggregations over millions of rows), the data changes infrequently relative to read frequency, and your application can tolerate stale data between refreshes. In PostgreSQL, `REFRESH MATERIALIZED VIEW CONCURRENTLY` allows reads during refresh but requires a unique index. The trade-off is storage cost, refresh overhead, and staleness. For real-time requirements, consider indexed views (SQL Server) or query result caching at the application layer instead.

**Q: Explain the difference between UNION, UNION ALL, INTERSECT, and EXCEPT.**

A: `UNION` combines two result sets and removes duplicates (requires a sort or hash). `UNION ALL` combines without deduplication — always prefer this when duplicates are impossible or acceptable, as it avoids the sort overhead. `INTERSECT` returns only rows present in both result sets. `EXCEPT` returns rows from the first set that don't appear in the second. All four require compatible column counts and types. In production, UNION ALL is used 10x more frequently than UNION because most cases involve disjoint sets (like combining data from partitioned tables or different time ranges) where duplicates cannot occur.

## Production Tips

**Use EXPLAIN ANALYZE to validate query plans before deploying new queries.** Never deploy a query to production based solely on correctness testing with small datasets. Run `EXPLAIN ANALYZE` against production-scale data (or a staging replica with production volumes) to verify the optimizer chooses efficient plans. Look for sequential scans on large tables, nested loop joins with high row counts, and sort operations that spill to disk. In PostgreSQL, `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` provides buffer hit ratios that reveal whether your working set fits in shared_buffers.

**Implement keyset pagination instead of OFFSET for any user-facing paginated endpoint.** OFFSET-based pagination degrades linearly with page depth — page 1000 is 1000x slower than page 1. Keyset pagination uses a WHERE clause on the sort column (`WHERE created_at < ? ORDER BY created_at DESC LIMIT 20`) and maintains constant performance. This requires a stable sort order and passing the last-seen value between pages. For APIs, encode the cursor as an opaque token (base64-encoded composite key) so clients don't depend on internal column names.

**Prefer batch operations over row-by-row processing.** Instead of inserting 10,000 rows in a loop with individual INSERT statements, use multi-row INSERT (`INSERT INTO t VALUES (...), (...), ...`), COPY (PostgreSQL), or bulk insert APIs. Row-by-row processing incurs per-statement overhead including parsing, planning, and transaction logging. Batch sizes of 1,000-5,000 rows typically balance throughput against memory usage and lock duration. For updates, use UPDATE FROM (PostgreSQL) or MERGE to update multiple rows in a single statement.

## Related Topics

- [SQL Performance Tuning](./sql-performance-tuning.md) — Advanced optimization techniques building on these fundamentals, including index strategies and query plan analysis
- [Database Design Patterns](./database-design-patterns.md) — Schema modeling approaches that determine how effectively SQL queries can operate on your data
- [Transactions and Consistency](./transactions-and-consistency.md) — How SQL DML operates within transactional boundaries and isolation levels
- [PostgreSQL](./postgresql.md) — PostgreSQL-specific extensions to standard SQL including advanced indexing, JSONB, and partitioning
