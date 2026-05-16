# TypeScript

TypeScript is a statically typed superset of JavaScript that compiles to plain JavaScript, adding zero runtime overhead while providing compile-time type safety that catches entire categories of bugs before code reaches production. Its structural type system, powerful generics, and advanced type-level programming capabilities make it the standard choice for large-scale JavaScript applications where maintainability, refactoring confidence, and self-documenting code are priorities.

The TypeScript compiler performs type erasure during compilation, meaning all type annotations, interfaces, and type aliases disappear from the output JavaScript. This design ensures TypeScript integrates seamlessly with the existing JavaScript ecosystem while providing IDE autocompletion, automated refactoring, and compile-time error detection that dramatically improve developer productivity. TypeScript supports both gradual adoption (adding types incrementally to existing JavaScript) and strict mode (enforcing comprehensive type safety from the start).

Mastering TypeScript requires understanding its type system foundations, leveraging generics for reusable abstractions, utilizing advanced type-level programming with conditional and mapped types, and applying these concepts in real-world patterns for API design, state management, and library development.

## Learning Path

1. [Type System Fundamentals](./type-system-fundamentals.md) — Structural typing, type narrowing, unions, intersections, and the type hierarchy
2. [Generics and Constraints](./generics-and-constraints.md) — Generic functions, classes, constraints, inference, and default type parameters
3. [Advanced Types](./advanced-types.md) — Conditional types, mapped types, template literal types, and type-level programming
4. [Declaration Files and Module Systems](./declaration-files.md) — Writing .d.ts files, module augmentation, and type resolution strategies
5. [Patterns and Best Practices](./patterns-and-best-practices.md) — Utility types, branded types, builder patterns, and production TypeScript architecture
