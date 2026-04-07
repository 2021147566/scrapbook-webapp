import { create } from 'zustand';
import type { DateKey, DiaryEntry, PersistedSnapshot, ScrapImage } from '../types';

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

interface ScrapState {
  monthCursor: Date;
  selectedDate: DateKey;
  imagesByDate: Record<DateKey, ScrapImage[]>;
  diaryByDate: Record<DateKey, DiaryEntry>;
  routineByDate: Record<DateKey, boolean[]>;
  setMonthCursor: (date: Date) => void;
  setSelectedDate: (date: DateKey) => void;
  addImage: (date: DateKey, dataUrl: string) => void;
  removeImage: (date: DateKey, imageId: string) => void;
  moveImage: (date: DateKey, fromIndex: number, toIndex: number) => void;
  toggleRoutine: (date: DateKey, routineIndex: number) => void;
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
  toggleRoutine: (date, routineIndex) =>
    set((state) => {
      const prev = state.routineByDate[date] ?? [false, false, false];
      const next = [...prev];
      next[routineIndex] = !next[routineIndex];
      return { routineByDate: { ...state.routineByDate, [date]: next } };
    }),
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
    }),
  toSnapshot: () => {
    const state = get();
    return {
      updatedAt: Date.now(),
      imagesByDate: state.imagesByDate,
      diaryByDate: state.diaryByDate,
      routineByDate: state.routineByDate,
    };
  },
}));
