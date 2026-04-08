import dayjs from 'dayjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CropModal } from '../crop/CropModal';
import { useReadOnly } from '../../context/ReadOnlyContext';
import { useFirebaseAuthUser } from '../../hooks/useFirebaseAuthUser';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { compressDataUrlForScrap } from '../../lib/imageCompress';
import { isFirebaseConfigured } from '../../lib/sync/firebaseSync';
import { readFileAsDataUrl } from '../../lib/readFile';
import { useScrapStore } from '../../store/scrapStore';
import type { ScrapImage } from '../../types';
import { effectiveRoutineLabels } from '../../types';

const EMPTY_IMAGES: ScrapImage[] = [];

const MOBILE_CALENDAR_MEDIA = '(max-width: 960px)';

export function CalendarSidebar() {
  const readOnly = useReadOnly();
  const isMobileCalendar = useMediaQuery(MOBILE_CALENDAR_MEDIA);
  const hideRoutineForGuestMobile = readOnly && isMobileCalendar;
  const authUser = useFirebaseAuthUser();
  const showPhotoAdd = !isFirebaseConfigured() || authUser != null;
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
  const [uploading, setUploading] = useState(false);
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
    if (readOnly || !showPhotoAdd) return;
    const onPaste = async (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
      if (!file) return;
      const dataUrl = await readFileAsDataUrl(file);
      setPending(dataUrl);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [readOnly, showPhotoAdd]);

  return (
    <>
      <aside className={`calendar-sidebar${readOnly ? ' calendar-sidebar--readonly' : ''}`} aria-label="선택 날짜·업로드·루틴·사진">
        {!isMobileCalendar ? (
          <div className="calendar-sidebar-card calendar-sidebar-datecard">
            <span className="calendar-sidebar-date-label">선택한 날</span>
            <time className="calendar-sidebar-date-main" dateTime={selectedDate}>
              {dayjs(selectedDate).locale('ko').format('M월 D일 ddd')}
            </time>
            <span className="calendar-sidebar-date-sub">
              {dayjs(selectedDate).locale('en').format('MMM D, YYYY')}
            </span>
          </div>
        ) : null}

        {showPhotoAdd ? (
          <div className="calendar-sidebar-card calendar-sidebar-upload">
            <div className="calendar-sidebar-upload-head">
              <strong>사진 추가</strong>
              <small>{readOnly ? '보기 전용' : 'Ctrl+V 붙여넣기'}</small>
            </div>
            <button
              type="button"
              className="calendar-sidebar-upload-btn"
              disabled={readOnly}
              onClick={() => fileInputRef.current?.click()}
            >
              이미지 선택
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              disabled={readOnly}
              onChange={(e) => {
                onFiles(e.target.files);
                e.currentTarget.value = '';
              }}
            />
          </div>
        ) : null}

        {!hideRoutineForGuestMobile ? (
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
                  disabled={readOnly}
                  onClick={() => {
                    if (!readOnly) toggleRoutine(selectedDate, idx);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {!hideRoutineForGuestMobile ? (
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
        ) : null}

        <div className="calendar-sidebar-card calendar-sidebar-selected">
          <h3 className="calendar-sidebar-section-title">이 날 사진</h3>
          <div className="selected-grid selected-grid--sidebar">
            {images.map((img, index) => (
              <article
                key={img.id}
                className="image-card"
                draggable={!readOnly}
                onDragStart={() => {
                  if (!readOnly) setDragIndex(index);
                }}
                onDragEnd={() => setDragIndex(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (readOnly || dragIndex === null) return;
                  moveImage(selectedDate, dragIndex, index);
                  setDragIndex(null);
                }}
              >
                <img src={img.dataUrl} alt="" />
                {readOnly ? (
                  img.title?.trim() ? (
                    <p className="image-title-guest">{img.title}</p>
                  ) : null
                ) : (
                  <textarea
                    className="image-title-input"
                    value={img.title ?? ''}
                    rows={2}
                    onChange={(e) => setImageTitle(selectedDate, img.id, e.target.value)}
                    placeholder="사진 밑 글 (Enter로 줄 바꿈)"
                  />
                )}
                {!readOnly ? (
                  <div className="image-card-actions">
                    <button type="button" onClick={() => removeImage(selectedDate, img.id)}>
                      삭제
                    </button>
                    <button type="button" disabled={index === 0} onClick={() => moveImage(selectedDate, index, 0)}>
                      대표
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
          {images.length === 0 ? <p className="calendar-sidebar-empty-photos">아직 사진이 없어요.</p> : null}
        </div>
      </aside>
      {!readOnly && showPhotoAdd && pending ? (
        <CropModal
          src={pending}
          onClose={() => {
            if (!uploading) setPending(null);
          }}
          onSave={async (dataUrl) => {
            setUploading(true);
            try {
              const optimized = isMobileCalendar
                ? await compressDataUrlForScrap(dataUrl, { maxLongEdge: 720, quality: 0.8 })
                : dataUrl;
              addImage(selectedDate, optimized);
              setPending(null);
            } finally {
              setUploading(false);
            }
          }}
        />
      ) : null}
      {uploading ? (
        <div className="upload-loading-backdrop" role="status" aria-live="polite" aria-label="업로드 중">
          <div className="upload-loading-box">업로드 중…</div>
        </div>
      ) : null}
    </>
  );
}
