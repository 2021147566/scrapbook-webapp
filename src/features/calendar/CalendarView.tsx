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
  const routineByDate = useScrapStore((s) => s.routineByDate);
  const setSelectedDate = useScrapStore((s) => s.setSelectedDate);
  const grid = useMemo(() => buildGrid(monthCursor), [monthCursor]);
  const currentMonth = dayjs(monthCursor).month();

  return (
    <div className="calendar-grid">
      {grid.map((day) => {
        const key = day.format('YYYY-MM-DD');
        const items = imagesByDate[key] ?? [];
        const routines = routineByDate[key] ?? [false, false, false];
        return (
          <button
            key={key}
            className={clsx('calendar-cell', {
              muted: day.month() !== currentMonth,
              selected: key === selectedDate,
            })}
            onClick={() => setSelectedDate(key)}
          >
            <div className="day-header">
              <span className="day-number">{day.date()}</span>
              <span className="routine-dots" aria-hidden>
                {routines.map((done, i) => (
                  <span key={`${key}-${i}`} className={clsx('routine-dot', `dot-${i + 1}`, { done })} />
                ))}
              </span>
            </div>
            <div className="stack-preview">
              {items.length > 0 ? (
                <div className="photo-stack">
                  {items.length > 2 ? (
                    <img
                      src={items[2].dataUrl}
                      alt=""
                      className="stack-image-back layer-far"
                      aria-hidden
                    />
                  ) : null}
                  {items.length > 1 ? (
                    <img
                      src={items[1].dataUrl}
                      alt=""
                      className="stack-image-back layer-mid"
                      aria-hidden
                    />
                  ) : null}
                  <img src={items[0].dataUrl} alt="" className="stack-image-main" />
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
