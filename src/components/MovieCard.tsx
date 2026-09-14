import type { CSSProperties } from "react";
import type { Movie } from "../types";
import { formatSize } from "../api";
import { usePosterColors } from "../colors";

interface Props {
  movie: Movie;
  onOpenDetail: (movie: Movie) => void;
  onEdit?: (movie: Movie) => void;
  onDelete?: (movie: Movie) => void;
  news?: boolean;
}

export default function MovieCard({ movie, onOpenDetail, onEdit, onDelete, news }: Props) {
  const [c1, c2, c3] = usePosterColors(movie.posterUrl);
  const hasAdmin = !!(onEdit || onDelete);
  const isHot = movie.isNew && (!movie.newUntil || movie.newUntil >= new Date().toISOString().slice(0, 10));

  if (news) {
    return (
      <div
        className="card news-card"
        style={{ "--c1": c1, "--c2": c2, "--c3": c3 } as CSSProperties}
      >
        <div className="poster" onClick={() => onOpenDetail(movie)} role="button" title="Открыть страницу фильма">
          <img src={movie.posterUrl} alt={movie.title} loading="lazy" decoding="async" />
          {isHot && <span className="badge-new">NEW</span>}
          {typeof movie.siteRating === "number" && movie.voteCount > 0 && (
            <span className="badge-rating">★ {movie.siteRating.toFixed(1)}</span>
          )}
          <div className="poster-overlay">
            <button className="play-btn" onClick={(e) => { e.stopPropagation(); onOpenDetail(movie); }} aria-label="Открыть страницу фильма">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          </div>
          <div className="news-caption">
            <h3>{movie.title}</h3>
            {movie.year && <span className="news-year">{movie.year}</span>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="card"
      style={{ "--c1": c1, "--c2": c2, "--c3": c3 } as CSSProperties}
    >
      <div className="poster" onClick={() => onOpenDetail(movie)} role="button" title="Открыть страницу фильма">
        <img src={movie.posterUrl} alt={movie.title} loading="lazy" decoding="async" />
        {isHot && <span className="badge-new">NEW</span>}
        {typeof movie.siteRating === "number" && movie.voteCount > 0 && (
          <span className="badge-rating">★ {movie.siteRating.toFixed(1)}</span>
        )}
        <div className="poster-overlay">
          <button className="play-btn" onClick={(e) => { e.stopPropagation(); onOpenDetail(movie); }} aria-label="Открыть страницу фильма">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="card-info" onClick={() => onOpenDetail(movie)} role="link" tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onOpenDetail(movie)}>
        <h3>{movie.title}</h3>
        <div className="card-meta">
          {movie.year && <span>{movie.year}</span>}
          {movie.videoSize != null && movie.videoSize > 0 && <span>{formatSize(movie.videoSize)}</span>}
        </div>
        {movie.description && <p className="desc">{movie.description}</p>}
        <div className="card-footer">
          <span className="more-link">
            Подробнее
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
          {hasAdmin && (
            <span className="card-admin">
              {onEdit && (
                <button className="icon-btn" title="Редактировать" onClick={(e) => { e.stopPropagation(); onEdit(movie); }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
                  </svg>
                </button>
              )}
              {onDelete && (
                <button className="icon-btn danger" title="Удалить" onClick={(e) => { e.stopPropagation(); onDelete(movie); }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  </svg>
                </button>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}