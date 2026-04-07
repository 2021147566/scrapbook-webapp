import type { User } from 'firebase/auth';

/** 편집·업로드·Google 로그인 허용 계정 (다른 구글 계정은 로그인 직후 로그아웃) */
export const OWNER_EMAIL = 'euiseo053103@gmail.com';

/** 공개 스냅샷 Firestore `scrapbooks/{uid}` — env 없을 때 폴백 */
export const OWNER_UID_FALLBACK = 'xYC8k14kzsOztdUbD0XZ0kJ9xho1';

export function isOwnerEmail(user: User | null): boolean {
  const e = user?.email?.toLowerCase() ?? '';
  return e === OWNER_EMAIL.toLowerCase();
}
