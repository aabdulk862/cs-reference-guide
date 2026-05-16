# Graph Representations and Traversal

## Quick Reference

- **Adjacency matrix space**: O(V²) — best for dense graphs with frequent edge queries
- **Adjacency list space**: O(V + E) — best for sparse graphs with neighbor iteration
- **BFS time complexity**: O(V + E) — explores level by level using a queue
- **DFS time complexity**: O(V + E) — explores depth-first using stack/recursion
- **BFS space**: O(V) for the queue and visited set
- **DFS space**: O(V) for the recursion stack or explicit stack
- **Edge list space**: O(E) — simplest representation, used in Kruskal's algorithm
- **Connected components**: O(V + E) via BFS/DFS from each unvisited vertex
- **Bipartite check**: O(V + E) via BFS/DFS with 2-coloring
- **Cycle detection (undirected)**: O(V + E) via DFS checking back edges
- **Cycle detection (directed)**: O(V + E) via DFS with three-color marking

## When to Use

Graph representations and traversal algorithms are fundamental whenever your problem involves relationships between entities that are not strictly hierarchical. The choice of representation determines the efficiency of all subsequent operations, and the choice of traversal determines what properties you can discover.

Use adjacency lists when the graph is sparse (E is much less than V²), when you primarily iterate over neighbors of a vertex, or when memory is constrained. Most real-world graphs are sparse: social networks average 100-1000 connections per user out of millions of possible connections. Adjacency lists are the default choice for production graph algorithms.

Use adjacency matrices when the graph is dense (E approaches V²), when you need O(1) edge existence queries, or when implementing algorithms that access edges by both endpoints (Floyd-Warshall). Small dense graphs (under 1000 vertices) benefit from the cache-friendly contiguous memory layout of matrices.

Use BFS when you need shortest paths in unweighted graphs, level-order exploration, or minimum number of steps to reach a target. BFS guarantees that the first time you visit a node, you have found the shortest path to it (in terms of edge count).

Use DFS when you need topological ordering, cycle detection, strongly connected components, or exhaustive path enumeration. DFS naturally supports backtracking and is the basis for most graph decomposition algorithms.

## Code Examples

### Graph Implementation with Adjacency List

A production-quality graph implementation supporting both directed and undirected graphs with weighted edges.

```java
public class Graph {
    private final Map<Integer, List<int[]>> adjList;  // vertex -> [(neighbor, weight)]
    private final boolean directed;
    private int vertexCount;

    public Graph(boolean directed) {
        this.adjList = new HashMap<>();
        this.directed = directed;
        this.vertexCount = 0;
    }

    public void addVertex(int v) {
        adjList.putIfAbsent(v, new ArrayList<>());
        vertexCount = Math.max(vertexCount, v + 1);
    }

    public void addEdge(int u, int v, int weight) {
        addVertex(u);
        addVertex(v);
        adjList.get(u).add(new int[]{v, weight});
        if (!directed) {
            adjList.get(v).add(new int[]{u, weight});
        }
    }

    public void addEdge(int u, int v) {
        addEdge(u, v, 1);
    }

    public List<int[]> neighbors(int v) {
        return adjList.getOrDefault(v, Collections.emptyList());
    }

    /**
     * BFS: shortest path in unweighted graph.
     * Returns distance array where dist[v] = shortest distance from source.
     * Time: O(V + E), Space: O(V)
     */
    public int[] bfs(int source) {
        int[] dist = new int[vertexCount];
        Arrays.fill(dist, -1);
        dist[source] = 0;

        Queue<Integer> queue = new ArrayDeque<>();
        queue.offer(source);

        while (!queue.isEmpty()) {
            int curr = queue.poll();
            for (int[] edge : neighbors(curr)) {
                int neighbor = edge[0];
                if (dist[neighbor] == -1) {
                    dist[neighbor] = dist[curr] + 1;
                    queue.offer(neighbor);
                }
            }
        }
        return dist;
    }

    /**
     * DFS iterative: visits all reachable vertices from source.
     * Returns visited set.
     */
    public Set<Integer> dfs(int source) {
        Set<Integer> visited = new HashSet<>();
        Deque<Integer> stack = new ArrayDeque<>();
        stack.push(source);

        while (!stack.isEmpty()) {
            int curr = stack.pop();
            if (visited.contains(curr)) continue;
            visited.add(curr);

            for (int[] edge : neighbors(curr)) {
                if (!visited.contains(edge[0])) {
                    stack.push(edge[0]);
                }
            }
        }
        return visited;
    }
}
```

```typescript
class Graph {
  private adjList: Map<number, [number, number][]> = new Map();
  private directed: boolean;

  constructor(directed: boolean = false) {
    this.directed = directed;
  }

  addEdge(u: number, v: number, weight: number = 1): void {
    if (!this.adjList.has(u)) this.adjList.set(u, []);
    if (!this.adjList.has(v)) this.adjList.set(v, []);
    this.adjList.get(u)!.push([v, weight]);
    if (!this.directed) {
      this.adjList.get(v)!.push([u, weight]);
    }
  }

  bfs(source: number): Map<number, number> {
    const dist = new Map<number, number>();
    dist.set(source, 0);
    const queue: number[] = [source];
    let front = 0;

    while (front < queue.length) {
      const curr = queue[front++];
      for (const [neighbor] of this.adjList.get(curr) ?? []) {
        if (!dist.has(neighbor)) {
          dist.set(neighbor, dist.get(curr)! + 1);
          queue.push(neighbor);
        }
      }
    }
    return dist;
  }

  dfs(source: number): Set<number> {
    const visited = new Set<number>();
    const stack: number[] = [source];

    while (stack.length > 0) {
      const curr = stack.pop()!;
      if (visited.has(curr)) continue;
      visited.add(curr);

      for (const [neighbor] of this.adjList.get(curr) ?? []) {
        if (!visited.has(neighbor)) {
          stack.push(neighbor);
        }
      }
    }
    return visited;
  }
}
```

### Connected Components and Cycle Detection

Algorithms for discovering graph structure: finding connected components in undirected graphs and detecting cycles in directed graphs.

```java
public class GraphAlgorithms {
    /**
     * Find all connected components in an undirected graph.
     * Returns list of components, each component is a set of vertices.
     * Time: O(V + E), Space: O(V)
     */
    public static List<Set<Integer>> connectedComponents(
            Map<Integer, List<Integer>> graph, int numVertices) {
        List<Set<Integer>> components = new ArrayList<>();
        boolean[] visited = new boolean[numVertices];

        for (int v = 0; v < numVertices; v++) {
            if (!visited[v]) {
                Set<Integer> component = new HashSet<>();
                Queue<Integer> queue = new ArrayDeque<>();
                queue.offer(v);
                visited[v] = true;

                while (!queue.isEmpty()) {
                    int curr = queue.poll();
                    component.add(curr);
                    for (int neighbor : graph.getOrDefault(curr, List.of())) {
                        if (!visited[neighbor]) {
                            visited[neighbor] = true;
                            queue.offer(neighbor);
                        }
                    }
                }
                components.add(component);
            }
        }
        return components;
    }

    /**
     * Detect cycle in directed graph using three-color DFS.
     * WHITE = unvisited, GRAY = in current path, BLACK = fully processed.
     * A back edge to a GRAY node indicates a cycle.
     * Time: O(V + E)
     */
    public static boolean hasCycleDirected(
            Map<Integer, List<Integer>> graph, int numVertices) {
        int[] color = new int[numVertices];  // 0=WHITE, 1=GRAY, 2=BLACK

        for (int v = 0; v < numVertices; v++) {
            if (color[v] == 0 && dfsCycle(graph, v, color)) {
                return true;
            }
        }
        return false;
    }

    private static boolean dfsCycle(
            Map<Integer, List<Integer>> graph, int v, int[] color) {
        color[v] = 1;  // GRAY: currently being explored
        for (int neighbor : graph.getOrDefault(v, List.of())) {
            if (color[neighbor] == 1) return true;   // Back edge to ancestor
            if (color[neighbor] == 0 && dfsCycle(graph, neighbor, color)) return true;
        }
        color[v] = 2;  // BLACK: fully processed
        return false;
    }

    /**
     * Check if undirected graph is bipartite (2-colorable).
     * Uses BFS with alternating colors.
     * Time: O(V + E)
     */
    public static boolean isBipartite(
            Map<Integer, List<Integer>> graph, int numVertices) {
        int[] color = new int[numVertices];
        Arrays.fill(color, -1);

        for (int start = 0; start < numVertices; start++) {
            if (color[start] != -1) continue;
            color[start] = 0;
            Queue<Integer> queue = new ArrayDeque<>();
            queue.offer(start);

            while (!queue.isEmpty()) {
                int curr = queue.poll();
                for (int neighbor : graph.getOrDefault(curr, List.of())) {
                    if (color[neighbor] == -1) {
                        color[neighbor] = 1 - color[curr];
                        queue.offer(neighbor);
                    } else if (color[neighbor] == color[curr]) {
                        return false;  // Same color on adjacent nodes
                    }
                }
            }
        }
        return true;
    }
}
```

```python
from collections import deque, defaultdict

def connected_components(graph: dict[int, list[int]], num_vertices: int) -> list[set[int]]:
    """Find all connected components using BFS. O(V + E) time."""
    visited = set()
    components = []

    for v in range(num_vertices):
        if v in visited:
            continue
        component = set()
        queue = deque([v])
        visited.add(v)

        while queue:
            curr = queue.popleft()
            component.add(curr)
            for neighbor in graph.get(curr, []):
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)

        components.append(component)
    return components

def has_cycle_directed(graph: dict[int, list[int]], num_vertices: int) -> bool:
    """Detect cycle in directed graph using three-color DFS."""
    WHITE, GRAY, BLACK = 0, 1, 2
    color = [WHITE] * num_vertices

    def dfs(v: int) -> bool:
        color[v] = GRAY
        for neighbor in graph.get(v, []):
            if color[neighbor] == GRAY:
                return True
            if color[neighbor] == WHITE and dfs(neighbor):
                return True
        color[v] = BLACK
        return False

    return any(color[v] == WHITE and dfs(v) for v in range(num_vertices))
```

## Common Pitfalls

- **Not handling disconnected graphs**: BFS or DFS from a single source only visits the connected component containing that source. If the graph has multiple components, you must iterate over all vertices and start a new traversal for each unvisited vertex. Forgetting this causes algorithms to miss entire portions of the graph, producing incorrect results for problems like "count connected components" or "detect if graph has a cycle."

- **Infinite loops in cyclic graphs without visited tracking**: Traversing a graph with cycles without maintaining a visited set causes infinite loops. Every graph traversal must track which vertices have been visited. For BFS, mark vertices as visited when they are added to the queue (not when dequeued) to avoid adding the same vertex multiple times. For DFS, mark before recursing into neighbors.

- **Confusing directed and undirected edge addition**: When building an undirected graph from edge pairs, you must add edges in both directions (u→v and v→u). Forgetting the reverse edge creates a directed graph unintentionally, causing BFS/DFS to miss reachable vertices. This is the most common bug when implementing graph algorithms from scratch.

- **Using adjacency matrix for large sparse graphs**: An adjacency matrix for a graph with 100,000 vertices requires 10 billion entries (40GB for int, 10GB for boolean). Most real-world graphs are sparse — a social network with 1 million users and 100 connections each needs only 100 million entries in an adjacency list versus 1 trillion in a matrix. Always default to adjacency lists unless the graph is provably dense.

- **Stack overflow with recursive DFS on large graphs**: Recursive DFS on graphs with tens of thousands of vertices can overflow the call stack. The maximum recursion depth equals the longest path in the graph, which can be O(V) for path graphs or graphs with long chains. Use iterative DFS with an explicit stack for production code handling large graphs.

## Real-World Use Cases

**Social network analysis** models users as vertices and relationships as edges. Facebook's social graph has billions of vertices and hundreds of billions of edges. Operations like "find mutual friends" (common neighbors), "people you may know" (friends of friends), and "degrees of separation" (shortest path) are all graph traversal problems. These systems use distributed graph processing frameworks (Apache Giraph, GraphX) because the graph exceeds single-machine memory.

**Web crawling and search engine indexing** treats web pages as vertices and hyperlinks as directed edges. A web crawler performs BFS from seed URLs, discovering new pages level by level. Google's PageRank algorithm computes vertex importance by simulating random walks on the web graph. The web graph has trillions of edges, requiring distributed graph processing and careful deduplication of URLs.

**Network routing protocols** use graph algorithms to find optimal paths between routers. OSPF (Open Shortest Path First) uses Dijkstra's algorithm on a graph where routers are vertices and links are weighted edges. BGP (Border Gateway Protocol) uses path-vector routing on the internet's autonomous system graph. When a link fails, routers recompute shortest paths using incremental graph updates.

**Dependency resolution** in build systems (Make, Gradle, Bazel) and package managers (npm, pip, Maven) models packages as vertices and dependencies as directed edges. Topological sort determines build order, and cycle detection identifies circular dependencies that make builds impossible. The npm registry graph has millions of packages with complex dependency chains that must be resolved efficiently.

**Garbage collection** in managed runtimes (JVM, .NET CLR, V8) uses graph traversal to identify unreachable objects. The heap is modeled as a directed graph where objects are vertices and references are edges. Starting from root references (stack variables, static fields), the collector performs BFS/DFS to mark all reachable objects. Unreachable objects are collected. Modern collectors (G1, ZGC, Shenandoah) use concurrent graph traversal to minimize pause times.

## Interview Questions

**Q: How would you detect if a directed graph has a cycle?**

A: Use DFS with three-color marking: WHITE (unvisited), GRAY (in current DFS path), BLACK (fully processed). Start DFS from each unvisited vertex. When entering a vertex, color it GRAY. When all descendants are processed, color it BLACK. If DFS encounters a GRAY vertex, a back edge exists, indicating a cycle. Alternatively, use Kahn's algorithm for topological sort: if not all vertices are processed (some have non-zero in-degree remaining), a cycle exists. Both approaches run in O(V + E) time.

**Q: Explain the difference between BFS and DFS. When would you choose one over the other?**

A: BFS explores level by level using a queue, guaranteeing shortest paths in unweighted graphs. DFS explores depth-first using a stack or recursion, naturally supporting backtracking and topological ordering. Choose BFS for shortest path problems, level-order traversal, and finding minimum steps. Choose DFS for topological sort, cycle detection, strongly connected components, and exhaustive path enumeration. BFS uses O(width) space (can be O(V) for wide graphs), while DFS uses O(height) space (can be O(V) for deep graphs).

**Q: How would you find if a path exists between two nodes in an undirected graph?**

A: Run BFS or DFS from the source node. If the target is visited during traversal, a path exists. For repeated queries on the same graph, precompute connected components using Union-Find (disjoint set) in O(V + E) time, then answer each query in O(α(V)) ≈ O(1) by checking if both nodes belong to the same component. Union-Find is preferred when the graph is static and queries are frequent.

**Q: How do you find all connected components in an undirected graph?**

A: Iterate over all vertices. For each unvisited vertex, start a BFS or DFS and mark all reachable vertices as belonging to the same component. Each traversal discovers one complete component. Time is O(V + E) total because each vertex and edge is processed exactly once across all traversals. Alternatively, use Union-Find: process each edge by unioning its endpoints, then group vertices by their root representative.

## Production Tips

- **Use compressed sparse row (CSR) format for static graphs**: When the graph structure does not change after construction, CSR format stores all neighbor lists in a single contiguous array with an offset array indicating where each vertex's neighbors begin. This eliminates per-vertex allocation overhead and provides excellent cache behavior for sequential neighbor iteration. Graph processing frameworks (GraphBLAS, Ligra) use CSR as their primary format.

- **Implement bidirectional BFS for point-to-point queries**: When finding the shortest path between two specific vertices in a large graph, search simultaneously from both source and target. The search spaces meet in the middle, reducing explored vertices from O(b^d) to O(b^(d/2)) where b is the branching factor and d is the distance. This is the approach used by routing engines (Google Maps, OSRM) combined with hierarchical decomposition.

- **Use graph partitioning for distributed processing**: When a graph exceeds single-machine memory, partition vertices across machines using balanced graph partitioning (METIS, KaHIP) to minimize cross-partition edges. Each machine processes its local subgraph, communicating only along partition boundaries. This reduces network traffic by 10-100x compared to random partitioning. Systems like Pregel, GraphX, and PowerGraph implement this pattern.

## Related Topics

- [Binary Trees and BSTs](./binary-trees-and-bsts.md) — Trees are acyclic connected graphs with hierarchical structure
- [Shortest Path Algorithms](./shortest-path-algorithms.md) — Weighted graph traversal for optimal paths
- [Advanced Graph Algorithms](./advanced-graph-algorithms.md) — Topological sort, MST, and SCC build on traversal
- [Queue](../fundamental-data-structures/queue.md) — BFS uses queues for level-order exploration
