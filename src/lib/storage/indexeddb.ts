import { openDB } from 'idb';
import { compressSnapshotImages } from '../imageCompress';
import {
  mergeMonthShardsToSnapshot,
  monthKeyFromDate,
  monthKeyFromDateKey,
  normalizeRoutineTriplet,
  type MonthKey,
  type MonthShard,
  shardToPersisted,
  slicePersistedToMonthShard,
  splitSnapshotByMonth,
} from '../monthShard';
import type { DateKey, DiaryEntry, PersistedSnapshot, ScrapImage } from '../../types';
import { DEFAULT_ROUTINE_LABELS } from '../../types';
import dayjs from 'dayjs';

const DB_NAME = 'scrapbook-db';
const STORE_NAME = 'state';
const DB_VERSION = 2;

const LEGACY_SNAPSHOT_KEY = 'snapshot';
const META_KEY = '__meta__';

function monthStorageKey(monthKey: MonthKey): string {
  return `month:${monthKey}`;
}

interface StoreMeta {
  routineLabels: [string, string, string];
  lastActiveMonthKey: MonthKey;
}

async function defaultMeta(): Promise<StoreMeta> {
  return {
    routineLabels: [...DEFAULT_ROUTINE_LABELS],
    lastActiveMonthKey: monthKeyFromDateKey(new Date().toISOString().slice(0, 10)),
  };
}

async function db() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion) {
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
      if (oldVersion < 2) {
        // legacy snapshot stays until migrateLegacyIfNeeded runs
      }
    },
  });
}

async function migrateLegacyIfNeeded(database: Awaited<ReturnType<typeof db>>): Promise<void> {
  const legacy = (await database.get(STORE_NAME, LEGACY_SNAPSHOT_KEY)) as PersistedSnapshot | undefined;
  if (!legacy) return;

  const meta = (await database.get(STORE_NAME, META_KEY)) as StoreMeta | undefined;
  const routineLabels = meta?.routineLabels ?? normalizeRoutineTriplet(legacy.routineLabels);
  const lastActive =
    meta?.lastActiveMonthKey ?? monthKeyFromDateKey(new Date().toISOString().slice(0, 10));

  const shards = splitSnapshotByMonth(legacy);
  for (const [mk, shard] of shards) {
    await database.put(STORE_NAME, shard, monthStorageKey(mk));
  }
  await database.put(STORE_NAME, { routineLabels, lastActiveMonthKey: lastActive } as StoreMeta, META_KEY);
  await database.delete(STORE_NAME, LEGACY_SNAPSHOT_KEY);
}

/** @internal also used from App for cloud merge */
export async function loadMeta(): Promise<StoreMeta> {
  const database = await db();
  await migrateLegacyIfNeeded(database);
  const meta = (await database.get(STORE_NAME, META_KEY)) as StoreMeta | undefined;
  if (!meta) {
    const m = await defaultMeta();
    await database.put(STORE_NAME, m, META_KEY);
    return m;
  }
  return meta;
}

export async function saveMeta(meta: StoreMeta): Promise<void> {
  const database = await db();
  await database.put(STORE_NAME, meta, META_KEY);
}

export async function loadMonthShard(monthKey: MonthKey): Promise<MonthShard | null> {
  const database = await db();
  await migrateLegacyIfNeeded(database);
  const shard = (await database.get(STORE_NAME, monthStorageKey(monthKey))) as MonthShard | undefined;
  return shard ?? null;
}

export async function saveMonthShard(monthKey: MonthKey, shard: MonthShard): Promise<void> {
  const database = await db();
  await database.put(STORE_NAME, shard, monthStorageKey(monthKey));
}

/** 모든 month:* 키를 읽어 PersistedSnapshot으로 병합 */
export async function mergeAllMonthShardsFromIDB(): Promise<PersistedSnapshot> {
  const database = await db();
  await migrateLegacyIfNeeded(database);
  const meta = await loadMeta();
  const keys = await database.getAllKeys(STORE_NAME);
  const shards = new Map<MonthKey, MonthShard>();
  for (const key of keys) {
    if (typeof key !== 'string' || !key.startsWith('month:')) continue;
    const mk = key.slice('month:'.length) as MonthKey;
    const shard = (await database.get(STORE_NAME, key)) as MonthShard | undefined;
    if (shard) {
      shards.set(mk, shard);
    }
  }
  return mergeMonthShardsToSnapshot(shards, meta.routineLabels);
}

/** 전체 스냅샷을 월 샤드로 덮어쓰기 (가져오기·클라우드 pull 후) */
export async function replaceAllShardsFromSnapshot(snapshot: PersistedSnapshot): Promise<void> {
  const database = await db();
  await migrateLegacyIfNeeded(database);
  const keys = await database.getAllKeys(STORE_NAME);
  for (const key of keys) {
    if (typeof key === 'string' && key.startsWith('month:')) {
      await database.delete(STORE_NAME, key);
    }
  }
  const shards = splitSnapshotByMonth(snapshot);
  const monthKeys = [...shards.keys()].sort();
  const todayM = dayjs().format('YYYY-MM');
  const lastActive =
    monthKeys.includes(todayM) ? todayM : monthKeys[monthKeys.length - 1] ?? todayM;
  for (const [mk, shard] of shards) {
    await database.put(STORE_NAME, shard, monthStorageKey(mk));
  }
  await saveMeta({
    routineLabels: normalizeRoutineTriplet(snapshot.routineLabels),
    lastActiveMonthKey: lastActive,
  });
}

/**
 * 앱 초기 로드: meta + 해당 월 샤드만 → PersistedSnapshot (메모리 한 달)
 */
export async function loadSnapshot(): Promise<{ snapshot: PersistedSnapshot; monthKey: MonthKey } | null> {
  const database = await db();
  await migrateLegacyIfNeeded(database);
  const meta = await loadMeta();
  const monthKey = meta.lastActiveMonthKey;
  const shard = await loadMonthShard(monthKey);
  return {
    snapshot: shardToPersisted(shard, meta.routineLabels),
    monthKey,
  };
}

/** 현재 월만 저장 (자동 저장) */
export async function saveSnapshot(snapshot: PersistedSnapshot, monthKey: MonthKey): Promise<void> {
  const database = await db();
  await migrateLegacyIfNeeded(database);
  const meta = await loadMeta();
  const shard = slicePersistedToMonthShard(snapshot, monthKey);
  await database.put(STORE_NAME, shard, monthStorageKey(monthKey));
  await saveMeta({
    ...meta,
    routineLabels: normalizeRoutineTriplet(snapshot.routineLabels),
    lastActiveMonthKey: monthKey,
  });
}

function applyOneDateToShard(
  shard: MonthShard,
  date: DateKey,
  slice: {
    imagesByDate: Record<DateKey, ScrapImage[]>;
    diaryByDate: Record<DateKey, DiaryEntry>;
    routineByDate: Record<DateKey, boolean[]>;
  },
): void {
  const imgs = slice.imagesByDate[date];
  if (imgs && imgs.length > 0) shard.imagesByDate[date] = imgs;
  else delete shard.imagesByDate[date];

  const di = slice.diaryByDate[date];
  if (di && di.text.trim()) shard.diaryByDate[date] = di;
  else delete shard.diaryByDate[date];

  const r = slice.routineByDate[date];
  if (r && r.some(Boolean)) shard.routineByDate[date] = r;
  else delete shard.routineByDate[date];
}

/** 루틴 이름만 meta에 반영 (날짜 데이터 변경 없음) */
export async function saveRoutineLabelsMeta(monthKey: MonthKey, labels: [string, string, string]): Promise<void> {
  const meta = await loadMeta();
  await saveMeta({
    ...meta,
    routineLabels: normalizeRoutineTriplet(labels),
    lastActiveMonthKey: monthKey,
  });
}

/**
 * 월 샤드에 **변경된 날짜만** 병합 저장 (자동 저장 최적화)
 */
export async function saveMonthShardPartial(
  monthKey: MonthKey,
  dateKeys: DateKey[],
  getSlice: () => {
    imagesByDate: Record<DateKey, ScrapImage[]>;
    diaryByDate: Record<DateKey, DiaryEntry>;
    routineByDate: Record<DateKey, boolean[]>;
    routineLabels: [string, string, string];
  },
  opts: { updateRoutineLabelsInMeta: boolean },
): Promise<void> {
  const database = await db();
  await migrateLegacyIfNeeded(database);
  const meta = await loadMeta();

  let shard = (await database.get(STORE_NAME, monthStorageKey(monthKey))) as MonthShard | undefined;
  if (!shard) {
    shard = { imagesByDate: {}, diaryByDate: {}, routineByDate: {}, updatedAt: Date.now() };
  }

  const slice = getSlice();

  for (const d of dateKeys) {
    if (d.slice(0, 7) !== monthKey) continue;
    applyOneDateToShard(shard, d, slice);
  }

  shard.updatedAt = Date.now();
  await database.put(STORE_NAME, shard, monthStorageKey(monthKey));

  if (opts.updateRoutineLabelsInMeta) {
    await saveMeta({
      ...meta,
      routineLabels: normalizeRoutineTriplet(slice.routineLabels),
      lastActiveMonthKey: monthKey,
    });
  } else {
    await saveMeta({ ...meta, lastActiveMonthKey: monthKey });
  }
}

export async function exportSnapshot(snapshot: PersistedSnapshot): Promise<string> {
  return JSON.stringify(snapshot, null, 2);
}

export function parsePersistedSnapshot(text: string): PersistedSnapshot {
  const parsed = JSON.parse(text) as PersistedSnapshot;
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid snapshot');
  return {
    updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    imagesByDate: parsed.imagesByDate ?? {},
    diaryByDate: parsed.diaryByDate ?? {},
    routineByDate: parsed.routineByDate ?? {},
    routineLabels: parsed.routineLabels,
  };
}

export async function importSnapshot(text: string): Promise<PersistedSnapshot> {
  const parsed = parsePersistedSnapshot(text);
  const compressed = await compressSnapshotImages(parsed);
  await replaceAllShardsFromSnapshot(compressed);
  const loaded = await loadSnapshot();
  return loaded?.snapshot ?? compressed;
}

/** 월 전환: 이전 월 저장 후 새 월 로드 */
export async function switchMonthShard(
  previousMonthKey: MonthKey,
  currentSnapshot: PersistedSnapshot,
  nextMonthCursor: Date,
): Promise<PersistedSnapshot> {
  const nextKey = monthKeyFromDate(nextMonthCursor);
  if (nextKey === previousMonthKey) {
    const meta = await loadMeta();
    return shardToPersisted(await loadMonthShard(nextKey), meta.routineLabels);
  }
  await saveSnapshot(currentSnapshot, previousMonthKey);
  const meta = await loadMeta();
  await saveMeta({ ...meta, lastActiveMonthKey: nextKey });
  let shard = await loadMonthShard(nextKey);
  if (!shard) {
    shard = {
      imagesByDate: {},
      diaryByDate: {},
      routineByDate: {},
      updatedAt: Date.now(),
    };
    await saveMonthShard(nextKey, shard);
  }
  return shardToPersisted(shard, meta.routineLabels);
}
