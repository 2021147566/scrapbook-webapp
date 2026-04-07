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

/**
 * Firestore `scrapbooks/{uid}` + Storage `snapshot.json` 병합.
 * 공개 일기 로드와 소유자 pull이 동일한 소스를 보도록 맞춤(이전엔 pull이 Firestore만 읽어 불일치 발생).
 */
async function fetchScrapbookBundleForUid(uid: string): Promise<PersistedSnapshot | null> {
  const docPath = `scrapbooks/${uid}`;
  try {
    ensureFirebase();
    const firestore = getFirestore();
    const snapshotDoc = await getDoc(doc(firestore, 'scrapbooks', uid));
    if (!snapshotDoc.exists()) {
      const stOnly = await fetchOwnerSnapshotFromStorage(uid);
      if (stOnly) {
        console.info(SCRAP_LOG, 'Firestore 없음 → Storage 만', docPath);
        return stOnly;
      }
      console.warn(SCRAP_LOG, `문서 없음: ${docPath}`);
      return null;
    }
    const data = snapshotDoc.data() as { snapshot?: PersistedSnapshot };
    if (data.snapshot == null) {
      const stOnly = await fetchOwnerSnapshotFromStorage(uid);
      if (stOnly) {
        console.info(SCRAP_LOG, 'snapshot 필드 없음 → Storage 만', docPath);
        return stOnly;
      }
      console.warn(SCRAP_LOG, `snapshot 필드 없음: ${docPath}`);
      return null;
    }
    const fsSnap = data.snapshot;
    const fsImg = countSnapshotImages(fsSnap);
    console.info(SCRAP_LOG, 'Firestore 로드', docPath, `이미지 ${fsImg}장`);

    // Firestore에 스냅샷이 있으면 Storage snapshot.json 병합 생략.
    // getBytes()는 브라우저 XHR이라 GCS 버킷 CORS가 없으면 GitHub Pages 등에서 실패함.
    // 업로드 시 Firestore·Storage에 동일 내용을 쓰므로 일반적으로 병합 불필요.
    if (import.meta.env.VITE_FORCE_STORAGE_SNAPSHOT_MERGE === 'true') {
      const stSnap = await fetchOwnerSnapshotFromStorage(uid);
      if (!stSnap) {
        return fsSnap;
      }
      const stImg = countSnapshotImages(stSnap);
      const merged = mergeSnapshots(fsSnap, stSnap);
      const mergedImg = countSnapshotImages(merged);
      console.info(SCRAP_LOG, 'Storage 병합', `Firestore ${fsImg} + Storage ${stImg} → ${mergedImg}장`);
      return merged;
    }
    return fsSnap;
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
  return fetchScrapbookBundleForUid(uid);
}

/** Firestore는 중첩 필드에 `undefined`가 있으면 invalid nested entity 오류 — JSON 왕복으로 제거 */
function sanitizeSnapshotForFirestore(snapshot: PersistedSnapshot): PersistedSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as PersistedSnapshot;
}

/**
 * Firestore 문서 전체 한도 1MiB — JSON UTF-8 길이와 Firestore 직렬화 크기가 달라 여유 있게 잡음.
 * 그래도 초과하면 setDoc 실패 → 메타만 재시도.
 */
const FIRESTORE_SNAPSHOT_MAX_BYTES = 500_000;

function isFirestoreDocumentTooLarge(e: unknown): boolean {
  if (!(e instanceof FirebaseError)) return false;
  const m = (e.message ?? '').toLowerCase();
  return (
    m.includes('exceeds') ||
    m.includes('maximum allowed size') ||
    m.includes('1048576') ||
    (e.code === 'invalid-argument' && (m.includes('size') || m.includes('document')))
  );
}

export async function pushSnapshot(snapshot: PersistedSnapshot): Promise<void> {
  ensureFirebase();
  if (!authUser) throw new Error('로그인 후 동기화할 수 있습니다.');
  if (!isOwnerEmail(authUser)) {
    throw new Error('편집 권한이 없습니다. 소유자 계정으로 로그인하세요.');
  }
  const clean = sanitizeSnapshotForFirestore(snapshot);
  const jsonStr = JSON.stringify(clean);
  const sizeBytes = new TextEncoder().encode(jsonStr).length;

  const storage = getStorage();
  await uploadString(
    ref(storage, `scrapbooks/${authUser.uid}/snapshot.json`),
    jsonStr,
    'raw',
    { contentType: 'application/json' },
  );

  const firestore = getFirestore();
  const docRef = doc(firestore, 'scrapbooks', authUser.uid);

  const writeMetaOnly = () =>
    setDoc(docRef, {
      updatedAt: Date.now(),
    });

  if (sizeBytes > FIRESTORE_SNAPSHOT_MAX_BYTES) {
    console.info(
      SCRAP_LOG,
      `스냅샷 ${sizeBytes} bytes — Firestore에 본문 생략, Storage만(이미 업로드됨)`,
    );
    await writeMetaOnly();
    return;
  }

  try {
    await setDoc(docRef, {
      updatedAt: Date.now(),
      snapshot: clean,
    });
  } catch (e) {
    if (isFirestoreDocumentTooLarge(e)) {
      console.warn(
        SCRAP_LOG,
        'Firestore 문서 한도 초과로 스냅샷 필드 생략 — Storage는 이미 반영됨',
      );
      await writeMetaOnly();
      return;
    }
    throw e;
  }
}

/** 소유자: Firestore+Storage 병합 pull. env UID와 로그인 UID가 다르면 두 문서를 합침(공개 경로와 동기). */
export async function pullSnapshot(): Promise<PersistedSnapshot | null> {
  ensureFirebase();
  if (!authUser) throw new Error('로그인 후 동기화할 수 있습니다.');
  if (!isOwnerEmail(authUser)) {
    return null;
  }
  const uid = authUser.uid;
  const envUid = ownerScrapbookUid();

  if (envUid && envUid !== uid) {
    console.warn(
      SCRAP_LOG,
      'VITE_SCRAPBOOK_OWNER_UID(또는 폴백)와 로그인 UID가 다릅니다. 배포 env를 본인 Google UID로 맞추면 공개·로그인 뷰가 한 문서로 통일됩니다.',
      { envUid, authUid: uid },
    );
  }

  const fromAuth = await fetchScrapbookBundleForUid(uid);
  if (envUid && envUid !== uid) {
    const fromEnv = await fetchScrapbookBundleForUid(envUid);
    if (fromAuth && fromEnv) {
      // env(공개 경로) 먼저, auth(로그인 UID)를 나중에 두어 snapshot.updatedAt 등에서 최신 쪽이 우선
      return mergeSnapshots(fromEnv, fromAuth);
    }
    return fromAuth ?? fromEnv ?? null;
  }
  return fromAuth;
}

export function getFirebaseAppName(): string {
  return appName;
}
