# Binary Trees and BSTs

## Quick Reference

- **Binary Search Tree search/insert/delete**: O(log n) average, O(n) worst (unbalanced)
- **Tree traversal (any order)**: O(n) visits every node exactly once
- **Pre-order**: Root → Left → Right (used for serialization, copying)
- **In-order**: Left → Root → Right (produces sorted output for BST)
- **Post-order**: Left → Right → Root (used for deletion, expression evaluation)
- **Level-order (BFS)**: O(n) time, O(w) space where w is maximum width
- **Height of balanced tree**: O(log n)
- **Height of degenerate tree**: O(n) — linked list behavior
- **Space for n nodes**: O(n) for the tree, O(h) for recursive traversal stack
- **Binary tree max nodes at level k**: 2^k
- **Complete binary tree height**: floor(log₂ n)

## When to Use

Binary trees and BSTs are the right choice when you need ordered data with efficient search, insertion, and deletion. They bridge the gap between O(1) hash-based structures (which provide no ordering) and O(n) linear structures (which maintain order but have slow operations).

Choose BSTs when you need sorted iteration over elements, range queries (find all elements between x and y), floor and ceiling operations (find the largest element less than or equal to x), or ordered statistics (find the kth smallest element). These operations are impossible or expensive with hash maps.

Choose binary trees as the underlying structure when implementing priority queues (heaps), expression parsers (expression trees), decision systems (decision trees), or hierarchical data models (DOM trees, file systems). The recursive structure of binary trees maps naturally to divide-and-conquer algorithms.

Avoid plain BSTs when input may be sorted or nearly sorted, as this creates degenerate O(n) behavior. Use self-balancing variants (AVL, Red-Black) for guaranteed O(log n) performance. Avoid trees entirely when you only need O(1) lookup without ordering (use hash maps) or when data is flat with no hierarchical relationships (use arrays).

In production systems, you rarely implement BSTs from scratch. Java provides TreeMap and TreeSet (Red-Black tree backed), C++ provides std::map and std::set (typically Red-Black tree), and Python provides sortedcontainers. Understanding the underlying tree mechanics helps you choose the right data structure and debug performance issues.

## Code Examples

### Binary Search Tree with Full Operations

A complete BST implementation demonstrating insertion, search, deletion (including the complex three-case delete), and in-order traversal for sorted output.

```java
public class BinarySearchTree {
    private TreeNode root;

    static class TreeNode {
        int val;
        TreeNode left, right;
        TreeNode(int val) { this.val = val; }
    }

    /**
     * Insert a value maintaining BST property.
     * Time: O(h) where h is tree height.
     */
    public void insert(int val) {
        root = insertRec(root, val);
    }

    private TreeNode insertRec(TreeNode node, int val) {
        if (node == null) return new TreeNode(val);
        if (val < node.val) node.left = insertRec(node.left, val);
        else if (val > node.val) node.right = insertRec(node.right, val);
        // Duplicate values ignored
        return node;
    }

    /**
     * Search for a value. Returns true if found.
     * Iterative version avoids stack overhead for deep trees.
     */
    public boolean search(int val) {
        TreeNode current = root;
        while (current != null) {
            if (val == current.val) return true;
            current = val < current.val ? current.left : current.right;
        }
        return false;
    }

    /**
     * Delete a node handling three cases:
     * 1. Leaf node: simply remove
     * 2. One child: replace with child
     * 3. Two children: replace with in-order successor
     */
    public void delete(int val) {
        root = deleteRec(root, val);
    }

    private TreeNode deleteRec(TreeNode node, int val) {
        if (node == null) return null;

        if (val < node.val) {
            node.left = deleteRec(node.left, val);
        } else if (val > node.val) {
            node.right = deleteRec(node.right, val);
        } else {
            // Found the node to delete
            if (node.left == null) return node.right;
            if (node.right == null) return node.left;

            // Two children: find in-order successor (smallest in right subtree)
            TreeNode successor = findMin(node.right);
            node.val = successor.val;
            node.right = deleteRec(node.right, successor.val);
        }
        return node;
    }

    private TreeNode findMin(TreeNode node) {
        while (node.left != null) node = node.left;
        return node;
    }

    /**
     * In-order traversal produces sorted output for BST.
     */
    public List<Integer> inOrder() {
        List<Integer> result = new ArrayList<>();
        inOrderRec(root, result);
        return result;
    }

    private void inOrderRec(TreeNode node, List<Integer> result) {
        if (node == null) return;
        inOrderRec(node.left, result);
        result.add(node.val);
        inOrderRec(node.right, result);
    }
}
```

```typescript
class TreeNode {
  val: number;
  left: TreeNode | null = null;
  right: TreeNode | null = null;

  constructor(val: number) {
    this.val = val;
  }
}

class BST {
  private root: TreeNode | null = null;

  insert(val: number): void {
    this.root = this.insertRec(this.root, val);
  }

  private insertRec(node: TreeNode | null, val: number): TreeNode {
    if (!node) return new TreeNode(val);
    if (val < node.val) node.left = this.insertRec(node.left, val);
    else if (val > node.val) node.right = this.insertRec(node.right, val);
    return node;
  }

  search(val: number): boolean {
    let current = this.root;
    while (current) {
      if (val === current.val) return true;
      current = val < current.val ? current.left : current.right;
    }
    return false;
  }

  inOrder(): number[] {
    const result: number[] = [];
    const traverse = (node: TreeNode | null) => {
      if (!node) return;
      traverse(node.left);
      result.push(node.val);
      traverse(node.right);
    };
    traverse(this.root);
    return result;
  }
}
```

### Classic Tree Interview Problems

Solutions to the most frequently asked tree problems in technical interviews, demonstrating recursive thinking and tree property validation.

```java
public class TreeProblems {
    /**
     * Validate BST using range-based approach.
     * Each node must be within (min, max) exclusive bounds.
     * Time: O(n), Space: O(h)
     */
    public static boolean isValidBST(TreeNode root) {
        return validate(root, Long.MIN_VALUE, Long.MAX_VALUE);
    }

    private static boolean validate(TreeNode node, long min, long max) {
        if (node == null) return true;
        if (node.val <= min || node.val >= max) return false;
        return validate(node.left, min, node.val) &&
               validate(node.right, node.val, max);
    }

    /**
     * Lowest Common Ancestor in a binary tree.
     * Post-order traversal: if both sides return non-null, current is LCA.
     * Time: O(n), Space: O(h)
     */
    public static TreeNode lowestCommonAncestor(TreeNode root, TreeNode p, TreeNode q) {
        if (root == null || root == p || root == q) return root;
        TreeNode left = lowestCommonAncestor(root.left, p, q);
        TreeNode right = lowestCommonAncestor(root.right, p, q);
        if (left != null && right != null) return root;
        return left != null ? left : right;
    }

    /**
     * Maximum depth (height) of binary tree.
     * Time: O(n), Space: O(h)
     */
    public static int maxDepth(TreeNode root) {
        if (root == null) return 0;
        return 1 + Math.max(maxDepth(root.left), maxDepth(root.right));
    }

    /**
     * Check if tree is height-balanced (height diff <= 1 at every node).
     * Returns -1 for unbalanced, otherwise returns height.
     * Time: O(n) — single pass bottom-up
     */
    public static boolean isBalanced(TreeNode root) {
        return checkHeight(root) != -1;
    }

    private static int checkHeight(TreeNode node) {
        if (node == null) return 0;
        int left = checkHeight(node.left);
        if (left == -1) return -1;
        int right = checkHeight(node.right);
        if (right == -1) return -1;
        if (Math.abs(left - right) > 1) return -1;
        return 1 + Math.max(left, right);
    }

    /**
     * Serialize binary tree to string (pre-order with null markers).
     * Deserialize reconstructs the tree from the string.
     */
    public static String serialize(TreeNode root) {
        StringBuilder sb = new StringBuilder();
        serializeHelper(root, sb);
        return sb.toString();
    }

    private static void serializeHelper(TreeNode node, StringBuilder sb) {
        if (node == null) {
            sb.append("null,");
            return;
        }
        sb.append(node.val).append(",");
        serializeHelper(node.left, sb);
        serializeHelper(node.right, sb);
    }

    public static TreeNode deserialize(String data) {
        Queue<String> tokens = new LinkedList<>(Arrays.asList(data.split(",")));
        return deserializeHelper(tokens);
    }

    private static TreeNode deserializeHelper(Queue<String> tokens) {
        String val = tokens.poll();
        if ("null".equals(val)) return null;
        TreeNode node = new TreeNode(Integer.parseInt(val));
        node.left = deserializeHelper(tokens);
        node.right = deserializeHelper(tokens);
        return node;
    }
}
```

### Level-Order Traversal Variants

BFS-based traversal with level grouping enables solutions to zigzag traversal, right-side view, and level averages.

```java
public class LevelOrderVariants {
    /**
     * Standard level-order with level grouping.
     * Time: O(n), Space: O(w) where w is max width
     */
    public static List<List<Integer>> levelOrder(TreeNode root) {
        List<List<Integer>> result = new ArrayList<>();
        if (root == null) return result;

        Queue<TreeNode> queue = new ArrayDeque<>();
        queue.offer(root);

        while (!queue.isEmpty()) {
            int levelSize = queue.size();
            List<Integer> level = new ArrayList<>();
            for (int i = 0; i < levelSize; i++) {
                TreeNode node = queue.poll();
                level.add(node.val);
                if (node.left != null) queue.offer(node.left);
                if (node.right != null) queue.offer(node.right);
            }
            result.add(level);
        }
        return result;
    }

    /**
     * Right side view: last node at each level.
     */
    public static List<Integer> rightSideView(TreeNode root) {
        List<Integer> result = new ArrayList<>();
        if (root == null) return result;

        Queue<TreeNode> queue = new ArrayDeque<>();
        queue.offer(root);

        while (!queue.isEmpty()) {
            int levelSize = queue.size();
            for (int i = 0; i < levelSize; i++) {
                TreeNode node = queue.poll();
                if (i == levelSize - 1) result.add(node.val);
                if (node.left != null) queue.offer(node.left);
                if (node.right != null) queue.offer(node.right);
            }
        }
        return result;
    }
}
```

## Common Pitfalls

- **Assuming BSTs are always balanced**: Inserting sorted data into a plain BST creates a degenerate linked list with O(n) operations. If you insert [1, 2, 3, 4, 5] sequentially, every node has only a right child, and search becomes linear scan. Always use self-balancing trees (AVL, Red-Black) when input order is unpredictable. In interviews, state your assumption about balance explicitly.

- **Stack overflow with deep recursion on large trees**: Recursive tree algorithms on trees with 100,000+ nodes can overflow the call stack (default stack size is typically 512KB-1MB). Convert to iterative approaches using an explicit stack for production code. Morris traversal achieves O(1) space by temporarily modifying tree pointers, but is complex and modifies the tree during traversal.

- **Confusing tree height and depth**: Height is measured from a node downward to the deepest leaf (root has maximum height). Depth is measured from the root downward to a node (root has depth 0). Mixing these up leads to off-by-one errors in balanced tree checks and level calculations. Some sources define height as number of edges, others as number of nodes on the path — clarify the definition before coding.

- **Not handling null children in recursive algorithms**: Every recursive tree function must handle the null base case explicitly. Forgetting this causes NullPointerException when accessing leaf nodes' children. The pattern is always: check null first, then process the node, then recurse on children. This applies to every tree problem without exception.

- **Using BST when HashMap suffices**: If you only need O(1) lookup by key without ordering, a HashMap is simpler and faster than a BST. BSTs add O(log n) overhead for the ordering guarantee. Only use trees when you need sorted order, range queries, floor/ceiling operations, or ordered iteration. In interviews, justify your choice of data structure.

## Real-World Use Cases

**Database indexing** is the most impactful production use of tree structures. B-Trees and B+ Trees form the backbone of every major relational database (PostgreSQL, MySQL, Oracle). Each internal node contains hundreds of keys stored in a sorted array, and the high branching factor keeps the tree shallow (typically 3-4 levels for billions of rows). A single query traverses at most 4 disk pages to find any record, making indexed lookups nearly constant time regardless of table size.

**Compiler abstract syntax trees** (ASTs) represent the hierarchical structure of source code. When a compiler parses `if (x > 0) { return x; }`, it builds a tree with the if-statement as root, the condition as left child, and the body as right child. Every subsequent compiler phase (type checking, optimization, code generation) operates on this tree structure. Language servers in IDEs traverse ASTs to provide autocomplete, refactoring, and error detection.

**File systems** use tree structures to organize directories and files. The directory hierarchy is a tree where internal nodes are directories and leaves are files. Operations like `find`, `ls -R`, and path resolution are tree traversals. Modern file systems (ext4, NTFS, APFS) use B-Tree variants for directory entries and extent trees for file block mapping, enabling efficient lookup even in directories with millions of entries.

**Decision trees and random forests** in machine learning use binary tree structures for classification and regression. Each internal node represents a feature test, and leaves represent predictions. Training builds the tree by selecting optimal split points, and inference traverses from root to leaf. Random forests aggregate hundreds of trees for robust predictions. XGBoost and LightGBM, the dominant algorithms for tabular data, build gradient-boosted decision trees.

**DOM trees** in web browsers represent HTML document structure. The browser parses HTML into a tree where elements are nodes and nesting creates parent-child relationships. CSS selector matching, event bubbling, and layout computation all traverse this tree. React's virtual DOM maintains a parallel tree structure and uses tree diffing algorithms to minimize actual DOM updates.

## Interview Questions

**Q: How do you determine if a binary tree is balanced?**

A: A tree is balanced if the height difference between left and right subtrees is at most 1 for every node. Use a bottom-up recursive approach that returns -1 for unbalanced subtrees, avoiding redundant height calculations. At each node, compute left and right heights recursively. If either returns -1 (unbalanced below), propagate -1 upward. If the absolute difference exceeds 1, return -1. Otherwise return 1 + max(left, right). This runs in O(n) time with a single pass, compared to the naive O(n log n) approach of computing height separately at each node.

**Q: How would you serialize and deserialize a binary tree?**

A: Use pre-order traversal with null markers. Serialize by visiting root, then left, then right, appending each value (or "null" for null nodes) to a string with delimiters. Deserialize by reading values sequentially and recursively building left then right subtrees, consuming "null" tokens as base cases. Both operations are O(n) time and space. Alternative approaches include level-order serialization (useful for complete trees) and in-order plus pre-order combination (requires distinct values).

**Q: What is the difference between a Red-Black tree and an AVL tree?**

A: Both are self-balancing BSTs with O(log n) operations. AVL trees maintain strict balance (height difference at most 1 at every node), providing faster lookups due to shorter height but slower insertions and deletions due to more rotations. Red-Black trees allow height difference up to 2x (longest path at most twice the shortest), requiring fewer rotations on modification but slightly deeper trees. In practice, AVL trees are better for read-heavy workloads, Red-Black trees for write-heavy workloads. Java's TreeMap uses Red-Black trees.

**Q: How do you find the kth smallest element in a BST?**

A: Use in-order traversal (which visits BST nodes in sorted order) and count nodes visited. When the count reaches k, return that node's value. Time is O(h + k) where h is tree height. For frequent queries, augment each node with a subtree size field. To find kth smallest: if left subtree size equals k-1, return current node. If left size is greater than or equal to k, recurse left. Otherwise recurse right with k reduced by left size plus 1. This gives O(h) per query.

## Production Tips

- **Use Java TreeMap/TreeSet for sorted operations in application code**: These are backed by Red-Black trees providing guaranteed O(log n) for all operations. They support efficient range queries via `subMap()`, `headMap()`, `tailMap()`, and nearest-element queries via `floorKey()`, `ceilingKey()`. For concurrent access, use `ConcurrentSkipListMap` which provides similar sorted operations with lock-free reads.

- **Convert recursive tree algorithms to iterative for production**: Recursive implementations are elegant but risk stack overflow on deep trees and make it harder to add early termination, timeout handling, and progress reporting. Use an explicit stack (ArrayDeque in Java) for DFS or a queue for BFS. This also enables processing trees in chunks for long-running operations without blocking the event loop.

- **Cache tree heights and subtree sizes for repeated queries**: If your application frequently checks tree balance, computes ranks, or performs height-dependent operations, store these values as fields in each node and update them during modifications. This avoids O(n) recomputation and enables O(log n) order-statistic queries. The trade-off is increased memory per node and slightly more complex insert/delete logic.

## Related Topics

- [Balanced Trees and Self-Balancing](./balanced-trees-and-self-balancing.md) — Guaranteed O(log n) through rotation-based balancing
- [Graph Representations and Traversal](./graph-representations-and-traversal.md) — Trees are special cases of graphs; traversal techniques generalize
- [Heap](../heap.md) — Complete binary trees stored in arrays for priority queue operations
- [Trie](../trie.md) — Specialized trees for string prefix operations
