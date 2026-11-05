import type { QuotedMessage } from "@/features/chat/types";

export type EncryptedEnvelope = {
  ciphertext: string; // base64url encoded AES-256-GCM ciphertext + 128-bit tag for recipient
  senderCiphertext?: string; // base64url encoded AES-256-GCM ciphertext + 128-bit tag for sender
  iv: string; // base64url encoded 12-byte initialization vector
  sequence: number; // message sequence counter
  expiresAt: number; // expiry timestamp (ms since epoch)
  senderUid: string; // authenticated sender UID
  ephemeralPublicKey: string; // base64url encoded raw P-256 public key bytes
};

export type MessageMetadata = {
  conversationId: string;
  generation: number;
  sequence: number;
  expiresAt: number;
  senderUid: string;
};

export type DecryptionContext = {
  conversationId: string;
  generation: number;
};

export type TransportMessage = EncryptedEnvelope & {
  id: string;
  createdAt: number;
  delivered?: boolean;
};

export type LiveChatMessage = {
  id: string;
  sender: "me" | "them" | "system";
  text: string;
  time: string;
  timestamp: number;
  delivered?: boolean;
  expiresIn?: string;
  expiresAt: number;
  isDecrypted: boolean;
  decryptionError?: boolean;
  replyTo?: QuotedMessage;
  viewOnce?: boolean;
  isOpened?: boolean;
  imageData?: string;
};

