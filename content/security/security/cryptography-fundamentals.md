# Cryptography Fundamentals

Cryptography is the mathematical foundation of information security, providing the primitives that enable confidentiality, integrity, authentication, and non-repudiation in digital systems. Every secure communication channel, every authenticated API call, every encrypted database, and every digital signature relies on cryptographic algorithms. For software engineers, understanding cryptography is not about implementing algorithms from scratch — it's about knowing which primitives to use, how to compose them correctly, and what failure modes to avoid.

Modern cryptography operates on the principle that security should depend only on the secrecy of keys, never on the secrecy of algorithms (Kerckhoffs's principle). This guide covers symmetric and asymmetric encryption, cryptographic hashing, digital signatures, Public Key Infrastructure (PKI), and key management — the building blocks that every production system depends on for security.

---

## Quick Reference

- **Symmetric Encryption** — Same key for encryption and decryption; fast (AES-256-GCM processes ~4 GB/s on modern hardware); used for data at rest and bulk data encryption
- **Asymmetric Encryption** — Key pair (public/private); slow (~1000x slower than symmetric); used for key exchange, digital signatures, and encrypting small payloads
- **Cryptographic Hashing** — One-way function producing fixed-size output; used for integrity verification, password storage, and content addressing
- **Digital Signatures** — Asymmetric operation proving authenticity and non-repudiation; the sender signs with private key, anyone verifies with public key
- **PKI (Public Key Infrastructure)** — Trust hierarchy using Certificate Authorities (CAs) to bind public keys to identities via X.509 certificates
- **Key Management** — Lifecycle of cryptographic keys: generation, distribution, storage, rotation, and destruction
- **AES-256-GCM** — Industry standard authenticated encryption providing both confidentiality and integrity in a single operation
- **RSA vs ECC** — RSA uses large key sizes (2048-4096 bit) for equivalent security; ECC achieves same security with smaller keys (256-384 bit), faster operations
- **HMAC** — Hash-based Message Authentication Code; combines a secret key with a hash function to provide message integrity and authenticity
- **Key Derivation Functions (KDF)** — Derive cryptographic keys from passwords or other key material (PBKDF2, scrypt, Argon2)

---

## When to Use

**Symmetric Encryption (AES-256-GCM):**
- Encrypting data at rest in databases, file systems, and object storage
- Encrypting data in transit after key exchange (TLS session encryption)
- Encrypting large volumes of data where performance matters
- Disk encryption (LUKS, BitLocker, FileVault)
- Application-level field encryption for sensitive columns

**Asymmetric Encryption (RSA, ECC):**
- TLS handshake key exchange (establishing shared symmetric keys)
- Digital signatures for code signing, document signing, JWT signing
- SSH key authentication
- Email encryption (PGP/GPG, S/MIME)
- Encrypting symmetric keys for envelope encryption patterns

**Cryptographic Hashing (SHA-256, SHA-3):**
- Verifying file integrity (checksums, content addressing)
- Git commit identification
- Building Merkle trees (blockchain, certificate transparency)
- Generating deterministic identifiers from content
- HMAC construction for API authentication

**Password Hashing (Argon2, bcrypt, scrypt):**
- Storing user passwords (never use SHA-256 or MD5 for passwords)
- Deriving encryption keys from user-provided passphrases
- Any scenario where brute-force resistance is required

**Digital Signatures:**
- JWT token signing (RS256, ES256)
- Code signing for software distribution
- API request signing (AWS Signature V4)
- Certificate signing in PKI hierarchies
- Blockchain transaction authorization

---

## Code Examples

### Example 1: AES-256-GCM Authenticated Encryption

```typescript
import crypto from 'crypto';

// AES-256-GCM provides both confidentiality and integrity (AEAD)
class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 12;  // 96 bits (recommended for GCM)
  private readonly tagLength = 16; // 128 bits authentication tag

  constructor(private readonly masterKey: Buffer) {
    if (masterKey.length !== this.keyLength) {
      throw new Error(`Key must be ${this.keyLength} bytes`);
    }
  }

  encrypt(plaintext: string, associatedData?: string): EncryptedPayload {
    // Generate random IV for each encryption (NEVER reuse IV with same key)
    const iv = crypto.randomBytes(this.ivLength);

    const cipher = crypto.createCipheriv(this.algorithm, this.masterKey, iv, {
      authTagLength: this.tagLength,
    });

    // Associated data is authenticated but not encrypted
    if (associatedData) {
      cipher.setAAD(Buffer.from(associatedData, 'utf8'));
    }

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      tag: authTag.toString('base64'),
      aad: associatedData,
    };
  }

  decrypt(payload: EncryptedPayload): string {
    const iv = Buffer.from(payload.iv, 'base64');
    const ciphertext = Buffer.from(payload.ciphertext, 'base64');
    const tag = Buffer.from(payload.tag, 'base64');

    const decipher = crypto.createDecipheriv(this.algorithm, this.masterKey, iv, {
      authTagLength: this.tagLength,
    });

    decipher.setAuthTag(tag);

    if (payload.aad) {
      decipher.setAAD(Buffer.from(payload.aad, 'utf8'));
    }

    try {
      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(), // Throws if authentication fails
      ]);
      return decrypted.toString('utf8');
    } catch (error) {
      throw new Error('Decryption failed: data may have been tampered with');
    }
  }
}

interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  tag: string;
  aad?: string;
}

// Usage
const key = crypto.randomBytes(32); // Generate a secure random key
const service = new EncryptionService(key);

const encrypted = service.encrypt('sensitive data', 'user:12345');
const decrypted = service.decrypt(encrypted); // 'sensitive data'
```

### Example 2: Envelope Encryption Pattern

```typescript
// Envelope encryption: encrypt data with a data key, encrypt the data key with a master key
// This is how AWS KMS, Google Cloud KMS, and Azure Key Vault work

class EnvelopeEncryption {
  constructor(private readonly kmsClient: KMSClient) {}

  async encrypt(plaintext: Buffer, context: Record<string, string>): Promise<EnvelopePayload> {
    // Step 1: Generate a unique data encryption key (DEK) from KMS
    const { Plaintext: dekPlaintext, CiphertextBlob: dekEncrypted } =
      await this.kmsClient.send(new GenerateDataKeyCommand({
        KeyId: process.env.KMS_KEY_ARN,
        KeySpec: 'AES_256',
        EncryptionContext: context, // Bound to this encryption context
      }));

    // Step 2: Encrypt data locally with the plaintext DEK
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', dekPlaintext!, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Step 3: Immediately destroy plaintext DEK from memory
    dekPlaintext!.fill(0);

    // Step 4: Return encrypted data + encrypted DEK
    return {
      encryptedData: encrypted.toString('base64'),
      encryptedDataKey: Buffer.from(dekEncrypted!).toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      context: context,
    };
  }

  async decrypt(payload: EnvelopePayload): Promise<Buffer> {
    // Step 1: Decrypt the DEK using KMS
    const { Plaintext: dekPlaintext } = await this.kmsClient.send(new DecryptCommand({
      CiphertextBlob: Buffer.from(payload.encryptedDataKey, 'base64'),
      EncryptionContext: payload.context,
    }));

    // Step 2: Decrypt data locally with the plaintext DEK
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      dekPlaintext!,
      Buffer.from(payload.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payload.encryptedData, 'base64')),
      decipher.final(),
    ]);

    // Step 3: Destroy plaintext DEK
    dekPlaintext!.fill(0);

    return decrypted;
  }
}

interface EnvelopePayload {
  encryptedData: string;
  encryptedDataKey: string;
  iv: string;
  tag: string;
  context: Record<string, string>;
}
```

### Example 3: Secure Password Hashing with Argon2

```typescript
import argon2 from 'argon2';

// Argon2id is the recommended password hashing algorithm (winner of PHC competition)
class PasswordService {
  // OWASP recommended parameters for Argon2id
  private readonly options: argon2.Options = {
    type: argon2.argon2id,    // Hybrid: resistant to both side-channel and GPU attacks
    memoryCost: 65536,         // 64 MB memory
    timeCost: 3,               // 3 iterations
    parallelism: 4,            // 4 parallel threads
    hashLength: 32,            // 256-bit output
    saltLength: 16,            // 128-bit salt (auto-generated)
  };

  async hashPassword(password: string): Promise<string> {
    // Argon2 generates a random salt and encodes everything in the output string
    // Output format: $argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>
    return argon2.hash(password, this.options);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false; // Invalid hash format
    }
  }

  async needsRehash(hash: string): Promise<boolean> {
    // Check if hash was created with older/weaker parameters
    return argon2.needsRehash(hash, this.options);
  }
}

// Usage in login flow
async function authenticateUser(email: string, password: string): Promise<User> {
  const user = await db.users.findByEmail(email);
  if (!user) {
    // Constant-time comparison to prevent user enumeration via timing
    await passwordService.hashPassword('dummy-password');
    throw new AuthenticationError('Invalid credentials');
  }

  const valid = await passwordService.verifyPassword(password, user.passwordHash);
  if (!valid) {
    await recordFailedAttempt(user.id);
    throw new AuthenticationError('Invalid credentials');
  }

  // Rehash if parameters have been upgraded
  if (await passwordService.needsRehash(user.passwordHash)) {
    const newHash = await passwordService.hashPassword(password);
    await db.users.updatePasswordHash(user.id, newHash);
  }

  return user;
}
```

### Example 4: Digital Signatures with Ed25519

```typescript
import crypto from 'crypto';

// Ed25519: fast, secure, small signatures (64 bytes)
// Preferred over RSA for new systems due to performance and key size

class SignatureService {
  private privateKey: crypto.KeyObject;
  private publicKey: crypto.KeyObject;

  constructor(privateKeyPem: string) {
    this.privateKey = crypto.createPrivateKey(privateKeyPem);
    this.publicKey = crypto.createPublicKey(privateKeyPem);
  }

  // Generate a new Ed25519 key pair
  static generateKeyPair(): { publicKey: string; privateKey: string } {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    return { publicKey, privateKey };
  }

  // Sign a message
  sign(message: Buffer): Buffer {
    return crypto.sign(null, message, this.privateKey);
  }

  // Verify a signature
  verify(message: Buffer, signature: Buffer): boolean {
    return crypto.verify(null, message, this.publicKey, signature);
  }

  // Sign a JSON payload (common pattern for API requests)
  signPayload(payload: object): SignedPayload {
    const canonical = JSON.stringify(payload, Object.keys(payload).sort());
    const timestamp = Date.now();
    const message = Buffer.from(`${timestamp}.${canonical}`);
    const signature = this.sign(message);

    return {
      payload,
      timestamp,
      signature: signature.toString('base64'),
    };
  }

  // Verify a signed payload with timestamp validation
  verifyPayload(signed: SignedPayload, maxAgeMs: number = 300000): boolean {
    // Check timestamp freshness (prevent replay attacks)
    if (Date.now() - signed.timestamp > maxAgeMs) {
      return false;
    }

    const canonical = JSON.stringify(signed.payload, Object.keys(signed.payload).sort());
    const message = Buffer.from(`${signed.timestamp}.${canonical}`);
    const signature = Buffer.from(signed.signature, 'base64');

    return this.verify(message, signature);
  }
}

interface SignedPayload {
  payload: object;
  timestamp: number;
  signature: string;
}
```

### Example 5: HMAC for API Request Authentication

```java
// AWS Signature V4 style request signing
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.format.DateTimeFormatter;

public class RequestSigner {

    private final String accessKey;
    private final byte[] secretKey;

    public RequestSigner(String accessKey, String secretKey) {
        this.accessKey = accessKey;
        this.secretKey = secretKey.getBytes(StandardCharsets.UTF_8);
    }

    public String signRequest(String method, String path, String body, Instant timestamp) {
        String dateStamp = DateTimeFormatter.ofPattern("yyyyMMdd")
            .format(timestamp.atZone(java.time.ZoneOffset.UTC));
        String amzDate = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'")
            .format(timestamp.atZone(java.time.ZoneOffset.UTC));

        // Step 1: Create canonical request
        String bodyHash = sha256Hex(body);
        String canonicalRequest = String.join("\n",
            method, path, "", // query string
            "host:api.example.com",
            "x-amz-date:" + amzDate, "",
            "host;x-amz-date",
            bodyHash
        );

        // Step 2: Create string to sign
        String credentialScope = dateStamp + "/us-east-1/execute-api/request";
        String stringToSign = String.join("\n",
            "HMAC-SHA256",
            amzDate,
            credentialScope,
            sha256Hex(canonicalRequest)
        );

        // Step 3: Derive signing key (key derivation chain)
        byte[] dateKey = hmacSha256(("SIGN" + new String(secretKey)).getBytes(), dateStamp);
        byte[] regionKey = hmacSha256(dateKey, "us-east-1");
        byte[] serviceKey = hmacSha256(regionKey, "execute-api");
        byte[] signingKey = hmacSha256(serviceKey, "request");

        // Step 4: Calculate signature
        String signature = hexEncode(hmacSha256(signingKey, stringToSign));

        return String.format(
            "HMAC-SHA256 Credential=%s/%s, SignedHeaders=host;x-amz-date, Signature=%s",
            accessKey, credentialScope, signature
        );
    }

    private byte[] hmacSha256(byte[] key, String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new RuntimeException("HMAC computation failed", e);
        }
    }

    private String sha256Hex(String data) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(data.getBytes(StandardCharsets.UTF_8));
            return hexEncode(hash);
        } catch (Exception e) {
            throw new RuntimeException("SHA-256 computation failed", e);
        }
    }

    private String hexEncode(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}
```

---

## Common Pitfalls

**1. Using ECB mode for block cipher encryption.** ECB (Electronic Codebook) encrypts each block independently, meaning identical plaintext blocks produce identical ciphertext blocks. This leaks patterns in the data (the famous "ECB penguin" image). Always use authenticated encryption modes like GCM or CCM that provide both confidentiality and integrity.

**2. Reusing IVs/nonces with the same key.** In AES-GCM, reusing a nonce with the same key completely breaks both confidentiality and authenticity. An attacker can XOR two ciphertexts to eliminate the key stream and recover plaintext. Always generate a fresh random nonce for each encryption operation, or use a deterministic nonce scheme (AES-GCM-SIV) if nonce reuse is a risk.

**3. Using MD5 or SHA-1 for security-critical operations.** MD5 has practical collision attacks (can generate two different inputs with the same hash in seconds). SHA-1 has demonstrated collision attacks (SHAttered, 2017). Use SHA-256 or SHA-3 for integrity verification, and Argon2/bcrypt for password hashing. MD5 is acceptable only for non-security checksums (file deduplication).

**4. Implementing your own cryptographic algorithms.** Custom crypto implementations almost always contain side-channel vulnerabilities (timing attacks, cache attacks), mathematical errors, or implementation bugs. Use well-audited libraries: libsodium, OpenSSL, BoringSSL, or platform-native crypto APIs. The algorithms are public; the security comes from correct implementation and key management.

**5. Confusing encryption with hashing.** Encryption is reversible (with the key); hashing is one-way. Encrypting passwords means they can be decrypted if the key is compromised. Hash passwords with Argon2/bcrypt so that even a complete database breach doesn't reveal plaintext passwords.

**6. Storing encryption keys alongside encrypted data.** If the key is stored in the same database, file system, or backup as the encrypted data, encryption provides no protection against database breaches. Use separate key management systems (HSMs, KMS) with strict access controls and audit logging.

**7. Not authenticating ciphertext (using encryption without MAC).** Encryption alone (AES-CBC without HMAC) doesn't prevent tampering. An attacker can modify ciphertext and the decryption will succeed with corrupted plaintext (padding oracle attacks exploit this). Always use authenticated encryption (AES-GCM) or encrypt-then-MAC (AES-CBC + HMAC-SHA256 over the ciphertext).

**8. Using insufficient key sizes or deprecated algorithms.** RSA-1024 is considered broken. 3DES is deprecated. Use minimum RSA-2048 (preferably 4096 for long-term keys), AES-256, and SHA-256. For new systems, prefer ECC (P-256 or Ed25519) over RSA for better performance with equivalent security.

---

## Real-World Use Cases

**TLS 1.3 handshake:** TLS 1.3 uses Ephemeral Diffie-Hellman (ECDHE) for key exchange, providing perfect forward secrecy. The client and server each generate ephemeral key pairs, exchange public keys, and derive a shared secret. This shared secret is used to derive symmetric session keys (AES-256-GCM) for bulk data encryption. Even if the server's long-term private key is later compromised, past sessions remain secure because the ephemeral keys were destroyed.

**End-to-end encrypted messaging (Signal Protocol):** Signal uses the Double Ratchet algorithm combining Diffie-Hellman ratcheting (new key pairs per message exchange) with symmetric key ratcheting (hash chain for forward secrecy within a single exchange). This provides both forward secrecy (compromising current keys doesn't reveal past messages) and post-compromise security (the system self-heals after a key compromise). Each message uses a unique encryption key derived from the ratchet state.

**Database field-level encryption:** Healthcare and financial systems encrypt sensitive fields (SSN, credit card numbers) at the application layer before storage. Each field uses envelope encryption: a unique data encryption key (DEK) encrypted by a key encryption key (KEK) stored in a hardware security module. This allows key rotation without re-encrypting all data — only the DEK wrappers need updating.

**Blockchain and cryptocurrency:** Bitcoin uses ECDSA (secp256k1 curve) for transaction signing, SHA-256 for proof-of-work mining and block hashing, and RIPEMD-160 for address generation. The security model relies on the computational infeasibility of reversing hash functions (mining) and forging signatures without the private key (spending someone else's funds).

**Certificate Transparency:** Google's Certificate Transparency system uses Merkle trees (binary trees of SHA-256 hashes) to create an append-only log of all issued TLS certificates. Any certificate not in the log is rejected by browsers. This prevents CAs from secretly issuing fraudulent certificates, as the Merkle tree structure makes it computationally infeasible to modify historical entries without detection.

---

## Interview Questions

**Q: Explain the difference between symmetric and asymmetric encryption. When would you use each?**

A: Symmetric encryption uses the same key for encryption and decryption (AES-256). It's fast (~4 GB/s) but requires secure key distribution — both parties must share the secret key. Asymmetric encryption uses a key pair: public key encrypts, private key decrypts (RSA, ECC). It's ~1000x slower but solves the key distribution problem — public keys can be shared openly. In practice, they're used together: asymmetric encryption establishes a shared symmetric key (TLS handshake), then symmetric encryption handles bulk data transfer. Use symmetric for: data at rest, session encryption, disk encryption. Use asymmetric for: key exchange, digital signatures, identity verification.

**Q: What is perfect forward secrecy and why does TLS 1.3 mandate it?**

A: Perfect forward secrecy (PFS) ensures that compromising a server's long-term private key doesn't allow decryption of past recorded sessions. TLS 1.3 achieves this by using ephemeral Diffie-Hellman key exchange (ECDHE) for every session. Each connection generates fresh key pairs that are destroyed after the session ends. Even if an attacker records all encrypted traffic and later obtains the server's private key, they cannot derive the ephemeral session keys. TLS 1.3 mandates PFS by removing all non-PFS cipher suites (static RSA key exchange). This is critical because intelligence agencies and attackers practice "harvest now, decrypt later" — recording encrypted traffic hoping to obtain keys in the future.

**Q: How does Argon2 differ from bcrypt, and why is it preferred for password hashing?**

A: Both are adaptive password hashing functions designed to be slow (preventing brute force), but they differ in resource consumption. Bcrypt is CPU-hard with a fixed 4KB memory requirement, making it vulnerable to GPU and ASIC attacks that parallelize computation cheaply. Argon2 (specifically Argon2id) is both CPU-hard and memory-hard — it requires configurable amounts of RAM (typically 64MB+), making GPU/ASIC attacks economically infeasible because memory is expensive to parallelize. Argon2id combines Argon2i (side-channel resistant, for password hashing) and Argon2d (data-dependent, maximum GPU resistance) in a hybrid mode. It won the Password Hashing Competition (2015) and is recommended by OWASP. The key parameters are: memory cost (64MB+), time cost (3+ iterations), and parallelism (matching available cores).

**Q: Explain envelope encryption and why cloud providers use it instead of direct encryption with master keys.**

A: Envelope encryption uses two layers of keys: a data encryption key (DEK) encrypts the actual data, and a key encryption key (KEK/master key) encrypts the DEK. Cloud providers (AWS KMS, GCP KMS) use this pattern because: (1) The master key never leaves the HSM — it's used only to wrap/unwrap DEKs, minimizing exposure. (2) Each piece of data gets a unique DEK, so compromising one DEK doesn't expose other data. (3) Key rotation is efficient — rotating the master key only requires re-encrypting the DEKs (small), not re-encrypting all data (potentially petabytes). (4) Performance — bulk encryption happens locally with the DEK (fast symmetric crypto), while only the small DEK encryption/decryption requires the remote KMS call. (5) Audit — all master key operations are logged, providing visibility into who accessed which data keys.

---

## Production Tips

**Implement key rotation without downtime.** Design encryption systems to support multiple active keys simultaneously. When rotating, encrypt new data with the new key but continue decrypting with both old and new keys. Store the key version/ID alongside encrypted data (in metadata, not in the ciphertext). Gradually re-encrypt old data in background jobs. This dual-key period ensures zero-downtime rotation and allows rollback if the new key has issues.

**Use hardware security modules (HSMs) for master keys in regulated environments.** HSMs (AWS CloudHSM, Azure Dedicated HSM, on-premise Thales/Gemalto) provide tamper-resistant key storage where keys never exist in plaintext outside the hardware boundary. They're required for PCI DSS Level 1, FIPS 140-2 Level 3 compliance, and any system where key extraction must be physically impossible. The trade-off is cost ($1-5K/month for cloud HSMs) and latency (1-5ms per operation vs microseconds for software crypto).

**Monitor cryptographic operations for anomalies.** Track: encryption/decryption rates per service (sudden spikes may indicate data exfiltration), key access patterns (unusual services accessing keys they shouldn't), failed decryption attempts (may indicate key rotation issues or tampering), and certificate expiration timelines. Set alerts for: keys approaching rotation deadlines, certificates expiring within 30 days, and any access to master keys outside normal patterns.

---

## Related Topics

- [Authentication Patterns](./authentication-patterns.md) — How cryptographic primitives (JWT signing, password hashing, HMAC) are applied in authentication protocols
- [Network Security](./network-security.md) — TLS implementation, certificate management, and encrypted tunnels that depend on these cryptographic fundamentals
- [Container Security](./container-security.md) — Image signing, secrets encryption, and supply chain verification using digital signatures
