/** 책 모드 기본 기울임·스태거(기존 CSS와 동일). 사용자 이동은 앞에 translate 로 합성. */

export function defaultBookFrameTransform(index: number, total: number): string {
  const stagger = total === 2 || total === 3;
  if (stagger) {
    const odd = index % 2 === 0;
    return odd ? 'rotate(-5deg) translateX(-12px)' : 'rotate(5deg) translateX(12px)';
  }
  const mod = index % 4;
  if (mod === 0) return 'rotate(-4deg)';
  if (mod === 1) return 'rotate(5deg)';
  if (mod === 2) return 'rotate(-3deg)';
  return 'rotate(6deg)';
}

export function bookFrameTransform(
  index: number,
  total: number,
  offset?: { x: number; y: number } | null,
): string {
  const ox = offset?.x ?? 0;
  const oy = offset?.y ?? 0;
  const base = defaultBookFrameTransform(index, total);
  if (ox === 0 && oy === 0) return base;
  return `translate(${ox}px, ${oy}px) ${base}`;
}
