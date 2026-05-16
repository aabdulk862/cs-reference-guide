# Core Container and Dependency Injection

## Quick Reference

- The Spring IoC container manages object creation, configuration, and lifecycle through bean definitions
- Dependency Injection types: constructor injection (preferred), setter injection, and field injection (discouraged)
- Bean scopes: `singleton` (default, one instance per container), `prototype` (new instance per request), `request`, `session`, `application`
- Configuration approaches: `@Configuration` classes with `@Bean` methods, component scanning with `@Component`, and XML (legacy)
- `@Autowired` resolves dependencies by type; `@Qualifier` disambiguates when multiple candidates exist
- Bean lifecycle callbacks: `@PostConstruct`, `@PreDestroy`, `InitializingBean`, `DisposableBean`, `@Bean(initMethod/destroyMethod)`
- `BeanPostProcessor` intercepts bean initialization to add cross-cutting behavior (AOP proxies, validation, custom annotations)
- `BeanFactoryPostProcessor` modifies bean definitions before instantiation (property placeholder resolution, configuration class processing)
- Profiles (`@Profile`) enable environment-specific bean registration; activated via `spring.profiles.active`
- `@Conditional` annotations enable programmatic bean registration based on classpath, properties, or custom conditions
- Spring Expression Language (SpEL) provides runtime evaluation in annotations: `@Value("#{systemProperties['user.home']}")`
- Custom scopes can be registered via `ConfigurableBeanFactory.registerScope()` for tenant-isolated or conversation-scoped beans
- Spring 6 / Boot 3 introduces AOT (Ahead-of-Time) processing that pre-computes bean definitions at build time for GraalVM native images
- `ObjectProvider<T>` is the preferred way to handle optional or lazy dependencies, replacing `@Autowired(required=false)`
- `@ConfigurationProperties` with `@ConstructorBinding` creates immutable, validated configuration objects bound from `application.yml`

## When to Use

The Spring IoC container is the foundation of every Spring application and understanding its internals is essential for building maintainable enterprise systems. You need deep container knowledge when designing modular applications with clear dependency boundaries, when implementing plugin architectures where components are discovered and wired at runtime, when troubleshooting circular dependency errors or unexpected bean initialization order, and when optimizing application startup time by controlling eager versus lazy initialization. Constructor injection with the container managing object graphs enables true unit testing with mock dependencies, eliminates hidden coupling between components, and makes dependency requirements explicit in the API. Understanding bean scopes is critical when integrating with web frameworks where request-scoped beans must not be injected into singletons without proxy wrappers, and when prototype-scoped beans require special handling through ObjectProvider or lookup methods to avoid the common mistake of receiving the same instance repeatedly.

Understanding `BeanPostProcessor` and `BeanFactoryPostProcessor` is essential for framework developers and for debugging unexpected behavior in production. These extension points power Spring's AOP proxies, transaction management, scheduling, and caching — knowing how they work helps you understand why self-invocation bypasses proxies and why bean ordering sometimes matters. Custom scopes enable advanced patterns like tenant isolation in SaaS applications, conversation-scoped beans in wizard flows, and thread-scoped beans for batch processing. SpEL expressions in `@Value` annotations provide runtime flexibility for configuration that depends on system properties, environment variables, or other bean values.

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

### BeanPostProcessor and BeanFactoryPostProcessor

```java
// BeanPostProcessor — intercepts every bean after initialization
// This is how Spring creates AOP proxies, @Scheduled wrappers, etc.
@Component
public class AuditBeanPostProcessor implements BeanPostProcessor {

    @Override
    public Object postProcessBeforeInitialization(Object bean, String beanName) {
        // Called BEFORE @PostConstruct and InitializingBean.afterPropertiesSet()
        if (bean instanceof Configurable configurable) {
            configurable.validate();  // Custom pre-init validation
        }
        return bean;
    }

    @Override
    public Object postProcessAfterInitialization(Object bean, String beanName) {
        // Called AFTER @PostConstruct — this is where proxies are created
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

// BeanFactoryPostProcessor — modifies bean DEFINITIONS before any beans are created
// This is how @ConfigurationProperties, property placeholders, and @ComponentScan work
@Component
public class EncryptedPropertyPostProcessor implements BeanFactoryPostProcessor {

    @Override
    public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) {
        // Runs before any bean is instantiated
        // Can modify bean definitions, add new ones, or change property values
        MutablePropertySources propertySources = ((ConfigurableEnvironment)
            beanFactory.getBean(Environment.class)).getPropertySources();

        propertySources.forEach(ps -> {
            if (ps instanceof EnumerablePropertySource<?> eps) {
                for (String name : eps.getPropertyNames()) {
                    Object value = eps.getProperty(name);
                    if (value instanceof String str && str.startsWith("{encrypted}")) {
                        // Decrypt and replace property value
                        String decrypted = decrypt(str.substring(11));
                        System.setProperty(name, decrypted);
                    }
                }
            }
        });
    }
}
```

### Bean Lifecycle in Detail

```java
// Complete bean lifecycle demonstration
// Order: Constructor → BeanPostProcessor.before → @PostConstruct →
//        InitializingBean.afterPropertiesSet → init-method →
//        BeanPostProcessor.after → Ready for use →
//        @PreDestroy → DisposableBean.destroy → destroy-method
@Component
public class LifecycleDemoBean implements InitializingBean, DisposableBean,
        BeanNameAware, BeanFactoryAware, ApplicationContextAware {

    private String beanName;
    private BeanFactory beanFactory;
    private ApplicationContext applicationContext;

    // 1. Constructor injection
    public LifecycleDemoBean(SomeDependency dep) {
        System.out.println("1. Constructor called");
    }

    // 2. Aware interfaces — container injects infrastructure references
    @Override
    public void setBeanName(String name) {
        this.beanName = name;
        System.out.println("2. BeanNameAware: " + name);
    }

    @Override
    public void setBeanFactory(BeanFactory factory) {
        this.beanFactory = factory;
        System.out.println("3. BeanFactoryAware");
    }

    @Override
    public void setApplicationContext(ApplicationContext ctx) {
        this.applicationContext = ctx;
        System.out.println("4. ApplicationContextAware");
    }

    // 3. BeanPostProcessor.postProcessBeforeInitialization runs here

    // 4. @PostConstruct
    @PostConstruct
    public void postConstruct() {
        System.out.println("5. @PostConstruct");
    }

    // 5. InitializingBean
    @Override
    public void afterPropertiesSet() {
        System.out.println("6. InitializingBean.afterPropertiesSet");
    }

    // 6. BeanPostProcessor.postProcessAfterInitialization runs here
    // → Bean is now fully initialized and ready for use

    // Destruction phase:
    @PreDestroy
    public void preDestroy() {
        System.out.println("7. @PreDestroy");
    }

    @Override
    public void destroy() {
        System.out.println("8. DisposableBean.destroy");
    }
}
```

### Custom Scopes and SpEL Expressions

```java
// Custom scope implementation for multi-tenant isolation
public class TenantScope implements Scope {

    private final Map<String, Map<String, Object>> tenantBeans = new ConcurrentHashMap<>();

    @Override
    public Object get(String name, ObjectFactory<?> objectFactory) {
        String tenantId = TenantContext.getCurrentTenant();
        Map<String, Object> beans = tenantBeans.computeIfAbsent(
            tenantId, k -> new ConcurrentHashMap<>());
        return beans.computeIfAbsent(name, k -> objectFactory.getObject());
    }

    @Override
    public Object remove(String name) {
        String tenantId = TenantContext.getCurrentTenant();
        Map<String, Object> beans = tenantBeans.get(tenantId);
        return beans != null ? beans.remove(name) : null;
    }

    @Override
    public void registerDestructionCallback(String name, Runnable callback) {
        // Register callback for cleanup when tenant scope ends
    }

    @Override
    public Object resolveContextualObject(String key) {
        return TenantContext.getCurrentTenant();
    }

    @Override
    public String getConversationId() {
        return TenantContext.getCurrentTenant();
    }
}

// Register the custom scope
@Configuration
public class ScopeConfig {
    @Bean
    public static CustomScopeConfigurer tenantScopeConfigurer() {
        CustomScopeConfigurer configurer = new CustomScopeConfigurer();
        configurer.addScope("tenant", new TenantScope());
        return configurer;
    }
}

// Use the custom scope
@Component
@Scope("tenant")
public class TenantConfiguration {
    private Map<String, String> settings;
    // Each tenant gets their own instance
}

// SpEL expressions in bean definitions
@Component
public class SpELDemoService {

    // System property access
    @Value("#{systemProperties['user.home']}")
    private String userHome;

    // Environment variable with default
    @Value("#{systemEnvironment['MAX_RETRIES'] ?: 3}")
    private int maxRetries;

    // Bean reference and method call
    @Value("#{configService.getTimeout()}")
    private Duration timeout;

    // Conditional expression
    @Value("#{${server.port} > 8080 ? 'high-port' : 'standard-port'}")
    private String portCategory;

    // Collection filtering
    @Value("#{userRepository.findAll().?[active == true]}")
    private List<User> activeUsers;
}
```

### GraalVM Native Image and AOT Processing

```java
// Spring 6 / Boot 3 AOT-compatible configuration
@Configuration(proxyBeanMethods = false)  // Lite mode — no CGLIB proxy
public class NativeCompatibleConfig {

    @Bean
    public OrderService orderService(OrderRepository repository,
                                     EventPublisher publisher) {
        return new OrderService(repository, publisher);
    }

    @ImportRuntimeHints(AppRuntimeHints.class)
    static class HintsRegistration {}
}

public class AppRuntimeHints implements RuntimeHintsRegistrar {
    @Override
    public void registerHints(RuntimeHints hints, ClassLoader classLoader) {
        hints.reflection().registerType(CustomerDTO.class,
            MemberCategory.INVOKE_DECLARED_CONSTRUCTORS,
            MemberCategory.INVOKE_DECLARED_METHODS);
        hints.resources().registerPattern("db/migration/*.sql");
    }
}
```

### Conditional Beans and Profile Composition

```java
// Custom condition for feature flags
public class FeatureEnabledCondition implements Condition {
    @Override
    public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
        Map<String, Object> attrs = metadata.getAnnotationAttributes(
            ConditionalOnFeature.class.getName());
        String featureName = (String) attrs.get("value");
        return context.getEnvironment()
            .getProperty("features." + featureName + ".enabled", Boolean.class, false);
    }
}

@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@Conditional(FeatureEnabledCondition.class)
public @interface ConditionalOnFeature {
    String value();
}

// Usage
@Service
@ConditionalOnFeature("new-pricing-engine")
public class NewPricingEngine implements PricingEngine {
    // Only registered when features.new-pricing-engine.enabled=true
}

// Profile composition — multiple profiles can be active simultaneously
@Configuration
@Profile("cloud & !local")  // Active when 'cloud' is active AND 'local' is NOT
public class CloudConfig {

    @Bean
    @Profile("aws")
    public StorageService s3Storage() {
        return new S3StorageService();
    }

    @Bean
    @Profile("gcp")
    public StorageService gcsStorage() {
        return new GcsStorageService();
    }
}
```

## Common Pitfalls

1. **Circular dependencies between beans**: When Bean A depends on Bean B and Bean B depends on Bean A, the container cannot determine initialization order. Spring can resolve this for setter injection by creating partially-initialized beans, but constructor injection (the recommended approach) fails immediately with a `BeanCurrentlyInCreationException`. The correct fix is to redesign the dependency graph, typically by extracting shared logic into a third bean, using events for loose coupling, or applying `@Lazy` on one dependency to defer its resolution until first use. Circular dependencies are a design smell indicating that responsibilities are not properly separated.

2. **Field injection hiding dependencies**: Using `@Autowired` on fields makes dependencies invisible in the constructor, preventing the compiler from enforcing required dependencies and making unit testing difficult (requiring reflection or Spring test context). Field injection also hides the true complexity of a class because you cannot see the dependency count without reading the entire class body. Constructor injection makes dependencies explicit, enables immutability with final fields, and allows plain unit tests with mock objects passed directly to the constructor.

3. **Prototype bean injected into singleton**: When a prototype-scoped bean is injected into a singleton via constructor or field injection, the singleton receives one instance that is reused for the singleton's entire lifetime, defeating the purpose of prototype scope. Use `ObjectProvider<T>`, `@Lookup` method injection, or `ScopedProxyMode.TARGET_CLASS` to get fresh prototype instances on each access. This is one of the most common Spring mistakes in production code.

4. **Missing @Transactional proxy awareness**: Spring's `@Transactional` works through AOP proxies. Calling a `@Transactional` method from within the same class bypasses the proxy, so the transaction annotation has no effect. The method must be called from an external bean for the proxy to intercept it. Solutions include extracting the transactional method to a separate service, using self-injection (`@Autowired` on the same class), or using AspectJ compile-time weaving instead of proxy-based AOP.

5. **BeanPostProcessor ordering issues**: If a `BeanPostProcessor` depends on other beans, those beans are created early (before other post-processors run) and may miss processing by other `BeanPostProcessor` instances. For example, a `BeanPostProcessor` that depends on a `@Service` bean causes that service to be created before AOP proxies are applied, meaning `@Transactional` on that service will not work. Keep `BeanPostProcessor` implementations dependency-free or use `@Lazy` injection.

6. **Auto-configuration ordering conflicts**: When multiple auto-configuration classes compete to define the same bean type, the order of evaluation matters. Use `@AutoConfigureBefore`, `@AutoConfigureAfter`, and `@AutoConfigureOrder` to control ordering. More commonly, use `@ConditionalOnMissingBean` to ensure your custom bean takes precedence over auto-configured defaults, and `@Primary` to designate a preferred candidate when multiple beans of the same type exist.

7. **GraalVM native image incompatibility with runtime proxies**: Spring's default CGLIB proxying for `@Configuration` classes uses runtime bytecode generation, which is not supported in GraalVM native images without explicit configuration. Use `@Configuration(proxyBeanMethods = false)` (lite mode) for native-compatible configurations. Register `RuntimeHints` for any beans accessed via reflection, and avoid `@ConditionalOnExpression` with complex SpEL that cannot be evaluated at build time.

8. **Ignoring bean destruction in prototype scope**: The container does not manage the full lifecycle of prototype-scoped beans — it creates them but does not call `@PreDestroy` or `DisposableBean.destroy()` when they are no longer needed. This can cause resource leaks (open connections, file handles) in prototype beans. Implement `AutoCloseable` and manage cleanup explicitly in the consuming code, or use a custom scope that tracks instances for destruction.

9. **SpEL injection vulnerabilities**: Using user-supplied input in SpEL expressions (e.g., `@Value("#{${user.input}}")`) can lead to remote code execution. Never evaluate untrusted strings as SpEL expressions. Use `SimpleEvaluationContext` instead of `StandardEvaluationContext` when evaluating dynamic expressions to restrict access to Java types and methods.

## Real-World Use Cases

- **Multi-tenant SaaS applications**: Spring's bean scopes and profiles enable multi-tenant architectures where tenant-specific configurations (database connections, feature flags, rate limits) are resolved at runtime. Custom scope implementations backed by ThreadLocal or request attributes provide tenant-isolated beans without code duplication. Companies like Salesforce and ServiceNow use similar patterns to serve thousands of tenants from shared infrastructure while maintaining configuration isolation.

- **Plugin-based architectures**: Spring's component scanning and conditional bean registration enable plugin systems where functionality is activated by dropping JARs on the classpath. Each plugin declares its beans with `@ConditionalOnClass` checks, and the container automatically wires them into the application. This pattern powers Spring Boot's auto-configuration system itself, where adding a dependency like `spring-boot-starter-data-jpa` automatically configures entity managers, transaction managers, and repositories.

- **Feature flag-driven development**: Using `@ConditionalOnProperty` and custom `@Conditional` implementations, teams can deploy code with features disabled in production and enable them gradually through configuration changes without redeployment. This enables trunk-based development where incomplete features are merged to main behind flags, reducing long-lived branches and merge conflicts while enabling canary releases and A/B testing.

- **Graceful degradation with fallback beans**: Production systems define primary service implementations alongside fallback beans annotated with `@ConditionalOnMissingBean` or lower `@Order` priority. When the primary service is unavailable (detected via health checks or circuit breakers), the container can be refreshed to activate fallback implementations that provide degraded but functional service, maintaining system availability during partial outages.

- **GraalVM native microservices**: Spring Boot 3's AOT engine pre-computes bean definitions, configuration property bindings, and proxy classes at build time. This enables native image compilation with GraalVM, producing executables that start in under 100ms and consume 50-80% less memory than JVM deployments. Companies running hundreds of microservices on Kubernetes use native images to reduce pod startup time from 15 seconds to under 1 second, enabling aggressive horizontal scaling and near-instant failover.

- **Kubernetes-native configuration with ConfigMaps**: Spring Boot 3's `spring.config.import=kubernetes:` support reads configuration directly from Kubernetes ConfigMaps and Secrets, eliminating the need for Spring Cloud Config Server in Kubernetes deployments. Combined with `@ConfigurationProperties` validation, applications fail fast on startup if required configuration is missing from the cluster, preventing misconfigured pods from entering the load balancer rotation.

## Interview Questions

**Q: Explain the difference between `@Component`, `@Service`, `@Repository`, and `@Controller`.**

A: All four are specializations of `@Component` and trigger component scanning for automatic bean registration. `@Service` indicates business logic with no additional framework behavior beyond semantic clarity. `@Repository` enables automatic exception translation, converting persistence-specific exceptions (like Hibernate's `PersistenceException`) into Spring's `DataAccessException` hierarchy, providing a consistent exception model regardless of the underlying persistence technology. `@Controller` marks Spring MVC controllers for request mapping and view resolution. The distinction is primarily semantic for code organization and enables targeted AOP advice (e.g., applying transaction management only to `@Service` beans or exception translation only to `@Repository` beans).

**Q: How does Spring resolve dependencies when multiple beans of the same type exist?**

A: Spring uses a resolution hierarchy: first, it checks for `@Primary` annotation designating a preferred candidate. If no primary exists, it checks for `@Qualifier` annotations matching a specific bean name. If neither is present, it attempts to match by parameter name (the parameter name must match a bean name). If ambiguity remains, Spring throws `NoUniqueBeanDefinitionException`. For collections, Spring injects all matching beans into `List<T>` or `Map<String, T>` parameters. `ObjectProvider<T>` provides programmatic resolution with methods like `getIfAvailable()` and `orderedStream()` for graceful handling of missing or multiple candidates.

**Q: What is the difference between `BeanPostProcessor` and `BeanFactoryPostProcessor`?**

A: `BeanFactoryPostProcessor` runs before any beans are instantiated — it operates on bean definitions (metadata) and can modify them, add new definitions, or resolve property placeholders. `PropertySourcesPlaceholderConfigurer` is a classic example that resolves `${...}` placeholders in bean definitions. `BeanPostProcessor` runs after each bean is instantiated and initialized — it operates on actual bean instances and can wrap them with proxies or modify their state. `AutowiredAnnotationBeanPostProcessor` handles `@Autowired` injection, and `AnnotationAwareAspectJAutoProxyCreator` creates AOP proxies. The key distinction: `BeanFactoryPostProcessor` modifies the blueprint, `BeanPostProcessor` modifies the built object.

**Q: What is the difference between `@Bean` and `@Component`?**

A: `@Component` (and its specializations) is a class-level annotation that registers the annotated class as a bean through component scanning. The class itself is the bean definition. `@Bean` is a method-level annotation used within `@Configuration` classes where the method body creates and configures the bean instance. Use `@Bean` when you need to instantiate third-party classes you cannot annotate, when bean creation requires complex logic or conditional configuration, or when you need multiple beans of the same type with different configurations. `@Configuration` classes with `@Bean` methods also support inter-bean references (calling one `@Bean` method from another returns the singleton instance, not a new object) due to CGLIB proxying.

**Q: How does Spring Boot auto-configuration work internally?**

A: Spring Boot scans `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` (or the legacy `spring.factories`) for auto-configuration class names. Each class is a `@Configuration` annotated with `@Conditional` variants that control activation. For example, `DataSourceAutoConfiguration` activates only when a `DataSource` class is on the classpath (`@ConditionalOnClass`) and no user-defined `DataSource` bean exists (`@ConditionalOnMissingBean`). Auto-configurations are processed after user-defined configurations, ensuring user beans take precedence. The `@EnableAutoConfiguration` annotation (included in `@SpringBootApplication`) triggers this mechanism.

**Q: What is the difference between Spring AOT processing and traditional runtime bean creation?**

A: Traditional Spring creates beans at runtime by scanning the classpath, evaluating conditions, and using reflection to instantiate and wire objects. AOT (Ahead-of-Time) processing in Spring 6 / Boot 3 performs these steps at build time, generating Java source code that directly instantiates beans without reflection. This produces a `BeanFactoryInitializationAotProcessor` that registers bean definitions programmatically. The benefits are faster startup (no classpath scanning or condition evaluation at runtime), lower memory usage (no reflection metadata retained), and GraalVM native image compatibility (no dynamic class loading). The trade-off is that runtime-dynamic features like `@Profile` evaluation and `@ConditionalOnProperty` must be resolved at build time, limiting some flexibility.

**Q: How does `@ConfigurationProperties` differ from `@Value` for configuration binding?**

A: `@Value` injects individual properties using SpEL expressions and is suitable for simple, isolated values. `@ConfigurationProperties` binds an entire prefix of properties to a structured Java object, supporting nested objects, collections, validation with `@Validated`, and type-safe access. `@ConfigurationProperties` with record classes or `@ConstructorBinding` creates immutable configuration objects. It also generates metadata for IDE auto-completion via `spring-boot-configuration-processor`. Use `@Value` for one-off values; use `@ConfigurationProperties` for structured configuration groups that benefit from validation and documentation.

**Q: Explain custom scopes in Spring. When would you implement one?**

A: Custom scopes define a lifecycle boundary for bean instances beyond the built-in singleton, prototype, request, and session scopes. Implement the `Scope` interface with `get()` (retrieve or create instance), `remove()` (destroy instance), and `registerDestructionCallback()` methods. Register via `CustomScopeConfigurer`. Use cases include tenant scope (one instance per tenant in multi-tenant apps), conversation scope (one instance per multi-step wizard flow), batch scope (one instance per batch job execution), and thread scope (one instance per thread for thread-unsafe objects). Spring Batch's `@StepScope` and `@JobScope` are examples of custom scopes that bind bean lifecycle to batch execution contexts.

**Q: What is SpEL and where is it used in Spring?**

A: Spring Expression Language (SpEL) is a runtime expression language supporting property access, method invocation, string templating, mathematical operators, logical operators, collection manipulation, and type references. It is used in `@Value` annotations for dynamic property resolution, in `@PreAuthorize`/`@PostAuthorize` for security expressions, in `@Cacheable` for dynamic key generation, in Spring Data `@Query` for SpEL-based parameter binding, and in Spring Integration for routing expressions. SpEL evaluates against an `EvaluationContext` that provides access to beans, system properties, and method parameters. Use `SimpleEvaluationContext` for restricted evaluation when processing untrusted input.

## Production Tips

- **Startup time optimization**: For large applications with hundreds of beans, startup time can exceed 30 seconds. Use `@Lazy` on beans that are not needed immediately, enable lazy initialization globally with `spring.main.lazy-initialization=true` for development (not production), and use Spring AOT (Ahead-of-Time) compilation in Spring Boot 3+ to pre-compute bean definitions at build time. Profile startup with Spring Boot's `ApplicationStartup` API and export to Java Flight Recorder for detailed analysis of the slowest bean initializations.

- **Configuration validation at startup**: Use `@ConfigurationProperties` with `@Validated` and Jakarta Bean Validation annotations to fail fast on misconfiguration. This catches missing required properties, invalid formats, and out-of-range values at application startup rather than at runtime when the configuration is first accessed. Combine with `@ConstructorBinding` for immutable configuration objects that cannot be accidentally modified after initialization.

- **Bean definition overriding control**: In production, set `spring.main.allow-bean-definition-overriding=false` (the default in Spring Boot 2.1+) to prevent accidental bean replacement. When intentional overriding is needed (e.g., in test configurations), use `@Primary` or explicit `@Qualifier` rather than relying on definition ordering. This prevents subtle bugs where a library's auto-configuration silently replaces your custom bean.

- **Observability with Micrometer and bean metrics**: Instrument critical beans with Micrometer counters and timers to track business operations. Use `MeterRegistry` injection to record bean method execution times, error rates, and throughput. Spring Boot 3's built-in observability auto-configures Micrometer with support for Prometheus, Datadog, and OpenTelemetry exporters. Annotate methods with `@Observed` (from Micrometer Observation API) for automatic span creation and metric recording without manual instrumentation code.

- **Virtual threads integration (Project Loom)**: Spring Boot 3.2+ supports virtual threads via `spring.threads.virtual.enabled=true`. This changes the embedded server's thread pool to use virtual threads, allowing millions of concurrent requests without thread pool exhaustion. For bean-scoped operations, virtual threads eliminate the need for reactive programming in I/O-bound services. However, avoid `synchronized` blocks in beans when using virtual threads — use `ReentrantLock` instead to prevent carrier thread pinning.

- **BeanPostProcessor performance impact**: Each `BeanPostProcessor` is invoked for every bean in the container. In applications with 500+ beans and multiple post-processors, this adds measurable startup overhead. Keep post-processor logic lightweight, use early returns for beans that don't need processing, and consider using `SmartInstantiationAwareBeanPostProcessor` for more targeted interception. Profile with `ApplicationStartup` to identify slow post-processors.

## Related Topics

- [Spring MVC and REST APIs](./spring-mvc.md) — Web layer built on top of the core container's dependency injection
- [Spring Data and Persistence](./spring-data.md) — Repository beans managed by the IoC container with transaction proxies
- [Spring Security](./spring-security.md) — Security filters and method security rely on AOP proxies created by BeanPostProcessors
- [Java Core Language](../java/core-language.md) — Interfaces and polymorphism that enable Spring's DI model
