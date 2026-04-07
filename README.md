# Scrapbook Web App

사진 스크랩북 웹앱입니다. 달력 모드/책 모드/다이어리/크롭/로컬 저장을 지원합니다.

## 실행

```bash
npm install
npm run dev
```

## Firebase 동기화 활성화

1. Firebase 콘솔에서 프로젝트 생성
2. Authentication에서 Google 로그인 활성화
3. Firestore Database 생성(테스트 모드 시작 후 보안규칙 강화)
4. Storage 활성화
5. `.env` 파일 생성 후 아래 값 입력

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_APP_ID=...
```

## GitHub Pages 배포

1. 로컬에서 git 초기화 후 원격 저장소 연결
2. 기본 브랜치를 `main`으로 설정
3. push하면 `.github/workflows/deploy-pages.yml`로 자동 배포
4. 저장소 Settings > Pages에서 Build and deployment를 `GitHub Actions`로 설정

`gh` CLI가 설치돼 있으면 더 빠르게 설정할 수 있습니다.
