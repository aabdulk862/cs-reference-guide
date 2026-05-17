# HTTP

## Quick Reference

- HTTP/1.1 uses persistent connections (keep-alive) with request pipelining; suffers from head-of-line blocking where slow responses block subsequent ones
- HTTP/2 multiplexes multiple streams over a single TCP connection using binary framing, eliminating application-layer HOL blocking
- HTTP/3 replaces TCP with QUIC (UDP-based), eliminating transport-layer HOL blocking and enabling 0-RTT connection resumption
- Key headers: `Cache-Control` (caching directives), `ETag`/`If-None-Match` (conditional requests), `Content-Type` (MIME type), `Authorization` (credentials)
- Status code families: 1xx (informational), 2xx (success), 3xx (redirection), 4xx (client error), 5xx (server error)
- HTTP/2 HPACK header compression uses static/dynamic tables and Huffman encoding, reducing header overhead by 85-90%
- Connection management: `Connection: keep-alive` (HTTP/1.1 default), `Connection: close` (signal last request), HTTP/2 uses GOAWAY frame for graceful shutdown
- Content negotiation via `Accept`, `Accept-Encoding`, `Accept-Language` headers lets clients specify preferred response formats
- HTTP caching layers: browser cache → CDN/proxy cache → origin server, controlled by `Cache-Control`, `Expires`, `Vary`, and `ETag` headers

## When to Use

HTTP is the foundation of web communication and the most common protocol for APIs, web applications, and service-to-service communication. Understanding HTTP deeply is essential for designing performant APIs, implementing effective caching strategies, debugging network issues, and making informed decisions about protocol versions.

Choose HTTP/1.1 when compatibility is paramount (legacy clients, simple proxy infrastructure) or when requests are infrequent and connection overhead is acceptable. Choose HTTP/2 for web applications serving many resources (multiplexing eliminates the need for domain sharding and sprite sheets), for gRPC communication (gRPC uses HTTP/2 framing), and when server push can preemptively deliver resources. Choose HTTP/3 for mobile-heavy traffic (connection migration survives network switches), high-latency networks (reduced handshake round trips), and applications sensitive to tail latency (independent stream loss recovery).

Understanding HTTP caching is critical for reducing latency, decreasing origin load, and lowering infrastructure costs. Proper cache configuration can reduce origin traffic by 80-95% for static assets and significantly improve API response times with conditional requests and stale-while-revalidate patterns.

## Code Examples

```typescript
// HTTP/2 server with multiplexing, server push, and proper connection management
import http2 from 'node:http2';
import fs from 'node:fs';
import path from 'node:path';

const server = http2.createSecureServer({
  key: fs.readFileSync('server.key'),
  cert: fs.readFileSync('server.crt'),
  // HTTP/2 settings
  settings: {
    maxConcurrentStreams: 100,      // Max parallel streams per connection
    initialWindowSize: 1048576,     // 1MB flow control window
    headerTableSize: 65536,         // HPACK dynamic table size
  }
});

// Track active connections for graceful shutdown
const activeConnections = new Set<http2.ServerHttp2Session>();

server.on('session', (session) => {
  activeConnections.add(session);
  
  session.on('close', () => {
    activeConnections.delete(session);
  });
  
  // Ping/pong for connection health
  const pingInterval = setInterval(() => {
    if (!session.closed) {
      session.ping((err) => {
        if (err) {
          console.error('Ping failed, closing session');
          session.close();
        }
      });
    }
  }, 30000);
  
  session.on('close', () => clearInterval(pingInterval));
});

server.on('stream', (stream, headers) => {
  const method = headers[':method'];
  const reqPath = headers[':path'] || '/';
  
  if (method === 'GET' && reqPath === '/') {
    // Server Push: proactively send resources the client will need
    stream.pushStream({ ':path': '/style.css' }, (err, pushStream) => {
      if (!err) {
        pushStream.respond({
          ':status': 200,
          'content-type': 'text/css',
          'cache-control': 'public, max-age=31536000, immutable',
        });
        pushStream.end('body { font-family: system-ui; }');
      }
    });
    
    // Main response with caching headers
    stream.respond({
      ':status': 200,
      'content-type': 'text/html',
      'cache-control': 'no-cache',  // Always revalidate
      'etag': '"v1-index"',
    });
    stream.end('<html><head><link rel="stylesheet" href="/style.css"></head></html>');
    
  } else if (method === 'GET' && reqPath === '/api/data') {
    // API response with conditional request support
    const etag = '"data-hash-abc123"';
    const ifNoneMatch = headers['if-none-match'];
    
    if (ifNoneMatch === etag) {
      // 304 Not Modified — client cache is still valid
      stream.respond({ ':status': 304 });
      stream.end();
      return;
    }
    
    stream.respond({
      ':status': 200,
      'content-type': 'application/json',
      'cache-control': 'private, max-age=0, must-revalidate',
      'etag': etag,
    });
    stream.end(JSON.stringify({ items: [1, 2, 3], timestamp: Date.now() }));
    
  } else {
    stream.respond({ ':status': 404 });
    stream.end('Not Found');
  }
});

// Graceful shutdown
function gracefulShutdown() {
  // Send GOAWAY to all connections
  for (const session of activeConnections) {
    session.close(); // Sends GOAWAY frame, allows in-flight streams to complete
  }
  
  // Force close after timeout
  setTimeout(() => {
    server.close();
    process.exit(0);
  }, 30000);
}

process.on('SIGTERM', gracefulShutdown);

server.listen(8443, () => {
  console.log('HTTP/2 server listening on https://localhost:8443');
});
```

```java
// HTTP caching implementation with conditional requests and stale-while-revalidate
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class HTTPCacheClient {

    record CacheEntry(String url, byte[] body, Map<String, String> headers,
                      String etag, String lastModified, int maxAge,
                      Instant storedAt, int staleWhileRevalidate) {

        public double age() {
            return Duration.between(storedAt, Instant.now()).toMillis() / 1000.0;
        }

        public boolean isFresh() {
            return age() < maxAge;
        }

        // Can serve stale while revalidating in background
        public boolean isStaleButUsable() {
            return age() < (maxAge + staleWhileRevalidate);
        }
    }

    private final HttpClient httpClient;
    private final Map<String, CacheEntry> cache = new ConcurrentHashMap<>();
    private final ExecutorService revalidationExecutor = Executors.newCachedThreadPool();

    public HTTPCacheClient() {
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    /**
     * Parse Cache-Control header into directives.
     */
    private Map<String, String> parseCacheControl(String header) {
        Map<String, String> directives = new HashMap<>();
        if (header == null || header.isBlank()) return directives;

        for (String part : header.split(",")) {
            String trimmed = part.trim();
            if (trimmed.contains("=")) {
                String[] kv = trimmed.split("=", 2);
                directives.put(kv[0].trim(), kv[1].trim());
            } else {
                directives.put(trimmed, "true");
            }
        }
        return directives;
    }

    /**
     * Fetch URL with caching and conditional request support.
     */
    public Map.Entry<byte[], Map<String, String>> get(String url) throws Exception {
        CacheEntry cached = cache.get(url);

        if (cached != null) {
            if (cached.isFresh()) {
                // Cache hit — serve directly
                Map<String, String> headers = new HashMap<>(cached.headers());
                headers.put("x-cache", "HIT");
                return Map.entry(cached.body(), headers);
            }

            if (cached.isStaleButUsable()) {
                // Serve stale, revalidate in background
                revalidationExecutor.submit(() -> {
                    try { conditionalGet(url, cached); } catch (Exception ignored) {}
                });
                Map<String, String> headers = new HashMap<>(cached.headers());
                headers.put("x-cache", "STALE");
                return Map.entry(cached.body(), headers);
            }

            // Stale and not usable — must revalidate synchronously
            return conditionalGet(url, cached);
        }

        // No cache entry — full fetch
        return fullFetch(url);
    }

    /**
     * Send conditional request using ETag or Last-Modified.
     */
    private Map.Entry<byte[], Map<String, String>> conditionalGet(
            String url, CacheEntry cached) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder().uri(URI.create(url));

        if (cached.etag() != null) {
            builder.header("If-None-Match", cached.etag());
        }
        if (cached.lastModified() != null) {
            builder.header("If-Modified-Since", cached.lastModified());
        }

        HttpResponse<byte[]> response = httpClient.send(
                builder.build(), HttpResponse.BodyHandlers.ofByteArray());

        if (response.statusCode() == 304) {
            // Not modified — refresh cache TTL
            store(url, cached.body(), cached.headers());
            Map<String, String> headers = new HashMap<>(cached.headers());
            headers.put("x-cache", "REVALIDATED");
            return Map.entry(cached.body(), headers);
        }

        // Modified — store new response
        Map<String, String> respHeaders = flattenHeaders(response);
        store(url, response.body(), respHeaders);
        respHeaders.put("x-cache", "UPDATED");
        return Map.entry(response.body(), respHeaders);
    }

    /**
     * Full fetch without cache.
     */
    private Map.Entry<byte[], Map<String, String>> fullFetch(String url) throws Exception {
        HttpRequest request = HttpRequest.newBuilder().uri(URI.create(url)).build();
        HttpResponse<byte[]> response = httpClient.send(
                request, HttpResponse.BodyHandlers.ofByteArray());

        Map<String, String> respHeaders = flattenHeaders(response);
        store(url, response.body(), respHeaders);
        respHeaders.put("x-cache", "MISS");
        return Map.entry(response.body(), respHeaders);
    }

    /**
     * Store response in cache based on Cache-Control directives.
     */
    private void store(String url, byte[] body, Map<String, String> headers) {
        String ccHeader = headers.getOrDefault("cache-control",
                headers.getOrDefault("Cache-Control", ""));
        Map<String, String> cacheControl = parseCacheControl(ccHeader);

        // Don't cache if explicitly forbidden
        if (cacheControl.containsKey("no-store")) return;

        int maxAge = Integer.parseInt(cacheControl.getOrDefault("max-age", "0"));
        int swr = Integer.parseInt(cacheControl.getOrDefault("stale-while-revalidate", "0"));

        if (maxAge > 0) {
            cache.put(url, new CacheEntry(
                    url, body, headers,
                    headers.getOrDefault("ETag", headers.get("etag")),
                    headers.getOrDefault("Last-Modified", headers.get("last-modified")),
                    maxAge, Instant.now(), swr
            ));
        }
    }

    private Map<String, String> flattenHeaders(HttpResponse<?> response) {
        Map<String, String> flat = new HashMap<>();
        response.headers().map().forEach((key, values) -> {
            if (!values.isEmpty()) flat.put(key, values.get(0));
        });
        return flat;
    }
}
```

```nginx
# Nginx HTTP/2 configuration with caching and connection management
upstream backend {
    server 10.0.1.1:8080 weight=3;
    server 10.0.1.2:8080 weight=2;
    server 10.0.1.3:8080 weight=1;
    
    # Keep persistent connections to upstream
    keepalive 64;
    keepalive_requests 1000;
    keepalive_timeout 60s;
}

server {
    listen 443 ssl http2;
    server_name api.example.com;
    
    # TLS configuration
    ssl_certificate /etc/ssl/certs/server.crt;
    ssl_certificate_key /etc/ssl/private/server.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    
    # HTTP/2 settings
    http2_max_concurrent_streams 128;
    http2_idle_timeout 300s;
    
    # Gzip compression
    gzip on;
    gzip_types application/json text/css application/javascript;
    gzip_min_length 256;
    
    # Static assets — aggressive caching
    location /static/ {
        root /var/www;
        
        # Immutable assets with content hash in filename
        add_header Cache-Control "public, max-age=31536000, immutable";
        add_header Vary "Accept-Encoding";
        
        # Enable sendfile for zero-copy serving
        sendfile on;
        tcp_nopush on;
    }
    
    # API endpoints — conditional caching
    location /api/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";  # Enable keepalive to upstream
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Request-ID $request_id;
        
        # Timeouts
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
        proxy_send_timeout 10s;
        
        # Response caching with stale-while-revalidate
        add_header Cache-Control "private, max-age=0, stale-while-revalidate=60";
        
        # Proxy cache for shared responses
        proxy_cache api_cache;
        proxy_cache_valid 200 60s;
        proxy_cache_valid 404 10s;
        proxy_cache_use_stale error timeout updating;
        proxy_cache_lock on;  # Collapse concurrent cache misses
    }
}

# Proxy cache zone definition
proxy_cache_path /var/cache/nginx/api 
    levels=1:2 
    keys_zone=api_cache:10m 
    max_size=1g 
    inactive=60m 
    use_temp_path=off;
```

## Common Pitfalls

- **Not understanding `Cache-Control` directive interactions**: `no-cache` does NOT mean "don't cache" — it means "cache but always revalidate before serving." `no-store` means "don't cache at all." `private` means "only browser can cache, not CDN/proxy." `public` means "any cache can store this." Misunderstanding these leads to either over-caching (serving stale personalized data) or under-caching (unnecessary origin load).

- **Ignoring the `Vary` header for cached responses**: If a response varies by `Accept-Encoding` but the cache doesn't include this in the cache key, a gzipped response cached from one client may be served to a client that doesn't support gzip. Always set `Vary` headers correctly, but be aware that over-varying (e.g., `Vary: Cookie`) effectively disables shared caching since every user has different cookies.

- **HTTP/2 without proper connection management**: HTTP/2's single connection per origin means a single slow stream can consume the entire connection's flow control window. Configure `SETTINGS_MAX_CONCURRENT_STREAMS` appropriately (100-250), implement per-stream timeouts, and use `GOAWAY` frames for graceful connection draining during deployments. Without these, a misbehaving client can monopolize server resources.

- **Head-of-line blocking confusion across protocol versions**: HTTP/1.1 has application-layer HOL blocking (responses must be in order). HTTP/2 eliminates this but introduces TCP-layer HOL blocking (one lost packet blocks all streams). HTTP/3 eliminates both by using independent QUIC streams. Engineers often deploy HTTP/2 expecting all HOL blocking to disappear, then are surprised by tail latency on lossy networks.

- **Misconfiguring connection timeouts causing cascading failures**: Setting read timeouts too high (or not at all) means a slow downstream ties up connections indefinitely. With a fixed connection pool, this exhausts available connections and cascades to all requests. Always set connect timeout (1-5s), read timeout (5-30s), and total request timeout independently. The total timeout should be less than your upstream's timeout to avoid retry amplification.

- **Not leveraging conditional requests for API responses**: Many APIs return the same data repeatedly (user profiles, configuration, reference data). Without ETags and `If-None-Match`, every request transfers the full response body. Implementing conditional requests can reduce bandwidth by 60-80% for read-heavy APIs and significantly reduce response latency (304 responses have no body).

## Real-World Use Cases

**API Gateway Caching**: API gateways (Kong, AWS API Gateway, Envoy) cache responses based on HTTP caching headers, reducing backend load for frequently-accessed endpoints. A product catalog API with `Cache-Control: public, max-age=60, stale-while-revalidate=300` serves cached responses for 60 seconds, then serves stale for up to 5 minutes while revalidating in the background. This pattern handles traffic spikes gracefully — even if the backend is slow, cached responses continue serving.

**gRPC over HTTP/2**: gRPC uses HTTP/2 as its transport, leveraging multiplexing for concurrent RPCs over a single connection, header compression for reducing metadata overhead, and flow control for backpressure. Understanding HTTP/2 framing is essential for debugging gRPC issues — tools like `grpcurl` and Envoy's access logs expose HTTP/2 stream IDs, WINDOW_UPDATE frames, and RST_STREAM errors that map directly to gRPC status codes.

**Progressive Web App Resource Loading**: Modern web applications use HTTP/2 multiplexing to load dozens of JavaScript chunks, CSS files, and images over a single connection. Resource hints (`<link rel="preload">`, `<link rel="prefetch">`) combined with HTTP/2 server push and proper `Cache-Control` headers (immutable for hashed assets, no-cache for HTML) create optimal loading patterns. The browser's HTTP cache, service worker cache, and CDN cache form a multi-tier caching hierarchy.

**Microservice Communication Patterns**: Internal service-to-service HTTP communication uses connection pooling (reusing TCP+TLS connections), HTTP/2 multiplexing (multiple concurrent requests per connection), retry with exponential backoff (for transient failures), and circuit breaking (failing fast when a downstream is degraded). Libraries like Envoy proxy, Linkerd, and Istio implement these patterns transparently as a sidecar, adding observability (request duration histograms, error rates) without application code changes.

## Interview Questions

**Q: Explain the differences between HTTP/1.1, HTTP/2, and HTTP/3 and when you'd choose each.**

A: HTTP/1.1 uses text-based request/response over TCP with persistent connections. Its main limitation is head-of-line blocking — responses must arrive in request order per connection, so browsers open 6-8 connections per origin. HTTP/2 uses binary framing with stream multiplexing over a single TCP connection, eliminating application-layer HOL blocking. It adds HPACK header compression and server push. However, TCP-level HOL blocking persists — one lost packet blocks all streams. HTTP/3 replaces TCP with QUIC (over UDP), providing independent stream multiplexing (no transport HOL blocking), integrated TLS 1.3 (1-RTT or 0-RTT establishment), and connection migration (survives IP changes). Choose HTTP/1.1 for maximum compatibility, HTTP/2 for web applications and gRPC, HTTP/3 for mobile-heavy or high-latency scenarios.

**Q: How does HTTP caching work, and how would you design a caching strategy for a web application?**

A: HTTP caching uses `Cache-Control` headers to define caching behavior. For static assets with content hashes in filenames (e.g., `app.a3f2b1.js`), use `Cache-Control: public, max-age=31536000, immutable` — cache forever since the URL changes when content changes. For HTML pages, use `Cache-Control: no-cache` with an `ETag` — always revalidate but avoid re-downloading if unchanged (304 response). For API responses, use `Cache-Control: private, max-age=0, stale-while-revalidate=60` — don't serve stale to shared caches, but allow the browser to serve stale for 60 seconds while revalidating in the background. The `Vary` header ensures caches store separate entries for different request variations (encoding, language, auth state).

**Q: What happens at the HTTP level during a connection upgrade to WebSocket or HTTP/2?**

A: For WebSocket upgrade: the client sends a standard HTTP/1.1 GET request with `Connection: Upgrade`, `Upgrade: websocket`, and a `Sec-WebSocket-Key` header. The server responds with `101 Switching Protocols`, `Connection: Upgrade`, `Upgrade: websocket`, and `Sec-WebSocket-Accept` (a hash of the client's key). After this exchange, the TCP connection switches from HTTP framing to WebSocket framing. For HTTP/2: the client can upgrade from HTTP/1.1 using the `Upgrade: h2c` header (cleartext) or, more commonly, negotiate HTTP/2 during the TLS handshake via ALPN (Application-Layer Protocol Negotiation). The client includes `h2` in the ALPN extension, and if the server supports it, both sides switch to HTTP/2 binary framing after the TLS handshake completes.

**Q: How would you debug a "slow API" complaint using HTTP-level tools?**

A: Break down the request lifecycle: DNS resolution time (dig/nslookup), TCP connection time (time to SYN-ACK), TLS handshake time (time to encrypted), time to first byte (TTFB, server processing), and content download time. Use `curl -w` with timing variables or browser DevTools Network tab waterfall. Check if the issue is connection reuse (are new connections being established per request?), compression (is the response gzipped?), caching (are conditional requests returning 304 or full 200?), or server processing (high TTFB). For intermittent issues, check for TCP retransmissions (packet loss causing 200ms+ delays), DNS resolution spikes, or connection pool exhaustion (requests queuing for available connections).

## Production Tips

- **Implement request coalescing for cache stampedes**: When a cached response expires and 1000 concurrent requests arrive, without coalescing all 1000 hit the origin simultaneously (thundering herd). Use cache locks (Nginx `proxy_cache_lock`), request coalescing (Varnish), or stale-while-revalidate to serve stale content while a single request refreshes the cache. This is critical for high-traffic endpoints with expensive backend computation.

- **Monitor HTTP/2 connection multiplexing efficiency**: Track streams-per-connection and connection count per origin. If you see many connections with few streams each, something is preventing multiplexing (misconfigured proxy, connection limits, or TLS certificate mismatch causing connection coalescing failure). Ideal state: 1-2 connections per origin with high stream concurrency.

- **Set response timeouts shorter than caller timeouts**: If service A calls service B with a 10-second timeout, service B should have internal timeouts of 8 seconds. This ensures B returns a proper error response (504 or 503 with retry-after) rather than A timing out and getting no response. This principle applies at every hop in a call chain.

- **Use `103 Early Hints` for critical resource preloading**: HTTP 103 responses let the server send `Link: </style.css>; rel=preload` headers before the final response is ready, allowing the browser to start fetching critical resources while the server computes the response. This can reduce page load time by 100-500ms for pages with expensive server-side rendering.

## Related Topics

- [TCP/IP](./tcp-ip.md) — HTTP/1.1 and HTTP/2 rely on TCP for transport; understanding TCP behavior explains HTTP performance characteristics
- [TLS & mTLS](./tls-mtls.md) — HTTPS adds TLS encryption between HTTP and TCP, and HTTP/3 integrates TLS into QUIC
- [WebSockets](./websockets.md) — WebSocket connections begin with an HTTP Upgrade handshake before switching to bidirectional framing
- [Load Balancing](./load-balancing.md) — L7 load balancers operate at the HTTP layer, making routing decisions based on headers, URLs, and cookies
