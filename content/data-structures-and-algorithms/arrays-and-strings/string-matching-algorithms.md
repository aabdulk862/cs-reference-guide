# String Matching Algorithms

## Quick Reference

- **Brute force**: O(n*m) time, O(1) space — check pattern at every position
- **KMP (Knuth-Morris-Pratt)**: O(n+m) time, O(m) space — failure function avoids re-scanning
- **Rabin-Karp**: O(n+m) average, O(n*m) worst — rolling hash for multi-pattern matching
- **Boyer-Moore**: O(n/m) best case, O(n*m) worst — skips characters using bad character rule
- **Aho-Corasick**: O(n + m + z) time — automaton for simultaneous multi-pattern search
- **Suffix Array**: O(n log n) build, O(m log n) query — sorted suffixes for repeated queries
- **Z-Algorithm**: O(n+m) time, O(n+m) space — Z-array encodes match lengths from each position
- **Failure function (KMP)**: longest proper prefix that is also a suffix for each prefix of pattern

## When to Use

String matching algorithms are essential whenever you need to locate one or more patterns within a larger text. The naive approach of checking every position works for short patterns and small texts, but production systems processing megabytes or gigabytes of text require sublinear or linear-time algorithms.

Use KMP when you need guaranteed linear-time single-pattern matching without hash collisions, when the pattern has repetitive structure that the failure function can exploit, or when you need to find all occurrences of a pattern in a stream where you cannot revisit characters. KMP is the standard choice for compiler lexers and protocol parsers.

Use Rabin-Karp when you need to search for multiple patterns simultaneously (plagiarism detection, virus signature scanning), when you want a simple implementation with good average-case performance, or when the pattern matching is part of a larger rolling-hash computation (finding repeated substrings, longest duplicate substring).

Use Boyer-Moore when the alphabet is large relative to the pattern (natural language text, binary data) and you want sublinear average-case performance. Boyer-Moore excels in practice because it skips large portions of the text by examining characters from right to left within the pattern.

Use Aho-Corasick when you have a fixed dictionary of patterns to search simultaneously (network intrusion detection, content filtering, DNA motif finding). It builds a finite automaton from all patterns and processes the text in a single pass regardless of the number of patterns.

Use suffix arrays or suffix trees when you have a fixed text and many different query patterns (genome databases, full-text search indexes). The preprocessing cost is amortized over many queries.

## Code Examples

### KMP Algorithm Implementation

The KMP algorithm preprocesses the pattern to build a failure function (also called the partial match table or prefix function) that indicates how far back to reset the pattern pointer on a mismatch, avoiding redundant comparisons.

```java
public class KMP {
    /**
     * Builds the failure function (longest proper prefix-suffix array).
     * failure[i] = length of longest proper prefix of pattern[0..i]
     * that is also a suffix of pattern[0..i].
     * Time: O(m), Space: O(m)
     */
    public static int[] buildFailureFunction(String pattern) {
        int m = pattern.length();
        int[] failure = new int[m];
        failure[0] = 0;
        int len = 0;  // Length of previous longest prefix-suffix
        int i = 1;

        while (i < m) {
            if (pattern.charAt(i) == pattern.charAt(len)) {
                len++;
                failure[i] = len;
                i++;
            } else {
                if (len != 0) {
                    len = failure[len - 1];  // Fall back, don't increment i
                } else {
                    failure[i] = 0;
                    i++;
                }
            }
        }
        return failure;
    }

    /**
     * Finds all occurrences of pattern in text using KMP.
     * Returns list of starting indices.
     * Time: O(n + m), Space: O(m)
     */
    public static List<Integer> search(String text, String pattern) {
        List<Integer> result = new ArrayList<>();
        if (pattern.isEmpty()) return result;

        int[] failure = buildFailureFunction(pattern);
        int n = text.length(), m = pattern.length();
        int i = 0, j = 0;  // i for text, j for pattern

        while (i < n) {
            if (text.charAt(i) == pattern.charAt(j)) {
                i++;
                j++;
            }

            if (j == m) {
                result.add(i - j);  // Found match at index i - j
                j = failure[j - 1];  // Continue searching for next occurrence
            } else if (i < n && text.charAt(i) != pattern.charAt(j)) {
                if (j != 0) {
                    j = failure[j - 1];  // Use failure function to skip
                } else {
                    i++;
                }
            }
        }
        return result;
    }
}
```

```typescript
function buildFailureFunction(pattern: string): number[] {
  const m = pattern.length;
  const failure = new Array(m).fill(0);
  let len = 0;
  let i = 1;

  while (i < m) {
    if (pattern[i] === pattern[len]) {
      len++;
      failure[i] = len;
      i++;
    } else {
      if (len !== 0) {
        len = failure[len - 1];
      } else {
        failure[i] = 0;
        i++;
      }
    }
  }
  return failure;
}

function kmpSearch(text: string, pattern: string): number[] {
  const result: number[] = [];
  if (pattern.length === 0) return result;

  const failure = buildFailureFunction(pattern);
  const n = text.length;
  const m = pattern.length;
  let i = 0;
  let j = 0;

  while (i < n) {
    if (text[i] === pattern[j]) {
      i++;
      j++;
    }

    if (j === m) {
      result.push(i - j);
      j = failure[j - 1];
    } else if (i < n && text[i] !== pattern[j]) {
      if (j !== 0) {
        j = failure[j - 1];
      } else {
        i++;
      }
    }
  }
  return result;
}
```

### Rabin-Karp with Rolling Hash

Rabin-Karp uses a rolling hash to compare the pattern hash with substring hashes in O(1) per position. Only when hashes match does it perform a character-by-character verification to handle collisions.

```java
public class RabinKarp {
    private static final long MOD = 1_000_000_007L;
    private static final long BASE = 31L;

    /**
     * Finds all occurrences of pattern in text using rolling hash.
     * Average: O(n + m), Worst: O(n * m) due to hash collisions.
     */
    public static List<Integer> search(String text, String pattern) {
        List<Integer> result = new ArrayList<>();
        int n = text.length(), m = pattern.length();
        if (m > n) return result;

        // Compute hash of pattern and first window
        long patternHash = 0, windowHash = 0;
        long highPow = 1;  // BASE^(m-1) mod MOD

        for (int i = 0; i < m; i++) {
            patternHash = (patternHash * BASE + pattern.charAt(i)) % MOD;
            windowHash = (windowHash * BASE + text.charAt(i)) % MOD;
            if (i > 0) highPow = (highPow * BASE) % MOD;
        }

        for (int i = 0; i <= n - m; i++) {
            if (windowHash == patternHash) {
                // Verify character by character (handle collisions)
                if (text.substring(i, i + m).equals(pattern)) {
                    result.add(i);
                }
            }

            // Roll the hash: remove leftmost char, add next char
            if (i < n - m) {
                windowHash = (windowHash - text.charAt(i) * highPow % MOD + MOD) % MOD;
                windowHash = (windowHash * BASE + text.charAt(i + m)) % MOD;
            }
        }
        return result;
    }

    /**
     * Multi-pattern search: find any of the given patterns in text.
     * Useful for dictionary matching, content filtering.
     */
    public static Map<String, List<Integer>> multiSearch(String text, Set<String> patterns) {
        Map<String, List<Integer>> results = new HashMap<>();
        for (String pattern : patterns) {
            List<Integer> matches = search(text, pattern);
            if (!matches.isEmpty()) {
                results.put(pattern, matches);
            }
        }
        return results;
    }
}
```

```python
def rabin_karp(text: str, pattern: str, base: int = 31, mod: int = 10**9 + 7) -> list[int]:
    """Find all occurrences of pattern in text using rolling hash."""
    n, m = len(text), len(pattern)
    if m > n:
        return []

    result = []
    pattern_hash = 0
    window_hash = 0
    high_pow = 1  # base^(m-1) mod mod

    for i in range(m):
        pattern_hash = (pattern_hash * base + ord(pattern[i])) % mod
        window_hash = (window_hash * base + ord(text[i])) % mod
        if i > 0:
            high_pow = (high_pow * base) % mod

    for i in range(n - m + 1):
        if window_hash == pattern_hash:
            if text[i:i + m] == pattern:  # Verify on hash match
                result.append(i)

        if i < n - m:
            window_hash = (window_hash - ord(text[i]) * high_pow) % mod
            window_hash = (window_hash * base + ord(text[i + m])) % mod

    return result
```

### Z-Algorithm

The Z-algorithm computes the Z-array where Z[i] is the length of the longest substring starting at position i that matches a prefix of the string. Concatenating pattern + separator + text allows single-pattern matching.

```java
public class ZAlgorithm {
    /**
     * Computes Z-array: Z[i] = length of longest substring starting at i
     * that is also a prefix of the string.
     * Time: O(n), Space: O(n)
     */
    public static int[] computeZArray(String s) {
        int n = s.length();
        int[] z = new int[n];
        int left = 0, right = 0;

        for (int i = 1; i < n; i++) {
            if (i < right) {
                z[i] = Math.min(right - i, z[i - left]);
            }
            while (i + z[i] < n && s.charAt(z[i]) == s.charAt(i + z[i])) {
                z[i]++;
            }
            if (i + z[i] > right) {
                left = i;
                right = i + z[i];
            }
        }
        return z;
    }

    /**
     * Find all occurrences of pattern in text using Z-algorithm.
     * Concatenate: pattern + "$" + text, then find Z[i] == pattern.length
     */
    public static List<Integer> search(String text, String pattern) {
        String combined = pattern + "$" + text;
        int[] z = computeZArray(combined);
        List<Integer> result = new ArrayList<>();
        int m = pattern.length();

        for (int i = m + 1; i < combined.length(); i++) {
            if (z[i] == m) {
                result.add(i - m - 1);
            }
        }
        return result;
    }
}
```

## Common Pitfalls

- **Using modular arithmetic incorrectly in Rabin-Karp**: When subtracting the contribution of the leftmost character in the rolling hash, the result can become negative. Always add MOD before taking the modulus to handle negative intermediate values. Forgetting this produces incorrect hash values that cause missed matches. Additionally, using a single hash function increases collision probability; production implementations often use double hashing (two different base-mod pairs) to reduce false positives to negligible levels.

- **Confusing the failure function semantics in KMP**: The failure function value at index i represents the length of the longest proper prefix of the pattern substring ending at i that is also a suffix. A proper prefix excludes the entire string itself. Implementing this incorrectly (allowing the full string as a prefix) causes infinite loops or missed matches. The key insight is that when a mismatch occurs at position j in the pattern, you jump to failure[j-1], not failure[j].

- **Applying Boyer-Moore without the good suffix rule**: The simplified Boyer-Moore using only the bad character heuristic has O(n*m) worst case on patterns with repeated characters. The full Boyer-Moore algorithm combines the bad character rule with the good suffix rule to achieve O(n) worst case for non-periodic patterns. In practice, the bad character rule alone works well for natural language text, but adversarial inputs (like searching for "aaa" in "aaaa...a") require the good suffix rule.

- **Not handling overlapping matches**: Some algorithms naturally find overlapping matches (KMP continues searching after a match by using the failure function), while others require explicit handling. For example, searching for "aba" in "ababa" should find matches at positions 0 and 2. If your algorithm stops after the first match or advances by the full pattern length, it misses overlapping occurrences.

- **Building suffix arrays with naive O(n^2 log n) sorting**: Sorting all suffixes using standard string comparison is O(n^2 log n) because each comparison takes O(n). Production suffix array construction uses the DC3/skew algorithm or SA-IS algorithm for O(n) construction. For interview purposes, the O(n log^2 n) approach using rank-based sorting with doubling is a good middle ground.

## Real-World Use Cases

**Network intrusion detection systems** (Snort, Suricata) use Aho-Corasick to scan network packets against thousands of malware signatures simultaneously. Each packet payload is processed in a single pass through the automaton, matching against all known attack patterns. The automaton is rebuilt when signature databases are updated, typically containing 10,000-50,000 patterns. Without multi-pattern matching, scanning each pattern individually would make real-time packet inspection impossible at gigabit speeds.

**Full-text search engines** like Elasticsearch and Apache Lucene use suffix arrays and inverted indexes built on string matching primitives. When a user searches for a phrase, the engine must locate exact sequences of terms within documents. The indexing phase tokenizes documents using string matching to identify word boundaries, and the query phase uses positional indexes to verify phrase matches. Modern search engines process billions of documents with sub-second query latency.

**Bioinformatics and genome analysis** relies heavily on string matching to align DNA sequences (strings over the alphabet {A, C, G, T}). Tools like BLAST use seed-and-extend approaches (find short exact matches, then extend with approximate matching), while BWA and Bowtie use the Burrows-Wheeler Transform for compressed full-text indexing. A human genome has 3 billion base pairs, making efficient string matching algorithms essential for practical analysis.

**Plagiarism detection systems** (Turnitin, MOSS) use Rabin-Karp fingerprinting to identify matching text segments across millions of documents. They compute rolling hashes over fixed-size windows (k-grams) and compare fingerprints across documents. The Winnowing algorithm selects a subset of fingerprints to reduce storage while guaranteeing detection of matches above a minimum length threshold.

**Compiler lexical analysis** uses string matching to tokenize source code. The lexer matches input characters against patterns for keywords, identifiers, operators, and literals. While simple lexers use hand-coded state machines, tools like Flex generate DFA-based lexers from regular expressions, which internally use string matching algorithms optimized for the specific pattern set.

## Interview Questions

**Q: Explain how the KMP failure function works and why it guarantees O(n+m) time.**

A: The failure function for position i stores the length of the longest proper prefix of pattern[0..i] that is also a suffix. When a mismatch occurs at pattern position j after matching j characters, instead of restarting from the beginning, KMP jumps to position failure[j-1] because those characters are guaranteed to already match (they form both a prefix and suffix of what was matched). The O(n+m) guarantee comes from the observation that the text pointer never moves backward and advances at least once per iteration of the outer loop. The pattern pointer can move backward via the failure function, but the total number of backward moves is bounded by the total forward moves, giving amortized O(1) per text character.

**Q: When would you choose Rabin-Karp over KMP, and what are the trade-offs?**

A: Choose Rabin-Karp when searching for multiple patterns of the same length simultaneously (compute one rolling hash over the text, compare against all pattern hashes), when you need a simpler implementation and can tolerate probabilistic behavior, or when the problem involves finding repeated substrings (the rolling hash naturally supports this). The trade-off is that Rabin-Karp has O(n*m) worst case due to hash collisions (though extremely rare with good hash functions), while KMP guarantees O(n+m). KMP is deterministic and better for single-pattern matching in adversarial settings. Rabin-Karp shines in multi-pattern scenarios where Aho-Corasick would be overkill.

**Q: How would you find the longest repeated substring in a string?**

A: Use binary search on the answer length combined with Rabin-Karp hashing. Binary search works because if a repeated substring of length k exists, then repeated substrings of all lengths less than k also exist. For each candidate length, compute rolling hashes of all substrings of that length and check for duplicates using a hash set. Total time is O(n log n) average. Alternatively, build a suffix array with LCP (Longest Common Prefix) array in O(n) time; the answer is the maximum value in the LCP array. The suffix array approach is deterministic and optimal but more complex to implement.

**Q: Describe the Aho-Corasick algorithm and its advantages over running KMP multiple times.**

A: Aho-Corasick builds a trie from all patterns, then adds failure links (similar to KMP's failure function but across patterns) and dictionary links (pointing to shorter patterns that end at the same state). The text is processed character by character through the automaton in O(n) time, and all pattern matches are reported via dictionary links. Running KMP k times for k patterns takes O(k*n) time, while Aho-Corasick takes O(n + m + z) where m is total pattern length and z is number of matches. This makes it essential for applications with thousands of patterns like antivirus scanning and network intrusion detection.

## Production Tips

- **Use SIMD-accelerated string search for short patterns**: Modern CPUs provide SIMD instructions (SSE4.2 PCMPESTRI, AVX2) that can compare 16-32 bytes simultaneously. Libraries like Hyperscan (Intel) and the Rust `memchr` crate use these instructions to achieve throughput of several gigabytes per second for short pattern matching. For patterns under 16 bytes, SIMD search outperforms algorithmic approaches by 5-10x on modern hardware.

- **Choose the right algorithm based on pattern and text characteristics**: For single short patterns in large texts, Boyer-Moore with its sublinear average case is fastest in practice. For patterns with repetitive structure, KMP avoids worst-case degradation. For multiple patterns, Aho-Corasick amortizes the setup cost. For repeated queries on the same text, suffix arrays provide O(m log n) per query after O(n) preprocessing. Profile with realistic data before committing to an algorithm.

- **Implement streaming-compatible matching for unbounded input**: KMP and Aho-Corasick are naturally streaming-compatible because they process one character at a time and never look backward. This makes them suitable for matching patterns in network streams, log tails, and real-time data feeds where the full text is not available in memory. Rabin-Karp also works in streaming mode but requires careful handling of the rolling hash state across buffer boundaries.

## Related Topics

- [String Manipulation](./string-manipulation.md) — Foundational string operations that matching algorithms build upon
- [Two Pointers and Sliding Window](./two-pointers-and-sliding-window.md) — Sliding window as a simplified matching pattern
- [Prefix Sums and Hashing](./prefix-sums-and-hashing.md) — Rolling hash techniques used in Rabin-Karp
- [Trie](../fundamental-data-structures/trie.md) — Trie structure forms the basis of Aho-Corasick automaton
