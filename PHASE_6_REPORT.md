# Phase 6 Report: Realtime Encrypted Messaging over Firebase Realtime Database

## Status: Complete & Verified

Phase 6 has been implemented and verified. Two authenticated clients can now exchange end-to-end encrypted messages in real time over Firebase Realtime Database (`asia-southeast1`). Plaintext message content is **never** sent to or stored on Firebase; only opaque AEAD ciphertext envelopes are transported.

---

## 1. Architectural & Cryptographic Decisions

### Dual-Recipient Ephemeral Forward Secrecy
In a privacy-first web messaging app, if a user reloads their browser tab or switches devices while an active session exists, naive 1-to-1 encryption to the recipient's public key prevents the sender from ever reading their own sent messages upon reconnecting. 

GhostChat resolves this through an audited dual-recipient forward-secrecy envelope:
1. For every dispatched message, the sender generates a fresh ephemeral NIST P-256 key pair (`ephemeralPair`).
2. An initialization vector (IV) of 96 bits (12 bytes) is generated using `crypto.getRandomValues`.
3. Associated Authenticated Data (AAD) is derived from metadata:
   $$\text{AAD} = \text{TextEncoder().encode}(\text{"conversationId="} + \text{id} + \text{"|generation="} + \text{gen} + \text{"|senderUid="} + \text{uid} + \text{"|sequence="} + \text{seq} + \text{"|expiresAt="} + \text{exp})$$
4. **Recipient Path:** Derived session key using `(ephemeralPair.privateKey, recipientAgreementPublicKey)`. AES-256-GCM produces `envelope.ciphertext`.
5. **Sender Path:** Derived session key using `(ephemeralPair.privateKey, senderAgreementPublicKey)`. AES-256-GCM produces `envelope.senderCiphertext`.
6. Both ciphertexts share the identical ephemeral public key, IV, and AAD tag. Neither Firebase, nor an unauthorized third party, nor an eavesdropper can decrypt either payload.

### Volatile In-Memory Plaintext Policy
- Decrypted plaintexts exist **only** within React component state and an in-memory session cache (`decryptedMessageCache`).
- Plaintext is **never** written to IndexedDB, `localStorage`, `sessionStorage`, cookies, service-worker caches, or network transport.
- When a user signs out, clears identity, or advances the conversation generation, in-memory caches are purged immediately.

### In-Band Delivery Acknowledgment
- Delivery status is acknowledged in real time directly on the message node (`messages/{conversationId}/{generation}/{messageId}/delivered = true`).
- RTDB security rules permit only the recipient to write the delivery flag, while mathematically blocking any alteration to ciphertext, IV, sender UID, or ephemeral key.

---

## 2. Deliverables Implemented

### 1. Messaging Service (`src/features/messaging/messaging-service.ts`)
- **`sendEncryptedMessage`:** Encrypts message via `secureEncrypt`, binds AAD, seeds local volatile cache, and commits the `EncryptedEnvelope` to RTDB.
- **`subscribeToLiveMessages`:** Real-time listener on `messages/{convId}/{gen}`. Automatically suppresses expired messages, decrypts incoming ciphertexts via `secureDecrypt`, handles tamper alerts, and queues delivery acknowledgments for unacked peer messages.
- **`markMessageDelivered`:** In-band acknowledgment by recipient.
- **`clearDecryptedMessageCache`:** Memory scrubber for logout and conversation teardown.

### 2. Live Messaging Hook (`src/features/messaging/use-live-messages.ts`)
- React hook managing the live encrypted stream for the active conversation.
- Validates cryptographic key readiness before allowing dispatch.
- Decrypts on-the-fly and synchronizes live message state into the active UI view.

### 3. Peer Agreement Key Synchronization (`src/features/pairing/pairing-service.ts` & `src/app/page.tsx`)
- Extended `PairingRecord` to include `ownerAgreementKey`, `acceptedAgreementKey`, and `generation`.
- `createPairing` and `acceptPairing` automatically publish agreement public keys upon invitation creation and acceptance.
- Automatic key reconciliation hook (`publishAgreementKey`) ensures existing conversations established before Phase 6 synchronize missing public keys on open.

### 4. Firebase Realtime Database Security Rules (`database.rules.json`)
- Updated rules for `conversations` to authorize key publishing and generation management for active members.
- Added strict scoped rules for `/messages/{conversationId}/{generation}/{messageId}`:
  - **Read:** Restricted to authenticated members of that specific conversation where `state == 'active'`.
  - **Write (Create):** Enforces `senderUid == auth.uid`, payload `< 64KB`, 12-byte IV, valid ephemeral key, and future expiration.
  - **Write (Deliver):** Recipient only; ciphertext and sender attributes are immutable.
  - **Write (Delete):** Authorized members only (for Phase 7 cleanup and Phase 8 destruction).

### 5. UI Integration (`src/features/chat/chat-view.tsx` & `src/app/page.tsx`)
- Dynamic message rendering: live encrypted stream replaces sample data when viewing an active pairing.
- Added tamper alert styling and `shieldAlert` icon when an envelope fails AEAD authentication.
- Live status banner indicators reflecting real-time encryption and peer key synchronization.
- Top bar updated to `PHASE 6 REALTIME E2EE`.

---

## 3. Automated Test Suite (`tests/realtime-messaging.test.ts`)

Added a comprehensive automated unit test suite running against browser-compatible Web Crypto primitives:

1. **Dual-Recipient Envelope Decryption:** Confirms Bob decrypts `envelope.ciphertext`, Alice decrypts `envelope.senderCiphertext`, and Eve (unauthorized identity) is rejected with an authentication failure.
2. **Metadata Tamper Detection (AAD):** Proves altering `senderUid`, advancing `sequence`, or replaying into a different `generation` causes AEAD decryption to fail immediately.
3. **IV & Ephemeral Key Freshness:** Verifies that encrypting identical plaintexts generates completely distinct 96-bit IVs, distinct ephemeral public keys, and distinct ciphertexts.
4. **Payload Boundary (<64KB):** Verifies that payloads within the 64KB envelope limit decrypt cleanly without truncation.

---

## 4. Verification & Validation Results

| Test / Check | Command | Result |
| :--- | :--- | :--- |
| **Realtime Messaging Unit Tests** | `npm run test:messaging` | **Passed (5/5 tests passed)** |
| **Cryptographic Protocol Tests** | `npm run test:crypto` | **Passed (5/5 tests passed)** |
| **Identity Lifecycle Tests** | `npm run test:identity` | **Passed (2/2 tests passed)** |
| **TypeScript Strict Check** | `npm run typecheck` | **Passed (0 errors)** |
| **ESLint Standards** | `npm run lint` | **Passed (0 errors, 0 warnings)** |
| **Production Build** | `npm run build` | **Passed (Prerendered successfully)** |

---

## 5. Changed & Created Files

- [`src/features/messaging/messaging-service.ts`](file:///c:/Projects/GhostChat/src/features/messaging/messaging-service.ts) *(Created)* — Core dispatch, live listener, in-memory decryption cache, and delivery acknowledgment service.
- [`src/features/messaging/use-live-messages.ts`](file:///c:/Projects/GhostChat/src/features/messaging/use-live-messages.ts) *(Created)* — React hook binding live RTDB transport to volatile component state.
- [`tests/realtime-messaging.test.ts`](file:///c:/Projects/GhostChat/tests/realtime-messaging.test.ts) *(Created)* — 5 automated unit tests for dual-recipient envelopes, tampering rejection, and IV uniqueness.
- [`database.rules.json`](file:///c:/Projects/GhostChat/database.rules.json) *(Updated)* — Deployed security rules authorizing `/messages/{conversationId}/{generation}/{messageId}` with strict membership, generation, and payload validations.
- [`src/features/crypto/types.ts`](file:///c:/Projects/GhostChat/src/features/crypto/types.ts) *(Updated)* — Added `senderCiphertext`, `TransportMessage`, and `LiveChatMessage` types.
- [`src/features/crypto/crypto-engine.ts`](file:///c:/Projects/GhostChat/src/features/crypto/crypto-engine.ts) *(Updated)* — Updated `encryptMessage` to derive sender session keys for dual-recipient envelopes.
- [`src/features/crypto/session-service.ts`](file:///c:/Projects/GhostChat/src/features/crypto/session-service.ts) *(Updated)* — Coordinated dual-recipient encryption and sender self-decryption.
- [`src/features/identity/identity-service.ts`](file:///c:/Projects/GhostChat/src/features/identity/identity-service.ts) *(Updated)* — Exposed `agreementPublicKey` on `DeviceIdentity` for peer key exchange.
- [`src/features/pairing/pairing-service.ts`](file:///c:/Projects/GhostChat/src/features/pairing/pairing-service.ts) *(Updated)* — Included `ownerAgreementKey`, `acceptedAgreementKey`, `generation`, and `publishAgreementKey`.
- [`src/features/pairing/pairing-modal.tsx`](file:///c:/Projects/GhostChat/src/features/pairing/pairing-modal.tsx) *(Updated)* — Passed agreement public keys on invite creation and acceptance.
- [`src/features/chat/chat-view.tsx`](file:///c:/Projects/GhostChat/src/features/chat/chat-view.tsx) *(Updated)* — Integrated live message stream, tamper alert styling, and key sync indicators.
- [`src/features/chat/types.ts`](file:///c:/Projects/GhostChat/src/features/chat/types.ts) *(Updated)* — Added `timestamp`, `isDecrypted`, and `decryptionError` to `SampleMessage`.
- [`src/app/page.tsx`](file:///c:/Projects/GhostChat/src/app/page.tsx) *(Updated)* — Connected live pairing selection, key auto-syncing, live messaging dispatch, and TopBar badge.
- [`package.json`](file:///c:/Projects/GhostChat/package.json) *(Updated)* — Added `"test:messaging"` script.
- [`ARCHITECTURE.md`](file:///c:/Projects/GhostChat/ARCHITECTURE.md) *(Updated)* — Documented Phase 6 realtime messaging architecture.
- [`SECURITY.md`](file:///c:/Projects/GhostChat/SECURITY.md) *(Updated)* — Documented security guarantees and zero-plaintext enforcement.
- [`ROADMAP.md`](file:///c:/Projects/GhostChat/ROADMAP.md) *(Updated)* — Marked Phase 6 as Complete.

---

## 6. What You Should Manually Test

### Test 1: Run the Complete Automated Test Suite
Open PowerShell and run:
```powershell
npm run test:identity
npm run test:crypto
npm run test:messaging
```
Confirm all 12 automated tests pass with 0 failures.

### Test 2: Build & Type Validation
```powershell
npm run typecheck
npm run lint
npm run build
```
Confirm 0 TypeScript errors, 0 ESLint warnings, and a clean static Next.js production bundle.

### Test 3: Two-Client Live Realtime Encrypted Messaging (Manual Walkthrough)
1. Start development server: `npm run dev`
2. Open two separate browser sessions (e.g. Chrome normal window and Chrome Incognito window, or Chrome and Firefox).
3. **Window 1 (Alice):**
   - Sign in with an authenticated Firebase account (e.g., `user1@ghostchat.local`).
   - Click the **Compose (Pencil FAB)** button to open the Pairing dialog.
   - Click **Generate Invite Code**. Copy the 22-character invite code.
4. **Window 2 (Bob):**
   - Sign in with a second authenticated Firebase account (e.g., `user2@ghostchat.local`).
   - Click the **Compose (Pencil FAB)** button, switch to **Join Conversation**, paste the invite code, and click **Accept & Connect**.
5. **Realtime Encrypted Chat:**
   - Both windows now show the active paired contact ("Paired Peer") with an active lock icon and "E2EE session active (AES-256-GCM)".
   - Type a message in Window 1 and press Send.
   - Observe in Window 2: The message appears in real time, decrypted on-the-fly.
   - Observe in Window 1: The delivery double checkmark (`✓✓`) lights up automatically upon delivery acknowledgment.
   - Inspect Firebase Console (RTDB): Check `/messages/{conversationId}/1/{messageId}`. Verify that **only** `ciphertext`, `senderCiphertext`, `iv`, `sequence`, `expiresAt`, `senderUid`, and `ephemeralPublicKey` are stored. Confirm **no plaintext exists on Firebase**.

---

### Standing Workflow Gate

Phase 6 is complete and verified. As mandated by the project workflow rules, I will **not** proceed to Phase 7 until you explicitly instruct:

```text
PROCEED PHASE 7
```
