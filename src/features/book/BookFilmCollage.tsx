import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useReadOnly } from '../../context/ReadOnlyContext';
import { useScrapStore } from '../../store/scrapStore';
import type { ScrapImage } from '../../types';
import { bookFrameTransform } from './bookFrameTransform';

const BASE_FRAME_WIDTH = 280;
const MAX_BASE_OFFSET = 180;

function clampBaseOffset(n: number): number {
  return Math.max(-MAX_BASE_OFFSET, Math.min(MAX_BASE_OFFSET, n));
}

export function BookFilmCollage({ dateKey, images }: { dateKey: string; images: ScrapImage[] }) {
  const readOnly = useReadOnly();
  const setImageBookOffset = useScrapStore((s) => s.setImageBookOffset);
  const frameEls = useRef<Record<string, HTMLDivElement | null>>({});
  const [frameScaleById, setFrameScaleById] = useState<Record<string, number>>({});
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    ox: number;
    oy: number;
    scale: number;
  } | null>(null);

  const measureScale = useCallback((el: HTMLDivElement | null): number => {
    if (!el) return 1;
    const w = el.getBoundingClientRect().width || BASE_FRAME_WIDTH;
    const scale = w / BASE_FRAME_WIDTH;
    return Math.max(0.35, Math.min(2.2, scale));
  }, []);

  const setFrameRef = useCallback(
    (id: string, el: HTMLDivElement | null) => {
      frameEls.current[id] = el;
      const next = measureScale(el);
      setFrameScaleById((prev) => {
        if (Math.abs((prev[id] ?? 1) - next) < 0.01) return prev;
        return { ...prev, [id]: next };
      });
    },
    [measureScale],
  );

  useEffect(() => {
    const onResize = () => {
      const next: Record<string, number> = {};
      for (const img of images) {
        next[img.id] = measureScale(frameEls.current[img.id] ?? null);
      }
      setFrameScaleById((prev) => {
        let changed = false;
        for (const [id, s] of Object.entries(next)) {
          if (Math.abs((prev[id] ?? 1) - s) >= 0.01) {
            changed = true;
            break;
          }
        }
        return changed ? { ...prev, ...next } : prev;
      });
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [images, measureScale]);

  if (images.length === 0) return null;

  const n = images.length;
  const staggerLr = n === 2 || n === 3;

  return (
    <div
      className={clsx(
        'book-film-stage book-film-stage--vertical',
        staggerLr && 'book-film-stage--stagger-lr',
      )}
    >
      {images.map((img, i) => (
        <div
          key={img.id}
          ref={(el) => setFrameRef(img.id, el)}
          className={`film-frame film-frame--slot-${i}`}
          style={{
            zIndex: n - i,
            transform: bookFrameTransform(i, n, {
              x: (img.bookOffset?.x ?? 0) * (frameScaleById[img.id] ?? 1),
              y: (img.bookOffset?.y ?? 0) * (frameScaleById[img.id] ?? 1),
            }),
            touchAction: 'none',
          }}
          onPointerDown={(e) => {
            if (readOnly) return;
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            dragRef.current = {
              pointerId: e.pointerId,
              startX: e.clientX,
              startY: e.clientY,
              ox: img.bookOffset?.x ?? 0,
              oy: img.bookOffset?.y ?? 0,
              scale: measureScale(e.currentTarget as HTMLDivElement),
            };
          }}
          onPointerMove={(e) => {
            if (readOnly) return;
            const d = dragRef.current;
            if (!d || e.pointerId !== d.pointerId) return;
            setImageBookOffset(dateKey, img.id, {
              x: clampBaseOffset(d.ox + (e.clientX - d.startX) / d.scale),
              y: clampBaseOffset(d.oy + (e.clientY - d.startY) / d.scale),
            });
          }}
          onPointerUp={(e) => {
            if (dragRef.current?.pointerId === e.pointerId) {
              dragRef.current = null;
            }
          }}
          onPointerCancel={(e) => {
            if (dragRef.current?.pointerId === e.pointerId) {
              dragRef.current = null;
            }
          }}
        >
          <div className="film-frame-mat">
            <img src={img.dataUrl} alt="" draggable={false} />
          </div>
          {img.title ? <div className="film-caption">{img.title}</div> : null}
        </div>
      ))}
    </div>
  );
}
