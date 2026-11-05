# GhostChat 👻

> **Privacy-first, zero-investment (₹0 budget), ephemeral 1:1 messaging web application with audited client-side End-to-End Encryption (E2EE), automatic message expiration, mutual conversation destruction, safety verification, and an installable PWA shell.**

[![Production Ready](https://img.shields.io/badge/Status-Production%20Ready-brightgreen)](./ROADMAP.md)
[![E2EE](https://img.shields.io/badge/Security-Web%20Crypto%20E2EE-blue)](./SECURITY.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](./LICENSE)
[![Zero Cost](https://img.shields.io/badge/Budget-%E2%82%B90%20Zero--Cost-success)](./DEPLOYMENT.md)

---

## 1. Key Features & Cryptographic Architecture

GhostChat is designed around an uncompromising zero-trust, zero-leakage threat model. No server ever sees plaintext, private keys, or long-term communication logs.

- 🔒 **Client-Side Web Crypto AEAD Engine:**
  - Standardized **P-256 ECDH** key agreement + **HKDF-SHA256** key derivation + **AES-256-GCM** authenticated encryption.
  - **Associated Authenticated Data (AAD):** Every envelope cryptographically binds `conversationId`, `generation`, `senderUid`, `sequence`, and `expiresAt` directly into the AEAD 128-bit authentication tag. Modifying or replaying any metadata byte breaks decryption.
  - **Dual-Recipient Envelopes:** Fresh ephemeral P-256 key pair per message allows both recipient and sender to decrypt without sharing long-term secret keys.
- 🔑 **Non-Extractable Device Identity:**
  - P-256 signing and agreement keys generated locally in the browser via Web Crypto API with `extractable: false`.
  - Keys reside safely in client-side IndexedDB; private keys can never be exported or exfiltrated via script APIs.
- ⏱️ **Automatic Message Expiry & Opportunistic Cleanup:**
  - Configurable expiration timers (default 20 min, 10 min, 5 min, 1 hr).
  - Background 5-second ticker evicts messages from active UI and memory upon threshold expiration.
  - Connected clients execute opportunistic batch sweeps on Firebase RTDB to physically delete expired ciphertexts without needing paid cloud workers.
- 💥 **Mutual "Destroy for Both":**
  - Either participant can initiate conversation destruction.
  - Executes an atomic multi-path transaction bumping the generation counter ($G \to G+1$), setting `state: "destroyed"`, and wiping all transport ciphertexts under the active generation.
  - Offline returning clients are barred from resurrecting past messages due to generation-scoped AAD binding and database rules.
- 🛡️ **Device & Contact Verification:**
  - Commutative 60-digit numeric safety numbers (12 blocks of 5 digits) and 64-char hex fingerprints derived deterministically via SHA-512 from lexicographically sorted public keys (`[keyA, keyB].sort()`).
  - Zero-dependency SVG QR code matrix generator for in-person optical scanning.
  - Local-only trust storage in IndexedDB with automated alerts if a contact's cryptographic key changes.
- 👁️ **Ephemeral Presence & Typing Indicators:**
  - Realtime online/offline monitoring via `.info/connected` with server-side `onDisconnect()` handlers.
  - Volatile typing pulses with a 2.5-second inactivity debounce. Zero persistent telemetry.
- 📱 **Installable Progressive Web App (PWA):**
  - Web App Manifest (`/manifest.webmanifest`), adaptive SVG app icons, and desktop keyboard shortcuts (`Ctrl/Cmd+K`, `Ctrl/Cmd+N`, `Ctrl/Cmd+/`).
  - Service worker (`/sw.js`) enforcing a strict **Zero-Plaintext Policy**: precaches static shell assets only; strictly bypasses and never caches Firebase RTDB websockets or Google Auth endpoints.
- 🛡️ **Defense-in-Depth Security Hardening:**
  - Strict Content Security Policy (CSP) blocking unauthorized external connections and script injections.
  - Anti-clickjacking frame protection (`frame-ancestors 'none'`, `X-Frame-Options: DENY`), `X-Content-Type-Options: nosniff`, and HSTS.
  - Granular Firebase Realtime Database Security Rules enforcing default-deny, `<64KB` payload boundaries, and generation monotonicity.
- 💸 **₹0 Zero-Cost Infrastructure:**
  - Operates 100% within free tiers: **Vercel Hobby Tier** + **Firebase Spark Free Tier**.
  - Zero paid Cloud Functions, Cloud Tasks, Cloud Scheduler, or third-party paid APIs.

---

## 2. Roadmap & Engineering Phases

All 14 phases are fully completed, tested, and audited:

| Phase | Milestone | Status | Key Deliverables |
| :---: | :--- | :---: | :--- |
| **0** | **Threat Model & Architecture** | **Done** | [THREAT_MODEL.md](./THREAT_MODEL.md), STRIDE analysis, zero-cost rules. |
| **1** | **Design System & Responsive UI** | **Done** | [PHASE_1_REPORT.md](./PHASE_1_REPORT.md), Cyberpunk dark shell, mobile drawer. |
| **2** | **Firebase Integration & Auth** | **Done** | [PHASE_2_REPORT.md](./PHASE_2_REPORT.md), `browserSessionPersistence`, owner-provisioned accounts. |
| **3** | **Invitation & Atomic Pairing** | **Done** | [PHASE_3_REPORT.md](./PHASE_3_REPORT.md), 128-bit high-entropy invite codes, 24h expiry. |
| **4** | **Cryptographic Device Identity** | **Done** | [PHASE_4_REPORT.md](./PHASE_4_REPORT.md), Web Crypto non-extractable P-256 keys in IndexedDB. |
| **5** | **AEAD Session Protocol** | **Done** | [PHASE_5_REPORT.md](./PHASE_5_REPORT.md), P-256 ECDH + HKDF + AES-256-GCM + full AAD binding. |
| **6** | **Realtime Encrypted Messaging** | **Done** | [PHASE_6_REPORT.md](./PHASE_6_REPORT.md), Dual-recipient transport envelopes over Firebase RTDB. |
| **7** | **Message Expiry & Sweeping** | **Done** | [PHASE_7_REPORT.md](./PHASE_7_REPORT.md), 20-min auto expiry, active ticker, opportunistic batch sweeps. |
| **8** | **Destroy for Both** | **Done** | [PHASE_8_REPORT.md](./PHASE_8_REPORT.md), Atomic generation bump ($G \to G+1$), memory shredding. |
| **9** | **Presence, Typing & Receipts** | **Done** | [PHASE_9_REPORT.md](./PHASE_9_REPORT.md), `.info/connected`, typing debounce, `checkCheck` delivery receipts. |
| **10** | **Device & Safety Verification** | **Done** | [PHASE_10_REPORT.md](./PHASE_10_REPORT.md), 60-digit safety numbers, SVG QR codes, key-change alerts. |
| **11** | **PWA Shell & Desktop Shortcuts** | **Done** | [PHASE_11_REPORT.md](./PHASE_11_REPORT.md), Manifest, zero-plaintext Service Worker, offline awareness. |
| **12** | **Security Hardening & CSP** | **Done** | [PHASE_12_REPORT.md](./PHASE_12_REPORT.md), Strict CSP headers, frame protection, RTDB rules AST tests. |
| **13** | **Verification & Production Release** | **Done** | [PHASE_13_REPORT.md](./PHASE_13_REPORT.md), End-to-end audit suite, [DEPLOYMENT.md](./DEPLOYMENT.md). |

---

## 3. Quickstart & Local Setup

### Requirements
- **Node.js**: `v20.9.0` or higher
- **npm** or **pnpm**

### Installation
```bash
# Clone the repository
git clone https://github.com/ProfMohsinKhan/GhostChat.git
cd GhostChat

# Install dependencies
npm install

# Setup local environment configuration
cp .env.example .env.local
```

Configure your Firebase credentials in `.env.local` (see [DEPLOYMENT.md](./DEPLOYMENT.md) for details).

```bash
# Run local development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

---

## 4. Verification & Automated Test Suites

GhostChat includes 10 automated test suites with 56 unit and end-to-end audit tests:

```bash
# Run all 10 test suites
npm test

# Run individual suites:
npm run test:identity      # Web Crypto non-extractable identity & fingerprint tests
npm run test:crypto        # P-256 ECDH, HKDF, AES-256-GCM AEAD encryption tests
npm run test:messaging     # Realtime dual-recipient transport envelope tests
npm run test:expiry        # 20-minute expiration & client-side sweeping tests
npm run test:destroy       # Destroy for both & generation bump isolation tests
npm run test:presence      # Ephemeral presence, typing debounce & delivery receipts
npm run test:verification  # 60-digit safety numbers, QR matrix & key change alerts
npm run test:pwa           # Manifest, static icons & zero-plaintext SW policy
npm run test:hardening     # CSP directives, frame protection & RTDB rules AST
npm run test:audit         # Full end-to-end system audit & zero-cost verification

# Typecheck and Lint
npm run typecheck          # 0 errors
npm run lint               # 0 warnings, 0 errors

# Production Build
npm run build              # Builds production Next.js bundle
```

---

## 5. Production Deployment

For complete, step-by-step instructions on deploying GhostChat to **Vercel** and configuring **Firebase Realtime Database** on the free Spark Tier at ₹0 budget, read the [Production Deployment Runbook (DEPLOYMENT.md)](./DEPLOYMENT.md).

---

## 6. Security & Documentation Reference

- [Architecture & Protocol Design (ARCHITECTURE.md)](./ARCHITECTURE.md)
- [Security Guarantees & Threat Model (SECURITY.md)](./SECURITY.md)
- [STRIDE Threat Model & Boundaries (THREAT_MODEL.md)](./THREAT_MODEL.md)
- [Production Deployment Runbook (DEPLOYMENT.md)](./DEPLOYMENT.md)
- [Roadmap & Exit Criteria (ROADMAP.md)](./ROADMAP.md)

---

## 7. License

GhostChat is open-source software licensed under the [MIT License](./LICENSE).
