export type ContactTab = "chats" | "rooms" | "requests";

export type MessageType = "text" | "attachment" | "system";

export type SampleMessage = {
  id: string;
  sender: "me" | "them" | "system";
  text: string;
  time: string;
  timestamp?: number;
  delivered?: boolean;
  expiresIn?: string;
  isDecrypted?: boolean;
  decryptionError?: boolean;
  attachment?: {
    name: string;
    size: string;
    type: "pdf" | "image";
  };
};

export type Contact = {
  id: string;
  name: string;
  initials: string;
  color: "coral" | "teal" | "lavender" | "sage" | "blue";
  avatarIcon?: "users";
  online: boolean;
  lastSeen?: string;
  preview: string;
  time: string;
  unreadCount?: number;
  expiryBadge?: "20m" | "10m" | "checkCheck" | "expired";
  isTyping?: boolean;
  tab: ContactTab;
  messages: SampleMessage[];
  verified?: boolean;
  fingerprint: string;
  safetyNumber?: string;
  peerAgreementKey?: string;
  isKeyChanged?: boolean;
  previousFingerprint?: string;
  linkedDevicesCount: number;
};
