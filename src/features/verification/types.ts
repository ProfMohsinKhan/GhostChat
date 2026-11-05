export type StoredVerification = {
  userUid: string;
  peerUid: string;
  conversationId: string;
  verifiedFingerprint: string;
  verifiedSafetyNumber: string;
  verifiedAt: number;
};

export type SafetyNumberResult = {
  safetyNumber: string; // 60-digit formatted in 12 groups of 5
  hexFingerprint: string; // 64-char formatted in 16 groups of 4 hex chars
  rawDigest: string; // continuous hex string
  qrPayload: string; // standard verification URI
};

export type VerificationStatus = {
  isVerified: boolean;
  isKeyChanged: boolean;
  storedVerification?: StoredVerification;
  currentFingerprint?: string;
  currentSafetyNumber?: string;
};
