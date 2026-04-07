import dayjs from 'dayjs';
import { useMemo } from 'react';
import clsx from 'clsx';
import { useScrapStore } from '../../store/scrapStore';

function buildGrid(cursor: Date): dayjs.Dayjs[] {
  const start = dayjs(cursor).startOf('month').startOf('week');
  return Array.from({ length: 42 }, (_, i) => start.add(i, 'day'));
}

export function CalendarView() {
  const monthCursor = useScrapStore((s) => s.monthCursor);
  const selectedDate = useScrapStore((s) => s.selectedDate);
  const imagesByDate = useScrapStore((s) => s.imagesByDate);
  const setSelectedDate = useScrapStore((s) => s.setSelectedDate);
  const grid = useMemo(() => buildGrid(monthCursor), [monthCursor]);
  const currentMonth = dayjs(monthCursor).month();

  return (
    <div className="calendar-grid">
      {grid.map((day) => {
        const key = day.format('YYYY-MM-DD');
        const items = imagesByDate[key] ?? [];
        return (
          <button
            key={key}
            className={clsx('calendar-cell', {
              muted: day.month() !== currentMonth,
              selected: key === selectedDate,
            })}
            onClick={() => setSelectedDate(key)}
          >
            <span className="day-number">{day.date()}</span>
            <div className="stack-preview">
              {items.slice(0, 3).map((img, idx) => (
                <img
                  key={img.id}
                  src={img.dataUrl}
                  alt=""
                  className="stack-image"
                  style={{ transform: `rotate(${(idx - 1) * 6}deg) translateY(${idx * 3}px)` }}
                />
              ))}
            </div>
            {items.length > 3 && <small>+{items.length - 3}</small>}
          </button>
        );
      })}
    </div>
  );
}
