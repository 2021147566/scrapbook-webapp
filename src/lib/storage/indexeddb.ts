import { openDB } from 'idb';
import { compressSnapshotImages } from '../imageCompress';
import type { PersistedSnapshot } from '../../types';

const DB_NAME = 'scrapbook-db';
const STORE_NAME = 'state';
const SNAPSHOT_KEY = 'snapshot';

async function db() {
  return openDB(DB_NAME, 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    },
  });
}

export async function saveSnapshot(snapshot: PersistedSnapshot): Promise<void> {
  const database = await db();
  await database.put(STORE_NAME, snapshot, SNAPSHOT_KEY);
}

export async function loadSnapshot(): Promise<PersistedSnapshot | null> {
  const database = await db();
  return (await database.get(STORE_NAME, SNAPSHOT_KEY)) ?? null;
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
  await saveSnapshot(compressed);
  return compressed;
}
