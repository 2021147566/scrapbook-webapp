import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { useReadOnly } from '../../context/ReadOnlyContext';
import { useScrapStore } from '../../store/scrapStore';
import type { ScrapImage } from '../../types';
import { bookFrameTransform } from './bookFrameTransform';

const MAX_BASE_OFFSET = 180;

function clampBaseOffset(n: number): number {
  return Math.max(-MAX_BASE_OFFSET, Math.min(MAX_BASE_OFFSET, n));
}

function calcDesktopLayoutScale(): number {
  if (typeof window === 'undefined') return 1;
  const raw = 0.62 + (window.innerWidth - 980) / 1800;
  return Math.max(0.62, Math.min(1, raw));
}

export function BookFilmCollage({ dateKey, images }: { dateKey: string; images: ScrapImage[] }) {
  const readOnly = useReadOnly();
  const setImageBookOffset = useScrapStore((s) => s.setImageBookOffset);
  const [layoutScale, setLayoutScale] = useState(calcDesktopLayoutScale);
  const [previewOffsetById, setPreviewOffsetById] = useState<Record<string, { x: number; y: number }>>({});
  const rafRef = useRef<number | null>(null);
  const dragRef = useRef<{
    imageId: string;
    pointerId: number;
    startX: number;
    startY: number;
    ox: number;
    oy: number;
    scale: number;
  } | null>(null);

  useEffect(() => {
    const onResize = () => {
      setLayoutScale((prev) => {
        const next = calcDesktopLayoutScale();
        return Math.abs(prev - next) < 0.005 ? prev : next;
      });
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

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
          className={`film-frame film-frame--slot-${i}`}
          style={{
            zIndex: n - i,
            transform: bookFrameTransform(i, n, {
              x: (previewOffsetById[img.id]?.x ?? img.bookOffset?.x ?? 0) * layoutScale,
              y: (previewOffsetById[img.id]?.y ?? img.bookOffset?.y ?? 0) * layoutScale,
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
              imageId: img.id,
              pointerId: e.pointerId,
              startX: e.clientX,
              startY: e.clientY,
              ox: img.bookOffset?.x ?? 0,
              oy: img.bookOffset?.y ?? 0,
              scale: layoutScale,
            };
          }}
          onPointerMove={(e) => {
            if (readOnly) return;
            const d = dragRef.current;
            if (!d || e.pointerId !== d.pointerId) return;
            const nx = clampBaseOffset(d.ox + (e.clientX - d.startX) / d.scale);
            const ny = clampBaseOffset(d.oy + (e.clientY - d.startY) / d.scale);
            if (rafRef.current !== null) return;
            rafRef.current = window.requestAnimationFrame(() => {
              rafRef.current = null;
              setPreviewOffsetById((prev) => {
                const cur = prev[d.imageId];
                if (cur && Math.abs(cur.x - nx) < 0.2 && Math.abs(cur.y - ny) < 0.2) return prev;
                return { ...prev, [d.imageId]: { x: nx, y: ny } };
              });
            });
          }}
          onPointerUp={(e) => {
            if (dragRef.current?.pointerId === e.pointerId) {
              const d = dragRef.current;
              const pv = previewOffsetById[d.imageId];
              if (pv) {
                setImageBookOffset(dateKey, d.imageId, { x: pv.x, y: pv.y });
                setPreviewOffsetById((prev) => {
                  const { [d.imageId]: _, ...rest } = prev;
                  return rest;
                });
              }
              dragRef.current = null;
            }
          }}
          onPointerCancel={(e) => {
            if (dragRef.current?.pointerId === e.pointerId) {
              const id = dragRef.current.imageId;
              setPreviewOffsetById((prev) => {
                const { [id]: _, ...rest } = prev;
                return rest;
              });
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
