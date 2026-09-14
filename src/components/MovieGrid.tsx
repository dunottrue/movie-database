import type { Movie } from "../types";
import MovieCard from "./MovieCard";

interface Props {
  movies: Movie[];
  onOpenDetail: (movie: Movie) => void;
  onEdit?: (movie: Movie) => void;
  onDelete?: (movie: Movie) => void;
}

export default function MovieGrid({ movies, onOpenDetail, onEdit, onDelete }: Props) {
  if (movies.length === 0) {
    return (
      <div className="empty">
        <p>База пока пуста.</p>
        <p>Нажмите «Добавить фильм», чтобы загрузить первый фильм.</p>
      </div>
    );
  }

  return (
    <div className="grid">
      {movies.map((movie) => (
        <MovieCard
          key={movie.id}
          movie={movie}
          onOpenDetail={onOpenDetail}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}