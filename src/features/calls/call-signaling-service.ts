import { getFirebaseClient } from "@/lib/firebase/client";
import { ref, set, update, remove, onValue, push } from "firebase/database";
import type { CallSignalData, IceCandidatePayload } from "./types";

/**
 * Publishes a new outgoing WebRTC call offer to Firebase RTDB.
 */
export async function publishCallOffer({
  conversationId,
  callerUid,
  offer,
}: {
  conversationId: string;
  callerUid: string;
  offer: { type: "offer"; sdp: string };
}): Promise<void> {
  const { database } = getFirebaseClient();
  const callRef = ref(database, `calls/${conversationId}`);
  const payload: CallSignalData = {
    callerUid,
    state: "calling",
    offer,
    startedAt: Date.now(),
  };
  await set(callRef, payload);
}

/**
 * Publishes an answer from the receiver to complete the WebRTC handshake.
 */
export async function publishCallAnswer({
  conversationId,
  answer,
}: {
  conversationId: string;
  answer: { type: "answer"; sdp: string };
}): Promise<void> {
  const { database } = getFirebaseClient();
  const callRef = ref(database, `calls/${conversationId}`);
  await update(callRef, {
    state: "connected",
    answer,
  });
}

/**
 * Appends an ICE Candidate for NAT traversal under the caller or receiver branch.
 */
export async function sendIceCandidate({
  conversationId,
  role,
  candidate,
}: {
  conversationId: string;
  role: "caller" | "receiver";
  candidate: IceCandidatePayload;
}): Promise<void> {
  const { database } = getFirebaseClient();
  const candidateBranch = role === "caller" ? "callerCandidates" : "receiverCandidates";
  const branchRef = ref(database, `calls/${conversationId}/${candidateBranch}`);
  const newCandidateRef = push(branchRef);
  await set(newCandidateRef, candidate);
}

/**
 * Declines an incoming call.
 */
export async function declineCallSignal({
  conversationId,
}: {
  conversationId: string;
}): Promise<void> {
  const { database } = getFirebaseClient();
  const callRef = ref(database, `calls/${conversationId}`);
  try {
    await update(callRef, {
      state: "declined",
      endedAt: Date.now(),
    });
    // Schedule atomic cleanup after 1.5s so peer sees "Call Declined"
    setTimeout(() => {
      remove(callRef).catch(() => {});
    }, 1500);
  } catch {
    // If already removed, ignore
  }
}

/**
 * Permanently wipes the call signaling node from Firebase RTDB (Zero-Trace Policy).
 */
export async function endCallSignal({
  conversationId,
}: {
  conversationId: string;
}): Promise<void> {
  const { database } = getFirebaseClient();
  const callRef = ref(database, `calls/${conversationId}`);
  try {
    await remove(callRef);
  } catch {
    // Ignore if already deleted
  }
}

/**
 * Subscribes to realtime call signaling updates for an active conversation.
 */
export function subscribeToCallSignal({
  conversationId,
  onSignal,
}: {
  conversationId: string;
  onSignal: (signal: CallSignalData | null) => void;
}): () => void {
  const { database } = getFirebaseClient();
  const callRef = ref(database, `calls/${conversationId}`);

  return onValue(
    callRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onSignal(null);
        return;
      }
      onSignal(snapshot.val() as CallSignalData);
    },
    () => {
      onSignal(null);
    }
  );
}
