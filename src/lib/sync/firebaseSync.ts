import { initializeApp, type FirebaseOptions } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
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

/** 모바일·태블릿 브라우저는 팝업 로그인이 차단되거나 실패하는 경우가 많아 리다이렉트를 쓴다. */
function preferGoogleRedirect(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;
  // iPadOS 13+ Safari: User-Agent가 Macintosh로 나올 수 있음
  if (navigator.maxTouchPoints > 0 && /Macintosh/.test(ua)) return true;
  return false;
}

/**
 * Google 로그인 리다이렉트로 돌아온 뒤 페이지가 다시 로드될 때 반드시 호출해야 한다.
 * (모바일 signInWithRedirect 플로우 완료)
 */
export async function completeGoogleRedirectIfAny(): Promise<User | null> {
  if (!isFirebaseConfigured()) return null;
  ensureFirebase();
  const auth = getAuth();
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      authUser = result.user;
      return result.user;
    }
  } catch {
    // 리다이렉트 로그인 실패·취소 등 — onAuthStateChanged가 최종 상태를 맞춤
  }
  return null;
}

/** 리다이렉트가 시작되면 페이지가 이동하므로 User를 반환하지 않을 수 있다. */
export async function loginWithGoogle(): Promise<User | undefined> {
  ensureFirebase();
  const auth = getAuth();
  const provider = new GoogleAuthProvider();
  if (preferGoogleRedirect()) {
    await signInWithRedirect(auth, provider);
    return undefined;
  }
  const result = await signInWithPopup(auth, provider);
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
