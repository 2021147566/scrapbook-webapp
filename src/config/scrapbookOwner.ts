import type { User } from 'firebase/auth';

/** 편집·업로드 가능한 Google 계정 (이메일 일치 시에만) */
export const OWNER_EMAIL = 'euiseo053103@gmail.com';

/** 공개 스냅샷 Firestore `scrapbooks/{uid}` — env 없을 때 폴백 */
export const OWNER_UID_FALLBACK = 'xYC8k14kzsOztdUbD0XZ0kJ9xho1';

export function isOwnerEmail(user: User | null): boolean {
  const e = user?.email?.toLowerCase() ?? '';
  return e === OWNER_EMAIL.toLowerCase();
}
