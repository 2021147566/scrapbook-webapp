import { useReadOnly } from '../../context/ReadOnlyContext';
import { useScrapStore } from '../../store/scrapStore';

export type DiaryMobileBookDayNav = {
  onPrev: () => void;
  onNext: () => void;
  busy?: boolean;
};

interface DiaryPanelProps {
  date: string;
  /** 책 모바일: 날짜만 가운데, 양옆 이전/다음 날 */
  mobileBookDayNav?: DiaryMobileBookDayNav;
}

export function DiaryPanel({ date, mobileBookDayNav }: DiaryPanelProps) {
  const readOnly = useReadOnly();
  const text = useScrapStore((s) => s.diaryByDate[date]?.text ?? '');
  const setDiary = useScrapStore((s) => s.setDiary);
  return (
    <section className={`diary-panel${readOnly ? ' diary-panel--readonly' : ''}`}>
      {mobileBookDayNav ? (
        <div className="diary-panel-mobile-daynav">
          <button
            type="button"
            className="book-daynav-btn"
            disabled={mobileBookDayNav.busy}
            onClick={mobileBookDayNav.onPrev}
            aria-label="이전 날"
          >
            ◀
          </button>
          <h3 className="diary-panel-date-only">{date}</h3>
          <button
            type="button"
            className="book-daynav-btn"
            disabled={mobileBookDayNav.busy}
            onClick={mobileBookDayNav.onNext}
            aria-label="다음 날"
          >
            ▶
          </button>
        </div>
      ) : (
        <h3>{date} 다이어리</h3>
      )}
      <textarea
        value={text}
        readOnly={readOnly}
        onChange={(e) => setDiary(date, e.target.value)}
        placeholder={
          readOnly ? '보기 전용입니다. 수정은 로그인 후에만 가능해요.' : '오늘 느낀 점, 할 일, 회고를 적어보세요.'
        }
      />
    </section>
  );
}
