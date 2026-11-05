# Roadmap

The roadmap is gated: complete and review one phase before beginning the next.

| Phase | Objective | Status | Exit criteria |
| :---: | :--- | :---: | :--- |
| **0** | **Repository audit, architecture, and threat model** | **Done** | Product boundaries, STRIDE threat model, zero-cost (₹0) rules, and Web Crypto E2EE strategy documented. |
| **1** | **Design system and responsive UI shell** | **Done** | All 8 screens from UI brief implemented; responsive desktop rail and mobile slide views; interactive in-memory sample state; 0 lint/typecheck errors; build passes. |
| **2** | **Firebase integration and authentication** | **Done** | Browser-session auth persistence; email/password sign-in; deny-all base database rules; unconfigured & error fallbacks verified. |
| **3** | **Invitation and conversation pairing** | **Done** | High-entropy 128-bit single-use invite codes; atomic pending-to-active transition; scoped RTDB rules; live realtime sync. |
| **4** | **Cryptographic identity and key lifecycle** | **Done** | Non-extractable Web Crypto P-256 keys generated in IndexedDB; public fingerprint derivation; explicit removal/recreation lifecycle. |
| **5** | **End-to-end session protocol & AEAD** | **Done** | Audited Web Crypto engine (P-256 ECDH + HKDF-SHA256 + AES-256-GCM); full AAD binding; 5 automated crypto tests passed. |
| **6** | **Realtime encrypted messaging** | **Done** | Two authorized clients exchange ciphertext envelopes over Firebase RTDB; zero plaintext on server. |
| **7** | **Message expiry and opportunistic cleanup** | **Done** | Automatic 20-min client message invalidation; opportunistic background sweeps; zero-cost compliance. |
| **8** | **Destroy for both and generation handling** | **Done** | Atomic generation bump purges transport ciphertexts and forces offline returning clients to discard stale messages. |
| **9** | **Presence, typing, and delivery state** | **Done** | Ephemeral metadata via `.info/connected`; typing indicators; delivery receipts without permanent logs. |
| **10** | **Device & contact verification** | **Done** | Safety fingerprint comparison; QR code verification; key-change warning alerts. |
| **11** | **PWA shell & desktop refinement** | **Done** | Installable web app shell; service worker caching static assets only (zero plaintext cached). |
| **12** | **Security hardening & rules verification** | **Done** | Content Security Policy (CSP); frame protection; full RTDB Security Rules test suite. |
| **13** | **Full verification & production deployment** | **Done** | End-to-end audit; zero-cost verification; Vercel deployment; production release docs. |

---

*All phases (0 through 13) are complete, fully verified, and production ready.*
