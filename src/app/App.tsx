import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { CalendarView } from '../features/calendar/CalendarView';
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

  return {
    updatedAt: Math.max(local.updatedAt ?? 0, cloud.updatedAt ?? 0, Date.now()),
    imagesByDate,
    diaryByDate,
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
      <h1>Scrapbook</h1>
      <div className="row">
        <button onClick={() => setMonthCursor(dayjs(monthCursor).subtract(1, 'month').toDate())}>◀</button>
        <strong>{dayjs(monthCursor).format('YYYY MMMM')}</strong>
        <button onClick={() => setMonthCursor(dayjs(monthCursor).add(1, 'month').toDate())}>▶</button>
      </div>
      <div className="row">
        <Link className={location.pathname === '/calendar' ? 'active' : ''} to="/calendar">
          달력 모드
        </Link>
        <Link className={location.pathname === '/book' ? 'active' : ''} to="/book">
          책 모드
        </Link>
        <Link className={location.pathname === '/settings' ? 'active' : ''} to="/settings">
          설정
        </Link>
      </div>
      <small>선택 날짜: {selectedDate}</small>
    </header>
  );
}

function CalendarPage() {
  const selectedDate = useScrapStore((s) => s.selectedDate);
  const imagesByDate = useScrapStore((s) => s.imagesByDate);
  const addImage = useScrapStore((s) => s.addImage);
  const removeImage = useScrapStore((s) => s.removeImage);
  const moveImage = useScrapStore((s) => s.moveImage);
  const [pending, setPending] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const images = imagesByDate[selectedDate] ?? EMPTY_IMAGES;

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
    <div className="page">
      <section className="toolbar">
        <label className="file-upload">
          사진 업로드
          <input type="file" accept="image/*" onChange={(e) => onFiles(e.target.files)} />
        </label>
        <small>Ctrl+V로 이미지 붙여넣기 가능</small>
      </section>
      <CalendarView />
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
              <img src={img.dataUrl} alt="" className="stamp-clip" />
              <div className="image-card-actions">
                <button onClick={() => removeImage(selectedDate, img.id)}>삭제</button>
                <button disabled={index === 0} onClick={() => moveImage(selectedDate, index, 0)}>
                  대표로
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
