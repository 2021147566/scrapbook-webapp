import dayjs from 'dayjs';
import 'dayjs/locale/en';
import 'dayjs/locale/ko';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { CalendarDateGrid, CalendarWeekdayHeader } from '../features/calendar/CalendarView';
import { CropModal } from '../features/crop/CropModal';
import { BookView } from '../features/book/BookView';
import { importSnapshot, loadSnapshot, saveSnapshot } from '../lib/storage/indexeddb';
import {
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
import { effectiveRoutineLabels, normalizeRoutineLabels } from '../types';

const EMPTY_IMAGES: ScrapImage[] = [];

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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function Header() {
  const monthCursor = useScrapStore((s) => s.monthCursor);
  const setMonthCursor = useScrapStore((s) => s.setMonthCursor);
  const selectedDate = useScrapStore((s) => s.selectedDate);
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
          {location.pathname === '/calendar' ? (
            <span className="topbar-today" title={dayjs().format('YYYY-MM-DD')}>
              오늘 {dayjs().locale('ko').format('M/D ddd')}
            </span>
          ) : null}
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
          {location.pathname !== '/calendar' ? (
            <span className="topbar-date" title={selectedDate}>
              {dayjs(selectedDate).locale('en').format('MMM D, YYYY')}
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function CalendarPage() {
  const monthCursor = useScrapStore((s) => s.monthCursor);
  const selectedDate = useScrapStore((s) => s.selectedDate);
  const imagesByDate = useScrapStore((s) => s.imagesByDate);
  const routineByDate = useScrapStore((s) => s.routineByDate);
  const addImage = useScrapStore((s) => s.addImage);
  const removeImage = useScrapStore((s) => s.removeImage);
  const moveImage = useScrapStore((s) => s.moveImage);
  const setImageTitle = useScrapStore((s) => s.setImageTitle);
  const toggleRoutine = useScrapStore((s) => s.toggleRoutine);
  const routineLabels = useScrapStore((s) => s.routineLabels);
  const [pending, setPending] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const images = imagesByDate[selectedDate] ?? EMPTY_IMAGES;
  const routines = routineByDate[selectedDate] ?? [false, false, false];
  const labelDisplay = effectiveRoutineLabels(routineLabels);

  const monthRoutineCounts = useMemo(() => {
    const start = dayjs(monthCursor).startOf('month');
    const daysInMonth = start.daysInMonth();
    const counts = [0, 0, 0];
    for (let d = 1; d <= daysInMonth; d++) {
      const key = start.date(d).format('YYYY-MM-DD');
      const r = routineByDate[key] ?? [false, false, false];
      for (let i = 0; i < 3; i++) {
        if (r[i]) counts[i] += 1;
      }
    }
    return { counts, daysInMonth };
  }, [monthCursor, routineByDate]);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const dataUrl = await readFileAsDataUrl(files[0]);
    setPending(dataUrl);
  };

  useEffect(() => {
    const onPaste = async (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
      if (!file) return;
      const dataUrl = await readFileAsDataUrl(file);
      setPending(dataUrl);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  return (
    <div className="page page--calendar">
      <div className="calendar-page-layout">
        <CalendarWeekdayHeader />
        <CalendarDateGrid />
        <aside className="calendar-sidebar" aria-label="선택 날짜·업로드·루틴">
          <div className="calendar-sidebar-card calendar-sidebar-datecard">
            <span className="calendar-sidebar-date-label">선택한 날</span>
            <time className="calendar-sidebar-date-main" dateTime={selectedDate}>
              {dayjs(selectedDate).locale('ko').format('M월 D일 ddd')}
            </time>
            <span className="calendar-sidebar-date-sub">
              {dayjs(selectedDate).locale('en').format('MMM D, YYYY')}
            </span>
          </div>

          <div className="calendar-sidebar-card calendar-sidebar-upload">
            <strong>사진 추가</strong>
            <small>Ctrl+V 붙여넣기</small>
            <button type="button" className="calendar-sidebar-upload-btn" onClick={() => fileInputRef.current?.click()}>
              이미지 선택
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                onFiles(e.target.files);
                e.currentTarget.value = '';
              }}
            />
          </div>

          <div className="calendar-sidebar-card calendar-sidebar-routine">
            <span className="calendar-sidebar-section-title">이 날 루틴</span>
            <div className="calendar-sidebar-routine-btns">
              {labelDisplay.map((label, idx) => (
                <button
                  key={`${idx}-${label}`}
                  type="button"
                  className={
                    routines[idx]
                      ? `routine-btn routine-btn--sidebar active dot-${idx + 1}`
                      : `routine-btn routine-btn--sidebar dot-${idx + 1}`
                  }
                  onClick={() => toggleRoutine(selectedDate, idx)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="calendar-sidebar-card calendar-sidebar-stats">
            <span className="calendar-sidebar-section-title">
              {dayjs(monthCursor).locale('ko').format('M월')} 루틴
            </span>
            <p className="calendar-sidebar-stats-hint">이번 달 완료한 날 수</p>
            <ul className="calendar-sidebar-stats-list">
              {labelDisplay.map((label, idx) => {
                const n = monthRoutineCounts.counts[idx];
                const max = monthRoutineCounts.daysInMonth;
                const pct = max ? Math.round((n / max) * 100) : 0;
                return (
                  <li key={label} className="calendar-sidebar-stat-row">
                    <span className={`calendar-sidebar-stat-name dot-${idx + 1}`}>{label}</span>
                    <span className="calendar-sidebar-stat-count">
                      {n}/{max}일
                    </span>
                    <span className="calendar-sidebar-stat-bar" aria-hidden>
                      <span className="calendar-sidebar-stat-bar-fill" style={{ width: `${pct}%` }} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>
      </div>
      <section className="selected-images">
        <h3>{selectedDate} 사진</h3>
        <div className="selected-grid">
          {images.map((img, index) => (
            <article
              key={img.id}
              className="image-card"
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragEnd={() => setDragIndex(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex === null) return;
                moveImage(selectedDate, dragIndex, index);
                setDragIndex(null);
              }}
            >
              <img src={img.dataUrl} alt="" />
              <input
                className="image-title-input"
                value={img.title ?? ''}
                onChange={(e) => setImageTitle(selectedDate, img.id, e.target.value)}
                placeholder="사진 이름"
              />
              <div className="image-card-actions">
                <button onClick={() => removeImage(selectedDate, img.id)}>삭제</button>
                <button disabled={index === 0} onClick={() => moveImage(selectedDate, index, 0)}>
                  대표
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
      {pending ? (
        <CropModal
          src={pending}
          onClose={() => setPending(null)}
          onSave={(dataUrl) => {
            addImage(selectedDate, dataUrl);
            setPending(null);
          }}
        />
      ) : null}
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
            const user = await loginWithGoogle();
            setStatus(`${user.displayName ?? user.email} 로그인`);
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
  return (
    <div className="app">
      <Header />
      <Routes>
        <Route path="/" element={<Navigate to="/calendar" replace />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/book" element={<BookView />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </div>
  );
}
