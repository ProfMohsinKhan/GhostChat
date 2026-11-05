# GhostChat Production Deployment Runbook

This runbook provides complete, step-by-step instructions for deploying GhostChat into production using **Vercel Hobby Tier** and **Firebase Spark Free Tier**, achieving an **uncompromising zero-cost (₹0 / $0 budget)** infrastructure profile while maintaining full cryptographic End-to-End Encryption (E2EE), ephemeral messaging, and defense-in-depth security hardening.

---

## 1. Architecture & Zero-Cost (₹0) Invariants

GhostChat is engineered strictly as a client-side cryptographic web application (PWA) with zero server-side state compute:

```
[Browser Client / PWA Shell]
   │
   ├── Web Crypto API (P-256 ECDH, HKDF-SHA256, AES-256-GCM AEAD)
   ├── IndexedDB (Non-extractable private keys & local trust state)
   ├── Volatile State Memory (Zero plaintext on disk or remote servers)
   │
   ├── Vercel Edge Network (Static Next.js App Shell + Strict CSP Headers)
   │
   └── Firebase Spark Free Tier (asia-southeast1)
         ├── Firebase Authentication (Browser-session persistence)
         └── Realtime Database (Temporary encrypted envelopes, presence, typing)
```

### Zero-Cost Compliance Table

| Component | Platform | Plan | Budget | Enforcement Mechanism |
| :--- | :--- | :--- | :---: | :--- |
| **Hosting & CDN** | Vercel | Hobby Tier | ₹0 | Static shell optimization, automated CI/CD via GitHub. |
| **Authentication** | Firebase Auth | Spark Tier | ₹0 | Email/Password owner-provisioned accounts (no paid SMS/OAuth). |
| **Realtime Transport** | Firebase RTDB | Spark Tier | ₹0 | Encrypted envelopes under `/messages`, payload limits `<64KB`, 100 concurrent connection quota. |
| **Message Expiry** | Client Runtime | Local Engine | ₹0 | 5-second active ticker + opportunistic batch sweeps by connected clients (no paid Cloud Functions or Cloud Tasks). |
| **Key & Trust Storage** | Client Browser | IndexedDB | ₹0 | Non-extractable Web Crypto keys stored locally on each client device. |

---

## 2. Prerequisites

1. **GitHub Account**: Access to the [GhostChat repository](https://github.com/ProfMohsinKhan/GhostChat).
2. **Firebase Account**: Free account on [Firebase Console](https://console.firebase.google.com/).
3. **Vercel Account**: Free account on [Vercel](https://vercel.com/).
4. **Node.js**: Node 20.9+ with `npm` installed locally.
5. **Firebase CLI**: Installed globally via `npm install -g firebase-tools`.

---

## 3. Step 1: Firebase Project Setup

### 3.1 Create Firebase Project
1. Open the [Firebase Console](https://console.firebase.google.com/) and click **Add Project**.
2. Name your project (e.g. `ghostchat-c56c9` or `ghostchat-prod`).
3. **Disable Google Analytics** (preserves user privacy, simplifies CSP, and prevents external trackers).
4. Select the default **Spark Free Tier**.

### 3.2 Enable Email/Password Authentication
1. In the Firebase Console left sidebar, navigate to **Build** → **Authentication**.
2. Click **Get Started**.
3. Under the **Sign-in method** tab, select **Email/Password**.
4. Enable **Email/Password** (keep "Email link / passwordless" disabled).
5. Click **Save**.
6. Under the **Users** tab, click **Add user** to manually provision authorized accounts (e.g., Alice and Bob).
   > **Security Note:** GhostChat does not offer public self-registration. All accounts are owner-provisioned by design to eliminate bot spam and account spoofing.

### 3.3 Create Realtime Database
1. In the left sidebar, navigate to **Build** → **Realtime Database**.
2. Click **Create Database**.
3. Select your database location: choose `asia-southeast1` (Singapore) or the location geographically nearest to your users.
4. Choose **Start in locked mode** (deny-all by default).
5. Click **Enable**.

### 3.4 Register Web App & Collect Credentials
1. Click the **Project Overview gear icon** (⚙️) → **Project settings**.
2. Under **Your apps**, click the **Web (</>)** icon.
3. App nickname: `GhostChat Web`.
4. Leave "Also set up Firebase Hosting" unchecked (we are deploying via Vercel).
5. Click **Register app**.
6. Copy the `firebaseConfig` keys. You will need them for your environment variables:
   - `apiKey`
   - `authDomain`
   - `databaseURL`
   - `projectId`
   - `storageBucket`
   - `messagingSenderId`
   - `appId`

### 3.5 Deploy Database Security Rules
1. In your local terminal, log in to Firebase:
   ```bash
   firebase login
   ```
2. Verify that `.firebaserc` points to your project ID:
   ```bash
   firebase use <your-project-id>
   ```
3. Deploy the audited ruleset directly from [`database.rules.json`](file:///c:/Projects/GhostChat/database.rules.json):
   ```bash
   firebase deploy --only database
   ```
4. Verify in the Firebase Console under **Realtime Database** → **Rules** that the rules are live.

---

## 4. Step 2: Vercel Production Deployment

### 4.1 Import Repository
1. Log in to [Vercel](https://vercel.com/) and click **Add New...** → **Project**.
2. Connect your GitHub account and select **`ProfMohsinKhan/GhostChat`**.
3. In the project configuration screen:
   - **Framework Preset**: `Next.js`
   - **Root Directory**: `./`
   - **Build Command**: `next build`
   - **Output Directory**: `.next`

### 4.2 Configure Environment Variables
In the **Environment Variables** section on Vercel, add each of the following variables from your Firebase Web configuration:

| Name | Example Value | Description |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `AIzaSy...` | Firebase Web API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `ghostchat-prod.firebaseapp.com` | Firebase Auth domain |
| `NEXT_PUBLIC_FIREBASE_DATABASE_URL` | `https://ghostchat-prod-default-rtdb.asia-southeast1.firebasedatabase.app` | Regional RTDB URL |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `ghostchat-prod` | Firebase Project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `ghostchat-prod.appspot.com` | Storage bucket identifier |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `1029384756` | FCM Sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:102938...:web:...` | Web App ID |

> **Important:** These values are public client initialization properties. They do not contain secret server tokens or Admin SDK keys.

### 4.3 Trigger Deployment
1. Click **Deploy**.
2. Vercel will install dependencies, compile TypeScript, run the production Next.js build, and deploy the assets to its global Edge network.
3. Once finished, Vercel will generate your production URL (e.g., `https://ghostchat.vercel.app`).

### 4.4 Add Authorized Domain to Firebase Auth
1. Go back to [Firebase Console](https://console.firebase.google.com/) → **Authentication** → **Settings** → **Authorized domains**.
2. Click **Add domain**.
3. Enter your Vercel deployment domain (e.g. `ghostchat.vercel.app` or your custom domain).
4. Click **Save**.

---

## 5. Step 3: Pre-Flight Verification Checklist

Run through these checks after deployment to verify full system integrity:

- [ ] **HTTP Security Headers:**
  - Open browser DevTools Network tab, inspect response headers of the root document `/`.
  - Confirm `X-Frame-Options: DENY` is present.
  - Confirm `X-Content-Type-Options: nosniff` is present.
  - Confirm `Content-Security-Policy` contains `frame-ancestors 'none'`, `default-src 'self'`, and restricts `connect-src` to `*.firebaseio.com` and `*.googleapis.com`.
- [ ] **PWA & Service Worker:**
  - Confirm `/manifest.webmanifest` returns `HTTP 200` with MIME type `application/manifest+json`.
  - Check DevTools Application tab → **Service Workers**: verify `sw.js` is activated.
  - Inspect **Cache Storage**: verify only static assets (`/`, `manifest.webmanifest`, icons) are stored; confirm zero plaintexts or Firebase requests are cached.
- [ ] **Authentication & Device Identity:**
  - Sign in with an owner-provisioned email/password account.
  - Verify that a 64-character hex device identity fingerprint is created in IndexedDB (`ghostchat-device-identities`).
  - Confirm that private keys are marked `extractable: false`.
- [ ] **Invitation & Pairing:**
  - Create a new conversation invite. Note the 128-bit high-entropy invite code.
  - Sign in as the second provisioned account in another browser window or incognito session.
  - Enter the invite code; verify atomic pairing transition to `active`.
- [ ] **End-to-End Encryption & Messaging:**
  - Send a test message.
  - Inspect Firebase Console Realtime Database under `/messages/{conversationId}/{generation}/{messageId}`.
  - Verify that only opaque ciphertext strings (`ciphertext`, `senderCiphertext`, `iv`, `sequence`, `expiresAt`, `senderUid`, `ephemeralPublicKey`) exist. No plaintext is readable anywhere.
- [ ] **Delivery Receipts & Ephemeral State:**
  - When the recipient receives and decrypts the message, verify the sender sees the double checkmark (`checkCheck`).
  - Test typing indicators: start typing on Client A, verify "typing..." pulse on Client B; stop typing and observe 2.5s debounce cleanup.
- [ ] **Message Expiry & Sweep:**
  - Send a message with a short expiry (e.g., 5 min).
  - Confirm countdown timer is ticking.
  - Confirm client automatically removes the message when expired.
  - Confirm opportunistic batch sweep deletes the expired record from Firebase RTDB.
- [ ] **Mutual Destroy for Both:**
  - Click "Destroy for Both" from the action menu.
  - Confirm warning modal appears.
  - Confirm generation bump ($G \to G+1$).
  - Verify all transport ciphertexts under `/messages/{conversationId}/{gen}` are purged from Firebase RTDB.
  - Verify local memory decryption caches and session keys are scrubbed and composer is locked.

---

## 6. Zero-Cost Maintenance & Quota Monitoring

To stay comfortably within the ₹0 free tier indefinitely:

1. **Firebase Spark Quota Limits:**
   - **Simultaneous connections:** 100 max. Suitable for private invite-only groups.
   - **Storage:** 1 GB stored data. Because messages expire after 20 minutes and are swept by clients, actual storage usage remains well under 5 MB.
   - **Bandwidth:** 10 GB/month. Ephemeral envelopes are typically < 1 KB each.
2. **Client Sweeping Responsibility:**
   - In accordance with the ₹0 architecture rules, message deletion is performed opportunistically by active clients during session ticks.
   - If both users close their browsers, ciphertext remains dormant on RTDB until the next client connects and sweeps or until "Destroy for Both" is executed.
   - Database security rules permit either conversation participant to sweep any expired record (`data.child('expiresAt').val() <= now`).
3. **Provisioning New Users:**
   - Simply open Firebase Console → Authentication → Users → Add user.
   - GhostChat accounts do not incur per-user charges.

---

## 7. Production Release Summary

GhostChat is now fully verified and production-ready on Vercel and Firebase Spark Free Tier. All 14 engineering phases (Phases 0 through 13) are complete.
