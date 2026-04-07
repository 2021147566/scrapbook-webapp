import { useReadOnly } from '../../context/ReadOnlyContext';
import { useScrapStore } from '../../store/scrapStore';

interface DiaryPanelProps {
  date: string;
}

export function DiaryPanel({ date }: DiaryPanelProps) {
  const readOnly = useReadOnly();
  const text = useScrapStore((s) => s.diaryByDate[date]?.text ?? '');
  const setDiary = useScrapStore((s) => s.setDiary);
  return (
    <section className={`diary-panel${readOnly ? ' diary-panel--readonly' : ''}`}>
      <h3>{date} 다이어리</h3>
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
