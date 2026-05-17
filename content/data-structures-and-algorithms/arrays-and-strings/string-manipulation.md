# String Manipulation

## Quick Reference

- **String immutability (Java/Python/JS)**: Concatenation creates new objects, O(n) per operation
- **StringBuilder/StringBuffer (Java)**: Amortized O(1) append, O(n) total for n appends
- **Character encoding**: ASCII (1 byte), UTF-8 (1-4 bytes), UTF-16 (2-4 bytes)
- **String comparison**: O(min(n, m)) character-by-character
- **String hashing**: O(n) to compute, O(1) to compare hashes (with collision risk)
- **Substring extraction**: O(n) in most modern implementations (copy semantics)
- **String interning**: O(1) equality check for interned strings via reference comparison
- **Common operations**: split O(n), trim O(n), replace O(n*m), toLowerCase O(n)
- **Palindrome check**: O(n/2) with two pointers from both ends

## When to Use

String manipulation is central to virtually every software system. You encounter string problems when building parsers, validators, search engines, compilers, data pipelines, and user-facing applications. The key challenge is that strings combine array-like sequential access with semantic complexity from character encoding, locale-aware operations, and immutability constraints.

Use specialized string algorithms when you need pattern matching across large texts (log analysis, DNA sequencing, plagiarism detection), when building text editors or IDEs that require efficient insertion and deletion at arbitrary positions, when implementing serialization and deserialization protocols (JSON, XML, Protocol Buffers), or when processing user input that requires validation, sanitization, and normalization.

Understanding string internals matters because naive string operations are a common source of performance bugs. Concatenating strings in a loop creates O(n squared) behavior in languages with immutable strings. Using the wrong encoding causes data corruption in internationalized applications. Comparing strings without normalization leads to subtle equality bugs with Unicode characters that look identical but have different code points.

In interview settings, string problems test your ability to work with character-level operations, recognize patterns that map to known algorithms (anagram detection maps to frequency counting, palindrome detection maps to two pointers), and handle edge cases around empty strings, single characters, and Unicode.

## Code Examples

### Efficient String Building

Demonstrates the performance difference between naive concatenation and StringBuilder, a critical distinction for production code processing large text.

```java
public class StringBuilding {
    /**
     * WRONG: O(n^2) due to immutable string concatenation in loop.
     * Each += creates a new String object and copies all previous characters.
     */
    public static String buildNaive(List<String> parts) {
        String result = "";
        for (String part : parts) {
            result += part;  // O(result.length) copy each iteration
        }
        return result;
    }

    /**
     * CORRECT: O(n) total using StringBuilder with pre-sized buffer.
     * Amortized O(1) per append, single toString() at the end.
     */
    public static String buildEfficient(List<String> parts) {
        int totalLength = parts.stream().mapToInt(String::length).sum();
        StringBuilder sb = new StringBuilder(totalLength);  // Pre-allocate
        for (String part : parts) {
            sb.append(part);
        }
        return sb.toString();
    }

    /**
     * String.join() for simple delimiter-based joining.
     * Internally uses StringJoiner which pre-calculates capacity.
     */
    public static String joinWithDelimiter(List<String> parts, String delimiter) {
        return String.join(delimiter, parts);
    }
}
```

```typescript
// TypeScript string building patterns
function buildString(parts: string[]): string {
  // Array.join is the idiomatic efficient approach in JS/TS
  return parts.join('');
}

// Template literals for interpolation (compiled to concatenation)
function formatMessage(name: string, count: number): string {
  return `Hello ${name}, you have ${count} notifications`;
}

// For complex building with conditionals, use array + join
function buildQuery(filters: Map<string, string>): string {
  const clauses: string[] = [];
  for (const [key, value] of filters) {
    clauses.push(`${key} = '${value}'`);
  }
  return clauses.length > 0
    ? `WHERE ${clauses.join(' AND ')}`
    : '';
}
```

### Anagram Detection and Grouping

Anagram problems reduce to character frequency comparison, a pattern that appears in plagiarism detection, spell checkers, and word games.

```java
public class Anagrams {
    /**
     * Check if two strings are anagrams using frequency counting.
     * Time: O(n), Space: O(1) for fixed alphabet
     */
    public static boolean isAnagram(String s, String t) {
        if (s.length() != t.length()) return false;

        int[] freq = new int[26];  // Assumes lowercase English
        for (int i = 0; i < s.length(); i++) {
            freq[s.charAt(i) - 'a']++;
            freq[t.charAt(i) - 'a']--;
        }

        for (int count : freq) {
            if (count != 0) return false;
        }
        return true;
    }

    /**
     * Group anagrams together using sorted string as canonical key.
     * Time: O(n * k log k) where k is max string length
     */
    public static List<List<String>> groupAnagrams(String[] strs) {
        Map<String, List<String>> groups = new HashMap<>();

        for (String s : strs) {
            char[] chars = s.toCharArray();
            Arrays.sort(chars);
            String key = new String(chars);
            groups.computeIfAbsent(key, k -> new ArrayList<>()).add(s);
        }

        return new ArrayList<>(groups.values());
    }
}
```

```java
import java.util.*;

public class AnagramsAlt {
    /**
     * Check anagram using frequency array comparison. O(n) time.
     */
    public static boolean isAnagram(String s, String t) {
        if (s.length() != t.length()) return false;
        int[] freq = new int[26];
        for (int i = 0; i < s.length(); i++) {
            freq[s.charAt(i) - 'a']++;
            freq[t.charAt(i) - 'a']--;
        }
        for (int count : freq) {
            if (count != 0) return false;
        }
        return true;
    }

    /**
     * Group anagrams using sorted string as canonical key.
     */
    public static List<List<String>> groupAnagrams(String[] strs) {
        Map<String, List<String>> groups = new HashMap<>();
        for (String s : strs) {
            char[] chars = s.toCharArray();
            Arrays.sort(chars);
            String key = new String(chars);
            groups.computeIfAbsent(key, k -> new ArrayList<>()).add(s);
        }
        return new ArrayList<>(groups.values());
    }

    /**
     * Find all starting indices of pattern's anagrams in text.
     * Uses sliding window with frequency comparison. O(n) time.
     */
    public static List<Integer> findAnagramsInText(String text, String pattern) {
        List<Integer> result = new ArrayList<>();
        int n = text.length(), m = pattern.length();
        if (m > n) return result;

        int[] pCount = new int[26];
        int[] wCount = new int[26];

        for (int i = 0; i < m; i++) {
            pCount[pattern.charAt(i) - 'a']++;
            wCount[text.charAt(i) - 'a']++;
        }

        if (Arrays.equals(pCount, wCount)) result.add(0);

        for (int i = m; i < n; i++) {
            // Add new character to window
            wCount[text.charAt(i) - 'a']++;
            // Remove old character from window
            wCount[text.charAt(i - m) - 'a']--;

            if (Arrays.equals(pCount, wCount)) {
                result.add(i - m + 1);
            }
        }
        return result;
    }
}
```

### Palindrome Operations

Palindrome detection and construction using two-pointer and dynamic programming approaches.

```java
public class Palindromes {
    /**
     * Check if string is a palindrome using two pointers.
     * Ignores non-alphanumeric characters and case.
     * Time: O(n), Space: O(1)
     */
    public static boolean isPalindrome(String s) {
        int left = 0, right = s.length() - 1;

        while (left < right) {
            while (left < right && !Character.isLetterOrDigit(s.charAt(left))) left++;
            while (left < right && !Character.isLetterOrDigit(s.charAt(right))) right--;

            if (Character.toLowerCase(s.charAt(left)) != Character.toLowerCase(s.charAt(right))) {
                return false;
            }
            left++;
            right--;
        }
        return true;
    }

    /**
     * Longest palindromic substring using expand-around-center.
     * Time: O(n^2), Space: O(1)
     */
    public static String longestPalindrome(String s) {
        if (s.length() < 2) return s;

        int start = 0, maxLen = 1;

        for (int i = 0; i < s.length(); i++) {
            // Odd-length palindromes
            int len1 = expandAroundCenter(s, i, i);
            // Even-length palindromes
            int len2 = expandAroundCenter(s, i, i + 1);
            int len = Math.max(len1, len2);

            if (len > maxLen) {
                maxLen = len;
                start = i - (len - 1) / 2;
            }
        }

        return s.substring(start, start + maxLen);
    }

    private static int expandAroundCenter(String s, int left, int right) {
        while (left >= 0 && right < s.length() && s.charAt(left) == s.charAt(right)) {
            left--;
            right++;
        }
        return right - left - 1;
    }
}
```

## Common Pitfalls

- **String concatenation in loops creating O(n squared) behavior**: In Java, Python, and JavaScript, strings are immutable. Each concatenation with `+=` creates a new string object and copies all previous characters. Building a string of length n character-by-character takes O(n squared) time and creates n intermediate garbage objects. Always use StringBuilder (Java), list with join (Python), or array with join (JavaScript) for iterative string construction.

- **Comparing strings with == instead of .equals() in Java**: The `==` operator compares object references, not content. Two strings with identical characters may be different objects in memory. Always use `.equals()` for content comparison. The exception is interned strings (literals and explicitly interned strings) where `==` works but should still be avoided for clarity. In JavaScript, `===` compares by value for primitives, so this pitfall is Java-specific.

- **Ignoring Unicode normalization in equality checks**: Characters like "é" can be represented as a single code point (U+00E9) or as "e" + combining acute accent (U+0065 U+0301). These look identical but fail equality checks without normalization. Use `Normalizer.normalize(s, Form.NFC)` in Java or `str.normalize('NFC')` in JavaScript before comparing user-provided strings, especially for usernames, search queries, and file paths.

- **Assuming one character equals one byte or one array index**: UTF-16 (Java, JavaScript) uses surrogate pairs for characters outside the Basic Multilingual Plane (emoji, some CJK characters). `"😀".length()` returns 2 in Java, not 1. Use `codePointCount()` for true character count. In Python 3, strings are sequences of Unicode code points, so `len("😀")` correctly returns 1, but encoding to bytes changes the length.

- **Mutating strings through character arrays without considering thread safety**: Converting a string to a char array, modifying it, and converting back is not atomic. In concurrent code, another thread may observe the intermediate state. If multiple threads build strings from shared data, use thread-local StringBuilders or synchronized access to shared builders.

## Real-World Use Cases

**Log parsing and analysis** in production systems processes millions of log lines per second, extracting timestamps, severity levels, request IDs, and error messages using string splitting, regex matching, and substring extraction. Tools like Elasticsearch, Splunk, and Datadog ingest structured and unstructured text, requiring efficient string tokenization and indexing. The choice between regex and manual parsing often determines whether a log pipeline can keep up with production traffic.

**Input validation and sanitization** protects applications from injection attacks (SQL injection, XSS, command injection) by examining and transforming user-provided strings. Production validators check string length, character set membership, format compliance (email, phone, URL), and escape special characters. OWASP guidelines recommend allowlist validation (accepting only known-good patterns) over denylist validation (rejecting known-bad patterns).

**Internationalization (i18n) and localization** requires handling strings in hundreds of languages with different character sets, text directions (LTR vs RTL), collation rules, and pluralization patterns. ICU (International Components for Unicode) provides production-grade string comparison, case mapping, and text segmentation that respects locale-specific rules. A simple `toLowerCase()` call produces wrong results for Turkish (dotted vs dotless i) without locale awareness.

**Text search engines** like Lucene (powering Elasticsearch and Solr) build inverted indexes from document text, requiring tokenization (splitting text into terms), stemming (reducing words to root forms), and normalization (case folding, accent removal). These string transformations determine search quality and must handle misspellings, synonyms, and multi-language content.

**Serialization protocols** (JSON, Protocol Buffers, MessagePack) encode structured data as strings or byte sequences for network transmission and storage. JSON parsing requires handling escape sequences, Unicode escapes, and nested string values. High-performance JSON parsers like simdjson use SIMD instructions to process string characters 16-32 at a time.

## Interview Questions

**Q: How would you determine if one string is a rotation of another?**

A: Concatenate the first string with itself and check if the second string is a substring of the result. For example, "waterbottle" is a rotation of "erbottlewat" because "erbottlewaterbottlewat" contains "waterbottle". This works because any rotation of s appears as a substring of s+s. Time is O(n) using an efficient substring search algorithm (KMP or built-in contains). The key insight is that rotation is equivalent to cutting the string at some index and swapping the two halves.

**Q: Implement a function to compress a string using counts of repeated characters. If the compressed string is not shorter, return the original.**

A: Use a StringBuilder to build the compressed result. Iterate through the string, counting consecutive identical characters. Append each character followed by its count. Compare lengths at the end. For "aabcccccaaa" the result is "a2b1c5a3" (shorter). For "abc" the result would be "a1b1c1" (longer, so return original). Time is O(n), space is O(n). Edge cases include single-character strings and strings with no repeats.

**Q: Given a string of parentheses, determine the minimum number of insertions to make it valid.**

A: Use a counter approach. Track open brackets needed (unmatched closing brackets) and close brackets needed (unmatched opening brackets). Iterate through the string: for each opening bracket, increment the close-needed counter. For each closing bracket, if close-needed is positive, decrement it (matched with a previous open); otherwise increment open-needed (unmatched close). The answer is open-needed plus close-needed. Time is O(n), space is O(1).

**Q: How would you find the longest common prefix among an array of strings?**

A: Compare characters column by column across all strings. Start at index 0 and check if all strings have the same character at that position. Stop when characters differ or any string ends. Time is O(S) where S is the sum of all character lengths, but in practice terminates early. An alternative approach sorts the array and only compares the first and last strings (lexicographically most different), achieving O(n log n + m) where m is the shortest string length.

## Production Tips

- **Use string interning judiciously for frequently compared values**: String interning (Java's `String.intern()`, Python's `sys.intern()`) stores strings in a pool and returns canonical references, enabling O(1) equality checks via reference comparison. This is valuable for enum-like values (status codes, country codes, HTTP methods) that are compared millions of times. However, interning arbitrary user input fills the string pool and increases GC pressure. Only intern strings from a bounded, known set.

- **Choose the right string representation for your access pattern**: If you need frequent random access to characters, use a flat string or char array. If you need frequent insertions and deletions at arbitrary positions (text editors), use a rope data structure (tree of string fragments) or gap buffer. If you need efficient prefix queries, use a trie. The wrong representation can make O(1) operations become O(n).

- **Profile string operations before optimizing**: String performance issues are often counterintuitive. Modern JVMs optimize string concatenation with `invokedynamic` (Java 9+), making simple cases fast without explicit StringBuilder. JavaScript engines optimize string operations heavily. Profile with realistic data before adding complexity. The biggest wins usually come from avoiding unnecessary string creation (reuse, caching) rather than micro-optimizing individual operations.

## Related Topics

- [String Matching Algorithms](./string-matching-algorithms.md) — KMP, Rabin-Karp, and advanced pattern matching
- [Two Pointers and Sliding Window](./two-pointers-and-sliding-window.md) — Sliding window applied to substring problems
- [Prefix Sums and Hashing](./prefix-sums-and-hashing.md) — Rolling hash for string comparison
- [Trie](../fundamental-data-structures/trie.md) — Specialized tree structure for string prefix operations
