import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useReadOnly } from '../../context/ReadOnlyContext';
import { useScrapStore } from '../../store/scrapStore';
import { DiaryPanel } from '../diary/DiaryPanel';
import { BookFilmCollage } from './BookFilmCollage';

export function BookView() {
  const readOnly = useReadOnly();
  const imagesByDate = useScrapStore((s) => s.imagesByDate);
  const resetBookLayoutForDate = useScrapStore((s) => s.resetBookLayoutForDate);
  const dates = useMemo(
    () => Object.keys(imagesByDate).filter((k) => imagesByDate[k]?.length).sort(),
    [imagesByDate],
  );
  const [index, setIndex] = useState(0);
  const safeIndex = Math.min(index, Math.max(dates.length - 1, 0));
  const currentDate = dates[safeIndex];
  const currentImages = currentDate ? imagesByDate[currentDate] ?? [] : [];

  return (
    <div className="page page--book">
      <div className="book-layout">
        <section className="book-page">
          {currentDate ? (
            <>
              <header className="book-page-header">
                <h3>{dayjs(currentDate).format('YYYY년 M월 D일')}</h3>
                <p>
                  {safeIndex + 1}/{dates.length}
                </p>
              </header>
              {currentImages.length > 0 ? (
                <div className="book-photo-stage">
                  <p className="book-drag-hint">{readOnly ? '보기 전용' : '드래그로 위치 조정'}</p>
                  <div className="book-collage-wrap">
                    <BookFilmCollage dateKey={currentDate} images={currentImages} />
                  </div>
                </div>
              ) : (
                <p className="book-empty-day">이미지 없음</p>
              )}
              <div className="row book-toolbar">
                <button type="button" disabled={safeIndex <= 0} onClick={() => setIndex((v) => v - 1)}>
                  이전
                </button>
                <button
                  type="button"
                  disabled={safeIndex >= dates.length - 1}
                  onClick={() => setIndex((v) => v + 1)}
                >
                  다음
                </button>
                {currentImages.length > 0 ? (
                  <>
                    <span className="book-toolbar-meta" aria-live="polite">
                      사진 {currentImages.length}장
                    </span>
                    <button type="button" disabled={readOnly} onClick={() => resetBookLayoutForDate(currentDate)}>
                      위치 초기화
                    </button>
                  </>
                ) : null}
              </div>
            </>
          ) : (
            <p className="book-empty-all">아직 저장된 페이지가 없습니다. 달력에서 이미지를 추가해보세요.</p>
          )}
        </section>
        <DiaryPanel date={currentDate ?? dayjs().format('YYYY-MM-DD')} />
      </div>
    </div>
  );
}
