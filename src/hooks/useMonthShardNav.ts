import dayjs from 'dayjs';
import { useCallback } from 'react';
import { monthKeyFromDate } from '../lib/monthShard';
import { switchMonthShard } from '../lib/storage/indexeddb';
import { useScrapStore } from '../store/scrapStore';

/**
 * 선택 날짜가 속한 달의 샤드가 메모리에 없으면 IndexedDB에서 불러온다.
 * 항상 최신 store 상태로 동작하도록 getState()를 사용한다.
 */
export function useMonthShardNav() {
  return useCallback(async (targetDate: Date) => {
    const mk = monthKeyFromDate(targetDate);
    const state = useScrapStore.getState();
    if (mk === state.loadedMonthKey) return;
    const snap = state.toSnapshot();
    const nextCursor = dayjs(targetDate).startOf('month').toDate();
    const shard = await switchMonthShard(state.loadedMonthKey, snap, nextCursor);
    state.loadSnapshot(shard);
    state.setLoadedMonthKey(mk);
    state.setMonthCursor(nextCursor);
  }, []);
}
