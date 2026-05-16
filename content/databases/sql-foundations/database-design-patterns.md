# Database Design Patterns

## Quick Reference

- Normalization eliminates data redundancy through decomposition into related tables (1NF → 2NF → 3NF → BCNF)
- Denormalization intentionally introduces redundancy to optimize read performance at the cost of write complexity
- The CQRS pattern separates read models (optimized for queries) from write models (optimized for consistency)
- Event sourcing stores state changes as an immutable sequence of events rather than mutable current state
- Surrogate keys (auto-increment, UUID) vs. natural keys (email, SSN) — surrogate keys are preferred for most use cases
- Soft deletes (`deleted_at` timestamp) preserve data for audit while hiding from application queries
- Polymorphic associations handle inheritance: single table, class table, or concrete table inheritance patterns
- Multi-tenancy patterns: shared database with tenant column, schema-per-tenant, or database-per-tenant

## When to Use

Database design patterns are essential whenever you are designing a new system's data layer, refactoring an existing schema to address performance or maintainability issues, or migrating between database technologies. Apply normalization patterns when data integrity and consistency are paramount (financial systems, healthcare records, regulatory compliance). Apply denormalization patterns when read performance dominates your requirements and you can tolerate eventual consistency or increased write complexity (analytics dashboards, product catalogs, social media feeds). CQRS and event sourcing patterns are appropriate for systems with complex domain logic, audit requirements, or vastly different read and write workloads. Multi-tenancy patterns are critical for SaaS applications serving multiple customers on shared infrastructure. The choice of pattern depends on your specific access patterns, consistency requirements, scaling needs, and operational complexity budget — there is no universally correct schema design, only designs that are correct for specific workloads.

## Code Examples

### Normalization and Schema Design

```sql
-- Third Normal Form (3NF) schema for an e-commerce system
-- Each table has a single responsibility, no transitive dependencies

CREATE TABLE customers (
    customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(200) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE addresses (
    address_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(customer_id),
    address_type VARCHAR(20) NOT NULL CHECK (address_type IN ('billing', 'shipping')),
    street_line1 VARCHAR(200) NOT NULL,
    street_line2 VARCHAR(200),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(50) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    country_code CHAR(2) NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    UNIQUE (customer_id, address_type, is_default) -- Only one default per type
);

CREATE TABLE products (
    product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    category_id UUID REFERENCES categories(category_id),
    base_price DECIMAL(10,2) NOT NULL CHECK (base_price >= 0),
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    weight_grams INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(customer_id),
    shipping_address_id UUID NOT NULL REFERENCES addresses(address_id),
    billing_address_id UUID NOT NULL REFERENCES addresses(address_id),
    status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')),
    subtotal DECIMAL(12,2) NOT NULL,
    tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    shipping_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(12,2) GENERATED ALWAYS AS (subtotal + tax_amount + shipping_amount) STORED,
    ordered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    shipped_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE order_items (
    order_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(product_id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL, -- Snapshot at time of order
    line_total DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED
);
```

### Denormalization for Read Performance

```sql
-- Denormalized read model for product listing page
-- Avoids JOINs for the most common query pattern
CREATE TABLE product_listings (
    product_id UUID PRIMARY KEY,
    sku VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    description_preview VARCHAR(500),
    category_name VARCHAR(100) NOT NULL,  -- Denormalized from categories table
    category_path TEXT NOT NULL,           -- "Electronics > Laptops > Gaming"
    base_price DECIMAL(10,2) NOT NULL,
    sale_price DECIMAL(10,2),
    currency CHAR(3) NOT NULL,
    primary_image_url TEXT,
    avg_rating DECIMAL(3,2),              -- Denormalized from reviews
    review_count INTEGER DEFAULT 0,        -- Denormalized from reviews
    stock_status VARCHAR(20) NOT NULL,     -- Denormalized from inventory
    brand_name VARCHAR(100),               -- Denormalized from brands
    tags TEXT[],                           -- Array for filtering
    search_vector TSVECTOR,               -- Pre-computed for full-text search
    last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger to maintain denormalized data
CREATE OR REPLACE FUNCTION sync_product_listing()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE product_listings
    SET avg_rating = (
            SELECT AVG(rating) FROM reviews WHERE product_id = NEW.product_id
        ),
        review_count = (
            SELECT COUNT(*) FROM reviews WHERE product_id = NEW.product_id
        ),
        last_synced_at = NOW()
    WHERE product_id = NEW.product_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_review_sync
AFTER INSERT OR UPDATE OR DELETE ON reviews
FOR EACH ROW EXECUTE FUNCTION sync_product_listing();

-- Materialized view as an alternative denormalization strategy
CREATE MATERIALIZED VIEW customer_order_summary AS
SELECT
    c.customer_id,
    c.email,
    c.full_name,
    COUNT(o.order_id) AS total_orders,
    SUM(o.total_amount) AS lifetime_value,
    MAX(o.ordered_at) AS last_order_date,
    AVG(o.total_amount) AS avg_order_value
FROM customers c
LEFT JOIN orders o ON c.customer_id = o.customer_id
    AND o.status NOT IN ('cancelled')
GROUP BY c.customer_id, c.email, c.full_name;

CREATE UNIQUE INDEX idx_customer_summary_id ON customer_order_summary (customer_id);
```

### Event Sourcing Pattern

```sql
-- Event store schema
CREATE TABLE events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(100) NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    metadata JSONB DEFAULT '{}',
    version INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (aggregate_id, version)  -- Optimistic concurrency control
);

CREATE INDEX idx_events_aggregate ON events (aggregate_id, version);
CREATE INDEX idx_events_type_time ON events (event_type, created_at);

-- Snapshot table for performance (avoid replaying all events)
CREATE TABLE snapshots (
    aggregate_id UUID PRIMARY KEY,
    aggregate_type VARCHAR(100) NOT NULL,
    version INTEGER NOT NULL,
    state JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Example: Order aggregate events
INSERT INTO events (aggregate_type, aggregate_id, event_type, event_data, version) VALUES
('Order', '550e8400-e29b-41d4-a716-446655440000', 'OrderCreated',
 '{"customerId": "cust-123", "items": [{"sku": "SKU-001", "qty": 2, "price": 29.99}]}', 1),
('Order', '550e8400-e29b-41d4-a716-446655440000', 'PaymentReceived',
 '{"paymentId": "pay-456", "amount": 59.98, "method": "credit_card"}', 2),
('Order', '550e8400-e29b-41d4-a716-446655440000', 'OrderShipped',
 '{"trackingNumber": "1Z999AA10123456784", "carrier": "UPS"}', 3);
```

### Multi-Tenancy Patterns

```sql
-- Pattern 1: Shared table with tenant discriminator (highest density)
CREATE TABLE documents (
    document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    title VARCHAR(500) NOT NULL,
    content TEXT,
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row-level security for automatic tenant isolation
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON documents
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

-- Set tenant context at connection level
SET app.current_tenant = '550e8400-e29b-41d4-a716-446655440000';

-- Pattern 2: Schema-per-tenant (moderate isolation)
CREATE SCHEMA tenant_acme;
CREATE TABLE tenant_acme.documents (
    document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    content TEXT,
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Dynamic schema selection in application
-- SET search_path TO tenant_acme, public;
```

## Common Pitfalls

- **Premature denormalization**: Denormalizing before understanding actual query patterns leads to complex write logic maintaining redundant data that may never be queried. Start normalized, measure performance, and denormalize only the specific paths that are proven bottlenecks. Premature optimization in schema design is particularly costly because schema changes require data migrations.

- **UUID primary keys without consideration for index performance**: Random UUIDs (v4) cause B-tree index fragmentation because inserts are scattered across the index. Use UUIDv7 (time-ordered) or ULID for better insert performance and natural time-ordering. Alternatively, use BIGSERIAL for internal keys and expose UUIDs only at the API boundary.

- **Missing foreign key indexes**: PostgreSQL does not automatically create indexes on foreign key columns. Without an index on `orders.customer_id`, any JOIN or DELETE cascade involving the parent table requires a sequential scan of the child table. Always create indexes on foreign key columns in the referencing table.

- **Soft delete without query discipline**: Adding `deleted_at IS NULL` to every query is error-prone and easily forgotten. Use database views or row-level security policies to automatically filter soft-deleted records, ensuring application code cannot accidentally expose deleted data. Consider whether soft delete is actually needed — often an audit log or event store serves the same purpose with less complexity.

- **Storing computed values without refresh strategy**: Denormalized computed columns (totals, counts, averages) become stale without a reliable update mechanism. Every denormalization must have a corresponding synchronization strategy: triggers (immediate but adds write latency), materialized views (periodic refresh), or application-level events (eventual consistency with explicit lag).

- **Over-normalizing reference data**: Normalizing rarely-changing reference data (countries, currencies, status codes) into separate tables adds JOIN overhead for every query without meaningful storage savings. Small, stable lookup data can be stored as enum types, check constraints, or denormalized directly into the referencing table.

## Real-World Use Cases

- **Financial ledger with event sourcing**: A fintech company implements double-entry bookkeeping using event sourcing where every balance change is recorded as an immutable event (credit/debit). The current balance is derived by replaying events, with periodic snapshots for performance. This provides a complete audit trail, enables point-in-time balance queries, and makes regulatory compliance straightforward since no data is ever mutated or deleted.

- **Multi-tenant SaaS with tenant-specific schemas**: A project management SaaS uses schema-per-tenant for enterprise customers (data isolation, independent backup/restore, custom indexes) and shared tables with row-level security for small-team customers (cost efficiency, simpler operations). The application dynamically sets the search path based on the authenticated tenant, providing transparent isolation without code changes.

- **E-commerce with CQRS**: An online marketplace separates the write model (normalized order processing with ACID transactions) from the read model (denormalized product listings with pre-computed ratings and inventory status). Write events trigger asynchronous projections that update the read model. This allows the product search page to serve millions of requests per second from a denormalized store while order processing maintains strict consistency.

- **Healthcare records with temporal modeling**: A hospital system uses bitemporal tables tracking both valid time (when the fact was true in the real world) and transaction time (when the fact was recorded in the database). This enables queries like "what did we know about this patient's medications on March 15?" for legal and clinical purposes, while supporting corrections that do not destroy historical records.

## Interview Questions

**Q: When would you denormalize a database schema?**

A: Denormalize when read performance is critical and the read-to-write ratio is high, when specific query patterns require data from multiple tables that are always accessed together, when the cost of maintaining redundant data (write complexity, storage) is justified by the read performance gain, or when you need to eliminate expensive JOINs for latency-sensitive queries. Always measure first — denormalize based on profiled bottlenecks, not assumptions. Common denormalization techniques include pre-computed aggregates, materialized views, and embedding frequently-accessed related data.

**Q: Explain the trade-offs between surrogate keys and natural keys.**

A: Surrogate keys (auto-increment, UUID) are stable (never change), compact (fixed size), and independent of business logic. Natural keys (email, SSN) eliminate a JOIN when the key itself is meaningful but can change (email updates), may be large (composite natural keys), and couple the schema to business rules. Surrogate keys are preferred for most tables because they simplify foreign key relationships and are immune to business rule changes. Natural keys are appropriate for junction tables and lookup tables where the natural identifier is truly immutable.

**Q: How would you design a schema for a multi-tenant application?**

A: Three main approaches with different trade-offs. Shared tables with tenant_id column: highest density, lowest cost, but requires discipline to include tenant filters everywhere (row-level security helps). Schema-per-tenant: moderate isolation, independent indexes and migrations per tenant, but more operational complexity. Database-per-tenant: strongest isolation, independent backup/restore, but highest cost and operational overhead. Choose based on isolation requirements, compliance needs, tenant count, and operational capacity. Most SaaS applications start with shared tables and migrate large enterprise tenants to dedicated schemas.

**Q: What is event sourcing and when would you use it?**

A: Event sourcing stores all state changes as an immutable sequence of events rather than overwriting current state. The current state is derived by replaying events from the beginning (or from a snapshot). Use it when you need a complete audit trail, when you need to reconstruct state at any point in time, when your domain has complex state transitions, or when you want to decouple the write model from multiple read models (CQRS). Trade-offs include increased storage, complexity in querying current state, and the need for snapshots to avoid replaying millions of events.

## Production Tips

- **Schema migration strategy**: Use versioned migration tools (Flyway, Liquibase) with forward-only migrations. Never modify existing migration files after they have been applied. For zero-downtime deployments, split breaking changes into multiple releases: add new column → backfill data → update application → drop old column. Test migrations against production-sized datasets to estimate execution time and lock duration.

- **Temporal tables for audit compliance**: Use PostgreSQL's temporal tables extension or implement system-versioned tables manually with `valid_from`/`valid_to` columns. This provides automatic history tracking without application code changes, satisfying audit requirements for financial and healthcare systems. Partition history tables by time to manage growth.

- **Connection-level tenant context**: For multi-tenant systems using row-level security, set the tenant context at the connection pool level using `SET` commands or connection initialization hooks. This ensures every query is automatically filtered without relying on application code to include tenant predicates. Verify isolation with integration tests that attempt cross-tenant access.

- **Monitor schema bloat and dead tuples**: PostgreSQL's MVCC creates dead tuples on every UPDATE and DELETE. Monitor `n_dead_tup` in `pg_stat_user_tables` and ensure autovacuum is keeping up. For high-update tables, tune `autovacuum_vacuum_scale_factor` to trigger more frequently. Table bloat increases scan times and wastes storage — use `pg_repack` for online table reorganization without exclusive locks.

## Related Topics

- [SQL Performance Tuning](./sql-performance-tuning.md) — Query optimization techniques that complement good schema design
- [MongoDB and Document Databases](./mongodb.md) — Document modeling patterns as an alternative to relational schema design
- [Transactions and Consistency](./transactions-and-consistency.md) — How schema design decisions affect transaction behavior and consistency guarantees
