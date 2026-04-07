import dayjs from 'dayjs';
import { useEffect, useMemo, useRef } from 'react';
import clsx from 'clsx';
import { useMonthShardNav } from '../../hooks/useMonthShardNav';
import { useReadOnly } from '../../context/ReadOnlyContext';
import { useScrapStore } from '../../store/scrapStore';
import { effectiveRoutineLabels } from '../../types';

function buildMonthDays(cursor: Date): dayjs.Dayjs[] {
  const start = dayjs(cursor).startOf('month');
  return Array.from({ length: start.daysInMonth() }, (_, i) => start.add(i, 'day'));
}

const weekLabels = ['일', '월', '화', '수', '목', '금', '토'];

function useCalendarMonthData() {
  const monthCursor = useScrapStore((s) => s.monthCursor);
  const selectedDate = useScrapStore((s) => s.selectedDate);
  const imagesByDate = useScrapStore((s) => s.imagesByDate);
  const routineByDate = useScrapStore((s) => s.routineByDate);
  const routineLabels = useScrapStore((s) => s.routineLabels);
  const routineNames = useMemo(() => effectiveRoutineLabels(routineLabels), [routineLabels]);
  const setSelectedDate = useScrapStore((s) => s.setSelectedDate);
  const toggleRoutine = useScrapStore((s) => s.toggleRoutine);
  const monthDays = useMemo(() => buildMonthDays(monthCursor), [monthCursor]);
  const leadingBlanks = dayjs(monthCursor).startOf('month').day();
  const todayKey = dayjs().format('YYYY-MM-DD');

  return {
    monthDays,
    leadingBlanks,
    selectedDate,
    imagesByDate,
    routineByDate,
    routineNames,
    setSelectedDate,
    toggleRoutine,
    todayKey,
  };
}

/** 달력 상단 요일 줄 (레이아웃 그리드 1행) */
export function CalendarWeekdayHeader() {
  return (
    <div className="calendar-weekdays" aria-hidden>
      {weekLabels.map((label) => (
        <span key={label} className="calendar-weekday">
          {label}
        </span>
      ))}
    </div>
  );
}

/** 달력 날짜 칸 (레이아웃 그리드 2행, 사이드바와 같은 행 시작) */
export function CalendarDateGrid() {
  const readOnly = useReadOnly();
  const goToMonthShard = useMonthShardNav();
  const setMonthCursor = useScrapStore((s) => s.setMonthCursor);
  const {
    monthDays,
    leadingBlanks,
    selectedDate,
    imagesByDate,
    routineByDate,
    routineNames,
    setSelectedDate,
    toggleRoutine,
    todayKey,
  } = useCalendarMonthData();

  return (
    <div className="calendar-grid">
      {Array.from({ length: leadingBlanks }).map((_, i) => (
        <div key={`blank-${i}`} className="calendar-cell calendar-cell--empty" aria-hidden />
      ))}
      {monthDays.map((day) => {
        const key = day.format('YYYY-MM-DD');
        const items = imagesByDate[key] ?? [];
        const routines = routineByDate[key] ?? [false, false, false];
        const isToday = key === todayKey;
        return (
          <button
            key={key}
            type="button"
            className={clsx('calendar-cell', {
              selected: key === selectedDate,
              today: isToday,
            })}
            onClick={() => {
              void (async () => {
                await goToMonthShard(day.toDate());
                setMonthCursor(day.startOf('month').toDate());
                setSelectedDate(key);
              })();
            }}
          >
            <div className="day-header">
              <span className="day-number">{day.date()}</span>
              <span className="routine-dots">
                {routines.map((done, i) => (
                  <span
                    key={`${key}-${i}`}
                    className={clsx('routine-dot', `dot-${i + 1}`, { done })}
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!readOnly) toggleRoutine(key, i);
                    }}
                    onKeyDown={(event) => {
                      if (readOnly) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        toggleRoutine(key, i);
                      }
                    }}
                    aria-label={`${key} ${routineNames[i]} 토글`}
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
          </button>
        );
      })}
    </div>
  );
}

/** 모바일: 이번 달 날짜만 가로 스크롤(한 화면에 약 3일), 스크롤바 숨김 */
export function CalendarMobileMonthScroller() {
  const readOnly = useReadOnly();
  const goToMonthShard = useMonthShardNav();
  const setMonthCursor = useScrapStore((s) => s.setMonthCursor);
  const setSelectedDate = useScrapStore((s) => s.setSelectedDate);
  const monthCursor = useScrapStore((s) => s.monthCursor);
  const selectedDate = useScrapStore((s) => s.selectedDate);
  const imagesByDate = useScrapStore((s) => s.imagesByDate);
  const routineByDate = useScrapStore((s) => s.routineByDate);
  const routineLabels = useScrapStore((s) => s.routineLabels);
  const toggleRoutine = useScrapStore((s) => s.toggleRoutine);
  const routineNames = useMemo(() => effectiveRoutineLabels(routineLabels), [routineLabels]);
  const monthDays = useMemo(() => buildMonthDays(monthCursor), [monthCursor]);
  const todayKey = dayjs().format('YYYY-MM-DD');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const el = root.querySelector(`[data-date="${selectedDate}"]`);
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [selectedDate, monthCursor]);

  return (
    <div className="mobile-month-calendar-wrap">
      <div className="mobile-month-scroll hide-scrollbar" ref={scrollRef}>
        <div className="mobile-month-scroll-inner">
          {monthDays.map((day) => {
            const key = day.format('YYYY-MM-DD');
            const items = imagesByDate[key] ?? [];
            const routines = routineByDate[key] ?? [false, false, false];
            const isToday = key === todayKey;
            return (
              <button
                key={key}
                type="button"
                data-date={key}
                className={clsx('calendar-cell', 'calendar-cell--mobile-strip', {
                  selected: key === selectedDate,
                  today: isToday,
                })}
                onClick={() => {
                  void (async () => {
                    await goToMonthShard(day.toDate());
                    setMonthCursor(day.startOf('month').toDate());
                    setSelectedDate(key);
                  })();
                }}
              >
                <div className="mobile-strip-toprow">
                  <span className="mobile-strip-date">{day.format('M/D')}</span>
                  {!readOnly ? (
                    <span className="routine-dots routine-dots--mobile-strip">
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
                          aria-label={`${key} ${routineNames[i]} 토글`}
                        />
                      ))}
                    </span>
                  ) : null}
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
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** 하위 호환: 한 번에 쓸 때 */
export function CalendarView() {
  return (
    <>
      <CalendarWeekdayHeader />
      <CalendarDateGrid />
    </>
  );
}
