# Code Review Practices

## Quick Reference

- **Purpose of code review**: Catch defects, share knowledge, maintain consistency, and improve design — not gatekeeping
- **Review scope**: Aim for PRs under 400 lines of changed code — larger PRs have exponentially lower defect detection rates
- **Response time**: Reviews should begin within 4 business hours to avoid blocking teammates and context loss
- **Approval criteria**: Code must be correct, readable, maintainable, and tested — not necessarily how the reviewer would have written it
- **Two types of comments**: Blocking (must fix before merge) and non-blocking (suggestions, nits, future improvements)
- **Automated checks first**: Linting, formatting, type checking, and tests should pass before human review begins
- **Review the design, not just the code**: Evaluate whether the approach is sound before nitpicking implementation details
- **Every comment should explain "why"**: State the principle or concern behind your feedback, not just what to change

## When to Use

Code review should be applied to every change that reaches a shared branch in a collaborative codebase. The intensity and formality of review should scale with the risk and complexity of the change.

Apply thorough review with multiple reviewers for changes to authentication, authorization, payment processing, data migration, public APIs, shared libraries, and infrastructure configuration. These changes have high blast radius and are difficult to reverse.

Apply standard review (one reviewer, normal turnaround) for feature implementations, bug fixes, test additions, documentation updates, and internal refactoring. These changes are important but have limited blast radius and are easily reverted.

Apply lightweight review (quick scan, auto-merge eligible) for dependency version bumps with passing CI, generated code updates, configuration changes with feature flags, and typo fixes. These changes have minimal risk and automated checks provide sufficient validation.

Skip formal review for emergency hotfixes in production (review post-merge), personal experimental branches, and draft PRs explicitly marked as work-in-progress. Even in these cases, a post-hoc review provides learning opportunities.

## Code Examples

### Automated Review Configuration with GitHub Actions

Automated checks should run before human review begins. This ensures reviewers spend time on design and logic rather than formatting and type errors.

```yaml
# .github/workflows/pr-checks.yml
name: PR Quality Checks

on:
  pull_request:
    branches: [main, develop]

jobs:
  automated-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for diff analysis

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Type checking
        run: npx tsc --noEmit

      - name: Lint
        run: npx eslint --max-warnings 0 .

      - name: Format check
        run: npx prettier --check .

      - name: Unit tests
        run: npx vitest run --coverage

      - name: Check PR size
        uses: actions/github-script@v7
        with:
          script: |
            const { data: files } = await github.rest.pulls.listFiles({
              owner: context.repo.owner,
              repo: context.repo.repo,
              pull_number: context.issue.number,
            });

            const totalChanges = files.reduce((sum, file) =>
              sum + file.additions + file.deletions, 0
            );

            if (totalChanges > 400) {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                body: `⚠️ This PR has ${totalChanges} lines changed. Consider splitting into smaller PRs for more effective review. PRs over 400 lines have significantly lower defect detection rates.`
              });
            }

      - name: Check test coverage delta
        run: |
          npx vitest run --coverage --reporter=json --outputFile=coverage.json
          node scripts/check-coverage-delta.js
```

### Review Checklist Implementation

A structured checklist ensures consistent review quality across team members and prevents common oversights.

```typescript
// review-checklist.ts — Automated checklist generation based on PR content
interface ReviewChecklist {
  category: string;
  items: ChecklistItem[];
}

interface ChecklistItem {
  description: string;
  severity: 'critical' | 'important' | 'nice-to-have';
  automated: boolean;
  applicable: (prContext: PRContext) => boolean;
}

const REVIEW_CHECKLISTS: ReviewChecklist[] = [
  {
    category: 'Correctness',
    items: [
      {
        description: 'Edge cases handled (null, empty, boundary values)',
        severity: 'critical',
        automated: false,
        applicable: () => true,
      },
      {
        description: 'Error handling covers all failure modes',
        severity: 'critical',
        automated: false,
        applicable: (ctx) => ctx.touchesErrorHandling,
      },
      {
        description: 'Concurrent access is safe (race conditions, deadlocks)',
        severity: 'critical',
        automated: false,
        applicable: (ctx) => ctx.touchesSharedState || ctx.touchesAsync,
      },
      {
        description: 'Database queries use parameterized statements',
        severity: 'critical',
        automated: true,
        applicable: (ctx) => ctx.touchesDatabase,
      },
    ],
  },
  {
    category: 'Security',
    items: [
      {
        description: 'Input validation on all external data',
        severity: 'critical',
        automated: false,
        applicable: (ctx) => ctx.touchesAPI || ctx.touchesUserInput,
      },
      {
        description: 'Authentication/authorization checks present',
        severity: 'critical',
        automated: false,
        applicable: (ctx) => ctx.touchesEndpoints,
      },
      {
        description: 'No secrets or credentials in code',
        severity: 'critical',
        automated: true,
        applicable: () => true,
      },
      {
        description: 'Sensitive data not logged or exposed in errors',
        severity: 'critical',
        automated: false,
        applicable: (ctx) => ctx.touchesLogging || ctx.touchesPII,
      },
    ],
  },
  {
    category: 'Testing',
    items: [
      {
        description: 'New code has corresponding unit tests',
        severity: 'important',
        automated: true,
        applicable: (ctx) => ctx.hasNewCode,
      },
      {
        description: 'Tests cover happy path and error cases',
        severity: 'important',
        automated: false,
        applicable: (ctx) => ctx.hasNewTests,
      },
      {
        description: 'Integration tests for new API endpoints',
        severity: 'important',
        automated: false,
        applicable: (ctx) => ctx.touchesEndpoints,
      },
    ],
  },
  {
    category: 'Design',
    items: [
      {
        description: 'Single responsibility — each class/function has one job',
        severity: 'important',
        automated: false,
        applicable: () => true,
      },
      {
        description: 'No unnecessary coupling between modules',
        severity: 'important',
        automated: false,
        applicable: (ctx) => ctx.touchesMultipleModules,
      },
      {
        description: 'Public API is minimal and well-named',
        severity: 'nice-to-have',
        automated: false,
        applicable: (ctx) => ctx.addsPublicAPI,
      },
    ],
  },
];

function generateChecklist(prContext: PRContext): ReviewChecklist[] {
  return REVIEW_CHECKLISTS.map(checklist => ({
    ...checklist,
    items: checklist.items.filter(item => item.applicable(prContext)),
  })).filter(checklist => checklist.items.length > 0);
}
```

### Constructive Feedback Examples

The way feedback is delivered determines whether it improves code quality or creates conflict. Here are patterns for effective review comments:

```markdown
## Effective Review Comment Patterns

### Pattern 1: Observation + Impact + Suggestion

❌ BAD: "This is wrong. Use a Map instead."

✅ GOOD: "This array lookup is O(n) for each iteration of the outer loop,
making the overall complexity O(n²). Since we're looking up by ID repeatedly,
a Map would give O(1) lookups and bring this to O(n). Something like:

```typescript
const usersById = new Map(users.map(u => [u.id, u]));
for (const order of orders) {
  const user = usersById.get(order.userId);
  // ...
}
```

This matters because the users array can reach 100k entries in production."

### Pattern 2: Question that reveals the issue

❌ BAD: "This doesn't handle the null case."

✅ GOOD: "What happens if `user.preferences` is null here? I see the
UserPreferences type is nullable in the schema, and new users won't have
preferences set until they visit settings. Should we fall back to defaults?"

### Pattern 3: Prefix with severity

- `[blocking]` — Must be addressed before merge
- `[suggestion]` — Take it or leave it, won't block
- `[nit]` — Style preference, completely optional
- `[question]` — Seeking understanding, not requesting change
- `[praise]` — Highlighting good work

Example:
"[suggestion] Consider extracting this validation into a separate function.
It would make the happy path more readable and the validation logic
independently testable. Not blocking though — the current approach works."

### Pattern 4: Link to principles or documentation

"[blocking] This endpoint accepts user input and passes it directly to the
SQL query without parameterization. This creates a SQL injection vulnerability.
See our security guidelines: docs/security/input-validation.md

Suggested fix: use the query builder's parameterized interface:
```typescript
db.query('SELECT * FROM users WHERE id = ?', [userId])
```"
```

### PR Description Template

```markdown
## PR Description Template

### What does this PR do?
<!-- One paragraph summary of the change -->

### Why is this change needed?
<!-- Link to issue/ticket, business context -->

### How was this tested?
<!-- Unit tests, integration tests, manual testing steps -->

### Deployment considerations
<!-- Feature flags, migrations, rollback plan -->

### Screenshots/recordings (if UI change)
<!-- Before/after screenshots -->

### Checklist
- [ ] Tests pass locally
- [ ] No new warnings introduced
- [ ] Documentation updated (if public API changed)
- [ ] Migration is reversible (if database change)
- [ ] Feature flag configured (if gradual rollout needed)

### Review guidance
<!-- What should reviewers focus on? Any areas of uncertainty? -->
```

## Common Pitfalls

- **Rubber-stamping large PRs**: When a PR exceeds 400 lines, reviewers experience cognitive overload and default to approving without thorough examination. Research shows defect detection drops from 70% for small PRs to under 20% for PRs over 1000 lines. Insist on splitting large changes into reviewable chunks.

- **Bikeshedding on style while missing logic errors**: Spending review time debating variable names or formatting while overlooking race conditions, missing error handling, or security vulnerabilities. Automate style enforcement with linters and formatters so human review focuses on correctness and design.

- **Making it personal**: Comments like "you always do this" or "this is bad code" attack the author rather than the code. Frame feedback around the code's behavior and impact: "This approach may cause issues when X because Y" rather than "You didn't think about X."

- **Approval without understanding**: Approving code you do not understand because you trust the author or feel pressured by deadlines. If you cannot explain what the code does and why it is correct, you cannot effectively review it. Ask questions or request a walkthrough rather than rubber-stamping.

- **Blocking on subjective preferences**: Holding up a PR because you would have implemented it differently, even though the current approach is correct, readable, and maintainable. Reserve blocking comments for objective issues: bugs, security vulnerabilities, missing tests, and violations of documented team standards.

- **Delayed reviews creating context-switching costs**: When reviews sit for days, the author loses context and must re-load the mental model when addressing feedback. The reviewer also loses context between rounds. Aim for first review within 4 hours and subsequent rounds within 2 hours.

- **Review comments without actionable guidance**: Saying "this could be better" without explaining how or why provides no value. Every comment should include either a specific suggestion, a question that leads to improvement, or a reference to a principle/guideline that explains the concern.

## Real-World Use Cases

**Google's code review process**: Google requires every change to be reviewed by at least one other engineer. Their research found that code review catches approximately 15% of defects (complementing testing which catches another 50%). More importantly, reviews serve as the primary mechanism for knowledge sharing and maintaining code consistency across 25,000+ engineers. Google's review tool (Critique) integrates automated analysis results directly into the review interface.

**Microsoft's pull request insights**: Microsoft Research studied pull request practices across Azure DevOps and found that PRs with clear descriptions receive feedback 40% faster, PRs under 200 lines have 2x higher approval rates on first submission, and teams with consistent review practices ship 30% fewer production defects. They also found that review quality degrades significantly after 60 minutes of continuous reviewing.

**Shopify's review culture**: Shopify uses a "review buddy" system where each PR is assigned to a specific reviewer based on code ownership and expertise. They distinguish between "approval" (code is correct and safe to ship) and "endorsement" (code follows team patterns and is maintainable). Both are required for merge, but from different reviewers.

**Linux kernel review process**: The Linux kernel uses a multi-level review process where patches are reviewed by subsystem maintainers, then by senior maintainers, before reaching Linus Torvalds. Each level focuses on different concerns: correctness at the subsystem level, architectural consistency at the senior level, and overall direction at the top level. This hierarchical approach scales to thousands of contributors.

**Stripe's review for security-sensitive code**: Stripe requires additional security-focused review for any change touching payment processing, authentication, or PII handling. Security reviewers have a specialized checklist covering injection attacks, authorization bypasses, data leakage, and cryptographic misuse. This targeted approach concentrates expensive expert review where it matters most.

## Interview Questions

**Q: How do you handle disagreements during code review when you believe the approach is fundamentally wrong?**

A: First, I distinguish between "wrong" (will cause bugs, security issues, or maintenance nightmares) and "different from how I would do it" (valid alternative approach). For genuinely problematic approaches, I explain the specific concern with concrete examples: "This approach will cause N+1 queries in production because X, which will degrade response times from 50ms to 2s at our current load." I provide an alternative with reasoning, not just criticism. If we still disagree, I suggest a brief synchronous discussion — text-based review comments are poor for nuanced design debates. For architectural disagreements that affect the team, I escalate to a design discussion with the broader team rather than blocking one person's PR indefinitely. The goal is reaching the best outcome for the codebase, not winning an argument.

**Q: What metrics would you use to measure code review effectiveness?**

A: I would track both process metrics and outcome metrics. Process metrics include: review turnaround time (time from PR opened to first review), review cycles (number of back-and-forth rounds before approval), PR size distribution (percentage of PRs under 400 lines), and review participation (are reviews concentrated among few people or distributed). Outcome metrics include: defect escape rate (bugs found in production that should have been caught in review), post-merge reverts (changes that had to be rolled back), knowledge distribution (measured by bus factor — how many people can modify each area), and developer satisfaction with the review process (quarterly surveys). The most important metric is defect escape rate combined with review turnaround time — you want high quality without creating bottlenecks.

**Q: How do you review code in a language or domain you are not expert in?**

A: I focus on what I can evaluate regardless of language expertise: logical correctness (does the algorithm make sense?), error handling completeness (are all failure modes addressed?), test coverage (do tests cover edge cases?), naming clarity (can I understand intent from names?), and architectural fit (does this follow the project's established patterns?). I explicitly state my limitations in the review: "I'm not deeply familiar with Rust's ownership model, so I cannot evaluate the lifetime annotations, but the business logic and error handling look correct." I also use this as a learning opportunity — I ask questions about language-specific patterns I don't understand, which serves both my education and the review's thoroughness. For critical changes in unfamiliar domains, I recommend adding a domain expert as a second reviewer rather than approving something I cannot fully evaluate.

**Q: How would you introduce code review practices to a team that has never done them?**

A: I would introduce reviews gradually rather than mandating them overnight. Start with voluntary reviews on high-risk changes (database migrations, auth changes) to demonstrate value without creating friction. Establish clear guidelines early: what constitutes a blocking comment, expected turnaround time, and PR size limits. Invest in automation first — linting, formatting, and type checking should be automated so early reviews focus on interesting problems rather than style debates. Lead by example by submitting my own code for review and responding graciously to feedback. After 2-3 weeks of voluntary adoption, formalize the process with team agreement on when reviews are required. Track and share metrics showing reduced bug rates and faster onboarding. Address resistance by acknowledging that reviews take time but frame it as an investment: 30 minutes of review prevents 4 hours of debugging in production.

## Production Tips

- **Integrate automated analysis into the review workflow**: Configure static analysis tools (SonarQube, CodeClimate, Snyk) to post findings directly as review comments on PRs. This surfaces security vulnerabilities, complexity hotspots, and dependency issues without requiring reviewers to run tools manually. Prioritize findings by severity — only block merges for critical issues, present others as informational.

- **Implement CODEOWNERS for automatic reviewer assignment**: Use GitHub's CODEOWNERS file or equivalent to automatically assign reviewers based on file paths. This ensures domain experts review changes in their area, reduces time spent finding appropriate reviewers, and distributes review load based on actual code ownership. Combine with rotation for shared code to prevent bottlenecks.

- **Establish review SLAs and measure compliance**: Set explicit expectations for review turnaround (e.g., first review within 4 hours during business hours) and track compliance. Teams that measure review latency consistently achieve faster cycle times. Use Slack/Teams notifications for pending reviews and escalation paths for reviews that exceed SLA.

## Related Topics

- [Refactoring Patterns](./refactoring-patterns.md) — Code reviews are where refactoring opportunities are identified and refactoring quality is validated
- [Technical Debt](./technical-debt.md) — Reviews are the first line of defense against accumulating technical debt through conscious decision-making
- [SOLID Principles](./solid-principles.md) — SOLID violations are common review findings that indicate design issues requiring attention
