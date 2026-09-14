import type { Comment, Movie } from "./types";

const BASE = "";

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Ошибка ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* no json body */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export async function fetchMovies(): Promise<Movie[]> {
  const res = await fetch(`${BASE}/api/movies`);
  return handle<Movie[]>(res);
}

export async function fetchMovie(id: string): Promise<Movie> {
  const res = await fetch(`${BASE}/api/movies/${id}`);
  return handle<Movie>(res);
}

export async function verifyAdmin(password: string): Promise<void> {
  const res = await fetch(`${BASE}/api/admin/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  await handle(res);
}

export interface AddMovieData {
  title: string;
  year: string;
  genre: string;
  description: string;
  videoUrl?: string;
  video?: File | null;
  subtitles?: File | null;
  poster?: File | null;
  tags: string;
  imdb: string;
  kinopoisk: string;
  isNew: boolean;
  newUntil: string;
  adminToken: string;
}

export async function addMovie(data: AddMovieData): Promise<Movie> {
  const form = new FormData();
  form.append("title", data.title);
  form.append("year", data.year);
  form.append("genre", data.genre);
  form.append("description", data.description);
  form.append("tags", data.tags);
  form.append("imdb", data.imdb);
  form.append("kinopoisk", data.kinopoisk);
  form.append("isNew", data.isNew ? "1" : "0");
  form.append("newUntil", data.newUntil);
  if (data.videoUrl && data.videoUrl.trim()) form.append("videoUrl", data.videoUrl.trim());
  else if (data.video) form.append("video", data.video);
  if (data.subtitles) form.append("subtitles", data.subtitles);
  if (data.poster) form.append("poster", data.poster);

  const res = await fetch(`${BASE}/api/movies`, {
    method: "POST",
    headers: { "X-Admin-Token": data.adminToken },
    body: form,
  });
  return handle<Movie>(res);
}

export interface EditMovieData {
  title: string;
  year: string;
  genre: string;
  description: string;
  tags: string;
  imdb: string;
  kinopoisk: string;
  isNew: boolean;
  newUntil: string;
  videoUrl?: string;
  video?: File | null;
  subtitles?: File | null;
  poster?: File | null;
  adminToken: string;
}

export async function updateMovie(id: string, data: EditMovieData): Promise<Movie> {
  const form = new FormData();
  form.append("title", data.title);
  form.append("year", data.year);
  form.append("genre", data.genre);
  form.append("description", data.description);
  form.append("tags", data.tags);
  form.append("imdb", data.imdb);
  form.append("kinopoisk", data.kinopoisk);
  form.append("isNew", data.isNew ? "1" : "0");
  form.append("newUntil", data.newUntil);
  if (data.videoUrl && data.videoUrl.trim()) form.append("videoUrl", data.videoUrl.trim());
  if (data.video) form.append("video", data.video);
  if (data.subtitles) form.append("subtitles", data.subtitles);
  if (data.poster) form.append("poster", data.poster);

  const res = await fetch(`${BASE}/api/movies/${id}`, {
    method: "PUT",
    headers: { "X-Admin-Token": data.adminToken },
    body: form,
  });
  return handle<Movie>(res);
}

export async function rateMovie(id: string, voter: string, value: number): Promise<Movie> {
  const res = await fetch(`${BASE}/api/movies/${id}/rate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ voter, value }),
  });
  return handle<Movie>(res);
}

export function voterId(): string {
  let id = localStorage.getItem("movie_voter_id");
  if (!id) {
    id = "v" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("movie_voter_id", id);
  }
  return id;
}

export interface CommentForm {
  name: string;
  text: string;
  parentId?: string | null;
}

export async function addComment(id: string, data: CommentForm): Promise<Comment> {
  const res = await fetch(`${BASE}/api/movies/${id}/comments`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handle<Comment>(res);
}

export async function editComment(id: string, commentId: string, text: string): Promise<Comment> {
  const res = await fetch(`${BASE}/api/movies/${id}/comments/${commentId}`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return handle<Comment>(res);
}

export async function deleteComment(id: string, commentId: string, adminToken: string): Promise<void> {
  const res = await fetch(`${BASE}/api/movies/${id}/comments/${commentId}`, {
    method: "DELETE",
    headers: { "X-Admin-Token": adminToken, ...authHeaders() },
  });
  await handle(res);
}

export async function deleteMovie(id: string, adminToken: string): Promise<void> {
  const res = await fetch(`${BASE}/api/movies/${id}`, {
    method: "DELETE",
    headers: { "X-Admin-Token": adminToken },
  });
  await handle(res);
}

export interface KpGenre { id: number; name: string }
export interface KpType { value: string; label: string }
export interface KpItem {
  kinopoiskId: string;
  name: string;
  year: string;
  ratingImdb: string;
  ratingKinopoisk: string;
  genres: string[];
  type: string | null;
  posterUrl: string;
  posterUrlPreview: string;
}
export interface KpJobLine { name: string; movieId?: string; ok?: string; error?: string }
export interface KpJob {
  id: string;
  status: "running" | "done" | "cancelled" | "error";
  title: string;
  createdAt: string;
  startedAt: string;
  finishedAt: string | null;
  progress: {
    total: number;
    done: number;
    imported: number;
    skipped: number;
    current: string;
    found?: number;
    list: KpJobLine[];
    errors: { name: string; error: string }[];
  };
}
export interface KpCriteria {
  keyword?: string;
  genreId?: number | string;
  yearFrom?: string;
  yearTo?: string;
  type?: string;
  order?: string;
  ratingFrom?: string;
  ratingTo?: string;
  limit?: number;
}

export async function fetchKpConfig(adminToken: string): Promise<{ configured: boolean }> {
  const res = await fetch(`${BASE}/api/admin/kinopoisk/config`, { headers: { "X-Admin-Token": adminToken } });
  return handle<{ configured: boolean }>(res);
}

export async function saveKpConfig(apiKey: string, adminToken: string): Promise<void> {
  const res = await fetch(`${BASE}/api/admin/kinopoisk/config`, {
    method: "POST",
    headers: { "X-Admin-Token": adminToken, "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  await handle(res);
}

export async function clearKpConfig(adminToken: string): Promise<void> {
  const res = await fetch(`${BASE}/api/admin/kinopoisk/config/clear`, {
    method: "POST",
    headers: { "X-Admin-Token": adminToken },
  });
  await handle(res);
}

export async function fetchKpGenres(adminToken: string): Promise<{ genres: KpGenre[]; types: KpType[] }> {
  const res = await fetch(`${BASE}/api/admin/kinopoisk/genres`, { headers: { "X-Admin-Token": adminToken } });
  return handle<{ genres: KpGenre[]; types: KpType[] }>(res);
}

export async function kpSearch(criteria: KpCriteria, adminToken: string): Promise<{ items: KpItem[]; total: number; totalPages: number }> {
  const res = await fetch(`${BASE}/api/admin/kinopoisk/search`, {
    method: "POST",
    headers: { "X-Admin-Token": adminToken, "Content-Type": "application/json" },
    body: JSON.stringify(criteria),
  });
  return handle<{ items: KpItem[]; total: number; totalPages: number }>(res);
}

export async function kpStartJob(
  payload: { mode: "criteria" | "items"; criteria?: KpCriteria; items?: KpItem[]; limit?: number; title?: string },
  adminToken: string
): Promise<{ jobId: string }> {
  const res = await fetch(`${BASE}/api/admin/kinopoisk/jobs`, {
    method: "POST",
    headers: { "X-Admin-Token": adminToken, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle<{ jobId: string }>(res);
}

export async function kpJobStatus(jobId: string, adminToken: string): Promise<KpJob> {
  const res = await fetch(`${BASE}/api/admin/kinopoisk/jobs/${jobId}`, { headers: { "X-Admin-Token": adminToken } });
  return handle<KpJob>(res);
}

export async function kpCancelJob(jobId: string, adminToken: string): Promise<void> {
  const res = await fetch(`${BASE}/api/admin/kinopoisk/jobs/${jobId}`, {
    method: "DELETE",
    headers: { "X-Admin-Token": adminToken },
  });
  await handle(res);
}

export function formatSize(bytes: number): string {
  if (!bytes) return "";
  const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

/* ================= Пользователи ================= */

export interface User {
  id: string;
  name: string;
  phone: string;
  email: string;
  avatar: string | null;
  createdAt: string;
  blocked: boolean;
}

export interface WatchedItem {
  movieId: string;
  at: string;
}

export interface Playlist {
  id: string;
  title: string;
  movieIds: string[];
  createdAt: string;
}

export interface Notification {
  id: string;
  text: string;
  movieId: string | null;
  commentId: string | null;
  from: string;
  at: string;
  read: boolean;
}

export interface UserProfile {
  user: User;
  watched: WatchedItem[];
  playlists: Playlist[];
  notifications: Notification[];
}

export interface Session {
  token: string;
  user: User;
}

let authToken: string | null = null;
export function setAuthToken(t: string | null): void {
  authToken = t;
}
export function authHeaders(): Record<string, string> {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

export async function requestRegister(email: string, name: string, phone: string): Promise<{ code: string }> {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, name, phone }),
  });
  return handle<{ code: string }>(res);
}

export async function verifyRegister(email: string, code: string, password: string): Promise<Session> {
  const res = await fetch(`${BASE}/api/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code, password }),
  });
  return handle<Session>(res);
}

export async function loginUser(email: string, password: string): Promise<Session> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return handle<Session>(res);
}

export async function logoutUser(): Promise<void> {
  try {
    await fetch(`${BASE}/api/auth/logout`, { method: "POST", headers: authHeaders() });
  } catch { /* ignore */ }
}

export async function fetchProfile(): Promise<UserProfile> {
  const res = await fetch(`${BASE}/api/me/profile`, { headers: authHeaders() });
  return handle<UserProfile>(res);
}

export async function updateProfile(data: { name: string; phone: string; email: string }): Promise<User> {
  const res = await fetch(`${BASE}/api/me/profile`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handle<User>(res);
}

export async function uploadAvatar(file: File): Promise<User> {
  const form = new FormData();
  form.append("avatar", file);
  const res = await fetch(`${BASE}/api/me/avatar`, { method: "POST", headers: authHeaders(), body: form });
  return handle<User>(res);
}

export async function addWatched(movieId: string): Promise<WatchedItem[]> {
  const res = await fetch(`${BASE}/api/me/watched`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ movieId }),
  });
  const body = await handle<{ watched: WatchedItem[] }>(res);
  return body.watched;
}

export async function removeWatched(movieId: string): Promise<WatchedItem[]> {
  const res = await fetch(`${BASE}/api/me/watched/${movieId}`, { method: "DELETE", headers: authHeaders() });
  const body = await handle<{ watched: WatchedItem[] }>(res);
  return body.watched;
}

export async function clearWatched(): Promise<WatchedItem[]> {
  const res = await fetch(`${BASE}/api/me/watched`, { method: "DELETE", headers: authHeaders() });
  const body = await handle<{ watched: WatchedItem[] }>(res);
  return body.watched;
}

export async function listPlaylists(): Promise<Playlist[]> {
  const res = await fetch(`${BASE}/api/me/playlists`, { headers: authHeaders() });
  const body = await handle<{ playlists: Playlist[] }>(res);
  return body.playlists;
}

export interface PlaylistDraft {
  title: string;
  movieIds?: string[];
}

export async function createPlaylist(data: PlaylistDraft): Promise<Playlist> {
  const res = await fetch(`${BASE}/api/me/playlists`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ title: data.title, movieIds: data.movieIds ?? [] }),
  });
  const body = await handle<{ playlist: Playlist }>(res);
  return body.playlist;
}

export async function updatePlaylist(id: string, data: PlaylistDraft): Promise<Playlist> {
  const res = await fetch(`${BASE}/api/me/playlists/${id}`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await handle<{ playlist: Playlist }>(res);
  return body.playlist;
}

export async function deletePlaylist(id: string): Promise<Playlist[]> {
  const res = await fetch(`${BASE}/api/me/playlists/${id}`, { method: "DELETE", headers: authHeaders() });
  const body = await handle<{ playlists: Playlist[] }>(res);
  return body.playlists;
}

export async function fetchNotifications(): Promise<Notification[]> {
  const res = await fetch(`${BASE}/api/me/notifications`, { headers: authHeaders() });
  const body = await handle<{ notifications: Notification[] }>(res);
  return body.notifications;
}

export async function markNotificationsRead(ids?: string[]): Promise<Notification[]> {
  const res = await fetch(`${BASE}/api/me/notifications/read`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ id: ids?.length === 1 ? ids[0] : undefined }),
  });
  const body = await handle<{ notifications: Notification[] }>(res);
  return body.notifications;
}

export async function deleteNotification(id: string): Promise<Notification[]> {
  const res = await fetch(`${BASE}/api/me/notifications/${id}`, { method: "DELETE", headers: authHeaders() });
  const body = await handle<{ notifications: Notification[] }>(res);
  return body.notifications;
}

export async function deleteAccount(): Promise<void> {
  const res = await fetch(`${BASE}/api/me/account`, { method: "DELETE", headers: authHeaders() });
  await handle(res);
}

/* ================= Пользователи (админ) ================= */

export interface AdminUser {
  id: string;
  name: string;
  phone: string;
  email: string;
  avatar: string | null;
  createdAt: string;
  blocked: boolean;
}

export function adminHeaders(adminToken: string): Record<string, string> {
  return { "X-Admin-Token": adminToken };
}

export async function adminGetUser(id: string, adminToken: string): Promise<AdminUser> {
  const res = await fetch(`${BASE}/api/admin/users/${id}`, { headers: adminHeaders(adminToken) });
  return handle<AdminUser>(res);
}

export async function adminNotifyUser(id: string, text: string, adminToken: string): Promise<void> {
  const res = await fetch(`${BASE}/api/admin/users/${id}/notify`, {
    method: "POST",
    headers: { ...adminHeaders(adminToken), "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  await handle(res);
}

export async function adminSetUserBlocked(id: string, blocked: boolean, adminToken: string): Promise<{ blocked: boolean }> {
  const res = await fetch(`${BASE}/api/admin/users/${id}/block`, {
    method: "POST",
    headers: { ...adminHeaders(adminToken), "Content-Type": "application/json" },
    body: JSON.stringify({ blocked }),
  });
  return handle<{ blocked: boolean }>(res);
}

export async function adminDeleteUser(id: string, adminToken: string): Promise<void> {
  const res = await fetch(`${BASE}/api/admin/users/${id}`, { method: "DELETE", headers: adminHeaders(adminToken) });
  await handle(res);
}