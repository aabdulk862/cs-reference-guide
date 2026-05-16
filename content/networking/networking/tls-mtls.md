# TLS & mTLS

## Quick Reference

- TLS 1.3 handshake completes in 1-RTT (down from 2-RTT in TLS 1.2) and supports 0-RTT resumption for repeat connections
- Certificate chain: server cert → intermediate CA → root CA; browsers trust ~150 root CAs in their trust store
- TLS 1.3 removed insecure algorithms: no RSA key exchange (forward secrecy mandatory), no CBC mode, no RC4, no SHA-1
- Key exchange uses ephemeral Diffie-Hellman (ECDHE) exclusively in TLS 1.3, providing forward secrecy by default
- mTLS (mutual TLS) requires BOTH client and server to present certificates — used for service-to-service authentication in zero-trust architectures
- ALPN (Application-Layer Protocol Negotiation) selects the application protocol (h2, http/1.1) during the TLS handshake
- Certificate transparency (CT) logs provide public audit trail of all issued certificates, detecting misissued or rogue certificates
- OCSP stapling allows the server to include certificate revocation status in the handshake, avoiding client-side OCSP lookups
- SNI (Server Name Indication) allows multiple TLS certificates on a single IP address by including the hostname in ClientHello

## When to Use

TLS is mandatory for any communication over untrusted networks — which in a zero-trust model means ALL network communication, including internal service-to-service traffic. Use TLS for HTTPS (web traffic), database connections, message broker connections, gRPC, and any protocol carrying sensitive data. There is no legitimate reason to use unencrypted communication in production for any service handling user data.

mTLS (mutual TLS) is appropriate when you need strong authentication of both parties in a connection, beyond what bearer tokens or API keys provide. Use mTLS for: service-to-service communication in microservice architectures (service mesh), API access from trusted partners, IoT device authentication, and any scenario where you need cryptographic proof of the caller's identity. Service meshes (Istio, Linkerd) implement mTLS transparently via sidecar proxies, handling certificate issuance, rotation, and verification without application code changes.

Certificate rotation and lifecycle management become critical at scale. Manual certificate management breaks down beyond a handful of services. Use automated certificate management (cert-manager in Kubernetes, AWS ACM, Let's Encrypt with ACME protocol) for external certificates, and a private CA (Vault PKI, AWS Private CA, step-ca) for internal mTLS certificates with short lifetimes (24-72 hours).

## Code Examples

```go
// mTLS server and client implementation with certificate verification
package main

import (
    "crypto/tls"
    "crypto/x509"
    "fmt"
    "io"
    "log"
    "net/http"
    "os"
    "time"
)

// CreateMTLSServer creates an HTTP server requiring client certificates
func CreateMTLSServer(
    certFile, keyFile, clientCAFile string,
    port int,
) *http.Server {
    // Load CA certificate for verifying client certs
    clientCACert, err := os.ReadFile(clientCAFile)
    if err != nil {
        log.Fatalf("Failed to read client CA: %v", err)
    }
    
    clientCAPool := x509.NewCertPool()
    if !clientCAPool.AppendCertsFromPEM(clientCACert) {
        log.Fatal("Failed to parse client CA certificate")
    }
    
    tlsConfig := &tls.Config{
        // Require and verify client certificates (mTLS)
        ClientAuth: tls.RequireAndVerifyClientCert,
        ClientCAs:  clientCAPool,
        
        // TLS 1.3 only
        MinVersion: tls.VersionTLS13,
        MaxVersion: tls.VersionTLS13,
        
        // Prefer server cipher suites
        // (TLS 1.3 cipher suites are not configurable — all are secure)
        
        // Session ticket rotation for forward secrecy of resumed sessions
        SessionTicketsDisabled: false,
    }
    
    mux := http.NewServeMux()
    mux.HandleFunc("/api/data", func(w http.ResponseWriter, r *http.Request) {
        // Access verified client certificate information
        if r.TLS != nil && len(r.TLS.PeerCertificates) > 0 {
            clientCert := r.TLS.PeerCertificates[0]
            
            // Extract client identity from certificate
            clientID := clientCert.Subject.CommonName
            clientOrg := ""
            if len(clientCert.Subject.Organization) > 0 {
                clientOrg = clientCert.Subject.Organization[0]
            }
            
            // Check certificate SANs for service identity
            fmt.Printf("Request from: %s (org: %s, SANs: %v)\n",
                clientID, clientOrg, clientCert.DNSNames)
            
            // Authorization based on client certificate identity
            if !isAuthorized(clientID, r.URL.Path) {
                http.Error(w, "Forbidden", http.StatusForbidden)
                return
            }
            
            w.Header().Set("Content-Type", "application/json")
            fmt.Fprintf(w, `{"message":"Hello %s","authenticated":true}`, clientID)
        }
    })
    
    server := &http.Server{
        Addr:      fmt.Sprintf(":%d", port),
        Handler:   mux,
        TLSConfig: tlsConfig,
        
        // Timeouts to prevent slow client attacks
        ReadTimeout:       10 * time.Second,
        WriteTimeout:      10 * time.Second,
        IdleTimeout:       120 * time.Second,
        ReadHeaderTimeout: 5 * time.Second,
    }
    
    return server
}

// CreateMTLSClient creates an HTTP client with client certificate
func CreateMTLSClient(
    clientCertFile, clientKeyFile, serverCAFile string,
) *http.Client {
    // Load client certificate and key
    clientCert, err := tls.LoadX509KeyPair(clientCertFile, clientKeyFile)
    if err != nil {
        log.Fatalf("Failed to load client cert: %v", err)
    }
    
    // Load CA certificate for verifying server
    serverCACert, err := os.ReadFile(serverCAFile)
    if err != nil {
        log.Fatalf("Failed to read server CA: %v", err)
    }
    
    serverCAPool := x509.NewCertPool()
    serverCAPool.AppendCertsFromPEM(serverCACert)
    
    tlsConfig := &tls.Config{
        Certificates: []tls.Certificate{clientCert},
        RootCAs:      serverCAPool,
        MinVersion:   tls.VersionTLS13,
        
        // Verify server hostname matches certificate
        // (default behavior, shown explicitly)
        InsecureSkipVerify: false,
    }
    
    transport := &http.Transport{
        TLSClientConfig:     tlsConfig,
        MaxIdleConns:        100,
        MaxIdleConnsPerHost: 10,
        IdleConnTimeout:     90 * time.Second,
        
        // TLS handshake timeout
        TLSHandshakeTimeout: 10 * time.Second,
    }
    
    return &http.Client{
        Transport: transport,
        Timeout:   30 * time.Second,
    }
}

func isAuthorized(clientID, path string) bool {
    // Example: service-level authorization based on certificate CN
    allowedServices := map[string][]string{
        "payment-service": {"/api/data", "/api/transactions"},
        "user-service":    {"/api/data", "/api/users"},
    }
    
    paths, exists := allowedServices[clientID]
    if !exists {
        return false
    }
    for _, p := range paths {
        if p == path {
            return true
        }
    }
    return false
}

func main() {
    // Start mTLS server
    server := CreateMTLSServer(
        "server.crt", "server.key", "client-ca.crt", 8443)
    
    go func() {
        log.Printf("mTLS server listening on :8443")
        if err := server.ListenAndServeTLS("server.crt", "server.key"); err != nil {
            log.Fatal(err)
        }
    }()
    
    // Create mTLS client and make request
    time.Sleep(time.Second) // Wait for server to start
    client := CreateMTLSClient("client.crt", "client.key", "server-ca.crt")
    
    resp, err := client.Get("https://localhost:8443/api/data")
    if err != nil {
        log.Fatalf("Request failed: %v", err)
    }
    defer resp.Body.Close()
    
    body, _ := io.ReadAll(resp.Body)
    fmt.Printf("Response: %s\n", body)
}
```

```python
# Certificate management and rotation with automatic renewal
import ssl
import os
import time
import threading
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Callable
from datetime import datetime, timedelta
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec

@dataclass
class CertificateInfo:
    path: Path
    key_path: Path
    not_before: datetime
    not_after: datetime
    subject_cn: str
    issuer_cn: str
    san_dns: list[str]
    serial_number: int
    
    @property
    def remaining_lifetime(self) -> timedelta:
        return self.not_after - datetime.utcnow()
    
    @property
    def lifetime_percentage_remaining(self) -> float:
        total = (self.not_after - self.not_before).total_seconds()
        remaining = self.remaining_lifetime.total_seconds()
        return max(0, remaining / total * 100)
    
    @property
    def needs_renewal(self) -> bool:
        # Renew when less than 30% of lifetime remains
        return self.lifetime_percentage_remaining < 30

class CertificateRotator:
    """Manages TLS certificate lifecycle with automatic rotation."""
    
    def __init__(self, cert_dir: str, renewal_callback: Optional[Callable] = None):
        self.cert_dir = Path(cert_dir)
        self.renewal_callback = renewal_callback
        self._running = False
        self._check_interval = 3600  # Check every hour
        self._certificates: dict[str, CertificateInfo] = {}
    
    def load_certificate(self, name: str, cert_path: str, 
                        key_path: str) -> CertificateInfo:
        """Load and parse a certificate file."""
        with open(cert_path, 'rb') as f:
            cert_data = f.read()
        
        cert = x509.load_pem_x509_certificate(cert_data)
        
        # Extract SAN DNS names
        san_dns = []
        try:
            san_ext = cert.extensions.get_extension_for_class(
                x509.SubjectAlternativeName)
            san_dns = san_ext.value.get_values_for_type(x509.DNSName)
        except x509.ExtensionNotFound:
            pass
        
        info = CertificateInfo(
            path=Path(cert_path),
            key_path=Path(key_path),
            not_before=cert.not_valid_before,
            not_after=cert.not_valid_after,
            subject_cn=cert.subject.get_attributes_for_oid(
                NameOID.COMMON_NAME)[0].value,
            issuer_cn=cert.issuer.get_attributes_for_oid(
                NameOID.COMMON_NAME)[0].value,
            san_dns=san_dns,
            serial_number=cert.serial_number,
        )
        
        self._certificates[name] = info
        print(f"Loaded certificate '{name}': CN={info.subject_cn}, "
              f"expires={info.not_after}, "
              f"remaining={info.lifetime_percentage_remaining:.1f}%")
        
        return info
    
    def generate_csr(self, common_name: str, san_dns: list[str],
                     output_dir: Optional[str] = None) -> tuple[bytes, bytes]:
        """Generate a new private key and CSR for certificate renewal."""
        # Generate EC private key (P-256)
        private_key = ec.generate_private_key(ec.SECP256R1())
        
        # Build CSR
        subject = x509.Name([
            x509.NameAttribute(NameOID.COMMON_NAME, common_name),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Internal Services"),
        ])
        
        builder = x509.CertificateSigningRequestBuilder()
        builder = builder.subject_name(subject)
        
        # Add SANs
        if san_dns:
            builder = builder.add_extension(
                x509.SubjectAlternativeName(
                    [x509.DNSName(name) for name in san_dns]
                ),
                critical=False,
            )
        
        csr = builder.sign(private_key, hashes.SHA256())
        
        # Serialize
        key_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        csr_pem = csr.public_bytes(serialization.Encoding.PEM)
        
        if output_dir:
            key_path = Path(output_dir) / f"{common_name}.key"
            csr_path = Path(output_dir) / f"{common_name}.csr"
            key_path.write_bytes(key_pem)
            csr_path.write_bytes(csr_pem)
            # Restrict key file permissions
            os.chmod(key_path, 0o600)
        
        return key_pem, csr_pem
    
    def renew_with_vault(self, name: str, vault_pki_path: str,
                         common_name: str, san_dns: list[str],
                         ttl: str = "72h") -> CertificateInfo:
        """Renew certificate using HashiCorp Vault PKI engine."""
        # Generate new key and CSR
        key_pem, csr_pem = self.generate_csr(common_name, san_dns)
        
        # Request certificate from Vault
        # (In production, use hvac library or Vault agent)
        import json
        result = subprocess.run(
            ["vault", "write", "-format=json",
             f"{vault_pki_path}/sign/service-role",
             f"common_name={common_name}",
             f"alt_names={','.join(san_dns)}",
             f"ttl={ttl}",
             f"csr={csr_pem.decode()}"],
            capture_output=True, text=True
        )
        
        if result.returncode != 0:
            raise RuntimeError(f"Vault signing failed: {result.stderr}")
        
        response = json.loads(result.stdout)
        cert_pem = response['data']['certificate']
        ca_chain = response['data']['ca_chain']
        
        # Write new certificate (atomic write via rename)
        cert_info = self._certificates[name]
        new_cert_path = cert_info.path.with_suffix('.new')
        new_key_path = cert_info.key_path.with_suffix('.new')
        
        # Write full chain (cert + intermediates)
        full_chain = cert_pem + '\n' + '\n'.join(ca_chain)
        new_cert_path.write_text(full_chain)
        new_key_path.write_bytes(key_pem)
        os.chmod(new_key_path, 0o600)
        
        # Atomic rotation
        os.rename(new_cert_path, cert_info.path)
        os.rename(new_key_path, cert_info.key_path)
        
        # Reload certificate info
        new_info = self.load_certificate(name, str(cert_info.path),
                                         str(cert_info.key_path))
        
        # Notify application to reload TLS config
        if self.renewal_callback:
            self.renewal_callback(name, new_info)
        
        print(f"Certificate '{name}' renewed successfully. "
              f"New expiry: {new_info.not_after}")
        
        return new_info
    
    def start_rotation_loop(self):
        """Start background thread checking for certificate renewal."""
        self._running = True
        thread = threading.Thread(target=self._rotation_loop, daemon=True)
        thread.start()
    
    def _rotation_loop(self):
        while self._running:
            for name, info in list(self._certificates.items()):
                if info.needs_renewal:
                    print(f"Certificate '{name}' needs renewal "
                          f"({info.lifetime_percentage_remaining:.1f}% remaining)")
                    try:
                        self.renew_with_vault(
                            name, "pki_int", info.subject_cn, info.san_dns)
                    except Exception as e:
                        print(f"Renewal failed for '{name}': {e}")
            
            time.sleep(self._check_interval)
    
    def create_ssl_context(self, name: str, 
                           purpose: ssl.Purpose = ssl.Purpose.CLIENT_AUTH
                           ) -> ssl.SSLContext:
        """Create an SSL context using managed certificates."""
        info = self._certificates[name]
        
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT 
                                if purpose == ssl.Purpose.SERVER_AUTH 
                                else ssl.PROTOCOL_TLS_SERVER)
        context.minimum_version = ssl.TLSVersion.TLSv1_3
        context.load_cert_chain(str(info.path), str(info.key_path))
        
        return context
```

```yaml
# Kubernetes cert-manager configuration for automatic TLS certificate management
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: platform-team@example.com
    privateKeySecretRef:
      name: letsencrypt-prod-key
    solvers:
      - http01:
          ingress:
            class: nginx
      - dns01:
          route53:
            region: us-east-1
            hostedZoneID: Z1234567890
        selector:
          dnsZones:
            - "example.com"
---
# Internal CA for mTLS between services
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: internal-ca
spec:
  ca:
    secretName: internal-ca-key-pair
---
# Certificate for a service (auto-renewed before expiry)
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: payment-service-tls
  namespace: payments
spec:
  secretName: payment-service-tls-secret
  duration: 72h          # Short-lived for security
  renewBefore: 24h       # Renew 24h before expiry
  isCA: false
  privateKey:
    algorithm: ECDSA
    size: 256
  usages:
    - server auth
    - client auth        # Enable mTLS (both server and client)
  dnsNames:
    - payment-service
    - payment-service.payments.svc.cluster.local
    - payment-service.payments.svc
  issuerRef:
    name: internal-ca
    kind: ClusterIssuer
---
# Istio PeerAuthentication enforcing mTLS
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: payments
spec:
  mtls:
    mode: STRICT         # Reject any non-mTLS traffic
---
# Istio DestinationRule configuring mTLS for outbound
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: payment-service
  namespace: payments
spec:
  host: payment-service.payments.svc.cluster.local
  trafficPolicy:
    tls:
      mode: ISTIO_MUTUAL  # Use Istio-managed certificates
```

## Common Pitfalls

- **Not implementing certificate rotation before expiry**: Certificates expire, and expired certificates cause immediate outages. Automated renewal must trigger well before expiry (at 2/3 of lifetime for short-lived certs, 30 days before for long-lived ones). Monitor certificate expiry across ALL endpoints — including internal services, load balancers, CDN origins, and database connections. Let's Encrypt certificates expire after 90 days; without automation, this is a recurring outage risk.

- **Trusting self-signed certificates by disabling verification**: Setting `InsecureSkipVerify: true` or `verify=False` in development and accidentally shipping it to production completely negates TLS security — any attacker can present any certificate and intercept traffic. Instead, add your internal CA to the trust store. If you must use self-signed certs in development, use a development CA and add it to the local trust store properly.

- **Incomplete certificate chains**: Servers must send the full certificate chain (server cert + intermediate CAs) — not just the leaf certificate. Missing intermediates cause failures on clients that don't have the intermediate cached. This manifests as "works in Chrome but fails in curl" because browsers often cache intermediates from previous connections. Always verify your chain with `openssl s_client -connect host:443 -showcerts`.

- **Not implementing certificate pinning correctly**: Certificate pinning (trusting only specific certificates or public keys) prevents CA compromise attacks but creates operational risk — if you lose the pinned key or need to rotate, clients reject the new certificate. Always pin to a backup key, implement pin rotation with overlap periods, and have a recovery mechanism. HPKP (HTTP Public Key Pinning) was deprecated because misconfiguration caused permanent lockouts.

- **Ignoring TLS version and cipher suite configuration**: Allowing TLS 1.0/1.1 or weak cipher suites (RC4, 3DES, export ciphers) exposes connections to known attacks (BEAST, POODLE, SWEET32). Configure minimum TLS 1.2 (preferably 1.3), disable CBC mode ciphers in TLS 1.2, and prefer ECDHE key exchange for forward secrecy. Scan your endpoints regularly with tools like SSL Labs or testssl.sh.

- **mTLS certificate scope too broad**: Issuing a single client certificate used by all services defeats the purpose of mTLS for authorization. Each service should have its own certificate with a unique identity (CN or SAN), enabling fine-grained authorization policies. Service meshes handle this automatically by issuing per-pod SPIFFE identities.

## Real-World Use Cases

**Service Mesh mTLS (Istio/Linkerd)**: Service meshes inject sidecar proxies that handle mTLS transparently. Istio's Citadel (now istiod) acts as a CA, issuing short-lived SPIFFE certificates (24-hour lifetime) to each pod. All pod-to-pod traffic is encrypted and authenticated without application code changes. The mesh enforces authorization policies based on service identity (SPIFFE ID), enabling zero-trust networking where every request is authenticated regardless of network location.

**Let's Encrypt and ACME Protocol**: Let's Encrypt issues free TLS certificates using the ACME (Automatic Certificate Management Environment) protocol. The client proves domain ownership via HTTP-01 challenge (serving a token at `/.well-known/acme-challenge/`) or DNS-01 challenge (creating a TXT record). Certificates are valid for 90 days, encouraging automation. cert-manager in Kubernetes automates the entire lifecycle: CSR generation, challenge solving, certificate issuance, secret creation, and renewal.

**Zero-Trust Network Architecture**: Organizations like Google (BeyondCorp) and Netflix implement zero-trust by requiring mTLS for all internal communication, regardless of network location. Every service authenticates via certificate, every request is authorized based on identity and context, and network perimeter is not trusted. This eliminates lateral movement after a breach — compromising one service doesn't grant access to others without valid certificates.

**Financial Services Compliance**: Banking and payment systems use mTLS for PCI-DSS compliance, ensuring all cardholder data transmission is encrypted and both parties are authenticated. Hardware Security Modules (HSMs) protect private keys, certificate lifetimes are short (hours to days), and certificate revocation is checked in real-time via OCSP stapling. Audit trails track every certificate issuance and usage for regulatory compliance.

**IoT Device Authentication**: IoT platforms use client certificates to authenticate devices, with each device provisioned with a unique certificate during manufacturing. The device certificate identifies the device, authorizes its API access, and enables encrypted communication. Certificate rotation for millions of devices requires careful orchestration — devices must fetch new certificates before the old ones expire, handling intermittent connectivity gracefully.

## Interview Questions

**Q: Walk through the TLS 1.3 handshake and explain how it achieves 1-RTT.**

A: In TLS 1.3, the client sends ClientHello with supported cipher suites AND key shares (guessing which key exchange the server will choose — typically X25519 or P-256). The server responds with ServerHello (chosen cipher suite and its key share), encrypted extensions, its certificate, and a Finished message — all in one flight. The client verifies the certificate, computes the shared secret from the key shares, sends its Finished message, and can immediately send application data. This is 1-RTT because the client sends data after receiving one server response. For resumed connections, 0-RTT is possible: the client includes early data encrypted with a pre-shared key from a previous session, allowing the server to process it before the handshake completes. The trade-off is that 0-RTT data is not forward-secret and is vulnerable to replay attacks, so it should only be used for idempotent requests.

**Q: Explain mTLS and how it differs from standard TLS. When would you use it?**

A: Standard TLS authenticates only the server — the client verifies the server's certificate but the server doesn't verify the client's identity (authentication happens at the application layer via tokens, cookies, etc.). mTLS adds client certificate verification: the server sends a CertificateRequest during the handshake, the client responds with its certificate, and the server verifies it against a trusted CA. This provides cryptographic proof of the client's identity at the transport layer. Use mTLS for: service-to-service communication (each service has a certificate identifying it), zero-trust architectures (network location doesn't imply trust), API access from trusted partners, and IoT device authentication. The operational complexity is higher — you need a CA infrastructure, certificate distribution, rotation automation, and revocation handling — which is why service meshes that automate this are popular.

**Q: How would you implement certificate rotation with zero downtime?**

A: Use short-lived certificates (24-72 hours) with automated renewal at 2/3 of lifetime. The rotation process: 1) Generate a new private key and CSR. 2) Submit CSR to the CA (Vault PKI, cert-manager, ACME). 3) Receive the signed certificate. 4) Write new cert and key to a staging location. 5) Atomically swap (rename) the new files over the old ones. 6) Signal the application to reload TLS configuration (SIGHUP, API call, or file watcher). Most modern servers (Nginx, Envoy, Go's `tls.Config` with `GetCertificate`) support hot-reloading certificates without restarting. For the brief moment during reload, some connections may use the old cert and some the new — both are valid since the old cert hasn't expired yet. In Kubernetes, cert-manager handles this by updating the Secret, and the pod's volume mount reflects the change within ~60 seconds.

**Q: What is forward secrecy and why does TLS 1.3 mandate it?**

A: Forward secrecy (or perfect forward secrecy) means that compromising the server's long-term private key doesn't allow decryption of past recorded traffic. This is achieved by using ephemeral key exchange (ECDHE): each connection generates a unique shared secret that's discarded after the session ends. Even if an attacker records encrypted traffic and later obtains the server's private key, they cannot derive the ephemeral session keys. TLS 1.3 mandates forward secrecy by removing RSA key exchange (where the client encrypts a pre-master secret with the server's public key — if the private key is later compromised, all past sessions are decryptable). This is critical because: nation-state adversaries record encrypted traffic for future decryption, server key compromise happens (Heartbleed), and long-term key storage is a liability. With forward secrecy, each session's confidentiality is independent of long-term key security.

## Production Tips

- **Monitor certificate expiry with alerting at multiple thresholds**: Alert at 30 days (plan renewal), 14 days (urgent), 7 days (critical), and 1 day (emergency). Monitor ALL certificates: external-facing (web, API), internal (service-to-service mTLS), infrastructure (database, message broker), and third-party integrations. Tools like cert-manager's metrics, Prometheus blackbox exporter, or dedicated certificate monitoring services (Keychest, CertSpotter) provide visibility.

- **Use short-lived certificates for internal services**: Instead of 1-year certificates that require manual rotation, issue 24-72 hour certificates with automated renewal. Short lifetimes reduce the window of exposure if a certificate is compromised (no need for revocation infrastructure — the cert expires before an attacker can use it meaningfully). This is the model used by service meshes (Istio issues 24h certs by default).

- **Implement OCSP stapling to avoid client-side revocation checks**: Without stapling, clients must contact the CA's OCSP responder to check if a certificate is revoked — adding latency and creating a privacy leak (the CA sees which sites the client visits). With OCSP stapling, the server periodically fetches its own OCSP response and includes it in the TLS handshake. Configure your server to staple (Nginx: `ssl_stapling on; ssl_stapling_verify on;`) and monitor for stapling failures.

- **Test TLS configuration regularly with automated scanning**: Run SSL Labs (ssllabs.com/ssltest) or testssl.sh against all external endpoints weekly. Check for: weak cipher suites, missing intermediate certificates, expired certificates, HSTS header presence, and CAA DNS records. Automate this in CI/CD — fail deployments that degrade TLS configuration. Internal services should be scanned too, especially after infrastructure changes.

## Related Topics

- [TCP/IP](./tcp-ip.md) — TLS operates on top of TCP, adding encryption after the TCP three-way handshake completes (or integrated into QUIC for HTTP/3)
- [HTTP](./http.md) — HTTPS is HTTP over TLS; HTTP/2 negotiates via ALPN during the TLS handshake; HTTP/3 integrates TLS into QUIC
- [Load Balancing](./load-balancing.md) — Load balancers terminate TLS at the edge, offloading cryptographic processing from backend servers
- [DNS](./dns.md) — DANE (DNS-Based Authentication of Named Entities) uses DNS to publish certificate constraints, and certificate validation requires DNS resolution
