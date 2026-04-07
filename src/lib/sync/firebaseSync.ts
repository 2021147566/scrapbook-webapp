import { FirebaseError, initializeApp, type FirebaseOptions } from 'firebase/app';
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
import { isOwnerEmail, OWNER_UID_FALLBACK } from '../../config/scrapbookOwner';
import { countSnapshotImages, mergeSnapshots } from '../snapshotMerge';
import { parsePersistedSnapshot } from '../storage/indexeddb';
import { getBytes, getStorage, ref, uploadString } from 'firebase/storage';
import type { PersistedSnapshot } from '../../types';

function ownerScrapbookUid(): string | undefined {
  const fromEnv =
    import.meta.env.VITE_SCRAPBOOK_OWNER_UID?.trim() || import.meta.env.VITE_GUEST_DEFAULT_UID?.trim();
  if (fromEnv) return fromEnv;
  const fb = OWNER_UID_FALLBACK?.trim();
  return fb || undefined;
}

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

function preferGoogleRedirect(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;
  if (navigator.maxTouchPoints > 0 && /Macintosh/.test(ua)) return true;
  return false;
}

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
    // ignore
  }
  return null;
}

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

export async function resolveInitialAuth(): Promise<User | null> {
  if (!isFirebaseConfigured()) return null;
  await completeGoogleRedirectIfAny();
  return new Promise((resolve) => {
    ensureFirebase();
    const unsub = onAuthStateChanged(getAuth(), (user) => {
      unsub();
      authUser = user;
      resolve(user);
    });
  });
}

/** 공개 일기 로드: JSON URL 또는 소유자 UID(Firestore/Storage) */
export function canLoadPublicScrapbook(): boolean {
  return Boolean(import.meta.env.VITE_PUBLIC_GUEST_SNAPSHOT_URL?.trim() || ownerScrapbookUid());
}

const SCRAP_LOG = '[스크랩북]';

export function logPublicBootstrapLine(): void {
  if (!isFirebaseConfigured()) {
    console.info(SCRAP_LOG, 'Firebase 미설정');
    return;
  }
  const url = import.meta.env.VITE_PUBLIC_GUEST_SNAPSHOT_URL?.trim();
  if (url) {
    console.info(SCRAP_LOG, '공개 URL', url.length > 80 ? `${url.slice(0, 80)}…` : url);
    return;
  }
  const uid = ownerScrapbookUid();
  if (!uid) {
    console.warn(SCRAP_LOG, 'UID 없음 — VITE_SCRAPBOOK_OWNER_UID 또는 scrapbookOwner.OWNER_UID_FALLBACK');
    return;
  }
  console.info(SCRAP_LOG, 'Firestore/Storage', `scrapbooks/${uid}`);
}

export function logPublicSkip(reason: string): void {
  console.info(SCRAP_LOG, '건너뜀:', reason);
}

async function fetchOwnerSnapshotFromStorage(uid: string): Promise<PersistedSnapshot | null> {
  try {
    ensureFirebase();
    const storage = getStorage();
    const r = ref(storage, `scrapbooks/${uid}/snapshot.json`);
    const bytes = await getBytes(r);
    const text = new TextDecoder().decode(bytes);
    return parsePersistedSnapshot(text);
  } catch (e) {
    const detail =
      e instanceof FirebaseError
        ? `${e.code} (${e.message})`
        : e instanceof Error
          ? e.message
          : String(e);
    console.warn(SCRAP_LOG, 'Storage snapshot.json 읽기 실패', detail);
    console.warn(
      SCRAP_LOG,
      'CORS: 레포 storage-cors.json → gsutil cors set … (storage.rules.example 참고)',
    );
    return null;
  }
}

/** 비로그인 포함 모든 방문자가 보는 공개 스냅샷(소유자 UID 문서) */
export async function fetchPublicScrapbookSnapshot(): Promise<PersistedSnapshot | null> {
  const url = import.meta.env.VITE_PUBLIC_GUEST_SNAPSHOT_URL?.trim();
  if (url) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(SCRAP_LOG, '공개 URL 요청 실패', res.status, url);
        return null;
      }
      const text = await res.text();
      const parsed = parsePersistedSnapshot(text);
      console.info(SCRAP_LOG, '공개 URL 파싱 성공');
      return parsed;
    } catch (e) {
      console.warn(SCRAP_LOG, '공개 URL fetch 실패', url, e);
      return null;
    }
  }
  const uid = ownerScrapbookUid();
  if (!uid) {
    console.warn(SCRAP_LOG, 'UID 없음');
    return null;
  }
  const docPath = `scrapbooks/${uid}`;
  try {
    ensureFirebase();
    const firestore = getFirestore();
    const snapshotDoc = await getDoc(doc(firestore, 'scrapbooks', uid));
    if (!snapshotDoc.exists()) {
      const stOnly = await fetchOwnerSnapshotFromStorage(uid);
      if (stOnly) {
        console.info(SCRAP_LOG, 'Firestore 없음 → Storage 만');
        return stOnly;
      }
      console.warn(SCRAP_LOG, `문서 없음: ${docPath}`);
      return null;
    }
    const data = snapshotDoc.data() as { snapshot?: PersistedSnapshot };
    if (data.snapshot == null) {
      const stOnly = await fetchOwnerSnapshotFromStorage(uid);
      if (stOnly) {
        console.info(SCRAP_LOG, 'snapshot 필드 없음 → Storage 만');
        return stOnly;
      }
      console.warn(SCRAP_LOG, `snapshot 필드 없음: ${docPath}`);
      return null;
    }
    const fsSnap = data.snapshot;
    const fsImg = countSnapshotImages(fsSnap);
    console.info(SCRAP_LOG, 'Firestore 로드', docPath, `이미지 ${fsImg}장`);

    const stSnap = await fetchOwnerSnapshotFromStorage(uid);
    if (!stSnap) {
      return fsSnap;
    }
    const stImg = countSnapshotImages(stSnap);
    const merged = mergeSnapshots(fsSnap, stSnap);
    const mergedImg = countSnapshotImages(merged);
    console.info(SCRAP_LOG, 'Storage 병합', `Firestore ${fsImg} + Storage ${stImg} → ${mergedImg}장`);
    return merged;
  } catch (e) {
    const detail =
      e instanceof FirebaseError
        ? `${e.code} (${e.message})`
        : e instanceof Error
          ? e.message
          : String(e);
    console.warn(SCRAP_LOG, `Firestore 실패: ${docPath}`, detail);
    return null;
  }
}

export async function pushSnapshot(snapshot: PersistedSnapshot): Promise<void> {
  ensureFirebase();
  if (!authUser) throw new Error('로그인 후 동기화할 수 있습니다.');
  if (!isOwnerEmail(authUser)) {
    throw new Error('편집 권한이 없습니다. 소유자 계정으로 로그인하세요.');
  }
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

/** 소유자만 자기 문서 pull */
export async function pullSnapshot(): Promise<PersistedSnapshot | null> {
  ensureFirebase();
  if (!authUser) throw new Error('로그인 후 동기화할 수 있습니다.');
  if (!isOwnerEmail(authUser)) {
    return null;
  }
  const firestore = getFirestore();
  const snapshotDoc = await getDoc(doc(firestore, 'scrapbooks', authUser.uid));
  if (!snapshotDoc.exists()) return null;
  const data = snapshotDoc.data() as { snapshot?: PersistedSnapshot };
  return data.snapshot ?? null;
}

export function getFirebaseAppName(): string {
  return appName;
}
