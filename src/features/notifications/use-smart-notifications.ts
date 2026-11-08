"use client";

import { useEffect, useState, useCallback, useRef } from "react";

export type NotificationPermissionState = "default" | "granted" | "denied";

export interface SmartNotificationOptions {
  title: string;
  body: string;
  tag?: string;
  icon?: string;
  onClick?: () => void;
  playTone?: boolean;
}

/**
 * Synthesizes a subtle, pleasant ephemeral audio notification chime using Web Audio API.
 * Zero external audio file assets required.
 */
function playEphemeralAudioChime() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    // Dual-tone harmonic chime (880Hz A5 -> 1318Hz E6)
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1318.5, now + 0.12);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.36);
    osc.onended = () => {
      ctx.close().catch(() => {});
    };
  } catch {
    // AudioContext blocked or not allowed prior to interaction
  }
}

/**
 * Phase 16: Smart Visibility-Aware Notification Engine
 *
 * Enforces strict notification suppression rules:
 * - When user is actively in the tab (visible & focused): NEVER fires desktop/mobile alerts.
 * - When user minimizes the browser, turns off screen, or switches tabs:
 *   Fires desktop/PWA notification + vibration + page title alert.
 * - Clicking notification auto-focuses the tab and clears badges.
 */
export function useSmartNotifications() {
  const [permission, setPermission] = useState<NotificationPermissionState>("default");
  const [isTabVisible, setIsTabVisible] = useState<boolean>(true);
  const [isWindowFocused, setIsWindowFocused] = useState<boolean>(true);
  const originalTitleRef = useRef<string>("GhostChat • Ephemeral & Confidential Messenger");
  const isTitleFlashingRef = useRef<boolean>(false);
  const unreadCountRef = useRef<number>(0);

  const clearUnreadBadge = useCallback(() => {
    unreadCountRef.current = 0;
    isTitleFlashingRef.current = false;
    if (typeof document !== "undefined") {
      document.title = originalTitleRef.current;
    }
  }, []);

  // Initialize permission and visibility listeners
  useEffect(() => {
    if (typeof window === "undefined") return;

    if ("Notification" in window) {
      setPermission(Notification.permission as NotificationPermissionState);
    }

    if (document.title && !document.title.startsWith("(")) {
      originalTitleRef.current = document.title;
    }

    function handleVisibilityChange() {
      const visible = document.visibilityState === "visible";
      setIsTabVisible(visible);
      if (visible && document.hasFocus()) {
        clearUnreadBadge();
      }
    }

    function handleFocus() {
      setIsWindowFocused(true);
      clearUnreadBadge();
    }

    function handleBlur() {
      setIsWindowFocused(false);
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    // Initial check
    setIsTabVisible(document.visibilityState === "visible");
    setIsWindowFocused(document.hasFocus());

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }, [clearUnreadBadge]);

  const requestPermission = useCallback(async (): Promise<NotificationPermissionState> => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "denied";
    }
    try {
      const res = await Notification.requestPermission();
      setPermission(res as NotificationPermissionState);
      return res as NotificationPermissionState;
    } catch {
      return "denied";
    }
  }, []);

  /**
   * Fires a notification ONLY if the window is currently minimized, screen-off, or unfocused.
   * If user is active in chat, returns false and does nothing.
   */
  const notifyIfBackground = useCallback(
    async (options: SmartNotificationOptions): Promise<boolean> => {
      if (typeof window === "undefined") return false;

      const isViewingChat =
        document.visibilityState === "visible" && document.hasFocus();

      // STRICT USER REQUIREMENT:
      // If user is actively in the chat window, DO NOT fire any notification.
      if (isViewingChat) {
        return false;
      }

      // Increment unread count and update tab title for background tabs
      unreadCountRef.current += 1;
      const count = unreadCountRef.current;
      document.title = `(${count}) New Message • GhostChat`;

      // Play subtle chime if requested (e.g. user minimized browser while working)
      if (options.playTone !== false) {
        playEphemeralAudioChime();
      }

      // Check Notification API permission
      if (!("Notification" in window) || Notification.permission !== "granted") {
        return true; // Updated title, but OS notification denied
      }

      const icon = options.icon || "/icons/icon-192.svg";
      const tag = options.tag || "ghostchat-message";

      // 1. Try Service Worker showNotification (Best for Android PWA / mobile screen-off)
      if ("serviceWorker" in navigator) {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg && reg.showNotification) {
            await reg.showNotification(options.title, {
              body: options.body,
              icon,
              badge: icon,
              tag,
              renotify: true,
              vibrate: [200, 100, 200] as unknown as number[],
              data: { url: "/" },
            } as NotificationOptions);
            return true;
          }
        } catch {
          // Fall through to desktop Notification constructor
        }
      }

      // 2. Desktop Notification fallback
      try {
        const notif = new Notification(options.title, {
          body: options.body,
          icon,
          tag,
        });

        notif.onclick = () => {
          window.focus();
          options.onClick?.();
          clearUnreadBadge();
          notif.close();
        };

        // Auto-close after 5 seconds
        setTimeout(() => {
          notif.close();
        }, 5000);

        return true;
      } catch {
        return false;
      }
    },
    [clearUnreadBadge]
  );

  return {
    permission,
    requestPermission,
    isTabVisible,
    isWindowFocused,
    notifyIfBackground,
    clearUnreadBadge,
  };
}
