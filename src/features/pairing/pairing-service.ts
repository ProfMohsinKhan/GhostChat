import {
  get,
  onValue,
  ref,
  serverTimestamp,
  update,
  type Unsubscribe,
} from "firebase/database";
import { getFirebaseClient } from "@/lib/firebase/client";

export const INVITE_LIFETIME_MS = 24 * 60 * 60 * 1000;
const INVITE_CODE_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export type PairingRecord = {
  ownerUid: string;
  state: "pending" | "active" | "destroyed";
  createdAt: number;
  expiresAt: number;
  acceptedBy?: string;
  generation?: number;
  ownerAgreementKey?: string;
  acceptedAgreementKey?: string;
  destroyedAt?: number;
  destroyedBy?: string;
};

export type PairingEntry = PairingRecord & { id: string };

export function normalizeInviteCode(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

export function isValidInviteCode(value: string): boolean {
  return INVITE_CODE_PATTERN.test(normalizeInviteCode(value));
}

export async function createPairing(
  ownerUid: string,
  ownerAgreementKey?: string
): Promise<string> {
  const { database } = getFirebaseClient();
  const code = createInviteCode();
  const convPayload: Record<string, unknown> = {
    ownerUid,
    state: "pending",
    createdAt: serverTimestamp(),
    expiresAt: Date.now() + INVITE_LIFETIME_MS - 60_000,
    generation: 1,
  };
  if (ownerAgreementKey) {
    convPayload.ownerAgreementKey = ownerAgreementKey;
  }

  const updates: Record<string, unknown> = {
    [`conversations/${code}`]: convPayload,
    [`userConversations/${ownerUid}/${code}`]: true,
  };

  await update(ref(database), updates);
  return code;
}

export async function acceptPairing(
  uid: string,
  rawCode: string,
  acceptedAgreementKey?: string
): Promise<void> {
  const code = normalizeInviteCode(rawCode);
  if (!isValidInviteCode(code)) throw new Error("Enter a valid 22-character invite code.");

  const { database } = getFirebaseClient();
  const conversationRef = ref(database, `conversations/${code}`);
  let snapshot;
  try {
    snapshot = await get(conversationRef);
  } catch {
    throw new Error("This invite is unavailable. Check the code or try again when online.");
  }
  const record = snapshot.val() as PairingRecord | null;

  if (!record || record.state !== "pending" || record.expiresAt <= Date.now()) {
    throw new Error("This invite is expired or has already been used.");
  }
  if (record.ownerUid === uid) throw new Error("You can’t accept your own invite.");

  // Both paths update atomically. Rules allow only the first pending → active transition.
  try {
    const updatedConv: Record<string, unknown> = {
      ...record,
      state: "active",
      acceptedBy: uid,
      generation: record.generation ?? 1,
    };
    if (acceptedAgreementKey) {
      updatedConv.acceptedAgreementKey = acceptedAgreementKey;
    }

    await update(ref(database), {
      [`conversations/${code}`]: updatedConv,
      [`userConversations/${uid}/${code}`]: true,
    });
  } catch {
    throw new Error("This invite expired or was already used. Ask for a new code.");
  }
}

export async function publishAgreementKey(
  conversationId: string,
  uid: string,
  agreementPublicKey: string
): Promise<void> {
  const { database } = getFirebaseClient();
  const conversationRef = ref(database, `conversations/${conversationId}`);
  let snapshot;
  try {
    snapshot = await get(conversationRef);
  } catch {
    return;
  }
  const record = snapshot.val() as PairingRecord | null;
  if (!record || record.state !== "active") return;

  if (record.ownerUid === uid && record.ownerAgreementKey !== agreementPublicKey) {
    await update(conversationRef, { ownerAgreementKey: agreementPublicKey });
  } else if (record.acceptedBy === uid && record.acceptedAgreementKey !== agreementPublicKey) {
    await update(conversationRef, { acceptedAgreementKey: agreementPublicKey });
  }
}

export function subscribeToUserConversations(
  uid: string,
  onChange: (records: PairingEntry[]) => void,
  onError: () => void,
): Unsubscribe {
  const { database } = getFirebaseClient();
  const indexRef = ref(database, `userConversations/${uid}`);
  const recordListeners = new Map<string, Unsubscribe>();
  const records = new Map<string, PairingEntry>();

  const unsubscribeIndex = onValue(
    indexRef,
    (snapshot) => {
      const ids = Object.keys(snapshot.val() ?? {});
      for (const [id, unsubscribe] of recordListeners) {
        if (!ids.includes(id)) {
          unsubscribe();
          recordListeners.delete(id);
          records.delete(id);
        }
      }

      if (ids.length === 0) onChange([]);
      for (const id of ids) {
        if (recordListeners.has(id)) continue;
        const unsubscribe = onValue(
          ref(database, `conversations/${id}`),
          (recordSnapshot) => {
            const value = recordSnapshot.val() as PairingRecord | null;
            if (!value || (value.ownerUid !== uid && value.acceptedBy !== uid)) {
              records.delete(id);
            } else {
              records.set(id, { ...value, id });
            }
            onChange([...records.values()].sort((a, b) => b.createdAt - a.createdAt));
          },
          onError,
        );
        recordListeners.set(id, unsubscribe);
      }
    },
    onError,
  );

  return () => {
    unsubscribeIndex();
    for (const unsubscribe of recordListeners.values()) unsubscribe();
    recordListeners.clear();
  };
}

function createInviteCode(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
