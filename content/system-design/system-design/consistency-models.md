# Consistency Models

## Quick Reference

- CAP theorem: a distributed data store cannot simultaneously provide Consistency, Availability, and Partition tolerance; since partitions are inevitable, the practical choice is CP or AP
- Linearizability (strong consistency) guarantees every read returns the most recent write, requiring coordination on every operation
- Eventual consistency guarantees convergence if no new updates are made, but allows stale reads during the convergence window
- PACELC theorem extends CAP: even without Partitions, there is a tradeoff between Latency and Consistency
- Causal consistency preserves ordering of causally related operations using vector clocks or Lamport timestamps
- Quorum reads and writes (W + R > N) provide tunable consistency without full consensus overhead
- CRDTs (Conflict-free Replicated Data Types) achieve strong eventual consistency without coordination by ensuring all concurrent operations commute

## When to Use

Consistency model selection applies whenever data is replicated across multiple nodes, whether for fault tolerance, read scaling, or geographic distribution. You need to reason about consistency models when choosing between databases (PostgreSQL with synchronous replication vs. Cassandra with tunable consistency), when designing replication strategies for microservices that own their data, when implementing distributed caches that must balance freshness against latency, and when building event-driven systems where consumers may process events out of order. Understanding these models is critical for system design interviews where candidates must articulate why a banking system needs linearizability for account balances while a social media like counter can tolerate eventual consistency. The choice directly impacts user experience, system availability, operational complexity, and infrastructure cost.

## Code Examples

### Implementing Quorum-Based Reads and Writes

```java
public class QuorumReplicator<T> {
    private final List<ReplicaClient<T>> replicas;
    private final int writeQuorum;  // W
    private final int readQuorum;   // R
    // Invariant: W + R > N (total replicas) ensures overlap

    public QuorumReplicator(List<ReplicaClient<T>> replicas, int writeQuorum, int readQuorum) {
        this.replicas = replicas;
        this.writeQuorum = writeQuorum;
        this.readQuorum = readQuorum;

        int n = replicas.size();
        if (writeQuorum + readQuorum <= n) {
            throw new IllegalArgumentException(
                "W + R must be > N for consistency. W=" + writeQuorum +
                ", R=" + readQuorum + ", N=" + n
            );
        }
    }

    /**
     * Write to W replicas. Returns success only when W acknowledgments received.
     * Each write carries a version (timestamp or logical clock) for conflict resolution.
     */
    public WriteResult write(String key, T value) {
        long version = System.nanoTime(); // In production, use hybrid logical clock
        VersionedValue<T> versioned = new VersionedValue<>(value, version);

        List<CompletableFuture<Boolean>> futures = replicas.stream()
            .map(replica -> CompletableFuture.supplyAsync(() ->
                replica.write(key, versioned)))
            .collect(Collectors.toList());

        // Wait for W successful acknowledgments
        int acks = 0;
        int failures = 0;
        for (CompletableFuture<Boolean> future : futures) {
            try {
                if (future.get(5, TimeUnit.SECONDS)) {
                    acks++;
                    if (acks >= writeQuorum) {
                        return WriteResult.success(version);
                    }
                } else {
                    failures++;
                }
            } catch (Exception e) {
                failures++;
            }
            // Early termination: if we can't reach quorum even with remaining futures
            if (failures > replicas.size() - writeQuorum) {
                return WriteResult.failure("Cannot reach write quorum");
            }
        }
        return WriteResult.failure("Insufficient acknowledgments: " + acks);
    }

    /**
     * Read from R replicas and return the value with the highest version.
     * The quorum overlap guarantees at least one replica has the latest write.
     */
    public ReadResult<T> read(String key) {
        List<CompletableFuture<VersionedValue<T>>> futures = replicas.stream()
            .map(replica -> CompletableFuture.supplyAsync(() -> replica.read(key)))
            .collect(Collectors.toList());

        List<VersionedValue<T>> responses = new ArrayList<>();
        int failures = 0;

        for (CompletableFuture<VersionedValue<T>> future : futures) {
            try {
                VersionedValue<T> result = future.get(5, TimeUnit.SECONDS);
                if (result != null) {
                    responses.add(result);
                    if (responses.size() >= readQuorum) {
                        break;
                    }
                } else {
                    failures++;
                }
            } catch (Exception e) {
                failures++;
            }
            if (failures > replicas.size() - readQuorum) {
                return ReadResult.failure("Cannot reach read quorum");
            }
        }

        // Return the value with the highest version (last-write-wins)
        VersionedValue<T> latest = responses.stream()
            .max(Comparator.comparingLong(VersionedValue::getVersion))
            .orElse(null);

        // Trigger read repair: update stale replicas asynchronously
        if (latest != null) {
            triggerReadRepair(key, latest, responses);
        }

        return latest != null
            ? ReadResult.success(latest.getValue(), latest.getVersion())
            : ReadResult.notFound();
    }

    private void triggerReadRepair(String key, VersionedValue<T> latest,
                                    List<VersionedValue<T>> responses) {
        CompletableFuture.runAsync(() -> {
            for (ReplicaClient<T> replica : replicas) {
                // Send latest value to replicas that returned stale data
                replica.repair(key, latest);
            }
        });
    }
}
```

### Vector Clock Implementation for Causal Ordering

```typescript
/**
 * Vector clock implementation for tracking causal relationships
 * between events in a distributed system.
 */
class VectorClock {
  private clock: Map<string, number>;

  constructor(nodeId?: string) {
    this.clock = new Map();
    if (nodeId) {
      this.clock.set(nodeId, 0);
    }
  }

  /**
   * Increment this node's counter (local event occurred)
   */
  increment(nodeId: string): VectorClock {
    const newClock = new VectorClock();
    newClock.clock = new Map(this.clock);
    newClock.clock.set(nodeId, (newClock.clock.get(nodeId) || 0) + 1);
    return newClock;
  }

  /**
   * Merge with another vector clock (message received).
   * Take element-wise maximum, then increment local counter.
   */
  merge(other: VectorClock, localNodeId: string): VectorClock {
    const merged = new VectorClock();

    // Combine all known nodes
    const allNodes = new Set([...this.clock.keys(), ...other.clock.keys()]);

    for (const node of allNodes) {
      const localVal = this.clock.get(node) || 0;
      const remoteVal = other.clock.get(node) || 0;
      merged.clock.set(node, Math.max(localVal, remoteVal));
    }

    // Increment local counter for the receive event
    merged.clock.set(localNodeId, (merged.clock.get(localNodeId) || 0) + 1);
    return merged;
  }

  /**
   * Determine causal relationship between two vector clocks.
   * Returns: 'before', 'after', 'concurrent', or 'equal'
   */
  compare(other: VectorClock): 'before' | 'after' | 'concurrent' | 'equal' {
    let thisBeforeOther = false;
    let otherBeforeThis = false;

    const allNodes = new Set([...this.clock.keys(), ...other.clock.keys()]);

    for (const node of allNodes) {
      const thisVal = this.clock.get(node) || 0;
      const otherVal = other.clock.get(node) || 0;

      if (thisVal < otherVal) thisBeforeOther = true;
      if (thisVal > otherVal) otherBeforeThis = true;
    }

    if (!thisBeforeOther && !otherBeforeThis) return 'equal';
    if (thisBeforeOther && !otherBeforeThis) return 'before';
    if (!thisBeforeOther && otherBeforeThis) return 'after';
    return 'concurrent'; // Both have elements greater than the other
  }

  toString(): string {
    const entries = [...this.clock.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([node, count]) => `${node}:${count}`);
    return `[${entries.join(', ')}]`;
  }
}

// Usage: Detecting conflicts in a distributed key-value store
class CausalKVStore {
  private store: Map<string, { value: unknown; clock: VectorClock }[]> = new Map();
  private nodeId: string;
  private localClock: VectorClock;

  constructor(nodeId: string) {
    this.nodeId = nodeId;
    this.localClock = new VectorClock(nodeId);
  }

  put(key: string, value: unknown): VectorClock {
    this.localClock = this.localClock.increment(this.nodeId);
    const existing = this.store.get(key) || [];

    // Remove entries that are causally before the new write
    const concurrent = existing.filter(
      entry => entry.clock.compare(this.localClock) === 'concurrent'
    );

    // Store new value alongside any concurrent versions (siblings)
    concurrent.push({ value, clock: this.localClock });
    this.store.set(key, concurrent);

    return this.localClock;
  }

  get(key: string): { value: unknown; clock: VectorClock }[] {
    return this.store.get(key) || [];
    // Multiple entries = conflict (concurrent writes)
    // Application must resolve conflicts
  }
}
```

### CRDT: G-Counter (Grow-Only Counter)

```java
/**
 * G-Counter: a CRDT that supports increment operations.
 * Each node maintains its own counter. The global value is the sum of all node counters.
 * Merge takes the element-wise maximum, guaranteeing convergence without coordination.
 */
public class GCounter {
    private final String nodeId;
    private final Map<String, Long> counters;

    public GCounter(String nodeId) {
        this.nodeId = nodeId;
        this.counters = new ConcurrentHashMap<>();
        this.counters.put(nodeId, 0L);
    }

    private GCounter(String nodeId, Map<String, Long> counters) {
        this.nodeId = nodeId;
        this.counters = new ConcurrentHashMap<>(counters);
    }

    /** Increment this node's counter */
    public void increment() {
        counters.merge(nodeId, 1L, Long::sum);
    }

    /** Get the global counter value (sum of all nodes) */
    public long value() {
        return counters.values().stream().mapToLong(Long::longValue).sum();
    }

    /**
     * Merge with another G-Counter replica.
     * Takes element-wise maximum — this is commutative, associative, and idempotent,
     * guaranteeing convergence regardless of message ordering or duplication.
     */
    public GCounter merge(GCounter other) {
        Map<String, Long> merged = new HashMap<>(this.counters);
        for (Map.Entry<String, Long> entry : other.counters.entrySet()) {
            merged.merge(entry.getKey(), entry.getValue(), Math::max);
        }
        return new GCounter(this.nodeId, merged);
    }

    /**
     * Compare for convergence: this counter dominates other if all entries >= other's entries
     */
    public boolean dominates(GCounter other) {
        for (Map.Entry<String, Long> entry : other.counters.entrySet()) {
            long thisVal = this.counters.getOrDefault(entry.getKey(), 0L);
            if (thisVal < entry.getValue()) return false;
        }
        return true;
    }
}
```

## Common Pitfalls

- Assuming eventual consistency means "consistent soon": the convergence window can be seconds, minutes, or even hours depending on replication lag, network conditions, and conflict resolution strategy. Design your application to handle arbitrarily stale reads or explicitly bound the staleness window with monitoring and alerts.

- Using wall-clock timestamps for conflict resolution without understanding clock skew: last-write-wins (LWW) based on physical timestamps can silently discard writes when clocks are skewed. A write at 10:00:01 on a slow clock loses to a write at 10:00:02 on a fast clock, even if the first write happened later in real time. Use hybrid logical clocks or vector clocks for correct ordering.

- Choosing strong consistency everywhere "to be safe": linearizability requires coordination on every operation, adding latency proportional to network round-trip time between replicas. For a globally distributed system, this can mean 100-300ms added to every read and write. Most data does not require linearizability; identify which data truly needs it and use weaker models elsewhere.

- Ignoring read-your-writes consistency in user-facing applications: a user updates their profile and immediately sees the old version because the read hit a stale replica. This is technically correct under eventual consistency but creates a terrible user experience. Implement session consistency by routing reads to the same replica that accepted the write, or by reading from the primary after writes.

- Conflating consistency models with durability guarantees: a system can be strongly consistent (all replicas agree) while being non-durable (data only in memory). Conversely, a system can be eventually consistent while being highly durable (data persisted to disk on multiple nodes). These are orthogonal concerns that must be addressed independently.

- Not testing failure modes: consistency guarantees only matter during failures (partitions, node crashes, high latency). Testing only the happy path means you have no confidence in your consistency guarantees when they matter most. Use chaos engineering tools (Jepsen, Chaos Monkey) to verify behavior under failure.

## Real-World Use Cases

**Banking and Financial Systems (CP)**: Account balance operations require linearizability to prevent double-spending. When a user transfers money, the debit and credit must be atomic and immediately visible to all subsequent reads. Systems like Google Spanner achieve this globally using TrueTime for clock synchronization, accepting higher latency (typically 10-15ms for cross-region transactions) in exchange for correctness guarantees. During network partitions, the system becomes unavailable rather than risk inconsistent balances.

**Social Media Counters (AP with Eventual Consistency)**: Like counts, view counts, and follower counts use eventual consistency because temporary inaccuracy is acceptable. Facebook's TAO system replicates social graph data across datacenters with eventual consistency, accepting that a like count might show 1,003 on one datacenter and 1,005 on another for a few seconds. The convergence window is typically under 1 second, and the user experience is unaffected by small discrepancies.

**Shopping Cart (AP with Conflict Resolution)**: Amazon's Dynamo paper describes using vector clocks for shopping cart conflict resolution. If a user adds items from two devices simultaneously during a partition, both additions are preserved (union merge) rather than one overwriting the other. This "always accept writes" approach prioritizes availability and uses application-level conflict resolution that favors not losing items over strict consistency.

**DNS (Eventual Consistency with TTL)**: The Domain Name System is one of the largest eventually consistent systems. DNS records propagate through caching resolvers with TTL-based expiration. A DNS change may take minutes to hours to propagate globally, but the system is highly available and partition-tolerant. Applications that need faster propagation use shorter TTLs at the cost of increased query load on authoritative servers.

**Collaborative Editing (CRDTs)**: Google Docs and Figma use operation-based CRDTs or operational transformation to allow multiple users to edit simultaneously without coordination. Each user's operations are applied locally and broadcast to others. CRDTs guarantee that all replicas converge to the same state regardless of the order operations are received, enabling real-time collaboration across unreliable networks.

## Interview Questions

**Q: A user updates their profile picture but sees the old one when they refresh. What consistency model is in play and how would you fix it?**

A: This is eventual consistency where the read hit a replica that has not yet received the write. Fixes include: (1) read-your-writes consistency by routing the user's subsequent reads to the same replica or primary that accepted the write, (2) sticky sessions that pin a user to a specific replica, (3) including a version token in the write response and passing it on subsequent reads so the system can wait for the replica to catch up, or (4) reading from the primary for a short window after writes (with fallback to replicas after the replication lag window passes).

**Q: When would you choose Cassandra over PostgreSQL, and what consistency tradeoffs are you making?**

A: Choose Cassandra when you need high write throughput across multiple datacenters, can tolerate eventual consistency for most operations, and your access patterns are known upfront (Cassandra requires query-driven data modeling). You are trading linearizable reads and ACID transactions for availability during partitions, horizontal write scaling, and multi-datacenter replication. PostgreSQL with synchronous replication gives you strong consistency and SQL flexibility but limits write scaling to a single primary and becomes unavailable during partitions if the primary is on the minority side.

**Q: Explain how quorum reads and writes provide tunable consistency.**

A: With N replicas, write quorum W, and read quorum R, setting W + R > N guarantees that any read quorum overlaps with any write quorum by at least one node, ensuring the read sees the latest write. Tuning W and R trades consistency against availability and latency: W=N, R=1 gives fast reads but writes fail if any replica is down; W=1, R=N gives fast writes but reads are slow and fail if any replica is down; W=⌈(N+1)/2⌉, R=⌈(N+1)/2⌉ (majority quorum) balances both. Lower quorums improve availability (tolerate more failures) at the cost of potentially stale reads.

**Q: What are CRDTs and when would you use them instead of consensus-based replication?**

A: CRDTs are data structures designed so that concurrent updates always converge without coordination. They achieve strong eventual consistency: once all updates are delivered (in any order), all replicas have identical state. Use CRDTs when you need low-latency writes across multiple datacenters without coordination overhead, when your data model fits CRDT semantics (counters, sets, registers, maps), and when you can tolerate the space overhead of metadata (vector clocks, tombstones). Use consensus-based replication when you need linearizability, complex transactions, or data models that do not map naturally to CRDT types.

## Production Tips

- Implement monotonic reads at the application layer by tracking the last-seen version and rejecting responses with older versions. This prevents the confusing user experience of "time travel" where refreshing a page shows older data than the previous load.

- Monitor replication lag as a first-class metric with alerting thresholds tied to your consistency SLA. If your application assumes reads are fresh within 5 seconds, alert when replication lag exceeds 3 seconds to give time for investigation before users are affected.

- Use read-after-write consistency for user-facing mutations by including a causal token (timestamp or version) in the write response and passing it on subsequent reads. The read handler waits for the local replica to reach that version before responding, bounding the staleness window to replication lag rather than leaving it unbounded.

- When using eventual consistency, design your UI to be honest about data freshness. Show "updated 2 seconds ago" timestamps, use optimistic UI updates that show the user's own writes immediately (client-side), and gracefully handle conflicts when they surface rather than silently dropping data.

## Related Topics

- [Distributed Systems](./distributed-systems.md) — Foundational concepts of distributed computing that consistency models build upon
- [Database Sharding](./database-sharding.md) — Partitioning strategies that interact with consistency guarantees across shards
- [Caching](./caching.md) — Cache consistency and invalidation strategies that depend on the underlying consistency model
- [Design Patterns](../design-patterns.md) — Patterns like CQRS and event sourcing that enable different consistency models for reads and writes
