export type DateKey = string;

export interface ScrapImage {
  id: string;
  date: DateKey;
  dataUrl: string;
  title?: string;
  createdAt: number;
  updatedAt: number;
}

export interface DiaryEntry {
  date: DateKey;
  text: string;
  updatedAt: number;
}

export interface PersistedSnapshot {
  updatedAt: number;
  imagesByDate: Record<DateKey, ScrapImage[]>;
  diaryByDate: Record<DateKey, DiaryEntry>;
  routineByDate: Record<DateKey, boolean[]>;
}
