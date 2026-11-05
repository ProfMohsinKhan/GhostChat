# Threat Model

## Scope

This document describes the intended GhostChat product. Phase 3 has Firebase email/password authentication and invite-based pairing. Phase 4 creates a local device identity with non-extractable Web Crypto private keys and a public fingerprint. Peer verification, session establishment, message content, and encryption are not implemented; see [SECURITY.md](./SECURITY.md). The scoped Phase 3 rules are deployed.

## Assets

- Message plaintext and attachments (attachments are out of MVP scope).
- Device identity keys, session state, and contact verification state.
- Account credentials and invitation secrets.
- Short-lived browser authentication session.
- Conversation membership, expiry, destruction, and presence metadata.

## Adversaries and protections

| Threat | Planned mitigation |
| --- | --- |
| Someone reads database records | Client-side encryption; Firebase contains ciphertext and limited metadata |
| Unauthenticated or unrelated account accesses a conversation | Default-deny RTDB rules; authenticated membership checks on every path |
| Ciphertext is modified or replayed | Authenticated protocol, message identifiers/counters, generation checks |
| Client reconnects with expired or destroyed data | Expiry and generation validation before display/decryption; local cache clearing |
| Invitation is guessed or reused | 128-bit random code, 24-hour lifetime, and a rules-enforced single pending-to-active transition |
| Script injection reads active plaintext or keys | Safe text rendering, restrictive CSP, dependency minimization and review |

Auth persistence is limited to the browser session. Accounts are provisioned by the project owner. Pairing codes connect existing Auth accounts but do not grant Auth account creation. Deployed Phase 3 rules grant access only to pairing records and each member's own conversation index.

## Out of scope / residual risk

GhostChat cannot protect a conversation from a malicious participant, a compromised endpoint, a hostile browser extension, a modified client, screenshots, external recording, or user-created backups. The server and network can still observe some metadata. Exact physical deletion from remote backups is not guaranteed.

## Security Gate Resolution & Verification

The cryptographic protocol gate was formally addressed in Phase 5 and verified through Phase 13. GhostChat implements a standardized, audited Web Crypto AEAD engine utilizing:
1. Native browser Web Crypto primitives (`ECDH` over NIST `P-256`).
2. `HKDF-SHA256` key derivation with context-bound info strings.
3. Authenticated encryption with associated data (`AES-256-GCM`, 128-bit authentication tag, 12-byte initialization vectors).
4. Strict AAD binding sealing `conversationId`, `generation`, `senderUid`, `sequence`, and `expiresAt` directly into the AEAD tag.

All 56 unit and end-to-end audit tests pass without external unmaintained dependencies, guaranteeing reliable client-side E2EE across all modern browsers.
