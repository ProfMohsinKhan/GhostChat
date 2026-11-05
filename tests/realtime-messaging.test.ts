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
import type { DecryptionContext, EncryptedEnvelope } from "../src/features/crypto/types";

test("Phase 6: Realtime Encrypted Messaging & Transport Envelopes", async (t) => {
  const aliceUid = "test_alice_phase6";
  const bobUid = "test_bob_phase6";
  const eveUid = "test_eve_phase6";
  const conversationId = "conv_test_phase6_12345";
  const generation = 1;

  // Clean previous identities if any
  await deleteDeviceIdentity(aliceUid);
  await deleteDeviceIdentity(bobUid);
  await deleteDeviceIdentity(eveUid);

  const alice = await createNewDeviceIdentity(aliceUid);
  const bob = await createNewDeviceIdentity(bobUid);
  await createNewDeviceIdentity(eveUid);

  await t.test(
    "Dual-recipient envelope allows both receiver and sender to decrypt, but blocks third parties",
    async () => {
      const plaintext = "Secret ephemeral message between Alice and Bob";
      const sequence = 101;
      const expiresAt = Date.now() + 20 * 60 * 1000;

      // Alice encrypts for Bob, including her own agreement key
      const envelope = await secureEncrypt(
        aliceUid,
        bob.agreementPublicKey,
        plaintext,
        conversationId,
        generation,
        sequence,
        expiresAt,
        alice.agreementPublicKey
      );

      assert.ok(envelope.ciphertext.length > 0, "Recipient ciphertext must exist");
      assert.ok(envelope.senderCiphertext, "Sender ciphertext must exist");
      assert.notEqual(
        envelope.ciphertext,
        envelope.senderCiphertext,
        "Recipient and sender ciphertexts must be distinct"
      );

      const context: DecryptionContext = { conversationId, generation };

      // 1. Bob (recipient) decrypts successfully
      const bobDecrypted = await secureDecrypt(bobUid, envelope, context);
      assert.equal(bobDecrypted, plaintext, "Bob should decrypt Alice's message");

      // 2. Alice (sender on refresh/reload) decrypts successfully
      const aliceDecrypted = await secureDecrypt(aliceUid, envelope, context);
      assert.equal(aliceDecrypted, plaintext, "Alice should decrypt her own message copy");

      // 3. Eve (unauthorized eavesdropper) cannot decrypt
      await assert.rejects(
        async () => {
          await secureDecrypt(eveUid, envelope, context);
        },
        /operation failed|authentication|decrypt/i,
        "Eve must be rejected with an authentication failure"
      );
    }
  );

  await t.test(
    "Transport envelope rejects tampered senderUid, sequence, or generation via AEAD tag",
    async () => {
      const plaintext = "Tamper check message";
      const sequence = 102;
      const expiresAt = Date.now() + 20 * 60 * 1000;

      const envelope = await secureEncrypt(
        aliceUid,
        bob.agreementPublicKey,
        plaintext,
        conversationId,
        generation,
        sequence,
        expiresAt
      );

      const context: DecryptionContext = { conversationId, generation };

      // A. Tampering with senderUid
      const spoofedSenderEnvelope: EncryptedEnvelope = {
        ...envelope,
        senderUid: "spoofed_user",
      };
      await assert.rejects(
        async () => {
          await secureDecrypt(bobUid, spoofedSenderEnvelope, context);
        },
        /operation failed|authentication|decrypt/i,
        "Decryption must fail when senderUid is modified"
      );

      // B. Tampering with sequence counter
      const tamperedSequenceEnvelope: EncryptedEnvelope = {
        ...envelope,
        sequence: sequence + 1,
      };
      await assert.rejects(
        async () => {
          await secureDecrypt(bobUid, tamperedSequenceEnvelope, context);
        },
        /operation failed|authentication|decrypt/i,
        "Decryption must fail when sequence is modified"
      );

      // C. Replaying in a different generation
      const staleGenerationContext: DecryptionContext = {
        conversationId,
        generation: generation + 1,
      };
      await assert.rejects(
        async () => {
          await secureDecrypt(bobUid, envelope, staleGenerationContext);
        },
        /operation failed|authentication|decrypt/i,
        "Decryption must fail when generation is altered"
      );
    }
  );

  await t.test(
    "IV is unique per envelope even for identical plaintexts and parameters",
    async () => {
      const plaintext = "Same text across messages";
      const expiresAt = Date.now() + 20 * 60 * 1000;

      const env1 = await secureEncrypt(
        aliceUid,
        bob.agreementPublicKey,
        plaintext,
        conversationId,
        generation,
        1,
        expiresAt
      );
      const env2 = await secureEncrypt(
        aliceUid,
        bob.agreementPublicKey,
        plaintext,
        conversationId,
        generation,
        2,
        expiresAt
      );

      assert.notEqual(env1.iv, env2.iv, "IVs must be cryptographically distinct");
      assert.notEqual(
        env1.ciphertext,
        env2.ciphertext,
        "Ciphertexts must be completely distinct"
      );
      assert.notEqual(
        env1.ephemeralPublicKey,
        env2.ephemeralPublicKey,
        "Fresh ephemeral key pair must be generated per message"
      );
    }
  );

  await t.test("Payload boundary: envelopes under 64KB are handled cleanly", async () => {
    // Generate a 4KB test message
    const largePlaintext = "A".repeat(4096);
    const expiresAt = Date.now() + 20 * 60 * 1000;

    const env = await secureEncrypt(
      aliceUid,
      bob.agreementPublicKey,
      largePlaintext,
      conversationId,
      generation,
      200,
      expiresAt
    );

    const decrypted = await secureDecrypt(bobUid, env, {
      conversationId,
      generation,
    });
    assert.equal(decrypted.length, 4096, "Large plaintext should decrypt cleanly");
  });

  // Cleanup test identities
  await deleteDeviceIdentity(aliceUid);
  await deleteDeviceIdentity(bobUid);
  await deleteDeviceIdentity(eveUid);
});
