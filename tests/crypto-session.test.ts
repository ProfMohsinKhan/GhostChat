import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";

Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });

import {
  getOrCreateDeviceIdentity,
} from "../src/features/identity/identity-service";
import {
  base64UrlDecode,
  base64UrlEncode,
} from "../src/features/crypto/crypto-engine";
import {
  secureDecrypt,
  secureEncrypt,
  getLocalAgreementPublicKey,
} from "../src/features/crypto/session-service";

const databaseName = "ghostchat-device-identities";

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Identity database remained open."));
  });
});

describe("Phase 5: End-to-End Cryptographic Protocol & AEAD Session Engine", () => {
  it("successfully encrypts and decrypts between two distinct client identities", async () => {
    // 1. Initialize Alice and Bob identities
    await getOrCreateDeviceIdentity("alice");
    await getOrCreateDeviceIdentity("bob");

    const bobPublicKeyBase64 = await getLocalAgreementPublicKey("bob");
    assert.ok(bobPublicKeyBase64.length > 20);

    const plaintext = "Top secret message for GhostChat Phase 5.";
    const conversationId = "conv-alpha-77";
    const generation = 1;
    const sequence = 1;
    const expiresAt = Date.now() + 20 * 60 * 1000;

    // 2. Alice encrypts for Bob
    const envelope = await secureEncrypt(
      "alice",
      bobPublicKeyBase64,
      plaintext,
      conversationId,
      generation,
      sequence,
      expiresAt
    );

    // Verify envelope attributes
    assert.ok(envelope.ciphertext.length > 0);
    assert.ok(envelope.iv.length > 0);
    assert.ok(envelope.ephemeralPublicKey.length > 0);
    assert.equal(envelope.senderUid, "alice");
    assert.equal(envelope.sequence, 1);
    assert.equal(envelope.expiresAt, expiresAt);

    // 3. Bob decrypts
    const decrypted = await secureDecrypt("bob", envelope, {
      conversationId,
      generation,
    });

    assert.equal(decrypted, plaintext);
  });

  it("fails with authentication error when ciphertext is tampered with", async () => {
    await getOrCreateDeviceIdentity("alice");
    await getOrCreateDeviceIdentity("bob");

    const bobPublicKeyBase64 = await getLocalAgreementPublicKey("bob");
    const envelope = await secureEncrypt(
      "alice",
      bobPublicKeyBase64,
      "Integrity check text",
      "conv-tamper-1",
      1,
      1,
      Date.now() + 1000000
    );

    // Tamper with ciphertext by corrupting bytes
    const rawCiphertext = base64UrlDecode(envelope.ciphertext);
    rawCiphertext[0] ^= 0xff; // flip bits
    const corruptedEnvelope = {
      ...envelope,
      ciphertext: base64UrlEncode(rawCiphertext),
    };

    // Bob tries to decrypt corrupted envelope -> MUST throw
    await assert.rejects(
      async () => {
        await secureDecrypt("bob", corruptedEnvelope, {
          conversationId: "conv-tamper-1",
          generation: 1,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof Error);
        return true;
      }
    );
  });

  it("fails when Associated Authenticated Data (AAD) is altered (replay protection)", async () => {
    await getOrCreateDeviceIdentity("alice");
    await getOrCreateDeviceIdentity("bob");

    const bobPublicKeyBase64 = await getLocalAgreementPublicKey("bob");
    const envelope = await secureEncrypt(
      "alice",
      bobPublicKeyBase64,
      "Bound to generation and conversation",
      "conv-room-10",
      1,
      1,
      Date.now() + 1000000
    );

    // Attack 1: Replay in a different conversation ID
    await assert.rejects(async () => {
      await secureDecrypt("bob", envelope, {
        conversationId: "conv-room-99", // Different room!
        generation: 1,
      });
    });

    // Attack 2: Replay in a different conversation generation (Destroy-for-Both check)
    await assert.rejects(async () => {
      await secureDecrypt("bob", envelope, {
        conversationId: "conv-room-10",
        generation: 2, // Advanced generation!
      });
    });

    // Attack 3: Tampering with senderUid
    await assert.rejects(async () => {
      const spoofedEnvelope = { ...envelope, senderUid: "eve" };
      await secureDecrypt("bob", spoofedEnvelope, {
        conversationId: "conv-room-10",
        generation: 1,
      });
    });

    // Attack 4: Tampering with sequence counter
    await assert.rejects(async () => {
      const spoofedEnvelope = { ...envelope, sequence: 99 };
      await secureDecrypt("bob", spoofedEnvelope, {
        conversationId: "conv-room-10",
        generation: 1,
      });
    });

    // Attack 5: Tampering with expiry timestamp
    await assert.rejects(async () => {
      const spoofedEnvelope = { ...envelope, expiresAt: envelope.expiresAt + 50000 };
      await secureDecrypt("bob", spoofedEnvelope, {
        conversationId: "conv-room-10",
        generation: 1,
      });
    });
  });

  it("prevents third-party eavesdropping (wrong key rejection)", async () => {
    await getOrCreateDeviceIdentity("alice");
    await getOrCreateDeviceIdentity("bob");
    await getOrCreateDeviceIdentity("eve"); // Eavesdropper

    const bobPublicKeyBase64 = await getLocalAgreementPublicKey("bob");
    const envelope = await secureEncrypt(
      "alice",
      bobPublicKeyBase64,
      "Confidential payload for Bob only",
      "conv-eavesdrop",
      1,
      1,
      Date.now() + 1000000
    );

    // Eve attempts to decrypt with her own private key -> MUST throw
    await assert.rejects(async () => {
      await secureDecrypt("eve", envelope, {
        conversationId: "conv-eavesdrop",
        generation: 1,
      });
    });
  });

  it("produces unique initialization vectors (IVs) and ciphertexts for identical messages", async () => {
    await getOrCreateDeviceIdentity("alice");
    await getOrCreateDeviceIdentity("bob");

    const bobPublicKeyBase64 = await getLocalAgreementPublicKey("bob");
    const plaintext = "Identical string";

    const env1 = await secureEncrypt(
      "alice",
      bobPublicKeyBase64,
      plaintext,
      "conv-iv-test",
      1,
      1,
      Date.now() + 1000000
    );

    const env2 = await secureEncrypt(
      "alice",
      bobPublicKeyBase64,
      plaintext,
      "conv-iv-test",
      1,
      2,
      Date.now() + 1000000
    );

    // Nonces must be strictly distinct
    assert.notEqual(env1.iv, env2.iv);
    // Ciphertexts must be distinct due to distinct IVs and ephemeral keys
    assert.notEqual(env1.ciphertext, env2.ciphertext);
    assert.notEqual(env1.ephemeralPublicKey, env2.ephemeralPublicKey);
  });
});
