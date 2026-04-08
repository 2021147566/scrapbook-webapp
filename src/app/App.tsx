import dayjs from 'dayjs';
import 'dayjs/locale/en';
import 'dayjs/locale/ko';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import {
  CalendarDateGrid,
  CalendarMobileMonthScroller,
  CalendarWeekdayHeader,
} from '../features/calendar/CalendarView';
import { CalendarSidebar } from '../features/calendar/CalendarSidebar';
import { BookView } from '../features/book/BookView';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useMonthShardNav } from '../hooks/useMonthShardNav';
import { monthKeyFromDate, shardToPersisted } from '../lib/monthShard';
import {
  importSnapshot,
  loadMeta,
  loadMonthShard,
  loadSnapshot,
  mergeAllMonthShardsFromIDB,
  replaceAllShardsFromSnapshot,
  switchMonthShard,
} from '../lib/storage/indexeddb';
import { flushDirtyToIDB } from '../lib/persistScrap';
import { mergeSnapshots } from '../lib/snapshotMerge';
import type { User } from 'firebase/auth';
import { isOwnerEmail, OWNER_EMAIL } from '../config/scrapbookOwner';
import {
  canLoadPublicScrapbook,
  completeGoogleRedirectIfAny,
  fetchPublicScrapbookSnapshot,
  isFirebaseConfigured,
  logPublicBootstrapLine,
  logPublicSkip,
  loginWithGoogle,
  logoutFirebase,
  pullSnapshot,
  pushSnapshot,
  watchAuthState,
} from '../lib/sync/firebaseSync';
import { ReadOnlyProvider, useReadOnly } from '../context/ReadOnlyContext';
import { useScrapStore } from '../store/scrapStore';
import type { PersistedSnapshot } from '../types';
import { DEFAULT_ROUTINE_LABELS } from '../types';

/** 달력 그리드·사이드바와 동일 기준 (styles.css) */
const MOBILE_CALENDAR_MEDIA = '(max-width: 960px)';

const AUTO_SYNC_STORAGE_KEY = 'scrapbook-auto-sync';

/** 로그인 시: 표시이름(없으면 @앞) (전체 이메일) — 설정 등 */
function formatAccountLabel(user: User): string {
  const email = user.email ?? '';
  const primary = user.displayName?.trim() || email.split('@')[0]?.trim() || '사용자';
  return email ? `${primary} (${email})` : primary;
}

/** 상단 고정 제목 */
function headerTitle(): string {
  return isFirebaseConfigured() ? '의서의 일기' : '스크랩북';
}

function emptyPersistedSnapshot(): PersistedSnapshot {
  return {
    updatedAt: Date.now(),
    imagesByDate: {},
    diaryByDate: {},
    routineByDate: {},
    routineLabels: [...DEFAULT_ROUTINE_LABELS],
  };
}

/** 소유자 전용: 클라우드 pull → IDB 월 샤드 병합 후 현재 활성 월만 메모리 로드 */
async function pullCloudMergeIntoStore(): Promise<boolean> {
  const cloud = await pullSnapshot();
  if (!cloud) return false;
  const local = await mergeAllMonthShardsFromIDB();
  const merged = mergeSnapshots(local, cloud);
  await replaceAllShardsFromSnapshot(merged);
  const meta = await loadMeta();
  const shard = await loadMonthShard(meta.lastActiveMonthKey);
  const s = useScrapStore.getState();
  s.loadSnapshot(shardToPersisted(shard, meta.routineLabels));
  s.setLoadedMonthKey(meta.lastActiveMonthKey);
  s.setMonthCursor(dayjs(meta.lastActiveMonthKey + '-01').toDate());
  if (!s.selectedDate.startsWith(meta.lastActiveMonthKey)) {
    s.setSelectedDate(dayjs(meta.lastActiveMonthKey + '-01').format('YYYY-MM-DD'));
  }
  return true;
}

/** 공개 일기(모든 방문자) */
async function mergePublicIntoStore(): Promise<boolean> {
  if (!canLoadPublicScrapbook()) return false;
  const pub = await fetchPublicScrapbookSnapshot();
  if (!pub) return false;
  const local = await mergeAllMonthShardsFromIDB();
  const merged = mergeSnapshots(local, pub);
  await replaceAllShardsFromSnapshot(merged);
  const meta = await loadMeta();
  const shard = await loadMonthShard(meta.lastActiveMonthKey);
  const s = useScrapStore.getState();
  s.loadSnapshot(shardToPersisted(shard, meta.routineLabels));
  s.setLoadedMonthKey(meta.lastActiveMonthKey);
  s.setMonthCursor(dayjs(meta.lastActiveMonthKey + '-01').toDate());
  if (!s.selectedDate.startsWith(meta.lastActiveMonthKey)) {
    s.setSelectedDate(dayjs(meta.lastActiveMonthKey + '-01').format('YYYY-MM-DD'));
  }
  return true;
}

export type AuthState = { user: User | null; ready: boolean };

const AuthStateContext = createContext<AuthState | null>(null);

function useAuthState(): AuthState {
  const ctx = useContext(AuthStateContext);
  if (!ctx) {
    throw new Error('useAuthState must be used under AuthStateContext.Provider');
  }
  return ctx;
}

/** Firebase 사용 시 첫 onAuthStateChanged까지 ready=false — resolveInitialAuth 한 번만 듣고 끊으면 세션 복원 전 null로 고정되는 문제 방지 */
function useFirebaseAuthUser(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(() => !isFirebaseConfigured());
  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    (async () => {
      await completeGoogleRedirectIfAny();
      if (cancelled) return;
      setReady(false);
      unsub = watchAuthState((u) => {
        setUser(u);
        setReady(true);
      });
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);
  return { user, ready };
}

function usePersistState(auth: AuthState) {
  const loadState = useScrapStore((s) => s.loadSnapshot);
  const setLoadedMonthKey = useScrapStore((s) => s.setLoadedMonthKey);
  const setMonthCursor = useScrapStore((s) => s.setMonthCursor);
  const setSelectedDate = useScrapStore((s) => s.setSelectedDate);
  const { user, ready } = auth;
  const didLoadIdb = useRef(false);
  const didMergePublicOnce = useRef(false);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        logPublicBootstrapLine();
        if (!didLoadIdb.current) {
          const res = await loadSnapshot();
          if (cancelled) return;
          if (res) {
            loadState(res.snapshot);
            setLoadedMonthKey(res.monthKey);
            const mc = dayjs(`${res.monthKey}-01`).toDate();
            setMonthCursor(mc);
            const sel = useScrapStore.getState().selectedDate;
            if (!sel.startsWith(res.monthKey)) {
              setSelectedDate(dayjs(`${res.monthKey}-01`).format('YYYY-MM-DD'));
            }
          }
          didLoadIdb.current = true;
        }
        if (!isFirebaseConfigured()) {
          logPublicSkip('Firebase 미설정');
          return;
        }
        const isOwner = user !== null && isOwnerEmail(user);
        if (isOwner) {
          try {
            const ok = await pullCloudMergeIntoStore();
            if (ok && !cancelled) console.info('[클라우드] 소유자 자동 내려받기 완료');
          } catch (e) {
            console.warn('[클라우드] 내려받기 실패', e);
          }
          return;
        }
        if (!canLoadPublicScrapbook()) {
          logPublicSkip('공개 UID/URL 없음');
          return;
        }
        if (!user && !didMergePublicOnce.current) {
          const ok = await mergePublicIntoStore();
          if (cancelled) return;
          if (ok) {
            didMergePublicOnce.current = true;
            console.info('[스크랩북] 공개 일기 병합 완료');
          } else {
            logPublicSkip('공개 스냅샷 비어 있음(위 로그 참고)');
          }
        }
      } catch (error) {
        console.warn('IndexedDB 또는 공개 일기 로드 실패.', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, user, loadState, setLoadedMonthKey, setMonthCursor, setSelectedDate]);
  useEffect(() => {
    const run = () => {
      flushDirtyToIDB().catch((error) => {
        console.warn('IndexedDB incremental save skipped:', error);
      });
    };
    const t = setInterval(run, 3500);
    const onVis = () => {
      if (document.visibilityState === 'hidden') run();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
}

/** 로그아웃 시 공개 일기만 다시 로드 */
function usePublicReloadOnLogout() {
  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    let firstAuth = true;
    let prevUser: User | null = null;
    return watchAuthState((user) => {
      if (firstAuth) {
        firstAuth = false;
        prevUser = user;
        return;
      }
      const wasLoggedIn = prevUser !== null;
      prevUser = user;
      if (!wasLoggedIn || user !== null) return;
      if (!canLoadPublicScrapbook()) return;
      (async () => {
        try {
          const pub = await fetchPublicScrapbookSnapshot();
          if (pub) {
            await replaceAllShardsFromSnapshot(pub);
          } else {
            console.warn('[스크랩북] 로그아웃 후 공개 스냅샷 없음 — 로컬 임시 편집을 비우고 공개 뷰로 맞춤');
            await replaceAllShardsFromSnapshot(emptyPersistedSnapshot());
          }
          const meta = await loadMeta();
          const shard = await loadMonthShard(meta.lastActiveMonthKey);
          const s = useScrapStore.getState();
          s.loadSnapshot(shardToPersisted(shard, meta.routineLabels));
          s.setLoadedMonthKey(meta.lastActiveMonthKey);
          s.setMonthCursor(dayjs(`${meta.lastActiveMonthKey}-01`).toDate());
          if (!s.selectedDate.startsWith(meta.lastActiveMonthKey)) {
            s.setSelectedDate(dayjs(`${meta.lastActiveMonthKey}-01`).format('YYYY-MM-DD'));
          }
        } catch (e) {
          console.warn('로그아웃 후 공개 일기 복원 실패', e);
        }
      })();
    });
  }, []);
}

function Header() {
  const monthCursor = useScrapStore((s) => s.monthCursor);
  const setMonthCursor = useScrapStore((s) => s.setMonthCursor);
  const loadedMonthKey = useScrapStore((s) => s.loadedMonthKey);
  const toSnapshot = useScrapStore((s) => s.toSnapshot);
  const loadState = useScrapStore((s) => s.loadSnapshot);
  const setLoadedMonthKey = useScrapStore((s) => s.setLoadedMonthKey);
  const setSelectedDate = useScrapStore((s) => s.setSelectedDate);
  const [monthBusy, setMonthBusy] = useState(false);
  const location = useLocation();
  const { user: authUser } = useAuthState();
  const hasFirebase = isFirebaseConfigured();

  const onMonthNav = async (delta: number) => {
    if (monthBusy) return;
    setMonthBusy(true);
    try {
      const next = dayjs(monthCursor).add(delta, 'month').toDate();
      const shard = await switchMonthShard(loadedMonthKey, toSnapshot(), next);
      loadState(shard);
      setLoadedMonthKey(monthKeyFromDate(next));
      setMonthCursor(next);
      setSelectedDate(dayjs(next).format('YYYY-MM-DD'));
    } finally {
      setMonthBusy(false);
    }
  };

  const onLogoutClick = async () => {
    if (!hasFirebase) return;
    try {
      await logoutFirebase();
    } catch (e) {
      console.warn('로그아웃 실패', e);
    }
  };

  return (
    <header className="topbar" aria-label="사이트 헤더">
      <div className="topbar-row">
        <span className="topbar-brand">{headerTitle()}</span>
        <div className="topbar-month row">
          <button type="button" disabled={monthBusy} onClick={() => void onMonthNav(-1)} aria-label="이전 달">
            ◀
          </button>
          <strong>{dayjs(monthCursor).format('YYYY.MM')}</strong>
          <button type="button" disabled={monthBusy} onClick={() => void onMonthNav(1)} aria-label="다음 달">
            ▶
          </button>
        </div>
        <div className="topbar-meta">
          <nav className="topbar-links row" aria-label="화면 전환">
            <Link className={location.pathname === '/calendar' ? 'active' : ''} to="/calendar">
              달력
            </Link>
            <Link className={location.pathname === '/book' ? 'active' : ''} to="/book">
              책
            </Link>
            <Link className={location.pathname === '/settings' ? 'active' : ''} to="/settings">
              설정
            </Link>
          </nav>
          {authUser && hasFirebase ? (
            <button type="button" className="topbar-logout-link" onClick={onLogoutClick}>
              로그아웃
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function CalendarPage() {
  const isMobileLayout = useMediaQuery(MOBILE_CALENDAR_MEDIA);
  const setMonthCursor = useScrapStore((s) => s.setMonthCursor);
  const goToMonthShard = useMonthShardNav();
  const readOnly = useReadOnly();
  const pageRo = readOnly ? ' page--readonly' : '';

  useEffect(() => {
    if (!isMobileLayout) return;
    const d = useScrapStore.getState().selectedDate;
    setMonthCursor(dayjs(d).startOf('month').toDate());
    void goToMonthShard(dayjs(d).toDate());
  }, [isMobileLayout, setMonthCursor, goToMonthShard]);

  if (isMobileLayout) {
    return (
      <div className={`page page--calendar page--mobile-calendar${pageRo}`}>
        <CalendarMobileMonthScroller />
        <div className="mobile-sidebar-scroll">
          <CalendarSidebar />
        </div>
      </div>
    );
  }

  return (
    <div className={`page page--calendar${pageRo}`}>
      <div className="calendar-page-layout">
        <CalendarWeekdayHeader />
        <CalendarDateGrid />
        <CalendarSidebar />
      </div>
    </div>
  );
}

function SettingsPage() {
  const loadState = useScrapStore((s) => s.loadSnapshot);
  const routineLabels = useScrapStore((s) => s.routineLabels);
  const setRoutineLabels = useScrapStore((s) => s.setRoutineLabels);
  const [syncNote, setSyncNote] = useState('');
  const hasFirebase = useMemo(() => isFirebaseConfigured(), []);
  const [autoSync, setAutoSync] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AUTO_SYNC_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [uploadBusy, setUploadBusy] = useState(false);
  const { user: authUser } = useAuthState();

  useEffect(() => {
    if (!hasFirebase || !autoSync || !authUser || !isOwnerEmail(authUser)) return;
    let inFlight = false;
    const timer = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const full = await mergeAllMonthShardsFromIDB();
        await pushSnapshot(full);
      } catch {
        // 네트워크 단절 시 다음 주기에 재시도.
      } finally {
        inFlight = false;
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [autoSync, hasFirebase, authUser]);

  const downloadBackup = () => {
    void (async () => {
      try {
        const snapshot = await mergeAllMonthShardsFromIDB();
        const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `scrapbook-backup-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setSyncNote('백업 파일을 저장했습니다.');
      } catch (e) {
        setSyncNote(e instanceof Error ? e.message : '백업 내보내기 실패');
      }
    })();
  };

  if (!authUser) {
    return (
      <section className="settings settings--login-only">
        {!hasFirebase ? (
          <p className="settings-hint">Firebase 환경변수가 없어 Google 로그인을 쓸 수 없습니다.</p>
        ) : (
          <>
            <p className="settings-login-lead">
              소유자({OWNER_EMAIL})만 편집할 수 있어용 일기쓰고 싶으면 문의주세요~
            </p>
            <button
              type="button"
              className="settings-backup-btn settings-google-login-btn settings-login-main-btn"
              onClick={async () => {
                try {
                  const user = await loginWithGoogle();
                  if (user) {
                    setSyncNote(`${user.displayName ?? user.email} 로그인됨`);
                  } else {
                    setSyncNote('Google 로그인 화면으로 이동 중…');
                  }
                } catch (e) {
                  setSyncNote(e instanceof Error ? e.message : '로그인 실패');
                }
              }}
            >
              Google 로그인
            </button>
          </>
        )}
        {syncNote ? <p className="settings-sync-note">{syncNote}</p> : null}
      </section>
    );
  }

  if (!isOwnerEmail(authUser)) {
    return (
      <section className="settings">
        <p className="settings-hint settings-hint--ok settings-account-line">{formatAccountLabel(authUser)}</p>
        <p className="settings-hint">
          편집·업로드·동기화는 소유자({OWNER_EMAIL})만 가능합니다. 지금은 공개 일기 보기만 됩니다.
        </p>
        <div className="settings-backup-row">
          <button type="button" className="settings-backup-btn" onClick={downloadBackup}>
            화면 내용 백업 내보내기
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="settings">
      <h3>루틴 이름 (3개 고정)</h3>
      <p className="settings-hint">달력에서 점·버튼에 쓰이는 이름입니다. 비우면 기본값으로 돌아갑니다.</p>
      <div className="settings-routine-grid">
        {routineLabels.map((label, idx) => (
          <label key={idx} className="settings-routine-field">
            <span>루틴 {idx + 1}</span>
            <input
              type="text"
              value={label}
              maxLength={20}
              onChange={(e) => {
                const next: [string, string, string] = [...routineLabels] as [string, string, string];
                next[idx] = e.target.value;
                setRoutineLabels(next);
              }}
            />
          </label>
        ))}
      </div>
      <h3>데이터</h3>
      <p className="settings-hint">JSON 파일로 전체 데이터를 내보내거나, 같은 형식으로 가져올 수 있습니다.</p>
      <div className="settings-backup-row">
        <button type="button" className="settings-backup-btn" onClick={downloadBackup}>
          백업 내보내기
        </button>
        <label className="settings-backup-btn file-upload settings-backup-import">
          백업 가져오기
          <input
            type="file"
            accept=".json,application/json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const text = await file.text();
                const imported = await importSnapshot(text);
                loadState(imported);
                const meta = await loadMeta();
                const st = useScrapStore.getState();
                st.setLoadedMonthKey(meta.lastActiveMonthKey);
                st.setMonthCursor(dayjs(`${meta.lastActiveMonthKey}-01`).toDate());
                setSyncNote('백업을 불러와 반영했습니다.');
              } catch (err) {
                setSyncNote(err instanceof Error ? err.message : '가져오기 실패');
              } finally {
                e.currentTarget.value = '';
              }
            }}
          />
        </label>
      </div>
      <h3>동기화(Firebase)</h3>
      {!hasFirebase ? (
        <p className="settings-hint">환경변수가 없어서 클라우드 동기화를 쓸 수 없습니다.</p>
      ) : (
        <>
          <p className="settings-hint settings-hint--ok settings-account-line">{formatAccountLabel(authUser)}</p>
          <div className="settings-firebase-actions">
            <div className="settings-firebase-row">
              <button
                type="button"
                className="settings-backup-btn"
                disabled={uploadBusy}
                onClick={async () => {
                  if (uploadBusy) return;
                  setUploadBusy(true);
                  try {
                    const full = await mergeAllMonthShardsFromIDB();
                    await pushSnapshot(full);
                    setSyncNote('클라우드로 업로드 완료');
                  } catch (e) {
                    setSyncNote(e instanceof Error ? e.message : '업로드 실패');
                  } finally {
                    setUploadBusy(false);
                  }
                }}
              >
                {uploadBusy ? '업로드 중…' : '업로드'}
              </button>
              <button
                type="button"
                className="settings-backup-btn"
                onClick={async () => {
                  try {
                    const ok = await pullCloudMergeIntoStore();
                    setSyncNote(
                      ok ? '클라우드 병합 완료(최신 수정 우선)' : '클라우드에 저장된 데이터가 없습니다.',
                    );
                  } catch (e) {
                    setSyncNote(e instanceof Error ? e.message : '내려받기 실패');
                  }
                }}
              >
                내려받기
              </button>
            </div>
            <label className="settings-auto-sync">
              <input
                type="checkbox"
                checked={autoSync}
                onChange={(e) => {
                  const on = e.target.checked;
                  setAutoSync(on);
                  try {
                    localStorage.setItem(AUTO_SYNC_STORAGE_KEY, on ? '1' : '0');
                  } catch {
                    // ignore
                  }
                }}
              />
              자동 동기화(10초마다 업로드)
            </label>
          </div>
        </>
      )}
      {syncNote ? <p className="settings-sync-note">{syncNote}</p> : null}
    </section>
  );
}

function AppShell() {
  const { user: authUser } = useAuthState();
  const readOnly = Boolean(
    isFirebaseConfigured() && (!authUser || !isOwnerEmail(authUser)),
  );

  return (
    <ReadOnlyProvider value={readOnly}>
      <Header />
      <Routes>
        <Route path="/" element={<Navigate to="/calendar" replace />} />
        <Route path="/m" element={<Navigate to="/calendar" replace />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/book" element={<BookView />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </ReadOnlyProvider>
  );
}

export function App() {
  const auth = useFirebaseAuthUser();
  usePersistState(auth);
  usePublicReloadOnLogout();

  return (
    <AuthStateContext.Provider value={auth}>
      <div className="app">
        <AppShell />
      </div>
    </AuthStateContext.Provider>
  );
}
