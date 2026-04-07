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

/** 루틴 토글 3개에 대응하는 표시 이름(항상 3개). */
export const DEFAULT_ROUTINE_LABELS: readonly [string, string, string] = ['운동', '공부', '식단'];

export function normalizeRoutineLabels(raw: unknown): [string, string, string] {
  const d = DEFAULT_ROUTINE_LABELS;
  if (!Array.isArray(raw) || raw.length !== 3) {
    return [d[0], d[1], d[2]];
  }
  return [
    typeof raw[0] === 'string' && raw[0].trim() ? raw[0].trim() : d[0],
    typeof raw[1] === 'string' && raw[1].trim() ? raw[1].trim() : d[1],
    typeof raw[2] === 'string' && raw[2].trim() ? raw[2].trim() : d[2],
  ];
}

/** 달력·버튼 표시용 — 비어 있으면 기본 이름 */
export function effectiveRoutineLabels(labels: readonly [string, string, string]): [string, string, string] {
  const d = DEFAULT_ROUTINE_LABELS;
  return [
    labels[0].trim() || d[0],
    labels[1].trim() || d[1],
    labels[2].trim() || d[2],
  ];
}

export interface PersistedSnapshot {
  updatedAt: number;
  imagesByDate: Record<DateKey, ScrapImage[]>;
  diaryByDate: Record<DateKey, DiaryEntry>;
  routineByDate: Record<DateKey, boolean[]>;
  /** 길이 3 — 각 슬롯 표시 이름 */
  routineLabels?: string[];
}
