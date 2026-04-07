import { useScrapStore } from '../../store/scrapStore';

interface DiaryPanelProps {
  date: string;
}

export function DiaryPanel({ date }: DiaryPanelProps) {
  const text = useScrapStore((s) => s.diaryByDate[date]?.text ?? '');
  const setDiary = useScrapStore((s) => s.setDiary);
  return (
    <section className="diary-panel">
      <h3>{date} 다이어리</h3>
      <textarea
        value={text}
        onChange={(e) => setDiary(date, e.target.value)}
        placeholder="오늘 느낀 점, 할 일, 회고를 적어보세요."
      />
    </section>
  );
}
