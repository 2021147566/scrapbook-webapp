import dayjs from 'dayjs';
import type { DateKey, DiaryEntry, PersistedSnapshot, ScrapImage } from '../types';
import { normalizeRoutineLabels } from '../types';

/** YYYY-MM */
export type MonthKey = string;

export interface MonthShard {
  imagesByDate: Record<DateKey, ScrapImage[]>;
  diaryByDate: Record<DateKey, DiaryEntry>;
  routineByDate: Record<DateKey, boolean[]>;
  updatedAt: number;
}

export function monthKeyFromDateKey(d: DateKey): MonthKey {
  return d.slice(0, 7);
}

export function monthKeyFromDate(d: Date): MonthKey {
  return dayjs(d).format('YYYY-MM');
}

export function filterRecordByMonth<T>(rec: Record<DateKey, T>, monthKey: MonthKey): Record<DateKey, T> {
  const out: Record<DateKey, T> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (k.slice(0, 7) === monthKey) {
      out[k] = v;
    }
  }
  return out;
}

export function slicePersistedToMonthShard(snapshot: PersistedSnapshot, monthKey: MonthKey): MonthShard {
  return {
    imagesByDate: filterRecordByMonth(snapshot.imagesByDate ?? {}, monthKey),
    diaryByDate: filterRecordByMonth(snapshot.diaryByDate ?? {}, monthKey),
    routineByDate: filterRecordByMonth(snapshot.routineByDate ?? {}, monthKey),
    updatedAt: snapshot.updatedAt ?? Date.now(),
  };
}

export function shardToPersisted(shard: MonthShard | null, routineLabels: [string, string, string]): PersistedSnapshot {
  return {
    updatedAt: shard?.updatedAt ?? Date.now(),
    imagesByDate: shard?.imagesByDate ?? {},
    diaryByDate: shard?.diaryByDate ?? {},
    routineByDate: shard?.routineByDate ?? {},
    routineLabels: [...routineLabels],
  };
}

/** 레거시 단일 스냅샷 → 월별 MonthShard 맵 */
export function splitSnapshotByMonth(snapshot: PersistedSnapshot): Map<MonthKey, MonthShard> {
  const map = new Map<MonthKey, MonthShard>();
  const months = new Set<MonthKey>();

  for (const k of Object.keys(snapshot.imagesByDate ?? {})) {
    months.add(monthKeyFromDateKey(k));
  }
  for (const k of Object.keys(snapshot.diaryByDate ?? {})) {
    months.add(monthKeyFromDateKey(k));
  }
  for (const k of Object.keys(snapshot.routineByDate ?? {})) {
    months.add(monthKeyFromDateKey(k));
  }

  for (const mk of months) {
    map.set(mk, slicePersistedToMonthShard(snapshot, mk));
  }
  if (map.size === 0) {
    const mk = dayjs().format('YYYY-MM');
    map.set(mk, {
      imagesByDate: {},
      diaryByDate: {},
      routineByDate: {},
      updatedAt: snapshot.updatedAt ?? Date.now(),
    });
  }
  return map;
}

export function mergeMonthShardsToSnapshot(
  shards: Map<MonthKey, MonthShard>,
  routineLabels: [string, string, string],
): PersistedSnapshot {
  const imagesByDate: PersistedSnapshot['imagesByDate'] = {};
  const diaryByDate: PersistedSnapshot['diaryByDate'] = {};
  const routineByDate: PersistedSnapshot['routineByDate'] = {};
  let updatedAt = 0;
  for (const shard of shards.values()) {
    Object.assign(imagesByDate, shard.imagesByDate);
    Object.assign(diaryByDate, shard.diaryByDate);
    Object.assign(routineByDate, shard.routineByDate);
    updatedAt = Math.max(updatedAt, shard.updatedAt ?? 0);
  }
  return {
    updatedAt: updatedAt || Date.now(),
    imagesByDate,
    diaryByDate,
    routineByDate,
    routineLabels: [...routineLabels],
  };
}

export function normalizeRoutineTriplet(raw: unknown): [string, string, string] {
  return normalizeRoutineLabels(raw);
}
