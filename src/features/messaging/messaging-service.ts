import {
  onValue,
  ref,
  remove,
  serverTimestamp,
  update,
  type Unsubscribe,
} from "firebase/database";
import { getFirebaseClient } from "@/lib/firebase/client";
import {
  clearConversationSession,
  secureDecrypt,
  secureEncrypt,
} from "@/features/crypto/session-service";
import type {
  EncryptedEnvelope,
  LiveChatMessage,
  TransportMessage,
} from "@/features/crypto/types";
import type { QuotedMessage } from "@/features/chat/types";

export const DEFAULT_MESSAGE_EXPIRY_MS = 20 * 60 * 1000; // 20 minutes

/**
 * Parses user-facing timer strings ("5 min", "10 min", "20 min", "1 hour") into milliseconds.
 */
export function parseExpiryDurationMs(timerStr: string): number {
  const normalized = timerStr.toLowerCase().trim();
  if (normalized.includes("5")) return 5 * 60 * 1000;
  if (normalized.includes("10")) return 10 * 60 * 1000;
  if (normalized.includes("1 hour") || normalized.includes("60")) return 60 * 60 * 1000;
  return DEFAULT_MESSAGE_EXPIRY_MS;
}

/**
 * Volatile in-memory cache of decrypted plaintexts.
 * Plaintext is never written to IndexedDB, LocalStorage, or Firebase.
 */
const decryptedMessageCache = new Map<string, string>();

export function clearDecryptedMessageCache(): void {
  decryptedMessageCache.clear();
}

export function clearConversationDecryptedCache(conversationId: string): void {
  for (const key of decryptedMessageCache.keys()) {
    if (key.startsWith(`${conversationId}:`)) {
      decryptedMessageCache.delete(key);
    }
  }
}

/**
 * Encrypts a message using Web Crypto AEAD and writes the ciphertext envelope to RTDB.
 */
export async function sendEncryptedMessage({
  conversationId,
  generation,
  senderUid,
  recipientAgreementPublicKey,
  senderAgreementPublicKey,
  plaintext,
  expiryDurationMs = DEFAULT_MESSAGE_EXPIRY_MS,
  sequence,
  replyTo,
}: {
  conversationId: string;
  generation: number;
  senderUid: string;
  recipientAgreementPublicKey: string;
  senderAgreementPublicKey: string;
  plaintext: string;
  expiryDurationMs?: number;
  sequence?: number;
  replyTo?: QuotedMessage;
}): Promise<string> {
  const { database } = getFirebaseClient();
  const now = Date.now();
  const expiresAt = now + expiryDurationMs;
  const seq = sequence ?? Math.floor(now / 1000);

  const rawPayload = replyTo
    ? JSON.stringify({ text: plaintext, replyTo })
    : plaintext;

  const envelope = await secureEncrypt(
    senderUid,
    recipientAgreementPublicKey,
    rawPayload,
    conversationId,
    generation,
    seq,
    expiresAt,
    senderAgreementPublicKey
  );

  const messageId = `msg_${now}_${Math.random().toString(36).slice(2, 8)}`;
  const messagePath = `messages/${conversationId}/${generation}/${messageId}`;

  const messageRecord: Record<string, unknown> = {
    ciphertext: envelope.ciphertext,
    iv: envelope.iv,
    sequence: envelope.sequence,
    expiresAt: envelope.expiresAt,
    senderUid: envelope.senderUid,
    ephemeralPublicKey: envelope.ephemeralPublicKey,
    createdAt: serverTimestamp(),
    delivered: false,
  };

  if (envelope.senderCiphertext) {
    messageRecord.senderCiphertext = envelope.senderCiphertext;
  }

  // Pre-seed local decrypted cache for immediate zero-lag display
  const cacheKey = `${conversationId}:${generation}:${messageId}`;
  decryptedMessageCache.set(cacheKey, rawPayload);

  await update(ref(database), {
    [messagePath]: messageRecord,
  });

  return messageId;
}

/**
 * Subscribes in real time to encrypted transport messages for a conversation generation.
 * Decrypts payloads in memory and suppresses expired or invalid messages.
 */
export function subscribeToLiveMessages({
  conversationId,
  generation,
  currentUserUid,
  onMessages,
  onError,
}: {
  conversationId: string;
  generation: number;
  currentUserUid: string;
  onMessages: (messages: LiveChatMessage[]) => void;
  onError?: (error: Error) => void;
}): Unsubscribe {
  const { database } = getFirebaseClient();
  const messagesRef = ref(database, `messages/${conversationId}/${generation}`);

  return onValue(
    messagesRef,
    async (snapshot) => {
      const data = snapshot.val() as Record<string, TransportMessage> | null;
      if (!data) {
        onMessages([]);
        return;
      }

      const rawList = Object.entries(data).map(([id, val]) => ({
        ...val,
        id,
      }));

      // Sort chronologically by sequence or createdAt
      rawList.sort((a, b) => {
        const timeA = typeof a.createdAt === "number" ? a.createdAt : a.sequence;
        const timeB = typeof b.createdAt === "number" ? b.createdAt : b.sequence;
        return timeA - timeB;
      });

      const decryptedList: LiveChatMessage[] = [];
      const deliveryAckQueue: string[] = [];
      const expiredSweepQueue: string[] = [];
      const now = Date.now();

      for (const item of rawList) {
        // Drop expired messages from memory view and schedule opportunistic sweep
        if (item.expiresAt && item.expiresAt <= now) {
          expiredSweepQueue.push(item.id);
          continue;
        }

        const isMe = item.senderUid === currentUserUid;
        const cacheKey = `${conversationId}:${generation}:${item.id}`;
        let decryptedText: string;
        let isError = false;

        if (decryptedMessageCache.has(cacheKey)) {
          decryptedText = decryptedMessageCache.get(cacheKey)!;
        } else {
          try {
            const envelope: EncryptedEnvelope = {
              ciphertext: item.ciphertext,
              senderCiphertext: item.senderCiphertext,
              iv: item.iv,
              sequence: item.sequence,
              expiresAt: item.expiresAt,
              senderUid: item.senderUid,
              ephemeralPublicKey: item.ephemeralPublicKey,
            };

            decryptedText = await secureDecrypt(currentUserUid, envelope, {
              conversationId,
              generation,
            });
            decryptedMessageCache.set(cacheKey, decryptedText);
          } catch {
            decryptedText = "[Encrypted message could not be authenticated]";
            isError = true;
          }
        }

        const createdAtMs =
          typeof item.createdAt === "number" ? item.createdAt : Date.now();
        const dateObj = new Date(createdAtMs);
        const timeStr = dateObj.toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        });

        // Compute human-readable expiry string
        const remainingMinutes = Math.max(
          1,
          Math.round((item.expiresAt - now) / 60000)
        );
        const expiresInStr = `${remainingMinutes}m`;

        let displayText = decryptedText;
        let replyTo: QuotedMessage | undefined = undefined;

        if (decryptedText.startsWith("{") && decryptedText.includes('"text":')) {
          try {
            const parsed = JSON.parse(decryptedText) as {
              text?: string;
              replyTo?: QuotedMessage;
            };
            if (typeof parsed.text === "string") {
              displayText = parsed.text;
              replyTo = parsed.replyTo;
            }
          } catch {
            // fallback to raw text
          }
        }

        decryptedList.push({
          id: item.id,
          sender: isMe ? "me" : "them",
          text: displayText,
          replyTo,
          time: timeStr,
          timestamp: createdAtMs,
          delivered: Boolean(item.delivered),
          expiresIn: expiresInStr,
          expiresAt: item.expiresAt,
          isDecrypted: !isError,
          decryptionError: isError,
        });

        // If from peer and not yet delivered, queue delivery acknowledgment
        if (!isMe && !item.delivered) {
          deliveryAckQueue.push(item.id);
        }
      }

      onMessages(decryptedList);

      // Opportunistically acknowledge delivery for unacked peer messages
      if (deliveryAckQueue.length > 0) {
        for (const msgId of deliveryAckQueue) {
          markMessageDelivered(conversationId, generation, msgId).catch(() => {
            // Non-blocking best-effort acknowledgment
          });
        }
      }

      // Opportunistically sweep physically expired messages from RTDB
      if (expiredSweepQueue.length > 0) {
        sweepExpiredMessages(conversationId, generation, expiredSweepQueue).catch(() => {
          // Non-blocking best-effort cleanup
        });
      }
    },
    (err) => {
      onError?.(err);
    }
  );
}

/**
 * Sweeps expired message records from Firebase RTDB in an atomic multi-path update.
 * Also removes corresponding in-memory decrypted cache entries.
 */
export async function sweepExpiredMessages(
  conversationId: string,
  generation: number,
  messageIds: string[]
): Promise<number> {
  if (messageIds.length === 0) return 0;
  const { database } = getFirebaseClient();
  const updates: Record<string, null> = {};
  for (const id of messageIds) {
    updates[`messages/${conversationId}/${generation}/${id}`] = null;
    const cacheKey = `${conversationId}:${generation}:${id}`;
    decryptedMessageCache.delete(cacheKey);
  }
  await update(ref(database), updates);
  return messageIds.length;
}

/**
 * Marks a message as delivered in RTDB. Allowed by security rules only for the recipient.
 */
export async function markMessageDelivered(
  conversationId: string,
  generation: number,
  messageId: string
): Promise<void> {
  const { database } = getFirebaseClient();
  await update(ref(database), {
    [`messages/${conversationId}/${generation}/${messageId}/delivered`]: true,
  });
}

/**
 * Removes a message record from RTDB (for single-message deletion or cleanup).
 */
export async function removeTransportMessage(
  conversationId: string,
  generation: number,
  messageId: string
): Promise<void> {
  const { database } = getFirebaseClient();
  const msgRef = ref(
    database,
    `messages/${conversationId}/${generation}/${messageId}`
  );
  await remove(msgRef);
}

/**
 * Atomically destroys a conversation session for both users:
 * 1. Bumps generation: currentGeneration + 1
 * 2. Marks state: "destroyed" with destroyedAt and destroyedBy
 * 3. Physically wipes all transport message ciphertexts in the current generation branch
 * 4. Cleans all local volatile session keys and decrypted plaintexts
 */
export async function destroyConversationForBoth({
  conversationId,
  currentGeneration = 1,
  currentUserUid,
  permanentlyUnpair = false,
}: {
  conversationId: string;
  currentGeneration?: number;
  currentUserUid: string;
  permanentlyUnpair?: boolean;
}): Promise<void> {
  const { database } = getFirebaseClient();
  const nextGen = currentGeneration + 1;

  const updates: Record<string, unknown> = {
    [`conversations/${conversationId}/state`]: permanentlyUnpair ? "destroyed" : "active",
    [`conversations/${conversationId}/generation`]: nextGen,
    [`conversations/${conversationId}/destroyedAt`]: serverTimestamp(),
    [`conversations/${conversationId}/destroyedBy`]: currentUserUid,
    [`messages/${conversationId}/${currentGeneration}`]: null,
  };

  await update(ref(database), updates);

  // Clean local in-memory session caches
  clearConversationDecryptedCache(conversationId);
  clearConversationSession(conversationId);
}

/**
 * Re-activates a previously closed or destroyed conversation session, advancing generation.
 */
export async function reopenConversation({
  conversationId,
  currentGeneration = 1,
}: {
  conversationId: string;
  currentGeneration?: number;
}): Promise<void> {
  const { database } = getFirebaseClient();
  const nextGen = currentGeneration + 1;
  const updates: Record<string, unknown> = {
    [`conversations/${conversationId}/state`]: "active",
    [`conversations/${conversationId}/generation`]: nextGen,
  };
  await update(ref(database), updates);
}
