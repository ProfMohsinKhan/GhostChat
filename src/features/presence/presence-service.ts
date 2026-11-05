import {
  onDisconnect,
  onValue,
  ref,
  serverTimestamp,
  set,
  type Unsubscribe,
} from "firebase/database";
import { getFirebaseClient } from "@/lib/firebase/client";
import type { UserPresence } from "./types";

/**
 * Initializes ephemeral presence for the authenticated user bound to .info/connected.
 * Automatically marks the user offline when disconnected or on unmount.
 */
export function setupUserPresence(
  conversationId: string,
  uid: string
): () => void {
  const { database } = getFirebaseClient();
  const connectedRef = ref(database, ".info/connected");
  const myPresenceRef = ref(database, `presence/${conversationId}/${uid}`);
  let disconnectRef: ReturnType<typeof onDisconnect> | null = null;

  const unsubscribe = onValue(connectedRef, (snap) => {
    if (snap.val() === true) {
      disconnectRef = onDisconnect(myPresenceRef);
      disconnectRef
        .set({
          status: "offline",
          lastSeen: serverTimestamp(),
        })
        .catch(() => {});

      set(myPresenceRef, {
        status: "online",
        lastSeen: serverTimestamp(),
      }).catch(() => {});
    }
  });

  return () => {
    unsubscribe();
    // Voluntarily mark offline upon leaving conversation
    set(myPresenceRef, {
      status: "offline",
      lastSeen: serverTimestamp(),
    }).catch(() => {});
    if (disconnectRef) {
      disconnectRef.cancel().catch(() => {});
    }
  };
}

/**
 * Subscribes to peer's ephemeral online/offline state and last-seen timestamp.
 */
export function subscribeToPeerPresence(
  conversationId: string,
  peerUid: string,
  onPresenceChange: (presence: UserPresence) => void
): Unsubscribe {
  const { database } = getFirebaseClient();
  const peerPresenceRef = ref(
    database,
    `presence/${conversationId}/${peerUid}`
  );

  return onValue(peerPresenceRef, (snapshot) => {
    const data = snapshot.val() as UserPresence | null;
    if (!data) {
      onPresenceChange({ status: "offline", lastSeen: 0 });
      return;
    }
    onPresenceChange(data);
  });
}

/**
 * Ephemeral typing indicator: publishes true with onDisconnect removal, reverts to false when idle.
 */
export async function setUserTyping(
  conversationId: string,
  uid: string,
  isTyping: boolean
): Promise<void> {
  const { database } = getFirebaseClient();
  const typingRef = ref(database, `typing/${conversationId}/${uid}`);
  if (isTyping) {
    await onDisconnect(typingRef).remove();
    await set(typingRef, true);
  } else {
    await set(typingRef, false);
  }
}

/**
 * Subscribes to peer's live typing status.
 */
export function subscribeToPeerTyping(
  conversationId: string,
  peerUid: string,
  onTypingChange: (isTyping: boolean) => void
): Unsubscribe {
  const { database } = getFirebaseClient();
  const peerTypingRef = ref(database, `typing/${conversationId}/${peerUid}`);

  return onValue(peerTypingRef, (snapshot) => {
    const val = snapshot.val();
    const isTyping = typeof val === "boolean" ? val : Boolean(val?.isTyping);
    onTypingChange(isTyping);
  });
}
