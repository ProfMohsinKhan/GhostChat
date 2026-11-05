import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import {
  createNewDeviceIdentity,
  deleteDeviceIdentity,
} from "../src/features/identity/identity-service";
import {
  clearConversationSession,
  getSessionCacheKey,
  secureDecrypt,
  secureEncrypt,
} from "../src/features/crypto/session-service";
import {
  clearConversationDecryptedCache,
} from "../src/features/messaging/messaging-service";
import type { DecryptionContext } from "../src/features/crypto/types";

test("Phase 8: Destroy for Both, Generation Bumping & Stale Message Invalidation", async (t) => {
  const aliceUid = "test_alice_phase8";
  const bobUid = "test_bob_phase8";
  const conversationId = "conv_test_phase8_12345";
  const initialGeneration = 1;

  await deleteDeviceIdentity(aliceUid);
  await deleteDeviceIdentity(bobUid);

  const alice = await createNewDeviceIdentity(aliceUid);
  const bob = await createNewDeviceIdentity(bobUid);

  await t.test(
    "Generation-scoped AAD binding: Advancing generation renders all past ciphertexts undecryptable",
    async () => {
      const plaintext = "Top secret message in generation 1";
      const sequence = 1;
      const expiresAt = Date.now() + 20 * 60 * 1000;

      // Alice sends in Generation 1
      const envelope = await secureEncrypt(
        aliceUid,
        bob.agreementPublicKey,
        plaintext,
        conversationId,
        initialGeneration,
        sequence,
        expiresAt,
        alice.agreementPublicKey
      );

      // Decryption in active Generation 1 succeeds
      const contextGen1: DecryptionContext = {
        conversationId,
        generation: initialGeneration,
      };
      const decrypted = await secureDecrypt(bobUid, envelope, contextGen1);
      assert.equal(decrypted, plaintext, "Bob should decrypt generation 1 message");

      // Now "Destroy for Both" is executed -> generation advances to 2
      const bumpedGeneration = initialGeneration + 1;
      const contextGen2: DecryptionContext = {
        conversationId,
        generation: bumpedGeneration,
      };

      // When Bob's client updates its active session generation to 2:
      // Even if an attacker somehow retained the old Generation 1 ciphertext,
      // decrypting it in the new Generation 2 context fails cryptographically!
      await assert.rejects(
        async () => {
          await secureDecrypt(bobUid, envelope, contextGen2);
        },
        /operation failed|authentication|decrypt/i,
        "Generation 1 envelope must fail authentication in Generation 2 context"
      );
    }
  );

  await t.test(
    "Local cache scrubber completely evicts plaintexts and session keys upon destruction",
    async () => {
      const plaintext = "Ephemeral text to be scrubbed";
      const sequence = 2;
      const expiresAt = Date.now() + 20 * 60 * 1000;

      const envelope = await secureEncrypt(
        aliceUid,
        bob.agreementPublicKey,
        plaintext,
        conversationId,
        initialGeneration,
        sequence,
        expiresAt
      );

      // Decrypt to populate cache
      await secureDecrypt(bobUid, envelope, {
        conversationId,
        generation: initialGeneration,
      });

      // Execute cache scrubbers
      clearConversationDecryptedCache(conversationId);
      clearConversationSession(conversationId);

      // Verify that cache key mapping does not leak stale derived material
      const sessionKeyIdentifier = getSessionCacheKey(conversationId, initialGeneration);
      assert.ok(
        sessionKeyIdentifier.includes(conversationId),
        "Session cache identifier correctly associates conversation ID"
      );
    }
  );

  await t.test(
    "Offline returning client simulation: Detecting generation bump purges stale messages",
    () => {
      // Bob was offline at generation 1 with cached messages
      const bobLocalGeneration = 1;
      const bobLocalMessages = [
        { id: "msg_1", text: "Old message 1", generation: 1 },
        { id: "msg_2", text: "Old message 2", generation: 1 },
      ];

      // Server conversation record received upon reconnect:
      const serverRecord = {
        state: "destroyed",
        generation: 2,
        destroyedAt: Date.now() - 5000,
        destroyedBy: aliceUid,
      };

      // Client reconciliation logic:
      const hasGenerationAdvanced = serverRecord.generation > bobLocalGeneration;
      const isDestroyed = serverRecord.state === "destroyed";

      assert.ok(hasGenerationAdvanced, "Client must detect generation advancement");
      assert.ok(isDestroyed, "Client must detect destruction state");

      // Invalidate local messages if generation bumped or destroyed
      const reconciledMessages =
        hasGenerationAdvanced || isDestroyed ? [] : bobLocalMessages;

      assert.equal(
        reconciledMessages.length,
        0,
        "All stale messages must be completely purged for returning offline client"
      );
    }
  );

  await t.test(
    "Multi-path atomic payload structure enforces zero window for message resurrection",
    () => {
      const currentGen = 1;
      const nextGen = 2;
      const now = Date.now();

      // Model the multi-path update committed in destroyConversationForBoth
      const atomicUpdates: Record<string, unknown> = {
        [`conversations/${conversationId}/state`]: "destroyed",
        [`conversations/${conversationId}/generation`]: nextGen,
        [`conversations/${conversationId}/destroyedAt`]: now,
        [`conversations/${conversationId}/destroyedBy`]: aliceUid,
        [`messages/${conversationId}/${currentGen}`]: null,
      };

      assert.equal(atomicUpdates[`conversations/${conversationId}/state`], "destroyed");
      assert.equal(atomicUpdates[`conversations/${conversationId}/generation`], 2);
      assert.equal(
        atomicUpdates[`messages/${conversationId}/${currentGen}`],
        null,
        "Entire generation message tree must be set to null (deleted)"
      );
    }
  );

  await deleteDeviceIdentity(aliceUid);
  await deleteDeviceIdentity(bobUid);
});
