# Linked Lists

A **linked list** is a linear data structure where elements are stored in nodes, each containing a data field and one or more pointers to adjacent nodes. Unlike arrays, linked lists do not store elements in contiguous memory locations. Instead, each node is independently allocated and connected to the next (and optionally previous) node through references. This fundamental design choice gives linked lists O(1) insertion and deletion at known positions, at the cost of O(n) random access and poor cache locality.

Linked lists are one of the most foundational data structures in computer science, serving as building blocks for stacks, queues, hash table chains, adjacency lists in graphs, memory allocators, and operating system schedulers. Understanding linked lists deeply is essential for systems programming, interview preparation, and reasoning about pointer-based data structures. The pointer manipulation patterns learned with linked lists — such as the two-pointer technique, sentinel nodes, and recursive decomposition — transfer directly to trees, graphs, and other complex structures.

---

## Quick Reference

- **Singly linked list**: each node has a `next` pointer; traversal is forward-only
- **Doubly linked list**: each node has `next` and `prev` pointers; bidirectional traversal
- **Circular linked list**: the tail node points back to the head, forming a ring
- **Access by index**: O(n) — must traverse from head
- **Insert/delete at head**: O(1) — adjust head pointer
- **Insert/delete at tail**: O(1) with tail pointer (doubly linked); O(n) without
- **Insert/delete at arbitrary position**: O(1) if you have a reference to the node; O(n) to find it
- **Search**: O(n) — linear scan required
- **Space overhead**: one pointer per node (singly) or two pointers per node (doubly), plus object header
- **No random access**: cannot index into a linked list in constant time
- **Dynamic size**: grows and shrinks without reallocation or copying
- **Java implementation**: `java.util.LinkedList` is a doubly linked list implementing both List and Deque interfaces

---

## When to Use

Linked lists are the right choice when your workload is dominated by insertions and deletions at known positions, and you rarely need random access by index. In modern systems with CPU caches optimized for sequential memory access, arrays often outperform linked lists even for insertion-heavy workloads. Choose linked lists deliberately based on measured performance characteristics.

**Choose a linked list when:**
- You frequently insert or remove elements at the beginning or middle of the collection (given a reference to the node)
- You need a deque (double-ended queue) with O(1) operations at both ends
- You are implementing an LRU cache where O(1) move-to-front is required
- You need to splice two lists together in O(1) time
- Memory allocation patterns favor many small allocations over one large contiguous block
- You are implementing a free list in a memory allocator

**Choose an array or dynamic array instead when:**
- You need random access by index
- Cache locality matters for iteration performance
- Memory overhead per element must be minimal
- Most operations are reads or appends to the end

**Choose a skip list instead when:**
- You need O(log n) search in a linked structure
- You want a concurrent-friendly sorted data structure without complex tree balancing

**Avoid linked lists when:**
- You need O(1) lookup by key (use a hash table)
- You need sorted order with O(log n) operations (use a balanced BST)
- Your workload is primarily sequential iteration (arrays have 10-100x better cache performance)

---

## Code Examples

### Singly Linked List Implementation

A complete singly linked list with insert, delete, search, and reverse operations. This demonstrates the core pointer manipulation patterns that appear in interview problems.

```java
public class SinglyLinkedList<T> {
    private Node<T> head;
    private int size;

    private static class Node<T> {
        T data;
        Node<T> next;

        Node(T data) {
            this.data = data;
            this.next = null;
        }
    }

    public void insertAtHead(T data) {
        Node<T> newNode = new Node<>(data);
        newNode.next = head;
        head = newNode;
        size++;
    }

    public void insertAtTail(T data) {
        Node<T> newNode = new Node<>(data);
        if (head == null) {
            head = newNode;
        } else {
            Node<T> current = head;
            while (current.next != null) {
                current = current.next;
            }
            current.next = newNode;
        }
        size++;
    }

    public boolean delete(T data) {
        if (head == null) return false;
        if (head.data.equals(data)) {
            head = head.next;
            size--;
            return true;
        }
        Node<T> current = head;
        while (current.next != null) {
            if (current.next.data.equals(data)) {
                current.next = current.next.next;
                size--;
                return true;
            }
            current = current.next;
        }
        return false;
    }

    public Node<T> reverse() {
        Node<T> prev = null;
        Node<T> current = head;
        while (current != null) {
            Node<T> next = current.next;
            current.next = prev;
            prev = current;
            current = next;
        }
        head = prev;
        return head;
    }

    public int size() {
        return size;
    }
}
```

### Doubly Linked List with Sentinel Nodes (Python)

Sentinel nodes (dummy head and tail) eliminate edge cases for empty lists and boundary operations. This pattern is used in production implementations like Java's LinkedList and Linux kernel's list_head.

```python
class DoublyLinkedList:
    class Node:
        def __init__(self, data=None):
            self.data = data
            self.prev = None
            self.next = None

    def __init__(self):
        self.head = self.Node()  # Sentinel head
        self.tail = self.Node()  # Sentinel tail
        self.head.next = self.tail
        self.tail.prev = self.head
        self.size = 0

    def insert_after(self, node, data):
        """Insert new node after the given node in O(1)."""
        new_node = self.Node(data)
        new_node.prev = node
        new_node.next = node.next
        node.next.prev = new_node
        node.next = new_node
        self.size += 1
        return new_node

    def insert_at_head(self, data):
        return self.insert_after(self.head, data)

    def insert_at_tail(self, data):
        return self.insert_after(self.tail.prev, data)

    def remove(self, node):
        """Remove the given node in O(1). Node must not be a sentinel."""
        if node is self.head or node is self.tail:
            raise ValueError("Cannot remove sentinel nodes")
        node.prev.next = node.next
        node.next.prev = node.prev
        self.size -= 1
        return node.data

    def move_to_front(self, node):
        """Move existing node to front in O(1) — used in LRU caches."""
        self.remove(node)
        self.insert_after(self.head, node.data)
```

### Floyd's Cycle Detection Algorithm

The tortoise and hare algorithm detects cycles in O(n) time with O(1) space. This is a fundamental linked list technique that appears in many interview problems.

```java
public class CycleDetection {
    public boolean hasCycle(ListNode head) {
        if (head == null || head.next == null) return false;
        ListNode slow = head;
        ListNode fast = head;
        while (fast != null && fast.next != null) {
            slow = slow.next;
            fast = fast.next.next;
            if (slow == fast) return true;
        }
        return false;
    }

    public ListNode findCycleStart(ListNode head) {
        ListNode slow = head, fast = head;
        // Phase 1: Detect cycle
        while (fast != null && fast.next != null) {
            slow = slow.next;
            fast = fast.next.next;
            if (slow == fast) break;
        }
        if (fast == null || fast.next == null) return null;
        // Phase 2: Find cycle start
        slow = head;
        while (slow != fast) {
            slow = slow.next;
            fast = fast.next;
        }
        return slow;
    }
}
```

### LRU Cache Using Doubly Linked List + Hash Map

The combination of a doubly linked list (for O(1) ordering operations) and a hash map (for O(1) key lookup) creates an O(1) LRU cache. This is one of the most common interview problems and a real production pattern.

```java
public class LRUCache {
    private final int capacity;
    private final Map<Integer, Node> map;
    private final Node head, tail;  // Sentinels

    public LRUCache(int capacity) {
        this.capacity = capacity;
        this.map = new HashMap<>();
        head = new Node(0, 0);
        tail = new Node(0, 0);
        head.next = tail;
        tail.prev = head;
    }

    public int get(int key) {
        if (!map.containsKey(key)) return -1;
        Node node = map.get(key);
        removeNode(node);
        addToFront(node);
        return node.value;
    }

    public void put(int key, int value) {
        if (map.containsKey(key)) {
            Node node = map.get(key);
            node.value = value;
            removeNode(node);
            addToFront(node);
        } else {
            if (map.size() == capacity) {
                Node lru = tail.prev;
                removeNode(lru);
                map.remove(lru.key);
            }
            Node newNode = new Node(key, value);
            map.put(key, newNode);
            addToFront(newNode);
        }
    }

    private void addToFront(Node node) {
        node.next = head.next;
        node.prev = head;
        head.next.prev = node;
        head.next = node;
    }

    private void removeNode(Node node) {
        node.prev.next = node.next;
        node.next.prev = node.prev;
    }

    private static class Node {
        int key, value;
        Node prev, next;
        Node(int key, int value) {
            this.key = key;
            this.value = value;
        }
    }
}
```

---

## Common Pitfalls

1. **Losing references during pointer manipulation**: When reversing or rearranging nodes, failing to save the `next` pointer before overwriting it causes the rest of the list to become unreachable. Always store `current.next` in a temporary variable before modifying `current.next`. This is the single most common bug in linked list code and the source of most interview mistakes.

2. **Off-by-one errors with null checks**: Forgetting to handle the empty list case (`head == null`) or the single-element case (`head.next == null`) causes NullPointerExceptions. Always consider these boundary conditions explicitly. Using sentinel nodes eliminates most of these edge cases by ensuring `head` and `tail` are never null.

3. **Memory leaks from dangling references**: In garbage-collected languages, removed nodes that still have references pointing to them (or from them to the list) may not be collected. In non-GC languages like C/C++, failing to free removed nodes causes memory leaks. Always null out references in removed nodes and explicitly free memory in manual memory management environments.

4. **Using LinkedList for random access**: Calling `list.get(i)` on a Java LinkedList is O(n) because it must traverse from the head (or tail) to the target index. If you need indexed access, use ArrayList. This is the most common performance mistake — developers choose LinkedList thinking it is "more flexible" without measuring actual access patterns.

5. **Ignoring cache locality in performance-critical code**: Linked list nodes are scattered across the heap, causing frequent cache misses during traversal. On modern CPUs, iterating an array is 10-100x faster than iterating a linked list of the same size due to hardware prefetching and cache line utilization. Profile before choosing a linked list for performance-sensitive paths.

6. **Concurrent modification without synchronization**: Java's LinkedList is not thread-safe. Concurrent reads and writes cause corrupted state, lost nodes, and infinite loops. Use `ConcurrentLinkedDeque` for concurrent access, or protect the list with explicit synchronization.

7. **Circular reference bugs**: When implementing circular linked lists, forgetting to properly terminate traversal causes infinite loops. Always use a sentinel condition (checking if you have returned to the starting node) rather than checking for null.

---

## Real-World Use Cases

**Operating system process schedulers**: The Linux kernel uses circular doubly linked lists (`list_head`) extensively for process scheduling. The run queue is a linked list of task structs, allowing O(1) insertion and removal of processes as they transition between states (running, waiting, sleeping). The kernel's list implementation uses the container_of macro to embed list nodes directly in structures without separate allocation.

**LRU cache eviction**: Production caches (Memcached, Redis, Caffeine) use doubly linked lists to maintain access order. When a cache entry is accessed, it is moved to the front of the list in O(1). When the cache is full, the tail entry (least recently used) is evicted in O(1). Combined with a hash map for O(1) key lookup, this provides a complete O(1) LRU cache.

**Memory allocators (free lists)**: Memory allocators like glibc's malloc maintain free lists — linked lists of available memory blocks organized by size class. When memory is freed, the block is inserted into the appropriate free list. When memory is requested, the allocator searches the free list for a suitable block. This enables O(1) allocation for common sizes.

**Undo/redo systems**: Text editors and design tools implement undo/redo as a doubly linked list of state snapshots or operations. The current position pointer moves backward (undo) or forward (redo) through the list. When a new action is performed after undoing, the forward portion of the list is discarded and the new action is appended.

**Browser navigation history**: Web browsers maintain forward and backward navigation as a doubly linked list of visited URLs. The back button traverses the `prev` pointer, the forward button traverses `next`. When you navigate to a new page after going back, the forward history is truncated.

**Blockchain structure**: Each block in a blockchain contains a hash pointer to the previous block, forming a singly linked list from the most recent block back to the genesis block. This linked structure provides tamper evidence — modifying any block invalidates all subsequent hash pointers.

**Music playlist and media players**: Media players implement playlists as doubly linked lists (or circular linked lists for repeat mode). Skip forward and skip backward are O(1) pointer traversals. Shuffle can be implemented by randomly relinking nodes.

---

## Interview Questions

**Q: How do you reverse a singly linked list in-place?**

A: Use three pointers: `prev` (initially null), `current` (initially head), and `next` (temporary). At each step, save `current.next` in `next`, point `current.next` to `prev`, advance `prev` to `current`, and advance `current` to `next`. When `current` becomes null, `prev` is the new head. This runs in O(n) time with O(1) space. The recursive approach uses O(n) stack space and is less suitable for very long lists.

**Q: How do you find the middle node of a linked list in one pass?**

A: Use the slow/fast pointer technique (also called the tortoise and hare). Initialize both pointers at the head. Move slow one step and fast two steps at each iteration. When fast reaches the end (null or last node), slow is at the middle. For even-length lists, this gives the first of the two middle nodes. This runs in O(n) time with O(1) space and is the foundation for many linked list algorithms including merge sort on linked lists.

**Q: How do you detect and find the start of a cycle in a linked list?**

A: Phase 1 (detection): Use Floyd's algorithm with slow and fast pointers. If they meet, a cycle exists. Phase 2 (finding the start): Reset slow to head, keep fast at the meeting point, and advance both one step at a time. They will meet at the cycle start. The mathematical proof relies on the fact that the distance from head to cycle start equals the distance from the meeting point to cycle start (modulo cycle length). Time: O(n), Space: O(1).

**Q: How do you merge two sorted linked lists into one sorted list?**

A: Use a dummy head node and a tail pointer. Compare the heads of both lists, append the smaller node to tail, and advance that list's pointer. Continue until one list is exhausted, then append the remaining list directly (no need to copy). Time: O(n + m), Space: O(1). This is the merge step in merge sort for linked lists, which is particularly efficient because linked list merge sort requires no extra space (unlike array merge sort).

**Q: What are the trade-offs between singly and doubly linked lists?**

A: Singly linked lists use one pointer per node (less memory, simpler implementation) but only support forward traversal. Deletion requires a reference to the previous node, making arbitrary deletion O(n) unless you have the predecessor. Doubly linked lists use two pointers per node (more memory, more complex pointer updates) but support bidirectional traversal and O(1) deletion given any node reference. In practice, doubly linked lists are preferred for most applications because the O(1) deletion capability is critical for caches, schedulers, and deques.

**Q: How would you implement merge sort on a linked list, and why is it preferred over quicksort for lists?**

A: Split the list in half using the slow/fast pointer technique to find the middle. Recursively sort each half. Merge the two sorted halves using the sorted merge algorithm. Time: O(n log n), Space: O(log n) for recursion stack. Merge sort is preferred over quicksort for linked lists because: (1) merge sort's merge step is O(1) space on linked lists (just pointer manipulation), while quicksort's partition requires random access for efficient pivot selection; (2) linked lists lack cache locality regardless, so quicksort's cache advantage over merge sort disappears; (3) merge sort is stable, preserving relative order of equal elements.

---

## Production Tips

1. **Prefer ArrayDeque over LinkedList for stacks and queues**: In Java, `ArrayDeque` outperforms `LinkedList` for both stack (LIFO) and queue (FIFO) operations due to cache locality and lower per-element overhead. LinkedList allocates a separate Node object for each element (40+ bytes overhead), while ArrayDeque stores elements in a contiguous circular array. Benchmarks consistently show 2-5x throughput improvement with ArrayDeque.

2. **Use intrusive linked lists in performance-critical systems**: Standard linked lists allocate separate node objects that point to data. Intrusive linked lists embed the list pointers directly in the data structure, eliminating one level of indirection and one allocation per element. The Linux kernel, DPDK, and game engines use intrusive lists extensively. In Java, this pattern is less common but can be implemented with explicit prev/next fields in your domain objects.

3. **Implement sentinel nodes to eliminate edge cases**: Production linked list implementations use dummy head and tail nodes that are never removed. This eliminates null checks for empty lists and simplifies insertion/deletion code by ensuring every real node always has valid prev and next references. Java's `LinkedList` uses this pattern internally. The small memory cost of two extra nodes is negligible compared to the bug-prevention benefit.

4. **Monitor list length in production**: Linked lists that grow unboundedly (e.g., event queues, work queues) can consume excessive memory and cause GC pressure. Instrument your lists with size counters and set alerts when they exceed expected bounds. Consider bounded alternatives (ArrayBlockingQueue) when backpressure is appropriate.

5. **Use ConcurrentLinkedDeque for multi-threaded scenarios**: When multiple threads need to add and remove elements concurrently, `ConcurrentLinkedDeque` provides lock-free operations using CAS (compare-and-swap) instructions. It avoids the contention of synchronized wrappers while maintaining correctness. For single-producer/single-consumer patterns, consider `ConcurrentLinkedQueue` which has even lower overhead.

---

## Related Topics

- [Hash Tables](./hash-tables.md) — Separate chaining collision resolution uses linked lists within each hash bucket
- [Arrays and Strings](../arrays-and-strings/index.md) — Contrasting contiguous vs. pointer-based storage trade-offs
- [Queue](./queue.md) — LinkedList implements the Deque interface for double-ended queue operations
- [Big O Notation](./big-o-notation.md) — Comparing O(1) insertion/deletion vs. O(n) access in linked structures
