# CI/CD Fundamentals

Continuous Integration and Continuous Delivery (CI/CD) is the practice of automating the building, testing, and deployment of software to deliver changes to production reliably and frequently. CI ensures that every code change is automatically built and tested against the full test suite, catching integration issues within minutes rather than days. CD extends this by automating the release process so that validated changes can be deployed to production at any time with confidence. Together, they form the backbone of modern software delivery, enabling teams to ship hundreds of changes per day while maintaining stability.

---

## Quick Reference

- **Continuous Integration (CI)** — Automatically build and test every commit pushed to the repository; catch failures fast before they compound
- **Continuous Delivery (CD)** — Every commit that passes CI is deployable to production; deployment is a business decision, not a technical hurdle
- **Continuous Deployment** — Every commit that passes CI is automatically deployed to production without manual approval
- **Pipeline** — A sequence of stages (build → test → deploy) that code changes flow through; each stage gates the next
- **Artifact** — A versioned, immutable build output (Docker image, JAR, binary) produced by CI and consumed by CD
- **Blue-Green Deployment** — Two identical environments; traffic switches from blue (current) to green (new) atomically
- **Canary Deployment** — Route a small percentage of traffic to the new version; monitor for errors before full rollout
- **Rolling Deployment** — Gradually replace instances of the old version with the new version, maintaining availability throughout
- **Feature Flags** — Decouple deployment from release; deploy code to production but control visibility via configuration
- **Pipeline as Code** — Define CI/CD pipelines in version-controlled configuration files (YAML) rather than UI-configured jobs

---

## When to Use

CI/CD practices apply to virtually every software project, but the depth of implementation should match the team's maturity and the application's requirements.

**Implement CI immediately when:**

- More than one developer contributes to the same codebase, where integration conflicts compound without automated detection
- The test suite takes more than a few seconds to run locally, making it impractical for developers to run the full suite before every commit
- Build failures are discovered late (during manual QA or after deployment), indicating that the feedback loop is too slow
- Code review processes need automated quality gates (linting, type checking, test coverage) to maintain consistency

**Implement CD when:**

- Deployments are manual, error-prone processes that require runbooks and specialized knowledge
- The time between merging code and it reaching production exceeds one business day
- Rollbacks require manual intervention or are not well-practiced, making production incidents more stressful
- The team wants to ship smaller, more frequent changes rather than large, risky batch releases
- Multiple environments (staging, production, regional) need consistent deployment procedures

**Choose your deployment strategy based on:**

- Blue-green when you need instant rollback capability and can afford running two full environments
- Canary when you want to validate changes with real traffic before full rollout and have observability infrastructure to detect issues
- Rolling when you need zero-downtime deployments but cannot afford duplicate infrastructure
- Feature flags when business stakeholders need to control feature visibility independently of deployment timing

---

## Code Examples

### Example 1: GitHub Actions CI Pipeline

```yaml
# .github/workflows/ci.yml
name: CI Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: '20'
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - run: npm ci

      - name: TypeScript type check
        run: npx tsc --noEmit

      - name: ESLint
        run: npx eslint . --max-warnings 0

  test:
    runs-on: ubuntu-latest
    needs: lint-and-typecheck
    strategy:
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - run: npm ci

      - name: Run tests (shard ${{ matrix.shard }}/4)
        run: npx vitest run --shard=${{ matrix.shard }}/4 --coverage

      - name: Upload coverage
        uses: actions/upload-artifact@v4
        with:
          name: coverage-${{ matrix.shard }}
          path: coverage/

  build:
    runs-on: ubuntu-latest
    needs: test
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Build Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: ${{ github.event_name == 'push' && github.ref == 'refs/heads/main' }}
          tags: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

This pipeline demonstrates several production patterns: concurrency groups prevent redundant runs on rapid pushes, test sharding parallelizes the test suite across 4 runners for faster feedback, and Docker layer caching via GitHub Actions cache reduces build times. The build job only pushes images on main branch merges, not on pull requests.

### Example 2: Multi-Stage Deployment Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy Pipeline

on:
  workflow_run:
    workflows: ["CI Pipeline"]
    types: [completed]
    branches: [main]

jobs:
  deploy-staging:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to staging
        uses: aws-actions/amazon-ecs-deploy-task-definition@v1
        with:
          task-definition: task-definition-staging.json
          service: app-staging
          cluster: staging-cluster
          wait-for-service-stability: true

      - name: Run smoke tests against staging
        run: |
          npm run test:smoke -- --base-url=${{ vars.STAGING_URL }}

      - name: Notify on failure
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {"text": "Staging deployment failed for ${{ github.sha }}"}

  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://app.example.com
    steps:
      - uses: actions/checkout@v4

      - name: Deploy canary (10% traffic)
        uses: aws-actions/amazon-ecs-deploy-task-definition@v1
        with:
          task-definition: task-definition-prod.json
          service: app-production-canary
          cluster: production-cluster
          wait-for-service-stability: true

      - name: Monitor canary (5 minutes)
        run: |
          sleep 300
          ERROR_RATE=$(aws cloudwatch get-metric-statistics \
            --namespace "App/Production" \
            --metric-name "5xxErrorRate" \
            --start-time $(date -u -d '5 minutes ago' +%Y-%m-%dT%H:%M:%S) \
            --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
            --period 300 \
            --statistics Average \
            --query 'Datapoints[0].Average')
          if (( $(echo "$ERROR_RATE > 1.0" | bc -l) )); then
            echo "Error rate too high: $ERROR_RATE%"
            exit 1
          fi

      - name: Promote to full traffic
        if: success()
        run: |
          aws ecs update-service \
            --cluster production-cluster \
            --service app-production \
            --task-definition app-production:latest \
            --desired-count 4

      - name: Rollback canary on failure
        if: failure()
        run: |
          aws ecs update-service \
            --cluster production-cluster \
            --service app-production-canary \
            --desired-count 0
```

This deployment pipeline implements a canary strategy: after staging validation, 10% of production traffic routes to the new version. If the error rate stays below 1% for 5 minutes, the deployment promotes to full traffic. If errors spike, the canary automatically rolls back. GitHub Environments provide manual approval gates and environment-specific secrets.

### Example 3: Reusable Workflow Components

```yaml
# .github/workflows/reusable-test.yml
name: Reusable Test Workflow

on:
  workflow_call:
    inputs:
      node-version:
        required: false
        type: string
        default: '20'
      coverage-threshold:
        required: false
        type: number
        default: 80
    secrets:
      SONAR_TOKEN:
        required: false

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: testdb
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node-version }}
          cache: 'npm'

      - run: npm ci

      - name: Run migrations
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/testdb
        run: npx prisma migrate deploy

      - name: Run tests with coverage
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/testdb
        run: npx vitest run --coverage

      - name: Check coverage threshold
        run: |
          COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
          if (( $(echo "$COVERAGE < ${{ inputs.coverage-threshold }}" | bc -l) )); then
            echo "Coverage $COVERAGE% is below threshold ${{ inputs.coverage-threshold }}%"
            exit 1
          fi
```

Reusable workflows extract common pipeline logic into shared definitions that multiple repositories can call. This prevents drift between team pipelines and ensures consistent quality gates. The service container pattern spins up a real PostgreSQL instance for integration tests, avoiding mocks that can hide real database interaction bugs.

---

## Common Pitfalls

**1. Running the entire test suite sequentially.** A 30-minute test suite destroys developer productivity by making the feedback loop too slow. Parallelize tests across multiple runners using sharding, run independent stages concurrently, and separate fast unit tests (run first, fail fast) from slow integration tests (run after units pass).

**2. Not caching dependencies between pipeline runs.** Downloading and installing dependencies from scratch on every run wastes minutes per build. Cache `node_modules`, Maven's `.m2` repository, Docker layers, and compiled artifacts. Most CI platforms provide native caching mechanisms that hash lockfiles to invalidate caches only when dependencies actually change.

**3. Deploying without automated rollback capability.** If you cannot roll back a bad deployment within minutes, you will eventually have an extended outage. Every deployment strategy must have a tested rollback path: blue-green switches traffic back to the previous environment, canary scales down the new version, and rolling deployments redeploy the previous artifact. Practice rollbacks regularly.

**4. Storing secrets in pipeline configuration files.** Hardcoded API keys, database passwords, or tokens in YAML files are visible to anyone with repository access and persist in git history forever. Use your CI platform's secret management (GitHub Secrets, GitLab CI Variables) and inject them as environment variables at runtime. Rotate secrets regularly and audit access.

**5. Not implementing pipeline-as-code.** Pipelines configured through a web UI cannot be version-controlled, reviewed, or rolled back. When someone accidentally deletes a stage or changes a configuration, there is no audit trail. Define all pipeline logic in YAML files committed to the repository, subject to the same code review process as application code.

**6. Ignoring flaky tests instead of fixing them.** Flaky tests (tests that pass and fail non-deterministically) erode trust in the pipeline. Teams start ignoring failures, assuming they are flaky, and real bugs slip through. Quarantine flaky tests immediately, track them as tech debt, and fix the root cause (usually race conditions, time dependencies, or shared state between tests).

---

## Real-World Use Cases

**Monorepo with affected-project detection:** Large organizations with monorepos containing dozens of services use tools like Nx, Turborepo, or Bazel to determine which projects are affected by a change. The CI pipeline only builds and tests affected projects, reducing pipeline time from 45 minutes to 5 minutes for typical changes. Dependency graphs ensure that changes to shared libraries trigger tests in all consuming services.

**Multi-region deployment with traffic shifting:** Global applications deploy to multiple AWS regions sequentially. The pipeline deploys to a single region first, runs region-specific health checks, monitors error rates for 10 minutes, then proceeds to the next region. If any region shows degradation, the pipeline halts and rolls back the affected region while leaving healthy regions on the new version.

**Database migration safety:** Pipelines that include database schema changes implement a two-phase approach: first deploy the migration (additive only — new columns, new tables), then deploy the application code that uses the new schema, then deploy a cleanup migration that removes deprecated columns. This ensures zero-downtime deployments even with schema changes, because the old application code remains compatible with the intermediate schema.

**Compliance-gated deployments:** Regulated industries (finance, healthcare) require audit trails and approval gates. The pipeline automatically generates a change manifest (files modified, tests run, coverage report, dependency diff), submits it for compliance review, and blocks deployment until approved. All pipeline executions are logged immutably for regulatory audits.

---

## Interview Questions

**Q: Explain the difference between Continuous Delivery and Continuous Deployment. When would you choose one over the other?**

A: Continuous Delivery means every commit that passes the pipeline is deployable to production, but deployment requires a manual trigger (human decision). Continuous Deployment removes the manual gate — every passing commit automatically deploys to production. Choose Continuous Delivery when regulatory requirements mandate human approval before production changes, when the team is building confidence in their test suite and wants a safety net, or when business stakeholders need to coordinate release timing with marketing or customer communication. Choose Continuous Deployment when the team has high confidence in automated testing, when fast iteration speed is critical (consumer web products), and when feature flags decouple deployment from release. Most teams start with Continuous Delivery and graduate to Continuous Deployment as their testing and monitoring mature.

**Q: How would you design a CI/CD pipeline for a microservices architecture with 20+ services in a monorepo?**

A: The key challenge is avoiding full rebuilds on every change. Use a build tool with dependency graph awareness (Nx, Bazel, Turborepo) to determine affected services. The pipeline structure would be: (1) detect affected services based on changed files and dependency graph, (2) run lint and type-check only on affected services in parallel, (3) run unit tests for affected services in parallel, (4) run integration tests that involve affected services (including downstream dependents), (5) build Docker images only for services with code changes, (6) deploy affected services in dependency order (if service B depends on service A, deploy A first). Shared libraries trigger tests in all consuming services. Cache aggressively at every layer: npm packages, compiled output, Docker layers, and test results for unchanged code.

**Q: What is a canary deployment and how would you implement automated canary analysis?**

A: A canary deployment routes a small percentage of production traffic (typically 1-10%) to the new version while the majority continues hitting the current version. Automated canary analysis compares metrics between the canary and the baseline over a defined window (5-30 minutes). Key metrics include error rate (5xx responses), latency percentiles (p50, p95, p99), and business metrics (conversion rate, checkout completion). Tools like Kayenta (Netflix) or Flagger (Kubernetes) automate this comparison using statistical methods. If the canary's metrics are statistically worse than the baseline beyond a configured threshold, the system automatically rolls back. If metrics are equivalent or better, traffic gradually shifts to the new version (10% → 25% → 50% → 100%). The critical implementation detail is ensuring canary and baseline handle equivalent traffic patterns — route by consistent hashing on user ID rather than random selection to avoid skew from power users.

**Q: How do you handle database migrations in a CI/CD pipeline without downtime?**

A: Zero-downtime migrations require the expand-contract pattern. Phase 1 (expand): add new columns/tables without removing old ones, deploy the migration, verify the schema is compatible with both old and new application code. Phase 2 (migrate): deploy new application code that writes to both old and new schema locations (dual-write), backfill existing data to the new schema. Phase 3 (contract): once all data is migrated and the old code is no longer running, deploy a cleanup migration removing deprecated columns. Each phase is a separate deployment with its own validation. The pipeline enforces that migrations are backward-compatible by running the test suite against the new schema with the old application code. Tools like `gh-ost` (GitHub) or `pt-online-schema-change` (Percona) handle large table migrations without locking.

---

## Production Tips

**Implement pipeline observability.** Track pipeline metrics: build duration (p50, p95), failure rate by stage, flaky test frequency, time-to-recovery after failures, and deployment frequency. Set alerts for pipeline duration regression (a 20% increase often indicates a missing cache or new bottleneck). Dashboard these metrics alongside application metrics to correlate deployment frequency with system stability.

**Design pipelines for fast failure.** Order pipeline stages so that the fastest checks run first: linting (seconds) before type checking (tens of seconds) before unit tests (minutes) before integration tests (many minutes) before deployment. If linting fails, there is no point running the full test suite. Use `fail-fast` strategies in matrix builds to cancel remaining shards when one fails. The goal is to give developers feedback within 5 minutes for the common case (lint or type error) and within 15 minutes for the full pipeline.

**Implement deployment freezes and circuit breakers.** Production pipelines should respect deployment freezes (holidays, major events, Friday afternoons) configured as pipeline conditions. Additionally, implement circuit breakers that halt deployments when production error rates exceed thresholds — deploying new code during an active incident compounds the problem. The pipeline should check production health before initiating any deployment.

---

## Related Topics

- [Docker Fundamentals](../infrastructure/docker/index.md) — Container-based build artifacts and deployment targets that CI/CD pipelines produce and deploy
- [Kubernetes](../infrastructure/kubernetes/index.md) — Container orchestration platform where CD pipelines deploy services using rolling updates, canary deployments, and blue-green strategies
