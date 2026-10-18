import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { Auth, getAuth } from "firebase/auth";
import { Firestore, getFirestore } from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId);
export const firebaseApp: FirebaseApp | undefined = isFirebaseConfigured
  ? getApps().length
    ? getApp()
    : initializeApp(config)
  : undefined;
export const auth: Auth | undefined = firebaseApp
  ? getAuth(firebaseApp)
  : undefined;
export const db: Firestore | undefined = firebaseApp
  ? getFirestore(firebaseApp)
  : undefined;

/** Analytics only runs in the browser; keeping it lazy prevents SSR failures. */
export async function initializeAnalytics() {
  if (!firebaseApp || typeof window === "undefined") return undefined;
  const { getAnalytics, isSupported } = await import("firebase/analytics");
  return (await isSupported()) ? getAnalytics(firebaseApp) : undefined;
}
