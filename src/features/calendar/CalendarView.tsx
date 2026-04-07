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
              {items.length > 0 ? (
                <div className="photo-stack">
                  {items.length > 2 ? (
                    <img
                      src={items[2].dataUrl}
                      alt=""
                      className="stack-image-back layer-far stamp-clip"
                      aria-hidden
                    />
                  ) : null}
                  {items.length > 1 ? (
                    <img
                      src={items[1].dataUrl}
                      alt=""
                      className="stack-image-back layer-mid stamp-clip"
                      aria-hidden
                    />
                  ) : null}
                  <img src={items[0].dataUrl} alt="" className="stack-image-main stamp-clip" />
                </div>
              ) : null}
            </div>
            {items.length > 1 && <small>+{items.length - 1}</small>}
          </button>
        );
      })}
    </div>
  );
}
