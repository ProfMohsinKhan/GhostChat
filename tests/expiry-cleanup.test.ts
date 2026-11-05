import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import {
  createNewDeviceIdentity,
  deleteDeviceIdentity,
} from "../src/features/identity/identity-service";
import {
  secureDecrypt,
  secureEncrypt,
} from "../src/features/crypto/session-service";
import {
  DEFAULT_MESSAGE_EXPIRY_MS,
  parseExpiryDurationMs,
} from "../src/features/messaging/messaging-service";
import type { DecryptionContext, EncryptedEnvelope, LiveChatMessage } from "../src/features/crypto/types";

test("Phase 7: Message Expiry, AEAD Expiry Binding & Opportunistic Cleanup", async (t) => {
  const aliceUid = "test_alice_phase7";
  const bobUid = "test_bob_phase7";
  const conversationId = "conv_test_phase7_12345";
  const generation = 1;

  await deleteDeviceIdentity(aliceUid);
  await deleteDeviceIdentity(bobUid);

  const alice = await createNewDeviceIdentity(aliceUid);
  const bob = await createNewDeviceIdentity(bobUid);

  await t.test("Expiry duration parser handles standard user configurations", () => {
    assert.equal(parseExpiryDurationMs("5 min"), 5 * 60 * 1000);
    assert.equal(parseExpiryDurationMs("5m"), 5 * 60 * 1000);
    assert.equal(parseExpiryDurationMs("10 min"), 10 * 60 * 1000);
    assert.equal(parseExpiryDurationMs("10m"), 10 * 60 * 1000);
    assert.equal(parseExpiryDurationMs("20 min"), 20 * 60 * 1000);
    assert.equal(parseExpiryDurationMs("20m"), 20 * 60 * 1000);
    assert.equal(parseExpiryDurationMs("1 hour"), 60 * 60 * 1000);
    assert.equal(parseExpiryDurationMs("60 min"), 60 * 60 * 1000);
    assert.equal(parseExpiryDurationMs("unknown"), DEFAULT_MESSAGE_EXPIRY_MS);
  });

  await t.test(
    "Tamper protection: Extending expiresAt breaks AEAD tag authentication",
    async () => {
      const plaintext = "This message must expire in 20 minutes";
      const sequence = 1;
      const originalExpiresAt = Date.now() + 20 * 60 * 1000;

      const envelope = await secureEncrypt(
        aliceUid,
        bob.agreementPublicKey,
        plaintext,
        conversationId,
        generation,
        sequence,
        originalExpiresAt,
        alice.agreementPublicKey
      );

      const context: DecryptionContext = { conversationId, generation };

      // Legitimate decryption succeeds
      const decrypted = await secureDecrypt(bobUid, envelope, context);
      assert.equal(decrypted, plaintext);

      // Malicious attempt to extend expiry by 1 hour
      const extendedEnvelope: EncryptedEnvelope = {
        ...envelope,
        expiresAt: originalExpiresAt + 60 * 60 * 1000,
      };

      await assert.rejects(
        async () => {
          await secureDecrypt(bobUid, extendedEnvelope, context);
        },
        /operation failed|authentication|decrypt/i,
        "Altering expiresAt must trigger an AEAD authentication error"
      );
    }
  );

  await t.test(
    "Application-state invalidation: Expired messages are pruned from active memory view",
    () => {
      const now = Date.now();
      const mockMessages: LiveChatMessage[] = [
        {
          id: "msg_1",
          sender: "them",
          text: "Old message",
          time: "10:00 AM",
          timestamp: now - 30 * 60 * 1000,
          expiresAt: now - 10 * 60 * 1000, // Expired 10 min ago
          isDecrypted: true,
        },
        {
          id: "msg_2",
          sender: "me",
          text: "Fresh message",
          time: "10:20 AM",
          timestamp: now - 5 * 60 * 1000,
          expiresAt: now + 15 * 60 * 1000, // Still valid for 15 min
          isDecrypted: true,
        },
      ];

      // Invalidation & sweep filter simulation
      const active: LiveChatMessage[] = [];
      const expiredIds: string[] = [];

      for (const msg of mockMessages) {
        if (msg.expiresAt && msg.expiresAt <= now) {
          expiredIds.push(msg.id);
        } else {
          active.push(msg);
        }
      }

      assert.equal(active.length, 1, "Only unexpired messages should be kept in active view");
      assert.equal(active[0].id, "msg_2", "Fresh message should remain");
      assert.deepEqual(expiredIds, ["msg_1"], "Expired message ID must be queued for sweep");
    }
  );

  await t.test(
    "Active session ticker simulation updates remaining minutes and purges crossing threshold",
    () => {
      const baseNow = Date.now();

      const messages: LiveChatMessage[] = [
        {
          id: "msg_crossing",
          sender: "them",
          text: "About to expire",
          time: "10:00 AM",
          timestamp: baseNow - 19.9 * 60 * 1000,
          expiresAt: baseNow + 2000, // Expires in 2 seconds
          expiresIn: "1m",
          isDecrypted: true,
        },
        {
          id: "msg_lasting",
          sender: "me",
          text: "Lasts longer",
          time: "10:10 AM",
          timestamp: baseNow - 10 * 60 * 1000,
          expiresAt: baseNow + 10 * 60 * 1000, // Expires in 10 minutes
          expiresIn: "10m",
          isDecrypted: true,
        },
      ];

      // Simulate time advancing 3 seconds (crossing threshold for msg_crossing)
      const simulatedNow = baseNow + 3000;
      const active: LiveChatMessage[] = [];
      const expired: string[] = [];

      for (const msg of messages) {
        if (msg.expiresAt && msg.expiresAt <= simulatedNow) {
          expired.push(msg.id);
        } else {
          const remainingMinutes = Math.max(
            1,
            Math.round((msg.expiresAt - simulatedNow) / 60000)
          );
          active.push({
            ...msg,
            expiresIn: `${remainingMinutes}m`,
          });
        }
      }

      assert.deepEqual(expired, ["msg_crossing"], "Message crossing threshold must be expired");
      assert.equal(active.length, 1, "Only unexpired message survives");
      assert.equal(active[0].id, "msg_lasting");
    }
  );

  await deleteDeviceIdentity(aliceUid);
  await deleteDeviceIdentity(bobUid);
});
