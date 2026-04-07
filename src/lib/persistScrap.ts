import { useScrapStore } from '../store/scrapStore';
import { saveMonthShardPartial, saveRoutineLabelsMeta } from './storage/indexeddb';

/**
 * 더티 플래그가 있을 때만 IDB에 반영한다.
 * - 날짜별로 샤드에 병합(전체 월 덮어쓰기 아님)
 * - 저장 중 추가 편집은 dateRevision으로 구분해 안전하게 더티 해제
 */
export async function flushDirtyToIDB(): Promise<boolean> {
  const s = useScrapStore.getState();
  const mk = s.loadedMonthKey;
  const snapshotDates = [...s.dirtyDateKeys];
  const hadRoutine = s.dirtyRoutineLabels;
  if (snapshotDates.length === 0 && !hadRoutine) return false;

  const revsBefore = { ...s.dateRevision };
  const routineRevBefore = s.routineLabelsRevision;

  if (snapshotDates.length > 0) {
    await saveMonthShardPartial(mk, snapshotDates, () => {
      const st = useScrapStore.getState();
      return {
        imagesByDate: st.imagesByDate,
        diaryByDate: st.diaryByDate,
        routineByDate: st.routineByDate,
        routineLabels: st.routineLabels,
      };
    }, { updateRoutineLabelsInMeta: hadRoutine });
  } else if (hadRoutine) {
    await saveRoutineLabelsMeta(mk, useScrapStore.getState().routineLabels);
  }

  useScrapStore.setState((state) => {
    const nextDirty = new Set(state.dirtyDateKeys);
    for (const d of snapshotDates) {
      if ((state.dateRevision[d] ?? 0) === (revsBefore[d] ?? 0)) {
        nextDirty.delete(d);
      }
    }
    let routineDirty = state.dirtyRoutineLabels;
    if (hadRoutine && state.routineLabelsRevision === routineRevBefore) {
      routineDirty = false;
    }
    return { dirtyDateKeys: nextDirty, dirtyRoutineLabels: routineDirty };
  });

  return true;
}
