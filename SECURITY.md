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

Authentication supports sign-in and sign-out only. Project owners provision accounts through Firebase Console; pairing codes do not create Firebase Auth accounts. Invites are random 128-bit codes, valid for 24 hours, single-use, and require an authenticated recipient. The deployed RTDB rules scope access to the creator, accepted account, and each user's own conversation index. Auth persistence is limited to the current browser tab/window session; closing it clears the session.

Firebase Web app configuration is exposed in the client bundle by design and must not be treated as a secret. Database Security Rules are the access control boundary. Never add service-account credentials or Admin SDK keys to client environment variables.

## Intended protections

The product is planned to encrypt message content on the sender’s device and store only encrypted transport data in Firebase. Firebase Security Rules must enforce authentication, conversation membership, sender ownership, payload validation, and active conversation generation. The app will aim to prevent ordinary unauthorized database access, plaintext disclosure from Firebase records, and stale-message restoration by supported clients.

The selected product direction retains Firebase and the browser client. Until a browser-first session protocol implementation and its Firebase integration have an independent security review, GhostChat keeps all message sending disabled and must not claim end-to-end encryption.

## Limits

Non-extractable Web Crypto keys prevent direct key export through the API; they do not protect against same-origin malicious JavaScript, XSS, a compromised browser, or malware using a key while the account is signed in. Browser data can be cleared or lost. Removing the local identity is irreversible. The current P-256 keys are a local lifecycle foundation and are not claimed to be compatible with a future session protocol.

No web app can prevent a recipient from taking screenshots, copying text, using a modified client, or recording content externally. XSS, a compromised browser or extension, or malware can expose plaintext and active keys on a device. Browser storage cannot provide the same hardware-backed guarantees as a dedicated native secure enclave. Firebase and network metadata may reveal that accounts communicate and when traffic occurs.

The app cannot guarantee that every remote copy or backup is physically erased at an exact time. Expiry means supported clients stop treating a message as valid; physical Firebase cleanup is best-effort unless a server-side cleanup service is added. Destroy-for-both cannot erase copies already made outside GhostChat.

## Required controls before real messaging

- A reviewed, maintained protocol implementation that is suitable for this exact browser/Firebase architecture; no custom cryptographic protocol. Phase 5 did not pass this selection gate.
- Explicit key creation, storage, rotation, revocation, device linking, and logout lifecycle.
- Default-deny Firebase Security Rules with emulator tests.
- Content Security Policy and other security headers, safe text rendering, and dependency review.
- No plaintext, private keys, tokens, or message contents in logs, analytics, URLs, or service-worker caches.
- Clear identity-change and decryption-failure states.
