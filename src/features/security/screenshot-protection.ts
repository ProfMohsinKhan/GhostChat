"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * Options for screenshot and screen recording protection.
 */
export interface ScreenshotProtectionOptions {
  /** Whether anti-screenshot protection is active. Defaults to true. */
  enabled?: boolean;
  /** Callback fired whenever a screen capture or screenshot shortcut attempt is intercepted. */
  onAttempt?: (message: string) => void;
  /** Whether to blur/obscure the chat when window loses focus (e.g. Snipping Tool overlay). Defaults to true. */
  blurInactive?: boolean;
}

/**
 * Determines whether a keyboard event matches known OS-level screenshot or capture shortcuts.
 * Covers:
 * - PrintScreen / Snapshot key (Windows, Linux)
 * - Alt + PrintScreen (active window capture)
 * - Win/Cmd + Shift + S (Windows Snipping Tool / Edge capture)
 * - Cmd + Shift + 3 / 4 / 5 (macOS screenshot shortcuts)
 * - Ctrl/Cmd + P (Print / Save-to-PDF capture)
 * - Ctrl/Cmd + Shift + I / J / C (DevTools DOM inspection)
 * - F12 / Ctrl+U (Inspect source)
 */
export function isScreenshotKeyCombination(e: {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}): boolean {
  const key = e.key;
  const code = e.code || "";
  const isCtrl = Boolean(e.ctrlKey || e.metaKey);
  const isShift = Boolean(e.shiftKey);
  const isAlt = Boolean(e.altKey);

  // 1. Direct PrintScreen / Snapshot key
  if (key === "PrintScreen" || code === "PrintScreen" || key === "Snapshot") {
    return true;
  }

  // 2. Alt + PrintScreen (Active window screenshot on Windows)
  if (isAlt && (key === "PrintScreen" || code === "PrintScreen")) {
    return true;
  }

  // 3. Ctrl/Cmd + Shift + S (Windows Snipping Tool / Firefox / Edge web capture)
  if (isCtrl && isShift && (key === "s" || key === "S" || code === "KeyS")) {
    return true;
  }

  // 4. macOS screen capture shortcuts: Cmd + Shift + 3, 4, 5
  if (e.metaKey && isShift && ["3", "4", "5"].includes(key)) {
    return true;
  }

  // 5. Ctrl/Cmd + P (Print capture / PDF export)
  if (isCtrl && !isShift && (key === "p" || key === "P" || code === "KeyP")) {
    return true;
  }

  // 6. DevTools inspection shortcuts to view plaintexts
  if (key === "F12" || code === "F12") {
    return true;
  }

  if (isCtrl && isShift && ["i", "I", "j", "J", "c", "C"].includes(key)) {
    return true;
  }

  if (isCtrl && (key === "u" || key === "U" || code === "KeyU")) {
    return true;
  }

  return false;
}

/**
 * Attempts to clear and poison the system clipboard with a privacy warning notice.
 * Prevents copied screenshots from lingering in the system clipboard.
 */
export async function poisonClipboard(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(
      "⚠️ GhostChat Privacy Protection: Screenshots and screen captures are prohibited for ephemeral conversations."
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Hook to enforce client-side screenshot protection:
 * - Detects screenshot keys and intercepts them.
 * - Poisons the clipboard on PrintScreen.
 * - Obscures (blurs) sensitive chat contents when window loses focus (e.g., when Snipping Tool triggers).
 * - Disables printing via beforeprint listeners.
 */
export function useScreenshotProtection({
  enabled = true,
  onAttempt,
  blurInactive = true,
}: ScreenshotProtectionOptions = {}) {
  const [isScreenObscured, setIsScreenObscured] = useState(false);

  const handleInterceptAttempt = useCallback(
    (reason: string) => {
      setIsScreenObscured(true);
      void poisonClipboard();
      onAttempt?.(reason);

      // Auto-clear temporary obscure after 2 seconds if user is still focused
      if (typeof window !== "undefined" && document.hasFocus()) {
        window.setTimeout(() => {
          if (document.hasFocus()) {
            setIsScreenObscured(false);
          }
        }, 2200);
      }
    },
    [onAttempt]
  );

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      setIsScreenObscured(false);
      return;
    }

    // Keydown interceptor
    function onKeyDown(e: KeyboardEvent) {
      if (isScreenshotKeyCombination(e)) {
        e.preventDefault();
        e.stopPropagation();
        handleInterceptAttempt(
          "📸 Screenshot attempt blocked: Ephemeral privacy protection is active."
        );
      }
    }

    // Keyup interceptor (PrintScreen often registers on keyup in Chrome/Windows)
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "PrintScreen" || e.code === "PrintScreen") {
        e.preventDefault();
        e.stopPropagation();
        handleInterceptAttempt(
          "📸 Screenshot attempt blocked: Screen capture is prohibited for ephemeral messages."
        );
      }
    }

    // Focus & Blur interceptor:
    // When Snipping Tool (Win+Shift+S) or any overlay screen grabber starts,
    // the window immediately loses focus (blur). Obscuring immediately prevents Snipping Tool from capturing content.
    function onBlur() {
      if (blurInactive) {
        setIsScreenObscured(true);
      }
    }

    function onFocus() {
      // Smoothly restore view once window is re-focused
      setIsScreenObscured(false);
    }

    function onVisibilityChange() {
      if (document.hidden && blurInactive) {
        setIsScreenObscured(true);
      } else if (!document.hidden && document.hasFocus()) {
        setIsScreenObscured(false);
      }
    }

    // Print interceptor (Ctrl+P / File -> Print)
    function onBeforePrint() {
      setIsScreenObscured(true);
      handleInterceptAttempt(
        "🖨️ Printing blocked: Ephemeral messages cannot be exported or printed."
      );
    }

    function onAfterPrint() {
      setIsScreenObscured(false);
    }

    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", onAfterPrint);

    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
    };
  }, [enabled, blurInactive, handleInterceptAttempt]);

  return {
    isScreenObscured,
    setIsScreenObscured,
    clearClipboard: poisonClipboard,
  };
}
