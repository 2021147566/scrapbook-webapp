import { createContext, useContext, type ReactNode } from 'react';

const ReadOnlyContext = createContext(false);

export function ReadOnlyProvider({ value, children }: { value: boolean; children: ReactNode }) {
  return <ReadOnlyContext.Provider value={value}>{children}</ReadOnlyContext.Provider>;
}

/** Firebase가 켜져 있고 로그인하지 않은 경우(남의 일기 보기 모드) true */
export function useReadOnly(): boolean {
  return useContext(ReadOnlyContext);
}
