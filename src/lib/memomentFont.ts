/**
 * 메모먼트 꾹꾹체: VITE_MEMOMENT_FONT_*_URL 이 있으면 외부 URL로 @font-face 주입,
 * 없으면 public/fonts 의 로컬 파일(배포 시 레포에 포함된 경우) 사용.
 */
export function injectMemomentFontFace(): void {
  if (document.querySelector('style[data-memoment-font]')) return;

  const otf = import.meta.env.VITE_MEMOMENT_FONT_OTF_URL?.trim();
  const ttf = import.meta.env.VITE_MEMOMENT_FONT_TTF_URL?.trim();

  const part = (url: string, format: 'opentype' | 'truetype') =>
    `url(${JSON.stringify(url)}) format('${format}')`;

  let src = '';
  if (otf) src += part(otf, 'opentype');
  if (ttf) {
    if (src) src += ', ';
    src += part(ttf, 'truetype');
  }

  if (!src) {
    const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
    src = `${part(`${base}fonts/MemomentKkukkukk.otf`, 'opentype')}, ${part(`${base}fonts/MemomentKkukkukk.ttf`, 'truetype')}`;
  }

  const style = document.createElement('style');
  style.setAttribute('data-memoment-font', '');
  style.textContent = `@font-face{font-family:'MemomentKkukkuk';src:${src};font-weight:normal;font-style:normal;font-display:swap;}`;
  document.head.appendChild(style);
}

injectMemomentFontFace();
