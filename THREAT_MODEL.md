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

## Open security gate

Before implementing sessions or sending messages, select and review a maintained protocol implementation suitable for browser clients and asynchronous messaging. Phase 5's review found that Signal's official `libsignal` says use outside Signal is unsupported and has native Node bridge layers; the browser-oriented TypeScript port is independent and older. Matrix's actively maintained WebAssembly crypto library is a Matrix-client state machine, requiring Matrix device-key, trust, and sync semantics that GhostChat does not implement. Neither can be treated as a drop-in choice. Do not substitute an improvised protocol if the library choice is unresolved. Phase 4's local P-256 identity must not be presented as protocol-compatible until that review is complete.
