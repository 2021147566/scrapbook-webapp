import { create } from 'zustand';
import type { DateKey, DiaryEntry, PersistedSnapshot, ScrapImage } from '../types';
import { DEFAULT_ROUTINE_LABELS, effectiveRoutineLabels, normalizeRoutineLabels } from '../types';

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

interface ScrapState {
  monthCursor: Date;
  selectedDate: DateKey;
  imagesByDate: Record<DateKey, ScrapImage[]>;
  diaryByDate: Record<DateKey, DiaryEntry>;
  routineByDate: Record<DateKey, boolean[]>;
  routineLabels: [string, string, string];
  setMonthCursor: (date: Date) => void;
  setSelectedDate: (date: DateKey) => void;
  addImage: (date: DateKey, dataUrl: string) => void;
  removeImage: (date: DateKey, imageId: string) => void;
  moveImage: (date: DateKey, fromIndex: number, toIndex: number) => void;
  setImageTitle: (date: DateKey, imageId: string, title: string) => void;
  setImageBookOffset: (date: DateKey, imageId: string, offset: { x: number; y: number } | null) => void;
  resetBookLayoutForDate: (date: DateKey) => void;
  toggleRoutine: (date: DateKey, routineIndex: number) => void;
  setRoutineLabels: (labels: [string, string, string]) => void;
  setDiary: (date: DateKey, text: string) => void;
  loadSnapshot: (snapshot: PersistedSnapshot) => void;
  toSnapshot: () => PersistedSnapshot;
}

const todayKey = dayKey(new Date());

export const useScrapStore = create<ScrapState>((set, get) => ({
  monthCursor: new Date(),
  selectedDate: todayKey,
  imagesByDate: {},
  diaryByDate: {},
  routineByDate: {},
  routineLabels: [...DEFAULT_ROUTINE_LABELS],
  setMonthCursor: (date) => set({ monthCursor: date }),
  setSelectedDate: (date) => set({ selectedDate: date }),
  addImage: (date, dataUrl) =>
    set((state) => {
      const prev = state.imagesByDate[date] ?? [];
      const nextImage: ScrapImage = {
        id: crypto.randomUUID(),
        date,
        dataUrl,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      return { imagesByDate: { ...state.imagesByDate, [date]: [nextImage, ...prev] } };
    }),
  removeImage: (date, imageId) =>
    set((state) => {
      const filtered = (state.imagesByDate[date] ?? []).filter((img) => img.id !== imageId);
      return { imagesByDate: { ...state.imagesByDate, [date]: filtered } };
    }),
  moveImage: (date, fromIndex, toIndex) =>
    set((state) => {
      const list = [...(state.imagesByDate[date] ?? [])];
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= list.length ||
        toIndex >= list.length ||
        fromIndex === toIndex
      ) {
        return state;
      }
      const [picked] = list.splice(fromIndex, 1);
      list.splice(toIndex, 0, { ...picked, updatedAt: Date.now() });
      return { imagesByDate: { ...state.imagesByDate, [date]: list } };
    }),
  setImageTitle: (date, imageId, title) =>
    set((state) => {
      const list = (state.imagesByDate[date] ?? []).map((img) =>
        img.id === imageId ? { ...img, title, updatedAt: Date.now() } : img,
      );
      return { imagesByDate: { ...state.imagesByDate, [date]: list } };
    }),
  setImageBookOffset: (date, imageId, offset) =>
    set((state) => {
      const list = (state.imagesByDate[date] ?? []).map((img) => {
        if (img.id !== imageId) return img;
        const next =
          offset === null || (Math.abs(offset.x) < 0.5 && Math.abs(offset.y) < 0.5)
            ? { ...img, bookOffset: undefined, updatedAt: Date.now() }
            : { ...img, bookOffset: { x: offset.x, y: offset.y }, updatedAt: Date.now() };
        return next;
      });
      return { imagesByDate: { ...state.imagesByDate, [date]: list } };
    }),
  resetBookLayoutForDate: (date) =>
    set((state) => ({
      imagesByDate: {
        ...state.imagesByDate,
        [date]: (state.imagesByDate[date] ?? []).map((img) => {
          const { bookOffset: _, ...rest } = img;
          return { ...rest, updatedAt: Date.now() };
        }),
      },
    })),
  toggleRoutine: (date, routineIndex) =>
    set((state) => {
      const prev = state.routineByDate[date] ?? [false, false, false];
      const next = [...prev];
      next[routineIndex] = !next[routineIndex];
      return { routineByDate: { ...state.routineByDate, [date]: next } };
    }),
  setRoutineLabels: (labels) =>
    set(() => ({
      routineLabels: [
        String(labels[0] ?? '').slice(0, 20),
        String(labels[1] ?? '').slice(0, 20),
        String(labels[2] ?? '').slice(0, 20),
      ] as [string, string, string],
    })),
  setDiary: (date, text) =>
    set((state) => ({
      diaryByDate: {
        ...state.diaryByDate,
        [date]: { date, text, updatedAt: Date.now() },
      },
    })),
  loadSnapshot: (snapshot) =>
    set({
      imagesByDate: snapshot.imagesByDate ?? {},
      diaryByDate: snapshot.diaryByDate ?? {},
      routineByDate: snapshot.routineByDate ?? {},
      routineLabels: normalizeRoutineLabels(snapshot.routineLabels),
    }),
  toSnapshot: () => {
    const state = get();
    return {
      updatedAt: Date.now(),
      imagesByDate: state.imagesByDate,
      diaryByDate: state.diaryByDate,
      routineByDate: state.routineByDate,
      routineLabels: [...effectiveRoutineLabels(state.routineLabels)],
    };
  },
}));
