import type { StoredVerification, VerificationStatus } from "./types";

const DATABASE_NAME = "ghostchat-verifications";
const DATABASE_VERSION = 1;
const STORE_NAME = "verified-contacts";

function openVerificationDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(
      new Error("IndexedDB is not available in this environment.")
    );
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {
          keyPath: ["userUid", "peerUid"],
        });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to open verification database."));
  });
}

/**
 * Retrieves the stored verification record for a peer under the current user's profile.
 */
export async function getStoredVerification(
  userUid: string,
  peerUid: string
): Promise<StoredVerification | undefined> {
  if (typeof indexedDB === "undefined" || !userUid || !peerUid) {
    return undefined;
  }

  const db = await openVerificationDB();
  try {
    return await new Promise<StoredVerification | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get([userUid, peerUid]) as IDBRequest<
        StoredVerification | undefined
      >;
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Persists a verification record marking a peer's fingerprint and safety number as verified.
 */
export async function saveStoredVerification(
  verification: StoredVerification
): Promise<void> {
  if (typeof indexedDB === "undefined") return;

  const db = await openVerificationDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(verification);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Removes a stored verification record (when user un-verifies a contact).
 */
export async function deleteStoredVerification(
  userUid: string,
  peerUid: string
): Promise<void> {
  if (typeof indexedDB === "undefined") return;

  const db = await openVerificationDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete([userUid, peerUid]);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Evaluates whether a contact is currently verified, unverified, or has had their key changed.
 */
export async function checkKeyChangeStatus(
  userUid: string,
  peerUid: string,
  currentFingerprint: string,
  currentSafetyNumber?: string
): Promise<VerificationStatus> {
  const stored = await getStoredVerification(userUid, peerUid);

  if (!stored) {
    return {
      isVerified: false,
      isKeyChanged: false,
      currentFingerprint,
      currentSafetyNumber,
    };
  }

  // Key change detection: Stored fingerprint differs from active peer key fingerprint!
  if (stored.verifiedFingerprint !== currentFingerprint) {
    return {
      isVerified: false,
      isKeyChanged: true,
      storedVerification: stored,
      currentFingerprint,
      currentSafetyNumber,
    };
  }

  return {
    isVerified: true,
    isKeyChanged: false,
    storedVerification: stored,
    currentFingerprint,
    currentSafetyNumber,
  };
}
