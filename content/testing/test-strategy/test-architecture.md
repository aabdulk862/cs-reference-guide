# Test Architecture

## Quick Reference

- **Test pyramid**: Many fast unit tests at the base, fewer integration tests in the middle, minimal end-to-end tests at the top
- **Test diamond**: Alternative shape where integration tests dominate for microservices with thin logic layers
- **Flaky test**: A test that passes and fails non-deterministically without code changes — the #1 trust killer
- **Test isolation**: Each test must be independent; parallel execution should not cause failures
- **CI integration**: Tests gate deployments; fast tests run first, slow tests run in parallel stages
- **Test organization**: Group by feature (vertical) or by type (horizontal); feature-based scales better
- **Test tagging**: Label tests (`@unit`, `@integration`, `@slow`, `@critical`) for selective execution
- **Test ownership**: Every test has an owning team; orphaned tests become unmaintained liabilities
- **Feedback time**: Unit tests < 10s, integration tests < 2min, E2E tests < 10min for effective CI gates

## When to Use

Test architecture decisions matter when your test suite grows beyond a few hundred tests. At that scale, unstructured test suites become slow, flaky, and expensive to maintain. Invest in test architecture when your CI pipeline takes more than 10 minutes and developers stop waiting for results, when flaky tests cause more than 5% of builds to fail without real code issues, when adding a new feature requires modifying dozens of existing tests, when developers can't determine which tests to run for their change, when test maintenance consumes more than 20% of development time, and when test failures don't clearly indicate what broke or who should fix it.

Test architecture is not a one-time decision — it evolves with your system. A monolith with 50 tests needs minimal architecture. A microservices platform with 50,000 tests across 200 repositories needs sophisticated orchestration, selective execution, and distributed ownership models.

The goal of test architecture is to maximize confidence per unit of time. Every architectural decision should be evaluated against this metric: does this change help us ship faster with fewer production incidents?

## Code Examples

### Test Pyramid Implementation with Layered Execution

A well-structured test suite separates tests by speed and scope, enabling fast feedback for common changes and thorough validation before deployment.

```yaml
# .github/workflows/test-pipeline.yml
name: Test Pipeline

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  # Layer 1: Fast gate (< 30 seconds)
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run test:unit -- --reporter=junit --outputFile=results/unit.xml
      - uses: dorny/test-reporter@v1
        if: always()
        with:
          name: Unit Tests
          path: results/unit.xml
          reporter: jest-junit

  # Layer 2: Integration gate (< 3 minutes)
  integration-tests:
    needs: unit-tests
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_DB: testdb
          POSTGRES_PASSWORD: test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run test:integration
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/testdb
          REDIS_URL: redis://localhost:6379

  # Layer 3: E2E gate (< 10 minutes, parallel shards)
  e2e-tests:
    needs: integration-tests
    runs-on: ubuntu-latest
    strategy:
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e -- --shard=${{ matrix.shard }}/4

  # Layer 4: Performance gate (nightly, not blocking)
  performance-tests:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs: e2e-tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:performance
      - uses: benchmark-action/github-action-benchmark@v1
        with:
          tool: 'customSmallerIsBetter'
          output-file-path: results/benchmark.json
          alert-threshold: '120%'
          fail-on-alert: true
```

### Flaky Test Detection and Quarantine System

Flaky tests erode trust in the test suite. A quarantine system automatically detects, isolates, and tracks flaky tests without blocking deployments.

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { FlakyTestTracker } from './flaky-test-tracker';

// Flaky test detection middleware
class TestStabilityMonitor {
  private results: Map<string, { passes: number; failures: number; lastFailure?: string }> = new Map();
  private readonly flakyThreshold = 0.05; // 5% failure rate = flaky
  private readonly windowSize = 100; // Last 100 runs

  recordResult(testId: string, passed: boolean, errorMessage?: string): void {
    const existing = this.results.get(testId) || { passes: 0, failures: 0 };
    if (passed) {
      existing.passes++;
    } else {
      existing.failures++;
      existing.lastFailure = errorMessage;
    }
    this.results.set(testId, existing);
  }

  isFlaky(testId: string): boolean {
    const result = this.results.get(testId);
    if (!result) return false;
    const total = result.passes + result.failures;
    if (total < 10) return false; // Not enough data
    const failureRate = result.failures / total;
    return failureRate > 0 && failureRate < this.flakyThreshold;
  }

  getQuarantinedTests(): string[] {
    return Array.from(this.results.entries())
      .filter(([id]) => this.isFlaky(id))
      .map(([id]) => id);
  }

  getFlakyReport(): FlakyReport {
    const flaky = this.getQuarantinedTests();
    return {
      totalTracked: this.results.size,
      flakyCount: flaky.length,
      flakyTests: flaky.map((id) => ({
        id,
        ...this.results.get(id)!,
        failureRate: this.results.get(id)!.failures /
          (this.results.get(id)!.passes + this.results.get(id)!.failures),
      })),
    };
  }
}

interface FlakyReport {
  totalTracked: number;
  flakyCount: number;
  flakyTests: Array<{
    id: string;
    passes: number;
    failures: number;
    failureRate: number;
    lastFailure?: string;
  }>;
}

// Vitest custom reporter for flaky detection
// In vitest.config.ts:
// reporters: ['default', './src/test-utils/flaky-reporter.ts']
export class FlakyReporter {
  private tracker = new TestStabilityMonitor();

  onTestResult(testPath: string, result: { passed: boolean; name: string; error?: string }): void {
    const testId = `${testPath}::${result.name}`;
    this.tracker.recordResult(testId, result.passed, result.error);
  }

  onRunComplete(): void {
    const report = this.tracker.getFlakyReport();
    if (report.flakyCount > 0) {
      console.warn(`\n⚠️  ${report.flakyCount} flaky tests detected:`);
      for (const test of report.flakyTests) {
        console.warn(`  - ${test.id} (${(test.failureRate * 100).toFixed(1)}% failure rate)`);
      }
    }
  }
}
```

### Test Organization by Feature

Feature-based test organization keeps related tests together, making it easy to find tests for a given feature and understand test coverage at a glance.

```
src/
├── features/
│   ├── orders/
│   │   ├── __tests__/
│   │   │   ├── order-service.unit.test.ts      # Unit tests
│   │   │   ├── order-repository.int.test.ts    # Integration tests
│   │   │   ├── order-api.e2e.test.ts           # E2E tests
│   │   │   ├── order-pricing.property.test.ts  # Property tests
│   │   │   └── fixtures/
│   │   │       ├── order-builder.ts            # Test data factory
│   │   │       └── sample-orders.json          # Fixture data
│   │   ├── order-service.ts
│   │   ├── order-repository.ts
│   │   └── order-controller.ts
│   ├── payments/
│   │   ├── __tests__/
│   │   │   ├── payment-processor.unit.test.ts
│   │   │   ├── stripe-integration.int.test.ts
│   │   │   └── fixtures/
│   │   │       └── payment-builder.ts
│   │   ├── payment-processor.ts
│   │   └── stripe-client.ts
```

```typescript
// vitest.config.ts — Selective test execution by type
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Default: run all tests
    include: ['src/**/*.test.ts'],

    // Named configurations for selective execution
    typecheck: {
      enabled: true,
    },
  },
});

// package.json scripts for layered execution
// "test:unit": "vitest run --include='**/*.unit.test.ts'",
// "test:integration": "vitest run --include='**/*.int.test.ts'",
// "test:e2e": "vitest run --include='**/*.e2e.test.ts'",
// "test:property": "vitest run --include='**/*.property.test.ts'",
// "test:all": "vitest run",
// "test:affected": "vitest run --changed HEAD~1",
```

### Test Impact Analysis for Selective Execution

In large codebases, running all tests on every change is wasteful. Test impact analysis determines which tests are affected by a code change and runs only those.

```typescript
import { execSync } from 'child_process';
import * as path from 'path';

interface TestImpactMap {
  [sourceFile: string]: string[]; // source file -> test files that cover it
}

class TestImpactAnalyzer {
  private impactMap: TestImpactMap;

  constructor(coverageDataPath: string) {
    // Load coverage data from previous full run
    this.impactMap = this.buildImpactMap(coverageDataPath);
  }

  /**
   * Given a list of changed files, returns the minimal set of tests to run.
   */
  getAffectedTests(changedFiles: string[]): string[] {
    const affectedTests = new Set<string>();

    for (const file of changedFiles) {
      const normalized = path.resolve(file);
      const tests = this.impactMap[normalized] || [];
      for (const test of tests) {
        affectedTests.add(test);
      }

      // If the changed file IS a test, include it directly
      if (file.includes('.test.') || file.includes('.spec.')) {
        affectedTests.add(normalized);
      }
    }

    return Array.from(affectedTests);
  }

  /**
   * Gets changed files from git diff against the base branch.
   */
  getChangedFiles(baseBranch: string = 'main'): string[] {
    const output = execSync(`git diff --name-only ${baseBranch}...HEAD`, {
      encoding: 'utf-8',
    });
    return output.trim().split('\n').filter(Boolean);
  }

  private buildImpactMap(coverageDataPath: string): TestImpactMap {
    // Parse Istanbul/V8 coverage data to build source -> test mapping
    // Each test file's coverage report tells us which source files it touched
    const map: TestImpactMap = {};
    // Implementation reads coverage JSON and inverts the mapping
    return map;
  }
}

// Usage in CI:
// const analyzer = new TestImpactAnalyzer('./coverage/coverage-final.json');
// const changed = analyzer.getChangedFiles('main');
// const testsToRun = analyzer.getAffectedTests(changed);
// execSync(`vitest run ${testsToRun.join(' ')}`);
```

## Common Pitfalls

### 1. Inverted Test Pyramid (Ice Cream Cone)

Many teams end up with few unit tests, few integration tests, and many slow E2E tests — the "ice cream cone" anti-pattern. This happens when testing is an afterthought added at the UI level. The result is a slow, flaky, expensive test suite that provides poor failure localization. Fix by pushing test coverage down: for every E2E test, ask "could this be caught by a unit or integration test instead?"

### 2. Treating All Tests as Equal Priority

Not all tests provide equal value. A test for a payment calculation is more critical than a test for a tooltip position. Without prioritization, teams spend equal effort maintaining low-value tests while critical paths remain under-tested. Tag tests by criticality (`@critical`, `@standard`, `@nice-to-have`) and allocate maintenance effort accordingly.

### 3. No Ownership Model for Tests

When nobody owns a test, nobody fixes it when it breaks. Orphaned tests accumulate, get disabled, and eventually the suite provides false confidence. Assign test ownership to feature teams using CODEOWNERS files or test metadata. When a team is dissolved, explicitly reassign their tests.

### 4. Coupling Tests to Implementation Details

Tests that verify internal method calls, private state, or execution order break on every refactor without catching real bugs. This creates a "test tax" where refactoring costs double — once for the code, once for the tests. Test through public interfaces and verify observable behavior, not implementation mechanics.

### 5. Ignoring Test Maintenance Cost

Every test has an ongoing maintenance cost: updating when requirements change, debugging when it fails, and understanding when onboarding new developers. Tests that are hard to understand, have complex setup, or test trivial behavior have negative ROI. Regularly prune tests that cost more to maintain than the confidence they provide.

### 6. Flaky Tests Left Unfixed

A single flaky test that fails 5% of the time will fail in 40% of CI runs with 10 test files. Teams that tolerate flaky tests train developers to ignore failures, which means real failures also get ignored. Establish a zero-tolerance policy: flaky tests are either fixed within 48 hours or quarantined (moved to a non-blocking suite) until fixed.

## Real-World Use Cases

### Monorepo Test Orchestration at Scale

A fintech company with 15 services in a monorepo uses Nx-based test impact analysis to run only affected tests on each PR. The full suite takes 45 minutes; affected-only execution averages 4 minutes. They maintain a nightly full-suite run to catch transitive dependency issues. Test ownership is enforced through CODEOWNERS — each service team owns their tests and is paged when their tests fail on main.

### Microservices Contract Testing Pipeline

A platform with 80 microservices uses Pact broker as the central contract registry. Each service's CI pipeline publishes consumer contracts and verifies provider contracts independently. The "can-i-deploy" check prevents deployments that would break consumers. This replaced a fragile staging environment where all 80 services had to be deployed together for integration testing.

### Mobile App Test Architecture

A mobile banking app uses a three-tier architecture: unit tests run on every commit (2 seconds), integration tests run on PR creation (90 seconds with local mocks), and device farm tests run before release (20 minutes across 30 device configurations). Flaky device tests are automatically retried twice before failing. A weekly stability report identifies tests with >2% flake rate for investigation.

### Database Migration Testing Pipeline

A SaaS platform tests database migrations in a dedicated pipeline stage. Each migration runs against a production-schema snapshot, verifies forward migration, runs the application's integration tests against the new schema, then verifies rollback. This caught a migration that would have locked a 500M-row table for 3 hours in production — the test detected the lock duration exceeded the 30-second threshold.

## Interview Questions

**Q: Describe the test pyramid and when you might deviate from it.**

A: The test pyramid recommends many fast unit tests at the base, fewer integration tests in the middle, and minimal E2E tests at the top. The rationale is that lower-level tests are faster, more reliable, and provide better failure localization. You deviate from the pyramid when your system is primarily integration logic with thin business rules (microservices that mostly transform and route data) — here a "test diamond" with more integration tests makes sense. You also deviate for UI-heavy applications where component tests (between unit and E2E) provide the best confidence-to-cost ratio. The pyramid is a heuristic, not a rule — optimize for confidence per unit of time, not for shape.

**Q: How do you handle flaky tests in a large codebase?**

A: A systematic approach with four components. **Detection**: Track pass/fail history per test across CI runs; any test with >0% and <100% pass rate over 50 runs is flaky. **Quarantine**: Automatically move detected flaky tests to a non-blocking suite so they don't block deployments or train developers to ignore failures. **Root cause analysis**: Common causes are timing dependencies (use explicit waits, not sleeps), shared state (ensure test isolation), external service instability (use deterministic test doubles), and resource contention (avoid port/file conflicts). **Prevention**: Code review checklist items for test determinism, CI that runs new tests 10x before merging to detect flakiness early, and a team SLO on flaky test count (e.g., "fewer than 5 quarantined tests at any time").

**Q: How do you decide what level of testing to use for a given feature?**

A: Apply the "confidence per cost" heuristic. For each behavior you need to verify, ask: what's the cheapest test that gives me confidence this works? Pure calculation logic → unit test (fast, precise). Database query correctness → integration test (needs real DB). User workflow across pages → E2E test (needs full stack). API contract between services → contract test (no full deployment needed). The decision factors are: how fast is the feedback loop, how reliable is the test, how well does it localize failures, and how expensive is it to maintain. A common mistake is testing everything at the E2E level "because it's most realistic" — this gives slow feedback, poor localization, and high flake rates.

**Q: How do you structure tests in a monorepo with multiple services?**

A: Three key principles. **Locality**: tests live next to the code they test, not in a separate `tests/` tree. Each service has its own test suite that can run independently. **Selective execution**: use dependency graph analysis (Nx, Turborepo, Bazel) to run only tests affected by changed code. A change to Service A's internal logic shouldn't trigger Service B's tests. **Shared infrastructure**: common test utilities (builders, fixtures, custom matchers) live in a shared package that all services depend on. Contract tests between services live in a dedicated package that both producer and consumer CI pipelines execute. The goal is that each team can run their tests in under 5 minutes locally while the full suite runs in CI with intelligent parallelization.

## Production Tips

### Implement Test Quality Metrics Dashboard

Track metrics beyond pass/fail: test execution time trends (catch tests getting slower), flaky test count over time, coverage by feature area, time-to-feedback for each pipeline stage, and test-to-code ratio by team. Surface these in a dashboard that teams review weekly. When test execution time increases 20% month-over-month, investigate before it becomes a crisis.

### Use Test Sharding for Parallel CI Execution

Split your test suite across multiple CI runners using deterministic sharding. Each shard runs a subset of tests in parallel, reducing wall-clock time proportionally. Vitest supports `--shard=1/4` natively. For custom sharding, hash test file paths and assign to shards deterministically so the same test always runs on the same shard (enabling per-shard caching).

```typescript
// Deterministic test sharding
function getShardForTest(testPath: string, totalShards: number): number {
  let hash = 0;
  for (let i = 0; i < testPath.length; i++) {
    const char = testPath.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash) % totalShards;
}

// Balance shards by execution time, not just count
function balanceShards(
  tests: Array<{ path: string; avgDuration: number }>,
  shardCount: number
): string[][] {
  // Sort by duration descending (longest first)
  const sorted = [...tests].sort((a, b) => b.avgDuration - a.avgDuration);
  const shards: Array<{ tests: string[]; totalDuration: number }> = Array.from(
    { length: shardCount },
    () => ({ tests: [], totalDuration: 0 })
  );

  // Greedy assignment: add each test to the lightest shard
  for (const test of sorted) {
    const lightest = shards.reduce((min, shard) =>
      shard.totalDuration < min.totalDuration ? shard : min
    );
    lightest.tests.push(test.path);
    lightest.totalDuration += test.avgDuration;
  }

  return shards.map((s) => s.tests);
}
```

### Establish Test SLOs

Define Service Level Objectives for your test suite: "Unit tests complete in under 30 seconds", "Integration tests complete in under 3 minutes", "Flaky test count stays below 5", "Test coverage on critical paths stays above 90%". Alert when SLOs are breached. This prevents gradual degradation where the suite gets 10% slower each quarter until it's unusable.

## Related Topics

- [Unit Testing](../unit-testing/unit-testing.md) — The foundation layer of the test pyramid
- [Integration Testing](../integration-testing/integration-testing.md) — The middle layer that verifies component interactions
- [Property-Based Testing](./property-based-testing.md) — Advanced technique for exploring edge cases within any test layer
- [Mocking Strategies](../unit-testing/mocking-strategies.md) — How test doubles enable isolation at each pyramid level
