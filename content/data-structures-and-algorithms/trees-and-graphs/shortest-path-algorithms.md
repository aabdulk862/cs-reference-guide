# Shortest Path Algorithms

## Quick Reference

- **Dijkstra's (binary heap)**: O((V + E) log V) — non-negative weights, single source
- **Dijkstra's (Fibonacci heap)**: O(V log V + E) — theoretical improvement for dense graphs
- **Bellman-Ford**: O(V × E) — handles negative weights, detects negative cycles
- **Floyd-Warshall**: O(V³) — all-pairs shortest paths, handles negative weights
- **BFS (unweighted)**: O(V + E) — shortest path when all edges have weight 1
- **A* search**: O(E) with good heuristic — informed single-pair shortest path
- **Johnson's algorithm**: O(V² log V + VE) — all-pairs with sparse graphs and negative weights
- **SPFA (Shortest Path Faster Algorithm)**: O(V × E) worst, often faster in practice
- **Bidirectional Dijkstra**: O(b^(d/2)) — meets in the middle for point-to-point queries
- **Negative cycle detection**: Bellman-Ford Vth iteration, or Floyd-Warshall diagonal check

## When to Use

Shortest path algorithms are essential whenever you need to find optimal routes through weighted graphs. The choice of algorithm depends on the graph properties (negative weights, density) and the query type (single source, single pair, all pairs).

Use Dijkstra's algorithm when all edge weights are non-negative and you need shortest paths from a single source to all other vertices. This is the standard choice for road networks, network routing, and any graph where distances or costs are naturally non-negative. Dijkstra's is the most commonly used shortest path algorithm in production systems.

Use Bellman-Ford when the graph may contain negative edge weights (currency exchange, arbitrage detection, reward systems with penalties). Bellman-Ford also detects negative cycles, which indicate infinite profit opportunities in financial graphs or inconsistencies in constraint systems.

Use Floyd-Warshall when you need all-pairs shortest paths and the graph is relatively small (under 1000 vertices). It handles negative weights and is simple to implement. Use it for transitive closure computation, finding graph diameter, and problems where you need distances between all vertex pairs.

Use A* when you need the shortest path between a specific pair of vertices and have a good heuristic function (admissible and consistent). A* is the standard for game pathfinding, robot navigation, and any spatial graph where Euclidean distance provides a useful lower bound.

Use Johnson's algorithm when you need all-pairs shortest paths on sparse graphs with negative weights. It combines Bellman-Ford (to reweight edges) with V runs of Dijkstra's, outperforming Floyd-Warshall when E is much less than V².

## Code Examples

### Dijkstra's Algorithm with Priority Queue

The standard implementation using a min-heap priority queue. Processes vertices in order of increasing distance from the source, relaxing edges to discover shorter paths.

```java
public class Dijkstra {
    /**
     * Computes shortest distances from source to all vertices.
     * Graph represented as adjacency list: vertex -> [(neighbor, weight)].
     * Time: O((V + E) log V) with binary heap.
     * Returns int[] where dist[v] = shortest distance from source to v.
     */
    public static int[] shortestPaths(List<List<int[]>> graph, int source) {
        int n = graph.size();
        int[] dist = new int[n];
        Arrays.fill(dist, Integer.MAX_VALUE);
        dist[source] = 0;

        // Priority queue: [vertex, distance]
        PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> a[1] - b[1]);
        pq.offer(new int[]{source, 0});

        while (!pq.isEmpty()) {
            int[] curr = pq.poll();
            int u = curr[0], d = curr[1];

            // Skip stale entries (already found shorter path)
            if (d > dist[u]) continue;

            for (int[] edge : graph.get(u)) {
                int v = edge[0], weight = edge[1];
                int newDist = dist[u] + weight;

                if (newDist < dist[v]) {
                    dist[v] = newDist;
                    pq.offer(new int[]{v, newDist});
                }
            }
        }
        return dist;
    }

    /**
     * Reconstruct shortest path from source to target.
     * Uses parent tracking during Dijkstra's execution.
     */
    public static List<Integer> shortestPath(List<List<int[]>> graph, int source, int target) {
        int n = graph.size();
        int[] dist = new int[n];
        int[] parent = new int[n];
        Arrays.fill(dist, Integer.MAX_VALUE);
        Arrays.fill(parent, -1);
        dist[source] = 0;

        PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> a[1] - b[1]);
        pq.offer(new int[]{source, 0});

        while (!pq.isEmpty()) {
            int[] curr = pq.poll();
            int u = curr[0], d = curr[1];
            if (u == target) break;  // Early termination for single-pair
            if (d > dist[u]) continue;

            for (int[] edge : graph.get(u)) {
                int v = edge[0], weight = edge[1];
                if (dist[u] + weight < dist[v]) {
                    dist[v] = dist[u] + weight;
                    parent[v] = u;
                    pq.offer(new int[]{v, dist[v]});
                }
            }
        }

        // Reconstruct path
        List<Integer> path = new ArrayList<>();
        if (dist[target] == Integer.MAX_VALUE) return path;  // Unreachable
        for (int v = target; v != -1; v = parent[v]) {
            path.add(v);
        }
        Collections.reverse(path);
        return path;
    }
}
```

```typescript
function dijkstra(graph: [number, number][][], source: number): number[] {
  const n = graph.length;
  const dist = new Array(n).fill(Infinity);
  dist[source] = 0;

  // Simple priority queue using sorted insertion (use a proper heap in production)
  const pq: [number, number][] = [[source, 0]]; // [vertex, distance]

  while (pq.length > 0) {
    // Extract minimum (in production, use a binary heap)
    pq.sort((a, b) => a[1] - b[1]);
    const [u, d] = pq.shift()!;

    if (d > dist[u]) continue;

    for (const [v, weight] of graph[u]) {
      const newDist = dist[u] + weight;
      if (newDist < dist[v]) {
        dist[v] = newDist;
        pq.push([v, newDist]);
      }
    }
  }
  return dist;
}
```

### Bellman-Ford with Negative Cycle Detection

Bellman-Ford relaxes all edges V-1 times, handling negative weights. A Vth relaxation pass detects negative cycles.

```java
public class BellmanFord {
    /**
     * Single-source shortest paths with negative weight support.
     * Returns null if negative cycle is reachable from source.
     * Time: O(V * E), Space: O(V)
     */
    public static int[] shortestPaths(int numVertices, int[][] edges, int source) {
        int[] dist = new int[numVertices];
        Arrays.fill(dist, Integer.MAX_VALUE);
        dist[source] = 0;

        // Relax all edges V-1 times
        for (int i = 0; i < numVertices - 1; i++) {
            boolean updated = false;
            for (int[] edge : edges) {
                int u = edge[0], v = edge[1], weight = edge[2];
                if (dist[u] != Integer.MAX_VALUE && dist[u] + weight < dist[v]) {
                    dist[v] = dist[u] + weight;
                    updated = true;
                }
            }
            if (!updated) break;  // Early termination if no updates
        }

        // Check for negative cycles (Vth relaxation)
        for (int[] edge : edges) {
            int u = edge[0], v = edge[1], weight = edge[2];
            if (dist[u] != Integer.MAX_VALUE && dist[u] + weight < dist[v]) {
                return null;  // Negative cycle detected
            }
        }

        return dist;
    }

    /**
     * Detect negative cycle and return the cycle vertices.
     * Useful for arbitrage detection in currency exchange.
     */
    public static List<Integer> findNegativeCycle(int numVertices, int[][] edges) {
        int[] dist = new int[numVertices];
        int[] parent = new int[numVertices];
        Arrays.fill(parent, -1);

        int cycleVertex = -1;
        for (int i = 0; i < numVertices; i++) {
            cycleVertex = -1;
            for (int[] edge : edges) {
                int u = edge[0], v = edge[1], weight = edge[2];
                if (dist[u] + weight < dist[v]) {
                    dist[v] = dist[u] + weight;
                    parent[v] = u;
                    cycleVertex = v;
                }
            }
        }

        if (cycleVertex == -1) return Collections.emptyList();

        // Trace back to find cycle
        int v = cycleVertex;
        for (int i = 0; i < numVertices; i++) v = parent[v];

        List<Integer> cycle = new ArrayList<>();
        int curr = v;
        do {
            cycle.add(curr);
            curr = parent[curr];
        } while (curr != v);
        cycle.add(v);
        Collections.reverse(cycle);
        return cycle;
    }
}
```

### Floyd-Warshall All-Pairs Shortest Paths

Dynamic programming approach that considers each vertex as a potential intermediate node, building up shortest paths incrementally.

```java
public class FloydWarshall {
    private static final int INF = Integer.MAX_VALUE / 2;

    /**
     * All-pairs shortest paths.
     * dist[i][j] = shortest distance from i to j.
     * Time: O(V³), Space: O(V²)
     */
    public static int[][] allPairsShortestPaths(int[][] graph) {
        int n = graph.length;
        int[][] dist = new int[n][n];

        // Initialize with direct edge weights
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                dist[i][j] = graph[i][j] == 0 && i != j ? INF : graph[i][j];
            }
        }

        // Consider each vertex as intermediate
        for (int k = 0; k < n; k++) {
            for (int i = 0; i < n; i++) {
                for (int j = 0; j < n; j++) {
                    if (dist[i][k] + dist[k][j] < dist[i][j]) {
                        dist[i][j] = dist[i][k] + dist[k][j];
                    }
                }
            }
        }

        return dist;
    }

    /**
     * Detect negative cycle: check if any diagonal becomes negative.
     */
    public static boolean hasNegativeCycle(int[][] dist) {
        for (int i = 0; i < dist.length; i++) {
            if (dist[i][i] < 0) return true;
        }
        return false;
    }

    /**
     * Transitive closure: can vertex i reach vertex j?
     * Uses boolean Floyd-Warshall variant.
     */
    public static boolean[][] transitiveClosure(boolean[][] graph) {
        int n = graph.length;
        boolean[][] reach = new boolean[n][n];
        for (int i = 0; i < n; i++)
            System.arraycopy(graph[i], 0, reach[i], 0, n);

        for (int k = 0; k < n; k++)
            for (int i = 0; i < n; i++)
                for (int j = 0; j < n; j++)
                    reach[i][j] = reach[i][j] || (reach[i][k] && reach[k][j]);

        return reach;
    }
}
```

## Common Pitfalls

- **Using Dijkstra's with negative edge weights**: Dijkstra's algorithm produces incorrect results when edges have negative weights because it assumes that once a vertex is finalized (extracted from the priority queue), its distance cannot improve. A negative edge from a later-processed vertex can create a shorter path to an already-finalized vertex. Always verify that all weights are non-negative before using Dijkstra's, or switch to Bellman-Ford.

- **Integer overflow when adding distances**: When checking `dist[u] + weight < dist[v]`, if `dist[u]` is initialized to `Integer.MAX_VALUE`, adding any positive weight overflows to a negative number, causing incorrect comparisons. Guard against this with `if (dist[u] != Integer.MAX_VALUE && dist[u] + weight < dist[v])` or use `Integer.MAX_VALUE / 2` as infinity to leave room for addition.

- **Not handling unreachable vertices**: After running a shortest path algorithm, vertices unreachable from the source retain their initial infinity value. Code that uses these distances without checking for infinity (comparing distances, computing path lengths) produces incorrect results. Always check `dist[v] != INF` before using a distance value.

- **Forgetting the stale entry check in Dijkstra's**: Without the `if (d > dist[u]) continue` check, Dijkstra's processes stale priority queue entries (vertices whose distance was already improved by a later insertion). This does not affect correctness but degrades performance from O((V+E) log V) to O(V*E log V) in the worst case, as each vertex may be processed multiple times.

- **Applying Floyd-Warshall to large sparse graphs**: Floyd-Warshall always takes O(V³) time regardless of edge count. For sparse graphs with V=10,000 and E=50,000, running Dijkstra's from each vertex takes O(V * (V+E) log V) ≈ O(V² log V * (1 + E/V)), which is much faster than O(V³). Use Floyd-Warshall only for small dense graphs (V < 1000) or when you need the simplicity of a three-nested-loop implementation.

## Real-World Use Cases

**Navigation and mapping services** (Google Maps, Waze, Apple Maps) compute shortest paths on road networks with millions of intersections and road segments. They use hierarchical approaches: Contraction Hierarchies preprocess the graph by contracting unimportant vertices, creating shortcuts that enable query times under 1 millisecond for continental-scale networks. The preprocessing takes hours but enables billions of real-time queries per day.

**Network routing protocols** use shortest path algorithms to forward packets efficiently. OSPF (Open Shortest Path First) runs Dijkstra's algorithm on each router to compute the shortest path tree to all destinations. When link costs change (congestion, failure), routers flood updates and recompute paths. IS-IS (Intermediate System to Intermediate System) uses a similar approach for large ISP backbone networks.

**Arbitrage detection in financial markets** models currency exchange rates as a weighted directed graph where edge weights are logarithms of exchange rates. A negative cycle in this graph represents an arbitrage opportunity (a sequence of trades that yields profit). Trading firms run Bellman-Ford continuously on real-time exchange rate graphs to detect and exploit these opportunities before they disappear.

**Game AI pathfinding** uses A* search to navigate characters through game worlds. The heuristic function (typically Euclidean or Manhattan distance) guides the search toward the goal, exploring far fewer vertices than Dijkstra's. Modern games use hierarchical pathfinding (HPA*) that precomputes paths between regions and only runs detailed A* within the current region, enabling thousands of simultaneous pathfinding queries per frame.

**Supply chain optimization** models warehouses, distribution centers, and delivery points as vertices with transportation costs as edge weights. Finding minimum-cost routes for delivery trucks, optimizing multi-stop routes, and computing backup paths when routes are disrupted all require shortest path computation on weighted graphs with time-varying costs.

## Interview Questions

**Q: How does Dijkstra's algorithm work, and what is its time complexity?**

A: Dijkstra's maintains a priority queue of (distance, vertex) pairs, initially containing only the source with distance 0. It repeatedly extracts the minimum-distance vertex, marks it as finalized, and relaxes all its outgoing edges (updating neighbor distances if a shorter path is found through the current vertex). The greedy choice is correct because all weights are non-negative, so no future path through unprocessed vertices can improve a finalized distance. With a binary heap, complexity is O((V + E) log V): each vertex is extracted once (V log V) and each edge is relaxed once (E log V for decrease-key operations).

**Q: When would you use Bellman-Ford instead of Dijkstra's?**

A: Use Bellman-Ford when the graph has negative edge weights (Dijkstra's produces incorrect results), when you need to detect negative cycles (Bellman-Ford's Vth iteration check), or when the graph is represented as an edge list (Bellman-Ford iterates over edges directly, while Dijkstra's needs adjacency list access). The trade-off is performance: Bellman-Ford is O(V*E) versus Dijkstra's O((V+E) log V). For graphs without negative weights, Dijkstra's is always preferred.

**Q: Explain the A* algorithm and how it differs from Dijkstra's.**

A: A* extends Dijkstra's by adding a heuristic function h(v) that estimates the remaining distance from v to the goal. The priority queue orders by f(v) = g(v) + h(v), where g(v) is the known shortest distance from source to v. If h is admissible (never overestimates) and consistent (satisfies triangle inequality), A* finds the optimal path while exploring fewer vertices than Dijkstra's. The heuristic guides search toward the goal, pruning irrelevant directions. With h(v) = 0 for all v, A* degenerates to Dijkstra's.

**Q: How would you find the shortest path in a graph where edges have weights 0 or 1?**

A: Use 0-1 BFS with a deque (double-ended queue). When relaxing an edge with weight 0, add the neighbor to the front of the deque. When relaxing an edge with weight 1, add to the back. This maintains the invariant that the deque is sorted by distance, providing O(V + E) time without a priority queue. This is faster than Dijkstra's O((V+E) log V) and is used in grid problems where some moves are free.

## Production Tips

- **Use Contraction Hierarchies for repeated queries on static road networks**: Preprocess the graph by iteratively contracting least-important vertices and adding shortcut edges. This creates a hierarchical structure where queries only need to explore upward in the hierarchy from both source and target until they meet. Query time drops from seconds to microseconds for continental-scale networks. OSRM (Open Source Routing Machine) uses this technique for real-time navigation.

- **Implement incremental shortest path updates for dynamic graphs**: When edge weights change (network congestion, road closures), recomputing all shortest paths from scratch is expensive. Use incremental algorithms that update only affected paths. For single-source, maintain a shortest path tree and re-relax only edges whose source vertex distance changed. For all-pairs, use dynamic Floyd-Warshall that updates in O(V²) per edge change instead of O(V³) full recomputation.

- **Cache shortest path results with LRU eviction for repeated queries**: In systems where the same source-destination pairs are queried frequently (ride-sharing, delivery routing), cache computed paths with time-based or LRU eviction. Invalidate cache entries when the underlying graph changes. This reduces average query latency from milliseconds to microseconds for hot paths while keeping memory bounded.

## Related Topics

- [Graph Representations and Traversal](./graph-representations-and-traversal.md) — Graph structure and BFS/DFS that shortest path algorithms build upon
- [Advanced Graph Algorithms](./advanced-graph-algorithms.md) — MST algorithms use similar relaxation techniques
- [Binary Trees and BSTs](./binary-trees-and-bsts.md) — Priority queues (heaps) used in Dijkstra's implementation
- [Heap](../fundamental-data-structures/heap.md) — Binary heap provides the priority queue for Dijkstra's algorithm
