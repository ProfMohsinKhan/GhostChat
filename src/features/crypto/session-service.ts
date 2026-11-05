import { getStoredIdentity } from "@/features/identity/identity-service";
import {
  base64UrlDecode,
  base64UrlEncode,
  decryptMessage,
  encryptMessage,
} from "./crypto-engine";
import type { DecryptionContext, EncryptedEnvelope, MessageMetadata } from "./types";

/**
 * In-memory cache for ephemeral session derivation.
 * Cleared immediately when a conversation is destroyed or on logout.
 */
const sessionKeyCache = new Map<string, CryptoKey>();

export function getSessionCacheKey(conversationId: string, generation: number): string {
  return `${conversationId}:${generation}`;
}

export function clearSessionCache(): void {
  sessionKeyCache.clear();
}

export function clearConversationSession(conversationId: string): void {
  for (const key of sessionKeyCache.keys()) {
    if (key.startsWith(`${conversationId}:`)) {
      sessionKeyCache.delete(key);
    }
  }
}

/**
 * Prepares and encrypts a message envelope using the sender's local identity
 * and the recipient's public agreement key.
 * Optionally includes sender's public agreement key to produce a sender-decryptable copy.
 */
export async function secureEncrypt(
  senderUid: string,
  recipientAgreementPublicKeyBase64Url: string,
  plaintext: string,
  conversationId: string,
  generation: number,
  sequence: number,
  expiresAt: number,
  senderAgreementPublicKeyBase64Url?: string
): Promise<EncryptedEnvelope> {
  const recipientBytes = base64UrlDecode(recipientAgreementPublicKeyBase64Url);
  const senderBytes = senderAgreementPublicKeyBase64Url
    ? base64UrlDecode(senderAgreementPublicKeyBase64Url)
    : undefined;

  const metadata: MessageMetadata = {
    conversationId,
    generation,
    sequence,
    expiresAt,
    senderUid,
  };

  return encryptMessage(plaintext, recipientBytes, metadata, senderBytes);
}

/**
 * Decrypts an incoming message envelope using the current user's local private agreement key.
 * If the current user is the message sender and a sender-specific ciphertext is present,
 * decrypts that envelope.
 */
export async function secureDecrypt(
  currentUserUid: string,
  envelope: EncryptedEnvelope,
  context: DecryptionContext
): Promise<string> {
  const storedIdentity = await getStoredIdentity(currentUserUid);
  if (!storedIdentity) {
    throw new Error(
      `No local cryptographic identity found for user ${currentUserUid}. Initialize device identity first.`
    );
  }

  const targetCiphertext =
    currentUserUid === envelope.senderUid && envelope.senderCiphertext
      ? envelope.senderCiphertext
      : envelope.ciphertext;

  return decryptMessage(
    { ...envelope, ciphertext: targetCiphertext },
    storedIdentity.agreementPrivateKey,
    context
  );
}

/**
 * Returns the local user's public agreement key in base64url format for sharing with peers.
 */
export async function getLocalAgreementPublicKey(uid: string): Promise<string> {
  const identity = await getStoredIdentity(uid);
  if (!identity) {
    throw new Error(`Device identity not found for ${uid}.`);
  }
  return identity.agreementPublicKey;
}

export { base64UrlDecode, base64UrlEncode };
