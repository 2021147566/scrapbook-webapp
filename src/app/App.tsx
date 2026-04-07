import dayjs from 'dayjs';
import 'dayjs/locale/en';
import 'dayjs/locale/ko';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { CalendarDateGrid, CalendarWeekGrid, CalendarWeekdayHeader } from '../features/calendar/CalendarView';
import { CalendarSidebar } from '../features/calendar/CalendarSidebar';
import { BookView } from '../features/book/BookView';
import { importSnapshot, loadSnapshot, saveSnapshot } from '../lib/storage/indexeddb';
import {
  completeGoogleRedirectIfAny,
  getCurrentUser,
  isFirebaseConfigured,
  loginWithGoogle,
  logoutFirebase,
  pullSnapshot,
  pushSnapshot,
  watchAuthState,
} from '../lib/sync/firebaseSync';
import { useScrapStore } from '../store/scrapStore';
import type { PersistedSnapshot, ScrapImage } from '../types';
import { normalizeRoutineLabels } from '../types';

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

function usePersistState() {
  const toSnapshot = useScrapStore((s) => s.toSnapshot);
  const loadState = useScrapStore((s) => s.loadSnapshot);
  useEffect(() => {
    loadSnapshot()
      .then((snapshot) => {
        if (snapshot) loadState(snapshot);
      })
      .catch((error) => {
        console.warn('IndexedDB load failed, fallback to memory state.', error);
      });
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
            <Link className={location.pathname === '/m' ? 'active' : ''} to="/m">
              모바일
            </Link>
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
    </header>
  );
}

function CalendarPage() {
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

function MobileWeekTopbar() {
  const weekCursor = useScrapStore((s) => s.weekCursor);
  const setWeekCursor = useScrapStore((s) => s.setWeekCursor);
  const setMonthCursor = useScrapStore((s) => s.setMonthCursor);
  const setSelectedDate = useScrapStore((s) => s.setSelectedDate);
  const location = useLocation();

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
    <header className="mobile-topbar">
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
      <nav className="mobile-topbar-links" aria-label="화면 전환">
        <Link className={location.pathname === '/m' ? 'active' : ''} to="/m">
          주간
        </Link>
        <Link to="/calendar">달력</Link>
        <Link to="/book">책</Link>
        <Link to="/settings">설정</Link>
      </nav>
    </header>
  );
}

function MobileCalendarPage() {
  const setWeekCursor = useScrapStore((s) => s.setWeekCursor);
  const setMonthCursor = useScrapStore((s) => s.setMonthCursor);

  useEffect(() => {
    const d = useScrapStore.getState().selectedDate;
    const w = dayjs(d).day(0).toDate();
    setWeekCursor(w);
    setMonthCursor(dayjs(d).startOf('month').toDate());
  }, [setWeekCursor, setMonthCursor]);

  return (
    <div className="page page--mobile-calendar">
      <MobileWeekTopbar />
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

function SettingsPage() {
  const loadState = useScrapStore((s) => s.loadSnapshot);
  const toSnapshot = useScrapStore((s) => s.toSnapshot);
  const routineLabels = useScrapStore((s) => s.routineLabels);
  const setRoutineLabels = useScrapStore((s) => s.setRoutineLabels);
  const [status, setStatus] = useState('로컬 모드');
  const hasFirebase = useMemo(() => isFirebaseConfigured(), []);
  const [autoSync, setAutoSync] = useState(false);

  useEffect(() => {
    if (!hasFirebase) return;
    return watchAuthState((user) => {
      setStatus(user ? `${user.displayName ?? user.email} 로그인` : '로그아웃 상태');
    });
  }, [hasFirebase]);

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

  const downloadBackup = async () => {
    const snapshot = toSnapshot();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scrapbook-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
      <div className="row">
        <button onClick={downloadBackup}>백업 내보내기</button>
        <label className="file-upload">
          백업 가져오기
          <input
            type="file"
            accept=".json,application/json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const text = await file.text();
              const imported = await importSnapshot(text);
              loadState(imported);
            }}
          />
        </label>
      </div>
      <h3>동기화(Firebase)</h3>
      <p>{hasFirebase ? '환경변수 감지됨' : '환경변수가 없어서 로컬 모드만 사용 중'}</p>
      <div className="row">
        <button
          disabled={!hasFirebase}
          onClick={async () => {
            try {
              const user = await loginWithGoogle();
              if (user) {
                setStatus(`${user.displayName ?? user.email} 로그인`);
              } else {
                setStatus('Google 로그인 화면으로 이동 중…');
              }
            } catch (e) {
              setStatus(e instanceof Error ? e.message : '로그인 실패');
            }
          }}
        >
          Google 로그인
        </button>
        <button
          disabled={!hasFirebase}
          onClick={async () => {
            await pushSnapshot(toSnapshot());
            setStatus('클라우드로 업로드 완료');
          }}
        >
          업로드
        </button>
        <button
          disabled={!hasFirebase}
          onClick={async () => {
            const cloud = await pullSnapshot();
            if (cloud) {
              const merged = mergeSnapshots(toSnapshot(), cloud);
              loadState(merged);
              setStatus('클라우드 병합 완료(최신 수정 우선)');
            }
          }}
        >
          내려받기
        </button>
        <button
          disabled={!hasFirebase || !getCurrentUser()}
          onClick={async () => {
            await logoutFirebase();
            setStatus('로그아웃 완료');
          }}
        >
          로그아웃
        </button>
      </div>
      <label className="row" style={{ marginTop: 8 }}>
        <input type="checkbox" checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} />
        자동 동기화(10초마다 업로드)
      </label>
      <p>{status}</p>
    </section>
  );
}

export function App() {
  usePersistState();
  const location = useLocation();
  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    void completeGoogleRedirectIfAny();
  }, []);

  return (
    <div className="app">
      {location.pathname !== '/m' ? <Header /> : null}
      <Routes>
        <Route path="/" element={<Navigate to="/calendar" replace />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/m" element={<MobileCalendarPage />} />
        <Route path="/book" element={<BookView />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </div>
  );
}
