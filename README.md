# GhostChat

GhostChat is a privacy-first, invite-only messaging project. The current build includes **Phase 4: authenticated pairing and local device identity**. It creates and accepts one-time invite codes and stores a minimal two-account pairing record in Firebase. Each signed-in account also gets a device-local fingerprint and non-extractable private keys stored in IndexedDB. Message delivery, peer verification, and encryption are not implemented yet.

## Run locally

Requirements: Node.js 20.9+ and pnpm.

```sh
pnpm install
pnpm dev
```

The Firebase web app is registered and connected in the ignored `.env.local` file. Restart the development server after changing Firebase settings. Without configuration, the app displays setup guidance and does not attempt Firebase calls.

Pairings are stored in Firebase. This phase does not send or store message content.

The local identity can be viewed and removed from Privacy → Security identity. It remains only on this browser and is not shared with contacts or Firebase. Removing it cannot be undone; a replacement has a new fingerprint.

## Firebase setup

1. The existing project target is `ghostchat-c56c9`; `.firebaserc` selects it for Firebase CLI commands. Its Realtime Database is already created in `asia-southeast1`.
2. The `GhostChat` Web app is registered in Firebase Console, and its public Web config is stored locally in the ignored `.env.local` file. Use `.env.example` as the template if recreating the local config.
3. **Authentication → Email/Password** is already enabled. Accounts remain owner-provisioned through Firebase Console; a pairing code does not create an Auth account.
4. `database.rules.json` contains the Phase 3 scoped pairing rules; this ruleset is now deployed to the live Firebase project.

Pairing uses a cryptographically random 128-bit code, expires after 24 hours, and can be accepted once by an authenticated account other than its creator. The code is a short-lived bearer invitation; share it privately. It is not placed in a URL.

Run `pnpm test:rules` to test the pairing rules with the Realtime Database emulator. The emulator requires a Java runtime; this workspace does not currently have Java available.

Firebase Web config values are public client configuration, not server secrets. Do not put service account credentials or Admin SDK keys in any `NEXT_PUBLIC_` variable. The repository rules allow only the pairing paths; live Firebase access stays denied until the rules are deployed.

Auth state uses Firebase's browser session persistence: it survives reloads in the current tab and clears when that tab/window closes. The Firebase SDK manages this session; GhostChat does not write passwords or ID tokens to application local storage.

## Current phase

Phase 1 provides the responsive UI shell. Phase 2 adds Firebase initialization and authentication. Phase 3 adds invitation pairing and deployed scoped RTDB rules. Phase 4 adds local-only device identity management. The conversation area has no message delivery, peer verification, or encryption yet. See [phase reports](./PHASE_4_REPORT.md).

## Project documents

- [Architecture](./ARCHITECTURE.md)
- [Security notes](./SECURITY.md)
- [Threat model](./THREAT_MODEL.md)
- [Roadmap](./ROADMAP.md)

GhostChat does not currently provide secure messaging. Do not use it to share sensitive information.
