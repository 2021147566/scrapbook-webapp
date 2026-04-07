import dayjs from 'dayjs';
import 'dayjs/locale/en';
import 'dayjs/locale/ko';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { CalendarDateGrid, CalendarWeekGrid, CalendarWeekdayHeader } from '../features/calendar/CalendarView';
import { CalendarSidebar } from '../features/calendar/CalendarSidebar';
import { BookView } from '../features/book/BookView';
import { importSnapshot, loadSnapshot, saveSnapshot } from '../lib/storage/indexeddb';
import type { User } from 'firebase/auth';
import {
  canLoadGuestDefault,
  fetchGuestDefaultSnapshot,
  getCurrentUser,
  isFirebaseConfigured,
  loginWithGoogle,
  logoutFirebase,
  pullSnapshot,
  pushSnapshot,
  resolveInitialAuth,
  watchAuthState,
} from '../lib/sync/firebaseSync';
import { useScrapStore } from '../store/scrapStore';
import type { PersistedSnapshot, ScrapImage } from '../types';
import { normalizeRoutineLabels } from '../types';

/** 비로그인 기본 일기(의서) 표시용 — UI 문구 */
const GUEST_OWNER_EMAIL = 'euiseo0531303@gmail.com';

/** 달력 그리드·사이드바와 동일 기준 (styles.css) */
const MOBILE_CALENDAR_MEDIA = '(max-width: 960px)';

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    setMatches(mq.matches);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

function mergeSnapshots(local: PersistedSnapshot, cloud: PersistedSnapshot): PersistedSnapshot {
  const imagesByDate: PersistedSnapshot['imagesByDate'] = { ...local.imagesByDate };
  for (const [date, images] of Object.entries(cloud.imagesByDate)) {
    const merged = new Map<string, ScrapImage>();
    for (const image of imagesByDate[date] ?? []) merged.set(image.id, image);
    for (const image of images) {
      const prev = merged.get(image.id);
      if (!prev || prev.updatedAt < image.updatedAt) merged.set(image.id, image);
    }
    imagesByDate[date] = Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  const diaryByDate = { ...local.diaryByDate };
  for (const [date, entry] of Object.entries(cloud.diaryByDate)) {
    const prev = diaryByDate[date];
    if (!prev || prev.updatedAt < entry.updatedAt) diaryByDate[date] = entry;
  }

  const routineByDate = { ...local.routineByDate };
  for (const [date, routines] of Object.entries(cloud.routineByDate ?? {})) {
    const prev = routineByDate[date] ?? [false, false, false];
    routineByDate[date] = [
      Boolean(prev[0] || routines?.[0]),
      Boolean(prev[1] || routines?.[1]),
      Boolean(prev[2] || routines?.[2]),
    ];
  }

  const hasCloudLabels = Array.isArray(cloud.routineLabels) && cloud.routineLabels.length === 3;
  const hasLocalLabels = Array.isArray(local.routineLabels) && local.routineLabels.length === 3;
  const routineLabels = !hasCloudLabels
    ? normalizeRoutineLabels(local.routineLabels)
    : !hasLocalLabels
      ? normalizeRoutineLabels(cloud.routineLabels)
      : (cloud.updatedAt ?? 0) >= (local.updatedAt ?? 0)
        ? normalizeRoutineLabels(cloud.routineLabels)
        : normalizeRoutineLabels(local.routineLabels);

  return {
    updatedAt: Math.max(local.updatedAt ?? 0, cloud.updatedAt ?? 0, Date.now()),
    imagesByDate,
    diaryByDate,
    routineByDate,
    routineLabels: [...routineLabels],
  };
}

/** 로그인 시 상단 제목: 구글 표시 이름, 없으면 이메일 @ 앞 */
function diaryTitleForUser(user: User | null): string {
  if (!user) return '의서의 일기';
  const name = user.displayName?.trim();
  if (name) return `${name}의 일기`;
  const local = (user.email ?? '').split('@')[0]?.trim();
  if (local) return `${local}의 일기`;
  return '내 일기';
}

function useFirebaseAuthUser(): User | null {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    return watchAuthState(setUser);
  }, []);
  return user;
}

function usePersistState() {
  const toSnapshot = useScrapStore((s) => s.toSnapshot);
  const loadState = useScrapStore((s) => s.loadSnapshot);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await resolveInitialAuth();
        if (cancelled) return;
        const snapshot = await loadSnapshot();
        if (cancelled) return;
        if (snapshot) loadState(snapshot);
        if (!isFirebaseConfigured() || !canLoadGuestDefault()) return;
        if (user) return;
        const guest = await fetchGuestDefaultSnapshot();
        if (!guest || cancelled) return;
        loadState(mergeSnapshots(useScrapStore.getState().toSnapshot(), guest));
      } catch (error) {
        console.warn('IndexedDB 또는 게스트 일기 로드 실패.', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadState]);
  useEffect(() => {
    const t = setInterval(() => {
      saveSnapshot(toSnapshot()).catch((error) => {
        console.warn('IndexedDB save skipped:', error);
      });
    }, 1500);
    return () => clearInterval(t);
  }, [toSnapshot]);
}

function Header() {
  const monthCursor = useScrapStore((s) => s.monthCursor);
  const setMonthCursor = useScrapStore((s) => s.setMonthCursor);
  const location = useLocation();
  const authUser = useFirebaseAuthUser();
  return (
    <header className="topbar">
      <div className="topbar-row">
        <div className="topbar-month row">
          <button type="button" onClick={() => setMonthCursor(dayjs(monthCursor).subtract(1, 'month').toDate())}>
            ◀
          </button>
          <strong>{dayjs(monthCursor).locale('en').format('YYYY MMMM')}</strong>
          <button type="button" onClick={() => setMonthCursor(dayjs(monthCursor).add(1, 'month').toDate())}>
            ▶
          </button>
        </div>
        <div className="topbar-meta">
          <span className="topbar-today" title={dayjs().format('YYYY-MM-DD')}>
            오늘 {dayjs().locale('ko').format('M/D ddd')}
          </span>
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
        </div>
      </div>
      <div className="topbar-guest-row" aria-label="일기 주인">
        <span className="topbar-guest-title">{diaryTitleForUser(authUser)}</span>
        {!authUser ? (
          <Link className="topbar-guest-cta" to="/settings">
            나도 일기 쓰기
          </Link>
        ) : null}
      </div>
    </header>
  );
}

/** 좁은 화면 달력 본문 상단: 이번 주만 (전역 헤더에 월 이동 숨김은 CSS) */
function CalendarWeekStrip() {
  const weekCursor = useScrapStore((s) => s.weekCursor);
  const setWeekCursor = useScrapStore((s) => s.setWeekCursor);
  const setMonthCursor = useScrapStore((s) => s.setMonthCursor);
  const setSelectedDate = useScrapStore((s) => s.setSelectedDate);

  const weekStart = dayjs(weekCursor).day(0);
  const weekEnd = weekStart.add(6, 'day');
  const rangeLabel = `${weekStart.locale('ko').format('M/D')} – ${weekEnd.locale('ko').format('M/D')}`;

  const shiftWeek = (delta: number) => {
    const nextWeekStart = dayjs(weekCursor).add(delta, 'week').day(0);
    setWeekCursor(nextWeekStart.toDate());
    setMonthCursor(nextWeekStart.startOf('month').toDate());
    setSelectedDate(nextWeekStart.format('YYYY-MM-DD'));
  };

  const goToday = () => {
    const t = dayjs();
    const sun = t.day(0);
    setWeekCursor(sun.toDate());
    setMonthCursor(t.startOf('month').toDate());
    setSelectedDate(t.format('YYYY-MM-DD'));
  };

  return (
    <div className="calendar-week-strip">
      <div className="mobile-week-nav">
        <button type="button" className="mobile-week-btn" onClick={() => shiftWeek(-1)} aria-label="이전 주">
          ◀
        </button>
        <div className="mobile-week-range">
          <strong>{rangeLabel}</strong>
          <span className="mobile-week-sub">{weekStart.locale('ko').format('YYYY년')}</span>
        </div>
        <button type="button" className="mobile-week-btn" onClick={() => shiftWeek(1)} aria-label="다음 주">
          ▶
        </button>
        <button type="button" className="mobile-today-btn" onClick={goToday}>
          오늘
        </button>
      </div>
    </div>
  );
}

function CalendarPage() {
  const isMobileLayout = useMediaQuery(MOBILE_CALENDAR_MEDIA);
  const setWeekCursor = useScrapStore((s) => s.setWeekCursor);
  const setMonthCursor = useScrapStore((s) => s.setMonthCursor);

  useEffect(() => {
    if (!isMobileLayout) return;
    const d = useScrapStore.getState().selectedDate;
    const w = dayjs(d).day(0).toDate();
    setWeekCursor(w);
    setMonthCursor(dayjs(d).startOf('month').toDate());
  }, [isMobileLayout, setWeekCursor, setMonthCursor]);

  if (isMobileLayout) {
    return (
      <div className="page page--calendar page--mobile-calendar">
        <CalendarWeekStrip />
        <div className="mobile-week-calendar-block">
          <CalendarWeekdayHeader />
          <CalendarWeekGrid />
        </div>
        <div className="mobile-sidebar-scroll">
          <CalendarSidebar />
        </div>
      </div>
    );
  }

  return (
    <div className="page page--calendar">
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
  const toSnapshot = useScrapStore((s) => s.toSnapshot);
  const routineLabels = useScrapStore((s) => s.routineLabels);
  const setRoutineLabels = useScrapStore((s) => s.setRoutineLabels);
  const [syncNote, setSyncNote] = useState('');
  const hasFirebase = useMemo(() => isFirebaseConfigured(), []);
  const [autoSync, setAutoSync] = useState(false);
  const authUser = useFirebaseAuthUser();

  useEffect(() => {
    if (!hasFirebase || !autoSync || !getCurrentUser()) return;
    const timer = setInterval(async () => {
      try {
        await pushSnapshot(toSnapshot());
      } catch {
        // 네트워크 단절 시 다음 주기에 재시도.
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [autoSync, hasFirebase, toSnapshot]);

  const downloadBackup = () => {
    const snapshot = toSnapshot();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scrapbook-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setSyncNote('백업 파일을 저장했습니다.');
  };

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
        <p className="settings-hint">환경변수가 없어서 로컬·백업만 사용 중입니다.</p>
      ) : (
        <>
          {!authUser && canLoadGuestDefault() ? (
            <p className="settings-hint">
              비로그인 시 <strong>{GUEST_OWNER_EMAIL}</strong> 님의 공개 일기가 기본으로 합쳐져 보여요. 나만의 일기를 쓰려면 아래에서
              Google로 로그인하세요.
            </p>
          ) : null}
          {!authUser && !canLoadGuestDefault() ? (
            <p className="settings-hint">Google 로그인 후 클라우드에 올리고 다른 기기와 맞출 수 있어요.</p>
          ) : null}
          {authUser ? (
            <p className="settings-hint settings-hint--ok">
              <strong>{authUser.displayName ?? authUser.email}</strong> 로그인 중
            </p>
          ) : null}
          <div className="settings-firebase-actions">
            {!authUser ? (
              <button
                type="button"
                className="settings-backup-btn settings-google-login-btn"
                disabled={!hasFirebase}
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
            ) : (
              <>
                <div className="settings-firebase-row">
                  <button
                    type="button"
                    className="settings-backup-btn"
                    onClick={async () => {
                      try {
                        await pushSnapshot(toSnapshot());
                        setSyncNote('클라우드로 업로드 완료');
                      } catch (e) {
                        setSyncNote(e instanceof Error ? e.message : '업로드 실패');
                      }
                    }}
                  >
                    업로드
                  </button>
                  <button
                    type="button"
                    className="settings-backup-btn"
                    onClick={async () => {
                      try {
                        const cloud = await pullSnapshot();
                        if (cloud) {
                          const merged = mergeSnapshots(toSnapshot(), cloud);
                          loadState(merged);
                          setSyncNote('클라우드 병합 완료(최신 수정 우선)');
                        } else {
                          setSyncNote('클라우드에 저장된 데이터가 없습니다.');
                        }
                      } catch (e) {
                        setSyncNote(e instanceof Error ? e.message : '내려받기 실패');
                      }
                    }}
                  >
                    내려받기
                  </button>
                </div>
                <button
                  type="button"
                  className="settings-backup-btn settings-firebase-logout"
                  onClick={async () => {
                    try {
                      await logoutFirebase();
                      setSyncNote('로그아웃했습니다.');
                    } catch (e) {
                      setSyncNote(e instanceof Error ? e.message : '로그아웃 실패');
                    }
                  }}
                >
                  로그아웃
                </button>
                <label className="settings-auto-sync">
                  <input type="checkbox" checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} />
                  자동 동기화(10초마다 업로드)
                </label>
              </>
            )}
          </div>
        </>
      )}
      {syncNote ? <p className="settings-sync-note">{syncNote}</p> : null}
    </section>
  );
}

export function App() {
  usePersistState();

  return (
    <div className="app">
      <Header />
      <Routes>
        <Route path="/" element={<Navigate to="/calendar" replace />} />
        <Route path="/m" element={<Navigate to="/calendar" replace />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/book" element={<BookView />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </div>
  );
}
