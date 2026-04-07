import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useScrapStore } from '../../store/scrapStore';
import { DiaryPanel } from '../diary/DiaryPanel';
import { BookFilmCollage } from './BookFilmCollage';

export function BookView() {
  const imagesByDate = useScrapStore((s) => s.imagesByDate);
  const dates = useMemo(
    () => Object.keys(imagesByDate).filter((k) => imagesByDate[k]?.length).sort(),
    [imagesByDate],
  );
  const [index, setIndex] = useState(0);
  const safeIndex = Math.min(index, Math.max(dates.length - 1, 0));
  const currentDate = dates[safeIndex];
  const currentImages = currentDate ? imagesByDate[currentDate] ?? [] : [];

  return (
    <div className="book-layout">
      <section className="book-page">
        {currentDate ? (
          <>
            <header>
              <h3>{dayjs(currentDate).format('YYYY년 M월 D일')}</h3>
              <p>
                {safeIndex + 1}/{dates.length}
              </p>
            </header>
            {currentImages.length > 0 ? (
              <div className="book-photo-stage">
                <BookFilmCollage images={currentImages} />
                <small className="book-count">이 날의 사진 {currentImages.length}장</small>
              </div>
            ) : (
              <p>이미지 없음</p>
            )}
            <div className="row">
              <button disabled={safeIndex <= 0} onClick={() => setIndex((v) => v - 1)}>
                이전
              </button>
              <button
                disabled={safeIndex >= dates.length - 1}
                onClick={() => setIndex((v) => v + 1)}
              >
                다음
              </button>
            </div>
          </>
        ) : (
          <p>아직 저장된 페이지가 없습니다. 달력에서 이미지를 추가해보세요.</p>
        )}
      </section>
      <DiaryPanel date={currentDate ?? dayjs().format('YYYY-MM-DD')} />
    </div>
  );
}
