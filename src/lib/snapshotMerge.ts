import type { PersistedSnapshot, ScrapImage } from '../types';
import { normalizeRoutineLabels } from '../types';

export function countSnapshotImages(s: PersistedSnapshot): number {
  return Object.values(s.imagesByDate ?? {}).reduce((n, arr) => n + (arr?.length ?? 0), 0);
}

export function mergeSnapshots(local: PersistedSnapshot, cloud: PersistedSnapshot): PersistedSnapshot {
  const imagesByDate: PersistedSnapshot['imagesByDate'] = { ...local.imagesByDate };
  for (const [date, images] of Object.entries(cloud.imagesByDate ?? {})) {
    const merged = new Map<string, ScrapImage>();
    for (const image of imagesByDate[date] ?? []) merged.set(image.id, image);
    for (const image of images) {
      const prev = merged.get(image.id);
      if (!prev || prev.updatedAt < image.updatedAt) merged.set(image.id, image);
    }
    imagesByDate[date] = Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  const diaryByDate = { ...local.diaryByDate };
  for (const [date, entry] of Object.entries(cloud.diaryByDate ?? {})) {
    const prev = diaryByDate[date];
    if (!prev || prev.updatedAt < entry.updatedAt) diaryByDate[date] = entry;
  }

  const routineByDate = { ...local.routineByDate };
  for (const [date, routines] of Object.entries(cloud.routineByDate ?? {})) {
    const prev = routineByDate[date] ?? [false, false, false];
    routineByDate[date] = [
      Boolean(prev[0] || routines?.[0]),
      Boolean(prev[1] || routines?.[1]),
      Boolean(prev[2] || routines?.[2]),
    ];
  }

  const hasCloudLabels = Array.isArray(cloud.routineLabels) && cloud.routineLabels.length === 3;
  const hasLocalLabels = Array.isArray(local.routineLabels) && local.routineLabels.length === 3;
  const routineLabels = !hasCloudLabels
    ? normalizeRoutineLabels(local.routineLabels)
    : !hasLocalLabels
      ? normalizeRoutineLabels(cloud.routineLabels)
      : (cloud.updatedAt ?? 0) >= (local.updatedAt ?? 0)
        ? normalizeRoutineLabels(cloud.routineLabels)
        : normalizeRoutineLabels(local.routineLabels);

  return {
    updatedAt: Math.max(local.updatedAt ?? 0, cloud.updatedAt ?? 0, Date.now()),
    imagesByDate,
    diaryByDate,
    routineByDate,
    routineLabels: [...routineLabels],
  };
}
