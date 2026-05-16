# Sequence and String DP

## Quick Reference

- **Longest Common Subsequence (LCS)**: O(n*m) time, O(min(n,m)) space optimized
- **Edit Distance (Levenshtein)**: O(n*m) time — insert, delete, replace operations
- **Longest Palindromic Subsequence**: O(n²) time, O(n) space optimized
- **Longest Palindromic Substring**: O(n²) time, O(1) space with expand-around-center
- **Longest Common Substring**: O(n*m) time — contiguous match requirement
- **Regular Expression Matching**: O(n*m) time — wildcard and character class matching
- **Wildcard Matching**: O(n*m) time — '?' matches one, '*' matches any sequence
- **Distinct Subsequences**: O(n*m) time — count ways to form target from source
- **Interleaving Strings**: O(n*m) time — check if s3 is interleaving of s1 and s2
- **Key insight**: 2D table where dp[i][j] relates prefixes of both sequences

## When to Use

Sequence and string DP problems involve finding optimal alignments, transformations, or subsequences between one or more sequences. The state space is typically two-dimensional, with dp[i][j] representing the answer for the first i characters of one sequence and the first j characters of another.

Use sequence DP when comparing two strings or sequences (LCS for diff tools, edit distance for spell checking, sequence alignment for bioinformatics), when finding patterns within a single string (longest palindromic subsequence, longest repeating subsequence), when matching strings against patterns (regex matching, wildcard matching, glob patterns), or when counting or enumerating subsequences with specific properties.

The common structure is: define dp[i][j] based on the relationship between characters at positions i and j. If they match, the answer often extends from dp[i-1][j-1]. If they do not match, the answer comes from the best of dp[i-1][j], dp[i][j-1], or dp[i-1][j-1] plus some cost. This pattern repeats across dozens of problems with variations in the transition logic.

Space optimization is almost always possible: since dp[i][j] depends only on the current and previous row, you can reduce space from O(n*m) to O(min(n,m)) by keeping only two rows and iterating over the longer sequence as the outer loop.

## Code Examples

### Longest Common Subsequence

The foundational 2D DP problem. LCS finds the longest sequence that appears in both strings (not necessarily contiguous).

```java
public class LCS {
    /**
     * Longest Common Subsequence length.
     * dp[i][j] = LCS length of first i chars of s1 and first j chars of s2.
     * Time: O(n*m), Space: O(n*m), optimizable to O(min(n,m))
     */
    public static int lcsLength(String s1, String s2) {
        int n = s1.length(), m = s2.length();
        int[][] dp = new int[n + 1][m + 1];

        for (int i = 1; i <= n; i++) {
            for (int j = 1; j <= m; j++) {
                if (s1.charAt(i - 1) == s2.charAt(j - 1)) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;  // Characters match
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);  // Skip one
                }
            }
        }
        return dp[n][m];
    }

    /**
     * Reconstruct the actual LCS string by backtracking through the table.
     */
    public static String lcsString(String s1, String s2) {
        int n = s1.length(), m = s2.length();
        int[][] dp = new int[n + 1][m + 1];

        for (int i = 1; i <= n; i++) {
            for (int j = 1; j <= m; j++) {
                if (s1.charAt(i - 1) == s2.charAt(j - 1)) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }

        // Backtrack to find the actual subsequence
        StringBuilder lcs = new StringBuilder();
        int i = n, j = m;
        while (i > 0 && j > 0) {
            if (s1.charAt(i - 1) == s2.charAt(j - 1)) {
                lcs.append(s1.charAt(i - 1));
                i--;
                j--;
            } else if (dp[i - 1][j] > dp[i][j - 1]) {
                i--;
            } else {
                j--;
            }
        }
        return lcs.reverse().toString();
    }

    /**
     * Space-optimized LCS using two rows.
     * O(min(n,m)) space.
     */
    public static int lcsOptimized(String s1, String s2) {
        if (s1.length() < s2.length()) { String tmp = s1; s1 = s2; s2 = tmp; }
        int m = s2.length();
        int[] prev = new int[m + 1];
        int[] curr = new int[m + 1];

        for (int i = 1; i <= s1.length(); i++) {
            for (int j = 1; j <= m; j++) {
                if (s1.charAt(i - 1) == s2.charAt(j - 1)) {
                    curr[j] = prev[j - 1] + 1;
                } else {
                    curr[j] = Math.max(prev[j], curr[j - 1]);
                }
            }
            int[] tmp = prev; prev = curr; curr = tmp;
            Arrays.fill(curr, 0);
        }
        return prev[m];
    }
}
```

```python
def lcs_length(s1: str, s2: str) -> int:
    """Longest Common Subsequence length. O(n*m) time, O(m) space."""
    if len(s1) < len(s2):
        s1, s2 = s2, s1  # Optimize space by iterating over shorter string

    m = len(s2)
    prev = [0] * (m + 1)
    curr = [0] * (m + 1)

    for i in range(1, len(s1) + 1):
        for j in range(1, m + 1):
            if s1[i - 1] == s2[j - 1]:
                curr[j] = prev[j - 1] + 1
            else:
                curr[j] = max(prev[j], curr[j - 1])
        prev, curr = curr, [0] * (m + 1)

    return prev[m]
```

### Edit Distance (Levenshtein Distance)

Minimum number of operations (insert, delete, replace) to transform one string into another. Foundation for spell checkers and fuzzy matching.

```java
public class EditDistance {
    /**
     * Minimum edit distance between two strings.
     * dp[i][j] = min operations to convert s1[0..i-1] to s2[0..j-1].
     * Operations: insert (dp[i][j-1]+1), delete (dp[i-1][j]+1),
     *             replace (dp[i-1][j-1] + (s1[i-1]!=s2[j-1] ? 1 : 0))
     * Time: O(n*m), Space: O(m) with optimization
     */
    public static int minDistance(String s1, String s2) {
        int n = s1.length(), m = s2.length();
        int[] prev = new int[m + 1];
        int[] curr = new int[m + 1];

        // Base case: transforming empty string to s2[0..j-1] requires j insertions
        for (int j = 0; j <= m; j++) prev[j] = j;

        for (int i = 1; i <= n; i++) {
            curr[0] = i;  // Deleting i characters from s1
            for (int j = 1; j <= m; j++) {
                if (s1.charAt(i - 1) == s2.charAt(j - 1)) {
                    curr[j] = prev[j - 1];  // No operation needed
                } else {
                    curr[j] = 1 + Math.min(
                        prev[j - 1],  // Replace
                        Math.min(prev[j], curr[j - 1])  // Delete, Insert
                    );
                }
            }
            int[] tmp = prev; prev = curr; curr = tmp;
        }
        return prev[m];
    }

    /**
     * Edit distance with operation tracking for producing the edit script.
     * Returns the sequence of operations to transform s1 into s2.
     */
    public static List<String> editScript(String s1, String s2) {
        int n = s1.length(), m = s2.length();
        int[][] dp = new int[n + 1][m + 1];

        for (int i = 0; i <= n; i++) dp[i][0] = i;
        for (int j = 0; j <= m; j++) dp[0][j] = j;

        for (int i = 1; i <= n; i++) {
            for (int j = 1; j <= m; j++) {
                if (s1.charAt(i - 1) == s2.charAt(j - 1)) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    dp[i][j] = 1 + Math.min(dp[i - 1][j - 1],
                        Math.min(dp[i - 1][j], dp[i][j - 1]));
                }
            }
        }

        // Backtrack to produce edit script
        List<String> ops = new ArrayList<>();
        int i = n, j = m;
        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && s1.charAt(i - 1) == s2.charAt(j - 1)) {
                i--; j--;
            } else if (i > 0 && j > 0 && dp[i][j] == dp[i - 1][j - 1] + 1) {
                ops.add("Replace '" + s1.charAt(i - 1) + "' with '" + s2.charAt(j - 1) + "'");
                i--; j--;
            } else if (j > 0 && dp[i][j] == dp[i][j - 1] + 1) {
                ops.add("Insert '" + s2.charAt(j - 1) + "'");
                j--;
            } else {
                ops.add("Delete '" + s1.charAt(i - 1) + "'");
                i--;
            }
        }
        Collections.reverse(ops);
        return ops;
    }
}
```

```typescript
function editDistance(s1: string, s2: string): number {
  const n = s1.length, m = s2.length;
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  let curr = new Array(m + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    curr[0] = i;
    for (let j = 1; j <= m; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        curr[j] = prev[j - 1];
      } else {
        curr[j] = 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
      }
    }
    [prev, curr] = [curr, prev];
  }
  return prev[m];
}
```

### Longest Palindromic Subsequence

Finding the longest subsequence that reads the same forwards and backwards, using the insight that it equals LCS of the string with its reverse.

```java
public class PalindromeDP {
    /**
     * Longest Palindromic Subsequence.
     * dp[i][j] = length of longest palindromic subsequence in s[i..j].
     * If s[i] == s[j]: dp[i][j] = dp[i+1][j-1] + 2
     * Else: dp[i][j] = max(dp[i+1][j], dp[i][j-1])
     * Time: O(n²), Space: O(n) with optimization
     */
    public static int longestPalindromeSubseq(String s) {
        int n = s.length();
        int[] dp = new int[n];
        Arrays.fill(dp, 1);  // Single characters are palindromes of length 1

        for (int i = n - 2; i >= 0; i--) {
            int prev = 0;  // Represents dp[i+1][j-1] from previous iteration
            for (int j = i + 1; j < n; j++) {
                int temp = dp[j];  // Save current dp[j] before overwriting
                if (s.charAt(i) == s.charAt(j)) {
                    dp[j] = prev + 2;
                } else {
                    dp[j] = Math.max(dp[j], dp[j - 1]);
                }
                prev = temp;
            }
        }
        return dp[n - 1];
    }

    /**
     * Minimum insertions to make a string palindrome.
     * Answer = string length - longest palindromic subsequence length.
     */
    public static int minInsertions(String s) {
        return s.length() - longestPalindromeSubseq(s);
    }
}
```

## Common Pitfalls

- **Confusing subsequence with substring in the recurrence**: For LCS (subsequence), when characters do not match, you take max(dp[i-1][j], dp[i][j-1]) because you can skip characters in either string. For longest common substring (contiguous), when characters do not match, dp[i][j] = 0 because the contiguous match is broken. Using the wrong recurrence produces incorrect results that may look plausible on small inputs.

- **Incorrect base case initialization for edit distance**: The base cases dp[i][0] = i and dp[0][j] = j represent the cost of transforming a string to/from the empty string (all deletions or all insertions). Initializing these to 0 instead of i or j makes the algorithm think empty strings are free to produce, giving distances that are too small.

- **Off-by-one errors in 1-indexed vs 0-indexed strings**: The DP table is typically (n+1) x (m+1) with 1-based indexing for the strings. When accessing characters, use s1.charAt(i-1) and s2.charAt(j-1) (not i and j). This mismatch between table indices and string indices is the most common source of bugs in sequence DP implementations.

- **Not considering all three operations in edit distance**: Edit distance allows insert, delete, and replace. Forgetting one operation (commonly replace) gives a higher distance than the true minimum. The recurrence must consider all three: dp[i-1][j]+1 (delete from s1), dp[i][j-1]+1 (insert into s1), dp[i-1][j-1]+1 (replace). Some variants add different costs per operation, requiring careful handling.

- **Attempting to reconstruct the solution from a space-optimized table**: When you optimize space to O(min(n,m)) using two rows, you lose the ability to backtrack through the full table for solution reconstruction. If you need the actual LCS string or edit script (not just the length/distance), you must either keep the full table or use Hirschberg's algorithm (divide-and-conquer approach that achieves O(min(n,m)) space with reconstruction).

## Real-World Use Cases

**Version control diff algorithms** (Git, SVN, Mercurial) use LCS-based algorithms to compute the minimum edit script between file versions. The Unix `diff` utility uses the Hunt-Szymanski algorithm (an LCS variant optimized for files with many matching lines). Git's patience diff algorithm uses unique matching lines as anchors, then applies LCS between anchors. These algorithms process millions of lines in milliseconds by exploiting the structure of real-world file changes.

**Spell checking and autocorrect** systems use edit distance to find the closest dictionary words to a misspelled input. When you type "teh," the system computes edit distance to all dictionary words and suggests "the" (distance 1). Production spell checkers use BK-trees or symmetric delete algorithms to avoid computing distance to every dictionary word, achieving sub-millisecond lookup in dictionaries with hundreds of thousands of words.

**Bioinformatics sequence alignment** uses variants of edit distance (Smith-Waterman for local alignment, Needleman-Wunsch for global alignment) to compare DNA, RNA, and protein sequences. These algorithms use scoring matrices (BLOSUM, PAM) that assign different costs to different substitutions based on evolutionary likelihood. BLAST uses heuristic seed-and-extend approaches to approximate alignment for genome-scale comparisons.

**Plagiarism detection** uses longest common subsequence and its variants to identify copied text that has been lightly modified (word reordering, synonym substitution, sentence restructuring). Academic integrity tools compare student submissions pairwise, flagging pairs with unusually high LCS relative to document length. The challenge is scaling to thousands of documents with quadratic pairwise comparison.

**Natural language processing** uses sequence DP for tasks like machine translation (sequence-to-sequence alignment), named entity recognition (optimal label sequences), and text summarization (selecting sentences that maximize coverage while minimizing redundancy, a variant of the knapsack problem on sequences).

## Interview Questions

**Q: Explain the edit distance algorithm and its applications.**

A: Edit distance computes the minimum number of single-character operations (insert, delete, replace) to transform one string into another. The DP table dp[i][j] represents the minimum operations for the first i characters of source and first j characters of target. When characters match, dp[i][j] = dp[i-1][j-1] (no cost). When they differ, dp[i][j] = 1 + min(dp[i-1][j-1], dp[i-1][j], dp[i][j-1]) representing replace, delete, and insert respectively. Applications include spell checking, DNA sequence comparison, fuzzy string matching, and OCR error correction. Time and space are O(n*m), optimizable to O(min(n,m)) space.

**Q: How would you find the longest palindromic subsequence in a string?**

A: Two approaches. First, observe that the longest palindromic subsequence of s equals the LCS of s and reverse(s), reducing to a standard LCS problem in O(n²) time. Second, use interval DP directly: dp[i][j] = longest palindromic subsequence in s[i..j]. If s[i] == s[j], dp[i][j] = dp[i+1][j-1] + 2. Otherwise, dp[i][j] = max(dp[i+1][j], dp[i][j-1]). Fill the table diagonally (increasing length). Space can be optimized to O(n) by processing in the right order and tracking the previous diagonal value.

**Q: What is the difference between longest common subsequence and longest common substring?**

A: LCS allows non-contiguous elements (maintains relative order but elements need not be adjacent), while longest common substring requires contiguous characters. For LCS, when characters do not match, dp[i][j] = max(dp[i-1][j], dp[i][j-1]) because we can skip characters. For longest common substring, dp[i][j] = 0 on mismatch because the contiguous run is broken. LCS is O(n*m) time and finds the longest shared structure. Longest common substring can also be solved with suffix arrays in O(n+m) time.

**Q: How would you implement regex matching with '.' and '*' using DP?**

A: Define dp[i][j] = whether pattern[0..j-1] matches text[0..i-1]. Base case: dp[0][0] = true. For '*' at pattern position j, it can match zero occurrences (dp[i][j] = dp[i][j-2]) or one more occurrence if the preceding character matches (dp[i][j] = dp[i-1][j] when pattern[j-2] matches text[i-1]). For '.' at position j, it matches any single character. For literal characters, dp[i][j] = dp[i-1][j-1] when characters match. Time is O(n*m) where n is text length and m is pattern length.

## Production Tips

- **Use Myers' diff algorithm for file comparison**: The standard O(n*m) LCS is too slow for large files. Myers' algorithm runs in O(n*d) time where d is the edit distance, which is fast for similar files (small d). It is the algorithm used by Git and GNU diff. For very large files with many differences, fall back to line-level hashing to reduce the problem size before applying character-level diff.

- **Implement fuzzy matching with bounded edit distance**: When searching for approximate matches (autocomplete, search suggestions), you rarely need the exact edit distance — you only care whether it is below a threshold k. Use the bounded edit distance algorithm that prunes the DP table to a band of width 2k+1 around the diagonal, reducing time from O(n*m) to O(n*k). This is critical for real-time autocomplete over large dictionaries.

- **Cache edit distance computations for repeated comparisons**: In applications that compare the same strings repeatedly (deduplication, record linkage), cache computed distances using an LRU cache keyed by string pair hashes. For large-scale deduplication, use locality-sensitive hashing (LSH) to identify candidate pairs before computing exact edit distance, reducing quadratic pairwise comparison to near-linear.

## Related Topics

- [Fundamentals and 1D Problems](./fundamentals-and-1d-problems.md) — Foundation of DP thinking and space optimization
- [Knapsack and Subset Problems](./knapsack-and-subset-problems.md) — Similar 2D DP structure with different semantics
- [Arrays and Strings](../arrays-and-strings/index.md) — String manipulation techniques used alongside DP
- [Advanced DP Patterns](./advanced-dp-patterns.md) — Interval DP generalizes palindrome problems
