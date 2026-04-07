/**
 * 비로그인·Firebase 사용 시 상단에 보이는 일기 제목(기본 뷰).
 * 실제 데이터는 VITE_PUBLIC_GUEST_SNAPSHOT_URL 또는 아래 폴백 UID / VITE_GUEST_DEFAULT_UID 로 불러옵니다.
 */
export const GUEST_DEFAULT_DIARY_TITLE = '의서의 일기';

/**
 * 환경 변수가 비어 있을 때 Firestore `scrapbooks/{uid}` 공개 읽기용 폴백 UID.
 * Firebase Console → Authentication → euiseo053103@gmail.com → 사용자 UID
 * (배포는 GitHub Secrets `VITE_GUEST_DEFAULT_UID` 권장)
 */
export const GUEST_DEFAULT_UID_FALLBACK = '';
