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
import { countSnapshotImages, mergeSnapshots } from '../snapshotMerge';
import { parsePersistedSnapshot } from '../storage/indexeddb';
import { GUEST_DEFAULT_UID_FALLBACK } from '../../config/guest';
import { getBytes, getStorage, ref, uploadString } from 'firebase/storage';
import type { PersistedSnapshot } from '../../types';

function guestDefaultUid(): string | undefined {
  const fromEnv = import.meta.env.VITE_GUEST_DEFAULT_UID?.trim();
  if (fromEnv) return fromEnv;
  const fb = GUEST_DEFAULT_UID_FALLBACK?.trim();
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

/** 리다이렉트 로그인 처리 후 첫 인증 상태(세션 복원 포함) */
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

/** 비로그인 기본 일기: 공개 URL 또는 Firestore 공개 읽기 UID 중 하나 필요 */
export function canLoadGuestDefault(): boolean {
  return Boolean(import.meta.env.VITE_PUBLIC_GUEST_SNAPSHOT_URL?.trim() || guestDefaultUid());
}

const GUEST_LOG = '[게스트 일기]';

/** 브라우저 콘솔에서 게스트 로드 조건을 바로 확인 (배포 디버깅용) */
export function logGuestBootstrapLine(): void {
  if (!isFirebaseConfigured()) {
    console.info(GUEST_LOG, 'Firebase env 없음 → 게스트 경로 사용 안 함');
    return;
  }
  const url = import.meta.env.VITE_PUBLIC_GUEST_SNAPSHOT_URL?.trim();
  if (url) {
    console.info(GUEST_LOG, '소스: VITE_PUBLIC_GUEST_SNAPSHOT_URL', url.length > 80 ? `${url.slice(0, 80)}…` : url);
    return;
  }
  const uid = guestDefaultUid();
  if (!uid) {
    console.warn(
      GUEST_LOG,
      'UID 없음 — GitHub Actions에 VITE_GUEST_DEFAULT_UID 또는 guest.ts GUEST_DEFAULT_UID_FALLBACK 필요',
    );
    return;
  }
  console.info(GUEST_LOG, '소스: Firestore', `scrapbooks/${uid}`);
}

/** 콘솔 필터에 `게스트` 입력 시 위 로그만 모아볼 수 있음 */
export function logGuestSkip(reason: string): void {
  console.info(GUEST_LOG, '건너뜀:', reason);
}

/** pushSnapshot이 Storage에 올린 전체 JSON(사진 base64 포함) — Firestore 1MB 제한 보완 */
async function fetchGuestSnapshotFromStorage(uid: string): Promise<PersistedSnapshot | null> {
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
    console.warn(
      GUEST_LOG,
      'Storage snapshot.json 읽기 실패(비로그인 읽기 규칙·파일 경로 확인)',
      detail,
    );
    return null;
  }
}

export async function fetchGuestDefaultSnapshot(): Promise<PersistedSnapshot | null> {
  const url = import.meta.env.VITE_PUBLIC_GUEST_SNAPSHOT_URL?.trim();
  if (url) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(GUEST_LOG, 'VITE_PUBLIC_GUEST_SNAPSHOT_URL 요청 실패', res.status, url);
        return null;
      }
      const text = await res.text();
      const parsed = parsePersistedSnapshot(text);
      console.info(GUEST_LOG, '공개 URL에서 스냅샷 파싱 성공');
      return parsed;
    } catch (e) {
      console.warn(GUEST_LOG, '스냅샷 URL fetch 실패', url, e);
      return null;
    }
  }
  const uid = guestDefaultUid();
  if (!uid) {
    console.warn(
      GUEST_LOG,
      'UID 없음 — VITE_GUEST_DEFAULT_UID 또는 src/config/guest.ts 의 GUEST_DEFAULT_UID_FALLBACK 필요',
    );
    return null;
  }
  const docPath = `scrapbooks/${uid}`;
  try {
    ensureFirebase();
    const firestore = getFirestore();
    const snapshotDoc = await getDoc(doc(firestore, 'scrapbooks', uid));
    if (!snapshotDoc.exists()) {
      const stOnly = await fetchGuestSnapshotFromStorage(uid);
      if (stOnly) {
        console.info(GUEST_LOG, 'Firestore 문서 없음 → Storage snapshot.json 만 사용');
        return stOnly;
      }
      console.warn(
        GUEST_LOG,
        `문서 없음: ${docPath} — Firestore 생성 또는 Storage에 snapshot.json 업로드 필요`,
      );
      return null;
    }
    const data = snapshotDoc.data() as { snapshot?: PersistedSnapshot };
    if (data.snapshot == null) {
      const stOnly = await fetchGuestSnapshotFromStorage(uid);
      if (stOnly) {
        console.info(GUEST_LOG, 'Firestore snapshot 필드 없음 → Storage snapshot.json 만 사용');
        return stOnly;
      }
      console.warn(
        GUEST_LOG,
        `문서는 있으나 snapshot 필드가 비어 있음: ${docPath} — 필드 이름이 snapshot 인지 확인하세요.`,
      );
      return null;
    }
    const fsSnap = data.snapshot;
    const fsImg = countSnapshotImages(fsSnap);
    console.info(GUEST_LOG, 'Firestore 스냅샷 로드', docPath, `이미지 ${fsImg}장(참고: Firestore 문서는 1MB 제한으로 사진이 비어 있을 수 있음)`);

    const stSnap = await fetchGuestSnapshotFromStorage(uid);
    if (!stSnap) {
      return fsSnap;
    }
    const stImg = countSnapshotImages(stSnap);
    const merged = mergeSnapshots(fsSnap, stSnap);
    const mergedImg = countSnapshotImages(merged);
    console.info(
      GUEST_LOG,
      'Storage snapshot.json 병합',
      `Firestore ${fsImg}장 + Storage ${stImg}장 → 합계 ${mergedImg}장`,
    );
    return merged;
  } catch (e) {
    const detail =
      e instanceof FirebaseError
        ? `${e.code} (${e.message})`
        : e instanceof Error
          ? e.message
          : String(e);
    console.warn(
      GUEST_LOG,
      `Firestore 읽기 실패: ${docPath}`,
      detail,
      '→ 규칙에서 이 UID 읽기 허용·프로젝트 ID·규칙 게시 여부를 확인하세요.',
    );
    return null;
  }
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
