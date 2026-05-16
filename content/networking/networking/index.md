# Networking

Networking is the backbone of every distributed system, web application, and cloud-native architecture. Understanding how data traverses the internet — from DNS resolution through TCP connections, TLS encryption, HTTP exchanges, and load balancer routing — separates engineers who build resilient systems from those who debug mysterious production failures.

This topic covers the full networking stack relevant to modern software engineering: the protocols that move data reliably, the systems that route and balance traffic, the security layers that protect communication, and the real-time patterns that enable interactive applications. Each subtopic provides production-oriented depth with code examples, common pitfalls, and interview preparation material targeting senior-level engineers.

Whether you're designing a global microservice architecture, optimizing API latency, implementing real-time features, or preparing for system design interviews, these networking fundamentals form the foundation for every decision you'll make about how services communicate.

## Learning Path

1. [TCP/IP](./tcp-ip.md) — Start here to understand the foundational protocol stack, connection lifecycle, congestion control, and socket programming
2. [DNS](./dns.md) — Learn how names resolve to addresses, caching behavior, record types, and DNS-based traffic management
3. [HTTP](./http.md) — Master HTTP/1.1 through HTTP/3, connection management, caching strategies, and protocol evolution
4. [WebSockets](./websockets.md) — Understand full-duplex communication, connection lifecycle, scaling patterns, and real-time alternatives
5. [Load Balancing](./load-balancing.md) — Explore L4 vs L7 balancing, routing algorithms, health checks, and session affinity
6. [TLS & mTLS](./tls-mtls.md) — Deep dive into TLS handshakes, certificate chains, mutual authentication, and certificate rotation
