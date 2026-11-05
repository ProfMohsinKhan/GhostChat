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
 * - Win/Cmd + Shift + S (Windows Snipping Tool / Edge capture / Firefox screenshot)
 * - Cmd + Shift + 3 / 4 / 5 / 6 (macOS screenshot shortcuts)
 * - Ctrl/Cmd + P (Print / Save-to-PDF capture)
 * - Ctrl/Cmd + S (Save webpage capture)
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
  if (
    key === "PrintScreen" ||
    code === "PrintScreen" ||
    key === "Snapshot" ||
    key === "MediaRecord"
  ) {
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

  // 4. Windows Snipping Tool (Win + Shift + S) - Meta/Win key passed directly
  if (e.metaKey && isShift && (key === "s" || key === "S" || code === "KeyS")) {
    return true;
  }

  // 5. macOS screen capture shortcuts: Cmd + Shift + 3, 4, 5, 6
  if (e.metaKey && isShift && ["3", "4", "5", "6"].includes(key)) {
    return true;
  }

  // 6. Ctrl/Cmd + P (Print capture / PDF export)
  if (isCtrl && (key === "p" || key === "P" || code === "KeyP")) {
    return true;
  }

  // 7. Ctrl/Cmd + S (Save webpage to disk)
  if (isCtrl && !isShift && (key === "s" || key === "S" || code === "KeyS")) {
    return true;
  }

  // 8. DevTools inspection shortcuts to view plaintexts
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
 * - Forces full synchronous DOM blackout (html.force-screenshot-blackout) instantly before screen capture can sample the window.
 * - Repeatedly poisons the clipboard to overwrite any OS-captured raster buffer.
 * - Immediately blanks out chat when the window loses focus (e.g. Snipping Tool overlay trigger).
 * - Blocks printing via beforeprint listeners.
 */
export function useScreenshotProtection({
  enabled = true,
  onAttempt,
  blurInactive = true,
}: ScreenshotProtectionOptions = {}) {
  const [isScreenObscured, setIsScreenObscured] = useState(false);

  const applyBlackout = useCallback((active: boolean) => {
    if (typeof document === "undefined") return;
    if (active) {
      document.documentElement.classList.add("force-screenshot-blackout");
      document.body?.classList.add("force-screenshot-blackout");
    } else {
      document.documentElement.classList.remove("force-screenshot-blackout");
      document.body?.classList.remove("force-screenshot-blackout");
    }
  }, []);

  const handleInterceptAttempt = useCallback(
    (reason: string) => {
      setIsScreenObscured(true);
      applyBlackout(true);
      void poisonClipboard();

      // Repeated burst to overwrite clipboard cache
      for (let delay = 50; delay <= 600; delay += 100) {
        window.setTimeout(() => void poisonClipboard(), delay);
      }

      onAttempt?.(reason);

      // Keep blackout active for 2.2 seconds before revealing
      if (typeof window !== "undefined") {
        window.setTimeout(() => {
          if (document.hasFocus()) {
            applyBlackout(false);
            setIsScreenObscured(false);
          }
        }, 2200);
      }
    },
    [onAttempt, applyBlackout]
  );

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      setIsScreenObscured(false);
      applyBlackout(false);
      return;
    }

    // Keydown interceptor (captures before OS handles)
    function onKeyDown(e: KeyboardEvent) {
      if (isScreenshotKeyCombination(e)) {
        e.preventDefault();
        e.stopPropagation();
        handleInterceptAttempt(
          "📸 Screenshot attempt blocked: Ephemeral privacy protection is enforced."
        );
      }
    }

    // Keyup interceptor (PrintScreen often registers on keyup on Windows)
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
    // When Snipping Tool (Win+Shift+S) or any external grabber begins, window blurs synchronously.
    // Immediately forcing blackout ensures Snipping Tool only captures solid black screen.
    function onBlur() {
      if (blurInactive) {
        setIsScreenObscured(true);
        applyBlackout(true);
        void poisonClipboard();
      }
    }

    function onFocus() {
      // Delay un-blackout to ensure capture tool cursor has detached
      window.setTimeout(() => {
        if (document.hasFocus()) {
          applyBlackout(false);
          setIsScreenObscured(false);
        }
      }, 150);
    }

    function onVisibilityChange() {
      if (document.hidden && blurInactive) {
        setIsScreenObscured(true);
        applyBlackout(true);
        void poisonClipboard();
      } else if (!document.hidden && document.hasFocus()) {
        window.setTimeout(() => {
          if (document.hasFocus()) {
            applyBlackout(false);
            setIsScreenObscured(false);
          }
        }, 150);
      }
    }

    // Print interceptor (Ctrl+P / Browser Print)
    function onBeforePrint() {
      setIsScreenObscured(true);
      applyBlackout(true);
      handleInterceptAttempt(
        "🖨️ Printing blocked: Ephemeral messages cannot be exported or printed."
      );
    }

    function onAfterPrint() {
      applyBlackout(false);
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
      applyBlackout(false);
    };
  }, [enabled, blurInactive, handleInterceptAttempt, applyBlackout]);

  return {
    isScreenObscured,
    setIsScreenObscured,
    triggerBlackout: handleInterceptAttempt,
    clearClipboard: poisonClipboard,
  };
}
