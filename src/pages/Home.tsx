import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { deleteMovie, fetchMovies } from "../api";
import { useAdmin } from "../admin";
import type { Movie, SortDir, SortField } from "../types";
import { SORT_LABELS } from "../types";
import EditMovieModal from "../components/EditMovieModal";
import MovieCard from "../components/MovieCard";
import MovieGrid from "../components/MovieGrid";

function isHot(m: Movie, today: string): boolean {
  return m.isNew && (!m.newUntil || m.newUntil >= today);
}

function toNum(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function sortMovies(list: Movie[], field: SortField, dir: SortDir): Movie[] {
  const mult = dir === "desc" ? -1 : 1;
  return [...list].sort((a, b) => {
    let r: number;
    switch (field) {
      case "title":
        r = a.title.localeCompare(b.title, "ru");
        break;
      case "year": {
        const x = toNum(a.year), y = toNum(b.year);
        r = x == null && y == null ? 0 : x == null ? 1 : y == null ? -1 : (x - y) * mult;
        break;
      }
      case "size":
        r = ((a.videoSize ?? 0) - (b.videoSize ?? 0)) * mult;
        break;
      case "rating": {
        const x = toNum(a.siteRating), y = toNum(b.siteRating);
        r = x == null && y == null ? 0 : x == null ? 1 : y == null ? -1 : (x - y) * mult;
        break;
      }
      case "imdb": {
        const x = toNum(a.ratings?.imdb), y = toNum(b.ratings?.imdb);
        r = x == null && y == null ? 0 : x == null ? 1 : y == null ? -1 : (x - y) * mult;
        break;
      }
      case "kp": {
        const x = toNum(a.ratings?.kinopoisk), y = toNum(b.ratings?.kinopoisk);
        r = x == null && y == null ? 0 : x == null ? 1 : y == null ? -1 : (x - y) * mult;
        break;
      }
      default:
        r = a.addedAt.localeCompare(b.addedAt) * mult;
    }
    if (r === 0) r = a.title.localeCompare(b.title, "ru");
    return r;
  });
}

export default function Home() {
  const navigate = useNavigate();
  const params = useParams<{ genre: string }>();
  const genre = params.genre ? decodeURIComponent(params.genre) : "";
  const { token, requireAuth } = useAdmin();

  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortField>("added");
  const [dir, setDir] = useState<SortDir>("desc");
  const [editTarget, setEditTarget] = useState<Movie | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Movie | null>(null);
  const [busy, setBusy] = useState(false);
  const newsScroller = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchMovies();
      setMovies(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить базу");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const today = new Date().toISOString().slice(0, 10);
  const news = useMemo(() => movies.filter((m) => isHot(m, today)), [movies, today]);

  const updateArrows = useCallback(() => {
    const el = newsScroller.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = newsScroller.current;
    if (!el) return;
    updateArrows();
    const t = setTimeout(updateArrows, 400);
    window.addEventListener("resize", updateArrows);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", updateArrows);
    };
  }, [news, updateArrows]);

  function scrollNews(dir: number) {
    const el = newsScroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.85, 320), behavior: "smooth" });
  }

  const allGenres = useMemo(() => {
    const set = new Set<string>();
    for (const m of movies) for (const g of m.genres ?? []) if (g) set.add(g);
    return [...set].sort((a, b) => a.localeCompare(b, "ru"));
  }, [movies]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = movies.filter((m) => {
      if (genre && !(m.genres ?? []).some((g) => g.toLowerCase() === genre.toLowerCase())) return false;
      if (!q) return true;
      const tagsMatch = (m.tags ?? []).some((t) => t.toLowerCase().includes(q));
      return (
        tagsMatch ||
        m.title.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.year.includes(q)
      );
    });
    return sortMovies(list, sort, dir);
  }, [movies, query, genre, sort, dir]);

  async function openEdit(m: Movie) {
    try {
      await requireAuth();
      setEditTarget(m);
    } catch {
      /* отменено */
    }
  }

  async function openDelete(m: Movie) {
    try {
      await requireAuth();
      setDeleteTarget(m);
    } catch {
      /* отменено */
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteMovie(deleteTarget.id, token ?? "");
      setMovies((prev) => prev.filter((m) => m.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить фильм");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="main">
      <div className="toolbar">
        <div className="search-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            className="search"
            type="search"
            placeholder="Поиск по названию, описанию, тегам, году…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          value={genre}
          onChange={(e) => {
            const v = e.target.value;
            navigate(v ? `/genre/${encodeURIComponent(v)}` : "/");
          }}
          className="genre-select"
          title="Жанр"
        >
          <option value="">Все жанры</option>
          {allGenres.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <div className="sort-group" title="Сортировка">
          <select value={sort} onChange={(e) => setSort(e.target.value as SortField)}>
            {(Object.keys(SORT_LABELS) as SortField[]).map((f) => (
              <option key={f} value={f}>{SORT_LABELS[f]}</option>
            ))}
          </select>
          <button
            className="btn dir-btn"
            onClick={() => setDir((d) => (d === "desc" ? "asc" : "desc"))}
            title={dir === "desc" ? "По убыванию → по возрастанию" : "По возрастанию → по убыванию"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              {dir === "desc" ? (
                <path d="M12 5v14M6 13l6 6 6-6" />
              ) : (
                <path d="M12 19V5M6 11l6-6 6 6" />
              )}
            </svg>
            <span>{dir === "desc" ? "по убыванию" : "по возрастанию"}</span>
          </button>
        </div>
      </div>

      {genre && (
        <div className="genre-breadcrumb">
          <span className="genre-breadcrumb-label">Жанр:</span>
          <span className="chip chip-link-chip">{genre}</span>
          <button className="btn ghost btn-clear-genre" onClick={() => navigate("/")} title="Показать все жанры">✕ Сбросить</button>
        </div>
      )}

      {news.length > 0 && (
        <section className="block news-block">
          <h2 className="block-title news-title">
            <span className="new-flame">✦</span> Новинки
          </h2>
          <div className="news-scroller">
            <button
              className="news-arrow left"
              onClick={() => scrollNews(-1)}
              disabled={!canLeft}
              aria-label="Прокрутить новинки назад"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
            <div className="row-scroll" ref={newsScroller} onScroll={updateArrows}>
              {news.map((m) => (
                <MovieCard
                  key={m.id}
                  movie={m}
                  news
                  onOpenDetail={(mm) => navigate(`/movie/${mm.id}`)}
                />
              ))}
            </div>
            <button
              className="news-arrow right"
              onClick={() => scrollNews(1)}
              disabled={!canRight}
              aria-label="Прокрутить новинки вперёд"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </section>
      )}

      <div className="count">{filtered.length} из {movies.length}</div>

      {error && !loading && <p className="error">{error}</p>}

      {loading ? (
        <div className="grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card skeleton"><div className="skel-poster" /><div className="skel-line wide" /><div className="skel-line" /><div className="skel-line short" /></div>
          ))}
        </div>
      ) : (
        <MovieGrid
          movies={filtered}
          onOpenDetail={(m) => navigate(`/movie/${m.id}`)}
          onEdit={token ? openEdit : undefined}
          onDelete={token ? openDelete : undefined}
        />
      )}

      {editTarget && (
        <EditMovieModal
          movie={editTarget}
          onClose={() => setEditTarget(null)}
          onUpdated={(updated) =>
            setMovies((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
          }
        />
      )}

      {deleteTarget && (
        <div className="modal" onMouseDown={() => setDeleteTarget(null)}>
          <div className="modal-box confirm-box" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Удалить «{deleteTarget.title}»?</h2>
              <button className="btn close" onClick={() => setDeleteTarget(null)} aria-label="Закрыть">✕</button>
            </div>
            <p>Видео и постер будут удалены с диска. Это действие нельзя отменить.</p>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setDeleteTarget(null)}>Отмена</button>
              <button className="btn danger" onClick={confirmDelete} disabled={busy}>
                {busy ? "Удаление…" : "Удалить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}