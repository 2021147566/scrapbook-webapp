/**
 * 메모먼트 꾹꾹체: VITE_MEMOMENT_FONT_*_URL 이 있으면 외부 URL로 @font-face 주입,
 * 없으면 public/fonts 의 로컬 파일(배포 시 레포에 포함된 경우) 사용.
 *
 * 로컬 개발(vite dev)에서는 Firebase Storage URL을 쓰면 @font-face 요청이
 * cross-origin이라 버킷 CORS가 없으면 브라우저가 차단한다. 기본값은 dev에서
 * 로컬 public/fonts만 사용한다. Storage URL로 dev 테스트 시 .env에
 * VITE_MEMOMENT_DEV_USE_STORAGE=true 를 넣고, 버킷에 CORS를 설정한다.
 */
export function injectMemomentFontFace(): void {
  if (document.querySelector('style[data-memoment-font]')) return;

  const part = (url: string, format: 'opentype' | 'truetype') =>
    `url(${JSON.stringify(url)}) format('${format}')`;

  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  const localSrc = `${part(`${base}fonts/MemomentKkukkukk.otf`, 'opentype')}, ${part(`${base}fonts/MemomentKkukkukk.ttf`, 'truetype')}`;

  const useStorageInDev =
    import.meta.env.DEV && import.meta.env.VITE_MEMOMENT_DEV_USE_STORAGE === 'true';

  const otf = import.meta.env.VITE_MEMOMENT_FONT_OTF_URL?.trim();
  const ttf = import.meta.env.VITE_MEMOMENT_FONT_TTF_URL?.trim();

  let src = '';
  if (import.meta.env.DEV && !useStorageInDev) {
    src = localSrc;
  } else {
    if (otf) src += part(otf, 'opentype');
    if (ttf) {
      if (src) src += ', ';
      src += part(ttf, 'truetype');
    }
    if (!src) src = localSrc;
  }

  const style = document.createElement('style');
  style.setAttribute('data-memoment-font', '');
  style.textContent = `@font-face{font-family:'MemomentKkukkuk';src:${src};font-weight:normal;font-style:normal;font-display:swap;}`;
  document.head.appendChild(style);
}

injectMemomentFontFace();
