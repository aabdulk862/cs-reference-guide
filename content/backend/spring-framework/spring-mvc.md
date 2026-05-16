# Spring MVC and REST APIs

## Quick Reference

- Spring MVC implements the Model-View-Controller pattern with a `DispatcherServlet` front controller
- `@RestController` combines `@Controller` and `@ResponseBody` for JSON/XML API endpoints
- Request mapping: `@GetMapping`, `@PostMapping`, `@PutMapping`, `@DeleteMapping`, `@PatchMapping`
- Parameter binding: `@PathVariable`, `@RequestParam`, `@RequestBody`, `@RequestHeader`
- Validation: `@Valid` or `@Validated` with Jakarta Bean Validation annotations triggers automatic validation
- Exception handling: `@ExceptionHandler` methods, `@ControllerAdvice` for global error handling
- Content negotiation: automatic JSON (Jackson) and XML (JAXB) serialization based on Accept header
- `ResponseEntity<T>` provides full control over status code, headers, and response body

## When to Use

Spring MVC is the standard choice for building HTTP APIs in the Java ecosystem, from simple CRUD endpoints to complex enterprise integrations. Use Spring MVC when building RESTful services that follow standard HTTP semantics, when you need robust request validation and error handling, when integrating with Spring Security for authentication and authorization at the endpoint level, and when your team values the extensive tooling support including MockMvc for integration testing. Spring MVC's synchronous, thread-per-request model is appropriate for most business applications where request processing involves database queries, external service calls, and business logic that benefits from straightforward sequential code. For high-concurrency scenarios with many simultaneous connections (WebSocket servers, streaming APIs, proxy services), consider Spring WebFlux as an alternative. The framework's annotation-driven approach minimizes boilerplate while providing full control over HTTP semantics, making it suitable for both rapid prototyping and production-grade API development.

## Code Examples

### REST Controller with Validation

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

// Request DTO with validation
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

### Global Exception Handling

```java
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    @ExceptionHandler(OrderNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public ErrorResponse handleNotFound(OrderNotFoundException ex) {
        return new ErrorResponse(
            "ORDER_NOT_FOUND",
            "Order not found: " + ex.getOrderId(),
            Instant.now()
        );
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ValidationErrorResponse handleValidation(MethodArgumentNotValidException ex) {
        List<FieldError> errors = ex.getBindingResult().getFieldErrors().stream()
            .map(fe -> new FieldError(fe.getField(), fe.getDefaultMessage()))
            .toList();
        return new ValidationErrorResponse("VALIDATION_FAILED", errors, Instant.now());
    }

    @ExceptionHandler(ConstraintViolationException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ErrorResponse handleConstraintViolation(ConstraintViolationException ex) {
        String message = ex.getConstraintViolations().stream()
            .map(v -> v.getPropertyPath() + ": " + v.getMessage())
            .collect(Collectors.joining(", "));
        return new ErrorResponse("CONSTRAINT_VIOLATION", message, Instant.now());
    }

    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ErrorResponse handleGeneral(Exception ex, HttpServletRequest request) {
        log.error("Unhandled exception for {} {}", request.getMethod(),
            request.getRequestURI(), ex);
        return new ErrorResponse(
            "INTERNAL_ERROR",
            "An unexpected error occurred",
            Instant.now()
        );
    }
}

public record ErrorResponse(String code, String message, Instant timestamp) {}
public record ValidationErrorResponse(String code, List<FieldError> errors, Instant timestamp) {}
public record FieldError(String field, String message) {}
```

### Request Interceptors and Filters

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
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                Object handler, Exception ex) {
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

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(loggingInterceptor)
            .addPathPatterns("/api/**")
            .excludePathPatterns("/api/health", "/api/metrics");
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
}
```

## Common Pitfalls

1. **Returning entities directly from controllers**: Exposing JPA entities as API responses couples your database schema to your API contract. Any schema change (adding a column, renaming a field) becomes a breaking API change. Always use dedicated response DTOs (Data Transfer Objects) that represent your API contract independently of your persistence model. This also prevents lazy loading exceptions when Jackson serializes uninitialized proxy collections outside a transaction context.

2. **Missing validation on path variables and request parameters**: While `@Valid` on `@RequestBody` triggers bean validation, path variables and request parameters require `@Validated` at the class level and constraint annotations directly on the parameters. Without class-level `@Validated`, annotations like `@Min`, `@Max`, and `@Pattern` on `@PathVariable` and `@RequestParam` are silently ignored, allowing invalid input to reach your service layer.

3. **Blocking operations in controller methods**: Spring MVC uses a thread-per-request model with a limited thread pool (default 200 threads in Tomcat). If controller methods perform long-running blocking operations (calling slow external APIs, large file processing), the thread pool becomes exhausted and the server stops accepting new requests. Use `@Async` with a dedicated executor for background tasks, or return `DeferredResult`/`Callable` for long-polling scenarios.

4. **Inconsistent error response format**: Without a global `@ControllerAdvice`, different exceptions produce different response formats (Spring's default error format, raw exception messages, or HTML error pages). Clients cannot reliably parse error responses. Implement a comprehensive `@RestControllerAdvice` that catches all exception types and returns a consistent error response structure with error codes, human-readable messages, and timestamps.

5. **Not setting appropriate HTTP status codes**: Returning 200 OK for every response (including errors) violates REST semantics and breaks client-side error handling. Use `@ResponseStatus` annotations, `ResponseEntity` builders, or exception handler mappings to return semantically correct status codes: 201 for creation, 204 for deletion, 400 for validation errors, 404 for missing resources, 409 for conflicts, and 500 for unexpected server errors.

## Real-World Use Cases

- **API versioning strategies**: Large organizations maintain multiple API versions simultaneously using URL path versioning (`/api/v1/`, `/api/v2/`), header-based versioning (`Accept: application/vnd.company.v2+json`), or parameter-based versioning. Spring MVC supports all approaches through request mapping attributes, custom `RequestCondition` implementations, and content negotiation configuration. Teams at companies like Stripe and Twilio use Spring MVC to serve millions of API requests across multiple versions with backward compatibility guarantees.

- **File upload and download services**: Document management systems use Spring MVC's `MultipartFile` handling for uploads with size limits, content type validation, and virus scanning integration. Download endpoints use `StreamingResponseBody` to stream large files without loading them entirely into memory, supporting range requests for resumable downloads and Content-Disposition headers for browser download prompts.

- **Backend-for-Frontend (BFF) pattern**: Mobile and web applications often need different API shapes. Spring MVC controllers serve as BFF layers that aggregate data from multiple microservices, transform responses for specific client needs, and handle client-specific concerns like pagination formats and field filtering. Each BFF controller composes calls to domain services and returns client-optimized response structures.

- **Webhook receivers and event ingestion**: SaaS integrations receive webhook callbacks from external services (Stripe payment events, GitHub push notifications, Slack interactions). Spring MVC controllers validate webhook signatures, parse provider-specific payloads, and dispatch events to internal processing queues. Idempotency handling through request ID tracking prevents duplicate processing when providers retry failed deliveries.

- **Health check and monitoring endpoints**: Spring Boot Actuator builds on Spring MVC to expose health checks (`/actuator/health`), metrics (`/actuator/metrics`), and management endpoints. Custom health indicators check database connectivity, external service availability, and disk space. Kubernetes liveness and readiness probes hit these endpoints to determine pod health and traffic routing decisions.

## Interview Questions

**Q: How does Spring MVC process an incoming HTTP request?**

A: The `DispatcherServlet` receives all requests and delegates to handler mappings to find the appropriate controller method. The handler mapping matches the request URL, HTTP method, headers, and parameters against `@RequestMapping` annotations. Once matched, handler adapters invoke the controller method, resolving method parameters through argument resolvers (converting path variables, request bodies, headers into Java objects). The return value is processed by return value handlers (converting objects to JSON via Jackson, resolving view names, or writing directly to the response). Exception resolvers handle any thrown exceptions, and view resolvers render the final response.

**Q: What is the difference between `@Controller` and `@RestController`?**

A: `@Controller` is a stereotype annotation that marks a class as a Spring MVC controller. Methods return view names (strings) that are resolved by ViewResolvers to render HTML templates. `@RestController` is a convenience annotation combining `@Controller` and `@ResponseBody`, meaning every method's return value is serialized directly to the HTTP response body (typically as JSON) rather than being interpreted as a view name. Use `@Controller` for server-side rendered HTML applications and `@RestController` for REST APIs.

**Q: How do you handle file uploads in Spring MVC?**

A: Configure `MultipartResolver` (auto-configured in Spring Boot) with size limits via `spring.servlet.multipart.max-file-size` and `spring.servlet.multipart.max-request-size`. Controller methods accept `@RequestParam MultipartFile file` parameters. Validate content type, file size, and filename before processing. For large files, use streaming with `file.getInputStream()` rather than `file.getBytes()` to avoid loading the entire file into memory. Return appropriate error responses for size limit violations caught by `MaxUploadSizeExceededException`.

**Q: Explain content negotiation in Spring MVC.**

A: Content negotiation determines the response format based on client preferences. Spring MVC supports three strategies: Accept header (client sends `Accept: application/json` or `Accept: application/xml`), URL path extension (deprecated), and request parameter (`?format=json`). The framework uses `HttpMessageConverter` implementations to serialize response objects. Jackson's `MappingJackson2HttpMessageConverter` handles JSON, JAXB handles XML. Configure via `WebMvcConfigurer.configureContentNegotiation()` to set default content type and enable/disable strategies.

## Production Tips

- **Response compression**: Enable gzip compression for JSON APIs with `server.compression.enabled=true` and `server.compression.mime-types=application/json,text/html`. This typically reduces response sizes by 60-80% for JSON payloads, significantly reducing bandwidth costs and improving client-perceived latency. Set `server.compression.min-response-size=1024` to avoid compressing tiny responses where the overhead exceeds the benefit.

- **Request timeout configuration**: Set `spring.mvc.async.request-timeout` for async requests and configure Tomcat's `server.tomcat.connection-timeout` for connection establishment. For individual endpoint timeouts, use `DeferredResult` with a timeout callback or wrap service calls with `CompletableFuture.orTimeout()`. Always return a meaningful error response on timeout rather than letting the connection hang until the client gives up.

- **API rate limiting**: Implement rate limiting at the controller level using Spring MVC interceptors with token bucket or sliding window algorithms. Store rate limit state in Redis for distributed deployments. Return `429 Too Many Requests` with `Retry-After` header when limits are exceeded. Consider different rate limits per API key tier and endpoint sensitivity.

## Related Topics

- [Core Container and Dependency Injection](./core-container.md) — Controllers are beans managed by the IoC container
- [Spring Security](./spring-security.md) — Security filter chain executes before controller methods
- [Spring Data and Persistence](./spring-data.md) — Controllers delegate to services that use Spring Data repositories
