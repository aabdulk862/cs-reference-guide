# Security

Security is the discipline of protecting systems, data, and users from unauthorized access, manipulation, and disruption. In modern software engineering, security is not a bolt-on feature but a fundamental architectural concern that spans every layer of the stack — from cryptographic primitives at the lowest level to authentication flows at the application boundary to network policies at the infrastructure edge.

This topic directory provides a comprehensive, production-oriented reference covering the critical domains of security that every senior engineer must understand. Whether you're designing an OAuth 2.0 integration, hardening container deployments, or preparing for system design interviews that probe your security knowledge, these guides offer both theoretical depth and practical implementation patterns.

## Learning Path

Follow this numbered sequence for a structured progression from fundamentals to advanced topics:

1. **[Cryptography Fundamentals](./cryptography-fundamentals.md)** — Start here to understand the mathematical primitives (encryption, hashing, signatures) that underpin all other security mechanisms
2. **[Authentication Patterns](./authentication-patterns.md)** — Build on crypto knowledge to understand how identity verification works with OAuth 2.0, OIDC, SAML, and JWT
3. **[Web Application Security](./web-application-security.md)** — Apply authentication and crypto concepts to defend against XSS, CSRF, SQL injection, and other application-layer attacks
4. **[Network Security](./network-security.md)** — Expand your scope to network-level protections including firewalls, VPNs, zero-trust architecture, and DDoS mitigation
5. **[Container Security](./container-security.md)** — Integrate all prior knowledge into securing modern containerized deployments with image scanning, runtime policies, and supply chain security
6. **[Backend Security](./security.md)** — Application-level security patterns, input validation, and secure coding practices

Each topic builds on concepts from previous entries. Cryptography provides the tools, authentication applies them to identity, web security defends the application layer, network security protects the transport layer, and container security ties everything together in modern deployment environments.
