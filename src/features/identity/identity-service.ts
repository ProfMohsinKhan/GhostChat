const DATABASE_NAME = "ghostchat-device-identities";
const DATABASE_VERSION = 1;
const STORE_NAME = "identities";
const IDENTITY_DOMAIN = "GhostChat local identity v1";

export type StoredIdentity = {
  uid: string;
  createdAt: number;
  fingerprint: string;
  signingPublicKey: string;
  agreementPublicKey: string;
  signingPrivateKey: CryptoKey;
  agreementPrivateKey: CryptoKey;
};

export type DeviceIdentity = {
  createdAt: number;
  fingerprint: string;
  agreementPublicKey: string;
};

export async function getStoredIdentity(uid: string): Promise<StoredIdentity | undefined> {
  return readIdentity(uid);
}

export async function getOrCreateDeviceIdentity(uid: string): Promise<DeviceIdentity> {
  const existing = await readIdentity(uid);
  if (existing) return publicIdentity(existing);

  const candidate = await generateIdentity(uid);
  try {
    await insertIdentity(candidate);
    return publicIdentity(candidate);
  } catch (error) {
    // If another tab initialized the same account at the same time, use its winner.
    if (error instanceof DOMException && error.name === "ConstraintError") {
      const winner = await readIdentity(uid);
      if (winner) return publicIdentity(winner);
    }
    throw error;
  }
}

export async function createNewDeviceIdentity(uid: string): Promise<DeviceIdentity> {
  await deleteDeviceIdentity(uid);
  return getOrCreateDeviceIdentity(uid);
}

export async function deleteDeviceIdentity(uid: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const completed = transactionResult(transaction);
    transaction.objectStore(STORE_NAME).delete(uid);
    await completed;
  } finally {
    database.close();
  }
}

async function generateIdentity(uid: string): Promise<StoredIdentity> {
  const signingPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign", "verify"],
  ) as CryptoKeyPair;
  const agreementPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  ) as CryptoKeyPair;

  if (signingPair.privateKey.extractable || agreementPair.privateKey.extractable) {
    throw new Error("The browser did not create non-extractable private keys.");
  }

  const signingPublicKey = encodeBytes(new Uint8Array(await crypto.subtle.exportKey("raw", signingPair.publicKey)));
  const agreementPublicKey = encodeBytes(new Uint8Array(await crypto.subtle.exportKey("raw", agreementPair.publicKey)));
  const fingerprint = await createFingerprint(signingPublicKey, agreementPublicKey);

  // Verify the generated signing pair before it is persisted.
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    signingPair.privateKey,
    challenge,
  );
  const keyPairWorks = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    signingPair.publicKey,
    signature,
    challenge,
  );
  if (!keyPairWorks) throw new Error("The browser could not verify the generated identity key.");

  return {
    uid,
    createdAt: Date.now(),
    fingerprint,
    signingPublicKey,
    agreementPublicKey,
    signingPrivateKey: signingPair.privateKey,
    agreementPrivateKey: agreementPair.privateKey,
  };
}

async function createFingerprint(signingPublicKey: string, agreementPublicKey: string): Promise<string> {
  const canonical = [IDENTITY_DOMAIN, "ECDSA-P256", signingPublicKey, "ECDH-P256", agreementPublicKey].join("\n");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical)));
  const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  return hex.match(/.{1,4}/g)?.join(" ") ?? hex;
}

function encodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function publicIdentity(identity: StoredIdentity): DeviceIdentity {
  return {
    createdAt: identity.createdAt,
    fingerprint: identity.fingerprint,
    agreementPublicKey: identity.agreementPublicKey,
  };
}

async function readIdentity(uid: string): Promise<StoredIdentity | undefined> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const completed = transactionResult(transaction);
    const request = transaction.objectStore(STORE_NAME).get(uid) as IDBRequest<StoredIdentity | undefined>;
    const result = await requestResult(request);
    await completed;
    return result;
  } finally {
    database.close();
  }
}

async function insertIdentity(identity: StoredIdentity): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const completed = transactionResult(transaction);
    transaction.objectStore(STORE_NAME).add(identity);
    await completed;
  } finally {
    database.close();
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined" || !globalThis.crypto?.subtle) {
    return Promise.reject(new Error("This browser does not support local cryptographic identity storage."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "uid" });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error("Local identity storage could not be opened."));
    request.onblocked = () => reject(new Error("Close other GhostChat tabs to update local identity storage."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Local identity storage request failed."));
  });
}

function transactionResult(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Local identity storage transaction was cancelled."));
    transaction.onerror = () => reject(transaction.error ?? new Error("Local identity storage transaction failed."));
  });
}
