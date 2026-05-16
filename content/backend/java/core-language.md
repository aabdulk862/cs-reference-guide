# Core Language Fundamentals

## Quick Reference

- Java is statically typed with compile-time type checking and strong type safety guarantees
- Four access modifiers control visibility: `public`, `protected`, `default` (package-private), `private`
- Object-oriented pillars: encapsulation, inheritance, polymorphism, and abstraction
- All classes implicitly extend `java.lang.Object` providing `equals()`, `hashCode()`, `toString()`
- Primitive types (int, long, double, boolean, etc.) live on the stack; objects live on the heap
- Interfaces support multiple inheritance of type; abstract classes support single inheritance of implementation
- Records (Java 16+) provide immutable data carriers with auto-generated constructors, accessors, equals, hashCode
- Sealed classes (Java 17+) restrict which classes can extend them, enabling exhaustive pattern matching

## When to Use

Core language fundamentals form the foundation of every Java application. Understanding the type system, inheritance model, and access control is essential when designing class hierarchies for domain models, implementing design patterns like Strategy or Template Method, or building library APIs that need clear encapsulation boundaries. These concepts are critical when working with frameworks like Spring that rely heavily on interfaces and polymorphism for dependency injection, when designing immutable value objects for thread-safe concurrent systems, and when structuring packages with appropriate visibility to enforce architectural boundaries. Senior engineers need deep understanding of these fundamentals to make informed decisions about when to use inheritance versus composition, when interfaces are preferable to abstract classes, and how to leverage modern Java features like records and sealed classes to write more expressive and maintainable code.

## Code Examples

### Inheritance and Polymorphism

```java
// Abstract base class defining a contract
public abstract class Loan {
    protected double principal;
    protected float interestRate;
    protected int tenure;

    protected Loan(double principal, float interestRate, int tenure) {
        this.principal = principal;
        this.interestRate = interestRate;
        this.tenure = tenure;
    }

    public abstract double calculateEMI();

    public String getSummary() {
        return String.format("Principal: %.2f, Rate: %.2f%%, Tenure: %d years",
            principal, interestRate, tenure);
    }
}

public class HomeLoan extends Loan {
    private final String propertyAddress;

    public HomeLoan(double principal, float rate, int tenure, String address) {
        super(principal, rate, tenure);
        this.propertyAddress = address;
    }

    @Override
    public double calculateEMI() {
        double monthlyRate = interestRate / 12 / 100;
        int months = tenure * 12;
        return (principal * monthlyRate * Math.pow(1 + monthlyRate, months))
               / (Math.pow(1 + monthlyRate, months) - 1);
    }

    public String getPropertyAddress() {
        return propertyAddress;
    }
}

// Polymorphic usage
public class LoanProcessor {
    public void processLoans(List<Loan> loans) {
        for (Loan loan : loans) {
            // Runtime dispatch to correct calculateEMI implementation
            double emi = loan.calculateEMI();
            System.out.println(loan.getSummary() + " → EMI: " + emi);
        }
    }
}
```

### Interfaces, Sealed Classes, and Records

```java
// Sealed interface restricts implementations
public sealed interface Shape permits Circle, Rectangle, Triangle {
    double area();
    double perimeter();
}

// Record provides immutable data carrier
public record Circle(double radius) implements Shape {
    // Compact constructor for validation
    public Circle {
        if (radius <= 0) throw new IllegalArgumentException("Radius must be positive");
    }

    @Override
    public double area() {
        return Math.PI * radius * radius;
    }

    @Override
    public double perimeter() {
        return 2 * Math.PI * radius;
    }
}

public record Rectangle(double width, double height) implements Shape {
    public Rectangle {
        if (width <= 0 || height <= 0)
            throw new IllegalArgumentException("Dimensions must be positive");
    }

    @Override
    public double area() { return width * height; }

    @Override
    public double perimeter() { return 2 * (width + height); }
}

public record Triangle(double a, double b, double c) implements Shape {
    public Triangle {
        if (a + b <= c || a + c <= b || b + c <= a)
            throw new IllegalArgumentException("Invalid triangle sides");
    }

    @Override
    public double area() {
        double s = (a + b + c) / 2;
        return Math.sqrt(s * (s - a) * (s - b) * (s - c));
    }

    @Override
    public double perimeter() { return a + b + c; }
}

// Pattern matching with sealed types (Java 21+)
public String describe(Shape shape) {
    return switch (shape) {
        case Circle c -> "Circle with radius " + c.radius();
        case Rectangle r -> "Rectangle " + r.width() + "x" + r.height();
        case Triangle t -> "Triangle with sides " + t.a() + ", " + t.b() + ", " + t.c();
    };
}
```

### Exception Handling and Custom Exceptions

```java
// Domain-specific exception hierarchy
public class DomainException extends RuntimeException {
    private final String errorCode;

    public DomainException(String errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }

    public DomainException(String errorCode, String message, Throwable cause) {
        super(message, cause);
        this.errorCode = errorCode;
    }

    public String getErrorCode() { return errorCode; }
}

public class OrderNotFoundException extends DomainException {
    public OrderNotFoundException(UUID orderId) {
        super("ORDER_NOT_FOUND", "Order not found: " + orderId);
    }
}

public class InsufficientFundsException extends DomainException {
    private final BigDecimal required;
    private final BigDecimal available;

    public InsufficientFundsException(BigDecimal required, BigDecimal available) {
        super("INSUFFICIENT_FUNDS",
            String.format("Required: %s, Available: %s", required, available));
        this.required = required;
        this.available = available;
    }
}

// Try-with-resources for automatic resource management
public List<Transaction> readTransactions(Path filePath) {
    List<Transaction> transactions = new ArrayList<>();
    try (BufferedReader reader = Files.newBufferedReader(filePath, StandardCharsets.UTF_8)) {
        String line;
        while ((line = reader.readLine()) != null) {
            transactions.add(Transaction.parse(line));
        }
    } catch (IOException e) {
        throw new DomainException("FILE_READ_ERROR",
            "Failed to read transactions from " + filePath, e);
    }
    return transactions;
}
```

## Common Pitfalls

- **Breaking the equals/hashCode contract**: Overriding `equals()` without overriding `hashCode()` causes objects that are logically equal to hash to different buckets, breaking HashMap and HashSet behavior. Always override both methods together, and ensure that if `a.equals(b)` then `a.hashCode() == b.hashCode()`. Records handle this automatically, which is one reason to prefer them for value objects.

- **Mutable fields in equals/hashCode**: Using mutable fields in `hashCode()` calculations means an object's hash can change after insertion into a HashSet or as a HashMap key, making it unretrievable. Use only immutable fields (or the object's identity) for equality and hashing. This is particularly dangerous with JPA entities where the ID may be null before persistence.

- **Checked exception overuse**: Wrapping every operation in checked exceptions forces callers to handle errors they cannot meaningfully recover from, leading to empty catch blocks or exception swallowing. Use unchecked exceptions (RuntimeException subclasses) for programming errors and unrecoverable conditions. Reserve checked exceptions for situations where the immediate caller can take corrective action, such as retrying a network operation or falling back to a default value.

- **Inheritance for code reuse instead of composition**: Extending a class solely to reuse its methods creates tight coupling and fragile hierarchies. The Liskov Substitution Principle requires that subclasses be substitutable for their parent types. Prefer composition (has-a) over inheritance (is-a) unless there is a genuine type relationship. Use interfaces with default methods for sharing behavior across unrelated types.

- **Ignoring immutability for value objects**: Mutable value objects shared between threads or stored in collections lead to subtle bugs when one reference modifies the shared state. Use records for simple value objects, make fields final, return defensive copies of mutable fields (like Date or List), and avoid setters on objects that represent values rather than entities.

## Real-World Use Cases

- **Domain-driven design with sealed types**: Financial systems use sealed interfaces to model payment states (Pending, Authorized, Captured, Refunded) where the compiler enforces exhaustive handling of all states in switch expressions. This eliminates entire categories of bugs where a new state is added but not handled in all processing paths, providing compile-time safety for business-critical state machines.

- **API contract design with interfaces**: Microservice architectures define service contracts as Java interfaces published in shared libraries. Implementation classes remain internal to each service, allowing independent evolution of implementations while maintaining type-safe inter-service communication through generated clients. This pattern enables contract-first development where API consumers and providers can work in parallel.

- **Builder pattern for complex object construction**: Enterprise applications with complex configuration objects (database connections, HTTP clients, message producers) use the Builder pattern with method chaining to provide readable, validated construction. Records with compact constructors handle simple cases, while builders handle objects with many optional parameters and cross-field validation rules.

- **Template Method pattern in data processing**: ETL pipelines define abstract base classes with template methods for extract, transform, and load phases. Concrete implementations override specific phases while inheriting common error handling, logging, and retry logic. This ensures consistent operational behavior across dozens of data pipeline implementations while allowing each pipeline to customize its core logic.

## Interview Questions

**Q: What is the difference between `==` and `.equals()` in Java?**

A: The `==` operator compares reference identity, checking whether two variables point to the same object in memory. The `.equals()` method compares logical equality, checking whether two objects have the same value according to the class's definition of equality. For primitive types, `==` compares values directly. For objects, always use `.equals()` for value comparison. String interning makes `==` behavior unpredictable for strings because the JVM may or may not intern string literals and computed strings into the same pool. The `Objects.equals(a, b)` utility method handles null safely, returning true if both are null and delegating to `a.equals(b)` otherwise.

**Q: Explain the difference between abstract classes and interfaces in Java. When would you choose one over the other?**

A: Abstract classes support single inheritance, can have constructors, instance fields, and methods with any access modifier. Interfaces support multiple inheritance of type, can have default methods (Java 8+), static methods, and private methods (Java 9+), but cannot have instance state or constructors. Choose interfaces when defining a capability contract that multiple unrelated classes should implement (Comparable, Serializable, Closeable). Choose abstract classes when you need to share state or constructor logic among related classes in a hierarchy, or when you want to provide a partial implementation that subclasses complete. In modern Java, interfaces with default methods have narrowed the gap, but abstract classes remain necessary when shared mutable state or controlled construction is required.

**Q: What are records in Java and how do they differ from regular classes?**

A: Records (Java 16+) are immutable data carriers that automatically generate a canonical constructor, accessor methods, `equals()`, `hashCode()`, and `toString()` based on their component declarations. Unlike regular classes, records cannot extend other classes (they implicitly extend `java.lang.Record`), cannot declare instance fields beyond their components, and their components are implicitly final. Records can implement interfaces, have static fields and methods, and define compact constructors for validation. Use records for DTOs, value objects, and any class whose identity is defined entirely by its data rather than its behavior. Records eliminate boilerplate while enforcing immutability, making them ideal for concurrent programming and functional-style code.

**Q: Explain the Liskov Substitution Principle and give an example of a violation.**

A: The Liskov Substitution Principle (LSP) states that objects of a subclass should be substitutable for objects of the superclass without altering the correctness of the program. A classic violation is the Square-Rectangle problem: if Square extends Rectangle and overrides setWidth to also set height (to maintain the square invariant), code that expects a Rectangle and sets width and height independently will produce incorrect results. The fix is to use composition or separate interfaces rather than inheritance when the subtype cannot honor all behavioral contracts of the supertype. In practice, LSP violations manifest as methods that check `instanceof` before operating on a parameter, indicating the abstraction is leaky.

## Production Tips

- **Use Objects utility methods defensively**: `Objects.requireNonNull(param, "message")` at method entry points provides fail-fast behavior with clear error messages instead of NullPointerExceptions deep in call stacks. `Objects.equals()`, `Objects.hash()`, and `Objects.toString()` handle null safely. These utilities make code more robust without verbose null-checking boilerplate.

- **Leverage sealed types for domain modeling**: Sealed classes and interfaces combined with pattern matching (Java 21+) enable the compiler to verify exhaustive handling of all subtypes. When you add a new subtype, every switch expression that handles the sealed type will produce a compile error until updated. This is invaluable for state machines, event types, and command hierarchies in production systems where missing a case means a bug.

- **Design for testability with interfaces**: Define service boundaries as interfaces even when only one implementation exists. This enables unit testing with mock implementations, supports future extension without modifying existing code, and makes dependency injection frameworks work naturally. The small overhead of an interface declaration pays dividends in test isolation and architectural flexibility.

## Related Topics

- [Collections Framework](./collections-framework.md) — Data structures built on Java's type system and generics
- [Streams and Lambdas](./streams-and-lambdas.md) — Functional programming features leveraging interfaces and type inference
