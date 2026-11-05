# Security

## Current status

The current build implements authenticated end-to-end encrypted messaging over Firebase Realtime Database. Phase 4 provides non-extractable Web Crypto P-256 keys in IndexedDB. Phase 5 provides the AEAD cryptographic engine (P-256 ECDH + HKDF-SHA256 + AES-256-GCM). Phase 6 connects this engine to Firebase RTDB under `/messages/{conversationId}/{generation}/{messageId}`:
- **Zero Remote Plaintext:** Firebase RTDB stores only opaque `EncryptedEnvelope` transport payloads (`ciphertext`, `senderCiphertext`, `iv`, `sequence`, `expiresAt`, `senderUid`, `ephemeralPublicKey`).
- **Dual-Recipient Forward-Secret Envelopes:** Each message generates a fresh ephemeral P-256 key pair, deriving distinct AES-256-GCM keys for the recipient and sender.
- **Associated Authenticated Data (AAD):** `conversationId`, `generation`, `senderUid`, `sequence`, and `expiresAt` are cryptographically bound to the AEAD tag. Modifying any metadata byte causes decryption to throw an authentication error immediately.
- **Volatile Plaintext Only:** Plaintext exists only in component state and transient in-memory cache; it is never written to IndexedDB, LocalStorage, or server logs.
- **Security Rules Access Control:** RTDB security rules restrict message reads and writes strictly to verified conversation members in active state matching the current generation, limiting payload sizes to <= 64KB.
- **Message Expiry & Opportunistic Cleanup (Phase 7):**
  - **Guaranteed Behavior:** Any message past its `expiresAt` timestamp is invalid and invisible to application logic. AAD binding seals `expiresAt` in the AEAD tag, preventing expiration extension. Plaintext is evicted from volatile memory.
  - **Best-Effort Boundary (₹0 Free Tier):** Physical deletion from Firebase RTDB occurs opportunistically when authorized clients connect and sweep expired messages. In the absence of connected clients, encrypted ciphertext remains dormant on RTDB until the next client sweep. Database rules permit either member to delete expired records (`data.child('expiresAt').val() <= now`) while blocking premature deletion of active peer messages.
- **Destroy for Both & Generation Handling (Phase 8):**
  - **Atomic Session Invalidation:** A single atomic multi-path update increments the generation counter, sets `state: "destroyed"`, records `destroyedAt` and `destroyedBy`, and deletes all transport ciphertexts under the active generation.
  - **Cryptographic Stale-Client Isolation:** Because past messages have their generation number cryptographically bound into their AEAD tag, any returning offline client cannot decrypt past messages in a future generation, and RTDB security rules reject all reads and writes to past generations or destroyed sessions.
  - **Memory Scrubbing:** In-memory plaintexts and derived session keys are wiped immediately upon destruction.
  - **Realistic Privacy Boundaries:** The UI explicitly warns users that GhostChat cannot prevent or delete screenshots, photos of the screen taken by a secondary device, or data logged by modified client binaries.
- **Ephemeral Presence, Typing & Delivery Receipts (Phase 9):**
  - **Metadata Minimization:** No IP addresses, device user agents, location data, or message reading timestamps are logged. Presence records store only `status: "online" | "offline"` and a transient timestamp. Typing indicators store only a transient boolean flag.
  - **Auto-Revocation on Disconnect:** Both presence and typing state bind to Firebase RTDB `.info/connected` and register `onDisconnect()` handlers. When a tab is closed, refreshed, or loses connectivity, presence is immediately marked offline and typing indicators are purged server-side.
  - **Strict Access Rules:** Presence and typing trees (`/presence/{conversationId}/{uid}` and `/typing/{conversationId}/{uid}`) are restricted by database security rules. Non-participants cannot read or write to these trees, and operations are blocked whenever a conversation is pending or destroyed.
  - **In-Band Delivery State:** Receipts (`delivered: true`) confirm successful receipt and decryption by the recipient. Only the recipient can mark a message as delivered, and messages cannot have their ciphertexts, IVs, or expiry altered during delivery acknowledgment.
- **Device & Contact Verification (Phase 10):**
  - **Trust on First Use (TOFU) & Active Verification:** Peer public keys are bound during pairing and verified against public safety numbers. Users can compare 60-digit safety numbers or scan standard SVG QR codes out-of-band to confirm protection against active Man-in-the-Middle (MitM) attacks.
  - **Zero Remote Trust Storage:** Verified keys and trust decisions are stored solely in local client IndexedDB (`ghostchat-verifications`). The server/RTDB is never informed whether a contact is verified or unverified, preventing social graph or trust relationship analysis.
  - **Key Change Invalidation & Warnings:** If a peer replaces their cryptographic device identity, GhostChat automatically invalidates the verified status, triggers visual alerts in the chat header, conversation item, and message log, and prevents silent key substitution attacks without user notification.
- **Service Worker & PWA Zero-Plaintext Policy (Phase 11):**
  - **Static Shell Caching Only:** The service worker (`/sw.js`) caches only immutable static application assets (HTML shell, CSS, JS chunks, icons, manifest).
  - **Strict Transport Bypass:** All Firebase Realtime Database connections (`*.firebaseio.com`), Google Auth requests (`*.googleapis.com`, `identitytoolkit`, `securetoken`), and `/api/*` endpoints are strictly excluded from the service worker cache. Requests are passed directly to the network.
  - **Zero Persistent Message Storage in CacheStorage:** Under no circumstances are decrypted plaintexts, ephemeral envelopes, auth tokens, or private CryptoKeys placed in CacheStorage.
  - **Offline Security Stance:** GhostChat refuses to display stale, persistent message histories while offline. An explicit offline indicator informs the user that ephemeral messaging requires active connectivity, preserving ephemeral privacy boundaries.
- **Security Hardening, CSP & Rules Verification (Phase 12):**
  - **Content Security Policy (CSP):** The application serves strict CSP directives blocking inline code execution from foreign sources, preventing base-tag injection (`base-uri 'self'`), disabling plugin execution (`object-src 'none'`), and restricting network endpoints (`connect-src`) to Firebase RTDB and Auth exclusively.
  - **Clickjacking & Frame Embedding Denial:** `frame-ancestors 'none'` and `X-Frame-Options: DENY` strictly prohibit third-party origins from wrapping GhostChat in an iframe.
  - **Transport & Protocol Security:** `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` enforces secure HTTPS communication. `X-Content-Type-Options: nosniff` defends against MIME-confusion attacks.
  - **Comprehensive Security Rules Audit:** Validated that default-deny is applied across all unmapped root paths. Database rules enforce `<64KB` envelope limits, validate IV length (`16`), ephemeral key lengths (`43..128`), verify sender ownership (`senderUid == auth.uid`), and enforce generation boundary isolation upon conversation destruction.

- **Verification & Production Release Hardening (Phase 13):**
  - **Comprehensive End-to-End Audit:** All cryptographic lifecycles, non-extractable key constraints, AAD tamper detection, generation bumping, and commutative safety number comparisons are validated through automated regression testing (`tests/e2e-audit.test.ts`).
  - **Production Cache Hygiene:** Service worker caching strictly bypasses credentials and transports; `vercel.json` and Next.js configure anti-caching headers for `sw.js` and immutable caching for static assets.
  - **Verified Zero-Cost Security:** The entire security apparatus operates without external paid microservices, guaranteeing that privacy is achieved through mathematical and cryptographic client-side enforcement rather than third-party SaaS trust.

Authentication supports sign-in and sign-out only. Project owners provision accounts through Firebase Console; pairing codes do not create Firebase Auth accounts. Invites are random 128-bit codes, valid for 24 hours, single-use, and require an authenticated recipient. The deployed RTDB rules scope access to the creator, accepted account, and each user's own conversation index. Auth persistence is limited to the current browser tab/window session; closing it clears the session.

Firebase Web app configuration is exposed in the client bundle by design and must not be treated as a secret. Database Security Rules are the access control boundary. Never add service-account credentials or Admin SDK keys to client environment variables.

## Cryptographic Protections Verified

The production release encrypts message content on the sender’s device and stores only encrypted transport data in Firebase:
- **Client-Side E2EE AEAD:** AES-256-GCM authenticated encryption with 128-bit authentication tags and ephemeral P-256 ECDH key agreement.
- **Strict AAD Binding:** Binds `conversationId`, `generation`, `senderUid`, `sequence`, and `expiresAt` directly into the AEAD tag. Modifying or replaying any metadata byte invalidates the message.
- **Zero Remote Plaintext:** Transport nodes hold only base64url ciphertexts, IVs, and public keys.
- **Generation Monotonicity:** Destroy-for-both increments generation and isolates returning clients from recovering past envelopes.
- **Out-of-Band Safety Numbers:** Commutative 60-digit safety numbers and SVG QR code matrix provide defense against active Man-in-the-Middle (MitM) attacks.

## Limits & Residual Risk

- **Client Endpoint Compromise:** Non-extractable Web Crypto keys prevent direct key export through the browser API, but cannot protect against a compromised operating system, hostile browser extensions, hardware rootkits, or keyloggers active during an authenticated session.
- **Physical Observation:** No software can prevent an authorized recipient from taking screenshots, taking photos of the screen with an external camera, or operating a modified client binary.
- **Server Metadata:** While message plaintexts and keys are completely hidden from Firebase and network snoops, the Firebase RTDB endpoint observes connection timing, message count, approximate ciphertext size, and IP addresses of connected clients.
- **Physical Cloud Deletion:** Client-side opportunistic sweeping purges expired envelopes from Firebase RTDB during active sessions. Exact physical deletion from Google's underlying physical disk backups is governed by Google Cloud storage reclamation schedules and cannot be mathematically proven by client code.
