import dayjs from 'dayjs';
import { useMemo } from 'react';
import clsx from 'clsx';
import { useScrapStore } from '../../store/scrapStore';

function buildMonthDays(cursor: Date): dayjs.Dayjs[] {
  const start = dayjs(cursor).startOf('month');
  return Array.from({ length: start.daysInMonth() }, (_, i) => start.add(i, 'day'));
}

export function CalendarView() {
  const monthCursor = useScrapStore((s) => s.monthCursor);
  const selectedDate = useScrapStore((s) => s.selectedDate);
  const imagesByDate = useScrapStore((s) => s.imagesByDate);
  const routineByDate = useScrapStore((s) => s.routineByDate);
  const setSelectedDate = useScrapStore((s) => s.setSelectedDate);
  const toggleRoutine = useScrapStore((s) => s.toggleRoutine);
  const monthDays = useMemo(() => buildMonthDays(monthCursor), [monthCursor]);
  const leadingBlanks = dayjs(monthCursor).startOf('month').day();
  const weekLabels = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <>
      <div className="calendar-weekdays" aria-hidden>
        {weekLabels.map((label) => (
          <span key={label} className="calendar-weekday">
            {label}
          </span>
        ))}
      </div>
      <div className="calendar-grid">
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`blank-${i}`} className="calendar-cell calendar-cell--empty" aria-hidden />
        ))}
        {monthDays.map((day) => {
        const key = day.format('YYYY-MM-DD');
        const items = imagesByDate[key] ?? [];
        const routines = routineByDate[key] ?? [false, false, false];
        return (
          <button
            key={key}
            className={clsx('calendar-cell', { selected: key === selectedDate })}
            onClick={() => setSelectedDate(key)}
          >
            <div className="day-header">
              <span className="day-number">{day.date()}</span>
              <span className="routine-dots" aria-hidden>
                {routines.map((done, i) => (
                  <span
                    key={`${key}-${i}`}
                    className={clsx('routine-dot', `dot-${i + 1}`, { done })}
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleRoutine(key, i);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        toggleRoutine(key, i);
                      }
                    }}
                    aria-label={`${key} 루틴 ${i + 1} 토글`}
                  />
                ))}
              </span>
            </div>
            <div className="stack-preview">
              {items.length > 0 ? (
                <div className={clsx('photo-stack', items.length > 1 && 'photo-stack--multi')}>
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
    </>
  );
}
