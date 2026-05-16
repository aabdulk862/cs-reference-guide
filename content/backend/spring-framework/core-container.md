# Core Container and Dependency Injection

## Quick Reference

- The Spring IoC container manages object creation, configuration, and lifecycle through bean definitions
- Dependency Injection types: constructor injection (preferred), setter injection, and field injection (discouraged)
- Bean scopes: `singleton` (default, one instance per container), `prototype` (new instance per request), `request`, `session`, `application`
- Configuration approaches: `@Configuration` classes with `@Bean` methods, component scanning with `@Component`, and XML (legacy)
- `@Autowired` resolves dependencies by type; `@Qualifier` disambiguates when multiple candidates exist
- Bean lifecycle callbacks: `@PostConstruct`, `@PreDestroy`, `InitializingBean`, `DisposableBean`, `@Bean(initMethod/destroyMethod)`
- Profiles (`@Profile`) enable environment-specific bean registration; activated via `spring.profiles.active`
- `@Conditional` annotations enable programmatic bean registration based on classpath, properties, or custom conditions

## When to Use

The Spring IoC container is the foundation of every Spring application and understanding its internals is essential for building maintainable enterprise systems. You need deep container knowledge when designing modular applications with clear dependency boundaries, when implementing plugin architectures where components are discovered and wired at runtime, when troubleshooting circular dependency errors or unexpected bean initialization order, and when optimizing application startup time by controlling eager versus lazy initialization. Constructor injection with the container managing object graphs enables true unit testing with mock dependencies, eliminates hidden coupling between components, and makes dependency requirements explicit in the API. Understanding bean scopes is critical when integrating with web frameworks where request-scoped beans must not be injected into singletons without proxy wrappers, and when prototype-scoped beans require special handling through ObjectProvider or lookup methods to avoid the common mistake of receiving the same instance repeatedly.

## Code Examples

### Configuration and Bean Registration

```java
@Configuration
@PropertySource("classpath:application.properties")
public class AppConfig {

    @Bean
    @Profile("production")
    public DataSource productionDataSource(
            @Value("${db.url}") String url,
            @Value("${db.username}") String username,
            @Value("${db.password}") String password) {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(url);
        config.setUsername(username);
        config.setPassword(password);
        config.setMaximumPoolSize(20);
        config.setMinimumIdle(5);
        config.setConnectionTimeout(30000);
        config.setIdleTimeout(600000);
        config.setMaxLifetime(1800000);
        return new HikariDataSource(config);
    }

    @Bean
    @Profile("test")
    public DataSource testDataSource() {
        return new EmbeddedDatabaseBuilder()
            .setType(EmbeddedDatabaseType.H2)
            .addScript("schema.sql")
            .addScript("test-data.sql")
            .build();
    }

    @Bean
    @ConditionalOnProperty(name = "cache.enabled", havingValue = "true")
    public CacheManager cacheManager() {
        CaffeineCacheManager manager = new CaffeineCacheManager();
        manager.setCaffeine(Caffeine.newBuilder()
            .maximumSize(10000)
            .expireAfterWrite(Duration.ofMinutes(30))
            .recordStats());
        return manager;
    }
}
```

### Constructor Injection and Component Scanning

```java
@Service
@RequiredArgsConstructor  // Lombok generates constructor for final fields
public class OrderService {

    private final OrderRepository orderRepository;
    private final PaymentClient paymentClient;
    private final EventPublisher eventPublisher;
    private final MeterRegistry meterRegistry;

    @Transactional
    public OrderResponse createOrder(CreateOrderRequest request) {
        Timer.Sample sample = Timer.start(meterRegistry);
        try {
            Order order = Order.from(request);
            order = orderRepository.save(order);
            paymentClient.processPayment(order.getPaymentDetails());
            eventPublisher.publish(new OrderCreatedEvent(order));
            return OrderResponse.from(order);
        } finally {
            sample.stop(meterRegistry.timer("order.creation"));
        }
    }
}

// Interface-based dependency for testability
public interface PaymentClient {
    PaymentResult processPayment(PaymentDetails details);
}

@Component
@Profile("production")
public class StripePaymentClient implements PaymentClient {
    private final StripeApi stripeApi;
    private final RetryTemplate retryTemplate;

    public StripePaymentClient(StripeApi stripeApi, RetryTemplate retryTemplate) {
        this.stripeApi = stripeApi;
        this.retryTemplate = retryTemplate;
    }

    @Override
    public PaymentResult processPayment(PaymentDetails details) {
        return retryTemplate.execute(ctx ->
            stripeApi.charge(details.getAmount(), details.getCurrency(), details.getToken())
        );
    }
}
```

### Bean Lifecycle and Scope Management

```java
@Component
@Scope(value = "prototype", proxyMode = ScopedProxyMode.TARGET_CLASS)
public class RequestContext {
    private final Map<String, Object> attributes = new HashMap<>();
    private Instant startTime;

    @PostConstruct
    public void init() {
        this.startTime = Instant.now();
    }

    public void setAttribute(String key, Object value) {
        attributes.put(key, value);
    }

    public Duration getElapsed() {
        return Duration.between(startTime, Instant.now());
    }
}

// Using ObjectProvider for prototype beans in a singleton
@Service
public class ReportGenerator {
    private final ObjectProvider<ReportContext> contextProvider;

    public ReportGenerator(ObjectProvider<ReportContext> contextProvider) {
        this.contextProvider = contextProvider;
    }

    public Report generate(ReportRequest request) {
        // Each call gets a fresh prototype instance
        ReportContext context = contextProvider.getObject();
        context.initialize(request);
        return context.buildReport();
    }
}

// Custom bean post-processor for cross-cutting concerns
@Component
public class AuditBeanPostProcessor implements BeanPostProcessor {

    @Override
    public Object postProcessAfterInitialization(Object bean, String beanName) {
        if (bean.getClass().isAnnotationPresent(Audited.class)) {
            return createAuditProxy(bean);
        }
        return bean;
    }

    private Object createAuditProxy(Object target) {
        return Proxy.newProxyInstance(
            target.getClass().getClassLoader(),
            target.getClass().getInterfaces(),
            new AuditInvocationHandler(target)
        );
    }
}
```

## Common Pitfalls

1. **Circular dependencies between beans**: When Bean A depends on Bean B and Bean B depends on Bean A, the container cannot determine initialization order. Spring can resolve this for setter injection by creating partially-initialized beans, but constructor injection (the recommended approach) fails immediately with a BeanCurrentlyInCreationException. The correct fix is to redesign the dependency graph, typically by extracting shared logic into a third bean, using events for loose coupling, or applying `@Lazy` on one dependency to defer its resolution until first use. Circular dependencies are a design smell indicating that responsibilities are not properly separated.

2. **Field injection hiding dependencies**: Using `@Autowired` on fields makes dependencies invisible in the constructor, preventing the compiler from enforcing required dependencies and making unit testing difficult (requiring reflection or Spring test context). Field injection also hides the true complexity of a class because you cannot see the dependency count without reading the entire class body. Constructor injection makes dependencies explicit, enables immutability with final fields, and allows plain unit tests with mock objects passed directly to the constructor.

3. **Prototype bean injected into singleton**: When a prototype-scoped bean is injected into a singleton via constructor or field injection, the singleton receives one instance that is reused for the singleton's entire lifetime, defeating the purpose of prototype scope. Use `ObjectProvider<T>`, `@Lookup` method injection, or `ScopedProxyMode.TARGET_CLASS` to get fresh prototype instances on each access. This is one of the most common Spring mistakes in production code.

4. **Missing @Transactional proxy awareness**: Spring's `@Transactional` works through AOP proxies. Calling a `@Transactional` method from within the same class bypasses the proxy, so the transaction annotation has no effect. The method must be called from an external bean for the proxy to intercept it. Solutions include extracting the transactional method to a separate service, using self-injection (`@Autowired` on the same class), or using AspectJ compile-time weaving instead of proxy-based AOP.

5. **Auto-configuration ordering conflicts**: When multiple auto-configuration classes compete to define the same bean type, the order of evaluation matters. Use `@AutoConfigureBefore`, `@AutoConfigureAfter`, and `@AutoConfigureOrder` to control ordering. More commonly, use `@ConditionalOnMissingBean` to ensure your custom bean takes precedence over auto-configured defaults, and `@Primary` to designate a preferred candidate when multiple beans of the same type exist.

## Real-World Use Cases

- **Multi-tenant SaaS applications**: Spring's bean scopes and profiles enable multi-tenant architectures where tenant-specific configurations (database connections, feature flags, rate limits) are resolved at runtime. Custom scope implementations backed by ThreadLocal or request attributes provide tenant-isolated beans without code duplication. Companies like Salesforce and ServiceNow use similar patterns to serve thousands of tenants from shared infrastructure while maintaining configuration isolation.

- **Plugin-based architectures**: Spring's component scanning and conditional bean registration enable plugin systems where functionality is activated by dropping JARs on the classpath. Each plugin declares its beans with `@ConditionalOnClass` checks, and the container automatically wires them into the application. This pattern powers Spring Boot's auto-configuration system itself, where adding a dependency like `spring-boot-starter-data-jpa` automatically configures entity managers, transaction managers, and repositories.

- **Feature flag-driven development**: Using `@ConditionalOnProperty` and custom `@Conditional` implementations, teams can deploy code with features disabled in production and enable them gradually through configuration changes without redeployment. This enables trunk-based development where incomplete features are merged to main behind flags, reducing long-lived branches and merge conflicts while enabling canary releases and A/B testing.

- **Graceful degradation with fallback beans**: Production systems define primary service implementations alongside fallback beans annotated with `@ConditionalOnMissingBean` or lower `@Order` priority. When the primary service is unavailable (detected via health checks or circuit breakers), the container can be refreshed to activate fallback implementations that provide degraded but functional service, maintaining system availability during partial outages.

## Interview Questions

**Q: Explain the difference between `@Component`, `@Service`, `@Repository`, and `@Controller`.**

A: All four are specializations of `@Component` and trigger component scanning for automatic bean registration. `@Service` indicates business logic with no additional framework behavior beyond semantic clarity. `@Repository` enables automatic exception translation, converting persistence-specific exceptions (like Hibernate's `PersistenceException`) into Spring's `DataAccessException` hierarchy, providing a consistent exception model regardless of the underlying persistence technology. `@Controller` marks Spring MVC controllers for request mapping and view resolution. The distinction is primarily semantic for code organization and enables targeted AOP advice (e.g., applying transaction management only to `@Service` beans or exception translation only to `@Repository` beans).

**Q: How does Spring resolve dependencies when multiple beans of the same type exist?**

A: Spring uses a resolution hierarchy: first, it checks for `@Primary` annotation designating a preferred candidate. If no primary exists, it checks for `@Qualifier` annotations matching a specific bean name. If neither is present, it attempts to match by parameter name (the parameter name must match a bean name). If ambiguity remains, Spring throws `NoUniqueBeanDefinitionException`. For collections, Spring injects all matching beans into `List<T>` or `Map<String, T>` parameters. `ObjectProvider<T>` provides programmatic resolution with methods like `getIfAvailable()` and `orderedStream()` for graceful handling of missing or multiple candidates.

**Q: What is the difference between `@Bean` and `@Component`?**

A: `@Component` (and its specializations) is a class-level annotation that registers the annotated class as a bean through component scanning. The class itself is the bean definition. `@Bean` is a method-level annotation used within `@Configuration` classes where the method body creates and configures the bean instance. Use `@Bean` when you need to instantiate third-party classes you cannot annotate, when bean creation requires complex logic or conditional configuration, or when you need multiple beans of the same type with different configurations. `@Configuration` classes with `@Bean` methods also support inter-bean references (calling one `@Bean` method from another returns the singleton instance, not a new object) due to CGLIB proxying.

**Q: How does Spring Boot auto-configuration work internally?**

A: Spring Boot scans `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` (or the legacy `spring.factories`) for auto-configuration class names. Each class is a `@Configuration` annotated with `@Conditional` variants that control activation. For example, `DataSourceAutoConfiguration` activates only when a `DataSource` class is on the classpath (`@ConditionalOnClass`) and no user-defined `DataSource` bean exists (`@ConditionalOnMissingBean`). Auto-configurations are processed after user-defined configurations, ensuring user beans take precedence. The `@EnableAutoConfiguration` annotation (included in `@SpringBootApplication`) triggers this mechanism.

## Production Tips

- **Startup time optimization**: For large applications with hundreds of beans, startup time can exceed 30 seconds. Use `@Lazy` on beans that are not needed immediately, enable lazy initialization globally with `spring.main.lazy-initialization=true` for development (not production), and use Spring AOT (Ahead-of-Time) compilation in Spring Boot 3+ to pre-compute bean definitions at build time. Profile startup with Spring Boot's `ApplicationStartup` API to identify the slowest bean initializations.

- **Configuration validation at startup**: Use `@ConfigurationProperties` with `@Validated` and Jakarta Bean Validation annotations to fail fast on misconfiguration. This catches missing required properties, invalid formats, and out-of-range values at application startup rather than at runtime when the configuration is first accessed. Combine with `@ConstructorBinding` for immutable configuration objects that cannot be accidentally modified after initialization.

- **Bean definition overriding control**: In production, set `spring.main.allow-bean-definition-overriding=false` (the default in Spring Boot 2.1+) to prevent accidental bean replacement. When intentional overriding is needed (e.g., in test configurations), use `@Primary` or explicit `@Qualifier` rather than relying on definition ordering. This prevents subtle bugs where a library's auto-configuration silently replaces your custom bean.

## Related Topics

- [Spring MVC and REST APIs](./spring-mvc.md) — Web layer built on top of the core container's dependency injection
- [Spring Data and Persistence](./spring-data.md) — Repository beans managed by the IoC container with transaction proxies
- [Java Core Language](../java/core-language.md) — Interfaces and polymorphism that enable Spring's DI model
