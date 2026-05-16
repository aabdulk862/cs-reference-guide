# Authentication Patterns

Authentication is the process of verifying the identity of a user, service, or system. In distributed architectures, authentication becomes a complex challenge involving token management, federation across identity providers, and balancing security with user experience. Modern authentication patterns have evolved from simple username/password schemes to sophisticated protocols like OAuth 2.0 and OpenID Connect that enable secure delegation, single sign-on, and fine-grained consent management.

Understanding authentication patterns at a deep level is essential for system design interviews, security architecture reviews, and building production systems that handle millions of users. The difference between authentication (who are you?) and authorization (what can you do?) is fundamental, yet the protocols that implement them are deeply intertwined. This guide covers the major authentication protocols, token formats, session management strategies, and multi-factor authentication approaches used in production systems today.

---

## Quick Reference

- **OAuth 2.0** — Authorization framework that delegates access without sharing credentials; uses grant types (authorization code, client credentials, device code) for different scenarios
- **OpenID Connect (OIDC)** — Identity layer built on OAuth 2.0; adds ID tokens with user identity claims and a standardized UserInfo endpoint
- **SAML 2.0** — XML-based federation protocol for enterprise SSO; uses assertions exchanged between Identity Providers (IdP) and Service Providers (SP)
- **JWT (JSON Web Token)** — Compact, URL-safe token format containing signed claims; used as access tokens, ID tokens, and refresh tokens
- **Session Management** — Server-side state tracking via session IDs stored in cookies; provides instant revocation but requires shared state
- **MFA (Multi-Factor Authentication)** — Requires two or more verification factors (knowledge, possession, inherence) to reduce credential theft risk
- **PKCE (Proof Key for Code Exchange)** — Extension to OAuth 2.0 authorization code flow that prevents authorization code interception attacks in public clients
- **Token Refresh** — Pattern using long-lived refresh tokens to obtain new short-lived access tokens without re-authentication
- **Federation** — Trusting external identity providers to authenticate users, enabling SSO across organizational boundaries

---

## When to Use

**OAuth 2.0 Authorization Code Flow with PKCE:**
- Web applications with server-side backends that need to access APIs on behalf of users
- Single-page applications (SPAs) that cannot securely store client secrets
- Mobile applications where the authorization code could be intercepted
- Any scenario requiring delegated access to third-party resources

**OAuth 2.0 Client Credentials Flow:**
- Service-to-service communication where no user context is needed
- Background jobs, cron tasks, and daemon processes accessing APIs
- Machine-to-machine authentication in microservices architectures

**OpenID Connect:**
- When you need user identity information (name, email, profile) in addition to API access
- Implementing "Login with Google/Microsoft/Okta" social login flows
- Enterprise SSO where a centralized identity provider manages all user identities

**SAML 2.0:**
- Enterprise environments with existing SAML infrastructure (Active Directory Federation Services)
- B2B integrations where partners require SAML-based SSO
- Legacy systems that predate OAuth 2.0/OIDC adoption

**JWT-based Authentication:**
- Stateless microservices that need to validate tokens without calling the auth server
- Cross-domain authentication where cookies cannot be shared
- Systems requiring offline token validation at edge nodes or CDNs

**Session-based Authentication:**
- Traditional server-rendered web applications
- Systems requiring immediate session revocation (banking, healthcare)
- Applications where token size is a concern (JWTs grow with claims)

**Multi-Factor Authentication:**
- Any system handling sensitive data (financial, healthcare, PII)
- Administrative and privileged access paths
- Compliance requirements (PCI DSS, SOC 2, HIPAA)

---

## Code Examples

### Example 1: OAuth 2.0 Authorization Code Flow with PKCE

```typescript
import crypto from 'crypto';

// Step 1: Generate PKCE code verifier and challenge
function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  return { verifier, challenge };
}

// Step 2: Build authorization URL
function buildAuthorizationUrl(config: OAuthConfig): string {
  const { verifier, challenge } = generatePKCE();
  const state = crypto.randomBytes(16).toString('hex');

  // Store verifier and state in session for later verification
  session.set('pkce_verifier', verifier);
  session.set('oauth_state', state);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: 'openid profile email',
    state: state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  return `${config.authorizationEndpoint}?${params.toString()}`;
}

// Step 3: Exchange authorization code for tokens
async function exchangeCode(code: string, state: string): Promise<TokenResponse> {
  // Verify state to prevent CSRF
  if (state !== session.get('oauth_state')) {
    throw new Error('Invalid state parameter - possible CSRF attack');
  }

  const response = await fetch(config.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      code_verifier: session.get('pkce_verifier'),
    }),
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  return response.json() as Promise<TokenResponse>;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope: string;
}
```

### Example 2: JWT Validation and Best Practices

```typescript
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

// Configure JWKS client for public key retrieval
const client = jwksClient({
  jwksUri: 'https://auth.example.com/.well-known/jwks.json',
  cache: true,
  cacheMaxAge: 600000, // 10 minutes
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

// Key retrieval function
function getSigningKey(header: jwt.JwtHeader): Promise<string> {
  return new Promise((resolve, reject) => {
    client.getSigningKey(header.kid, (err, key) => {
      if (err) return reject(err);
      resolve(key!.getPublicKey());
    });
  });
}

// Comprehensive JWT validation middleware
async function validateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  const token = authHeader.slice(7);

  try {
    // Decode header to get kid for key lookup
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || decoded.header.alg === 'none') {
      return res.status(401).json({ error: 'Invalid token format' });
    }

    // CRITICAL: Never accept 'none' algorithm
    // CRITICAL: Always verify against expected issuer and audience
    const signingKey = await getSigningKey(decoded.header);

    const payload = jwt.verify(token, signingKey, {
      algorithms: ['RS256'], // Explicitly whitelist algorithms
      issuer: 'https://auth.example.com',
      audience: 'https://api.example.com',
      clockTolerance: 30, // 30 seconds clock skew tolerance
    }) as JWTPayload;

    // Additional custom validations
    if (!payload.sub) {
      return res.status(401).json({ error: 'Token missing subject claim' });
    }

    req.user = {
      id: payload.sub,
      email: payload.email,
      roles: payload.roles || [],
      tenantId: payload.tenant_id,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.status(500).json({ error: 'Token validation failed' });
  }
}

interface JWTPayload {
  sub: string;
  email: string;
  roles: string[];
  tenant_id: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}
```

### Example 3: Secure Session Management with Redis

```typescript
import session from 'express-session';
import RedisStore from 'connect-redis';
import { createClient } from 'redis';
import crypto from 'crypto';

// Redis client with TLS for production
const redisClient = createClient({
  url: process.env.REDIS_URL,
  socket: {
    tls: true,
    rejectUnauthorized: true,
  },
});

await redisClient.connect();

// Session configuration
app.use(session({
  store: new RedisStore({
    client: redisClient,
    prefix: 'sess:',
    ttl: 3600, // 1 hour
  }),
  name: '__Host-session', // __Host- prefix enforces Secure + no Domain
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,        // HTTPS only
    httpOnly: true,      // No JavaScript access
    sameSite: 'lax',     // CSRF protection
    maxAge: 3600000,     // 1 hour
    path: '/',
    domain: undefined,   // Required for __Host- prefix
  },
  genid: () => crypto.randomBytes(32).toString('hex'), // Cryptographically random session IDs
  rolling: true, // Reset expiry on each request (sliding window)
}));

// Session regeneration after authentication (prevent session fixation)
async function loginUser(req: Request, user: User): Promise<void> {
  return new Promise((resolve, reject) => {
    // Destroy old session and create new one
    req.session.regenerate((err) => {
      if (err) return reject(err);

      req.session.userId = user.id;
      req.session.roles = user.roles;
      req.session.loginTime = Date.now();
      req.session.lastActivity = Date.now();

      req.session.save((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
}

// Absolute timeout check (force re-auth after 8 hours regardless of activity)
function checkAbsoluteTimeout(req: Request, res: Response, next: NextFunction) {
  const maxSessionAge = 8 * 60 * 60 * 1000; // 8 hours
  if (req.session.loginTime && Date.now() - req.session.loginTime > maxSessionAge) {
    req.session.destroy(() => {
      res.status(401).json({ error: 'Session expired, please re-authenticate' });
    });
    return;
  }
  req.session.lastActivity = Date.now();
  next();
}
```

### Example 4: TOTP-based Multi-Factor Authentication

```typescript
import { authenticator } from 'otplib';
import qrcode from 'qrcode';

// MFA enrollment - generate secret and QR code
async function enrollMFA(userId: string, userEmail: string): Promise<MFAEnrollment> {
  const secret = authenticator.generateSecret(20); // 160-bit secret

  // Store encrypted secret (not yet verified)
  await db.mfaSecrets.create({
    userId,
    secret: encrypt(secret), // Encrypt at rest
    verified: false,
    createdAt: new Date(),
  });

  // Generate otpauth:// URI for authenticator apps
  const otpauthUrl = authenticator.keyuri(userEmail, 'MyApp', secret);
  const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);

  // Generate backup codes
  const backupCodes = Array.from({ length: 10 }, () =>
    crypto.randomBytes(4).toString('hex')
  );

  await db.backupCodes.create({
    userId,
    codes: backupCodes.map(code => hashBackupCode(code)),
  });

  return {
    qrCode: qrCodeDataUrl,
    secret: secret, // Show once for manual entry
    backupCodes: backupCodes, // Show once, user must save
  };
}

// MFA verification during login
async function verifyMFA(userId: string, token: string): Promise<boolean> {
  const mfaRecord = await db.mfaSecrets.findOne({ userId, verified: true });
  if (!mfaRecord) {
    throw new Error('MFA not enrolled');
  }

  const secret = decrypt(mfaRecord.secret);

  // Check TOTP with 1-step window (allows 30 seconds clock drift)
  const isValid = authenticator.check(token, secret);

  if (!isValid) {
    // Check backup codes as fallback
    return verifyBackupCode(userId, token);
  }

  // Prevent replay attacks - track used tokens
  const tokenKey = `mfa:used:${userId}:${token}`;
  const alreadyUsed = await redisClient.get(tokenKey);
  if (alreadyUsed) {
    return false; // Token replay detected
  }
  await redisClient.setEx(tokenKey, 60, '1'); // Block reuse for 60 seconds

  return true;
}

// Backup code verification (one-time use)
async function verifyBackupCode(userId: string, code: string): Promise<boolean> {
  const hashedCode = hashBackupCode(code);
  const result = await db.backupCodes.findOneAndUpdate(
    { userId, codes: hashedCode },
    { $pull: { codes: hashedCode } }
  );
  return result !== null;
}

interface MFAEnrollment {
  qrCode: string;
  secret: string;
  backupCodes: string[];
}
```

### Example 5: Token Refresh with Rotation

```typescript
// Refresh token rotation - each refresh token can only be used once
async function refreshAccessToken(refreshToken: string): Promise<TokenPair> {
  // Validate refresh token
  const tokenRecord = await db.refreshTokens.findOne({
    token: hashToken(refreshToken),
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });

  if (!tokenRecord) {
    // If token not found, it may have been reused (stolen)
    // Revoke entire token family as a security measure
    if (tokenRecord === null) {
      const possiblyReused = await db.refreshTokens.findOne({
        token: hashToken(refreshToken),
      });
      if (possiblyReused) {
        // Token was already used - revoke all tokens in this family
        await db.refreshTokens.updateMany(
          { familyId: possiblyReused.familyId },
          { revokedAt: new Date(), revokeReason: 'token_reuse_detected' }
        );
        // Alert security team
        await alertSecurityTeam(possiblyReused.userId, 'refresh_token_reuse');
      }
    }
    throw new UnauthorizedError('Invalid refresh token');
  }

  // Revoke current refresh token (one-time use)
  await db.refreshTokens.updateOne(
    { _id: tokenRecord._id },
    { revokedAt: new Date(), revokeReason: 'rotated' }
  );

  // Issue new token pair
  const user = await db.users.findById(tokenRecord.userId);
  const newAccessToken = generateAccessToken(user);
  const newRefreshToken = crypto.randomBytes(32).toString('base64url');

  // Store new refresh token in same family
  await db.refreshTokens.create({
    token: hashToken(newRefreshToken),
    userId: user.id,
    familyId: tokenRecord.familyId, // Same family for reuse detection
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    createdAt: new Date(),
  });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresIn: 900, // 15 minutes
  };
}
```

---

## Common Pitfalls

**1. Accepting the `none` algorithm in JWT validation.** The JWT spec allows `alg: "none"` for unsigned tokens. If your validation library doesn't explicitly reject this, an attacker can forge tokens by removing the signature and setting the algorithm to none. Always whitelist specific algorithms (e.g., `['RS256']`) in your verification options.

**2. Storing refresh tokens without hashing.** If your database is compromised and refresh tokens are stored in plaintext, attackers can impersonate any user. Hash refresh tokens before storage (using SHA-256) just as you would hash passwords. The client holds the raw token; the server only stores the hash.

**3. Not implementing token family tracking for refresh token rotation.** Without family tracking, you cannot detect when a stolen refresh token is reused. If an attacker uses a stolen token after the legitimate user has already rotated it, you should revoke the entire family and force re-authentication.

**4. Using implicit flow for SPAs.** The OAuth 2.0 implicit flow returns tokens in URL fragments, exposing them in browser history, referrer headers, and server logs. It's deprecated in OAuth 2.1. Always use authorization code flow with PKCE for browser-based applications.

**5. Hardcoding client secrets in frontend code.** SPAs and mobile apps are public clients — they cannot securely store secrets. Never embed client secrets in JavaScript bundles or mobile app binaries. Use PKCE instead of client secrets for these clients.

**6. Not validating the `aud` (audience) claim in JWTs.** Without audience validation, a token issued for one service can be replayed against another service in the same ecosystem. Each service must verify that the token's audience matches its own identifier.

**7. Implementing MFA without rate limiting verification attempts.** Without rate limiting, an attacker with a stolen password can brute-force 6-digit TOTP codes (only 1 million possibilities). Limit verification attempts to 3-5 per 30-second window and implement exponential backoff.

**8. Using symmetric JWT signing (HS256) in microservices.** With HS256, every service that needs to validate tokens must have the shared secret, expanding the attack surface. Use asymmetric signing (RS256/ES256) where only the auth service holds the private key and other services validate with the public key.

---

## Real-World Use Cases

**Enterprise SSO with SAML and OIDC bridge:** Large organizations often have existing SAML infrastructure (ADFS, Okta, Ping Identity) but need to integrate with modern applications expecting OIDC. Identity brokers like Keycloak or Auth0 act as a bridge, accepting SAML assertions from the enterprise IdP and issuing OIDC tokens to downstream applications. This allows gradual migration without disrupting existing integrations.

**API gateway authentication in microservices:** In a microservices architecture, the API gateway (Kong, AWS API Gateway, Envoy) handles token validation at the edge, extracting user identity and forwarding it as trusted headers to internal services. This centralizes authentication logic, reduces latency (no per-service token validation), and simplifies internal service development. Services trust the gateway's headers because network policies prevent direct external access.

**Mobile banking with step-up authentication:** Banking apps implement risk-based authentication where low-risk operations (checking balance) require only biometric unlock, medium-risk operations (internal transfers) require PIN confirmation, and high-risk operations (external transfers, adding payees) require full MFA with SMS or hardware token. The risk engine evaluates device fingerprint, location, transaction amount, and behavioral patterns to determine the required authentication level.

**B2B SaaS with customer-managed identity:** Enterprise SaaS products allow customers to bring their own identity provider. Each tenant configures their IdP (Okta, Azure AD, Google Workspace) via SAML or OIDC federation. The SaaS application trusts assertions from the customer's IdP, maps external groups to internal roles, and enforces the customer's authentication policies (MFA requirements, session duration) without managing credentials directly.

---

## Interview Questions

**Q: Explain the OAuth 2.0 authorization code flow with PKCE. Why is PKCE necessary for public clients?**

A: The authorization code flow with PKCE works as follows: (1) The client generates a random code verifier and derives a code challenge (SHA-256 hash). (2) The client redirects the user to the authorization server with the code challenge. (3) After user consent, the auth server redirects back with an authorization code. (4) The client exchanges the code for tokens, including the original code verifier. (5) The auth server verifies the code verifier matches the challenge before issuing tokens. PKCE is necessary for public clients (SPAs, mobile apps) because they cannot securely store a client secret. Without PKCE, an attacker who intercepts the authorization code (via malicious app on the same device, browser extension, or network interception) could exchange it for tokens. With PKCE, the attacker would also need the code verifier, which never leaves the client's memory.

**Q: How would you implement token revocation in a stateless JWT-based system?**

A: Pure stateless JWTs cannot be revoked before expiry — this is their fundamental limitation. Practical approaches include: (1) Short-lived access tokens (5-15 minutes) with refresh token rotation, limiting the window of exposure. (2) Token blacklisting using a distributed cache (Redis) that stores revoked token JTIs; services check the blacklist on each request. The blacklist only needs entries for unexpired tokens, so it stays small. (3) Token versioning where each user has a token version counter; incrementing it invalidates all existing tokens. (4) For critical operations, use token introspection (RFC 7662) where the service calls the auth server to verify token validity in real-time. The trade-off is always between statelessness (performance, scalability) and revocability (security). Most production systems use approach (1) + (2) for a practical balance.

**Q: Compare SAML 2.0 and OpenID Connect. When would you choose one over the other?**

A: SAML 2.0 is XML-based, uses SOAP/HTTP-POST bindings, and was designed for enterprise web SSO. OIDC is JSON-based, built on OAuth 2.0, and designed for modern web and mobile applications. Choose SAML when: integrating with enterprise identity infrastructure (ADFS, legacy IdPs), partners mandate SAML, or you need attribute-based assertions with complex policies. Choose OIDC when: building new applications, supporting mobile clients, needing lightweight JSON tokens, or requiring OAuth 2.0 API authorization alongside authentication. Key technical differences: SAML assertions are typically larger (XML + signatures), SAML requires more complex parsing, OIDC has better mobile support, and OIDC's discovery mechanism (.well-known/openid-configuration) simplifies client configuration. Many organizations run both, using SAML for B2B federation and OIDC for consumer-facing applications.

**Q: How do you securely store and manage refresh tokens? What happens if a refresh token is compromised?**

A: Refresh tokens should be: (1) Stored as hashed values in the database (SHA-256), never plaintext. (2) Bound to the client that requested them (client_id validation). (3) Rotated on every use — each refresh generates a new refresh token and invalidates the old one. (4) Grouped into token families for reuse detection. If a refresh token is compromised and the attacker uses it after the legitimate user has already rotated it, the system detects the reuse (the old token was already consumed), revokes the entire token family, and forces re-authentication. If the attacker uses it before the legitimate user, the legitimate user's next refresh attempt will fail (their token was consumed by the attacker), triggering the same family revocation. This limits the damage window and provides detection capability.

---

## Production Tips

**Implement centralized token validation with caching.** In microservices, avoid each service independently fetching JWKS keys on every request. Use a shared validation library that caches public keys with appropriate TTL (10-60 minutes) and implements graceful key rotation. When a token's `kid` doesn't match cached keys, fetch fresh keys once (not on every failed validation to prevent DoS).

**Design for authentication service unavailability.** Your auth service will go down eventually. Services should cache validated tokens locally (with short TTL), implement circuit breakers around token introspection calls, and have degraded-mode policies (e.g., allow requests with recently-validated tokens for 5 minutes during outage). Never fail open — if you can't validate, reject the request with a retryable error.

**Monitor authentication metrics as security signals.** Track: failed login rate per account (credential stuffing), failed MFA rate (brute force), token refresh patterns (stolen tokens show unusual refresh timing), geographic anomalies (impossible travel), and device fingerprint changes. Set alerts at thresholds that indicate attack rather than normal user behavior. A sudden spike in failed logins across many accounts is credential stuffing; concentrated failures on one account is targeted attack.

---

## Related Topics

- [Web Application Security](./web-application-security.md) — CSRF protection, session security, and browser-based attack vectors that authentication must defend against
- [Cryptography Fundamentals](./cryptography-fundamentals.md) — The signing algorithms, hashing functions, and key management that JWT and token security depend on
- [Spring Security](../../backend/spring-framework/spring-security.md) — Java-specific implementation of OAuth 2.0, session management, and authentication filters
