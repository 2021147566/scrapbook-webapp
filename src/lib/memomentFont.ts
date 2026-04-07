/**
 * 메모먼트 꾹꾹체: public/fonts 로컬 파일 또는 VITE_MEMOMENT_FONT_*_URL.
 *
 * GitHub Pages 등 다른 출처(Storage)에서 폰트를 불러오면 버킷 CORS가 없으면
 * 브라우저가 @font-face 를 막는다. 프로덕션 빌드는 기본으로 로컬 폰트만 쓴다.
 * Storage URL을 꼭 쓰려면 버킷 CORS에 Pages origin을 넣거나
 * VITE_MEMOMENT_FORCE_REMOTE_FONTS=true 로 강제한다.
 *
 * 로컬 dev: 기본은 public/fonts. Storage 테스트 시 VITE_MEMOMENT_DEV_USE_STORAGE=true
 */
export function injectMemomentFontFace(): void {
  if (document.querySelector('style[data-memoment-font]')) return;

  const part = (url: string, format: 'opentype' | 'truetype') =>
    `url(${JSON.stringify(url)}) format('${format}')`;

  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  const localSrc = `${part(`${base}fonts/MemomentKkukkukk.otf`, 'opentype')}, ${part(`${base}fonts/MemomentKkukkukk.ttf`, 'truetype')}`;

  const useStorageInDev =
    import.meta.env.DEV && import.meta.env.VITE_MEMOMENT_DEV_USE_STORAGE === 'true';

  const forceRemote =
    import.meta.env.PROD && import.meta.env.VITE_MEMOMENT_FORCE_REMOTE_FONTS === 'true';

  const otf = import.meta.env.VITE_MEMOMENT_FONT_OTF_URL?.trim();
  const ttf = import.meta.env.VITE_MEMOMENT_FONT_TTF_URL?.trim();

  let src = '';
  if (import.meta.env.DEV && !useStorageInDev) {
    src = localSrc;
  } else if (import.meta.env.PROD && !forceRemote) {
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
