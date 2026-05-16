# Sorting and Searching

Sorting and searching are the most fundamental algorithmic operations in computer science. **Sorting** arranges elements in a defined order, enabling efficient searching, deduplication, and data presentation. **Searching** locates elements or determines their absence within a collection. Together, they form the backbone of database query engines, file systems, search engines, and virtually every data-intensive application.

Understanding sorting algorithms requires analyzing trade-offs between time complexity, space usage, stability, and adaptivity to input characteristics. Understanding searching requires mastering binary search and its many variations, which appear in problems far beyond simple element lookup. Senior engineers must know not just which algorithm to use, but why — considering data size, distribution, memory hierarchy, parallelism, and whether the data is static or dynamic.

This section covers comparison-based and non-comparison sorting algorithms, binary search patterns and their applications, and the practical considerations that determine algorithm selection in production systems.

## Learning Path

1. [Comparison-Based Sorting](./comparison-based-sorting.md) — Merge sort, quicksort, heapsort, and their trade-offs
2. [Non-Comparison and Linear Sorting](./non-comparison-and-linear-sorting.md) — Counting sort, radix sort, bucket sort for specialized inputs
3. [Binary Search Patterns](./binary-search-patterns.md) — Classic binary search, search on answer, and rotated array variants
4. [Searching in Specialized Structures](./searching-in-specialized-structures.md) — Search in matrices, infinite arrays, and custom comparators
