interface FilmImage {
  id: string;
  dataUrl: string;
  title?: string;
}

export function BookFilmCollage({ images }: { images: FilmImage[] }) {
  if (images.length === 0) return null;

  return (
    <div className="book-film-stage book-film-stage--vertical">
      {images.map((img, i) => (
        <div key={img.id} className={`film-frame film-frame--slot-${i}`}>
          <div className="film-frame-mat">
            <img src={img.dataUrl} alt="" />
          </div>
          {img.title ? <div className="film-caption">{img.title}</div> : null}
        </div>
      ))}
    </div>
  );
}
