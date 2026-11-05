"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  sendEncryptedMessage,
  subscribeToLiveMessages,
  sweepExpiredMessages,
  DEFAULT_MESSAGE_EXPIRY_MS,
  clearConversationDecryptedCache,
  burnViewOnceMessage,
} from "./messaging-service";
import type { LiveChatMessage } from "@/features/crypto/types";
import type { QuotedMessage } from "@/features/chat/types";

type UseLiveMessagesProps = {
  conversationId: string | null;
  generation?: number;
  currentUserUid: string;
  recipientUid?: string | null;
  recipientAgreementKey?: string | null;
  senderAgreementKey?: string | null;
  enabled?: boolean;
  isDestroyed?: boolean;
};

export function useLiveMessages({
  conversationId,
  generation = 1,
  currentUserUid,
  recipientAgreementKey,
  senderAgreementKey,
  enabled = true,
  isDestroyed = false,
}: UseLiveMessagesProps) {
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeConvRef = useRef<string | null>(conversationId);

  useEffect(() => {
    activeConvRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    if (!enabled || !conversationId || !currentUserUid || isDestroyed) {
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToLiveMessages({
      conversationId,
      generation,
      currentUserUid,
      onMessages: (msgs) => {
        // Only update if still on this conversation
        if (activeConvRef.current === conversationId) {
          setMessages(msgs);
          setLoading(false);
        }
      },
      onError: (err) => {
        if (activeConvRef.current === conversationId) {
          setError(err.message || "Failed to load encrypted messages.");
          setLoading(false);
        }
      },
    });

    return () => {
      unsubscribe();
    };
  }, [conversationId, generation, currentUserUid, enabled, isDestroyed]);

  // Active session expiration ticker:
  // Discards expired messages from local volatile memory and triggers opportunistic physical sweep
  useEffect(() => {
    if (!enabled || !conversationId || messages.length === 0) return;

    const intervalId = window.setInterval(() => {
      const now = Date.now();
      const active: LiveChatMessage[] = [];
      const expiredIds: string[] = [];
      let countdownChanged = false;

      for (const msg of messages) {
        if (msg.expiresAt && msg.expiresAt <= now) {
          expiredIds.push(msg.id);
        } else {
          const remainingMinutes = Math.max(
            1,
            Math.round((msg.expiresAt - now) / 60000)
          );
          const nextExpiresIn = `${remainingMinutes}m`;
          if (nextExpiresIn !== msg.expiresIn) {
            countdownChanged = true;
          }
          active.push({
            ...msg,
            expiresIn: nextExpiresIn,
          });
        }
      }

      if (expiredIds.length > 0) {
        setMessages(active);
        sweepExpiredMessages(conversationId, generation, expiredIds).catch(() => {});
      } else if (countdownChanged) {
        setMessages(active);
      }
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [enabled, conversationId, generation, messages]);

  const send = useCallback(
    async (
      text: string,
      expiryDurationMs = DEFAULT_MESSAGE_EXPIRY_MS,
      replyTo?: QuotedMessage,
      imageData?: string,
      viewOnce?: boolean
    ) => {
      if (isDestroyed) {
        throw new Error(
          "This conversation has been permanently destroyed for both users."
        );
      }
      if (!conversationId) {
        throw new Error("No active conversation selected.");
      }
      if (!recipientAgreementKey) {
        throw new Error(
          "Recipient's cryptographic key is not available yet. Both users must open the chat to complete key exchange."
        );
      }
      if (!senderAgreementKey) {
        throw new Error(
          "Device cryptographic key not loaded. Check device identity."
        );
      }

      await sendEncryptedMessage({
        conversationId,
        generation,
        senderUid: currentUserUid,
        recipientAgreementPublicKey: recipientAgreementKey,
        senderAgreementPublicKey: senderAgreementKey,
        plaintext: text,
        expiryDurationMs,
        replyTo,
        imageData,
        viewOnce,
      });
    },
    [
      conversationId,
      generation,
      currentUserUid,
      recipientAgreementKey,
      senderAgreementKey,
      isDestroyed,
    ]
  );

  const burn = useCallback(
    async (messageId: string) => {
      if (!conversationId) return;
      await burnViewOnceMessage({
        conversationId,
        generation,
        messageId,
      });
    },
    [conversationId, generation]
  );

  const clearVolatile = useCallback(() => {
    if (conversationId) {
      clearConversationDecryptedCache(conversationId);
    }
    setMessages([]);
  }, [conversationId]);

  return {
    messages,
    loading,
    error,
    sendMessage: send,
    burnMessage: burn,
    clearVolatileMessages: clearVolatile,
    isKeyReady: Boolean(recipientAgreementKey && senderAgreementKey),
  };
}
