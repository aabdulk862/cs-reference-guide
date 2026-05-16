# Spring Security

## Quick Reference

- Spring Security is a powerful authentication and authorization framework for Java applications built on servlet filters
- The security filter chain processes every HTTP request through an ordered list of security filters before reaching the controller
- Authentication verifies identity (who you are); authorization verifies permissions (what you can do)
- Supports multiple authentication mechanisms: form login, HTTP Basic, OAuth2, JWT, SAML, LDAP, and custom providers
- `SecurityContext` holds the authenticated principal and is stored in `ThreadLocal` via `SecurityContextHolder`
- Method-level security with `@PreAuthorize`, `@PostAuthorize`, `@Secured`, and `@RolesAllowed` annotations
- CSRF protection enabled by default for stateful applications; typically disabled for stateless REST APIs
- Password encoding with `BCryptPasswordEncoder` (recommended), `Argon2PasswordEncoder`, or `SCryptPasswordEncoder`

## When to Use

Spring Security is essential for any Spring-based application that requires authentication, authorization, or protection against common security exploits. Use Spring Security when building REST APIs that need JWT or OAuth2 token validation, web applications requiring form-based login with session management, microservices needing service-to-service authentication, or applications integrating with enterprise identity providers via SAML or LDAP. Spring Security provides comprehensive protection against CSRF, session fixation, clickjacking, and other web vulnerabilities out of the box. It integrates seamlessly with Spring Boot auto-configuration, requiring minimal setup for common scenarios while offering deep customization for complex enterprise requirements. The framework's filter-based architecture allows you to intercept and modify security behavior at any point in the request processing pipeline, making it suitable for implementing custom authentication schemes, multi-tenancy security, and fine-grained access control policies that go beyond simple role-based checks.

## Code Examples

### Security Filter Chain Configuration

```java
@Configuration
@EnableWebSecurity
@EnableMethodSecurity(prePostEnabled = true)
public class SecurityConfig {

    @Bean
    public SecurityFilterChain apiFilterChain(HttpSecurity http) throws Exception {
        return http
            .securityMatcher("/api/**")
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/public/**").permitAll()
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.GET, "/api/products/**").hasAuthority("PRODUCT_READ")
                .requestMatchers(HttpMethod.POST, "/api/products/**").hasAuthority("PRODUCT_WRITE")
                .anyRequest().authenticated())
            .oauth2ResourceServer(oauth2 -> oauth2
                .jwt(jwt -> jwt
                    .jwtAuthenticationConverter(jwtAuthenticationConverter())))
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint(new CustomAuthenticationEntryPoint())
                .accessDeniedHandler(new CustomAccessDeniedHandler()))
            .build();
    }

    @Bean
    public SecurityFilterChain webFilterChain(HttpSecurity http) throws Exception {
        return http
            .securityMatcher("/**")
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/login", "/register", "/css/**", "/js/**").permitAll()
                .anyRequest().authenticated())
            .formLogin(form -> form
                .loginPage("/login")
                .defaultSuccessUrl("/dashboard")
                .failureUrl("/login?error=true"))
            .logout(logout -> logout
                .logoutSuccessUrl("/login?logout=true")
                .invalidateHttpSession(true)
                .deleteCookies("JSESSIONID"))
            .rememberMe(remember -> remember
                .tokenValiditySeconds(86400)
                .key("uniqueAndSecretKey"))
            .build();
    }

    @Bean
    public JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtGrantedAuthoritiesConverter grantedAuthoritiesConverter =
            new JwtGrantedAuthoritiesConverter();
        grantedAuthoritiesConverter.setAuthoritiesClaimName("permissions");
        grantedAuthoritiesConverter.setAuthorityPrefix("");

        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(grantedAuthoritiesConverter);
        return converter;
    }
}
```

### Custom Authentication Provider

```java
@Component
@RequiredArgsConstructor
public class CustomAuthenticationProvider implements AuthenticationProvider {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final MfaService mfaService;

    @Override
    public Authentication authenticate(Authentication authentication)
            throws AuthenticationException {
        String username = authentication.getName();
        String password = authentication.getCredentials().toString();
        String mfaCode = ((CustomAuthenticationToken) authentication).getMfaCode();

        User user = userRepository.findByUsername(username)
            .orElseThrow(() -> new BadCredentialsException("Invalid credentials"));

        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            throw new BadCredentialsException("Invalid credentials");
        }

        if (user.isMfaEnabled() && !mfaService.verifyCode(user, mfaCode)) {
            throw new BadCredentialsException("Invalid MFA code");
        }

        if (!user.isEnabled()) {
            throw new DisabledException("Account is disabled");
        }

        if (user.isAccountLocked()) {
            throw new LockedException("Account is locked");
        }

        List<GrantedAuthority> authorities = user.getRoles().stream()
            .flatMap(role -> role.getPermissions().stream())
            .map(permission -> new SimpleGrantedAuthority(permission.getName()))
            .collect(Collectors.toList());

        return new UsernamePasswordAuthenticationToken(user, null, authorities);
    }

    @Override
    public boolean supports(Class<?> authentication) {
        return CustomAuthenticationToken.class.isAssignableFrom(authentication);
    }
}

@Service
@RequiredArgsConstructor
public class UserDetailsServiceImpl implements UserDetailsService {

    private final UserRepository userRepository;

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        User user = userRepository.findByUsername(username)
            .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username));

        return org.springframework.security.core.userdetails.User.builder()
            .username(user.getUsername())
            .password(user.getPasswordHash())
            .authorities(user.getAuthorities())
            .accountLocked(user.isAccountLocked())
            .disabled(!user.isEnabled())
            .build();
    }
}
```

### JWT Token Generation and Validation

```java
@Service
@RequiredArgsConstructor
public class JwtTokenService {

    private final JwtProperties jwtProperties;

    public String generateAccessToken(UserDetails userDetails) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("permissions", userDetails.getAuthorities().stream()
            .map(GrantedAuthority::getAuthority)
            .collect(Collectors.toList()));
        claims.put("type", "access");

        return Jwts.builder()
            .setClaims(claims)
            .setSubject(userDetails.getUsername())
            .setIssuedAt(new Date())
            .setExpiration(new Date(System.currentTimeMillis() +
                jwtProperties.getAccessTokenExpiration()))
            .signWith(getSigningKey(), SignatureAlgorithm.HS512)
            .compact();
    }

    public String generateRefreshToken(UserDetails userDetails) {
        return Jwts.builder()
            .setSubject(userDetails.getUsername())
            .claim("type", "refresh")
            .setIssuedAt(new Date())
            .setExpiration(new Date(System.currentTimeMillis() +
                jwtProperties.getRefreshTokenExpiration()))
            .signWith(getSigningKey(), SignatureAlgorithm.HS512)
            .compact();
    }

    public boolean validateToken(String token) {
        try {
            Jwts.parserBuilder()
                .setSigningKey(getSigningKey())
                .build()
                .parseClaimsJws(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }

    private Key getSigningKey() {
        byte[] keyBytes = Decoders.BASE64.decode(jwtProperties.getSecret());
        return Keys.hmacShaKeyFor(keyBytes);
    }
}
```

### Method-Level Security

```java
@Service
@RequiredArgsConstructor
public class DocumentService {

    private final DocumentRepository documentRepository;

    @PreAuthorize("hasAuthority('DOCUMENT_CREATE')")
    public Document createDocument(CreateDocumentRequest request) {
        Document doc = Document.from(request);
        doc.setOwnerId(getCurrentUserId());
        return documentRepository.save(doc);
    }

    @PreAuthorize("hasAuthority('DOCUMENT_READ') and @documentSecurity.canAccess(#id)")
    public Document getDocument(UUID id) {
        return documentRepository.findById(id)
            .orElseThrow(() -> new DocumentNotFoundException(id));
    }

    @PostAuthorize("returnObject.ownerId == authentication.principal.id or hasRole('ADMIN')")
    public Document getDocumentWithOwnerCheck(UUID id) {
        return documentRepository.findById(id)
            .orElseThrow(() -> new DocumentNotFoundException(id));
    }

    @PreAuthorize("#document.ownerId == authentication.principal.id or hasRole('ADMIN')")
    public void deleteDocument(Document document) {
        documentRepository.delete(document);
    }
}

@Component("documentSecurity")
@RequiredArgsConstructor
public class DocumentSecurityEvaluator {

    private final DocumentRepository documentRepository;
    private final TeamMembershipService teamService;

    public boolean canAccess(UUID documentId) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String userId = ((CustomUserDetails) auth.getPrincipal()).getId();

        Document doc = documentRepository.findById(documentId).orElse(null);
        if (doc == null) return false;

        return doc.getOwnerId().equals(userId)
            || doc.getSharedWith().contains(userId)
            || teamService.isTeamMember(doc.getTeamId(), userId);
    }
}
```

## Common Pitfalls

- **Self-invocation bypasses security proxies**: Calling a `@PreAuthorize`-annotated method from within the same class bypasses the security proxy, so the authorization check never executes. Extract secured methods to a separate bean or use `AopContext.currentProxy()` to invoke through the proxy. This is the same proxy limitation that affects `@Transactional` and `@Cacheable`.

- **Order of filter chain matchers matters**: Spring Security evaluates `SecurityFilterChain` beans in order. If a permissive chain matches before a restrictive one, requests bypass intended security. Use `@Order` annotations or define more specific `securityMatcher` patterns on restrictive chains first. The first matching chain wins.

- **CORS misconfiguration with security**: When Spring Security is active, CORS preflight OPTIONS requests are rejected unless explicitly allowed. Configure CORS in the security filter chain using `.cors(cors -> cors.configurationSource(...))` rather than relying solely on `@CrossOrigin` annotations, which are processed after security filters.

- **Storing plain-text passwords**: Never store passwords without hashing. Always use `PasswordEncoder` (BCrypt with strength 10-12 is the standard). Migrating from legacy hashing requires `DelegatingPasswordEncoder` which detects the encoding scheme from a prefix like `{bcrypt}` or `{sha256}` and delegates to the appropriate encoder.

- **Overly permissive token expiration**: Setting JWT access tokens with long expiration (hours or days) means compromised tokens remain valid for extended periods with no way to revoke them. Use short-lived access tokens (5-15 minutes) with refresh tokens for session continuity. Implement a token blacklist or use opaque tokens with server-side validation for immediate revocation capability.

- **Ignoring security context propagation in async code**: `SecurityContext` is stored in `ThreadLocal` and is not automatically propagated to new threads. When using `@Async`, `CompletableFuture`, or reactive streams, configure `DelegatingSecurityContextExecutorService` or `SecurityContextDelegatingExecutor` to propagate the security context to child threads.

## Real-World Use Cases

- **Multi-tenant SaaS authorization**: Enterprise SaaS platforms use Spring Security with custom `PermissionEvaluator` implementations to enforce tenant isolation. Each request is validated against the tenant context extracted from the JWT, ensuring users can only access resources belonging to their organization. Row-level security is enforced through Hibernate filters that automatically append tenant predicates to all queries, with Spring Security providing the tenant context from the authenticated principal.

- **OAuth2 resource server for microservices**: In microservice architectures, each service acts as an OAuth2 resource server validating JWT tokens issued by a central authorization server (Keycloak, Auth0, or Okta). Spring Security's `oauth2ResourceServer` configuration handles token validation, claim extraction, and authority mapping with minimal code. Services communicate using machine-to-machine tokens obtained through the client credentials grant, with Spring Security's `OAuth2AuthorizedClientManager` handling token acquisition and refresh automatically.

- **API rate limiting and abuse prevention**: Spring Security filters are extended with custom filters that implement rate limiting per API key or user principal. A `OncePerRequestFilter` checks Redis-backed counters before allowing requests through, returning 429 responses when limits are exceeded. This integrates naturally with the security filter chain, applying rate limits after authentication but before authorization.

- **Graduated authentication for sensitive operations**: Banking applications implement step-up authentication where viewing account balances requires standard authentication, but initiating transfers requires re-authentication or MFA verification. Spring Security's `AuthenticationTrustResolver` and custom `AccessDecisionVoter` implementations evaluate the authentication strength level, prompting for additional verification when the current authentication level is insufficient for the requested operation.

## Interview Questions

**Q: How does the Spring Security filter chain work?**

A: Spring Security inserts a `DelegatingFilterProxy` into the servlet filter chain, which delegates to a `FilterChainProxy` managing one or more `SecurityFilterChain` instances. Each chain has a request matcher and an ordered list of security filters (typically 15-20 filters including `SecurityContextPersistenceFilter`, `UsernamePasswordAuthenticationFilter`, `ExceptionTranslationFilter`, and `FilterSecurityInterceptor`). The first chain whose matcher matches the request processes it. Filters execute in order, each performing a specific security function like CSRF validation, authentication, or authorization.

**Q: What is the difference between `@Secured`, `@PreAuthorize`, and `@RolesAllowed`?**

A: `@Secured` accepts role names as strings and supports only role-based checks (no SpEL expressions). `@RolesAllowed` is the JSR-250 equivalent of `@Secured` with identical functionality. `@PreAuthorize` uses Spring Expression Language (SpEL) and supports complex expressions including method parameters, custom beans, and boolean logic. `@PreAuthorize` is the most flexible and is the recommended approach for method-level security in modern Spring applications.

**Q: How would you implement token refresh in a stateless API?**

A: Issue a short-lived access token (5-15 minutes) and a longer-lived refresh token (7-30 days) at login. Store the refresh token securely (HTTP-only cookie or encrypted storage). When the access token expires, the client sends the refresh token to a dedicated `/auth/refresh` endpoint. The server validates the refresh token, checks it has not been revoked (against a blacklist or database), and issues a new access token. Implement refresh token rotation where each use invalidates the old refresh token and issues a new one, detecting token theft if a revoked token is reused.

**Q: How does Spring Security handle CSRF protection?**

A: Spring Security generates a unique CSRF token per session and expects it in every state-changing request (POST, PUT, DELETE). For server-rendered forms, the token is included as a hidden field. For SPAs, the `CookieCsrfTokenRepository.withHttpOnlyFalse()` stores the token in a cookie readable by JavaScript, which the client includes in a custom header (X-XSRF-TOKEN). Stateless APIs using JWT typically disable CSRF because the token itself serves as proof of authentication and is not automatically sent by browsers like cookies are.

## Production Tips

- **Secure actuator endpoints separately**: Create a dedicated `SecurityFilterChain` for `/actuator/**` endpoints with stricter authentication. Expose only health and info publicly; require authentication for env, heapdump, and configprops. In Kubernetes, run actuator on a separate management port not exposed through the ingress to prevent external access entirely.

- **Implement security event auditing**: Register an `ApplicationEventPublisher` listener for `AuthenticationSuccessEvent`, `AuthenticationFailureBadCredentialsEvent`, and `AuthorizationDeniedEvent`. Log these events with contextual information (IP address, user agent, requested resource) to a security audit log for compliance and incident investigation. Rate-limit failed authentication attempts per IP and per account to prevent brute-force attacks.

- **Use security headers**: Configure `headers()` in the security filter chain to add `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, and `Content-Security-Policy` headers. These prevent clickjacking, MIME-type sniffing, and XSS attacks at the browser level with zero application code changes.

- **Token storage and rotation**: For refresh tokens, store a hashed version in the database with metadata (device, IP, creation time). Implement token family tracking so that if a refresh token is reused after rotation, all tokens in that family are revoked (indicating potential theft). Set absolute expiration on refresh tokens regardless of activity to limit the window of compromise.

## Related Topics

- [Spring Framework Core Container](./core-container.md) — Security beans are managed by the IoC container and leverage AOP proxies
- [Spring MVC and REST APIs](./spring-mvc.md) — Security filter chain integrates with the MVC request processing pipeline
- [Java Concurrency](../java/concurrency.md) — SecurityContext propagation in multi-threaded applications requires understanding ThreadLocal behavior
