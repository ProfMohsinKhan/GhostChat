import type { DecryptionContext, EncryptedEnvelope, MessageMetadata } from "./types";

const HKDF_SALT = new TextEncoder().encode("GhostChat-v1-HKDF-Salt");

/**
 * Computes Associated Authenticated Data (AAD) binding message ciphertext to
 * conversation ID, generation ID, sender UID, sequence counter, and expiration.
 */
export function computeAAD(metadata: MessageMetadata): Uint8Array {
  const aadString = [
    `conversationId=${metadata.conversationId}`,
    `generation=${metadata.generation}`,
    `senderUid=${metadata.senderUid}`,
    `sequence=${metadata.sequence}`,
    `expiresAt=${metadata.expiresAt}`,
  ].join("|");
  return new TextEncoder().encode(aadString);
}

/**
 * Derives an AES-256-GCM symmetric session key from an ECDH private key and a peer's
 * public key using HKDF-SHA256 (RFC 5869).
 */
export async function deriveSessionKey(
  localPrivateKey: CryptoKey,
  peerPublicRawBytes: Uint8Array,
  conversationId: string,
  generation: number
): Promise<CryptoKey> {
  // 1. Import peer's raw P-256 public key
  const peerPublicKey = await crypto.subtle.importKey(
    "raw",
    peerPublicRawBytes as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // 2. Perform ECDH to derive shared secret bits
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: peerPublicKey },
    localPrivateKey,
    256
  );

  // 3. Import shared bits as HKDF key material
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    sharedBits,
    "HKDF",
    false,
    ["deriveKey"]
  );

  // 4. Expand into an AES-256-GCM session key bound to conversation and generation
  const info = new TextEncoder().encode(
    `GhostChat-v1-Session-AES256GCM\n${conversationId}\n${generation}`
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: HKDF_SALT,
      info,
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts a plaintext string with AES-256-GCM using an ephemeral ECDH key pair
 * and binds the payload to metadata using Associated Authenticated Data (AAD).
 * Optionally computes senderCiphertext for the sender device using the same ephemeral key pair.
 */
export async function encryptMessage(
  plaintext: string,
  recipientAgreementPublicBytes: Uint8Array,
  metadata: MessageMetadata,
  senderAgreementPublicBytes?: Uint8Array
): Promise<EncryptedEnvelope> {
  // 1. Generate an ephemeral P-256 key pair for forward secrecy
  const ephemeralPair = (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  )) as CryptoKeyPair;

  // 2. Derive session key using ephemeral private key and recipient's public key
  const recipientSessionKey = await deriveSessionKey(
    ephemeralPair.privateKey,
    recipientAgreementPublicBytes,
    metadata.conversationId,
    metadata.generation
  );

  // 3. Generate unique 96-bit (12-byte) initialization vector (IV)
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // 4. Compute AAD
  const aad = computeAAD(metadata);

  // 5. Encrypt plaintext for recipient with AES-256-GCM
  const encodedPlaintext = new TextEncoder().encode(plaintext);
  const recipientCiphertextBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: aad as BufferSource,
      tagLength: 128,
    },
    recipientSessionKey,
    encodedPlaintext
  );

  // Optional: Encrypt plaintext for sender so sender can decrypt their own messages on page refresh
  let senderCiphertext: string | undefined;
  if (senderAgreementPublicBytes) {
    const senderSessionKey = await deriveSessionKey(
      ephemeralPair.privateKey,
      senderAgreementPublicBytes,
      metadata.conversationId,
      metadata.generation
    );
    const senderCiphertextBuffer = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: aad as BufferSource,
        tagLength: 128,
      },
      senderSessionKey,
      encodedPlaintext
    );
    senderCiphertext = base64UrlEncode(new Uint8Array(senderCiphertextBuffer));
  }

  // 6. Export ephemeral public key
  const ephemeralPublicBytes = new Uint8Array(
    await crypto.subtle.exportKey("raw", ephemeralPair.publicKey)
  );

  return {
    ciphertext: base64UrlEncode(new Uint8Array(recipientCiphertextBuffer)),
    senderCiphertext,
    iv: base64UrlEncode(iv),
    sequence: metadata.sequence,
    expiresAt: metadata.expiresAt,
    senderUid: metadata.senderUid,
    ephemeralPublicKey: base64UrlEncode(ephemeralPublicBytes),
  };
}

/**
 * Decrypts an EncryptedEnvelope using the recipient's private agreement key.
 * Verifies authenticity and throws if ciphertext or AAD has been tampered with.
 */
export async function decryptMessage(
  envelope: EncryptedEnvelope,
  recipientPrivateKey: CryptoKey,
  context: DecryptionContext
): Promise<string> {
  const ephemeralPublicBytes = base64UrlDecode(envelope.ephemeralPublicKey);

  // 1. Derive identical session key using recipient's private key and sender's ephemeral public key
  const sessionKey = await deriveSessionKey(
    recipientPrivateKey,
    ephemeralPublicBytes,
    context.conversationId,
    context.generation
  );

  // 2. Reconstruct AAD from envelope attributes and expected context
  const metadata: MessageMetadata = {
    conversationId: context.conversationId,
    generation: context.generation,
    senderUid: envelope.senderUid,
    sequence: envelope.sequence,
    expiresAt: envelope.expiresAt,
  };
  const aad = computeAAD(metadata);

  const iv = base64UrlDecode(envelope.iv);
  const ciphertext = base64UrlDecode(envelope.ciphertext);

  // 3. Decrypt and authenticate
  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv as BufferSource,
      additionalData: aad as BufferSource,
      tagLength: 128,
    },
    sessionKey,
    ciphertext as BufferSource
  );

  return new TextDecoder().decode(decryptedBuffer);
}

// Base64URL encoding/decoding utilities
export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
