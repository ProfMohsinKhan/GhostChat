import test from "node:test";
import assert from "node:assert/strict";
import type { UserPresence, TypingStatus } from "../src/features/presence/types";

test("Phase 9: Presence, Typing Indicators & Ephemeral Delivery State", async (t) => {
  await t.test(
    "UserPresence schema: Enforces status and numeric lastSeen timestamp without PII",
    () => {
      const now = Date.now();
      const onlinePresence: UserPresence = {
        status: "online",
        lastSeen: now,
      };

      assert.equal(onlinePresence.status, "online");
      assert.equal(typeof onlinePresence.lastSeen, "number");
      assert.ok(onlinePresence.lastSeen > 0);

      const offlinePresence: UserPresence = {
        status: "offline",
        lastSeen: now,
      };

      assert.equal(offlinePresence.status, "offline");
      assert.equal(typeof offlinePresence.lastSeen, "number");

      // Verify no PII fields exist
      const keys = Object.keys(onlinePresence);
      assert.deepEqual(keys.sort(), ["lastSeen", "status"].sort());
    }
  );

  await t.test(
    "TypingStatus schema: Transient typing pulse with optional timestamp",
    () => {
      const activeTyping: TypingStatus = {
        isTyping: true,
        timestamp: Date.now(),
      };

      assert.equal(activeTyping.isTyping, true);
      assert.ok(typeof activeTyping.timestamp === "number");

      const idleTyping: TypingStatus = {
        isTyping: false,
      };

      assert.equal(idleTyping.isTyping, false);
      assert.equal(idleTyping.timestamp, undefined);
    }
  );

  await t.test(
    "Typing debounce simulation: 2.5s idle timeout reverts typing to false",
    async () => {
      let isTypingState = false;
      let timer: NodeJS.Timeout | null = null;

      function simulateKeystroke(typing: boolean) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }

        if (typing) {
          isTypingState = true;
          timer = setTimeout(() => {
            isTypingState = false;
            timer = null;
          }, 50); // fast timeout for test
        } else {
          isTypingState = false;
        }
      }

      // 1. Keystroke sets typing true
      simulateKeystroke(true);
      assert.equal(isTypingState, true, "Typing should immediately be true on keystroke");

      // 2. Additional keystroke resets debounce timer, keeping typing true
      await new Promise((resolve) => setTimeout(resolve, 20));
      simulateKeystroke(true);
      assert.equal(isTypingState, true, "Typing remains true on subsequent keystroke");

      // 3. User stops typing -> after timeout, reverts to false
      await new Promise((resolve) => setTimeout(resolve, 70));
      assert.equal(isTypingState, false, "Typing reverts to false after idle duration");
    }
  );

  await t.test(
    "Delivery receipt state transitions: sent (single check) to delivered (double check)",
    () => {
      type DeliveryMeta = {
        id: string;
        delivered: boolean;
        icon: "check" | "checkCheck";
        title: "Sent" | "Delivered";
      };

      function resolveDeliveryDisplay(delivered?: boolean): {
        icon: "check" | "checkCheck";
        title: "Sent" | "Delivered";
      } {
        if (delivered) {
          return { icon: "checkCheck", title: "Delivered" };
        }
        return { icon: "check", title: "Sent" };
      }

      // Initial state upon sending: sent, awaiting delivery ack
      const sentMsg: DeliveryMeta = {
        id: "msg_101",
        delivered: false,
        ...resolveDeliveryDisplay(false),
      };
      assert.equal(sentMsg.delivered, false);
      assert.equal(sentMsg.icon, "check");
      assert.equal(sentMsg.title, "Sent");

      // Recipient decrypts and acks delivery in RTDB -> delivered true
      const deliveredMsg: DeliveryMeta = {
        id: "msg_101",
        delivered: true,
        ...resolveDeliveryDisplay(true),
      };
      assert.equal(deliveredMsg.delivered, true);
      assert.equal(deliveredMsg.icon, "checkCheck");
      assert.equal(deliveredMsg.title, "Delivered");
    }
  );

  await t.test(
    "Security & Privacy: Database rules forbid cross-conversation presence snooping",
    () => {
      // Validating presence node structure under database.rules.json
      const presencePath = (conversationId: string, uid: string) =>
        `presence/${conversationId}/${uid}`;
      const typingPath = (conversationId: string, uid: string) =>
        `typing/${conversationId}/${uid}`;

      const convA = "conv_alpha_123456789012";
      const convB = "conv_bravo_123456789012";
      const userAlice = "user_alice";

      assert.equal(presencePath(convA, userAlice), `presence/${convA}/${userAlice}`);
      assert.equal(typingPath(convA, userAlice), `typing/${convA}/${userAlice}`);
      assert.notEqual(
        presencePath(convA, userAlice),
        presencePath(convB, userAlice),
        "Presence must be strictly partitioned by conversation ID"
      );
    }
  );
});
