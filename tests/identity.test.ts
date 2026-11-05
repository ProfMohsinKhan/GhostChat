import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createNewDeviceIdentity,
  deleteDeviceIdentity,
  getOrCreateDeviceIdentity,
} from "../src/features/identity/identity-service";

Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });

const databaseName = "ghostchat-device-identities";

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Identity database remained open after a test."));
  });
});

describe("device identity", () => {
  it("creates a stable per-account identity and keeps private keys non-extractable", async () => {
    const first = await getOrCreateDeviceIdentity("alice");
    const reloaded = await getOrCreateDeviceIdentity("alice");
    const otherAccount = await getOrCreateDeviceIdentity("bob");

    assert.equal(reloaded.fingerprint, first.fingerprint);
    assert.notEqual(otherAccount.fingerprint, first.fingerprint);
    assert.match(first.fingerprint, /^[A-F0-9]{4}( [A-F0-9]{4}){15}$/);

    const stored = await readStored("alice");
    assert.equal(stored.signingPrivateKey.extractable, false);
    assert.equal(stored.agreementPrivateKey.extractable, false);
    assert.deepEqual(stored.signingPrivateKey.usages, ["sign"]);
    assert.deepEqual(stored.agreementPrivateKey.usages, ["deriveBits"]);
  });

  it("removes an identity and creates a new fingerprint only when requested", async () => {
    const original = await getOrCreateDeviceIdentity("alice");
    await deleteDeviceIdentity("alice");
    const replacement = await createNewDeviceIdentity("alice");

    assert.notEqual(replacement.fingerprint, original.fingerprint);
    assert.equal((await getOrCreateDeviceIdentity("alice")).fingerprint, replacement.fingerprint);
  });
});

function readStored(uid: string): Promise<{ signingPrivateKey: CryptoKey; agreementPrivateKey: CryptoKey }> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(databaseName, 1);
    open.onsuccess = () => {
      const db = open.result;
      const request = db.transaction("identities", "readonly").objectStore("identities").get(uid);
      request.onsuccess = () => { db.close(); resolve(request.result); };
      request.onerror = () => { db.close(); reject(request.error); };
    };
    open.onerror = () => reject(open.error);
  });
}
