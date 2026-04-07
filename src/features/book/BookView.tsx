import dayjs from 'dayjs';
import { useState } from 'react';
import { useMonthShardNav } from '../../hooks/useMonthShardNav';
import { useReadOnly } from '../../context/ReadOnlyContext';
import { useScrapStore } from '../../store/scrapStore';
import { DiaryPanel } from '../diary/DiaryPanel';
import { BookFilmCollage } from './BookFilmCollage';

export function BookView() {
  const readOnly = useReadOnly();
  const imagesByDate = useScrapStore((s) => s.imagesByDate);
  const selectedDate = useScrapStore((s) => s.selectedDate);
  const setSelectedDate = useScrapStore((s) => s.setSelectedDate);
  const loadedMonthKey = useScrapStore((s) => s.loadedMonthKey);
  const resetBookLayoutForDate = useScrapStore((s) => s.resetBookLayoutForDate);
  const goToMonthShard = useMonthShardNav();
  const [dayBusy, setDayBusy] = useState(false);

  const currentImages = imagesByDate[selectedDate] ?? [];

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

  return (
    <div className="page page--book">
      <div className="book-layout">
        <section className="book-page">
          <>
            <header className="book-page-header">
              <h3>{dayjs(selectedDate).format('YYYY년 M월 D일')}</h3>
              <p>이전·다음 날</p>
            </header>
            {currentImages.length > 0 ? (
              <div className="book-photo-stage">
                <p className="book-drag-hint">{readOnly ? '보기 전용' : '드래그로 위치 조정'}</p>
                <div className="book-collage-wrap">
                  <BookFilmCollage dateKey={selectedDate} images={currentImages} />
                </div>
              </div>
            ) : (
              <p className="book-empty-day">이미지 없음</p>
            )}
            <div className="row book-toolbar">
              <button type="button" disabled={dayBusy} onClick={() => void goDay(-1)}>
                이전 날
              </button>
              <button type="button" disabled={dayBusy} onClick={() => void goDay(1)}>
                다음 날
              </button>
              {currentImages.length > 0 ? (
                <>
                  <span className="book-toolbar-meta" aria-live="polite">
                    사진 {currentImages.length}장
                  </span>
                  <button type="button" disabled={readOnly} onClick={() => resetBookLayoutForDate(selectedDate)}>
                    위치 초기화
                  </button>
                </>
              ) : null}
            </div>
          </>
        </section>
        <DiaryPanel date={selectedDate} />
      </div>
    </div>
  );
}
