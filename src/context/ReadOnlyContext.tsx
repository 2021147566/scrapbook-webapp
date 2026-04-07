import { createContext, useContext, type ReactNode } from 'react';

const ReadOnlyContext = createContext(false);

export function ReadOnlyProvider({ value, children }: { value: boolean; children: ReactNode }) {
  return <ReadOnlyContext.Provider value={value}>{children}</ReadOnlyContext.Provider>;
}

/** Firebase 사용 시 소유자 이메일이 아니면 true(보기만) */
export function useReadOnly(): boolean {
  return useContext(ReadOnlyContext);
}
