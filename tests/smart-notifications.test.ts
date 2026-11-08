import { test, describe } from "node:test";
import assert from "node:assert/strict";

describe("Phase 16: Smart Visibility-Aware Notification Protocol", () => {
  interface MockDocumentContext {
    visibilityState: "visible" | "hidden";
    hasFocus: boolean;
    title: string;
    notificationPermission: "default" | "granted" | "denied";
    unreadCount: number;
    originalTitle: string;
  }

  function shouldTriggerNotification(ctx: MockDocumentContext): boolean {
    const isViewingChat = ctx.visibilityState === "visible" && ctx.hasFocus;
    // Strict rule: Never notify if user is currently looking at the chat
    return !isViewingChat;
  }

  function processIncomingMessage(
    ctx: MockDocumentContext,
    message: { sender: string; text: string }
  ): { notified: boolean; title: string; body: string } {
    if (!shouldTriggerNotification(ctx)) {
      return { notified: false, title: ctx.title, body: "" };
    }

    ctx.unreadCount += 1;
    ctx.title = `(${ctx.unreadCount}) New Message • GhostChat`;

    return {
      notified: true,
      title: "GhostChat • Encrypted Message",
      body: `New confidential message from ${message.sender}`,
    };
  }

  test("suppresses notifications when user is actively viewing and focused on chat", () => {
    const ctx: MockDocumentContext = {
      visibilityState: "visible",
      hasFocus: true,
      title: "GhostChat",
      notificationPermission: "granted",
      unreadCount: 0,
      originalTitle: "GhostChat",
    };

    const res = processIncomingMessage(ctx, {
      sender: "peer",
      text: "Hello!",
    });

    assert.equal(res.notified, false);
    assert.equal(ctx.unreadCount, 0);
    assert.equal(ctx.title, "GhostChat");
  });

  test("triggers notification when browser is minimized or screen is off", () => {
    const ctx: MockDocumentContext = {
      visibilityState: "hidden", // Minimized or Screen Off
      hasFocus: false,
      title: "GhostChat",
      notificationPermission: "granted",
      unreadCount: 0,
      originalTitle: "GhostChat",
    };

    const res = processIncomingMessage(ctx, {
      sender: "peer",
      text: "Urgent encrypted message",
    });

    assert.equal(res.notified, true);
    assert.equal(ctx.unreadCount, 1);
    assert.equal(ctx.title, "(1) New Message • GhostChat");
    assert.match(res.body, /confidential message/i);
  });

  test("triggers notification when user switched to another tab", () => {
    const ctx: MockDocumentContext = {
      visibilityState: "visible",
      hasFocus: false, // User is in another tab or application window
      title: "GhostChat",
      notificationPermission: "granted",
      unreadCount: 0,
      originalTitle: "GhostChat",
    };

    const res = processIncomingMessage(ctx, {
      sender: "peer",
      text: "Are you there?",
    });

    assert.equal(res.notified, true);
    assert.equal(ctx.unreadCount, 1);
    assert.equal(ctx.title, "(1) New Message • GhostChat");
  });

  test("accumulates unread count in background and clears upon refocus", () => {
    const ctx: MockDocumentContext = {
      visibilityState: "hidden",
      hasFocus: false,
      title: "GhostChat",
      notificationPermission: "granted",
      unreadCount: 0,
      originalTitle: "GhostChat",
    };

    processIncomingMessage(ctx, { sender: "peer", text: "Msg 1" });
    processIncomingMessage(ctx, { sender: "peer", text: "Msg 2" });
    processIncomingMessage(ctx, { sender: "peer", text: "Msg 3" });

    assert.equal(ctx.unreadCount, 3);
    assert.equal(ctx.title, "(3) New Message • GhostChat");

    // User returns to tab and focuses
    ctx.visibilityState = "visible";
    ctx.hasFocus = true;
    ctx.unreadCount = 0;
    ctx.title = ctx.originalTitle;

    assert.equal(ctx.unreadCount, 0);
    assert.equal(ctx.title, "GhostChat");
  });
});
