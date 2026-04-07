import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useMonthShardNav } from '../../hooks/useMonthShardNav';
import { useReadOnly } from '../../context/ReadOnlyContext';
import { useScrapStore } from '../../store/scrapStore';
import { DiaryPanel } from '../diary/DiaryPanel';
import { BookFilmCollage } from './BookFilmCollage';

const MOBILE_MEDIA = '(max-width: 960px)';

export function BookView() {
  const readOnly = useReadOnly();
  const imagesByDate = useScrapStore((s) => s.imagesByDate);
  const selectedDate = useScrapStore((s) => s.selectedDate);
  const setSelectedDate = useScrapStore((s) => s.setSelectedDate);
  const loadedMonthKey = useScrapStore((s) => s.loadedMonthKey);
  const goToMonthShard = useMonthShardNav();
  const [dayBusy, setDayBusy] = useState(false);
  const isMobileLayout = useMediaQuery(MOBILE_MEDIA);

  const currentImages = imagesByDate[selectedDate] ?? [];
  const [photoIdx, setPhotoIdx] = useState(0);

  useEffect(() => {
    setPhotoIdx(0);
  }, [selectedDate]);

  useEffect(() => {
    setPhotoIdx((i) => Math.min(i, Math.max(0, currentImages.length - 1)));
  }, [currentImages.length]);

  const goDay = async (delta: number) => {
    if (dayBusy) return;
    const next = dayjs(selectedDate).add(delta, 'day').format('YYYY-MM-DD');
    const nextMonth = next.slice(0, 7);
    if (nextMonth !== loadedMonthKey) {
      setDayBusy(true);
      try {
        await goToMonthShard(dayjs(next).toDate());
      } finally {
        setDayBusy(false);
      }
    }
    setSelectedDate(next);
  };

  const n = currentImages.length;
  const goPhoto = (delta: number) => {
    if (n <= 0) return;
    setPhotoIdx((i) => (i + delta + n) % n);
  };

  return (
    <div className="page page--book">
      <div className="book-layout">
        <section className="book-page">
          <>
            {isMobileLayout ? (
              <header
                className="book-page-header book-page-header--mobile-daynav"
                aria-label={dayjs(selectedDate).locale('ko').format('YYYY년 M월 D일')}
              >
                <button
                  type="button"
                  className="book-daynav-btn"
                  disabled={dayBusy}
                  onClick={() => void goDay(-1)}
                  aria-label="이전 날"
                >
                  ◀
                </button>
                <button
                  type="button"
                  className="book-daynav-btn"
                  disabled={dayBusy}
                  onClick={() => void goDay(1)}
                  aria-label="다음 날"
                >
                  ▶
                </button>
              </header>
            ) : (
              <header className="book-page-header">
                <h3>{dayjs(selectedDate).format('YYYY년 M월 D일')}</h3>
              </header>
            )}

            {currentImages.length > 0 ? (
              isMobileLayout ? (
                <div className="book-photo-stage book-photo-stage--mobile-flat">
                  <div className="book-mobile-single">
                    <div className="book-mobile-frame">
                      <img src={currentImages[photoIdx].dataUrl} alt="" draggable={false} />
                    </div>
                    {currentImages[photoIdx].title ? (
                      <div className="book-mobile-caption">{currentImages[photoIdx].title}</div>
                    ) : null}
                  </div>
                  <div className="row book-toolbar book-toolbar--compact book-toolbar--photo-only">
                    <button
                      type="button"
                      disabled={n <= 1}
                      onClick={() => goPhoto(-1)}
                      aria-label="이전 사진"
                    >
                      ◀
                    </button>
                    <span className="book-toolbar-meta" aria-live="polite">
                      {photoIdx + 1} / {n}
                    </span>
                    <button
                      type="button"
                      disabled={n <= 1}
                      onClick={() => goPhoto(1)}
                      aria-label="다음 사진"
                    >
                      ▶
                    </button>
                  </div>
                </div>
              ) : (
                <div className="book-photo-stage">
                  <p className="book-drag-hint">{readOnly ? '보기 전용' : '드래그로 위치 조정'}</p>
                  <div className="book-collage-wrap">
                    <BookFilmCollage dateKey={selectedDate} images={currentImages} />
                  </div>
                </div>
              )
            ) : (
              <p className="book-empty-day">이미지 없음</p>
            )}

            {!isMobileLayout ? (
              <div className="row book-toolbar book-toolbar--compact">
                <button type="button" disabled={dayBusy} onClick={() => void goDay(-1)}>
                  ◀ 이전
                </button>
                <button type="button" disabled={dayBusy} onClick={() => void goDay(1)}>
                  다음 ▶
                </button>
                {currentImages.length > 0 ? (
                  <span className="book-toolbar-meta" aria-live="polite">
                    {currentImages.length}장
                  </span>
                ) : null}
              </div>
            ) : null}
          </>
        </section>
        <DiaryPanel date={selectedDate} />
      </div>
    </div>
  );
}
