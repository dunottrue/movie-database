import { useEffect, useRef, useState } from "react";
import { updateMovie } from "../api";
import { useAdmin } from "../admin";
import type { Movie } from "../types";
import GenreTagInput from "./GenreTagInput";

interface Props {
  movie: Movie;
  onClose: () => void;
  onUpdated: (movie: Movie) => void;
}

export default function EditMovieModal({ movie, onClose, onUpdated }: Props) {
  const { token } = useAdmin();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState(movie.title);
  const [year, setYear] = useState(movie.year);
  const [genres, setGenres] = useState<string[]>(movie.genres?.length ? movie.genres : (movie.genre ? movie.genre.split(",").map((s) => s.trim()).filter(Boolean) : []));
  const [description, setDescription] = useState(movie.description);
  const [tags, setTags] = useState<string[]>(movie.tags ?? []);
  const [imdb, setImdb] = useState(movie.ratings?.imdb ?? "");
  const [kinopoisk, setKinopoisk] = useState(movie.ratings?.kinopoisk ?? "");
  const [isNew, setIsNew] = useState(movie.isNew);
  const [newUntil, setNewUntil] = useState(movie.newUntil || "");

  const videoInput = useRef<HTMLInputElement>(null);
  const posterInput = useRef<HTMLInputElement>(null);
  const subtitlesInput = useRef<HTMLInputElement>(null);
  const [video, setVideo] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState(movie.videoUrl && !movie.videoUrl.startsWith("/media/") ? movie.videoUrl : "");
  const [subtitles, setSubtitles] = useState<File | null>(null);
  const [poster, setPoster] = useState<File | null>(null);
  const [posterPreview, setPosterPreview] = useState<string | null>(
    movie.posterUrl.startsWith("/media/") ? movie.posterUrl : null
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim()) return setError("Название не может быть пустым");
    if (videoUrl.trim() && !/^https?:\/\//i.test(videoUrl.trim())) return setError("Ссылка должна начинаться с http:// или https://");
    setBusy(true);
    try {
      const updated = await updateMovie(movie.id, {
        title,
        year,
        genre: genres.join(" "),
        description,
        tags: tags.join(" "),
        imdb,
        kinopoisk,
        isNew,
        newUntil: isNew ? newUntil : "",
        videoUrl: videoUrl.trim() && !video ? videoUrl.trim() : "",
        video: video ?? null,
        subtitles: subtitles ?? null,
        poster,
        adminToken: token ?? "",
      });
      onUpdated(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal" onMouseDown={onClose}>
      <div className="modal-box form-box wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Редактировать фильм</h2>
          <button className="btn close" onClick={onClose} aria-label="Закрыть">✕</button>
        </div>

        <form onSubmit={submit} className="form">
          <label className="field">
            Название *
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

          <div className="row">
            <label className="field">
              Год
              <input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="1999" inputMode="numeric" />
            </label>
            <label className="field">
              Жанры
              <GenreTagInput value={genres} onChange={setGenres} placeholder="Введите жанр и пробел" />
            </label>
          </div>

          <label className="field">
            Описание
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </label>

          <label className="field">
            Теги (видны только в поиске, вводите тег и жмите пробел/Enter)
            <GenreTagInput value={tags} onChange={setTags} placeholder="роботы, киберпанк…" />
          </label>

          <div className="row">
            <label className="field">
              Оценка IMDB
              <input value={imdb} onChange={(e) => setImdb(e.target.value.replace(/[^0-9.,]/g, "").slice(0, 4))} placeholder="8.1" inputMode="decimal" />
            </label>
            <label className="field">
              Оценка Кинопоиск
              <input value={kinopoisk} onChange={(e) => setKinopoisk(e.target.value.replace(/[^0-9.,]/g, "").slice(0, 4))} placeholder="7.6" inputMode="decimal" />
            </label>
          </div>

          <div className="field-check">
            <label className="check">
              <input type="checkbox" checked={isNew} onChange={(e) => setIsNew(e.target.checked)} />
              <span>Показывать в «Новинках» на главной</span>
            </label>
            <label className="field date-field">
              Показывать до
              <input type="date" value={newUntil} min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setNewUntil(e.target.value)} disabled={!isNew} />
            </label>
          </div>

          <label className="file-label">
            <span className="file-label-title">Видеофайл {video ? "" : "(не менять)"}</span>
            <input ref={videoInput} type="file" accept="video/*,.mkv,.avi,.mp4,.mov,.webm"
              onChange={(e) => { setVideo(e.target.files?.[0] ?? null); if (e.target.files?.[0]) setVideoUrl(""); }} />
            {video
              ? <span className="file-name">✓ {video.name} ({(video.size / 1048576).toFixed(0)} МБ)</span>
              : <span className="file-hint">Нажмите, чтобы заменить видео</span>}
          </label>

          <div className="field video-url-field">
            <span className="field-label">либо замените ссылкой на видео (URL)</span>
            <input value={videoUrl} onChange={(e) => { setVideoUrl(e.target.value); if (e.target.value.trim()) setVideo(null); }}
              placeholder="https://…/film.m3u8 или https://…/movie.mp4" />
            {movie.videoUrl && movie.videoUrl.startsWith("/media/") && !videoUrl && !video && (
              <span className="file-hint">Сейчас: {movie.videoUrl}</span>
            )}
          </div>

          <label className="file-label">
            <span className="file-label-title">Субтитры (.srt / .vtt, необязательно){subtitles || movie.subtitles ? "" : " (не менять)"}</span>
            <input ref={subtitlesInput} type="file" accept=".srt,.vtt,text/vtt,application/x-subrip"
              onChange={(e) => setSubtitles(e.target.files?.[0] ?? null)} />
            {subtitles
              ? <span className="file-name">✓ {subtitles.name}</span>
              : <span className="file-hint">{movie.subtitles ? "Заменить существующие субтитры" : "Файла субтитров пока нет"}</span>}
          </label>

          <label className="file-label">
            <span className="file-label-title">Постер {poster || posterPreview ? "" : "(не менять)"}</span>
            <input ref={posterInput} type="file" accept="image/*" onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setPoster(f);
              setPosterPreview(f ? URL.createObjectURL(f) : null);
            }} />
            {posterPreview
              ? <img className="preview" src={posterPreview} alt="Постер" />
              : <span className="file-hint">Нажмите, чтобы заменить постер</span>}
          </label>

          {error && <p className="error">{error}</p>}
          {busy && <div className="progress"><div className="bar" style={{ width: "88%" }} /></div>}

          <div className="modal-actions">
            <button className="btn ghost" type="button" onClick={onClose} disabled={busy}>Отмена</button>
            <button className="btn primary" disabled={busy} type="submit">
              {busy ? "Сохранение…" : "Сохранить"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}