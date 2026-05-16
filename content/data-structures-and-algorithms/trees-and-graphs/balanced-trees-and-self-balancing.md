# Balanced Trees and Self-Balancing

## Quick Reference

- **AVL tree operations**: O(log n) guaranteed — height difference at most 1 at every node
- **Red-Black tree operations**: O(log n) guaranteed — no path more than 2x the shortest
- **B-Tree operations**: O(log n) with branching factor b — O(log_b n) disk I/O
- **B+ Tree**: All data in leaves, internal nodes are index-only — optimized for range scans
- **AVL rotations per insert**: at most 2 (single or double rotation)
- **Red-Black rotations per insert**: at most 2 rotations + recoloring
- **AVL max height for n nodes**: 1.44 * log₂(n) — tighter than Red-Black
- **Red-Black max height for n nodes**: 2 * log₂(n+1) — looser but fewer rotations
- **B-Tree node capacity**: typically 100-1000 keys per node for disk-based systems
- **Splay tree amortized**: O(log n) — recently accessed elements move to root

## When to Use

Self-balancing trees guarantee O(log n) worst-case performance regardless of insertion order, solving the fundamental weakness of plain BSTs that degenerate to O(n) on sorted input. Choose the specific variant based on your access pattern and storage medium.

Use AVL trees when read operations dominate and you need the tightest possible height bound. AVL trees are at most 1.44 * log₂(n) tall, making lookups slightly faster than Red-Black trees. They are ideal for in-memory dictionaries with infrequent modifications, lookup tables that are built once and queried many times, and applications where worst-case lookup latency matters more than insertion throughput.

Use Red-Black trees when modifications are frequent and you want to minimize rotation overhead. Red-Black trees perform at most 2 rotations per insertion (compared to potentially O(log n) for AVL), making them better for write-heavy workloads. Java's TreeMap, C++ std::map, and Linux kernel's process scheduler all use Red-Black trees.

Use B-Trees and B+ Trees when data resides on disk and you need to minimize I/O operations. The high branching factor (hundreds of keys per node) keeps the tree extremely shallow (3-4 levels for billions of records), and each node fits in one disk page. Every major database engine uses B-Tree variants for indexing.

Use splay trees when access patterns exhibit temporal locality (recently accessed elements are likely to be accessed again). Splay trees move accessed elements to the root, providing O(1) amortized access for frequently used elements. They are used in caches, garbage collectors, and network routers.

## Code Examples

### AVL Tree with Rotations

A complete AVL tree implementation showing how rotations maintain the balance invariant (height difference at most 1) after insertions.

```java
public class AVLTree {
    static class Node {
        int val, height;
        Node left, right;
        Node(int val) { this.val = val; this.height = 1; }
    }

    private Node root;

    private int height(Node node) {
        return node == null ? 0 : node.height;
    }

    private int balanceFactor(Node node) {
        return node == null ? 0 : height(node.left) - height(node.right);
    }

    private void updateHeight(Node node) {
        node.height = 1 + Math.max(height(node.left), height(node.right));
    }

    /**
     * Right rotation: fixes left-heavy imbalance.
     *       y            x
     *      / \          / \
     *     x   C  →    A   y
     *    / \              / \
     *   A   B            B   C
     */
    private Node rotateRight(Node y) {
        Node x = y.left;
        Node B = x.right;
        x.right = y;
        y.left = B;
        updateHeight(y);
        updateHeight(x);
        return x;
    }

    /**
     * Left rotation: fixes right-heavy imbalance.
     *     x              y
     *    / \            / \
     *   A   y    →    x   C
     *      / \       / \
     *     B   C     A   B
     */
    private Node rotateLeft(Node x) {
        Node y = x.right;
        Node B = y.left;
        y.left = x;
        x.right = B;
        updateHeight(x);
        updateHeight(y);
        return y;
    }

    /**
     * Insert with automatic rebalancing.
     * After insertion, check balance factor and apply rotations.
     */
    public void insert(int val) {
        root = insertRec(root, val);
    }

    private Node insertRec(Node node, int val) {
        if (node == null) return new Node(val);

        if (val < node.val) node.left = insertRec(node.left, val);
        else if (val > node.val) node.right = insertRec(node.right, val);
        else return node;  // Duplicate

        updateHeight(node);
        int balance = balanceFactor(node);

        // Left-Left case: single right rotation
        if (balance > 1 && val < node.left.val) {
            return rotateRight(node);
        }
        // Right-Right case: single left rotation
        if (balance < -1 && val > node.right.val) {
            return rotateLeft(node);
        }
        // Left-Right case: left rotation on left child, then right rotation
        if (balance > 1 && val > node.left.val) {
            node.left = rotateLeft(node.left);
            return rotateRight(node);
        }
        // Right-Left case: right rotation on right child, then left rotation
        if (balance < -1 && val < node.right.val) {
            node.right = rotateRight(node.right);
            return rotateLeft(node);
        }

        return node;
    }
}
```

```typescript
class AVLNode {
  val: number;
  height: number = 1;
  left: AVLNode | null = null;
  right: AVLNode | null = null;

  constructor(val: number) {
    this.val = val;
  }
}

class AVLTree {
  private root: AVLNode | null = null;

  private height(node: AVLNode | null): number {
    return node ? node.height : 0;
  }

  private balanceFactor(node: AVLNode): number {
    return this.height(node.left) - this.height(node.right);
  }

  private updateHeight(node: AVLNode): void {
    node.height = 1 + Math.max(this.height(node.left), this.height(node.right));
  }

  private rotateRight(y: AVLNode): AVLNode {
    const x = y.left!;
    y.left = x.right;
    x.right = y;
    this.updateHeight(y);
    this.updateHeight(x);
    return x;
  }

  private rotateLeft(x: AVLNode): AVLNode {
    const y = x.right!;
    x.right = y.left;
    y.left = x;
    this.updateHeight(x);
    this.updateHeight(y);
    return y;
  }

  insert(val: number): void {
    this.root = this.insertRec(this.root, val);
  }

  private insertRec(node: AVLNode | null, val: number): AVLNode {
    if (!node) return new AVLNode(val);

    if (val < node.val) node.left = this.insertRec(node.left, val);
    else if (val > node.val) node.right = this.insertRec(node.right, val);
    else return node;

    this.updateHeight(node);
    const balance = this.balanceFactor(node);

    if (balance > 1 && node.left && val < node.left.val) return this.rotateRight(node);
    if (balance < -1 && node.right && val > node.right.val) return this.rotateLeft(node);
    if (balance > 1 && node.left && val > node.left.val) {
      node.left = this.rotateLeft(node.left);
      return this.rotateRight(node);
    }
    if (balance < -1 && node.right && val < node.right.val) {
      node.right = this.rotateRight(node.right);
      return this.rotateLeft(node);
    }

    return node;
  }
}
```

### Red-Black Tree Properties and Insertion

Red-Black trees maintain balance through coloring rules rather than strict height constraints. The implementation shows the rebalancing cases after insertion.

```java
public class RedBlackTree {
    private static final boolean RED = true;
    private static final boolean BLACK = false;

    static class Node {
        int val;
        boolean color;
        Node left, right, parent;

        Node(int val) {
            this.val = val;
            this.color = RED;  // New nodes are always red
        }
    }

    private Node root;

    /**
     * Red-Black Tree properties:
     * 1. Every node is red or black
     * 2. Root is always black
     * 3. All null leaves are black
     * 4. Red node cannot have red children (no two consecutive reds)
     * 5. Every path from root to null leaf has same number of black nodes
     */
    public void insert(int val) {
        Node newNode = new Node(val);
        root = bstInsert(root, newNode);
        fixInsert(newNode);
    }

    private Node bstInsert(Node root, Node newNode) {
        if (root == null) return newNode;

        if (newNode.val < root.val) {
            root.left = bstInsert(root.left, newNode);
            root.left.parent = root;
        } else if (newNode.val > root.val) {
            root.right = bstInsert(root.right, newNode);
            root.right.parent = root;
        }
        return root;
    }

    /**
     * Fix Red-Black violations after insertion.
     * Cases depend on uncle's color:
     * - Red uncle: recolor parent, uncle, grandparent
     * - Black uncle: rotate and recolor
     */
    private void fixInsert(Node node) {
        while (node != root && node.parent.color == RED) {
            Node parent = node.parent;
            Node grandparent = parent.parent;

            if (parent == grandparent.left) {
                Node uncle = grandparent.right;
                if (uncle != null && uncle.color == RED) {
                    // Case 1: Red uncle — recolor
                    parent.color = BLACK;
                    uncle.color = BLACK;
                    grandparent.color = RED;
                    node = grandparent;
                } else {
                    if (node == parent.right) {
                        // Case 2: Black uncle, node is right child — left rotate parent
                        node = parent;
                        rotateLeft(node);
                    }
                    // Case 3: Black uncle, node is left child — right rotate grandparent
                    node.parent.color = BLACK;
                    grandparent.color = RED;
                    rotateRight(grandparent);
                }
            } else {
                // Mirror cases for parent == grandparent.right
                Node uncle = grandparent.left;
                if (uncle != null && uncle.color == RED) {
                    parent.color = BLACK;
                    uncle.color = BLACK;
                    grandparent.color = RED;
                    node = grandparent;
                } else {
                    if (node == parent.left) {
                        node = parent;
                        rotateRight(node);
                    }
                    node.parent.color = BLACK;
                    grandparent.color = RED;
                    rotateLeft(grandparent);
                }
            }
        }
        root.color = BLACK;
    }

    private void rotateLeft(Node x) {
        Node y = x.right;
        x.right = y.left;
        if (y.left != null) y.left.parent = x;
        y.parent = x.parent;
        if (x.parent == null) root = y;
        else if (x == x.parent.left) x.parent.left = y;
        else x.parent.right = y;
        y.left = x;
        x.parent = y;
    }

    private void rotateRight(Node y) {
        Node x = y.left;
        y.left = x.right;
        if (x.right != null) x.right.parent = y;
        x.parent = y.parent;
        if (y.parent == null) root = x;
        else if (y == y.parent.left) y.parent.left = x;
        else y.parent.right = x;
        x.right = y;
        y.parent = x;
    }
}
```

## Common Pitfalls

- **Forgetting to update heights after rotations**: In AVL trees, both the rotated node and its new parent must have their heights recalculated after a rotation. Updating only one node leaves stale height values that cause incorrect balance factor calculations on subsequent insertions, leading to an unbalanced tree that violates the AVL invariant silently.

- **Applying the wrong rotation case**: AVL rebalancing has four cases (LL, RR, LR, RL) determined by where the imbalance occurs and where the heavy subtree is. Applying a single rotation when a double rotation is needed (LR or RL case) does not fix the imbalance and may make it worse. Always check both the balance factor of the unbalanced node and the balance factor of its heavy child to determine the correct case.

- **Violating Red-Black properties during deletion**: Red-Black tree deletion is significantly more complex than insertion, with multiple cases depending on the deleted node's color, its replacement's color, and the sibling's color and children. Implementing deletion incorrectly can violate the black-height property (property 5), causing subsequent operations to produce wrong results. Most production implementations use the "double-black" concept to track the deficit.

- **Using self-balancing trees when simpler structures suffice**: If your data is inserted once and queried many times with no ordering requirement, a hash map provides O(1) lookup versus O(log n) for trees. If the dataset is small (under 1000 elements), the constant factors of tree operations (pointer chasing, cache misses) may make linear scan on a sorted array faster due to cache locality.

- **Ignoring the constant factors of tree operations**: While trees provide O(log n) guarantees, each operation involves pointer dereferencing (cache misses), comparisons, and potential rotations. For datasets that fit in L1/L2 cache, a sorted array with binary search outperforms trees due to cache-friendly sequential access. B-Trees address this by packing many keys per node, improving cache utilization.

## Real-World Use Cases

**Database indexes** universally use B-Tree and B+ Tree variants. PostgreSQL's default index type is a B-Tree that stores keys in sorted order across pages (typically 8KB each). Each internal page holds hundreds of keys, keeping the tree 3-4 levels deep for tables with billions of rows. B+ Trees store all actual data in leaf nodes connected by sibling pointers, enabling efficient range scans by following leaf-level links without traversing back up the tree.

**Java's TreeMap and ConcurrentSkipListMap** provide sorted map implementations for application code. TreeMap uses a Red-Black tree for O(log n) operations with methods like `subMap()`, `floorKey()`, and `ceilingKey()` that exploit the sorted structure. ConcurrentSkipListMap provides similar functionality with lock-free concurrent access using a probabilistic skip list structure that provides expected O(log n) operations.

**Linux kernel's Completely Fair Scheduler** uses a Red-Black tree to manage runnable processes. Each process is a node keyed by its virtual runtime (how much CPU time it has consumed). The scheduler always picks the leftmost node (smallest virtual runtime) as the next process to run, ensuring fairness. The Red-Black tree provides O(log n) insertion and O(1) minimum extraction (cached leftmost pointer).

**File system metadata** in modern operating systems uses B-Tree variants. NTFS uses B+ Trees for directory entries and the Master File Table. Apple's APFS uses copy-on-write B-Trees that enable instant snapshots by sharing unchanged nodes between the current state and snapshot. ext4 uses extent trees (a B-Tree variant) to map logical file blocks to physical disk blocks.

**In-memory databases** like Redis use skip lists (probabilistic balanced structures) for sorted sets, providing O(log n) insertion, deletion, and range queries. The skip list's simpler implementation and better cache behavior compared to Red-Black trees make it preferable for this use case. MemSQL and VoltDB use lock-free concurrent skip lists for their indexes.

## Interview Questions

**Q: Compare AVL trees and Red-Black trees. When would you choose one over the other?**

A: AVL trees maintain stricter balance (height difference at most 1), resulting in shorter trees and faster lookups. Red-Black trees allow looser balance (longest path at most 2x shortest), requiring fewer rotations on modifications. Choose AVL for read-heavy workloads where lookup speed is critical (lookup tables, dictionaries). Choose Red-Black for write-heavy workloads where insertion and deletion frequency is high (in-memory databases, schedulers). In practice, the difference is small — both provide O(log n) — and the choice often comes down to implementation availability.

**Q: Why do databases use B-Trees instead of binary trees?**

A: B-Trees minimize disk I/O by maximizing the branching factor. A binary tree with 1 billion nodes has height 30, requiring 30 disk reads per lookup. A B-Tree with 500 keys per node has height 3-4, requiring only 3-4 disk reads. Each B-Tree node is sized to fit one disk page (4-16KB), so each level requires exactly one I/O operation. Additionally, B-Trees keep keys sorted within nodes, enabling efficient range scans by reading sequential pages.

**Q: Explain the Red-Black tree insertion algorithm and its time complexity.**

A: After standard BST insertion (new node colored red), fix potential violations of the "no two consecutive reds" rule. Walk up the tree checking the uncle's color: if the uncle is red, recolor parent, uncle, and grandparent, then move up. If the uncle is black, perform 1-2 rotations and recolor to fix the violation locally. The fix-up traverses at most O(log n) ancestors (recoloring) but performs at most 2 rotations total, making insertion O(log n) with very low constant factors.

**Q: What is a splay tree and what are its advantages?**

A: A splay tree moves every accessed node to the root through a sequence of rotations (splaying). This provides O(log n) amortized time for all operations and O(1) amortized time for recently accessed elements. Advantages include no extra storage for balance information (unlike AVL height or Red-Black color), automatic adaptation to access patterns (frequently accessed elements stay near the root), and the working set property (if you access k distinct elements, operations cost O(log k) amortized). Disadvantages include O(n) worst-case per operation and poor cache behavior due to constant restructuring.

## Production Tips

- **Use B+ Trees with write-ahead logging for crash-safe storage**: Production databases combine B+ Trees with WAL (Write-Ahead Logging) to ensure durability. Before modifying a B+ Tree page, write the change to a sequential log file. On crash recovery, replay the log to restore the tree to a consistent state. This pattern (used by PostgreSQL, SQLite, InnoDB) provides both the performance of B+ Tree indexing and the safety of transactional guarantees.

- **Consider LSM Trees for write-heavy workloads**: Log-Structured Merge Trees (used by RocksDB, LevelDB, Cassandra) buffer writes in memory (memtable, typically a Red-Black tree or skip list) and periodically flush to sorted disk files (SSTables). This converts random writes into sequential writes, achieving 10-100x better write throughput than B-Trees at the cost of slower reads (must check multiple levels). Choose LSM Trees for write-heavy workloads like time-series data, event logging, and message queues.

- **Profile tree depth and rotation frequency in production**: Monitor your tree's actual height and rotation count to detect pathological access patterns. If your Red-Black tree consistently hits maximum height, your key distribution may benefit from a different structure. Tools like Java Flight Recorder can profile TreeMap operations to identify hot paths and contention points in concurrent access patterns.

## Related Topics

- [Binary Trees and BSTs](./binary-trees-and-bsts.md) — Foundation that balanced trees build upon
- [Graph Representations and Traversal](./graph-representations-and-traversal.md) — Trees as special cases of graphs
- [Sorting and Searching](../sorting-and-searching/index.md) — Tree-based sorting and search operations
- [Heap](../heap.md) — Alternative tree structure for priority queue operations
