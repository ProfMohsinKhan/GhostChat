# Phase 7 Report: Message Expiry & Opportunistic Cleanup

## Status: Complete & Verified

Phase 7 has been implemented and verified. GhostChat now features automatic 20-minute (and configurable 5m, 10m, 1h) message expiration, application-state invalidation, active session countdown ticking, and opportunistic physical ciphertext sweeps over Firebase Realtime Database.

---

## 1. Architectural Principles: Guaranteed vs Best-Effort Behavior

GhostChat strictly adheres to the ₹0 zero-investment free-tier boundary (Firebase Spark Free Tier + Vercel Hobby Tier). Because the free tier does not provide always-on server-side cron workers or paid Cloud Functions to trigger physical deletions in the background when all devices are offline, the architecture honestly distinguishes between **Guaranteed Behavior** and **Best-Effort Behavior**:

| Category | Characteristic | Guarantee |
| :--- | :--- | :--- |
| **Guaranteed Behavior** | **Cryptographic & Logical Invalidation** | **Absolute.** Every message's `expiresAt` timestamp is cryptographically bound into the AES-256-GCM authentication tag via Associated Authenticated Data (AAD). Any attempt to modify `expiresAt` causes immediate decryption failure. |
| **Guaranteed Behavior** | **UI Invisibility & State Eviction** | **Absolute.** `expiresAt` is treated as core application state, not visual UI. A 5-second active background interval checks message timestamps, recalculates countdowns, and drops expired messages from memory immediately. |
| **Guaranteed Behavior** | **Memory & Cache Cleansing** | **Absolute.** Expired plaintexts are immediately evicted from component memory and purged from the in-memory decryption cache (`decryptedMessageCache`). Plaintext is never written to disk or storage. |
| **Best-Effort Behavior** | **Physical Database Cleanup** | **Opportunistic.** Physical deletion of ciphertext records from Firebase RTDB (`/messages/{convId}/{gen}/{msgId}`) occurs opportunistically whenever an authorized client connects, loads a conversation, or encounters expired messages. Dormant records remain encrypted until swept. |

---

## 2. Deliverables Implemented

### 1. Cryptographic Expiry Binding (`src/features/crypto/crypto-engine.ts`)
- The `expiresAt` timestamp is immutably sealed inside the AEAD tag via Associated Authenticated Data:
  $$\text{AAD} = \dots + \text{"|expiresAt="} + \text{expiresAt}$$
- Tampering with `expiresAt` by even 1 millisecond causes AEAD tag verification to fail immediately.

### 2. Opportunistic Physical Sweep Engine (`src/features/messaging/messaging-service.ts`)
- **`sweepExpiredMessages`:** Executes an atomic multi-path deletion (`updates[path] = null`) deleting all identified expired message IDs from Firebase RTDB in a single batch request, and evicts their entries from `decryptedMessageCache`.
- **Live Stream Sweep Hook:** Inside `subscribeToLiveMessages`, any incoming envelope where `item.expiresAt <= Date.now()` is omitted from the UI and queued for background physical deletion.

### 3. Active Session Expiration Ticker (`src/features/messaging/use-live-messages.ts`)
- A high-precision 5-second background interval scans active messages in volatile React state.
- Recalculates remaining minutes dynamically for real-time countdown badges (`19m`, `18m`, `1m`...).
- Drops messages from UI memory the moment `msg.expiresAt <= Date.now()` and triggers an immediate opportunistic physical sweep to Firebase RTDB.

### 4. Dynamic Expiry Duration Selection (`src/features/chat/chat-view.tsx` & `src/app/page.tsx`)
- Integrated with `EphemeralControlsModal`: parses and applies user-selected timers ("5 min", "10 min", "20 min", "1 hour") via `parseExpiryDurationMs`.
- Dynamic UI updates: TopBar badge (`PHASE 7 AUTO-PURGE`), chat banner ("Messages disappear after X"), composer action pill ("Auto-Delete: X"), and chat list flame badges (`20m`, `10m`).

### 5. Scoped Security Rules for Deletion (`database.rules.json`)
- Refined RTDB security rules for `/messages/{conversationId}/{generation}/{messageId}`:
  - Senders can delete their own messages anytime.
  - EITHER member can delete an expired message: `data.child('expiresAt').val() <= now`.
  - Recipient cannot prematurely delete an unexpired message sent by the peer while the conversation is active.

---

## 3. Automated Test Suite (`tests/expiry-cleanup.test.ts`)

Added 5 automated unit tests validating Phase 7 guarantees:

1. **Expiry Duration Parsing:** Confirms proper ms conversion across `"5 min"`, `"10 min"`, `"20 min"`, `"1 hour"`, and fallback default (20m).
2. **AEAD Expiry Tag Binding:** Proves attempting to extend `expiresAt` by even 1 hour causes AEAD decryption to fail with an authentication error.
3. **Application-State Invalidation:** Proves expired envelopes are excluded from active memory and queued for sweeping.
4. **Active Session Ticker Simulation:** Proves that advancing time past an envelope's expiry point purges the message from active state and queues it for physical sweep.
5. **Countdown Badge Precision:** Confirms remaining minute calculations decrement smoothly.

---

## 4. Verification & Validation Results

| Test / Check | Command | Result |
| :--- | :--- | :--- |
| **Message Expiry Unit Tests** | `npm run test:expiry` | **Passed (5/5 tests passed)** |
| **Realtime Messaging Unit Tests** | `npm run test:messaging` | **Passed (5/5 tests passed)** |
| **Cryptographic Protocol Tests** | `npm run test:crypto` | **Passed (5/5 tests passed)** |
| **Identity Lifecycle Tests** | `npm run test:identity` | **Passed (2/2 tests passed)** |
| **TypeScript Strictness** | `npm run typecheck` | **Passed (0 errors)** |
| **ESLint Standards** | `npm run lint` | **Passed (0 errors, 0 warnings)** |
| **Production Build** | `npm run build` | **Passed (Static routes prerendered successfully)** |

*Total automated unit tests passed: 17/17.*

---

## 5. Changed & Created Files

- [`tests/expiry-cleanup.test.ts`](file:///c:/Projects/GhostChat/tests/expiry-cleanup.test.ts) *(Created)* — 5 unit tests for expiry parsing, AEAD expiry tamper rejection, application-state invalidation, and active ticker simulation.
- [`src/features/messaging/messaging-service.ts`](file:///c:/Projects/GhostChat/src/features/messaging/messaging-service.ts) *(Updated)* — Added `parseExpiryDurationMs`, `sweepExpiredMessages`, and opportunistic batch cleanup.
- [`src/features/messaging/use-live-messages.ts`](file:///c:/Projects/GhostChat/src/features/messaging/use-live-messages.ts) *(Updated)* — Added 5-second active session expiration ticker and live memory pruning.
- [`database.rules.json`](file:///c:/Projects/GhostChat/database.rules.json) *(Updated)* — Enforced rule allowing deletion of expired messages (`data.child('expiresAt').val() <= now`) while blocking premature peer deletion.
- [`src/features/chat/chat-view.tsx`](file:///c:/Projects/GhostChat/src/features/chat/chat-view.tsx) *(Updated)* — Dynamic banner, composer action pill, and caption reflecting active expiry duration.
- [`src/app/page.tsx`](file:///c:/Projects/GhostChat/src/app/page.tsx) *(Updated)* — Bound `activeTimer` to live dispatch, dynamic flame badge in chat list, and TopBar badge.
- [`package.json`](file:///c:/Projects/GhostChat/package.json) *(Updated)* — Added `"test:expiry"` test runner script.
- [`ARCHITECTURE.md`](file:///c:/Projects/GhostChat/ARCHITECTURE.md) *(Updated)* — Documented Phase 7 expiry architecture.
- [`SECURITY.md`](file:///c:/Projects/GhostChat/SECURITY.md) *(Updated)* — Documented guaranteed vs best-effort boundaries.
- [`ROADMAP.md`](file:///c:/Projects/GhostChat/ROADMAP.md) *(Updated)* — Phase 7 marked as Complete.
- [`PHASE_7_REPORT.md`](file:///c:/Projects/GhostChat/PHASE_7_REPORT.md) *(Created)* — This comprehensive phase report.

---

## 6. What You Should Manually Test

### Test 1: Run All Test Suites
Open PowerShell and run:
```powershell
npm run test:identity
npm run test:crypto
npm run test:messaging
npm run test:expiry
```
Confirm all 17 automated tests pass with 0 errors.

### Test 2: Build & Type Validation
```powershell
npm run typecheck
npm run lint
npm run build
```
Confirm 0 TypeScript errors, 0 ESLint warnings, and a successful Next.js production build.

### Test 3: Expiry & Auto-Purge Walkthrough (Manual UI Verification)
1. Start development server: `npm run dev`
2. Open two browser windows (Window 1 = Alice, Window 2 = Bob) and connect to an active pairing.
3. Click the **Auto-Delete: 20 min** action pill at the bottom of the conversation view, or open the Ephemeral Controls dialog.
4. Select **5 min** (or **10 min**). Observe that the banner and composer caption update to: `"Messages disappear after 5 min"`.
5. Send an encrypted message from Window 1 to Window 2.
6. Observe:
   - The message bubble appears with a `5m` remaining indicator and a flame badge.
   - Every minute, the countdown smoothly decrements (`4m`, `3m`, `2m`, `1m`).
   - When the timestamp crosses the expiration point, the message instantly vanishes from both windows' screens without requiring a page reload.
   - Inspect Firebase RTDB Console: Verify that the message record is physically deleted from `/messages/{conversationId}/1/` by the opportunistic sweep.

---

### Standing Workflow Gate

Phase 7 is complete and verified. As mandated by the project workflow rules, I will **not** proceed to Phase 8 until you explicitly instruct:

```text
PROCEED PHASE 8
```
