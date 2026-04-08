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
  const dragRef = useRef<{
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
              x: (img.bookOffset?.x ?? 0) * layoutScale,
              y: (img.bookOffset?.y ?? 0) * layoutScale,
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
              scale: layoutScale,
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
