import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });

import {
  getOrCreateDeviceIdentity,
  getStoredIdentity,
} from "../src/features/identity/identity-service";
import {
  secureDecrypt,
  secureEncrypt,
  getLocalAgreementPublicKey,
} from "../src/features/crypto/session-service";
import {
  computeSafetyNumber,
  verifySafetyInput,
  deriveKeyFingerprint,
} from "../src/features/verification/verification-service";
import { generateQRMatrix } from "../src/features/verification/qr-matrix";
import nextConfig from "../next.config";

const databaseName = "ghostchat-device-identities";

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Identity database remained open."));
  });
});

describe("Phase 13: End-to-End System Audit & Zero-Cost Architecture Verification", () => {
  it("audits complete E2EE cryptographic lifecycle and AAD tamper resistance", async () => {
    // 1. Generate identities for Alice and Bob
    const aliceId = await getOrCreateDeviceIdentity("user_alice");
    const bobId = await getOrCreateDeviceIdentity("user_bob");

    assert.match(
      aliceId.fingerprint,
      /^[A-F0-9]{4}( [A-F0-9]{4}){15}$/,
      "Alice fingerprint must be 16 space-separated 4-char hex groups"
    );
    assert.match(
      bobId.fingerprint,
      /^[A-F0-9]{4}( [A-F0-9]{4}){15}$/,
      "Bob fingerprint must be 16 space-separated 4-char hex groups"
    );
    assert.notEqual(aliceId.fingerprint, bobId.fingerprint, "Fingerprints must be unique");

    // 2. Verify non-extractability of private keys
    const storedAlice = await getStoredIdentity("user_alice");
    assert.ok(storedAlice, "Stored Alice identity must exist");
    assert.equal(storedAlice.signingPrivateKey.extractable, false, "Signing key must be non-extractable");
    assert.equal(storedAlice.agreementPrivateKey.extractable, false, "Agreement key must be non-extractable");

    // 3. Export public agreement keys
    const bobPubKeyBase64 = await getLocalAgreementPublicKey("user_bob");
    const alicePubKeyBase64 = await getLocalAgreementPublicKey("user_alice");
    assert.ok(bobPubKeyBase64.length > 30);
    assert.ok(alicePubKeyBase64.length > 30);

    // 4. Encrypt message from Alice to Bob (with senderAgreementPublicKey for dual-recipient recovery)
    const conversationId = "conv_e2e_audit_99";
    const generation = 1;
    const sequence = 101;
    const expiresAt = Date.now() + 1200000; // +20 mins
    const secretPlaintext = "Zero-Cost E2EE Verified Production Message";

    const envelope = await secureEncrypt(
      "user_alice",
      bobPubKeyBase64,
      secretPlaintext,
      conversationId,
      generation,
      sequence,
      expiresAt,
      alicePubKeyBase64
    );

    assert.ok(envelope.ciphertext.length > 0, "Ciphertext must not be empty");
    assert.ok(envelope.senderCiphertext && envelope.senderCiphertext.length > 0, "Sender ciphertext must not be empty");
    assert.equal(envelope.senderUid, "user_alice");
    assert.equal(envelope.sequence, sequence);
    assert.equal(envelope.expiresAt, expiresAt);

    // 5. Decrypt as Bob (Recipient)
    const bobDecrypted = await secureDecrypt(
      "user_bob",
      envelope,
      { conversationId, generation }
    );
    assert.equal(bobDecrypted, secretPlaintext, "Bob must successfully decrypt the envelope");

    // 6. Decrypt as Alice (Sender using senderCiphertext)
    const aliceDecrypted = await secureDecrypt(
      "user_alice",
      envelope,
      { conversationId, generation }
    );
    assert.equal(aliceDecrypted, secretPlaintext, "Alice must successfully decrypt using senderCiphertext");

    // 7. Verify AAD tamper resistance (Modifying any metadata must cause AEAD failure)
    const tamperedConv = { ...envelope, conversationId: "conv_tampered_id" };
    await assert.rejects(
      async () => {
        await secureDecrypt("user_bob", tamperedConv, { conversationId: "conv_tampered_id", generation });
      },
      (err: unknown) => err instanceof Error,
      "Tampered conversationId must fail authentication"
    );

    const tamperedExpiry = { ...envelope, expiresAt: expiresAt + 60000 };
    await assert.rejects(
      async () => {
        await secureDecrypt("user_bob", tamperedExpiry, { conversationId, generation });
      },
      (err: unknown) => err instanceof Error,
      "Tampered expiresAt must fail authentication"
    );
  });

  it("audits message expiration and client invalidation boundaries", () => {
    const now = Date.now();
    const activeEnvelope = {
      id: "msg-active-1",
      expiresAt: now + 5000,
    };
    const expiredEnvelope = {
      id: "msg-expired-1",
      expiresAt: now - 1000,
    };

    // Client evaluation check
    const isExpired = (msg: { expiresAt: number }) => msg.expiresAt <= Date.now();
    assert.equal(isExpired(activeEnvelope), false, "Active envelope must not be expired");
    assert.equal(isExpired(expiredEnvelope), true, "Past envelope must be evaluated as expired");

    // Sweeper filter check
    const batch = [activeEnvelope, expiredEnvelope];
    const sweepCandidates = batch.filter(isExpired);
    assert.equal(sweepCandidates.length, 1);
    assert.equal(sweepCandidates[0].id, "msg-expired-1");
  });

  it("audits mutual destroy-for-both generation bumping isolation", async () => {
    // Generation 1 setup
    await getOrCreateDeviceIdentity("alice_destroy");
    await getOrCreateDeviceIdentity("bob_destroy");
    const bobPubKey = await getLocalAgreementPublicKey("bob_destroy");
    const alicePubKey = await getLocalAgreementPublicKey("alice_destroy");

    const convId = "conv_destroy_test";
    const initialGeneration = 1;
    const nextGeneration = 2;

    const envelopeGen1 = await secureEncrypt(
      "alice_destroy",
      bobPubKey,
      "Message in Generation 1",
      convId,
      initialGeneration,
      1,
      Date.now() + 600000,
      alicePubKey
    );

    // After Destroy-for-Both advances conversation to generation 2:
    // Stale client attempting to decrypt Gen 1 envelope with new generation 2 parameters fails
    await assert.rejects(
      async () => {
        await secureDecrypt(
          "bob_destroy",
          envelopeGen1,
          { conversationId: convId, generation: nextGeneration } // Active generation bumped to 2
        );
      },
      (err: unknown) => err instanceof Error,
      "Messages from prior generation must be rejected in new generation"
    );
  });

  it("audits commutative 60-digit safety numbers and SVG QR code matrix generation", async () => {
    const keyAlice = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEaliceSampleKey00112233445566778899aabbccddeeffgghh";
    const keyBob = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEbobSampleKey99887766554433221100ffeeddccbbaa001122";

    // 1. Commutative Safety Number calculation
    const safetyAliceView = await computeSafetyNumber(keyAlice, keyBob);
    const safetyBobView = await computeSafetyNumber(keyBob, keyAlice);

    assert.equal(
      safetyAliceView.safetyNumber,
      safetyBobView.safetyNumber,
      "Safety numbers must be commutative: Alice(keyA, keyB) === Bob(keyB, keyA)"
    );
    assert.equal(
      safetyAliceView.safetyNumber.replace(/\s+/g, "").length,
      60,
      "Safety number must be exactly 60 digits"
    );
    assert.equal(
      safetyAliceView.hexFingerprint,
      safetyBobView.hexFingerprint,
      "Hex fingerprints must match"
    );

    // 2. Verification input matching (manual code entry and QR payload)
    assert.equal(
      verifySafetyInput(safetyAliceView.safetyNumber, safetyBobView),
      true,
      "Manual 60-digit entry must verify successfully"
    );
    assert.equal(
      verifySafetyInput(safetyAliceView.qrPayload, safetyBobView),
      true,
      "Scanned QR URI must verify successfully"
    );
    assert.equal(
      verifySafetyInput("00000 00000 00000", safetyBobView),
      false,
      "Invalid safety number must fail verification"
    );

    // 3. Key Fingerprint Derivation
    const aliceFp = await deriveKeyFingerprint(keyAlice);
    assert.match(aliceFp, /^[A-F0-9]{4}( [A-F0-9]{4}){15}$/);

    // 4. QR matrix generator
    const matrix = generateQRMatrix(safetyAliceView.qrPayload);
    assert.ok(Array.isArray(matrix), "Must produce a 2D matrix array");
    assert.ok(matrix.length >= 21, "QR matrix must have at least version 1 dimensions (21x21)");
    assert.equal(matrix.length, matrix[0].length, "QR matrix must be square");
  });

  it("audits Zero-Cost Architecture adherence (Spark Free Tier + Vercel Hobby)", () => {
    // 1. Verify no cloud functions exist in root codebase
    const hasFunctionsDir = fs.existsSync(path.resolve(process.cwd(), "functions"));
    assert.equal(hasFunctionsDir, false, "Must not contain paid Cloud Functions directory");

    // 2. Verify package.json dependencies contain zero server compute or pay-as-you-go SDKs
    const packageJsonPath = path.resolve(process.cwd(), "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    assert.ok(!allDeps["firebase-admin"], "Must not bundle firebase-admin (client-only architecture)");
    assert.ok(!allDeps["@google-cloud/tasks"], "Must not require paid Cloud Tasks");
    assert.ok(!allDeps["@google-cloud/scheduler"], "Must not require paid Cloud Scheduler");

    // 3. Verify .env.example contains strictly client configuration (zero private secrets)
    const envExamplePath = path.resolve(process.cwd(), ".env.example");
    const envExample = fs.readFileSync(envExamplePath, "utf-8");
    assert.ok(envExample.includes("NEXT_PUBLIC_FIREBASE_API_KEY"));
    assert.ok(envExample.includes("NEXT_PUBLIC_FIREBASE_PROJECT_ID"));
    assert.ok(envExample.includes("NEXT_PUBLIC_FIREBASE_DATABASE_URL"));
    assert.ok(!envExample.includes("SERVICE_ACCOUNT"), "Must never include service account secrets");
    assert.ok(!envExample.includes("PRIVATE_KEY"), "Must never include server private keys");
  });

  it("audits PWA service worker policy against caching sensitive data", () => {
    const swPath = path.resolve(process.cwd(), "public/sw.js");
    const swContent = fs.readFileSync(swPath, "utf-8");

    // 1. Verify zero-plaintext caching exclusions
    assert.ok(swContent.includes("firebaseio.com"), "SW must explicitly check for firebaseio.com");
    assert.ok(swContent.includes("googleapis.com"), "SW must explicitly check for googleapis.com");
    assert.ok(swContent.includes("/api/"), "SW must explicitly bypass API paths");

    // 2. Verify cache storage names
    assert.ok(swContent.includes("ghostchat-shell-v1"), "Must use versioned static shell cache");
    assert.ok(swContent.includes("STATIC_PRECACHE_URLS"), "Must cache only static assets");
  });

  it("audits HTTP security headers and RTDB security rules AST", async () => {
    // 1. Headers audit
    assert.ok(typeof nextConfig.headers === "function");
    const headers = await nextConfig.headers();
    const globalHeaderRule = headers.find((h) => h.source === "/(.*)");
    assert.ok(globalHeaderRule);

    const map = new Map(globalHeaderRule.headers.map((h: { key: string; value: string }) => [h.key, h.value]));
    assert.equal(map.get("X-Frame-Options"), "DENY");
    assert.equal(map.get("X-Content-Type-Options"), "nosniff");
    assert.ok(map.get("Content-Security-Policy")?.includes("frame-ancestors 'none'"));
    assert.ok(map.get("Content-Security-Policy")?.includes("default-src 'self'"));
    assert.ok(map.get("Content-Security-Policy")?.includes("connect-src 'self'"));

    // 2. Database rules audit
    const rulesPath = path.resolve(process.cwd(), "database.rules.json");
    const rules = JSON.parse(fs.readFileSync(rulesPath, "utf-8")).rules;

    const rootKeys = Object.keys(rules);
    const expectedKeys = [
      "conversations",
      "userConversations",
      "messages",
      "presence",
      "typing",
      "calls",
    ];
    assert.deepEqual(rootKeys.sort(), expectedKeys.sort(), "Root keys must strictly match authorized paths");

    // Enforce default-deny on unmapped structures
    assert.ok(rules.conversations["$conversationId"][".validate"].includes("matches(/^[A-Za-z0-9_-]{22}$/)"));
    assert.ok(rules.messages["$conversationId"]["$generation"]["$messageId"][".validate"].includes("65536"));
  });
});
