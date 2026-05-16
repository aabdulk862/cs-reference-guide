# Spring MVC and REST APIs

## Quick Reference

- Spring MVC implements the Model-View-Controller pattern with a `DispatcherServlet` front controller that delegates to handler mappings, adapters, and view resolvers
- `@RestController` combines `@Controller` and `@ResponseBody` for JSON/XML API endpoints
- Request mapping: `@GetMapping`, `@PostMapping`, `@PutMapping`, `@DeleteMapping`, `@PatchMapping`
- Parameter binding: `@PathVariable`, `@RequestParam`, `@RequestBody`, `@RequestHeader`, `@CookieValue`, `@MatrixVariable`
- Validation: `@Valid` or `@Validated` with Jakarta Bean Validation annotations triggers automatic validation
- Exception handling: `@ExceptionHandler` methods, `@ControllerAdvice` for global error handling across all controllers
- Content negotiation: automatic JSON (Jackson) and XML (JAXB) serialization based on Accept header via `HttpMessageConverter`
- `ResponseEntity<T>` provides full control over status code, headers, and response body
- Interceptors (`HandlerInterceptor`) execute before/after controller methods for cross-cutting concerns like logging and auth
- Async request processing: `DeferredResult`, `Callable`, `StreamingResponseBody`, and `SseEmitter` for long-running operations
- Spring 6 introduces `ProblemDetail` (RFC 7807) as the standard error response format for REST APIs
- `@HttpExchange` interface-based HTTP clients replace Feign for declarative service-to-service calls in Spring 6
- Virtual threads with `spring.threads.virtual.enabled=true` eliminate thread pool exhaustion in blocking MVC controllers
- Handler method argument resolvers convert request data into method parameters; custom resolvers extend this for domain-specific types

## When to Use

Spring MVC is the standard choice for building HTTP APIs in the Java ecosystem, from simple CRUD endpoints to complex enterprise integrations. Use Spring MVC when building RESTful services that follow standard HTTP semantics, when you need robust request validation and error handling, when integrating with Spring Security for authentication and authorization at the endpoint level, and when your team values the extensive tooling support including MockMvc for integration testing. Spring MVC's synchronous, thread-per-request model is appropriate for most business applications where request processing involves database queries, external service calls, and business logic that benefits from straightforward sequential code. For high-concurrency scenarios with many simultaneous connections (WebSocket servers, streaming APIs, proxy services), consider Spring WebFlux as an alternative. The framework's annotation-driven approach minimizes boilerplate while providing full control over HTTP semantics, making it suitable for both rapid prototyping and production-grade API development.

Understanding the request lifecycle — from `DispatcherServlet` through handler mapping, interceptors, argument resolution, controller execution, return value handling, and view resolution — is essential for debugging unexpected behavior, implementing custom cross-cutting concerns, and optimizing request processing performance.

## Code Examples

### Request Lifecycle and Handler Mapping

```java
// The DispatcherServlet processes requests through this pipeline:
// 1. DispatcherServlet receives HTTP request
// 2. HandlerMapping finds the matching controller method
// 3. HandlerInterceptor.preHandle() executes (can reject request)
// 4. HandlerAdapter invokes the controller method
//    - ArgumentResolvers convert request data to method parameters
//    - @Valid triggers Bean Validation
// 5. Controller method executes and returns a value
// 6. ReturnValueHandlers process the return (serialize to JSON, resolve view)
// 7. HandlerInterceptor.postHandle() executes
// 8. ViewResolver renders the response (for @Controller, not @RestController)
// 9. HandlerInterceptor.afterCompletion() executes (always, even on error)

// Custom HandlerMapping for versioned APIs
@Configuration
public class ApiVersionConfig implements WebMvcConfigurer {

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new ApiVersionInterceptor())
            .addPathPatterns("/api/**");
    }

    // Custom argument resolver for extracting authenticated user
    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(new CurrentUserArgumentResolver());
    }
}

// Custom argument resolver — injects domain objects into controller methods
public class CurrentUserArgumentResolver implements HandlerMethodArgumentResolver {

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.hasParameterAnnotation(CurrentUser.class)
            && parameter.getParameterType().equals(UserPrincipal.class);
    }

    @Override
    public Object resolveArgument(MethodParameter parameter,
                                   ModelAndViewContainer mavContainer,
                                   NativeWebRequest webRequest,
                                   WebDataBinderFactory binderFactory) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof UserPrincipal) {
            return auth.getPrincipal();
        }
        throw new UnauthorizedException("No authenticated user");
    }
}

// Usage in controller
@GetMapping("/me")
public UserProfile getCurrentUser(@CurrentUser UserPrincipal user) {
    return userService.getProfile(user.getId());
}
```

### REST Controller with Validation and Pagination

```java
@RestController
@RequestMapping("/api/v1/orders")
@RequiredArgsConstructor
@Validated
public class OrderController {

    private final OrderService orderService;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public OrderResponse createOrder(@Valid @RequestBody CreateOrderRequest request) {
        return orderService.createOrder(request);
    }

    @GetMapping("/{orderId}")
    public OrderResponse getOrder(@PathVariable UUID orderId) {
        return orderService.findById(orderId)
            .orElseThrow(() -> new OrderNotFoundException(orderId));
    }

    @GetMapping
    public Page<OrderResponse> listOrders(
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size,
            @RequestParam(required = false) OrderStatus status) {
        Pageable pageable = PageRequest.of(page, size, Sort.by("createdAt").descending());
        if (status != null) {
            return orderService.findByStatus(status, pageable);
        }
        return orderService.findAll(pageable);
    }

    @PutMapping("/{orderId}/status")
    public OrderResponse updateStatus(
            @PathVariable UUID orderId,
            @Valid @RequestBody UpdateStatusRequest request) {
        return orderService.updateStatus(orderId, request.getStatus());
    }

    @DeleteMapping("/{orderId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancelOrder(@PathVariable UUID orderId) {
        orderService.cancel(orderId);
    }
}

public record CreateOrderRequest(
    @NotNull UUID customerId,
    @NotEmpty @Size(max = 50) List<@Valid OrderItemRequest> items,
    @NotNull @Valid ShippingAddress shippingAddress
) {}

public record OrderItemRequest(
    @NotBlank String productId,
    @Min(1) @Max(999) int quantity
) {}
```

### Global Exception Handling with @ControllerAdvice

```java
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    @ExceptionHandler(OrderNotFoundException.class)
    public ProblemDetail handleNotFound(OrderNotFoundException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
            HttpStatus.NOT_FOUND, ex.getMessage());
        problem.setTitle("Order Not Found");
        problem.setType(URI.create("https://api.example.com/errors/order-not-found"));
        problem.setProperty("orderId", ex.getOrderId());
        problem.setProperty("timestamp", Instant.now());
        return problem;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
            HttpStatus.BAD_REQUEST, "Validation failed");
        problem.setTitle("Invalid Request");
        problem.setProperty("errors", ex.getBindingResult().getFieldErrors().stream()
            .map(fe -> Map.of("field", fe.getField(), "message", fe.getDefaultMessage()))
            .toList());
        return problem;
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ProblemDetail handleConstraintViolation(ConstraintViolationException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
            HttpStatus.BAD_REQUEST, "Constraint violation");
        problem.setProperty("violations", ex.getConstraintViolations().stream()
            .map(v -> Map.of("path", v.getPropertyPath().toString(),
                             "message", v.getMessage()))
            .toList());
        return problem;
    }

    @ExceptionHandler(Exception.class)
    public ProblemDetail handleGeneral(Exception ex, HttpServletRequest request) {
        log.error("Unhandled exception for {} {}", request.getMethod(),
            request.getRequestURI(), ex);
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
            HttpStatus.INTERNAL_SERVER_ERROR, "An unexpected error occurred");
        problem.setProperty("traceId", MDC.get("traceId"));
        return problem;
    }
}
```

### Interceptors and Request Lifecycle Hooks

```java
@Component
public class RequestLoggingInterceptor implements HandlerInterceptor {

    private static final String START_TIME = "startTime";
    private static final String REQUEST_ID = "requestId";

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response,
                             Object handler) {
        String requestId = Optional.ofNullable(request.getHeader("X-Request-ID"))
            .orElse(UUID.randomUUID().toString());
        request.setAttribute(START_TIME, System.nanoTime());
        request.setAttribute(REQUEST_ID, requestId);
        MDC.put("requestId", requestId);
        response.setHeader("X-Request-ID", requestId);
        return true;  // Return false to reject the request
    }

    @Override
    public void postHandle(HttpServletRequest request, HttpServletResponse response,
                           Object handler, ModelAndView modelAndView) {
        // Runs after controller but before view rendering
        // Not called if controller throws an exception
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                Object handler, Exception ex) {
        // Always runs — even if an exception occurred
        long duration = TimeUnit.NANOSECONDS.toMillis(
            System.nanoTime() - (long) request.getAttribute(START_TIME));
        log.info("Completed {} {} - status={} duration={}ms requestId={}",
            request.getMethod(), request.getRequestURI(),
            response.getStatus(), duration, request.getAttribute(REQUEST_ID));
        MDC.clear();
    }
}

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final RequestLoggingInterceptor loggingInterceptor;
    private final RateLimitInterceptor rateLimitInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(loggingInterceptor)
            .addPathPatterns("/api/**")
            .excludePathPatterns("/api/health", "/api/metrics");

        registry.addInterceptor(rateLimitInterceptor)
            .addPathPatterns("/api/**")
            .order(1);  // Lower order = higher priority
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
            .allowedOrigins("https://app.example.com")
            .allowedMethods("GET", "POST", "PUT", "DELETE")
            .allowedHeaders("*")
            .allowCredentials(true)
            .maxAge(3600);
    }

    @Override
    public void configureContentNegotiation(ContentNegotiationConfigurer configurer) {
        configurer
            .defaultContentType(MediaType.APPLICATION_JSON)
            .favorParameter(false)
            .ignoreAcceptHeader(false)
            .mediaType("json", MediaType.APPLICATION_JSON)
            .mediaType("xml", MediaType.APPLICATION_XML);
    }
}
```

### Async Request Processing

```java
@RestController
@RequestMapping("/api/v1/reports")
public class ReportController {

    private final ReportService reportService;
    private final AsyncTaskExecutor taskExecutor;

    // DeferredResult — controller returns immediately, result set later
    @GetMapping("/{id}/generate")
    public DeferredResult<ResponseEntity<ReportDTO>> generateReport(@PathVariable UUID id) {
        DeferredResult<ResponseEntity<ReportDTO>> deferredResult =
            new DeferredResult<>(30000L);  // 30 second timeout

        deferredResult.onTimeout(() ->
            deferredResult.setErrorResult(ResponseEntity.status(HttpStatus.REQUEST_TIMEOUT)
                .body(null)));

        taskExecutor.execute(() -> {
            try {
                ReportDTO report = reportService.generate(id);
                deferredResult.setResult(ResponseEntity.ok(report));
            } catch (Exception e) {
                deferredResult.setErrorResult(
                    ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build());
            }
        });

        return deferredResult;
    }

    // StreamingResponseBody — stream large responses without buffering
    @GetMapping("/{id}/download")
    public ResponseEntity<StreamingResponseBody> downloadReport(@PathVariable UUID id) {
        StreamingResponseBody stream = outputStream -> {
            reportService.streamReport(id, outputStream);
            outputStream.flush();
        };

        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_OCTET_STREAM)
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=report.csv")
            .body(stream);
    }

    // Server-Sent Events for real-time progress updates
    @GetMapping(value = "/{id}/progress", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter trackProgress(@PathVariable UUID id) {
        SseEmitter emitter = new SseEmitter(60000L);  // 60 second timeout

        reportService.generateWithProgress(id, progress -> {
            try {
                emitter.send(SseEmitter.event()
                    .name("progress")
                    .data(Map.of("percent", progress.getPercent(),
                                 "stage", progress.getStage())));
                if (progress.isComplete()) {
                    emitter.complete();
                }
            } catch (IOException e) {
                emitter.completeWithError(e);
            }
        });

        return emitter;
    }
}
```

### Content Negotiation and View Resolution

```java
// Custom HttpMessageConverter for CSV export
@Configuration
public class MessageConverterConfig implements WebMvcConfigurer {

    @Override
    public void extendMessageConverters(List<HttpMessageConverter<?>> converters) {
        converters.add(new CsvHttpMessageConverter());
    }
}

public class CsvHttpMessageConverter extends AbstractHttpMessageConverter<List<?>> {

    public CsvHttpMessageConverter() {
        super(new MediaType("text", "csv"));
    }

    @Override
    protected boolean supports(Class<?> clazz) {
        return List.class.isAssignableFrom(clazz);
    }

    @Override
    protected void writeInternal(List<?> objects, HttpOutputMessage outputMessage)
            throws IOException {
        try (OutputStreamWriter writer = new OutputStreamWriter(
                outputMessage.getBody(), StandardCharsets.UTF_8)) {
            // Write CSV header and rows
            for (Object obj : objects) {
                writer.write(toCsvRow(obj));
                writer.write("\n");
            }
        }
    }

    @Override
    protected List<?> readInternal(Class<? extends List<?>> clazz,
                                    HttpInputMessage inputMessage) {
        throw new UnsupportedOperationException("CSV reading not supported");
    }
}

// Controller supporting multiple response formats
@GetMapping(value = "/export",
    produces = {MediaType.APPLICATION_JSON_VALUE, "text/csv", MediaType.APPLICATION_XML_VALUE})
public List<OrderDTO> exportOrders(@RequestParam(required = false) OrderStatus status) {
    return orderService.findForExport(status);
}
```

### Declarative HTTP Client with @HttpExchange (Spring 6)

```java
@HttpExchange(url = "/api/v1/inventory", accept = "application/json")
public interface InventoryClient {

    @GetExchange("/{sku}")
    InventoryResponse checkStock(@PathVariable String sku);

    @PostExchange("/reserve")
    ReservationResponse reserve(@RequestBody ReservationRequest request);

    @GetExchange("/bulk")
    List<InventoryResponse> checkBulkStock(@RequestParam List<String> skus);
}

@Configuration
public class HttpClientConfig {

    @Bean
    public InventoryClient inventoryClient(RestClient.Builder builder) {
        RestClient restClient = builder
            .baseUrl("http://inventory-service:8080")
            .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
            .requestInterceptor(new BearerTokenInterceptor())
            .build();

        return HttpServiceProxyFactory
            .builderFor(RestClientAdapter.create(restClient))
            .build()
            .createClient(InventoryClient.class);
    }
}
```

## Common Pitfalls

1. **Returning entities directly from controllers**: Exposing JPA entities as API responses couples your database schema to your API contract. Any schema change (adding a column, renaming a field) becomes a breaking API change. Always use dedicated response DTOs that represent your API contract independently of your persistence model. This also prevents lazy loading exceptions when Jackson serializes uninitialized proxy collections outside a transaction context.

2. **Missing validation on path variables and request parameters**: While `@Valid` on `@RequestBody` triggers bean validation, path variables and request parameters require `@Validated` at the class level and constraint annotations directly on the parameters. Without class-level `@Validated`, annotations like `@Min`, `@Max`, and `@Pattern` on `@PathVariable` and `@RequestParam` are silently ignored, allowing invalid input to reach your service layer.

3. **Blocking operations in controller methods**: Spring MVC uses a thread-per-request model with a limited thread pool (default 200 threads in Tomcat). If controller methods perform long-running blocking operations (calling slow external APIs, large file processing), the thread pool becomes exhausted and the server stops accepting new requests. Use `DeferredResult`, `StreamingResponseBody`, or `@Async` with a dedicated executor for long-running operations. With Spring Boot 3.2+, enable virtual threads to eliminate this concern entirely.

4. **Inconsistent error response format**: Without a global `@ControllerAdvice`, different exceptions produce different response formats (Spring's default error format, raw exception messages, or HTML error pages). Clients cannot reliably parse error responses. Implement a comprehensive `@RestControllerAdvice` that catches all exception types and returns a consistent error response structure. Use RFC 7807 `ProblemDetail` in Spring 6 for industry-standard error responses.

5. **Not setting appropriate HTTP status codes**: Returning 200 OK for every response (including errors) violates REST semantics and breaks client-side error handling. Use `@ResponseStatus` annotations, `ResponseEntity` builders, or exception handler mappings to return semantically correct status codes: 201 for creation, 204 for deletion, 400 for validation errors, 404 for missing resources, 409 for conflicts, and 500 for unexpected server errors.

6. **Thread pool exhaustion with virtual threads disabled**: The default Tomcat thread pool (200 threads) can be exhausted when controllers make blocking calls to slow external services. With virtual threads disabled, each blocked request holds a platform thread. Enable virtual threads (`spring.threads.virtual.enabled=true` in Boot 3.2+) or use `@Async` with a dedicated executor for long-running operations. Monitor `tomcat.threads.busy` metric to detect saturation before it causes request rejections.

7. **Interceptor ordering issues**: When multiple interceptors are registered, their execution order matters. `preHandle` methods execute in registration order, but `afterCompletion` executes in reverse order. If a security interceptor runs after a logging interceptor, the logging interceptor may log requests that are subsequently rejected. Use `order()` on the interceptor registration to control execution sequence explicitly.

8. **CORS preflight failures with Spring Security**: When Spring Security is active, CORS preflight OPTIONS requests are rejected unless explicitly allowed. Configure CORS in the security filter chain using `.cors(cors -> cors.configurationSource(...))` rather than relying solely on `@CrossOrigin` annotations or `WebMvcConfigurer.addCorsMappings()`, which are processed after security filters.

## Real-World Use Cases

- **API versioning strategies**: Large organizations maintain multiple API versions simultaneously using URL path versioning (`/api/v1/`, `/api/v2/`), header-based versioning (`Accept: application/vnd.company.v2+json`), or parameter-based versioning. Spring MVC supports all approaches through request mapping attributes, custom `RequestCondition` implementations, and content negotiation configuration.

- **File upload and download services**: Document management systems use Spring MVC's `MultipartFile` handling for uploads with size limits, content type validation, and virus scanning integration. Download endpoints use `StreamingResponseBody` to stream large files without loading them entirely into memory, supporting range requests for resumable downloads and Content-Disposition headers for browser download prompts.

- **Backend-for-Frontend (BFF) pattern**: Mobile and web applications often need different API shapes. Spring MVC controllers serve as BFF layers that aggregate data from multiple microservices, transform responses for specific client needs, and handle client-specific concerns like pagination formats and field filtering.

- **Webhook receivers and event ingestion**: SaaS integrations receive webhook callbacks from external services (Stripe payment events, GitHub push notifications, Slack interactions). Spring MVC controllers validate webhook signatures, parse provider-specific payloads, and dispatch events to internal processing queues. Idempotency handling through request ID tracking prevents duplicate processing when providers retry failed deliveries.

- **Server-Sent Events for real-time updates**: Dashboard applications use `SseEmitter` to push real-time updates to browsers without WebSocket complexity. Order tracking pages, deployment progress indicators, and live metric dashboards stream updates through SSE endpoints that maintain long-lived HTTP connections.

- **Health check and monitoring endpoints**: Spring Boot Actuator builds on Spring MVC to expose health checks, metrics, and management endpoints. Custom health indicators check database connectivity, external service availability, and disk space. Kubernetes liveness and readiness probes hit these endpoints to determine pod health and traffic routing decisions.

## Interview Questions

**Q: How does Spring MVC process an incoming HTTP request?**

A: The `DispatcherServlet` receives all requests and delegates to handler mappings to find the appropriate controller method. The handler mapping matches the request URL, HTTP method, headers, and parameters against `@RequestMapping` annotations. Once matched, handler adapters invoke the controller method, resolving method parameters through argument resolvers (converting path variables, request bodies, headers into Java objects). The return value is processed by return value handlers (converting objects to JSON via Jackson, resolving view names, or writing directly to the response). Exception resolvers handle any thrown exceptions, and view resolvers render the final response. Interceptors execute at pre-handle, post-handle, and after-completion phases.

**Q: What is the difference between `@Controller` and `@RestController`?**

A: `@Controller` is a stereotype annotation that marks a class as a Spring MVC controller. Methods return view names (strings) that are resolved by ViewResolvers to render HTML templates. `@RestController` is a convenience annotation combining `@Controller` and `@ResponseBody`, meaning every method's return value is serialized directly to the HTTP response body (typically as JSON) rather than being interpreted as a view name. Use `@Controller` for server-side rendered HTML applications and `@RestController` for REST APIs.

**Q: How do you implement async request processing in Spring MVC?**

A: Spring MVC supports several async patterns. `Callable<T>` offloads processing to a task executor while releasing the servlet thread. `DeferredResult<T>` allows setting the result from any thread at any time (useful for event-driven architectures). `StreamingResponseBody` streams large responses without buffering the entire content in memory. `SseEmitter` enables Server-Sent Events for real-time push notifications. `ResponseBodyEmitter` allows sending multiple objects in a single response. All async patterns release the servlet container thread during processing, preventing thread pool exhaustion for long-running operations.

**Q: Explain content negotiation in Spring MVC.**

A: Content negotiation determines the response format based on client preferences. Spring MVC supports three strategies: Accept header (client sends `Accept: application/json` or `Accept: application/xml`), URL path extension (deprecated), and request parameter (`?format=json`). The framework uses `HttpMessageConverter` implementations to serialize response objects. Jackson's `MappingJackson2HttpMessageConverter` handles JSON, JAXB handles XML. Configure via `WebMvcConfigurer.configureContentNegotiation()` to set default content type and enable/disable strategies. Custom converters can be added for formats like CSV, Protocol Buffers, or MessagePack.

**Q: What is ProblemDetail (RFC 7807) and how does Spring 6 support it?**

A: RFC 7807 defines a standard JSON format for HTTP API error responses with fields: `type` (URI identifying the error), `title` (human-readable summary), `status` (HTTP status code), `detail` (specific explanation), and `instance` (URI of the specific occurrence). Spring 6 provides `ProblemDetail` class and `ErrorResponse` interface as first-class citizens. `@ExceptionHandler` methods can return `ProblemDetail` directly. Enable globally with `spring.mvc.problemdetails.enabled=true` to automatically convert standard Spring exceptions to RFC 7807 format. This replaces ad-hoc error response DTOs with an industry-standard format that clients can parse consistently.

**Q: How do `@HttpExchange` interfaces compare to OpenFeign for service-to-service communication?**

A: `@HttpExchange` is Spring 6's native declarative HTTP client, replacing the need for the third-party OpenFeign library. It uses `RestClient` (synchronous) or `WebClient` (reactive) as the underlying transport. Advantages over Feign: no additional dependency, native Spring integration with interceptors and error handlers, support for both blocking and reactive paradigms, and compatibility with GraalVM native images without extra configuration. Feign still offers more built-in features like request compression and Hystrix integration, but `@HttpExchange` is the recommended approach for new Spring 6 / Boot 3 projects.

**Q: What is the difference between a Filter and a HandlerInterceptor?**

A: Servlet Filters operate at the servlet container level, before the request reaches Spring's `DispatcherServlet`. They have access to raw `ServletRequest`/`ServletResponse` but not to Spring MVC abstractions like handler methods or model attributes. `HandlerInterceptor` operates within Spring MVC, after handler mapping but before/after controller execution. Interceptors have access to the handler method, can inspect annotations, and integrate with Spring's `ModelAndView`. Use Filters for low-level concerns (encoding, compression, security) and Interceptors for application-level concerns (logging, authorization checks, request timing). Spring Security uses Filters; request logging typically uses Interceptors.

**Q: How do you handle file uploads in Spring MVC?**

A: Configure `MultipartResolver` (auto-configured in Spring Boot) with size limits via `spring.servlet.multipart.max-file-size` and `spring.servlet.multipart.max-request-size`. Controller methods accept `@RequestParam MultipartFile file` parameters. Validate content type, file size, and filename before processing. For large files, use streaming with `file.getInputStream()` rather than `file.getBytes()` to avoid loading the entire file into memory. Return appropriate error responses for size limit violations caught by `MaxUploadSizeExceededException`.

## Production Tips

- **Response compression**: Enable gzip compression for JSON APIs with `server.compression.enabled=true` and `server.compression.mime-types=application/json,text/html`. This typically reduces response sizes by 60-80% for JSON payloads, significantly reducing bandwidth costs and improving client-perceived latency. Set `server.compression.min-response-size=1024` to avoid compressing tiny responses where the overhead exceeds the benefit.

- **Request timeout configuration**: Set `spring.mvc.async.request-timeout` for async requests and configure Tomcat's `server.tomcat.connection-timeout` for connection establishment. For individual endpoint timeouts, use `DeferredResult` with a timeout callback or wrap service calls with `CompletableFuture.orTimeout()`. Always return a meaningful error response on timeout rather than letting the connection hang until the client gives up.

- **API rate limiting**: Implement rate limiting at the controller level using Spring MVC interceptors with token bucket or sliding window algorithms. Store rate limit state in Redis for distributed deployments. Return `429 Too Many Requests` with `Retry-After` header when limits are exceeded. Consider different rate limits per API key tier and endpoint sensitivity.

- **Observability with Micrometer HTTP metrics**: Spring Boot 3 auto-instruments all MVC endpoints with Micrometer, recording `http.server.requests` timer with tags for method, URI, status, and outcome. Use `@Observed` annotation for custom spans within controller methods. The URI tag uses templated paths (`/api/orders/{id}`) to prevent high-cardinality metric explosion. Alert on p99 latency exceeding SLA thresholds and on 5xx error rate spikes.

- **Kubernetes readiness integration**: Configure readiness probes to check downstream dependencies before accepting traffic. Use `HealthIndicator` beans to verify database connectivity, cache availability, and critical service reachability. Set `management.endpoint.health.group.readiness.include=db,redis,custom` to compose readiness from multiple indicators. This prevents traffic routing to pods that started but cannot serve requests due to missing dependencies.

- **Request body size limits**: Configure `server.tomcat.max-http-form-post-size` and `spring.servlet.multipart.max-request-size` to prevent denial-of-service attacks via oversized request bodies. For JSON APIs, configure Jackson's `StreamReadConstraints` to limit string length, number length, and nesting depth. Return 413 Payload Too Large with a clear error message when limits are exceeded.

## Related Topics

- [Core Container and Dependency Injection](./core-container.md) — Controllers are beans managed by the IoC container
- [Spring Security](./spring-security.md) — Security filter chain executes before controller methods
- [Spring Data and Persistence](./spring-data.md) — Controllers delegate to services that use Spring Data repositories
- [Spring REST](./spring-rest.md) — REST-specific patterns including HATEOAS, versioning, and client libraries
