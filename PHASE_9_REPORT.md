# Phase 9 Report: Presence, Typing Indicators, and Ephemeral Delivery State

## 1. Executive Summary

Phase 9 implements privacy-respecting, zero-retention presence detection, active typing indicators, and ephemeral delivery receipts for 1:1 conversation sessions. All features leverage Firebase Realtime Database's `.info/connected` status and native `onDisconnect()` server-side hooks, ensuring immediate cleanup when tabs close or connections terminate without incurring server compute costs (₹0 budget constraint).

All presence, typing, and delivery operations are strictly constrained by RTDB security rules, restricted to verified conversation participants, and automatically invalidated if a conversation is destroyed.

---

## 2. Implemented Features

### 2.1 Ephemeral Presence Engine
- **Connection-Bound State (`.info/connected`):** Client establishes connection listeners using `setupUserPresence()`. Upon active connection, the client registers server-side `onDisconnect().set({ status: "offline", lastSeen: serverTimestamp() })` and marks `/presence/{conversationId}/{uid}` as `online`.
- **Graceful Unmount & Offline Reporting:** Navigating away or switching conversations cleanly marks the user offline and cancels the disconnect trigger.
- **Participant UI Display:** Contact sidebar and active chat header display real-time green online indicator or relative last seen time (e.g. `Last seen 2:15 PM`).

### 2.2 Volatile Typing Indicator
- **Typing Pulse Dispatch:** Typing in the message composer publishes `true` to `/typing/{conversationId}/{uid}` with an automatic `onDisconnect().remove()` hook.
- **2.5s Idle Auto-Debounce:** A 2,500ms inactivity timer in `usePresence` automatically resets typing state to `false` when keystrokes pause. Clearing the input or sending the message immediately clears the typing state.
- **Visual Feedback:** Header displays `typing…` status, contact preview in the sidebar displays an animated typing indicator, and the message transcript displays an animated 3-dot bouncing bubble in incoming bubble styling.

### 2.3 Ephemeral Delivery Receipts
- **Sent vs. Delivered Verification:** Sent messages display a single checkmark (`check`). Upon receiving and decrypting an envelope, the recipient client marks `delivered: true` in the RTDB message record.
- **Double-Check Confirmation:** Senders dynamically update the bubble metadata to show a double checkmark (`checkCheck`) when delivered.

### 2.4 Strict Security Rules & Privacy Boundaries
- **Access Control:** RTDB security rules enforce that only authenticated participants of active conversations can read or write to `/presence` and `/typing`. Destroyed or pending conversations forbid access.
- **Metadata Minimization:** No historical presence logs, IP addresses, browser fingerprints, or persistent telemetry are retained.

---

## 3. Files Created & Modified

| File | Status | Description |
| :--- | :--- | :--- |
| `src/features/presence/types.ts` | Created | `UserPresence` and `TypingStatus` type contracts. |
| `src/features/presence/presence-service.ts` | Created | Realtime presence listeners, `onDisconnect` triggers, typing publishing, and peer subscriptions. |
| `src/features/presence/use-presence.ts` | Created | React hook orchestrating presence tracking, 2.5s idle debounce, and status formatting. |
| `database.rules.json` | Modified | Added scoped validation and authorization rules for `/presence/{conversationId}/{uid}` and `/typing/{conversationId}/{uid}`. |
| `src/features/chat/chat-view.tsx` | Modified | Added typing bubble in message area, typing trigger in composer `onChange`, and `check`/`checkCheck` delivery icons. |
| `src/app/page.tsx` | Modified | Integrated `usePresence`, mapped live peer presence into contacts list and `ChatView`, and updated badge to `PHASE 9 PRESENCE & TYPING`. |
| `src/app/globals.css` | Modified | Added `.typing-bubble` styling for transcript typing indicator. |
| `package.json` | Modified | Added `test:presence` script. |
| `tests/presence-typing.test.ts` | Created | 6 automated unit tests validating schema, debounce behavior, delivery state transitions, and security isolation. |
| `ROADMAP.md` | Modified | Marked Phase 9 as Done; Phase 10 as Next. |
| `ARCHITECTURE.md` | Modified | Documented presence, typing, and delivery state architecture. |
| `SECURITY.md` | Modified | Documented presence/typing metadata minimization and security boundaries. |

---

## 4. Verification & Testing

### 4.1 Automated Unit Tests
Executed all test suites across the repository:
```bash
npm run test:identity
npm run test:crypto
npm run test:messaging
npm run test:expiry
npm run test:destroy
npm run test:presence
```
- **Total Tests Passed:** 29 passed across 6 test suites with 0 failures.
- **Presence Suite:** Passed all 6 tests in `tests/presence-typing.test.ts` (schema validation, debounce simulation, delivery receipt transitions, and path isolation).

### 4.2 Typecheck & Lint
```bash
npm run typecheck # 0 errors
npm run lint      # 0 errors, 0 warnings
```

### 4.3 Production Build
```bash
npm run build     # Successfully generated static output and routes
```

---

## 5. Security & Threat Model Compliance

1. **STRIDE - Information Disclosure:** No message content or decryption keys are exposed in presence or typing channels. Only booleans and unix timestamps are exchanged.
2. **STRIDE - Tampering:** Database rules prevent users from publishing presence or typing under another user's UID or in conversations they do not belong to.
3. **STRIDE - Elevation of Privilege:** When a conversation is destroyed (`state == 'destroyed'`), all read and write permissions to `/presence` and `/typing` are permanently revoked by database rules.
4. **Zero Investment (₹0 Free Tier):** Uses RTDB native client connections (`.info/connected`) and `onDisconnect()`. No Cloud Functions, background cron jobs, or paid services are required.

---

## 6. Manual Testing Steps

1. **Start local development server:**
   ```bash
   npm run dev
   ```
2. **Open two distinct browser windows/profiles:**
   - Window A: Sign in as User 1.
   - Window B: Sign in as User 2 (in Incognito or a different profile).
3. **Pair the two devices:**
   - In Window A, click **New Chat** -> Generate invite code.
   - In Window B, click **Join with Code** -> Enter the 22-character invite code.
4. **Verify Live Presence:**
   - Observe both windows show the paired peer as **Online** with a green dot in the sidebar and chat header.
   - Close Window B's tab. Within 5–10 seconds, Window A shows the peer as **Offline** or `Last seen [Time]`.
   - Reopen Window B and re-enter the chat; Window A immediately flips back to **Online**.
5. **Verify Live Typing:**
   - In Window B, type in the message composer.
   - Observe Window A immediately shows `typing…` in the header, an animated typing indicator in the sidebar, and a 3-dot bouncing typing bubble in the message area.
   - Stop typing for 3 seconds. The typing indicator disappears in Window A.
6. **Verify Delivery Receipts:**
   - In Window A, send a message.
   - While in transit, note the single checkmark (`check`).
   - As Window B receives and decrypts the envelope, Window A's checkmark updates to a double checkmark (`checkCheck`).
