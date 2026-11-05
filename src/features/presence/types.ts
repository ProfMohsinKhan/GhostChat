export type UserPresence = {
  status: "online" | "offline";
  lastSeen: number;
};

export type TypingStatus = {
  isTyping: boolean;
  timestamp?: number;
};
