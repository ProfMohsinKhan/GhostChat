import type { SafetyNumberResult } from "./types";

const DOMAIN_KEY_FINGERPRINT = "GhostChat Key Fingerprint v1";
const DOMAIN_SAFETY_NUMBER = "GhostChat Safety Number v1";

/**
 * Derives a human-readable 64-character hex fingerprint (16 groups of 4)
 * from a raw agreement public key.
 */
export async function deriveKeyFingerprint(publicKey: string): Promise<string> {
  const canonical = [DOMAIN_KEY_FINGERPRINT, publicKey].join("\n");
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical))
  );
  const hex = Array.from(digest, (byte) =>
    byte.toString(16).padStart(2, "0")
  )
    .join("")
    .toUpperCase();
  return hex.match(/.{1,4}/g)?.join(" ") ?? hex;
}

/**
 * Computes a deterministic, commutative Safety Number for two conversation participants.
 * Regardless of who computes it (Alice or Bob), the output is mathematically identical.
 */
export async function computeSafetyNumber(
  keyA: string,
  keyB: string
): Promise<SafetyNumberResult> {
  // 1. Commutative sorting guarantees identical input order on both devices
  const sorted = [keyA, keyB].sort();
  const canonical = [DOMAIN_SAFETY_NUMBER, sorted[0], sorted[1]].join("\n");

  // 2. Compute cryptographic digest
  // We compute SHA-512 to extract high-entropy 60-digit numeric chunks + hex fingerprint
  // If SHA-512 is not supported in a particular Web Crypto environment, fallback to SHA-256
  let digest: Uint8Array;
  try {
    digest = new Uint8Array(
      await crypto.subtle.digest("SHA-512", new TextEncoder().encode(canonical))
    );
  } catch {
    digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical))
    );
  }

  // 3. Derive 12 groups of 5-digit numbers (60 decimal digits total)
  // Similar to Signal / WhatsApp safety number format
  const numericChunks: string[] = [];
  const view = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);

  for (let i = 0; i < 12; i++) {
    // Read 4 bytes big-endian for each chunk (modulo 100,000 gives 00000..99999)
    const offset = (i * 4) % (digest.byteLength - 4);
    const val = view.getUint32(offset, false);
    const chunk = (val % 100000).toString().padStart(5, "0");
    numericChunks.push(chunk);
  }
  const formattedSafetyNumber = numericChunks.join(" ");

  // 4. Derive 64-char Hex fingerprint (16 groups of 4)
  const hex32 = Array.from(digest.slice(0, 32), (byte) =>
    byte.toString(16).padStart(2, "0")
  )
    .join("")
    .toUpperCase();
  const formattedHexFingerprint =
    hex32.match(/.{1,4}/g)?.join(" ") ?? hex32;

  // 5. Build standardized verification URI
  const rawDigest = hex32;
  const qrPayload = `ghostchat:verify:v1?s=${numericChunks.join("")}&h=${hex32}`;

  return {
    safetyNumber: formattedSafetyNumber,
    hexFingerprint: formattedHexFingerprint,
    rawDigest,
    qrPayload,
  };
}

/**
 * Validates a user-entered safety number string or scanned QR payload
 * against the expected safety number result.
 */
export function verifySafetyInput(
  input: string,
  expected: SafetyNumberResult
): boolean {
  if (!input || !expected) return false;
  const trimmed = input.trim();

  // 1. Direct QR URI match
  if (trimmed === expected.qrPayload) return true;

  // 2. Normalized continuous numeric match (60 digits)
  const expectedNumeric = expected.safetyNumber.replace(/\s+/g, "");
  const inputNumeric = trimmed.replace(/\D+/g, "");
  if (inputNumeric.length === 60 && inputNumeric === expectedNumeric) {
    return true;
  }

  // 3. Normalized continuous hex match (64 hex characters)
  const expectedHex = expected.hexFingerprint.replace(/\s+/g, "").toUpperCase();
  const inputHex = trimmed.replace(/[^A-Fa-f0-9]/g, "").toUpperCase();
  if (inputHex.length === 64 && inputHex === expectedHex) {
    return true;
  }

  // 4. Check if scanned payload contains the numeric or hex string
  if (
    trimmed.includes(expectedNumeric) ||
    trimmed.toUpperCase().includes(expectedHex)
  ) {
    return true;
  }

  return false;
}
