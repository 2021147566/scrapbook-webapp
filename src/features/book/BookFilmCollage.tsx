import clsx from 'clsx';

interface FilmImage {
  id: string;
  dataUrl: string;
  title?: string;
}

export function BookFilmCollage({ images }: { images: FilmImage[] }) {
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
          style={{ zIndex: n - i }}
        >
          <div className="film-frame-mat">
            <img src={img.dataUrl} alt="" />
          </div>
          {img.title ? <div className="film-caption">{img.title}</div> : null}
        </div>
      ))}
    </div>
  );
}
