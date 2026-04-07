메모먼트 꾹꾹체 (로컬 웹폰트)

필요 파일 (공식 배포에서 받은 그대로, 파일명 정확히):
  - MemomentKkukkukk.otf
  - MemomentKkukkukk.ttf

memoment-face.css 가 위 파일을 읽습니다.

※ GitHub Pages 배포에 포함하려면
  1) 위 두 파일을 이 폴더(public/fonts)에 복사
  2) git add public/fonts/MemomentKkukkukk.otf public/fonts/MemomentKkukkukk.ttf
  3) commit 후 push → 빌드 산출물(dist/fonts)에 같이 올라감

※ OTF는 용량이 클 수 있어, 필요하면 로컬에서 WOFF2로 변환한 뒤
   memoment-face.css 의 src 맨 위에 .woff2 한 줄을 추가하면 로딩이 가벼워집니다.

라이선스: https://www.memoment.kr/font (웹 임베딩 허용 범위·재배포 조건은 반드시 공식 확인)
