import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveKeyFingerprint,
  computeSafetyNumber,
  verifySafetyInput,
} from "../src/features/verification/verification-service";
import {
  saveStoredVerification,
  getStoredVerification,
  deleteStoredVerification,
  checkKeyChangeStatus,
} from "../src/features/verification/verification-storage";
import { generateQRMatrix } from "../src/features/verification/qr-matrix";

test("Phase 10: Device & Contact Verification, Safety Numbers, QR Codes and Key Change Alerts", async (t) => {
  const aliceKey = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEalice1234567890abcdefghijklmnopqrstuvwxyzABCDEF1";
  const bobKey = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEbob0987654321zyxwvutsrqponmlkjihgfedcbaFEDCBA2";
  const charlieKey = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEcharlie99999999999999999999999999999999999999993";

  await t.test(
    "Safety Number Commutativity: Alice and Bob compute the exact same 60-digit safety number and hex fingerprint",
    async () => {
      const aliceView = await computeSafetyNumber(aliceKey, bobKey);
      const bobView = await computeSafetyNumber(bobKey, aliceKey);

      assert.equal(
        aliceView.safetyNumber,
        bobView.safetyNumber,
        "Safety number must be strictly commutative and identical for both participants"
      );
      assert.equal(
        aliceView.hexFingerprint,
        bobView.hexFingerprint,
        "Hex fingerprint must be identical regardless of key order"
      );
      assert.equal(
        aliceView.rawDigest,
        bobView.rawDigest,
        "Raw digest must be identical"
      );

      // Verify format: 12 groups of 5 digits (total 60 digits + 11 spaces = 71 chars)
      assert.equal(aliceView.safetyNumber.length, 71);
      const chunks = aliceView.safetyNumber.split(" ");
      assert.equal(chunks.length, 12, "Must contain exactly 12 numeric chunks");
      for (const chunk of chunks) {
        assert.equal(chunk.length, 5, "Each chunk must be 5 digits");
        assert.match(chunk, /^\d{5}$/, "Each chunk must consist only of digits");
      }
    }
  );

  await t.test(
    "Distinct Key Sensitivity: Different key pairs generate completely distinct safety numbers",
    async () => {
      const aliceBob = await computeSafetyNumber(aliceKey, bobKey);
      const aliceCharlie = await computeSafetyNumber(aliceKey, charlieKey);

      assert.notEqual(
        aliceBob.safetyNumber,
        aliceCharlie.safetyNumber,
        "Safety numbers for distinct peers must be collision-resistant"
      );
      assert.notEqual(
        aliceBob.hexFingerprint,
        aliceCharlie.hexFingerprint,
        "Hex fingerprints must be distinct"
      );
    }
  );

  await t.test(
    "Key Fingerprint Derivation: Derives 64-char hex string grouped in 16 blocks of 4",
    async () => {
      const fp1 = await deriveKeyFingerprint(aliceKey);
      const fp2 = await deriveKeyFingerprint(bobKey);

      assert.equal(fp1.length, 79, "64 chars + 15 spaces = 79 chars");
      const blocks = fp1.split(" ");
      assert.equal(blocks.length, 16);
      for (const block of blocks) {
        assert.match(block, /^[A-F0-9]{4}$/);
      }
      assert.notEqual(fp1, fp2);
    }
  );

  await t.test(
    "QR Matrix Generation: Constructs valid, square matrix with standard finder patterns",
    () => {
      const payload = "ghostchat:verify:v1?s=12345678901234567890&h=AABBCCDDEEFF";
      const matrix = generateQRMatrix(payload);

      assert.ok(Array.isArray(matrix));
      assert.ok(matrix.length >= 21, "QR matrix must be at least version 1 (21x21)");
      assert.equal(matrix.length, matrix[0].length, "Matrix must be a square");

      // Check top-left finder pattern core (module at 3,3 should be dark)
      assert.equal(matrix[3][3], true, "Center of top-left finder must be dark");
      // Module at 0,0 should be dark (corner of finder)
      assert.equal(matrix[0][0], true, "Corner of top-left finder must be dark");
      // Module at 1,1 should be light (inner ring of finder)
      assert.equal(matrix[1][1], false, "Ring of top-left finder must be light");
    }
  );

  await t.test(
    "Safety Input & QR Payload Validation: Correct codes match, tampered codes reject",
    async () => {
      const safety = await computeSafetyNumber(aliceKey, bobKey);

      // 1. Direct formatted safety number
      assert.equal(verifySafetyInput(safety.safetyNumber, safety), true);

      // 2. Unspaced numeric digits (60 digits)
      const continuousDigits = safety.safetyNumber.replace(/\s+/g, "");
      assert.equal(verifySafetyInput(continuousDigits, safety), true);

      // 3. Hex fingerprint
      assert.equal(verifySafetyInput(safety.hexFingerprint, safety), true);

      // 4. Full QR URI
      assert.equal(verifySafetyInput(safety.qrPayload, safety), true);

      // 5. Tampered digit -> rejected
      const tamperedDigits = continuousDigits.slice(0, 59) + (continuousDigits[59] === "9" ? "0" : "9");
      assert.equal(verifySafetyInput(tamperedDigits, safety), false);

      // 6. Random text -> rejected
      assert.equal(verifySafetyInput("attacker_fake_code", safety), false);
    }
  );

  await t.test(
    "Key Change Detection & Storage: Alerts when peer key changes from previously verified key",
    async () => {
      const userUid = "test_user_alice";
      const peerUid = "test_user_bob";
      const convId = "conv_test_verification";

      // 1. Initial state: unverified
      const bobFp1 = await deriveKeyFingerprint(bobKey);
      const initialStatus = await checkKeyChangeStatus(userUid, peerUid, bobFp1);
      assert.equal(initialStatus.isVerified, false);
      assert.equal(initialStatus.isKeyChanged, false);

      // 2. Alice marks Bob as verified with Key 1
      const safety1 = await computeSafetyNumber(aliceKey, bobKey);
      await saveStoredVerification({
        userUid,
        peerUid,
        conversationId: convId,
        verifiedFingerprint: bobFp1,
        verifiedSafetyNumber: safety1.safetyNumber,
        verifiedAt: Date.now(),
      });

      // Verify status is now verified
      const stored = await getStoredVerification(userUid, peerUid);
      assert.equal(stored?.verifiedFingerprint, bobFp1);
      assert.equal(stored?.verifiedSafetyNumber, safety1.safetyNumber);

      const verifiedStatus = await checkKeyChangeStatus(userUid, peerUid, bobFp1);
      assert.equal(verifiedStatus.isVerified, true);
      assert.equal(verifiedStatus.isKeyChanged, false);

      // 3. Bob re-installs or changes his key to Key 2 (Charlie's key)
      const bobFp2 = await deriveKeyFingerprint(charlieKey);
      const keyChangedStatus = await checkKeyChangeStatus(userUid, peerUid, bobFp2);

      // CRITICAL ALERT: Status flips to isVerified: false, isKeyChanged: true!
      assert.equal(
        keyChangedStatus.isVerified,
        false,
        "Verification must be automatically revoked when key changes"
      );
      assert.equal(
        keyChangedStatus.isKeyChanged,
        true,
        "Must trigger key change alert when stored fingerprint differs from active key"
      );
      assert.equal(
        keyChangedStatus.storedVerification?.verifiedFingerprint,
        bobFp1,
        "Must preserve old fingerprint for comparison"
      );

      // 4. Alice re-verifies Bob with his new Key 2
      const safety2 = await computeSafetyNumber(aliceKey, charlieKey);
      await saveStoredVerification({
        userUid,
        peerUid,
        conversationId: convId,
        verifiedFingerprint: bobFp2,
        verifiedSafetyNumber: safety2.safetyNumber,
        verifiedAt: Date.now(),
      });

      const reVerifiedStatus = await checkKeyChangeStatus(userUid, peerUid, bobFp2);
      assert.equal(reVerifiedStatus.isVerified, true);
      assert.equal(reVerifiedStatus.isKeyChanged, false);

      // 5. Alice clears verification
      await deleteStoredVerification(userUid, peerUid);
      const clearedStatus = await checkKeyChangeStatus(userUid, peerUid, bobFp2);
      assert.equal(clearedStatus.isVerified, false);
      assert.equal(clearedStatus.isKeyChanged, false);
    }
  );
});
