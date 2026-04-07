import clsx from 'clsx';
import { useRef } from 'react';
import { useReadOnly } from '../../context/ReadOnlyContext';
import { useScrapStore } from '../../store/scrapStore';
import type { ScrapImage } from '../../types';
import { bookFrameTransform } from './bookFrameTransform';

export function BookFilmCollage({ dateKey, images }: { dateKey: string; images: ScrapImage[] }) {
  const readOnly = useReadOnly();
  const setImageBookOffset = useScrapStore((s) => s.setImageBookOffset);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    ox: number;
    oy: number;
  } | null>(null);

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
            transform: bookFrameTransform(i, n, img.bookOffset),
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
            };
          }}
          onPointerMove={(e) => {
            if (readOnly) return;
            const d = dragRef.current;
            if (!d || e.pointerId !== d.pointerId) return;
            setImageBookOffset(dateKey, img.id, {
              x: d.ox + (e.clientX - d.startX),
              y: d.oy + (e.clientY - d.startY),
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
