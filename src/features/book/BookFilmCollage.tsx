type LayoutKey = 'n1' | 'n2' | 'n3' | 'many';

function layoutForCount(n: number): LayoutKey {
  if (n <= 0) return 'n1';
  if (n === 1) return 'n1';
  if (n === 2) return 'n2';
  if (n === 3) return 'n3';
  return 'many';
}

interface FilmImage {
  id: string;
  dataUrl: string;
}

export function BookFilmCollage({ images }: { images: FilmImage[] }) {
  if (images.length === 0) return null;

  const layout = layoutForCount(images.length);

  return (
    <div className={`book-film-stage book-film-stage--${layout}`}>
      {images.map((img, i) => (
        <div key={img.id} className={`film-frame film-frame--slot-${i}`}>
          <div className="film-frame-mat">
            <img src={img.dataUrl} alt="" />
          </div>
        </div>
      ))}
    </div>
  );
}
