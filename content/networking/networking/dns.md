# DNS

## Quick Reference

- DNS resolution hierarchy: stub resolver → recursive resolver → root nameservers (13 clusters) → TLD nameservers → authoritative nameservers
- Common record types: A (IPv4), AAAA (IPv6), CNAME (alias), MX (mail), NS (delegation), TXT (arbitrary text), SRV (service discovery), PTR (reverse lookup)
- TTL (Time To Live) controls caching duration at each layer — lower TTLs enable faster failover but increase query load on authoritative servers
- DNS uses UDP port 53 for queries under 512 bytes (or 4096 with EDNS0); TCP port 53 for zone transfers and large responses
- DNSSEC adds cryptographic signatures (RRSIG records) to verify response authenticity, preventing cache poisoning
- DNS-based load balancing returns multiple A records or uses weighted/geo-aware responses to distribute traffic
- Negative caching (NXDOMAIN responses) is cached according to the SOA record's minimum TTL field
- DNS over HTTPS (DoH) and DNS over TLS (DoT) encrypt queries between client and recursive resolver

## When to Use

DNS knowledge is essential whenever you're managing infrastructure, designing service discovery, implementing failover strategies, or debugging connectivity issues. Every network connection begins with DNS resolution, making it a critical path component that directly impacts application latency and availability.

You need deep DNS understanding when designing multi-region architectures that use GeoDNS for traffic routing, implementing blue-green deployments with DNS-based traffic shifting, configuring service discovery in Kubernetes (CoreDNS) or service meshes, setting up email infrastructure (SPF, DKIM, DMARC records), or debugging "works on my machine" issues caused by DNS caching differences between environments.

DNS-based load balancing is appropriate for global traffic distribution where you need geographic routing without a centralized load balancer, for failover between data centers, and for gradual traffic migration during infrastructure changes. It's less suitable for fine-grained load balancing within a data center (use L4/L7 load balancers instead) because DNS caching makes changes slow to propagate and client-side caching behavior is unpredictable.

## Code Examples

```python
import dns.resolver
import dns.rdatatype
import time

class DNSInspector:
    """Utility for inspecting DNS resolution behavior and caching."""
    
    def __init__(self, nameservers=None):
        self.resolver = dns.resolver.Resolver()
        if nameservers:
            self.resolver.nameservers = nameservers
    
    def resolve_with_timing(self, domain, record_type='A'):
        """Resolve a domain and measure resolution time."""
        start = time.perf_counter()
        try:
            answers = self.resolver.resolve(domain, record_type)
            elapsed_ms = (time.perf_counter() - start) * 1000
            
            results = []
            for rdata in answers:
                results.append({
                    'value': str(rdata),
                    'ttl': answers.rrset.ttl,
                    'rdtype': dns.rdatatype.to_text(rdata.rdtype)
                })
            
            return {
                'domain': domain,
                'record_type': record_type,
                'results': results,
                'resolution_time_ms': round(elapsed_ms, 2),
                'nameserver': answers.nameserver
            }
        except dns.resolver.NXDOMAIN:
            return {'domain': domain, 'error': 'NXDOMAIN - domain does not exist'}
        except dns.resolver.NoAnswer:
            return {'domain': domain, 'error': f'No {record_type} records found'}
        except dns.resolver.Timeout:
            return {'domain': domain, 'error': 'Resolution timeout'}

    def trace_resolution(self, domain):
        """Trace the full DNS resolution path from root to authoritative."""
        results = []
        
        # Query root for TLD
        tld = domain.split('.')[-1]
        try:
            ns_records = self.resolver.resolve(f'{tld}.', 'NS')
            results.append({
                'level': 'TLD',
                'nameservers': [str(ns) for ns in ns_records]
            })
        except Exception as e:
            results.append({'level': 'TLD', 'error': str(e)})
        
        # Query for authoritative nameservers
        try:
            ns_records = self.resolver.resolve(domain, 'NS')
            results.append({
                'level': 'Authoritative',
                'nameservers': [str(ns) for ns in ns_records]
            })
        except Exception as e:
            results.append({'level': 'Authoritative', 'error': str(e)})
        
        # Final resolution
        try:
            a_records = self.resolver.resolve(domain, 'A')
            results.append({
                'level': 'Final',
                'addresses': [str(r) for r in a_records],
                'ttl': a_records.rrset.ttl
            })
        except Exception as e:
            results.append({'level': 'Final', 'error': str(e)})
        
        return results

    def check_propagation(self, domain, record_type='A', 
                          nameservers=None):
        """Check DNS propagation across multiple resolvers."""
        if nameservers is None:
            nameservers = [
                ('8.8.8.8', 'Google'),
                ('1.1.1.1', 'Cloudflare'),
                ('9.9.9.9', 'Quad9'),
                ('208.67.222.222', 'OpenDNS'),
            ]
        
        results = []
        for ns_ip, ns_name in nameservers:
            resolver = dns.resolver.Resolver()
            resolver.nameservers = [ns_ip]
            resolver.lifetime = 5  # 5 second timeout
            
            try:
                answers = resolver.resolve(domain, record_type)
                results.append({
                    'resolver': ns_name,
                    'ip': ns_ip,
                    'values': [str(r) for r in answers],
                    'ttl': answers.rrset.ttl
                })
            except Exception as e:
                results.append({
                    'resolver': ns_name,
                    'ip': ns_ip,
                    'error': str(e)
                })
        
        return results


# Usage example
inspector = DNSInspector()

# Measure resolution time (first query vs cached)
first = inspector.resolve_with_timing('example.com')
print(f"First query: {first['resolution_time_ms']}ms")

second = inspector.resolve_with_timing('example.com')
print(f"Cached query: {second['resolution_time_ms']}ms")
```

```go
// DNS-based service discovery with health-aware resolution
package main

import (
    "context"
    "fmt"
    "math/rand"
    "net"
    "sync"
    "time"
)

// ServiceResolver implements DNS-based service discovery with caching
type ServiceResolver struct {
    resolver    *net.Resolver
    cache       map[string]*cacheEntry
    mu          sync.RWMutex
    defaultTTL  time.Duration
}

type cacheEntry struct {
    addresses []string
    expiresAt time.Time
}

func NewServiceResolver(dnsServer string, ttl time.Duration) *ServiceResolver {
    return &ServiceResolver{
        resolver: &net.Resolver{
            PreferGo: true,
            Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
                d := net.Dialer{Timeout: 2 * time.Second}
                return d.DialContext(ctx, "udp", dnsServer+":53")
            },
        },
        cache:      make(map[string]*cacheEntry),
        defaultTTL: ttl,
    }
}

// Resolve returns a healthy endpoint for the given service
func (sr *ServiceResolver) Resolve(ctx context.Context, service string) (string, error) {
    // Check cache first
    sr.mu.RLock()
    entry, exists := sr.cache[service]
    sr.mu.RUnlock()

    if exists && time.Now().Before(entry.expiresAt) {
        // Return random address from cached set (client-side load balancing)
        return entry.addresses[rand.Intn(len(entry.addresses))], nil
    }

    // Cache miss or expired — resolve via DNS
    addrs, err := sr.resolver.LookupHost(ctx, service)
    if err != nil {
        // On failure, use stale cache if available (stale-while-revalidate)
        if exists && len(entry.addresses) > 0 {
            fmt.Printf("DNS resolution failed, using stale cache for %s\n", service)
            return entry.addresses[rand.Intn(len(entry.addresses))], nil
        }
        return "", fmt.Errorf("DNS resolution failed for %s: %w", service, err)
    }

    // Update cache
    sr.mu.Lock()
    sr.cache[service] = &cacheEntry{
        addresses: addrs,
        expiresAt: time.Now().Add(sr.defaultTTL),
    }
    sr.mu.Unlock()

    return addrs[rand.Intn(len(addrs))], nil
}

// ResolveSRV discovers services using SRV records (host + port)
func (sr *ServiceResolver) ResolveSRV(ctx context.Context, service, proto, name string) (string, error) {
    _, addrs, err := sr.resolver.LookupSRV(ctx, service, proto, name)
    if err != nil {
        return "", err
    }

    // SRV records include priority and weight for load balancing
    // Select based on priority first, then weighted random within same priority
    if len(addrs) == 0 {
        return "", fmt.Errorf("no SRV records found")
    }

    // Simple selection: pick lowest priority, random among equal priority
    best := addrs[0]
    for _, addr := range addrs[1:] {
        if addr.Priority < best.Priority {
            best = addr
        }
    }

    return fmt.Sprintf("%s:%d", best.Target, best.Port), nil
}

func main() {
    resolver := NewServiceResolver("8.8.8.8", 30*time.Second)
    ctx := context.Background()

    addr, err := resolver.Resolve(ctx, "api.internal.example.com")
    if err != nil {
        panic(err)
    }
    fmt.Printf("Resolved to: %s\n", addr)
}
```

```yaml
# Kubernetes CoreDNS configuration for custom DNS resolution
apiVersion: v1
kind: ConfigMap
metadata:
  name: coredns
  namespace: kube-system
data:
  Corefile: |
    .:53 {
        errors
        health {
            lameduck 5s
        }
        ready
        
        # Kubernetes service discovery
        # Resolves: <service>.<namespace>.svc.cluster.local
        kubernetes cluster.local in-addr.arpa ip6.arpa {
            pods insecure
            fallthrough in-addr.arpa ip6.arpa
            ttl 30
        }
        
        # Forward external queries to upstream DNS
        forward . /etc/resolv.conf {
            max_concurrent 1000
            policy sequential
        }
        
        # Cache responses (success: 30s, denial: 5s)
        cache 30 {
            success 9984 30
            denial 9984 5
        }
        
        # Prometheus metrics
        prometheus :9153
        
        loop
        reload
        loadbalance round_robin
    }
    
    # Custom zone for internal services
    internal.company.com:53 {
        errors
        cache 60
        forward . 10.0.0.2 10.0.0.3 {
            policy round_robin
        }
    }
```

## Common Pitfalls

- **Assuming DNS changes propagate instantly**: DNS records are cached at multiple layers (browser ~60s, OS resolver ~minutes, recursive resolvers up to TTL). Even after updating a record, clients may use stale values for the full TTL duration — and some resolvers honor TTLs loosely. Always pre-lower TTLs (e.g., from 3600 to 60) at least 2× the original TTL before planned changes, then wait for the old TTL to expire before making the actual change.

- **CNAME at zone apex**: CNAME records cannot coexist with other record types at the same name, and the zone apex (e.g., `example.com` without a subdomain) must have SOA and NS records. This means you cannot CNAME the apex to a load balancer hostname. Solutions: use ALIAS/ANAME records (provider-specific), use A records pointing to static IPs, or use a provider that supports apex CNAME flattening (Cloudflare, Route53 alias records).

- **Not accounting for negative caching**: NXDOMAIN responses are cached according to the SOA minimum TTL (often 300-3600 seconds). If you query a domain before creating the record, the "does not exist" answer is cached, and subsequent queries return NXDOMAIN even after the record is created. This catches engineers who test DNS before records are live.

- **Relying on DNS for fast failover**: With typical TTLs of 60-300 seconds and unpredictable client caching behavior, DNS-based failover has a minimum recovery time of minutes. For sub-second failover, use anycast routing, BGP-based failover, or application-layer health checking with connection retry logic. DNS failover is appropriate for disaster recovery (minutes acceptable) but not for high-availability within a region.

- **Ignoring DNS resolution in latency budgets**: Cold DNS resolution (cache miss traversing the full hierarchy) takes 50-200ms. Applications making many connections to different hosts accumulate significant DNS latency. Monitor DNS resolution time as a separate metric, implement application-level DNS caching where appropriate, and use DNS prefetching for known downstream dependencies.

- **Misconfiguring TTLs for different record purposes**: Static infrastructure records (NS, MX) should have high TTLs (3600-86400s) to reduce query load. Records used for failover need low TTLs (30-60s) to enable quick switching. Records for blue-green deployments need TTLs lowered before the switch and raised after stabilization. One-size-fits-all TTL policies waste either freshness or resolver capacity.

## Real-World Use Cases

**Global Traffic Management (GeoDNS)**: Services like AWS Route53, Cloudflare, and NS1 return different IP addresses based on the querying resolver's geographic location. A user in Tokyo resolves `api.example.com` to an IP in the ap-northeast-1 region, while a user in London resolves to eu-west-1. This is implemented using the EDNS Client Subnet (ECS) extension, which includes the client's subnet in the DNS query so authoritative servers can make geo-aware decisions even when the recursive resolver is in a different location.

**Service Discovery in Kubernetes**: CoreDNS resolves service names to cluster IPs (`my-service.my-namespace.svc.cluster.local` → `10.96.0.1`). Headless services (ClusterIP: None) return individual pod IPs as A records, enabling client-side load balancing. SRV records provide port information for services with non-standard ports. StatefulSet pods get stable DNS names (`pod-0.my-service.my-namespace.svc.cluster.local`) enabling peer discovery for distributed databases.

**Email Authentication**: SPF records (TXT) specify which servers can send email for a domain. DKIM records (TXT) publish public keys for verifying email signatures. DMARC records (TXT) define policies for handling authentication failures. Misconfigured DNS records are the primary cause of email deliverability issues — emails landing in spam or being rejected entirely.

**CDN Routing**: CDNs use DNS to route users to the nearest edge server. When you CNAME your domain to a CDN (e.g., `cdn.example.com CNAME d1234.cloudfront.net`), the CDN's authoritative DNS returns the IP of the edge PoP closest to the user. This happens transparently — the user resolves your domain and gets routed to an edge server without knowing a CDN is involved.

**Disaster Recovery Failover**: Organizations configure DNS health checks that monitor primary endpoints and automatically update DNS records to point to secondary/DR sites when the primary fails. AWS Route53 health checks can monitor HTTP endpoints, TCP ports, or other Route53 records, triggering failover within 30-60 seconds of detecting failure (plus TTL propagation time).

## Interview Questions

**Q: Explain the full DNS resolution process when a browser navigates to a new domain.**

A: The browser first checks its internal DNS cache (Chrome: chrome://net-internals/#dns). On miss, it calls the OS stub resolver, which checks the OS cache and hosts file. On miss, the query goes to the configured recursive resolver (ISP or public like 8.8.8.8). The recursive resolver checks its cache, then performs iterative queries: it asks a root nameserver for the TLD, gets a referral to the TLD nameserver (e.g., .com), asks the TLD for the domain's authoritative nameserver, then asks the authoritative server for the actual A/AAAA record. Each response includes a TTL that controls caching duration. The recursive resolver caches the answer and returns it to the client. Total time for a cold resolution: 50-200ms across 4+ round trips.

**Q: How would you implement DNS-based blue-green deployment?**

A: First, lower the TTL on the production DNS record from its normal value (e.g., 3600s) to a short value (30-60s) and wait at least the original TTL for the change to propagate through all caches. Deploy the new version to the green environment and validate it. When ready to switch, update the DNS record to point to the green environment's IP/load balancer. Monitor for errors during the TTL window while old cached records drain. After confirming stability, optionally raise the TTL back. Keep the blue environment running for quick rollback — just flip DNS back. The key limitation is that DNS-based switching has a minimum transition time equal to the TTL, during which both environments receive traffic.

**Q: What is DNS cache poisoning and how does DNSSEC prevent it?**

A: DNS cache poisoning injects false records into a recursive resolver's cache by sending forged responses that match the query's transaction ID and source port before the legitimate response arrives. The Kaminsky attack exploited this by flooding resolvers with responses for random subdomains, each containing a poisoned authority section delegating the entire domain to an attacker's nameserver. DNSSEC prevents this by adding cryptographic signatures (RRSIG records) to DNS responses. Each zone signs its records with a private key, and the corresponding public key is published in a DNSKEY record authenticated by the parent zone's DS (Delegation Signer) record. This creates a chain of trust from the root zone down to individual records, allowing resolvers to verify that responses haven't been tampered with.

**Q: How does DNS-based load balancing work, and what are its limitations?**

A: DNS-based load balancing returns multiple A records for a domain, and clients typically connect to the first one (or a random one, depending on implementation). Weighted DNS assigns different weights to records, controlling traffic distribution. The limitations are significant: clients cache DNS responses and reuse the same IP for the TTL duration (no per-request balancing), client behavior is unpredictable (some ignore TTL, some always use the first record), you can't route based on request content (URL, headers), and failover speed is limited by TTL propagation. DNS load balancing works best for coarse-grained global distribution across regions, not fine-grained balancing within a cluster.

## Production Tips

- **Implement DNS prefetching for known dependencies**: If your service always calls `auth-service.internal`, `database.internal`, and `cache.internal`, resolve these at startup and refresh periodically rather than paying DNS latency on the first request. Most HTTP client libraries support connection warming that includes DNS pre-resolution.

- **Monitor DNS query latency and failure rates separately**: Add DNS resolution time as a distinct metric in your observability stack. A spike in DNS latency (from 1ms cached to 100ms+ on cache miss) often precedes user-visible latency increases. Alert on DNS SERVFAIL or NXDOMAIN rates for your own domains — these indicate authoritative server issues or misconfiguration.

- **Use DNS TTL strategically for different operational needs**: Static infrastructure (NS records, MX records): 3600-86400s. Production services with failover: 60s. During active migration: 30s. After migration stabilizes: raise back to 300-3600s. Document your TTL strategy so on-call engineers know what to expect during incidents.

- **Configure resolver fallback and timeout correctly**: Applications should have at least 2 recursive resolvers configured. Set resolution timeout to 2-3 seconds with 2-3 retries. In Kubernetes, `ndots:5` in resolv.conf causes 5 search domain attempts before trying the absolute name — this multiplies DNS queries by 5-6× for external domains. Set `ndots:2` or use FQDNs (trailing dot) for external services.

## Related Topics

- [TCP/IP](./tcp-ip.md) — DNS primarily uses UDP for queries and TCP for zone transfers, operating at the application layer of the TCP/IP stack
- [Load Balancing](./load-balancing.md) — DNS-based load balancing is a coarse-grained alternative to L4/L7 load balancers for global traffic distribution
- [TLS & mTLS](./tls-mtls.md) — Certificate validation requires DNS to resolve certificate hostnames, and DANE uses DNS to publish certificate constraints
- [HTTP](./http.md) — Every HTTP connection begins with DNS resolution, and HTTP caching interacts with DNS TTLs for origin selection
