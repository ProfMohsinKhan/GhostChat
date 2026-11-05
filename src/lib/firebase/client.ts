import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserSessionPersistence,
  getAuth,
  initializeAuth,
  type Auth,
} from "firebase/auth";
import { getDatabase, type Database } from "firebase/database";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
};

const requiredConfig = Object.values(firebaseConfig);

export const isFirebaseConfigured = requiredConfig.every(
  (value) => typeof value === "string" && value.trim().length > 0,
);

export type FirebaseClient = {
  app: FirebaseApp;
  auth: Auth;
  database: Database;
};

let cachedClient: FirebaseClient | undefined;

export function getFirebaseClient(): FirebaseClient {
  if (typeof window === "undefined") {
    throw new Error("Firebase client services can only be initialized in a browser.");
  }

  if (!isFirebaseConfigured) {
    throw new Error("Firebase is not configured. Add the required NEXT_PUBLIC_FIREBASE values.");
  }

  if (cachedClient) return cachedClient;

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  let auth: Auth;

  try {
    auth = initializeAuth(app, { persistence: browserSessionPersistence });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "auth/already-initialized"
    ) {
      auth = getAuth(app);
    } else {
      throw error;
    }
  }

  cachedClient = { app, auth, database: getDatabase(app, firebaseConfig.databaseURL) };
  return cachedClient;
}
