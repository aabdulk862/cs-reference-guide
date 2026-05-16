# Technical Debt

## Quick Reference

- **Technical debt** is the implied cost of future rework caused by choosing an expedient solution now instead of a better approach that would take longer
- **Deliberate debt**: Conscious decision to ship faster with known shortcuts — acceptable when tracked and planned for repayment
- **Inadvertent debt**: Accumulated unknowingly through lack of knowledge, changing requirements, or organic growth — discovered retroactively
- **Four quadrants (Martin Fowler)**: Deliberate/Reckless, Deliberate/Prudent, Inadvertent/Reckless, Inadvertent/Prudent
- **Interest payments**: The ongoing cost of working around debt — slower feature delivery, more bugs, harder onboarding
- **Principal**: The one-time cost to fix the debt — refactoring effort, migration work, test writing
- **Debt is not inherently bad**: Strategic debt taken consciously with a repayment plan is a valid engineering tool
- **Measurement proxies**: Cyclomatic complexity, code churn, coupling metrics, test coverage gaps, deployment frequency

## When to Use

Technical debt management is relevant whenever you are making decisions about code quality, architecture, and delivery timelines. It provides a framework for communicating engineering trade-offs to non-technical stakeholders using financial metaphors they understand.

Apply technical debt thinking when deciding whether to take a shortcut to meet a deadline (deliberate debt decision), when planning sprint capacity and allocating time for maintenance work, when prioritizing which areas of the codebase to improve first, when justifying engineering investment to product managers and executives, when evaluating the true cost of "just ship it" decisions, and when onboarding new team members who struggle with specific areas of the codebase.

Technical debt frameworks are most valuable in organizations where engineering teams must justify maintenance work to non-technical decision-makers. The financial metaphor translates engineering concerns into business language: "We can ship this feature in 2 weeks with debt, or 4 weeks without. The debt will cost us 1 extra week per feature in this area going forward until we pay it down."

Avoid over-applying the debt metaphor to every imperfect piece of code. Not all suboptimal code is "debt" — some is simply code that works and does not need improvement. Reserve the debt framing for issues that actively impede future work or create ongoing costs.

## Code Examples

### Measuring Technical Debt with Static Analysis

Automated measurement provides objective data for prioritization decisions. These metrics serve as proxies for debt that can be tracked over time.

```typescript
// technical-debt-analyzer.ts — Automated debt measurement
interface DebtMetric {
  file: string;
  metric: string;
  value: number;
  threshold: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  estimatedHoursToFix: number;
}

interface DebtReport {
  totalDebtHours: number;
  criticalItems: DebtMetric[];
  trendDirection: 'increasing' | 'stable' | 'decreasing';
  hotspots: FileHotspot[];
  recommendations: string[];
}

interface FileHotspot {
  file: string;
  churnRate: number;       // How often this file changes
  complexity: number;      // Cyclomatic complexity
  couplingScore: number;   // Afferent + efferent coupling
  testCoverage: number;    // Percentage of lines covered
  debtScore: number;       // Composite score
}

class TechnicalDebtAnalyzer {
  private readonly complexityThreshold = 15;
  private readonly coverageThreshold = 80;
  private readonly fileLengthThreshold = 300;
  private readonly couplingThreshold = 10;

  async analyzeRepository(repoPath: string): Promise<DebtReport> {
    const files = await this.scanSourceFiles(repoPath);
    const metrics: DebtMetric[] = [];
    const hotspots: FileHotspot[] = [];

    for (const file of files) {
      const complexity = await this.measureComplexity(file);
      const coverage = await this.measureCoverage(file);
      const churn = await this.measureChurn(file);
      const coupling = await this.measureCoupling(file);
      const length = await this.measureLength(file);

      if (complexity > this.complexityThreshold) {
        metrics.push({
          file,
          metric: 'cyclomatic_complexity',
          value: complexity,
          threshold: this.complexityThreshold,
          severity: complexity > 30 ? 'critical' : 'high',
          estimatedHoursToFix: Math.ceil((complexity - this.complexityThreshold) * 0.5),
        });
      }

      if (coverage < this.coverageThreshold) {
        metrics.push({
          file,
          metric: 'test_coverage',
          value: coverage,
          threshold: this.coverageThreshold,
          severity: coverage < 50 ? 'critical' : coverage < 70 ? 'high' : 'medium',
          estimatedHoursToFix: Math.ceil((this.coverageThreshold - coverage) * 0.1),
        });
      }

      // Hotspot = high churn + high complexity + low coverage
      const debtScore = (churn * complexity) / Math.max(coverage, 1);
      hotspots.push({ file, churnRate: churn, complexity, couplingScore: coupling, testCoverage: coverage, debtScore });
    }

    // Sort hotspots by debt score — highest priority first
    hotspots.sort((a, b) => b.debtScore - a.debtScore);

    const totalDebtHours = metrics.reduce((sum, m) => sum + m.estimatedHoursToFix, 0);
    const criticalItems = metrics.filter(m => m.severity === 'critical');

    return {
      totalDebtHours,
      criticalItems,
      trendDirection: await this.calculateTrend(repoPath),
      hotspots: hotspots.slice(0, 20),  // Top 20 hotspots
      recommendations: this.generateRecommendations(hotspots, metrics),
    };
  }

  private generateRecommendations(hotspots: FileHotspot[], metrics: DebtMetric[]): string[] {
    const recommendations: string[] = [];

    // High-churn + high-complexity files are the highest ROI targets
    const highROI = hotspots.filter(h => h.churnRate > 10 && h.complexity > 20);
    if (highROI.length > 0) {
      recommendations.push(
        `Priority refactoring: ${highROI.length} files have high churn AND high complexity. ` +
        `These are your highest-ROI debt reduction targets.`
      );
    }

    // Low coverage in critical paths
    const uncoveredCritical = hotspots.filter(h => h.testCoverage < 50 && h.churnRate > 5);
    if (uncoveredCritical.length > 0) {
      recommendations.push(
        `Test coverage gap: ${uncoveredCritical.length} frequently-changed files have <50% coverage. ` +
        `Add characterization tests before these files cause production incidents.`
      );
    }

    return recommendations;
  }
}
```

### Technical Debt Tracking System

A structured approach to tracking debt items with business impact estimation enables data-driven prioritization.

```java
// Domain model for tracking technical debt items
public class TechnicalDebtItem {
    private final String id;
    private final String title;
    private final String description;
    private final DebtType type;
    private final DebtQuadrant quadrant;
    private final LocalDate discoveredDate;
    private final String discoveredBy;

    // Cost estimation
    private final Duration estimatedFixTime;
    private final Duration weeklyInterestCost;  // Time lost per week due to this debt
    private final BigDecimal estimatedBugRisk;  // Probability of causing a production incident

    // Impact tracking
    private final List<String> affectedFeatures;
    private final List<String> affectedTeams;
    private final int blockedFeatureCount;

    // Prioritization
    private final DebtPriority priority;
    private final LocalDate targetResolutionDate;

    public BigDecimal calculateROI() {
        // ROI = (weekly interest saved * expected remaining lifetime) / fix cost
        long remainingWeeks = ChronoUnit.WEEKS.between(LocalDate.now(),
            targetResolutionDate != null ? targetResolutionDate : LocalDate.now().plusYears(2));
        BigDecimal totalInterestAvoided = BigDecimal.valueOf(
            weeklyInterestCost.toHours() * remainingWeeks);
        BigDecimal fixCost = BigDecimal.valueOf(estimatedFixTime.toHours());
        return totalInterestAvoided.divide(fixCost, 2, RoundingMode.HALF_UP);
    }

    public Duration calculateBreakEvenPoint() {
        // How long until the fix pays for itself
        if (weeklyInterestCost.isZero()) return Duration.ofDays(Long.MAX_VALUE);
        long weeksToBreakEven = estimatedFixTime.toHours() / weeklyInterestCost.toHours();
        return Duration.ofDays(weeksToBreakEven * 7);
    }
}

public enum DebtType {
    DESIGN_DEBT,        // Architectural shortcuts, missing abstractions
    CODE_DEBT,          // Duplicated code, complex methods, poor naming
    TEST_DEBT,          // Missing tests, flaky tests, slow test suites
    DOCUMENTATION_DEBT, // Missing or outdated documentation
    INFRASTRUCTURE_DEBT,// Outdated dependencies, manual processes, missing monitoring
    DEPENDENCY_DEBT     // Outdated libraries, security vulnerabilities
}

public enum DebtQuadrant {
    DELIBERATE_PRUDENT,   // "We know the trade-off, we'll fix it next sprint"
    DELIBERATE_RECKLESS,  // "We don't have time for design"
    INADVERTENT_PRUDENT,  // "Now we know how we should have done it"
    INADVERTENT_RECKLESS  // "What's layering?"
}
```

### Prioritization Framework — RICE Score for Technical Debt

```typescript
// Prioritization using adapted RICE framework for technical debt
interface DebtItem {
  id: string;
  title: string;
  reach: number;          // How many developers/features are affected (1-10)
  impact: number;         // How much time is wasted per encounter (1-5)
  confidence: number;     // How sure are we about the estimates (0.5-1.0)
  effort: number;         // Person-weeks to fix
  riskOfInaction: number; // Probability of causing incident if not fixed (0-1)
}

function calculateDebtPriority(item: DebtItem): number {
  // Modified RICE: (Reach × Impact × Confidence) / Effort + Risk Bonus
  const riceScore = (item.reach * item.impact * item.confidence) / item.effort;
  const riskBonus = item.riskOfInaction * 10;  // High-risk items get priority boost
  return riceScore + riskBonus;
}

function prioritizeDebtBacklog(items: DebtItem[]): DebtItem[] {
  return items
    .map(item => ({ ...item, score: calculateDebtPriority(item) }))
    .sort((a, b) => b.score - a.score);
}

// Example debt items with prioritization
const debtBacklog: DebtItem[] = [
  {
    id: 'DEBT-001',
    title: 'Monolithic order service needs decomposition',
    reach: 8,           // Affects 8 out of 10 developers
    impact: 4,          // Significant time waste per feature
    confidence: 0.8,    // Fairly confident in estimates
    effort: 6,          // 6 person-weeks
    riskOfInaction: 0.3 // Moderate risk of cascading failures
  },
  {
    id: 'DEBT-002',
    title: 'Missing integration tests for payment flow',
    reach: 3,           // Affects payment team primarily
    impact: 5,          // Critical when bugs slip through
    confidence: 0.9,    // Very confident — we know what tests are needed
    effort: 2,          // 2 person-weeks
    riskOfInaction: 0.7 // High risk — payment bugs are expensive
  },
  {
    id: 'DEBT-003',
    title: 'Outdated React class components in dashboard',
    reach: 4,           // Affects frontend team
    impact: 2,          // Minor friction, still works
    confidence: 0.9,    // Clear scope
    effort: 3,          // 3 person-weeks
    riskOfInaction: 0.1 // Low risk — just slower development
  },
];

// DEBT-002 scores highest: high confidence, low effort, high risk
const prioritized = prioritizeDebtBacklog(debtBacklog);
```

### Communicating Debt to Stakeholders

```typescript
// Generating stakeholder-friendly debt reports
interface StakeholderReport {
  executiveSummary: string;
  businessImpact: BusinessImpact;
  recommendations: Recommendation[];
  visualizations: ChartData[];
}

interface BusinessImpact {
  currentVelocityLoss: string;      // "Team delivers 30% fewer features than capacity"
  projectedDegradation: string;     // "Without action, velocity drops 10% per quarter"
  incidentRisk: string;             // "60% chance of major incident in next 6 months"
  onboardingImpact: string;         // "New engineers take 3 months to become productive vs 1 month"
}

function generateStakeholderReport(debtItems: DebtItem[], teamMetrics: TeamMetrics): StakeholderReport {
  const totalWeeklyInterest = debtItems.reduce((sum, item) =>
    sum + (item.reach * item.impact * 2), 0  // Hours lost per week
  );

  const velocityLoss = (totalWeeklyInterest / (teamMetrics.teamSize * 40)) * 100;

  return {
    executiveSummary: `The engineering team is currently operating at ${Math.round(100 - velocityLoss)}% ` +
      `capacity due to accumulated technical debt. ${debtItems.length} identified debt items ` +
      `cost approximately ${totalWeeklyInterest} engineering hours per week in workarounds, ` +
      `bug fixes, and slower development. Addressing the top 5 items (${topFiveEffort} person-weeks) ` +
      `would recover approximately ${topFiveRecovery} hours per week.`,

    businessImpact: {
      currentVelocityLoss: `${Math.round(velocityLoss)}% of engineering capacity lost to debt interest`,
      projectedDegradation: calculateProjectedDegradation(debtItems, teamMetrics),
      incidentRisk: calculateIncidentRisk(debtItems),
      onboardingImpact: calculateOnboardingImpact(debtItems, teamMetrics),
    },

    recommendations: [
      {
        action: 'Allocate 20% of sprint capacity to debt reduction',
        expectedOutcome: 'Recover 15% velocity within 2 quarters',
        investment: '2 engineers × 2 days per sprint',
      },
      {
        action: 'Address top 3 critical debt items immediately',
        expectedOutcome: 'Reduce incident risk from 60% to 20%',
        investment: '4 person-weeks focused effort',
      },
      {
        action: 'Implement automated debt tracking in CI pipeline',
        expectedOutcome: 'Prevent new debt from exceeding thresholds',
        investment: '1 person-week setup, ongoing maintenance minimal',
      },
    ],

    visualizations: [
      generateDebtTrendChart(debtItems),
      generateVelocityCorrelationChart(teamMetrics),
      generateHotspotHeatmap(debtItems),
    ],
  };
}
```

### Debt Reduction Strategy Implementation

```java
// Systematic debt reduction using the "boy scout rule" + dedicated allocation
public class DebtReductionStrategy {

    // Strategy 1: Continuous improvement (boy scout rule)
    // Every PR that touches a file with known debt must improve it slightly
    public class BoyScoutEnforcer {
        private final DebtRegistry debtRegistry;
        private final GitDiffAnalyzer diffAnalyzer;

        public ReviewResult enforceOnPR(PullRequest pr) {
            List<String> touchedFiles = diffAnalyzer.getModifiedFiles(pr);
            List<DebtItem> relevantDebt = debtRegistry.findByFiles(touchedFiles);

            if (relevantDebt.isEmpty()) {
                return ReviewResult.pass("No known debt in modified files");
            }

            // Check if PR includes at least one improvement
            boolean hasImprovement = diffAnalyzer.detectsImprovement(pr, relevantDebt);
            if (!hasImprovement) {
                return ReviewResult.warn(
                    "Files with known debt were modified without improvement. " +
                    "Consider addressing: " + relevantDebt.get(0).getTitle()
                );
            }
            return ReviewResult.pass("Boy scout rule satisfied");
        }
    }

    // Strategy 2: Dedicated debt sprints
    // Every 4th sprint is a "maintenance sprint" focused on debt reduction
    public class DebtSprintPlanner {
        private final DebtRegistry registry;
        private final TeamCapacity capacity;

        public SprintPlan planDebtSprint(int sprintNumber) {
            if (sprintNumber % 4 != 0) {
                // Regular sprint: allocate 20% to debt
                Duration debtBudget = capacity.getSprintCapacity().multipliedBy(20).dividedBy(100);
                List<DebtItem> items = registry.getTopPriority(debtBudget);
                return SprintPlan.mixed(items, debtBudget);
            }

            // Debt sprint: 80% debt, 20% critical features only
            Duration debtBudget = capacity.getSprintCapacity().multipliedBy(80).dividedBy(100);
            List<DebtItem> items = registry.getTopPriority(debtBudget);
            return SprintPlan.debtFocused(items, debtBudget);
        }
    }

    // Strategy 3: Strangler fig for architectural debt
    // Gradually replace legacy components behind feature flags
    public class ArchitecturalDebtMigration {
        private final FeatureFlagService flags;
        private final MetricsCollector metrics;

        public MigrationPlan createMigrationPlan(ArchitecturalDebtItem debt) {
            return MigrationPlan.builder()
                .phase(1, "Shadow mode", Duration.ofWeeks(2),
                    "Run new implementation alongside old, compare results")
                .phase(2, "Canary rollout", Duration.ofWeeks(2),
                    "Route 5% of traffic to new implementation")
                .phase(3, "Gradual rollout", Duration.ofWeeks(4),
                    "Increase to 25%, 50%, 75%, 100% with monitoring")
                .phase(4, "Legacy removal", Duration.ofWeeks(2),
                    "Remove old implementation and feature flags")
                .rollbackCriteria("Error rate > 0.1% OR p99 latency > 500ms")
                .successCriteria("Zero mismatches for 7 consecutive days")
                .build();
        }
    }
}
```

## Common Pitfalls

- **Treating all debt as equal priority**: Not all debt requires immediate attention. Debt in stable, rarely-changed code has low interest cost. Debt in high-churn, customer-facing code has high interest cost. Prioritize based on the product of frequency-of-encounter and cost-per-encounter, not just the severity of the debt itself.

- **Using "technical debt" as an excuse for poor engineering**: Some teams label every shortcut as "deliberate technical debt" without actually tracking it or planning repayment. True deliberate debt requires: documentation of what was deferred, estimation of the interest cost, a concrete plan for when and how to repay, and stakeholder agreement on the trade-off.

- **Attempting to eliminate all debt simultaneously**: Large-scale "stop the world" debt reduction efforts fail because they compete with feature delivery, create massive merge conflicts, and often introduce new bugs. Sustainable debt reduction happens continuously through dedicated allocation (20% of sprint capacity) and the boy scout rule (leave code better than you found it).

- **Failing to communicate debt in business terms**: Telling stakeholders "we have technical debt" is meaningless without quantifying the business impact. Translate debt into terms they understand: "This debt costs us 2 extra weeks per feature in the payments area" or "There is a 40% chance this causes a 4-hour outage in the next quarter."

- **Confusing debt with deliberate design decisions**: Not every trade-off is debt. Choosing a simpler architecture that handles current scale but not 100x growth is a valid design decision if growth is uncertain. It becomes debt only when growth materializes and the architecture becomes a constraint. Premature optimization to avoid hypothetical future debt is its own form of waste.

- **Ignoring dependency debt**: Outdated dependencies with known security vulnerabilities are among the highest-risk forms of technical debt. They compound silently — the longer you wait, the more breaking changes accumulate between your version and current. Automate dependency updates with tools like Dependabot or Renovate and treat security vulnerabilities as critical debt.

## Real-World Use Cases

**Spotify's "Golden Path" approach**: Spotify manages technical debt at scale by defining "golden paths" — recommended technology choices and patterns that are well-supported, well-documented, and actively maintained. Teams that deviate from golden paths accept responsibility for maintaining their choices. This creates natural pressure to converge on supported patterns while allowing innovation. Debt is measured as the distance between a team's stack and the golden path.

**Amazon's "two-pizza team" debt ownership**: Amazon assigns debt ownership to the team that owns the service. Each two-pizza team is responsible for their service's operational health, including debt management. This creates direct accountability — the team that takes shortcuts is the team that pays the interest through on-call pages and slower feature delivery. Debt that crosses team boundaries is escalated to leadership for prioritization.

**Google's "20% time" for debt reduction**: While Google's 20% time is often associated with innovation projects, many engineers use it for debt reduction in their primary codebase. Google also runs periodic "fixit" weeks where entire teams focus on specific categories of debt (test coverage, deprecated API migration, security vulnerability remediation). These focused efforts create momentum and visible progress.

**Financial services regulatory debt**: Banks and financial institutions face a unique form of technical debt — regulatory debt. When regulations change (GDPR, PSD2, Basel III), existing systems must be updated to comply. This debt has a hard deadline (compliance date) and severe penalties for non-payment (fines, license revocation). Financial institutions typically maintain a "regulatory debt register" separate from technical debt, with dedicated budget and staffing.

**Etsy's "make it better" culture**: Etsy institutionalized continuous debt reduction by making it part of their engineering culture. Every engineer is expected to improve code they touch, and "make it better" PRs (pure refactoring with no feature changes) are celebrated rather than questioned. They track "code health" metrics per team and include them in quarterly planning alongside feature delivery metrics.

## Interview Questions

**Q: How do you prioritize technical debt against feature development?**

A: I use a framework that considers both the cost of inaction and the opportunity cost of action. First, I categorize debt by its interest rate — how much ongoing cost it creates per unit of time. High-interest debt (causing daily developer friction, blocking features, or creating incident risk) gets priority over low-interest debt (minor inconveniences in stable code). Then I apply a modified RICE score: Reach (how many people are affected) × Impact (how much time is wasted per encounter) × Confidence (how sure are we about estimates) / Effort (person-weeks to fix). I recommend allocating 15-20% of sprint capacity to debt reduction as a baseline, with the specific items chosen based on RICE score. For critical debt (security vulnerabilities, data integrity risks), I treat it as a bug with appropriate urgency rather than competing with features. The key is making debt visible and quantified so product managers can make informed trade-offs rather than defaulting to "features first."

**Q: Describe a situation where you inherited significant technical debt and how you addressed it.**

A: In a previous role, I inherited a payment processing service with significant debt: no integration tests, a monolithic 5000-line service class, hardcoded configuration, and three different logging frameworks. The service processed $2M daily, so a big-bang rewrite was too risky. My approach: (1) Stabilize — I added monitoring and alerting first to understand failure modes and establish a baseline. (2) Characterize — I wrote integration tests capturing current behavior, giving us a safety net. (3) Prioritize — I identified that the monolithic service class caused 80% of the pain (every change risked breaking unrelated functionality), so I focused there. (4) Incremental extraction — Over 8 sprints, I extracted the monolith into 6 focused services using the strangler fig pattern, with feature flags controlling routing. Each extraction was independently deployable and reversible. (5) Measure — I tracked deployment frequency (increased from weekly to daily), incident rate (decreased 70%), and time-to-implement for new payment methods (decreased from 3 weeks to 3 days). The key lesson: never refactor without measuring the before and after.

**Q: How do you communicate technical debt to non-technical stakeholders?**

A: I use the financial metaphor consistently and back it with data. I frame debt in terms stakeholders care about: revenue impact, risk, and velocity. For example: "Our checkout flow has accumulated debt that adds 2 weeks to every payment-related feature. At our current feature rate, that is 8 weeks of lost capacity per year — equivalent to $X in delayed revenue from features that ship late." I use visualizations: trend charts showing velocity declining as debt increases, heat maps showing which areas of the codebase are most expensive to change, and risk matrices showing probability and impact of debt-related incidents. I present options with trade-offs: "Option A: Continue as-is, accept 30% velocity loss. Option B: Invest 4 weeks now, recover velocity in 2 months. Option C: Dedicate 20% ongoing capacity, gradual improvement over 6 months." I avoid technical jargon and never frame it as "we need to rewrite because the code is bad" — instead, it is "investing in our platform's capacity to deliver business value faster."

**Q: What is the difference between technical debt and legacy code?**

A: Technical debt is a financial metaphor for the future cost of expedient decisions — it implies a conscious or unconscious trade-off between short-term speed and long-term maintainability. Legacy code is simply code that exists and works but may be difficult to change, often because it lacks tests, uses outdated patterns, or was written with different requirements in mind. The key distinction: all technical debt creates maintenance burden, but not all legacy code is debt. A 10-year-old module that is stable, well-tested, and rarely needs changes is legacy but not debt — it is not costing you anything ongoing. Conversely, code written last week with a known shortcut that will slow down next month's feature is fresh debt, not legacy. Legacy code becomes debt when it actively impedes current work: when you need to modify it but cannot safely, when it blocks adoption of new tools or patterns, or when its operational characteristics (performance, reliability) no longer meet current requirements.

## Production Tips

- **Implement automated debt detection in CI pipelines**: Configure quality gates that track debt metrics over time. Tools like SonarQube's "Quality Gate" can fail builds when new code introduces debt beyond thresholds (e.g., new code must have >80% coverage, complexity <15, no critical vulnerabilities). This prevents debt from growing while you work on reducing existing debt. Track the "debt ratio" (estimated remediation time / development time) and alert when it exceeds your team's threshold.

- **Create a "debt register" as a living document**: Maintain a prioritized list of known debt items with estimated interest cost, fix cost, and ROI. Review it quarterly with stakeholders. This transforms debt from a vague complaint ("our code is bad") into a managed portfolio of investments with expected returns. Include both the cost of fixing and the cost of not fixing — stakeholders need both sides to make informed decisions.

- **Use "debt budgets" per team and per quarter**: Allocate a specific budget (in person-weeks) for debt reduction each quarter. Teams choose which items to address within their budget based on local knowledge of what causes the most pain. Track spending against budget and outcomes against predictions. This creates accountability and prevents both over-investment (gold-plating) and under-investment (ignoring debt until crisis).

## Related Topics

- [Refactoring Patterns](./refactoring-patterns.md) — Refactoring is the primary mechanism for paying down technical debt through systematic code improvement
- [Code Review Practices](./code-review-practices.md) — Code reviews are the first line of defense against accumulating new technical debt
- [Clean Architecture](./clean-architecture.md) — Clean architecture boundaries prevent debt from spreading across system layers and contain its blast radius
- [SOLID Principles](./solid-principles.md) — SOLID violations are a primary source of design debt that compounds as systems grow
