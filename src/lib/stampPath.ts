/** 우표형(톱니 테두리) — canvas clip */

export function addStampPath(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const nx = Math.max(5, Math.round(w / 12));
  const ny = Math.max(5, Math.round(h / 12));
  const rx = w / (2 * nx);
  const ry = h / (2 * ny);
  const r = Math.min(rx, ry) * 0.92;

  ctx.beginPath();
  ctx.moveTo(0, r);

  for (let i = 0; i < nx; i++) {
    const cx = r + i * 2 * r;
    ctx.arc(cx, 0, r, Math.PI, 0, true);
  }
  ctx.lineTo(w, r);

  for (let i = 0; i < ny; i++) {
    const cy = r + i * 2 * r;
    ctx.arc(w, cy, r, -Math.PI / 2, Math.PI / 2, true);
  }
  ctx.lineTo(w, h - r);

  for (let i = 0; i < nx; i++) {
    const cx = w - r - i * 2 * r;
    ctx.arc(cx, h, r, 0, Math.PI, true);
  }
  ctx.lineTo(0, h - r);

  for (let i = 0; i < ny; i++) {
    const cy = h - r - i * 2 * r;
    ctx.arc(0, cy, r, Math.PI / 2, -Math.PI / 2, true);
  }
  ctx.closePath();
}

/** CSS clip-path: 퍼센트 좌표 지그재그 테두리 (우표 느낌) */
export function stampClipPathPolygon(): string {
  const n = 14;
  const inset = 2.1;
  const pts: string[] = [];

  for (let i = 0; i <= n; i++) {
    pts.push(`${((100 * i) / n).toFixed(2)}% ${i % 2 === 0 ? '0%' : `${inset}%`}`);
  }
  for (let i = 0; i <= n; i++) {
    pts.push(`${i % 2 === 0 ? '100%' : `${100 - inset}%`} ${((100 * i) / n).toFixed(2)}%`);
  }
  for (let i = 0; i <= n; i++) {
    pts.push(`${((100 * (n - i)) / n).toFixed(2)}% ${(n - i) % 2 === 0 ? '100%' : `${100 - inset}%`}`);
  }
  for (let i = 0; i <= n; i++) {
    pts.push(`${i % 2 === 0 ? '0%' : `${inset}%`} ${((100 * (n - i)) / n).toFixed(2)}%`);
  }

  return `polygon(${pts.join(', ')})`;
}
