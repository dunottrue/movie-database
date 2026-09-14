import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  addComment,
  addWatched,
  adminDeleteUser,
  adminGetUser,
  adminNotifyUser,
  adminSetUserBlocked,
  createPlaylist,
  deleteComment,
  deleteMovie,
  editComment,
  fetchMovie,
  fetchMovies,
  formatDate,
  formatSize,
  rateMovie,
  updatePlaylist,
  voterId,
  type AdminUser,
} from "../api";
import { useAdmin } from "../admin";
import { useUser } from "../user";
import { findSimilar } from "../similar";
import type { Comment, Movie } from "../types";
import EditMovieModal from "../components/EditMovieModal";
import Player from "../components/Player";
import MovieCard from "../components/MovieCard";
import Stars from "../components/Stars";

interface Node {
  comment: Comment;
  children: Node[];
}

function buildTree(comments: Comment[]): Node[] {
  const map = new Map<string, Node>();
  const roots: Node[] = [];
  const sorted = [...comments].sort(
    (a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime()
  );
  for (const c of sorted) map.set(c.id, { comment: c, children: [] });
  for (const c of sorted) {
    if (c.parentId && map.has(c.parentId)) map.get(c.parentId)!.children.push(map.get(c.id)!);
    else roots.push(map.get(c.id)!);
  }
  return roots;
}

function CommentItem({
  movieId,
  node,
  depth,
  replyingTo,
  onReply,
  onDeleteComment,
  onEditComment,
  canDelete,
  currentUserId,
  onModerate,
}: {
  movieId: string;
  node: Node;
  depth: number;
  replyingTo: Comment | null;
  onReply: (comment: Comment) => void;
  onDeleteComment: (id: string) => void;
  onEditComment: (id: string, text: string) => Promise<void>;
  canDelete: boolean;
  currentUserId: string | null;
  onModerate?: (authorId: string, name: string) => void;
}) {
  const { comment, children } = node;
  const isReplying = replyingTo?.id === comment.id;
  const editable = canDelete || !!currentUserId;
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");

  function startEdit() {
    setEditText(comment.text);
    setEditing(true);
  }

  async function saveEdit() {
    const t = editText.trim();
    if (!t) return;
    await onEditComment(comment.id, t);
    setEditing(false);
  }

  return (
    <li id={`c-${comment.id}`} className={`comment depth-${Math.min(depth, 3)}${isReplying ? " replying" : ""}`}>
      <div className="comment-head">
        {onModerate && comment.authorId ? (
          <button className="comment-name admin" onClick={() => onModerate(comment.authorId!, comment.name)} title="Управление пользователем">
            {comment.name}
          </button>
        ) : (
          <span className="comment-name">{comment.name}</span>
        )}
        <span className="comment-date">{formatDate(comment.addedAt)}{comment.editedAt ? " · изм." : ""}</span>
        {editable && (
          <span className="comment-own">
            <button className="reply-btn" onClick={editing ? () => setEditing(false) : startEdit}>
              {editing ? "Отмена" : "✎ Изменить"}
            </button>
            {canDelete && (
              <button className="icon-btn danger" title="Удалить комментарий" onClick={() => onDeleteComment(comment.id)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                </svg>
              </button>
            )}
          </span>
        )}
        <button className="reply-btn" onClick={() => onReply(comment)}>
          {isReplying ? "Отмена" : "Ответить"}
        </button>
      </div>
      {editing ? (
        <div className="comment-edit">
          <textarea value={editText} onChange={(e) => setEditText(e.target.value)} maxLength={4000} rows={3} autoFocus />
          <button className="btn primary small" onClick={saveEdit}>Сохранить</button>
        </div>
      ) : (
        <p className="comment-text">{comment.text}</p>
      )}

      {children.length > 0 && (
        <ul className="comment-list nested">
          {children.map((ch) => (
            <CommentItem
              key={ch.comment.id}
              movieId={movieId}
              node={ch}
              depth={depth + 1}
              replyingTo={replyingTo}
              onReply={onReply}
              onDeleteComment={onDeleteComment}
              onEditComment={onEditComment}
              canDelete={canDelete}
              currentUserId={currentUserId}
              onModerate={onModerate}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function MoviePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { token, requireAuth } = useAdmin();
  const { user, profile, refresh, openAuth } = useUser();

  const [movie, setMovie] = useState<Movie | null>(null);
  const [allMovies, setAllMovies] = useState<Movie[]>([]);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [editing, setEditing] = useState(false);

  const [cName, setCName] = useState("");
  const [cText, setCText] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [cBusy, setCBusy] = useState(false);
  const [cError, setCError] = useState("");
  const [voteBusy, setVoteBusy] = useState(false);
  const [plShow, setPlShow] = useState(false);
  const [plDraft, setPlDraft] = useState("");
  const [modUser, setModUser] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError("");
    try {
      const [m, list] = await Promise.all([fetchMovie(id), fetchMovies()]);
      setMovie(m);
      setAllMovies(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить фильм");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!playing) return;
    const el = document.getElementById("theater");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [playing]);

  const similar = useMemo(() => (movie ? findSimilar(movie, allMovies) : []), [movie, allMovies]);
  const tree = useMemo(() => buildTree(movie?.comments ?? []), [movie]);
  const myVote = movie?.votes?.find((v) => v.voter === voterId())?.value ?? null;

  useEffect(() => {
    const m = location.hash.match(/^#c-(.+)$/);
    if (!m) return;
    const el = document.getElementById("c-" + m[1]);
    if (!el) return;
    const t = setTimeout(() => {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.add("flash");
      setTimeout(() => el.classList.remove("flash"), 2600);
      window.history.replaceState(null, "", location.pathname);
    }, 400);
    return () => clearTimeout(t);
  }, [location, movie, tree]);

  const sendComment = useCallback(
    async () => {
      setCError("");
      if (!movie || !(user?.name || cName).trim()) return setCError("Укажите имя");
      if (!cText.trim()) return setCError("Напишите комментарий");
      setCBusy(true);
      try {
        await addComment(movie.id, { name: (user?.name || cName).trim(), text: cText.trim(), parentId: replyTo?.id ?? null });
        setCText("");
        setReplyTo(null);
        await load();
      } catch (err) {
        setCError(err instanceof Error ? err.message : "Не удалось отправить комментарий");
      } finally {
        setCBusy(false);
      }
    },
    [movie, cName, cText, replyTo, load, user]
  );

  async function onDeleteComment(cid: string) {
    if (!movie) return;
    try {
      await deleteComment(movie.id, cid, token ?? "");
      await load();
    } catch {
      /* отменено */
    }
  }

  async function onEditComment(cid: string, text: string) {
    if (!movie) return;
    try {
      await editComment(movie.id, cid, text);
      await load();
    } catch {
      /* отменено */
    }
  }

  async function onDeleteMovie() {
    if (!movie) return;
    try {
      await requireAuth();
      await deleteMovie(movie.id, token ?? "");
      navigate("/");
    } catch {
      /* отменено */
    }
  }

  async function onRate(value: number) {
    if (!movie) return;
    setVoteBusy(true);
    try {
      const updated = await rateMovie(movie.id, voterId(), value);
      setMovie(updated);
    } catch (e) {
      setCError(e instanceof Error ? e.message : "Не удалось сохранить оценку");
    } finally {
      setVoteBusy(false);
    }
  }

  async function onTogglePlay() {
    setPlaying((p) => !p);
    if (!user || playing || !movie) return;
    try {
      await addWatched(movie.id);
      await refresh();
    } catch { /* не критично */ }
  }

  async function onPlaylistPick() {
    if (!movie) return;
    if (!user) {
      const ok = await openAuth();
      if (!ok) return;
    }
    if (!user) return;
    if (!profile) await refresh();
    setPlShow(true);
  }

  async function onToggleInPlaylist(plId: string, has: boolean) {
    if (!movie || !profile) return;
    try {
      await updatePlaylist(plId, {
        title: profile.playlists.find((p) => p.id === plId)?.title ?? "",
        movieIds: has
          ? profile.playlists.find((p) => p.id === plId)!.movieIds.filter((x) => x !== movie.id)
          : [...(profile.playlists.find((p) => p.id === plId)!.movieIds ?? []), movie.id],
      });
      await refresh();
    } catch { /* ignore */ }
  }

  async function onCreatePlaylistQuick() {
    if (!movie || !plDraft.trim()) return;
    try {
      await createPlaylist({ title: plDraft.trim(), movieIds: [movie.id] });
      setPlDraft("");
      await refresh();
    } catch { /* ignore */ }
  }

  if (!movie) {
    return (
      <div className="page">
        <div className="loading">
          {error ? (
            <>
              <p className="error">{error}</p>
              <Link className="btn ghost" to="/">← На главную</Link>
            </>
          ) : (
            <span className="loader-spinner" aria-label="Загрузка" />
          )}
        </div>
      </div>
    );
  }

  const comments = movie.comments ?? [];

  return (
    <div className="page movie-page">
      <div className="hero">
        <div className="hero-backdrop"><img src={movie.posterUrl} alt="" aria-hidden="true" /></div>
        <div className="hero-content">
          <div className="hero-poster">
            <img src={movie.posterUrl} alt={movie.title} />
          </div>
          <div className="hero-info">
            <div className="hero-top">
              <button className="btn back" onClick={() => navigate(-1)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M19 12H5M11 18l-6-6 6-6" />
                </svg>
                Назад
              </button>
              {token && (
                <div className="hero-admin">
                  {!editing && (
                    <button className="btn ghost" onClick={() => setEditing(true)}>✎ Редактировать</button>
                  )}
                  <button className="btn danger ghost" onClick={onDeleteMovie}>Удалить</button>
                </div>
              )}
            </div>
            <h1>{movie.title}</h1>
            <div className="hero-meta">
              {movie.year && <span className="chip">{movie.year}</span>}
              {(movie.genres && movie.genres.length > 0
                ? movie.genres
                : movie.genre
                  ? movie.genre.split(",").map((s) => s.trim()).filter(Boolean)
                  : []
              ).map((g) => (
                <Link key={g} to={`/genre/${encodeURIComponent(g)}`} className="chip chip-link" title={`Показать все фильмы жанра «${g}»`}>
                  {g}
                </Link>
              ))}
              {movie.videoSize != null && movie.videoSize > 0 && <span className="chip">{formatSize(movie.videoSize)}</span>}
            </div>
            {movie.description && <p className="hero-desc">{movie.description}</p>}
            <div className="hero-actions">
              {movie.videoUrl ? (
                <button className="btn play-hero" onClick={onTogglePlay}>
                  {playing ? "⏸ Скрыть плеер" : "▶ Смотреть"}
                </button>
              ) : (
                <span className="chip no-video" title="Видео добавит администратор вручную">Видео ещё нет</span>
              )}
              <button className="btn ghost" onClick={onPlaylistPick}>В плейлист</button>
            </div>
          </div>
        </div>
      </div>

      {playing && movie.videoUrl && (
        <div className="theater" id="theater">
          <div className="theater-frame">
            <div className="theater-head">
              <span className="theater-title">▶ {movie.title}</span>
              <button className="theater-close" onClick={() => setPlaying(false)} aria-label="Скрыть плеер">✕</button>
            </div>
            <div className="theater-video">
              <Player
                src={movie.videoUrl}
                subtitlesUrl={movie.subtitles ?? null}
                onClose={() => setPlaying(false)}
              />
            </div>
          </div>
        </div>
      )}

      <div className="detail-body">
        <section className="block ratings-block">
          <h2 className="block-title">Рейтинг</h2>
          <div className="ratings">
            <div className="rating-card site">
              <div className="rating-label">Оценка сайта</div>
              <div className="rating-value big">
                {movie.siteRating != null ? movie.siteRating.toFixed(1) : "—"}
                <span className="rating-scale">/ 10</span>
              </div>
              <Stars value={myVote ?? movie.siteRating ?? 0} size="sm" onChange={onRate} />
              <div className="rating-hint">
                {myVote
                  ? `Ваша оценка: ${myVote}`
                  : voteBusy
                    ? "Сохранение…"
                    : "Нажмите на звёзды, чтобы оценить"}
                {movie.voteCount > 0 && <span className="count-badge">{movie.voteCount} {plural(movie.voteCount)}</span>}
              </div>
            </div>
            <div className="rating-card">
              <div className="rating-label">IMDB</div>
              <div className="rating-value big">
                {movie.ratings?.imdb || "—"}
                <span className="rating-scale">/ 10</span>
              </div>
            </div>
            <div className="rating-card">
              <div className="rating-label">Кинопоиск</div>
              <div className="rating-value big">
                {movie.ratings?.kinopoisk || "—"}
                <span className="rating-scale">/ 10</span>
              </div>
            </div>
          </div>
        </section>

        {similar.length > 0 && (
          <section className="block">
            <h2 className="block-title">Похожие по сюжету</h2>
            <div className="grid small">
              {similar.map((m) => (
                <MovieCard key={m.id} movie={m}
                  onOpenDetail={(mm: Movie) => navigate(`/movie/${mm.id}`)} />
              ))}
            </div>
          </section>
        )}

        <section className="block comments">
          <h2 className="block-title">Комментарии <span className="count-badge">{comments.length}</span></h2>

          <form className="comment-form" onSubmit={(e) => { e.preventDefault(); sendComment(); }}>
            <input
              className="name-input"
              placeholder="Ваше имя"
              value={user ? user.name : cName}
              maxLength={40}
              disabled={!!user}
              onChange={(e) => setCName(e.target.value)}
              title={user ? "Вы вошли как " + user.name : ""}
            />
            <div className="comment-row">
              <div className="comment-editor">
                {replyTo && (
                  <span className="reply-chip">
                    <span className="reply-chip-label">Ответ для</span>
                    {replyTo.name}
                    <button
                      type="button"
                      className="reply-chip-x"
                      title="Убрать → обычный комментарий"
                      onClick={() => setReplyTo(null)}
                    >
                      ✕
                    </button>
                  </span>
                )}
                <textarea
                  placeholder={replyTo ? `Ответить ${replyTo.name}…` : "Поделитесь впечатлением о фильме…"}
                  value={cText}
                  maxLength={4000}
                  autoFocus={!!replyTo}
                  rows={3}
                  onChange={(e) => setCText(e.target.value)}
                />
              </div>
              <button className="btn primary" type="submit" disabled={cBusy || !(user?.name || cName).trim() || !cText.trim()}>
                {replyTo ? "Ответить" : "Отправить"}
              </button>
            </div>
            {cError && <p className="error">{cError}</p>}
          </form>

          {tree.length === 0 ? (
            <p className="no-comments">Пока нет комментариев. Станьте первым!</p>
          ) : (
            <ul className="comment-list">
              {tree.map((n) => (
                <CommentItem
                  key={n.comment.id}
                  movieId={movie.id}
                  node={n}
                  depth={0}
                  replyingTo={replyTo}
                  onReply={(comment) => setReplyTo((cur) => (cur?.id === comment.id ? null : comment))}
                  onDeleteComment={onDeleteComment}
                  onEditComment={onEditComment}
                  canDelete={!!token}
                  currentUserId={user?.id ?? null}
                  onModerate={token ? (authorId, name) => setModUser({ id: authorId, name }) : undefined}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      {plShow && (
        <div className="modal" onMouseDown={() => setPlShow(false)}>
          <div className="modal-box pl-box" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Плейлист</h2>
              <button className="btn close" onClick={() => setPlShow(false)} aria-label="Закрыть">✕</button>
            </div>
            {(profile?.playlists ?? []).length === 0 ? (
              <p className="pl-empty">Плейлистов пока нет. Создайте первый ниже.</p>
            ) : (
              <div className="pl-list">
                {(profile?.playlists ?? []).map((p) => {
                  const has = (p.movieIds ?? []).includes(movie.id);
                  return (
                    <button key={p.id} className={`chip-btn ${has ? "active" : ""}`} onClick={() => onToggleInPlaylist(p.id, has)}>
                      {has ? "✓ " : "+ "}{p.title}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="pl-create">
              <input className="search" value={plDraft} onChange={(e) => setPlDraft(e.target.value)} placeholder="Новый плейлист" onKeyDown={(e) => { if (e.key === "Enter") onCreatePlaylistQuick(); }} />
              <button className="btn primary small" onClick={onCreatePlaylistQuick} disabled={!plDraft.trim()}>Создать</button>
            </div>
          </div>
        </div>
      )}

      {modUser && (
        <AdminUserMenu
          userId={modUser.id}
          userName={modUser.name}
          token={token ?? ""}
          onClose={() => setModUser(null)}
          onDeleted={() => load()}
        />
      )}

      {editing && movie && (
        <EditMovieModal
          movie={movie}
          onClose={() => setEditing(false)}
          onUpdated={(updated) => {
            setMovie(updated);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function plural(n: number) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "голос";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "голоса";
  return "голосов";
}

function AdminUserMenu({ userId, userName, token, onClose, onDeleted }: {
  userId: string;
  userName: string;
  token: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [data, setData] = useState<AdminUser | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyText, setNotifyText] = useState("");
  const [notifySent, setNotifySent] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let alive = true;
    setError("");
    adminGetUser(userId, token)
      .then((u) => {
        if (!alive) return;
        setData(u);
        setNotifySent(false);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Не удалось загрузить пользователя"));
    return () => {
      alive = false;
    };
  }, [userId, token]);

  async function toggleBlock() {
    if (!data || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await adminSetUserBlocked(userId, !data.blocked, token);
      setData((d) => (d ? { ...d, blocked: r.blocked } : d));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Операция не выполнена");
    } finally {
      setBusy(false);
    }
  }

  async function sendNotify() {
    if (!notifyText.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await adminNotifyUser(userId, notifyText.trim(), token);
      setNotifyText("");
      setNotifySent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить сообщение");
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await adminDeleteUser(userId, token);
      onDeleted();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить пользователя");
      setBusy(false);
    }
  }

  return (
    <div className="modal" onMouseDown={onClose}>
      <div className="modal-box user-menu-box" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Пользователь: {data?.name ?? userName}</h2>
          <button className="btn close" onClick={onClose} aria-label="Закрыть">✕</button>
        </div>
        {error && <p className="error">{error}</p>}
        {!data && !error && <p className="muted">Загрузка…</p>}
        {data && !confirmDelete && (
          <div className="user-menu-list">
            <button className="btn ghost" onClick={() => { setNotifyOpen((v) => !v); setNotifySent(false); }}>
              {notifyOpen ? "Скрыть отправку" : "Уведомить"}
            </button>
            <button className="btn ghost" onClick={toggleBlock} disabled={busy}>
              {data.blocked ? "Разблокировать" : "Заблокировать"}
            </button>
            <button className="btn danger" onClick={() => setConfirmDelete(true)}>Удалить</button>

            {notifyOpen && (
              <div className="notify-form">
                <textarea
                  rows={3}
                  value={notifyText}
                  onChange={(e) => setNotifyText(e.target.value)}
                  maxLength={500}
                  placeholder="Текст появится в уведомлениях пользователя"
                />
                <div className="modal-actions">
                  <button className="btn primary small" onClick={sendNotify} disabled={busy || !notifyText.trim()}>
                    {busy ? "Отправка…" : "Отправить"}
                  </button>
                </div>
                {notifySent && <p className="muted ok">Уведомление отправлено</p>}
              </div>
            )}
            {data.blocked && <p className="muted warn">Пользователь заблокирован: комментарии недоступны.</p>}
          </div>
        )}
        {data && confirmDelete && (
          <div>
            <p>Аккаунт «{data.name}» будет удалён полностью и без возможности восстановления. Его комментарии останутся как комментарии незарегистрированного пользователя.</p>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setConfirmDelete(false)} disabled={busy}>Отмена</button>
              <button className="btn danger" onClick={doDelete} disabled={busy}>
                {busy ? "Удаление…" : "Удалить"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}