# Architecture

## Current implementation

Phase 2 adds browser-only Firebase initialization in `src/lib/firebase/client.ts`, auth state and sign-in services in `src/features/auth/auth-context.tsx`, and browser-session persistence. Phase 3 adds pairing logic in `src/features/pairing/`, conversation-list subscriptions, and scoped RTDB rules. Phase 4 adds a per-account local device identity in `src/features/identity/`: P-256 ECDSA signing and ECDH agreement key pairs, non-extractable private CryptoKeys stored in IndexedDB, public-key fingerprinting, and explicit removal/recreation. Phase 5 adds the Web Crypto AEAD engine (P-256 ECDH + HKDF-SHA256 + AES-256-GCM) with AAD binding for replay and generation isolation.

Phase 6 implements realtime encrypted messaging over Firebase Realtime Database. Peer public agreement keys are exchanged via conversation records (`ownerAgreementKey`, `acceptedAgreementKey`). Messages are encrypted client-side using ephemeral P-256 ECDH key pairs and AES-256-GCM with dual-recipient envelopes (`ciphertext` for the receiver and `senderCiphertext` for the sender on session reload). Plaintext is held strictly in volatile component state and an in-memory decryption cache, never written to remote transport or local storage. Firebase RTDB stores only opaque transport envelopes under `/messages/{conversationId}/{generation}/{messageId}` protected by authenticated membership rules, payload length limits (<64KB), and generation boundaries.

Phase 7 implements automatic message expiration and opportunistic cleanup:
- **Application State Invalidation:** Every message binds its `expiresAt` timestamp into the AEAD tag via AAD. Altering `expiresAt` fails authentication. The client evaluates `expiresAt` as fundamental application state, not visual UI.
- **Active Session Expiration Ticker:** A background interval ticks every 5 seconds, updating countdown badges and dropping messages from volatile component memory the moment `expiresAt <= Date.now()`.
- **Opportunistic Physical Cleanup:** Connected clients identify physically expired envelopes and delete them from Firebase RTDB in an atomic multi-path batch update (`sweepExpiredMessages`), purging associated in-memory cache entries.
- **Security Rule Enforcement:** Database rules prevent premature deletion of unexpired messages by peers while allowing either member to physically delete expired records (`data.child('expiresAt').val() <= now`).

Phase 8 implements mutual conversation destruction and generation handling:
- **Destroy for Both:** Either authenticated conversation participant can initiate permanent session destruction.
- **Multi-Path Atomic Execution:** A single atomic operation updates `/conversations/{conversationId}` (`state: "destroyed"`, `generation: currentGeneration + 1`, `destroyedAt`, `destroyedBy`) and purges `/messages/{conversationId}/{currentGeneration}` to `null`.
- **Offline Client & Resurrection Defense:** Stale or offline returning clients cannot restore or decrypt old messages because the server tree is wiped, database rules deny access to stale generations or destroyed conversations, and AEAD tags bind generation numbers into ciphertext integrity verification.
- **Volatile & In-Memory Scrubbing:** Client clears all local memory plaintexts (`clearConversationDecryptedCache`) and in-memory derived session keys (`clearConversationSession`). Composer is locked.

Phase 9 implements ephemeral presence, typing status, and delivery acknowledgments:
- **Ephemeral Presence via `.info/connected`:** Realtime connection monitoring automatically transitions users between `online` and `offline` with server timestamps. Clean unmounts and Firebase `onDisconnect()` hooks guarantee offline status without dangling active records.
- **Volatile Typing Pulses:** Typing state is published under `/typing/{conversationId}/{uid}` with a 2.5-second inactivity debounce and automatic `onDisconnect().remove()` cleanup to prevent stuck indicators upon network drop.
- **In-Band Delivery Receipts:** Decrypted message envelopes trigger a lightweight single-path update (`delivered: true`) in RTDB. Sent state renders a single checkmark (`check`), and verified delivery renders a double checkmark (`checkCheck`).
- **Zero Metadata Retention:** No communication history logs, IP addresses, or permanent tracking logs are created. Presence and typing paths are strictly scoped to verified conversation participants during active sessions.

Phase 10 implements device & contact verification and key change alerts:
- **Commutative Safety Numbers:** A 60-digit numeric safety number (12 blocks of 5 digits) and 64-char hex fingerprint derived deterministically via SHA-512 from lexicographically sorted public keys (`[keyA, keyB].sort()`), ensuring Alice and Bob compute the exact same numbers.
- **Pure TypeScript QR Code Matrix:** Self-contained, zero-dependency QR code generator (`qr-matrix.ts` and `qr-code.tsx`) producing standard SVG QR codes encoding verification URIs (`ghostchat:verify:v1?...`).
- **Interactive Verification & Comparison:** In-person QR scanning or manual digit entry compares safety numbers in real-time with visual match/mismatch confirmations.
- **Client-Side Verification Persistence:** Verified contact identities are saved locally in IndexedDB (`ghostchat-verifications`); no trust data is leaked to Firebase or third parties.
- **Cryptographic Key Change Warning Alerts:** If an active contact's key changes from the previously verified fingerprint (e.g. re-install or intercept attempt), verification is immediately revoked, prominent warnings are displayed across the header, sidebar, and message stream, and the user is guided to review and re-verify.

Phase 11 implements the PWA shell, service worker zero-plaintext caching, and desktop refinement:
- **Installable PWA Web App Shell:** Manifest (`/manifest.webmanifest` and `/manifest.json`) configuring standalone display, dark theme (`#07131b`), and adaptive SVG app icons (`icon-192.svg`, `icon-512.svg`).
- **Service Worker Zero-Plaintext Policy:** The service worker (`/sw.js`) precaches and serves static shell assets (HTML shell, CSS, JS chunks, icons) while strictly bypassing and never caching Firebase RTDB websockets/polling (`*.firebaseio.com`), Google Auth APIs (`*.googleapis.com`), or dynamic API routes.
- **Offline Resilience & Awareness:** When disconnected, the shell loads from cache and displays an offline indicator (`Offline Mode · Waiting for connection`), ensuring users understand messaging is paused and preventing stale phantom message displays.
- **Desktop Ergonomics:** Global keyboard shortcuts (`Ctrl/Cmd+K` for search, `Ctrl/Cmd+N` for new pair, `Ctrl/Cmd+/` for shortcuts cheatsheet, `Esc` to close modals), custom desktop scrollbars, and window safe-area insets.

Phase 12 implements security hardening, CSP, frame protection, and rules verification:
- **Strict Content Security Policy (CSP):** Enforced in `next.config.ts` headers with `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `default-src 'self'`, and `connect-src` strictly authorizing only the origin, Firebase RTDB (`*.firebaseio.com`), and Firebase Auth (`*.googleapis.com`). All unauthorized external origins, trackers, and telemetry are rejected at the browser network layer.
- **Anti-Clickjacking & MIME Protection:** Directives `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff` prevent embedding inside external iframes and MIME sniffing attacks.
- **Privacy Headers:** `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, and `Permissions-Policy` disabling unused device sensors (`camera=()`, `microphone=()`, `geolocation=()`).
- **Full RTDB Rules Test Suite:** Deterministic static security test suite (`tests/security-hardening.test.ts`) and expanded emulator test suite (`tests/database.rules.test.mjs`) auditing all branches across `/conversations`, `/userConversations`, `/messages`, `/presence`, and `/typing`. Enforces <64KB payload bounds, immutable ciphertext integrity, delivery receipt authority, generation boundary isolation, and anti-tamper constraints.

## Target architecture

```text
Browser
  ├─ Next.js UI & Composer
  ├─ Firebase Authentication (browserSessionPersistence)
  ├─ Local Web Crypto Device Identity (IndexedDB, non-extractable private keys)
  ├─ Cryptographic AEAD Session Engine (AES-256-GCM + P-256 ECDH + HKDF-SHA256)
  ├─ Volatile Plaintext Memory & In-Memory Cache (zero remote plaintext)
  └─ Firebase Client SDK
       └─ Realtime Database (Temporary encrypted envelopes: /messages/{convId}/{gen}/{msgId})
```

Database rules enforce authenticated membership, match current generation, enforce `< 64KB` payload boundaries, and validate `senderUid`. Delivery receipts (`delivered: true`) are acked in-band by recipient clients without persistent access logs.

## Data and lifecycle principles

- Invitations are high-entropy, single-use, and time-limited.
- Conversation records carry membership, state, and a generation identifier.
- Message records carry ciphertext, protocol metadata, sender, generation, and expiry.
- Clients reject expired or stale-generation messages and opportunistically delete expired ciphertext.
- Destroy-for-both advances the generation and revokes the conversation before cleanup.
- Persistent browser storage is introduced only when required and must not store plaintext.

## Deployment

The intended first deployment is a static/client-heavy Next.js app on Vercel with Firebase free-tier services. Free-tier quotas are finite; exact physical deletion at the expiry timestamp requires a continuously available server cleanup mechanism and is not promised in the zero-cost design.
