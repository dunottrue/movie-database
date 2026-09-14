import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  addWatched,
  clearWatched,
  createPlaylist,
  deleteComment,
  deletePlaylist,
  fetchMovies,
  removeWatched,
  updatePlaylist,
  updateProfile,
  uploadAvatar,
  type Playlist,
  type User,
  type WatchedItem,
} from "../api";
import type { Movie } from "../types";
import { useUser } from "../user";

export default function Cabinet() {
  const { user, profile, refresh, openAuth, logout, deleteAccount, booting } = useUser();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [tab, setTab] = useState<"profile" | "watched" | "playlists" | "comments">("profile");
  const [busy, setBusy] = useState(false);
  const [delConfirm, setDelConfirm] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const movieById = useMemo(() => {
    const map = new Map<string, Movie>();
    for (const m of movies) map.set(m.id, m);
    return map;
  }, [movies]);

  const loadMovies = useCallback(async () => {
    try {
      setMovies(await fetchMovies());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadMovies();
  }, [loadMovies]);

  const myComments = useMemo(() => {
    const out: { movie: Movie; id: string; text: string; at: string }[] = [];
    if (!user) return out;
    for (const m of movies) {
      for (const c of m.comments ?? []) {
        if (c.authorId && c.authorId === user.id) out.push({ movie: m, id: c.id, text: c.text, at: c.addedAt });
      }
    }
    out.sort((a, b) => b.at.localeCompare(a.at));
    return out;
  }, [movies, user]);

  if (booting) {
    return (
      <main className="main">
        <div className="loading"><span className="loader-spinner" aria-label="Загрузка" /></div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="main">
        <div className="empty cabinet-empty">
          <p>Войдите, чтобы открыть личный кабинет.</p>
          <button className="btn primary" onClick={() => openAuth()}>Войти / Зарегистрироваться</button>
        </div>
      </main>
    );
  }

  const watched = profile?.watched ?? [];
  const playlists = profile?.playlists ?? [];

  async function onAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      await uploadAvatar(f);
      await refresh();
    } finally {
      setBusy(false);
      if (avatarInput.current) avatarInput.current.value = "";
    }
  }

  async function onAddWatched(id: string) {
    await addWatched(id);
    await refresh();
  }
  async function onRemoveWatched(id: string) {
    await removeWatched(id);
    await refresh();
  }
  async function onClearWatched() {
    if (!confirm("Очистить весь список просмотренных?")) return;
    setBusy(true);
    try {
      await clearWatched();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onCreatePlaylist(title: string) {
    if (!title.trim()) return;
    await createPlaylist({ title: title.trim() });
    await refresh();
  }

  async function onDeletePlaylist(id: string) {
    if (!confirm("Удалить плейлист?")) return;
    await deletePlaylist(id);
    await refresh();
  }

  async function onSavePlaylist(p: Playlist, title: string) {
    await updatePlaylist(p.id, { title });
    await refresh();
  }

  async function onDeleteOwnComment(cid: string, movieId: string) {
    if (!confirm("Удалить комментарий?")) return;
    try {
      await deleteComment(movieId, cid, "");
      await loadMovies();
    } catch { /* ignore */ }
  }

  async function onConfirmDelete() {
    setDelBusy(true);
    try {
      await deleteAccount();
      setDelConfirm(false);
      navigate("/");
    } catch { /* ignore */ } finally {
      setDelBusy(false);
    }
  }

  return (
    <main className="main cabinet">
      <div className="cabinet-top">
        <ProfileCard user={user} avatarInput={avatarInput} onAvatar={onAvatar} busy={busy} />
        <div className="cabinet-tabs">
          <TabBtn active={tab === "profile"} onClick={() => setTab("profile")}>Профиль</TabBtn>
          <TabBtn active={tab === "watched"} onClick={() => setTab("watched")}>Просмотрено <span className="tab-count">{watched.length}</span></TabBtn>
          <TabBtn active={tab === "playlists"} onClick={() => setTab("playlists")}>Плейлисты <span className="tab-count">{playlists.length}</span></TabBtn>
          <TabBtn active={tab === "comments"} onClick={() => setTab("comments")}>Комментарии <span className="tab-count">{myComments.length}</span></TabBtn>
        </div>
        <button className="btn ghost cabinet-logout" onClick={() => logout()}>Выйти</button>
      </div>

      {tab === "profile" && <ProfileTab user={user} onDeleteAccount={() => setDelConfirm(true)} />}

      {tab === "watched" && (
        <WatchedTab
          watched={watched}
          movieById={movieById}
          onAdd={onAddWatched}
          onRemove={onRemoveWatched}
          onClear={onClearWatched}
          busy={busy}
        />
      )}

      {tab === "playlists" && (
        <PlaylistsTab playlists={playlists} movieById={movieById} onCreate={onCreatePlaylist} onDelete={onDeletePlaylist} onSave={onSavePlaylist} />
      )}

      {tab === "comments" && <CommentsTab items={myComments} onDelete={onDeleteOwnComment} />}

      {delConfirm && (
        <div className="modal" onMouseDown={() => { if (!delBusy) setDelConfirm(false); }}>
          <div className="modal-box confirm-box" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2>Удалить аккаунт?</h2></div>
            <p>Аккаунт будет удалён полностью и без возможности восстановления. Ваши комментарии останутся как комментарии незарегистрированного пользователя.</p>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setDelConfirm(false)} disabled={delBusy}>Отмена</button>
              <button className="btn danger" onClick={onConfirmDelete} disabled={delBusy}>
                {delBusy ? "Удаление…" : "Удалить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={`chip-btn ${active ? "active" : ""}`} onClick={onClick}>{children}</button>
  );
}

function initials(name: string) {
  const parts = String(name || "?").trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function ProfileCard({ user, avatarInput, onAvatar, busy }: { user: User; avatarInput: React.RefObject<HTMLInputElement>; onAvatar: (e: React.ChangeEvent<HTMLInputElement>) => void; busy: boolean }) {
  return (
    <div className="profile-card">
      <button className="avatar avatar-lg" onClick={() => avatarInput.current?.click()} title="Сменить фото">
        {user.avatar ? <img src={user.avatar} alt={user.name} /> : initials(user.name)}
        <span className="avatar-edit">✎</span>
      </button>
      <input ref={avatarInput} type="file" accept="image/*" hidden onChange={onAvatar} />
      <div className="profile-card-info">
        <h2>{user.name}</h2>
        <p>{user.email}</p>
        {user.phone && <p>{user.phone}</p>}
        {busy && <p className="muted">Сохранение…</p>}
      </div>
    </div>
  );
}

function ProfileTab({ user, onDeleteAccount }: { user: User; onDeleteAccount: () => void }) {
  const { refresh } = useUser();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [email, setEmail] = useState(user.email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setName(user.name);
    setPhone(user.phone);
    setEmail(user.email);
  }, [user]);

  function reset() {
    setName(user.name);
    setPhone(user.phone);
    setEmail(user.email);
    setError("");
    setEditing(false);
  }

  async function save() {
    if (!name.trim()) return setError("Укажите имя или ник");
    setBusy(true);
    setError("");
    try {
      const updated = await updateProfile({ name: name.trim(), phone: phone.trim(), email: email.trim() });
      setName(updated.name);
      setPhone(updated.phone);
      setEmail(updated.email);
      await refresh();
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить профиль");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="block">
      <div className="block-head">
        <h3 className="block-title none">Мой профиль</h3>
        {!editing && (
          <button className="btn ghost small" onClick={() => setEditing(true)}>✎ Редактировать</button>
        )}
      </div>
      {!editing ? (
        <dl className="profile-dl">
          <div><dt>Имя / ник</dt><dd>{user.name}{user.blocked && <span className="blocked-badge">Заблокирован</span>}</dd></div>
          <div><dt>Почта</dt><dd>{user.email}</dd></div>
          <div><dt>Телефон</dt><dd>{user.phone || "—"}</dd></div>
          <div><dt>На сайте с</dt><dd>{new Date(user.createdAt).toLocaleDateString("ru-RU")}</dd></div>
        </dl>
      ) : (
        <div className="edit-form">
          <label className="field">
            Имя / ник *
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            Телефон
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 900 000-00-00" />
          </label>
          <label className="field">
            Почта *
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="modal-actions">
            <button className="btn ghost small" onClick={reset}>Отмена</button>
            <button className="btn primary small" onClick={save} disabled={busy || !name.trim()}>
              {busy ? "Сохранение…" : "Сохранить"}
            </button>
          </div>
        </div>
      )}
      <div className="danger-zone">
        <button className="btn danger ghost small" onClick={onDeleteAccount}>Удалить аккаунт</button>
        <span className="muted">Аккаунт будет удалён без возможности восстановления.</span>
      </div>
    </div>
  );
}

function WatchedTab({ watched, movieById, onAdd, onRemove, onClear, busy }: {
  watched: WatchedItem[]; movieById: Map<string, Movie>;
  onAdd: (id: string) => void; onRemove: (id: string) => void; onClear: () => void; busy: boolean;
}) {
  if (watched.length === 0) return <div className="block empty mini"><p>Список просмотренных пуст.</p></div>;
  return (
    <div className="block">
      <div className="block-head">
        <h3 className="block-title none">Просмотренные фильмы</h3>
        <button className="btn danger ghost small" onClick={onClear} disabled={busy}>Очистить весь список</button>
      </div>
      <ul className="mini-list">
        {watched.map((w) => {
          const m = movieById.get(w.movieId);
          return (
            <li key={w.movieId} className="mini-item">
              <Link to={`/movie/${w.movieId}`} className="mini-thumb">
                {m ? <img src={m.posterUrl} alt={m.title} /> : <span />}
              </Link>
              <div className="mini-body">
                <Link to={`/movie/${w.movieId}`} className="mini-title">{m ? m.title : w.movieId}</Link>
                <span className="mini-sub">{new Date(w.at).toLocaleDateString("ru-RU")}</span>
              </div>
              <button className="btn ghost small" onClick={() => onAdd(w.movieId)}>Смотреть снова</button>
              <button className="btn ghost small danger-text" onClick={() => onRemove(w.movieId)}>Убрать</button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PlaylistsTab({ playlists, movieById, onCreate, onDelete, onSave }: {
  playlists: Playlist[]; movieById: Map<string, Movie>;
  onCreate: (title: string) => void; onDelete: (id: string) => void; onSave: (p: Playlist, title: string) => void;
}) {
  const [draftTitle, setDraftTitle] = useState("");
  return (
    <div className="block">
      <div className="block-head">
        <h3 className="block-title none">Мои плейлисты</h3>
      </div>
      <div className="playlist-create">
        <input className="search" placeholder="Название нового плейлиста" value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { onCreate(draftTitle); setDraftTitle(""); } }} />
        <button className="btn primary" onClick={() => { onCreate(draftTitle); setDraftTitle(""); }} disabled={!draftTitle.trim()}>Создать</button>
      </div>

      {playlists.length === 0 ? (
        <div className="empty mini"><p>Плейлистов пока нет.</p></div>
      ) : (
        <ul className="playlist-list">
          {playlists.map((p) => (
            <PlaylistItem key={p.id} playlist={p} movieById={movieById} onDelete={onDelete} onSave={onSave} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PlaylistItem({ playlist, movieById, onDelete, onSave }: {
  playlist: Playlist; movieById: Map<string, Movie>; onDelete: (id: string) => void; onSave: (p: Playlist, title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(playlist.title);
  return (
    <li className="playlist-item">
      <div className="playlist-head">
        {editing ? (
          <>
            <input className="search" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            <button className="btn primary small" onClick={() => { onSave(playlist, title); setEditing(false); }}>Сохранить</button>
            <button className="btn ghost small" onClick={() => { setEditing(false); setTitle(playlist.title); }}>Отмена</button>
          </>
        ) : (
          <>
            <strong className="playlist-title">{playlist.title}</strong>
            <span className="mini-sub">{playlist.movieIds.length} фильм(ов)</span>
            <button className="btn ghost small" onClick={() => { setEditing(true); setTitle(playlist.title); }}>✎ Редактировать</button>
            <button className="btn ghost small danger-text" onClick={() => onDelete(playlist.id)}>Удалить</button>
          </>
        )}
      </div>
      {playlist.movieIds.length > 0 && (
        <div className="playlist-movies">
          {playlist.movieIds.map((id) => {
            const m = movieById.get(id);
            return (
              <Link key={id} to={`/movie/${id}`} className="playlist-movie">
                {m ? (
                  <>
                    <img src={m.posterUrl} alt={m.title} />
                    <span>{m.title}</span>
                  </>
                ) : (
                  <span>{id}</span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </li>
  );
}

function CommentsTab({ items, onDelete }: { items: { movie: Movie; id: string; text: string; at: string }[]; onDelete: (cid: string, movieId: string) => void }) {
  if (items.length === 0) return <div className="block empty mini"><p>Вы ещё не оставляли комментариев.</p></div>;
  return (
    <div className="block">
      <h3 className="block-title none">Мои комментарии</h3>
      <ul className="mini-list">
        {items.map((it, i) => (
          <li key={i} className="mini-item">
            <Link to={`/movie/${it.movie.id}`} className="mini-thumb"><img src={it.movie.posterUrl} alt={it.movie.title} /></Link>
            <div className="mini-body">
              <Link to={`/movie/${it.movie.id}`} className="mini-title">{it.movie.title}</Link>
              <span className="mini-sub">{new Date(it.at).toLocaleDateString("ru-RU")}</span>
              <p className="mini-text">{it.text}</p>
            </div>
            <button className="btn danger ghost small" onClick={() => onDelete(it.id, it.movie.id)}>Удалить</button>
          </li>
        ))}
      </ul>
    </div>
  );
}