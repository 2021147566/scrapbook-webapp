import type { User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { isFirebaseConfigured, watchAuthState } from '../lib/sync/firebaseSync';

/** Firebase 사용 시 현재 로그인 사용자(null = 비로그인 또는 미설정) */
export function useFirebaseAuthUser(): User | null {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setUser(null);
      return;
    }
    return watchAuthState(setUser);
  }, []);
  return user;
}
