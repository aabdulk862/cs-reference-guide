# Software Engineering

Software engineering is the disciplined application of engineering principles to the design, development, maintenance, and evolution of software systems. Unlike ad-hoc programming, software engineering emphasizes **sustainability**, **maintainability**, and **team collaboration** as first-class concerns alongside correctness and performance. At scale, the difference between a codebase that thrives and one that collapses under its own weight comes down to how rigorously these principles are applied.

This section covers the foundational practices that separate production-grade engineering from prototype-level code. You will learn how to structure code for long-term maintainability using SOLID principles, architect systems with clear boundaries using clean architecture patterns, systematically improve existing code through refactoring, establish effective code review processes that elevate entire teams, and manage technical debt as a strategic concern rather than an afterthought.

These topics are deeply interconnected. SOLID principles inform architectural decisions, which guide refactoring strategies, which surface during code reviews, which ultimately determine how much technical debt accumulates. Mastering them together gives you the vocabulary and frameworks to make sound engineering decisions under real-world constraints of time, team size, and system complexity.

## Learning Path

1. [SOLID Principles](./solid-principles.md) — Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, and Dependency Inversion with production code examples
2. [Clean Architecture](./clean-architecture.md) — Hexagonal architecture, ports and adapters, dependency rule, use cases, and domain-driven design boundaries
3. [Refactoring Patterns](./refactoring-patterns.md) — Extract method, replace conditional with polymorphism, introduce parameter object, strangler fig, and feature flags
4. [Code Review Practices](./code-review-practices.md) — Review checklists, giving and receiving feedback, automated checks, review culture, and anti-patterns
5. [Technical Debt](./technical-debt.md) — Types of debt, measurement, prioritization frameworks, refactoring strategies, and stakeholder communication
