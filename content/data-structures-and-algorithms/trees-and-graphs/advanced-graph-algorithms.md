# Advanced Graph Algorithms

## Quick Reference

- **Topological Sort (Kahn's/DFS)**: O(V + E) — linear ordering of DAG vertices
- **Kruskal's MST**: O(E log E) — greedy edge selection with Union-Find
- **Prim's MST**: O((V + E) log V) — greedy vertex expansion with priority queue
- **Tarjan's SCC**: O(V + E) — strongly connected components via DFS
- **Kosaraju's SCC**: O(V + E) — two-pass DFS on graph and transpose
- **Ford-Fulkerson max flow**: O(V × E²) with BFS (Edmonds-Karp)
- **Dinic's max flow**: O(V² × E) — blocking flow with level graph
- **Articulation points**: O(V + E) — vertices whose removal disconnects graph
- **Bridges**: O(V + E) — edges whose removal disconnects graph
- **Euler path/circuit**: O(V + E) — traverse every edge exactly once
- **Minimum cut**: equals max flow (max-flow min-cut theorem)

## When to Use

Advanced graph algorithms solve structural problems that go beyond simple traversal and shortest paths. They reveal the deep properties of graphs: ordering constraints, minimum-cost connectivity, flow capacity, and vulnerability points.

Use topological sort when you need to order tasks with dependencies (build systems, course scheduling, spreadsheet cell evaluation), when you need to process DAG vertices in dependency order, or when detecting whether a directed graph is acyclic (topological sort exists if and only if the graph is a DAG).

Use minimum spanning tree algorithms when you need to connect all vertices with minimum total edge weight (network design, clustering, approximation algorithms). Kruskal's is simpler and works well with edge lists; Prim's is better for dense graphs or when you need to grow the tree from a specific root.

Use strongly connected component algorithms when you need to identify groups of mutually reachable vertices in directed graphs (compiler optimization, social network community detection, 2-SAT satisfiability). SCCs decompose a directed graph into its maximal strongly connected subgraphs.

Use network flow algorithms when you need to find maximum throughput through a network with capacity constraints (network bandwidth allocation, bipartite matching, project selection), or when you need minimum cuts (network reliability, image segmentation).

Use articulation point and bridge detection when you need to identify critical infrastructure (network nodes whose failure disconnects the network, single points of failure in distributed systems).

## Code Examples

### Topological Sort (Kahn's Algorithm and DFS)

Two approaches to topological ordering: Kahn's BFS-based algorithm using in-degree tracking, and DFS-based reverse post-order.

```java
public class TopologicalSort {
    /**
     * Kahn's Algorithm: BFS-based topological sort.
     * Process vertices with in-degree 0, decrement neighbors' in-degrees.
     * Returns empty list if cycle exists.
     * Time: O(V + E), Space: O(V)
     */
    public static List<Integer> kahns(Map<Integer, List<Integer>> graph, int numVertices) {
        int[] inDegree = new int[numVertices];
        for (List<Integer> neighbors : graph.values()) {
            for (int neighbor : neighbors) {
                inDegree[neighbor]++;
            }
        }

        Queue<Integer> queue = new ArrayDeque<>();
        for (int v = 0; v < numVertices; v++) {
            if (inDegree[v] == 0) queue.offer(v);
        }

        List<Integer> order = new ArrayList<>();
        while (!queue.isEmpty()) {
            int v = queue.poll();
            order.add(v);
            for (int neighbor : graph.getOrDefault(v, List.of())) {
                if (--inDegree[neighbor] == 0) {
                    queue.offer(neighbor);
                }
            }
        }

        return order.size() == numVertices ? order : List.of();  // Empty = cycle
    }

    /**
     * DFS-based topological sort: reverse post-order.
     * Vertices are added to result after all descendants are processed.
     * Time: O(V + E), Space: O(V)
     */
    public static List<Integer> dfsTopSort(Map<Integer, List<Integer>> graph, int numVertices) {
        boolean[] visited = new boolean[numVertices];
        boolean[] inStack = new boolean[numVertices];
        Deque<Integer> stack = new ArrayDeque<>();
        boolean hasCycle = false;

        for (int v = 0; v < numVertices; v++) {
            if (!visited[v]) {
                if (dfs(graph, v, visited, inStack, stack)) {
                    return List.of();  // Cycle detected
                }
            }
        }

        List<Integer> result = new ArrayList<>();
        while (!stack.isEmpty()) result.add(stack.pop());
        return result;
    }

    private static boolean dfs(Map<Integer, List<Integer>> graph, int v,
                               boolean[] visited, boolean[] inStack, Deque<Integer> stack) {
        visited[v] = true;
        inStack[v] = true;

        for (int neighbor : graph.getOrDefault(v, List.of())) {
            if (inStack[neighbor]) return true;  // Cycle
            if (!visited[neighbor] && dfs(graph, neighbor, visited, inStack, stack)) return true;
        }

        inStack[v] = false;
        stack.push(v);  // Add to result after all descendants processed
        return false;
    }
}
```

```typescript
function topologicalSort(graph: Map<number, number[]>, numVertices: number): number[] {
  const inDegree = new Array(numVertices).fill(0);

  for (const neighbors of graph.values()) {
    for (const neighbor of neighbors) {
      inDegree[neighbor]++;
    }
  }

  const queue: number[] = [];
  for (let v = 0; v < numVertices; v++) {
    if (inDegree[v] === 0) queue.push(v);
  }

  const order: number[] = [];
  let front = 0;

  while (front < queue.length) {
    const v = queue[front++];
    order.push(v);
    for (const neighbor of graph.get(v) ?? []) {
      if (--inDegree[neighbor] === 0) {
        queue.push(neighbor);
      }
    }
  }

  return order.length === numVertices ? order : [];
}
```

### Kruskal's Minimum Spanning Tree with Union-Find

Kruskal's algorithm greedily selects the lightest edge that does not create a cycle, using Union-Find for efficient cycle detection.

```java
public class KruskalMST {
    /**
     * Union-Find (Disjoint Set) with path compression and union by rank.
     * Operations are nearly O(1) amortized (inverse Ackermann).
     */
    static class UnionFind {
        int[] parent, rank;

        UnionFind(int n) {
            parent = new int[n];
            rank = new int[n];
            for (int i = 0; i < n; i++) parent[i] = i;
        }

        int find(int x) {
            if (parent[x] != x) parent[x] = find(parent[x]);  // Path compression
            return parent[x];
        }

        boolean union(int x, int y) {
            int px = find(x), py = find(y);
            if (px == py) return false;  // Already connected
            if (rank[px] < rank[py]) { int tmp = px; px = py; py = tmp; }
            parent[py] = px;
            if (rank[px] == rank[py]) rank[px]++;
            return true;
        }
    }

    /**
     * Kruskal's MST: sort edges by weight, greedily add if no cycle.
     * Time: O(E log E) dominated by sorting.
     * Returns list of MST edges and total weight.
     */
    public static int kruskal(int numVertices, int[][] edges) {
        // Sort edges by weight
        Arrays.sort(edges, (a, b) -> a[2] - b[2]);

        UnionFind uf = new UnionFind(numVertices);
        int mstWeight = 0;
        int edgesAdded = 0;

        for (int[] edge : edges) {
            int u = edge[0], v = edge[1], weight = edge[2];
            if (uf.union(u, v)) {
                mstWeight += weight;
                edgesAdded++;
                if (edgesAdded == numVertices - 1) break;  // MST complete
            }
        }

        return edgesAdded == numVertices - 1 ? mstWeight : -1;  // -1 if disconnected
    }
}
```

### Tarjan's Strongly Connected Components

Tarjan's algorithm finds all SCCs in a single DFS pass using discovery times and low-link values.

```java
public class TarjanSCC {
    private int time = 0;
    private int[] disc, low;
    private boolean[] onStack;
    private Deque<Integer> stack = new ArrayDeque<>();
    private List<List<Integer>> sccs = new ArrayList<>();

    /**
     * Find all strongly connected components.
     * Time: O(V + E), Space: O(V)
     */
    public List<List<Integer>> findSCCs(Map<Integer, List<Integer>> graph, int numVertices) {
        disc = new int[numVertices];
        low = new int[numVertices];
        onStack = new boolean[numVertices];
        Arrays.fill(disc, -1);

        for (int v = 0; v < numVertices; v++) {
            if (disc[v] == -1) {
                dfs(graph, v);
            }
        }
        return sccs;
    }

    private void dfs(Map<Integer, List<Integer>> graph, int u) {
        disc[u] = low[u] = time++;
        stack.push(u);
        onStack[u] = true;

        for (int v : graph.getOrDefault(u, List.of())) {
            if (disc[v] == -1) {
                dfs(graph, v);
                low[u] = Math.min(low[u], low[v]);
            } else if (onStack[v]) {
                low[u] = Math.min(low[u], disc[v]);
            }
        }

        // If u is a root of an SCC
        if (low[u] == disc[u]) {
            List<Integer> scc = new ArrayList<>();
            int v;
            do {
                v = stack.pop();
                onStack[v] = false;
                scc.add(v);
            } while (v != u);
            sccs.add(scc);
        }
    }
}
```

```python
from collections import defaultdict

def tarjan_scc(graph: dict[int, list[int]], num_vertices: int) -> list[list[int]]:
    """Find all strongly connected components using Tarjan's algorithm."""
    disc = [-1] * num_vertices
    low = [0] * num_vertices
    on_stack = [False] * num_vertices
    stack: list[int] = []
    sccs: list[list[int]] = []
    time = [0]

    def dfs(u: int) -> None:
        disc[u] = low[u] = time[0]
        time[0] += 1
        stack.append(u)
        on_stack[u] = True

        for v in graph.get(u, []):
            if disc[v] == -1:
                dfs(v)
                low[u] = min(low[u], low[v])
            elif on_stack[v]:
                low[u] = min(low[u], disc[v])

        if low[u] == disc[u]:
            scc = []
            while True:
                v = stack.pop()
                on_stack[v] = False
                scc.append(v)
                if v == u:
                    break
            sccs.append(scc)

    for v in range(num_vertices):
        if disc[v] == -1:
            dfs(v)

    return sccs
```

## Common Pitfalls

- **Applying topological sort to graphs with cycles**: Topological sort is only defined for Directed Acyclic Graphs (DAGs). If the graph has a cycle, Kahn's algorithm will not process all vertices (some will retain non-zero in-degree), and DFS-based approaches will encounter back edges. Always check for cycles before relying on topological order, or use the algorithm's output to detect cycles (incomplete ordering indicates a cycle).

- **Confusing MST with shortest path tree**: A minimum spanning tree minimizes total edge weight to connect all vertices, but individual paths in the MST are not necessarily shortest paths. Dijkstra's shortest path tree from a source minimizes individual path lengths but may have higher total weight. These are different optimization objectives that produce different trees.

- **Using Kruskal's without proper Union-Find**: Implementing cycle detection with BFS/DFS instead of Union-Find makes Kruskal's O(E * V) instead of O(E log E). The Union-Find with path compression and union by rank provides nearly O(1) amortized operations, making the sort the bottleneck. Without these optimizations, Union-Find degenerates to O(V) per operation.

- **Not handling the transpose graph correctly in Kosaraju's**: Kosaraju's algorithm requires running DFS on the transpose (reversed) graph in the second pass. Building the transpose incorrectly (forgetting to reverse all edges, or reversing only some) produces incorrect SCC decomposition. Verify that every edge u→v in the original becomes v→u in the transpose.

- **Ignoring that max-flow algorithms need residual graphs**: Ford-Fulkerson and its variants operate on residual graphs that include both forward edges (remaining capacity) and backward edges (flow that can be cancelled). Forgetting to add backward edges prevents the algorithm from finding augmenting paths that require "undoing" previous flow decisions, leading to suboptimal solutions.

## Real-World Use Cases

**Build systems and task schedulers** (Make, Gradle, Bazel, Airflow) use topological sort to determine execution order for tasks with dependencies. Each task is a vertex, and dependencies are directed edges. Topological sort produces a valid execution order where every task runs after its dependencies complete. Parallel build systems identify independent tasks (vertices with no path between them) that can execute simultaneously, using the DAG structure to maximize parallelism.

**Network design and infrastructure planning** uses minimum spanning tree algorithms to find the cheapest way to connect all nodes. Telecommunications companies use MST to plan fiber optic cable routes connecting cities with minimum total cable length. Cloud providers use MST variants to design data center interconnects that minimize latency while ensuring full connectivity. Clustering algorithms (single-linkage clustering) use MST to group similar data points.

**Compiler optimization** uses strongly connected components to identify loops in control flow graphs. Each SCC in the control flow graph represents a set of basic blocks that form a loop (or nested loops). The compiler applies loop optimizations (unrolling, vectorization, invariant code motion) to these SCCs. Additionally, the condensation graph (DAG of SCCs) enables efficient dataflow analysis by processing SCCs in topological order.

**Network reliability analysis** uses articulation point and bridge detection to identify single points of failure. In telecommunications networks, an articulation point is a router whose failure disconnects part of the network. Network engineers ensure redundancy by adding backup links that eliminate all bridges and articulation points. The algorithm runs in O(V + E) and is used in network monitoring tools to continuously assess topology resilience.

**Bipartite matching and assignment problems** reduce to maximum flow in networks. Assigning workers to tasks, matching medical residents to hospitals, and scheduling airline crews all model as bipartite graphs where maximum matching finds the optimal assignment. The Hungarian algorithm and Hopcroft-Karp algorithm solve these efficiently, but they can also be formulated as max-flow problems on augmented networks.

## Interview Questions

**Q: What is a topological sort and when is it used?**

A: A topological sort is a linear ordering of vertices in a DAG such that for every directed edge u→v, u appears before v in the ordering. It is used for dependency resolution (build systems, package managers), task scheduling (course prerequisites, project planning), and determining evaluation order (spreadsheet cells, compiler instruction scheduling). It can be computed via Kahn's algorithm (BFS with in-degree tracking) or DFS (reverse post-order). If the graph has a cycle, no topological ordering exists.

**Q: Explain Kruskal's algorithm and its time complexity.**

A: Kruskal's builds an MST by sorting all edges by weight and greedily adding the lightest edge that does not create a cycle. Cycle detection uses Union-Find: if both endpoints of an edge are in the same component, adding it would create a cycle. The algorithm terminates after adding V-1 edges (a spanning tree property). Time complexity is O(E log E) for sorting plus O(E * α(V)) for Union-Find operations, dominated by the sort. It works well for sparse graphs and edge-list representations.

**Q: How do you find strongly connected components in a directed graph?**

A: Use Tarjan's algorithm (single DFS pass) or Kosaraju's algorithm (two DFS passes). Tarjan's maintains a stack and tracks discovery time and low-link values for each vertex. When a vertex's low-link equals its discovery time, it is the root of an SCC, and all vertices above it on the stack form that SCC. Kosaraju's first runs DFS to compute finish times, then runs DFS on the transpose graph in reverse finish order, with each DFS tree forming an SCC. Both run in O(V + E).

**Q: What is the max-flow min-cut theorem and how is it applied?**

A: The theorem states that the maximum flow from source to sink equals the minimum cut capacity (minimum total weight of edges whose removal disconnects source from sink). This is applied in network capacity planning (maximum data throughput), image segmentation (minimum energy cut separating foreground from background), project selection (maximum profit subset respecting dependencies), and bipartite matching (maximum matching equals minimum vertex cover by König's theorem). Algorithms like Edmonds-Karp (BFS-based Ford-Fulkerson) compute max flow in O(V × E²).

## Production Tips

- **Use incremental topological sort for dynamic DAGs**: When dependencies change frequently (live build systems, streaming dataflow), recomputing topological sort from scratch is wasteful. Maintain the topological order incrementally: when adding edge u→v, if u already appears after v in the order, reorder only the affected vertices between them. This provides O(affected vertices) update time instead of O(V + E) full recomputation.

- **Apply MST-based clustering for unsupervised learning**: Single-linkage hierarchical clustering is equivalent to computing the MST and removing the k-1 heaviest edges to produce k clusters. This approach handles non-convex cluster shapes that k-means cannot detect. For large datasets, use approximate MST algorithms (KD-tree based nearest neighbor MST) that run in O(n log n) instead of O(n²).

- **Use SCC decomposition to simplify graph problems**: Many graph problems become easier on DAGs. Compute SCCs, contract each SCC to a single vertex (condensation), and solve the problem on the resulting DAG. For example, finding the minimum number of vertices to reach all others reduces to finding sources in the condensation DAG. This technique applies to 2-SAT, reachability queries, and dependency analysis.

## Related Topics

- [Graph Representations and Traversal](./graph-representations-and-traversal.md) — BFS/DFS foundations that advanced algorithms build upon
- [Shortest Path Algorithms](./shortest-path-algorithms.md) — Complementary weighted graph algorithms
- [Binary Trees and BSTs](./binary-trees-and-bsts.md) — Union-Find uses tree structure for efficient set operations
- [Sorting and Searching](../sorting-and-searching/index.md) — Kruskal's relies on edge sorting
