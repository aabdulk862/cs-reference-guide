# Network Security

Network security encompasses the policies, technologies, and practices designed to protect the integrity, confidentiality, and availability of data as it traverses networks. In modern distributed systems, the network is both the connective tissue enabling microservices communication and the primary attack surface that adversaries exploit. The traditional perimeter-based security model — where everything inside the firewall is trusted — has been replaced by zero-trust architectures that verify every request regardless of its origin.

For software engineers building production systems, network security knowledge is essential for designing secure service meshes, configuring cloud networking, implementing DDoS mitigation, and passing system design interviews that probe defense-in-depth strategies. This guide covers firewalls, VPNs, zero-trust architecture, DDoS mitigation, and intrusion detection systems — the network-layer defenses that complement application-level security.

---

## Quick Reference

- **Firewall** — Network device or software that filters traffic based on rules (IP, port, protocol); operates at L3/L4 (network/transport) or L7 (application layer)
- **VPN (Virtual Private Network)** — Encrypted tunnel between endpoints; provides confidentiality and network-level access control for remote users or site-to-site connectivity
- **Zero Trust** — Security model where no network location is inherently trusted; every request is authenticated, authorized, and encrypted regardless of origin
- **DDoS Mitigation** — Techniques to absorb or deflect volumetric, protocol, and application-layer denial-of-service attacks
- **IDS/IPS** — Intrusion Detection/Prevention Systems that monitor network traffic for malicious patterns and optionally block threats in real-time
- **mTLS (Mutual TLS)** — Both client and server present certificates, providing bidirectional authentication for service-to-service communication
- **Network Segmentation** — Dividing networks into isolated zones to limit lateral movement after a breach
- **WAF (Web Application Firewall)** — L7 firewall that inspects HTTP traffic for application-layer attacks (SQLi, XSS, SSRF)
- **SASE (Secure Access Service Edge)** — Cloud-delivered convergence of networking (SD-WAN) and security (CASB, FWaaS, ZTNA) services

---

## When to Use

**Firewalls and Security Groups:**
- Restricting inbound traffic to only necessary ports and protocols
- Implementing network segmentation between application tiers (web, app, database)
- Blocking egress traffic to prevent data exfiltration and C2 communication
- Cloud environments (AWS Security Groups, Azure NSGs, GCP Firewall Rules)

**VPN:**
- Remote employee access to internal corporate resources
- Site-to-site connectivity between data centers or cloud regions
- Securing traffic over untrusted networks (public WiFi)
- Compliance requirements mandating encrypted network access

**Zero Trust Architecture:**
- Cloud-native applications where the network perimeter is undefined
- Organizations with remote/hybrid workforces
- Microservices architectures where service-to-service trust must be explicit
- Environments with high-value assets requiring continuous verification

**DDoS Mitigation:**
- Public-facing web applications and APIs
- DNS infrastructure
- Gaming servers and real-time communication platforms
- Any service where availability is a business-critical requirement

**IDS/IPS:**
- Monitoring east-west traffic within data centers for lateral movement
- Detecting known attack signatures and anomalous behavior patterns
- Compliance requirements (PCI DSS requires IDS/IPS for cardholder data environments)
- Providing forensic data for incident response

**mTLS:**
- Service-to-service communication in microservices (service mesh)
- API integrations with partners requiring strong mutual authentication
- Zero-trust environments where network location doesn't imply trust
- Financial and healthcare systems requiring non-repudiation

---

## Code Examples

### Example 1: Zero Trust Service-to-Service Authentication with mTLS

```typescript
import https from 'https';
import fs from 'fs';
import tls from 'tls';

// Server configuration with mTLS (requires client certificate)
const serverOptions: https.ServerOptions = {
  // Server's own certificate and key
  cert: fs.readFileSync('/etc/certs/server.crt'),
  key: fs.readFileSync('/etc/certs/server.key'),

  // CA certificate(s) to validate client certificates against
  ca: fs.readFileSync('/etc/certs/ca.crt'),

  // CRITICAL: Require client certificate (mTLS)
  requestCert: true,
  rejectUnauthorized: true,

  // Minimum TLS version
  minVersion: 'TLSv1.3',

  // Restrict cipher suites
  ciphers: [
    'TLS_AES_256_GCM_SHA384',
    'TLS_CHACHA20_POLY1305_SHA256',
    'TLS_AES_128_GCM_SHA256',
  ].join(':'),
};

const server = https.createServer(serverOptions, (req, res) => {
  // Extract client identity from certificate
  const clientCert = (req.socket as tls.TLSSocket).getPeerCertificate();

  // Verify client identity (beyond just certificate validity)
  const clientService = clientCert.subject.CN; // e.g., "payment-service"
  const clientOrg = clientCert.subject.O;

  // Authorization: check if this service is allowed to call this endpoint
  if (!isAuthorized(clientService, req.method, req.url)) {
    res.writeHead(403);
    res.end(JSON.stringify({ error: 'Service not authorized for this endpoint' }));
    return;
  }

  // Log for audit trail
  console.log(`Request from ${clientService} (${clientOrg}): ${req.method} ${req.url}`);

  // Process request...
  res.writeHead(200);
  res.end(JSON.stringify({ status: 'ok' }));
});

// Client configuration for mTLS requests
async function callService(url: string, data: object): Promise<Response> {
  const agent = new https.Agent({
    cert: fs.readFileSync('/etc/certs/client.crt'),
    key: fs.readFileSync('/etc/certs/client.key'),
    ca: fs.readFileSync('/etc/certs/ca.crt'),
    minVersion: 'TLSv1.3',
  });

  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    // @ts-ignore - Node.js fetch supports agent
    agent: agent,
  });
}
```

### Example 2: Network Policy Configuration (Kubernetes)

```yaml
# Kubernetes NetworkPolicy: Default deny all ingress and egress
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: production
spec:
  podSelector: {} # Applies to all pods in namespace
  policyTypes:
    - Ingress
    - Egress

---
# Allow specific service-to-service communication
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-api-to-database
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: postgres
      tier: database
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: api-server
              tier: backend
        - namespaceSelector:
            matchLabels:
              environment: production
      ports:
        - protocol: TCP
          port: 5432

---
# Allow egress only to specific external services
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-server-egress
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: api-server
  policyTypes:
    - Egress
  egress:
    # Allow DNS resolution
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - protocol: UDP
          port: 53
    # Allow database access
    - to:
        - podSelector:
            matchLabels:
              app: postgres
      ports:
        - protocol: TCP
          port: 5432
    # Allow external payment API
    - to:
        - ipBlock:
            cidr: 203.0.113.0/24 # Payment provider IP range
      ports:
        - protocol: TCP
          port: 443
```

### Example 3: Rate Limiting and DDoS Protection at Application Layer

```typescript
import { RateLimiterRedis, RateLimiterMemory } from 'rate-limiter-flexible';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

// Layered rate limiting strategy
class DDoSProtection {
  // Layer 1: Global rate limit (all requests)
  private globalLimiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'rl:global',
    points: 10000,        // 10,000 requests
    duration: 1,          // per second
    blockDuration: 60,    // block for 60 seconds if exceeded
  });

  // Layer 2: Per-IP rate limit
  private ipLimiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'rl:ip',
    points: 100,          // 100 requests
    duration: 60,         // per minute
    blockDuration: 300,   // block for 5 minutes
  });

  // Layer 3: Per-user rate limit (authenticated)
  private userLimiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'rl:user',
    points: 1000,         // 1000 requests
    duration: 3600,       // per hour
    blockDuration: 3600,  // block for 1 hour
  });

  // Layer 4: Endpoint-specific limits (login, signup)
  private authLimiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'rl:auth',
    points: 5,            // 5 attempts
    duration: 900,        // per 15 minutes
    blockDuration: 900,   // block for 15 minutes
  });

  // Sliding window with burst protection
  private burstLimiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'rl:burst',
    points: 20,           // 20 requests
    duration: 1,          // per second (burst)
    blockDuration: 10,    // block for 10 seconds
  });

  async middleware(req: Request, res: Response, next: NextFunction) {
    const clientIP = this.getClientIP(req);
    const userId = req.user?.id;

    try {
      // Check global limit first
      await this.globalLimiter.consume('global');

      // Check burst limit
      await this.burstLimiter.consume(clientIP);

      // Check IP limit
      await this.ipLimiter.consume(clientIP);

      // Check user limit if authenticated
      if (userId) {
        await this.userLimiter.consume(userId);
      }

      // Check auth endpoint limit
      if (req.path.startsWith('/auth/')) {
        await this.authLimiter.consume(clientIP);
      }

      next();
    } catch (rateLimiterRes) {
      // Set retry-after header
      const retryAfter = Math.ceil(rateLimiterRes.msBeforeNext / 1000);
      res.set('Retry-After', String(retryAfter));
      res.set('X-RateLimit-Remaining', '0');

      res.status(429).json({
        error: 'Too many requests',
        retryAfter: retryAfter,
      });
    }
  }

  private getClientIP(req: Request): string {
    // Trust X-Forwarded-For only from known load balancers
    const trustedProxies = ['10.0.0.0/8', '172.16.0.0/12'];
    const remoteAddr = req.socket.remoteAddress;

    if (this.isFromTrustedProxy(remoteAddr, trustedProxies)) {
      const forwarded = req.headers['x-forwarded-for'];
      if (forwarded) {
        return (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',')[0].trim();
      }
    }
    return remoteAddr || 'unknown';
  }

  private isFromTrustedProxy(ip: string | undefined, cidrs: string[]): boolean {
    if (!ip) return false;
    // CIDR matching implementation
    return cidrs.some(cidr => isInCIDR(ip, cidr));
  }
}
```

### Example 4: WAF Rules Configuration (AWS WAF)

```typescript
import { WAFv2Client, CreateWebACLCommand } from '@aws-sdk/client-wafv2';

// Infrastructure-as-code WAF configuration
const wafConfig = {
  Name: 'production-web-acl',
  Scope: 'REGIONAL',
  DefaultAction: { Allow: {} },
  Rules: [
    // Rule 1: AWS Managed Rules - Common Rule Set
    {
      Name: 'AWSManagedRulesCommonRuleSet',
      Priority: 1,
      Statement: {
        ManagedRuleGroupStatement: {
          VendorName: 'AWS',
          Name: 'AWSManagedRulesCommonRuleSet',
          ExcludedRules: [], // Override specific rules if needed
        },
      },
      OverrideAction: { None: {} },
      VisibilityConfig: {
        SampledRequestsEnabled: true,
        CloudWatchMetricsEnabled: true,
        MetricName: 'CommonRuleSet',
      },
    },
    // Rule 2: SQL Injection protection
    {
      Name: 'AWSManagedRulesSQLiRuleSet',
      Priority: 2,
      Statement: {
        ManagedRuleGroupStatement: {
          VendorName: 'AWS',
          Name: 'AWSManagedRulesSQLiRuleSet',
        },
      },
      OverrideAction: { None: {} },
      VisibilityConfig: {
        SampledRequestsEnabled: true,
        CloudWatchMetricsEnabled: true,
        MetricName: 'SQLiRuleSet',
      },
    },
    // Rule 3: Rate-based rule (DDoS protection)
    {
      Name: 'RateLimit',
      Priority: 3,
      Statement: {
        RateBasedStatement: {
          Limit: 2000, // 2000 requests per 5-minute window per IP
          AggregateKeyType: 'IP',
        },
      },
      Action: { Block: {} },
      VisibilityConfig: {
        SampledRequestsEnabled: true,
        CloudWatchMetricsEnabled: true,
        MetricName: 'RateLimit',
      },
    },
    // Rule 4: Geo-blocking (block specific countries)
    {
      Name: 'GeoBlock',
      Priority: 4,
      Statement: {
        GeoMatchStatement: {
          CountryCodes: ['KP', 'IR', 'SY'], // Sanctioned countries
        },
      },
      Action: { Block: {} },
      VisibilityConfig: {
        SampledRequestsEnabled: true,
        CloudWatchMetricsEnabled: true,
        MetricName: 'GeoBlock',
      },
    },
    // Rule 5: Custom rule - block requests with suspicious headers
    {
      Name: 'BlockSuspiciousUserAgents',
      Priority: 5,
      Statement: {
        ByteMatchStatement: {
          SearchString: 'sqlmap',
          FieldToMatch: { SingleHeader: { Name: 'user-agent' } },
          TextTransformations: [{ Priority: 0, Type: 'LOWERCASE' }],
          PositionalConstraint: 'CONTAINS',
        },
      },
      Action: { Block: {} },
      VisibilityConfig: {
        SampledRequestsEnabled: true,
        CloudWatchMetricsEnabled: true,
        MetricName: 'SuspiciousUA',
      },
    },
  ],
};
```

### Example 5: Intrusion Detection with Network Traffic Analysis

```java
// Simplified network anomaly detection using connection patterns
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/** Track connection patterns per source IP. */
class ConnectionMetrics {
    int totalConnections = 0;
    Set<String> uniqueDestinations = new HashSet<>();
    Set<Integer> portsScanned = new HashSet<>();
    long bytesTransferred = 0;
    int failedConnections = 0;
    long firstSeen = System.currentTimeMillis();
    long lastSeen = System.currentTimeMillis();
}

/** Simple network intrusion detection system. */
public class NetworkIDS {

    private final Map<String, ConnectionMetrics> metrics = new ConcurrentHashMap<>();
    private final List<Alert> alerts = new ArrayList<>();

    // Detection thresholds
    private static final int PORT_SCAN_THRESHOLD = 20;          // ports in 60 seconds
    private static final int CONNECTION_RATE_THRESHOLD = 100;   // connections per minute
    private static final int LATERAL_MOVEMENT_THRESHOLD = 10;   // unique internal destinations
    private static final long DATA_EXFIL_THRESHOLD = 100_000_000L; // 100MB outbound

    /** Process a network connection event and check for anomalies. */
    public List<Alert> processConnection(ConnectionEvent event) {
        List<Alert> detectedAlerts = new ArrayList<>();
        ConnectionMetrics m = metrics.computeIfAbsent(event.getSourceIp(), k -> new ConnectionMetrics());

        m.totalConnections++;
        m.uniqueDestinations.add(event.getDestIp());
        m.portsScanned.add(event.getDestPort());
        m.bytesTransferred += event.getBytesSent();
        m.lastSeen = System.currentTimeMillis();

        if (!event.isSuccess()) {
            m.failedConnections++;
        }

        // Detection: Port scanning
        long windowMs = m.lastSeen - m.firstSeen;
        if (windowMs < 60_000 && m.portsScanned.size() > PORT_SCAN_THRESHOLD) {
            detectedAlerts.add(new Alert(
                "HIGH", "PORT_SCAN", event.getSourceIp(),
                String.format("Port scan detected: %d ports in %ds",
                    m.portsScanned.size(), windowMs / 1000)
            ));
        }

        // Detection: Lateral movement (many internal destinations)
        long internalDests = m.uniqueDestinations.stream()
                .filter(this::isInternal).count();
        if (internalDests > LATERAL_MOVEMENT_THRESHOLD) {
            detectedAlerts.add(new Alert(
                "CRITICAL", "LATERAL_MOVEMENT", event.getSourceIp(),
                String.format("Possible lateral movement: %d internal hosts contacted",
                    internalDests)
            ));
        }

        // Detection: Data exfiltration (large outbound transfer)
        if (!isInternal(event.getDestIp()) && m.bytesTransferred > DATA_EXFIL_THRESHOLD) {
            detectedAlerts.add(new Alert(
                "CRITICAL", "DATA_EXFILTRATION", event.getSourceIp(),
                String.format("Large outbound transfer: %.1fMB",
                    m.bytesTransferred / 1_000_000.0)
            ));
        }

        // Detection: Brute force (high failure rate)
        if (m.failedConnections > 10
                && (double) m.failedConnections / m.totalConnections > 0.8) {
            detectedAlerts.add(new Alert(
                "HIGH", "BRUTE_FORCE", event.getSourceIp(),
                String.format("High failure rate: %d/%d",
                    m.failedConnections, m.totalConnections)
            ));
        }

        return detectedAlerts;
    }

    /** Check if IP is in internal network ranges. */
    private boolean isInternal(String ip) {
        String[] parts = ip.split("\\.");
        int first = Integer.parseInt(parts[0]);
        int second = Integer.parseInt(parts[1]);
        return first == 10
                || (first == 172 && second >= 16 && second <= 31)
                || (first == 192 && second == 168);
    }
}
```

---

## Common Pitfalls

**1. Relying solely on perimeter firewalls (castle-and-moat model).** Once an attacker breaches the perimeter (via phishing, compromised credentials, or supply chain attack), they have unrestricted lateral movement. Implement network segmentation, micro-segmentation, and zero-trust principles so that internal services still require authentication and authorization.

**2. Overly permissive security group rules.** Rules like "allow all traffic from 0.0.0.0/0" or "allow all ports from VPC CIDR" negate the purpose of security groups. Follow the principle of least privilege: allow only specific ports from specific sources. Regularly audit and remove unused rules. Use infrastructure-as-code to prevent manual drift.

**3. Not encrypting east-west traffic.** Many organizations encrypt north-south traffic (client to server) but leave internal service-to-service communication unencrypted. An attacker who gains access to the internal network can sniff all inter-service traffic. Implement mTLS via service mesh (Istio, Linkerd) for all internal communication.

**4. Trusting X-Forwarded-For headers without validation.** The X-Forwarded-For header can be spoofed by clients. Only trust it when the immediate connection comes from a known load balancer or proxy. Configure your application to only read XFF from trusted proxy IPs, and always use the rightmost untrusted entry (the one your proxy added).

**5. Implementing VPN as the sole access control.** VPN provides network-level access but doesn't enforce application-level authorization. A compromised VPN credential gives full network access to all internal resources. Layer VPN with identity-aware proxies (BeyondCorp model), MFA, device posture checks, and per-application authorization.

**6. Not monitoring DNS traffic.** DNS is commonly used for data exfiltration (DNS tunneling) and command-and-control communication because it's rarely blocked or inspected. Monitor DNS query patterns for: unusually long domain names, high query volumes to single domains, TXT record queries to suspicious domains, and queries to newly registered domains.

**7. Ignoring egress filtering.** Most organizations focus on ingress (blocking inbound attacks) but neglect egress (blocking outbound communication). Without egress filtering, compromised systems can freely communicate with C2 servers, exfiltrate data, and download additional malware. Implement egress firewalls that allow only necessary outbound connections.

---

## Real-World Use Cases

**Google BeyondCorp (Zero Trust Pioneer):** Google eliminated their corporate VPN entirely, replacing it with an identity-aware proxy that evaluates every request based on user identity, device health, and context. Employees access internal applications from any network (coffee shop, home, office) with the same security posture. Each request is authenticated via SSO, authorized based on role and resource sensitivity, and the device must pass health checks (encrypted disk, up-to-date OS, managed device). This model inspired the industry-wide shift toward zero-trust architecture.

**Cloudflare DDoS mitigation:** Cloudflare's Anycast network absorbs DDoS attacks by distributing traffic across 300+ data centers globally. When a volumetric attack hits, traffic is spread across the entire network rather than concentrated on the origin. Layer 3/4 attacks are filtered at the edge using BGP Flowspec rules and stateless packet filtering. Layer 7 attacks are mitigated using JavaScript challenges, CAPTCHA, and behavioral analysis that distinguishes bots from legitimate users. Their network can absorb attacks exceeding 100 Tbps.

**Netflix's security architecture:** Netflix implements defense in depth across their AWS infrastructure: VPC segmentation isolates services into security zones, security groups enforce micro-segmentation at the instance level, and their custom "Repokid" tool automatically right-sizes IAM permissions based on actual usage. Their "Chaos Monkey" approach extends to security with "Security Monkey" that continuously audits configurations for drift from security baselines.

**Financial services network isolation:** Banks implement strict network segmentation between trading systems, customer-facing applications, and back-office systems. Each zone has dedicated firewalls with explicit allow rules. Cross-zone communication requires approval and is logged for compliance. Payment card environments (PCI DSS scope) are isolated in dedicated network segments with additional monitoring and access controls. Hardware-based network encryption (MACsec) protects data center interconnects.

---

## Interview Questions

**Q: Explain zero-trust architecture. How does it differ from traditional perimeter security, and what are the implementation challenges?**

A: Traditional perimeter security (castle-and-moat) trusts everything inside the network boundary and focuses defenses on the edge. Zero trust assumes breach — no network location is inherently trusted. Every request must be authenticated (who), authorized (what they can access), and encrypted (confidentiality), regardless of whether it originates from inside or outside the network. Implementation requires: (1) Strong identity for all users and services (mTLS, OIDC). (2) Device health verification (is the device managed, patched, encrypted?). (3) Micro-segmentation (network policies limiting lateral movement). (4) Continuous verification (not just at login, but on every request). (5) Least-privilege access (just-in-time, just-enough access). Challenges include: legacy applications that can't support modern auth, performance overhead of per-request verification, complexity of managing fine-grained policies at scale, and organizational resistance to removing VPN-based access.

**Q: How would you design a DDoS mitigation strategy for a global web application?**

A: A comprehensive DDoS strategy operates at multiple layers: (1) Network layer (L3/L4): Use Anycast routing to distribute traffic globally, implement BGP blackholing for volumetric attacks, and deploy scrubbing centers (Cloudflare, AWS Shield Advanced) that filter malicious traffic before it reaches origin servers. (2) Transport layer: SYN flood protection via SYN cookies, connection rate limiting per source IP, and TCP state table overflow protection. (3) Application layer (L7): Rate limiting per IP/user/endpoint, CAPTCHA challenges for suspicious patterns, JavaScript proof-of-work challenges that bots can't solve, and behavioral analysis distinguishing legitimate users from bots. (4) Architecture: Auto-scaling to absorb traffic spikes, CDN caching to reduce origin load, and geographic load balancing. (5) Preparation: Maintain runbooks, establish relationships with ISPs for upstream filtering, and regularly test mitigation procedures. The key trade-off is between aggressive filtering (may block legitimate users) and permissive policies (may allow attack traffic through).

**Q: What is mTLS and when would you use it instead of one-way TLS? What are the operational challenges?**

A: Standard TLS (one-way) only authenticates the server to the client — the client verifies the server's certificate but the server doesn't verify the client's identity at the TLS layer. mTLS (mutual TLS) adds client certificate authentication — both parties present and verify certificates. Use mTLS for: service-to-service communication in microservices (replacing API keys), zero-trust environments where network location doesn't imply trust, and B2B API integrations requiring strong mutual authentication. Operational challenges include: certificate lifecycle management (issuance, rotation, revocation) at scale, debugging TLS handshake failures (certificate chain issues, expired certs), performance overhead of additional TLS handshake round-trips, and the need for a robust PKI infrastructure (internal CA, certificate automation via cert-manager or Vault). Service meshes (Istio, Linkerd) simplify mTLS by handling certificate management transparently via sidecar proxies.

**Q: How do you secure a Kubernetes cluster's network? Describe the layers of network security you would implement.**

A: Kubernetes network security operates at multiple layers: (1) Pod-level: NetworkPolicies define allowed ingress/egress per pod using label selectors. Start with default-deny-all and explicitly allow required communication paths. (2) Service mesh: Istio/Linkerd provides mTLS between all pods automatically, plus L7 authorization policies (allow service A to call service B's /api/orders endpoint only). (3) Node-level: Host firewalls (iptables/nftables) restrict traffic to/from nodes. Separate control plane nodes from worker nodes. (4) Cluster-level: API server access restricted to authorized networks, RBAC for kubectl access, admission controllers validating pod security. (5) External: Ingress controllers with WAF integration, DDoS protection at the load balancer, and egress gateways controlling outbound traffic. (6) DNS: CoreDNS policies preventing DNS exfiltration, and external DNS resolution only through controlled egress points.

---

## Production Tips

**Implement network observability before enforcement.** Before deploying restrictive network policies, run in audit/monitor mode to understand actual traffic patterns. Tools like Cilium Hubble, Calico flow logs, or VPC Flow Logs reveal which services communicate with which, on what ports, and at what volume. Use this data to build accurate allow-lists rather than guessing and breaking production traffic.

**Automate certificate rotation with short-lived certificates.** Long-lived certificates (1+ year) accumulate risk and create operational emergencies when they expire unexpectedly. Use automated certificate management (cert-manager in Kubernetes, ACME/Let's Encrypt for public certs, HashiCorp Vault PKI for internal certs) with short lifetimes (24-72 hours for service certificates). Short-lived certificates reduce the impact of key compromise and eliminate the need for CRL/OCSP revocation checking.

**Design for graceful degradation during DDoS attacks.** Your DDoS mitigation strategy should include degraded-mode operation: serve cached content when origin is overwhelmed, implement priority queuing (authenticated users get priority over anonymous), shed non-critical traffic (analytics, recommendations) to preserve core functionality, and have pre-configured "under attack" pages that load without backend dependencies.

---

## Related Topics

- [Web Application Security](./web-application-security.md) — Application-layer attacks (XSS, CSRF, SQLi) that network security complements but cannot fully prevent
- [Container Security](./container-security.md) — Kubernetes network policies, pod security, and service mesh configurations that implement network security in containerized environments
- [Cryptography Fundamentals](./cryptography-fundamentals.md) — TLS, certificate management, and encryption protocols that network security depends on
