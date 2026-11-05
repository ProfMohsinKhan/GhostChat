"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  setupUserPresence,
  subscribeToPeerPresence,
  subscribeToPeerTyping,
  setUserTyping,
} from "./presence-service";
import type { UserPresence } from "./types";

type UsePresenceProps = {
  conversationId: string | null;
  uid: string;
  peerUid?: string | null;
  enabled?: boolean;
};

export function usePresence({
  conversationId,
  uid,
  peerUid,
  enabled = true,
}: UsePresenceProps) {
  const [peerPresence, setPeerPresence] = useState<UserPresence>({
    status: "offline",
    lastSeen: 0,
  });
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const typingTimeoutRef = useRef<number | null>(null);

  // 1. Establish current user's ephemeral presence with onDisconnect
  useEffect(() => {
    if (!enabled || !conversationId || !uid) return;
    const cleanup = setupUserPresence(conversationId, uid);
    return () => {
      cleanup();
    };
  }, [enabled, conversationId, uid]);

  // 2. Subscribe to peer's presence
  useEffect(() => {
    if (!enabled || !conversationId || !peerUid) {
      setPeerPresence({ status: "offline", lastSeen: 0 });
      return;
    }

    const unsubscribe = subscribeToPeerPresence(
      conversationId,
      peerUid,
      (presence) => {
        setPeerPresence(presence);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [enabled, conversationId, peerUid]);

  // 3. Subscribe to peer's typing status
  useEffect(() => {
    if (!enabled || !conversationId || !peerUid) {
      setIsPeerTyping(false);
      return;
    }

    const unsubscribe = subscribeToPeerTyping(
      conversationId,
      peerUid,
      (typing) => {
        setIsPeerTyping(typing);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [enabled, conversationId, peerUid]);

  // 4. Dispatch typing pulse with 2.5s automatic idle debounce
  const handleSetTyping = useCallback(
    (typing: boolean) => {
      if (!conversationId || !uid || !enabled) return;

      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }

      if (typing) {
        setUserTyping(conversationId, uid, true).catch(() => {});
        typingTimeoutRef.current = window.setTimeout(() => {
          setUserTyping(conversationId, uid, false).catch(() => {});
          typingTimeoutRef.current = null;
        }, 2500);
      } else {
        setUserTyping(conversationId, uid, false).catch(() => {});
      }
    },
    [conversationId, uid, enabled]
  );

  // Clean typing timer on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  const formatLastSeen = (timestamp: number): string => {
    if (!timestamp) return "Offline";
    const date = new Date(timestamp);
    return `Last seen ${date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })}`;
  };

  return {
    isPeerOnline: peerPresence.status === "online",
    peerLastSeen:
      peerPresence.status === "online"
        ? "Online"
        : formatLastSeen(peerPresence.lastSeen),
    isPeerTyping,
    setTyping: handleSetTyping,
  };
}
