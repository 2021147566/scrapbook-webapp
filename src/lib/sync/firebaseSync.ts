import { initializeApp, type FirebaseOptions } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc, getFirestore, setDoc } from 'firebase/firestore';
import { getStorage, ref, uploadString } from 'firebase/storage';
import type { PersistedSnapshot } from '../../types';

let firebaseReady = false;
let authUser: User | null = null;
let appName = '';

function getEnvConfig(): FirebaseOptions | null {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET;
  const appId = import.meta.env.VITE_FIREBASE_APP_ID;
  if (!apiKey || !authDomain || !projectId || !storageBucket || !appId) {
    return null;
  }
  return { apiKey, authDomain, projectId, storageBucket, appId };
}

function ensureFirebase() {
  if (firebaseReady) return;
  const config = getEnvConfig();
  if (!config) {
    throw new Error('Firebase 환경변수가 비어 있습니다.');
  }
  const app = initializeApp(config);
  appName = app.name;
  firebaseReady = true;
}

export function isFirebaseConfigured(): boolean {
  return Boolean(getEnvConfig());
}

export async function loginWithGoogle(): Promise<User> {
  ensureFirebase();
  const auth = getAuth();
  const result = await signInWithPopup(auth, new GoogleAuthProvider());
  authUser = result.user;
  return result.user;
}

export async function logoutFirebase(): Promise<void> {
  ensureFirebase();
  await signOut(getAuth());
  authUser = null;
}

export function getCurrentUser(): User | null {
  return authUser;
}

export function watchAuthState(onChange: (user: User | null) => void): () => void {
  ensureFirebase();
  return onAuthStateChanged(getAuth(), (user) => {
    authUser = user;
    onChange(user);
  });
}

export async function pushSnapshot(snapshot: PersistedSnapshot): Promise<void> {
  ensureFirebase();
  if (!authUser) throw new Error('로그인 후 동기화할 수 있습니다.');
  const firestore = getFirestore();
  await setDoc(doc(firestore, 'scrapbooks', authUser.uid), {
    updatedAt: Date.now(),
    snapshot,
  });
  const storage = getStorage();
  await uploadString(
    ref(storage, `scrapbooks/${authUser.uid}/snapshot.json`),
    JSON.stringify(snapshot),
    'raw',
    { contentType: 'application/json' },
  );
}

export async function pullSnapshot(): Promise<PersistedSnapshot | null> {
  ensureFirebase();
  if (!authUser) throw new Error('로그인 후 동기화할 수 있습니다.');
  const firestore = getFirestore();
  const snapshotDoc = await getDoc(doc(firestore, 'scrapbooks', authUser.uid));
  if (!snapshotDoc.exists()) return null;
  const data = snapshotDoc.data() as { snapshot?: PersistedSnapshot };
  return data.snapshot ?? null;
}

export function getFirebaseAppName(): string {
  return appName;
}
