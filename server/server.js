import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createKinopoiskRouter } from "./kinopoisk.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const MEDIA_DIR = path.join(ROOT, "media");
const DB_FILE = path.join(DATA_DIR, "movies.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const DIST_DIR = path.join(ROOT, "dist");

// Пароль администратора. Смените его перед публикацией.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 дней

const DEV_MODE = process.argv.includes("--dev");

for (const dir of [DATA_DIR, MEDIA_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ movies: [] }, null, 2));
}
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }, null, 2));
}

// Пользовательские данные (users.json)
function readUsers() {
  try {
    const st = fs.statSync(USERS_FILE);
    if (usersCache && st.mtimeMs === usersCacheMtime) return usersCache;
    const db = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
    if (!Array.isArray(db.users)) db.users = [];
    usersCache = db;
    usersCacheMtime = st.mtimeMs;
    return db;
  } catch {
    return { users: [] };
  }
}
function writeUsers(db) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(db, null, 2));
  usersCache = db;
  usersCacheMtime = Date.now();
}

// Сессии пользователей: token -> { userId, expiresAt }
const sessions = new Map();
const emailCodes = new Map(); // email -> { code, expiresAt, pendingUser }

function issueSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { userId, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}
function authUser(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : header || req.body?.token;
  const s = sessions.get(token);
  if (!s || s.expiresAt < Date.now()) {
    if (s) sessions.delete(token);
    return null;
  }
  return s;
}
function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone || "",
    email: u.email,
    avatar: u.avatar || null,
    createdAt: u.createdAt,
    blocked: !!u.blocked,
  };
}

// Полностью убирает следы пользователя: файл аватара и привязку его комментариев.
// Комментарии остаются в базе, но выглядят как комментарии незарегистрированного пользователя.
function removeUserTraces(user) {
  if (user.avatar) {
    const old = path.join(MEDIA_DIR, "_avatars", path.basename(user.avatar));
    if (fs.existsSync(old)) fs.rmSync(old, { force: true });
  }
  try {
    const db = readDb();
    let changed = false;
    for (const m of db.movies) {
      for (const c of m.comments || []) {
        if (c.authorId === user.id) {
          c.authorId = null;
          changed = true;
        }
      }
    }
    if (changed) writeDb(db);
  } catch {
    /* комментарии не тронуты — не критично */
  }
}

// Удаляет сессии пользователя из памяти сервера
function revokeUserSessions(userId) {
  for (const [tok, sess] of sessions) {
    if (sess.userId === userId) sessions.delete(tok);
  }
}
function passwordHash(pw, salt) {
  return crypto.scryptSync(pw, salt, 32).toString("hex");
}
function newId(prefix = "") {
  return prefix + crypto.randomBytes(6).toString("hex");
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Кешируем прочитанные БД по mtime файла: пока файл не менялся, не перечитываем JSON.
let dbCache = null;
let dbCacheMtime = 0;
let usersCache = null;
let usersCacheMtime = 0;

function readDb() {
  try {
    const st = fs.statSync(DB_FILE);
    if (dbCache && st.mtimeMs === dbCacheMtime) return dbCache;
    const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    if (!Array.isArray(db.movies)) db.movies = [];
    const today = new Date().toISOString().slice(0, 10);
    for (const m of db.movies) {
      if (!Array.isArray(m.comments)) m.comments = [];
      if (!Array.isArray(m.tags)) m.tags = [];
      if (!Array.isArray(m.votes)) m.votes = [];
      if (!m.ratings) m.ratings = {};
      if (typeof m.isNew !== "boolean") m.isNew = false;
      if (!m.newUntil) m.newUntil = null;
      if (m.newUntil && m.newUntil < today) m.isNew = false;
      if (Array.isArray(m.genres)) {
        m.genre = m.genres.join(", ");
      } else {
        m.genres = parseGenres(m.genre);
        m.genre = m.genres.join(", ");
      }
    }
    dbCache = db;
    dbCacheMtime = st.mtimeMs;
    return db;
  } catch {
    return { movies: [] };
  }
}

function withRating(movie) {
  const votes = movie.votes || [];
  const vals = votes.map((x) => Number(x.value)).filter((v) => Number.isFinite(v));
  const avg = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  return {
    ...movie,
    ratings: { imdb: movie.ratings.imdb || "", kinopoisk: movie.ratings.kinopoisk || "" },
    siteRating: avg,
    voteCount: vals.length,
    votes,
  };
}

function parseTags(raw) {
  if (Array.isArray(raw)) return [...new Set(raw.map((s) => String(s).trim().toLowerCase()).filter(Boolean))];
  if (typeof raw === "string") {
    return [...new Set(raw.split(/[,;|\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))];
  }
  return [];
}

function parseGenres(raw) {
  const arr = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/\s+/) : [];
  const out = [];
  const seen = new Set();
  for (const s of arr) {
    const clean = String(s).trim().replace(/^[,;\|]+|[,;\|]+$/g, "");
    if (!clean) continue;
    const low = clean.toLowerCase();
    if (seen.has(low)) continue;
    seen.add(low);
    out.push(clean);
  }
  return out;
}

function boolish(v) {
  return v === true || v === "true" || v === "1" || v === "on";
}

function futureDate(days) {
  const d = new Date(Date.now() + days * 86400000);
  return d.toISOString().slice(0, 10);
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  dbCache = db;
  dbCacheMtime = Date.now();
}

function sanitize(filename) {
  return filename
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zа-я0-9_.\-\s]/gi, "_")
    .replace(/\s+/g, "_")
    .slice(0, 60) || "file";
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(MEDIA_DIR, req.movieId || "tmp");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const kind = file.fieldname === "video" ? "video" : "poster";
      cb(null, kind + ext);
    },
  }),
  limits: { fileSize: 30 * 1024 * 1024 * 1024 }, // до 30 ГБ на файл
});

function assignMovieId(req, res, next) {
  req.movieId = crypto.randomBytes(4).toString("hex");
  next();
}

function assignMovieIdFromParams(req, res, next) {
  req.movieId = req.params.id;
  next();
}

function isValidId(id) {
  return /^[a-z0-9]+$/i.test(String(id || ""));
}

function checkAdmin(req, res, next) {
  const token = req.headers["x-admin-token"] || req.body?.adminToken;
  if (!token || token !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Неверный пароль администратора" });
  }
  next();
}

// АвтоБД: наполнение из Кинопоиска (поиск/сбор с прогрессом)
app.use("/api/admin/kinopoisk", checkAdmin, createKinopoiskRouter({ readDb, writeDb, MEDIA_DIR }));

app.get("/api/movies", (req, res) => {
  const db = readDb();
  res.json(db.movies.map(withRating));
});

app.get("/api/movies/:id", (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: "Некорректный id" });
  const movie = readDb().movies.find((m) => m.id === id);
  if (!movie) return res.status(404).json({ error: "Фильм не найден" });
  res.json(withRating(movie));
});

app.post("/api/admin/verify", (req, res) => {
  const { password } = req.body || {};
  if (password === ADMIN_PASSWORD) return res.json({ ok: true });
  res.status(401).json({ error: "Неверный пароль администратора" });
});

app.post(
  "/api/movies",
  checkAdmin,
  assignMovieId,
  upload.fields([
    { name: "video", maxCount: 1 },
    { name: "poster", maxCount: 1 },
    { name: "subtitles", maxCount: 1 },
  ]),
  (req, res) => {
    const { title, year, genre, description, tags, imdb, kinopoisk, isNew, newUntil, videoUrl } = req.body || {};
    const movieDir = path.join(MEDIA_DIR, req.movieId);
    const cleanup = () => fs.rmSync(movieDir, { recursive: true, force: true });

    if (!title || !title.trim()) {
      cleanup();
      return res.status(400).json({ error: "Название обязательно" });
    }
    const files = req.files || {};
    const video = files.video?.[0];
    const external = videoUrl ? String(videoUrl).trim() : "";
    if (external && !/^https?:\/\//i.test(external)) {
      cleanup();
      return res.status(400).json({ error: "Ссылка на видео должна начинаться с http:// или https://" });
    }
    if (!video && !external) {
      cleanup();
      return res.status(400).json({ error: "Загрузите видеофайл или укажите ссылку на видео" });
    }

    const id = req.movieId;
    const videoInfo = video ? { filename: video.filename, size: video.size, mimetype: video.mimetype } : null;
    const subtitlesFile = files.subtitles?.[0];
    const posterInfo = files.poster?.[0];
    const genres = parseGenres(genre);

    const movie = {
      id,
      title: title.trim(),
      year: year ? String(year).slice(0, 4) : "",
      genre: genres.join(", "),
      genres,
      description: description ? description.trim() : "",
      source: slugOf(title.trim()),
      videoUrl: videoInfo ? `/media/${id}/${videoInfo.filename}` : external,
      subtitles: subtitlesFile ? saveSubtitleFile(id, subtitlesFile) : null,
      posterUrl: posterInfo
        ? `/media/${id}/${posterInfo.filename}`
        : `https://dummyimage.com/400x600/1a1a2e/ffffff.png&text=${encodeURIComponent(String(title.trim()).slice(0, 60))}`,
      videoSize: videoInfo ? videoInfo.size : null,
      addedAt: new Date().toISOString(),
      tags: parseTags(tags),
      ratings: {
        imdb: imdb ? String(imdb).trim().slice(0, 10) : "",
        kinopoisk: kinopoisk ? String(kinopoisk).trim().slice(0, 10) : "",
      },
      isNew: isNew != null && boolish(isNew),
      newUntil:
        isNew != null && boolish(isNew)
          ? newUntil
            ? String(newUntil).slice(0, 10)
            : futureDate(30)
          : null,
      comments: [],
      votes: [],
    };

    const db = readDb();
    db.movies.unshift(movie);
    writeDb(db);

    res.status(201).json(withRating(movie));
  }
);

app.put(
  "/api/movies/:id",
  checkAdmin,
  assignMovieIdFromParams,
  upload.fields([
    { name: "video", maxCount: 1 },
    { name: "poster", maxCount: 1 },
    { name: "subtitles", maxCount: 1 },
  ]),
  (req, res) => {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: "Некорректный id" });

    const db = readDb();
    const idx = db.movies.findIndex((m) => m.id === id);
    if (idx === -1) return res.status(404).json({ error: "Фильм не найден" });

    const movie = db.movies[idx];
    const files = req.files || {};
    const video = files.video?.[0];
    const poster = files.poster?.[0];
    const subtitlesFile = files.subtitles?.[0];

    const { title, year, genre, description, tags, imdb, kinopoisk, isNew, newUntil, videoUrl } = req.body || {};
    const external = videoUrl ? String(videoUrl).trim() : "";
    if (title != null && !title.trim()) {
      return res.status(400).json({ error: "Название не может быть пустым" });
    }

    if (title != null) movie.title = title.trim();
    if (year != null) movie.year = String(year).slice(0, 4);
    if (genre != null) {
      const genres = parseGenres(genre);
      movie.genres = genres;
      movie.genre = genres.join(", ");
    }
    if (description != null) movie.description = description.trim();
    if (tags != null) movie.tags = parseTags(tags);
    if (imdb != null) movie.ratings.imdb = String(imdb).trim().slice(0, 10);
    if (kinopoisk != null) movie.ratings.kinopoisk = String(kinopoisk).trim().slice(0, 10);
    if (isNew != null) movie.isNew = boolish(isNew);
    if (newUntil != null) movie.newUntil = String(newUntil).slice(0, 10) || null;
    if (movie.isNew && !movie.newUntil) movie.newUntil = futureDate(30);

    if (video) {
      const oldFile = oldMediaFilePath(movie.videoUrl);
      if (oldFile) fs.rmSync(oldFile, { force: true });
      movie.videoUrl = `/media/${id}/${video.filename}`;
      movie.videoSize = video.size;
    } else if (external) {
      if (!/^https?:\/\//i.test(external)) {
        return res.status(400).json({ error: "Ссылка на видео должна начинаться с http:// или https://" });
      }
      if (movie.videoUrl !== external) {
        const oldFile = oldMediaFilePath(movie.videoUrl);
        if (oldFile) fs.rmSync(oldFile, { force: true });
      }
      movie.videoUrl = external;
      movie.videoSize = null;
    }
    if (poster) {
      const oldFile = oldMediaFilePath(movie.posterUrl);
      if (oldFile) fs.rmSync(oldFile, { force: true });
      movie.posterUrl = `/media/${id}/${poster.filename}`;
    }
    if (subtitlesFile) {
      const oldSub = oldMediaFilePath(movie.subtitles);
      if (oldSub && oldSub !== path.join(MEDIA_DIR, id, "subtitles.vtt")) fs.rmSync(oldSub, { force: true });
      movie.subtitles = saveSubtitleFile(id, subtitlesFile);
    }

    writeDb(db);
    res.json(withRating(movie));
  }
);

function oldMediaFilePath(url) {
  if (!url || !url.startsWith("/media/")) return null;
  const safe = url.slice("/media/".length).replace(/[^a-z0-9_\-./]/gi, "");
  const full = path.join(MEDIA_DIR, safe);
  if (!full.startsWith(MEDIA_DIR + path.sep)) return null;
  return fs.existsSync(full) ? full : null;
}

// Преобразует SRT в WebVTT: таймкоды "чч:мм:сс,ммм" -> "чч:мм:сс.ммм" и добавляет заголовок
function srtToVtt(text) {
  let out = text.replace(/\r/g, "").trim() + "\n";
  out = out.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  return "WEBVTT\n\n" + out;
}

// Сохраняет загруженный файл субтитров в media/<id>/subtitles.vtt (SRT конвертируется)
function saveSubtitleFile(movieId, subFile) {
  const subDir = path.join(MEDIA_DIR, movieId);
  if (!fs.existsSync(subDir)) fs.mkdirSync(subDir, { recursive: true });
  const ext = (subFile.originalname || "").toLowerCase().split(".").pop();
  const raw = fs.readFileSync(subFile.path);
  let vtt = raw.toString("utf8");
  if (ext === "srt") vtt = srtToVtt(vtt);
  if (!/^WEBVTT/i.test(vtt.trim())) vtt = "WEBVTT\n" + vtt;
  const dst = path.join(subDir, "subtitles.vtt");
  fs.writeFileSync(dst, vtt);
  return `/media/${movieId}/subtitles.vtt`;
}

app.post("/api/movies/:id/comments", (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: "Некорректный id" });
  const { name, text, parentId } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "Укажите имя" });
  if (!text || !text.trim()) return res.status(400).json({ error: "Пустой комментарий" });
  if (name.trim().length > 40) return res.status(400).json({ error: "Имя слишком длинное" });
  if (text.trim().length > 4000) return res.status(400).json({ error: "Комментарий слишком длинный" });

  const db = readDb();
  const movie = db.movies.find((m) => m.id === id);
  if (!movie) return res.status(404).json({ error: "Фильм не найден" });

  if (parentId && !movie.comments.some((c) => c.id === parentId)) {
    return res.status(400).json({ error: "Родительский комментарий не найден" });
  }

  const sessionUser = authUser(req);
  if (sessionUser) {
    const blocking = readUsers().users.find((u) => u.id === sessionUser.userId);
    if (blocking && blocking.blocked) {
      return res.status(403).json({ error: "Ваш аккаунт заблокирован администратором" });
    }
  }
  const comment = {
    id: crypto.randomBytes(6).toString("hex"),
    name: name.trim(),
    text: text.trim(),
    parentId: parentId || null,
    authorId: sessionUser ? sessionUser.userId : null,
    addedAt: new Date().toISOString(),
  };
  movie.comments.push(comment);

  // Уведомляем автора комментария, на который ответили
  if (parentId) {
    const parent = movie.comments.find((c) => c.id === parentId);
    if (parent && parent.authorId) {
      const udb = readUsers();
      const target = udb.users.find((u) => u.id === parent.authorId);
      if (target) {
        target.notifications = target.notifications || [];
        target.notifications.unshift({
          id: newId("n"),
          text: `Пользователь «${comment.name}» ответил на ваш комментарий к фильму «${movie.title}»`,
          movieId: id,
          commentId: comment.id,
          from: comment.name,
          at: new Date().toISOString(),
          read: false,
        });
        target.notifications = target.notifications.slice(0, 100);
        writeUsers(udb);
      }
    }
  }

  writeDb(db);
  res.status(201).json(comment);
});

app.post("/api/movies/:id/rate", (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: "Некорректный id" });
  const { voter, value } = req.body || {};
  if (!voter || typeof voter !== "string" || voter.length > 64) {
    return res.status(400).json({ error: "Не указан идентификатор пользователя" });
  }
  const v = Number(value);
  if (!Number.isFinite(v) || v < 1 || v > 10) {
    return res.status(400).json({ error: "Оценка должна быть от 1 до 10" });
  }

  const db = readDb();
  const movie = db.movies.find((m) => m.id === id);
  if (!movie) return res.status(404).json({ error: "Фильм не найден" });

  movie.votes = movie.votes.filter((x) => x.voter !== voter);
  movie.votes.push({ voter, value: Math.round(v * 10) / 10 });
  writeDb(db);

  res.json(withRating(movie));
});

/* ================= Регистрация / вход / пользователи ================= */

function emailOk(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim().toLowerCase());
}

// Шаг 1: запрос кода на почту
app.post("/api/auth/register", (req, res) => {
  const { name, phone, email } = req.body || {};
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!name || !name.trim()) return res.status(400).json({ error: "Укажите имя или ник" });
  if (!emailOk(cleanEmail)) return res.status(400).json({ error: "Некорректный адрес почты" });
  if (phone && String(phone).trim().length > 30) return res.status(400).json({ error: "Некорректный телефон" });

  const db = readUsers();
  if (db.users.some((u) => u.email === cleanEmail)) {
    return res.status(409).json({ error: "Пользователь с такой почтой уже существует" });
  }

  const code = String(crypto.randomInt(100000, 999999));
  emailCodes.set(cleanEmail, {
    code,
    expiresAt: Date.now() + 10 * 60 * 1000,
    pending: { name: name.trim().slice(0, 40), phone: phone ? String(phone).trim() : "", email: cleanEmail },
  });
  console.log(`[code] Регистрация ${cleanEmail}: код = ${code}`);
  res.json({ ok: true, code, message: "Код отправлен (имитация — смотрите консоль сервера)" });
});

// Шаг 2: подтверждение кода + пароль → создание аккаунта
app.post("/api/auth/verify", (req, res) => {
  const { email, code, password } = req.body || {};
  const cleanEmail = String(email || "").trim().toLowerCase();
  const entry = emailCodes.get(cleanEmail);
  if (!entry || entry.expiresAt < Date.now()) {
    return res.status(400).json({ error: "Код истёк. Запросите новый" });
  }
  if (String(code).trim() !== entry.code) {
    return res.status(400).json({ error: "Неверный код" });
  }
  if (!password || password.length < 4) {
    return res.status(400).json({ error: "Пароль должен быть не короче 4 символов" });
  }

  const db = readUsers();
  if (db.users.some((u) => u.email === cleanEmail)) {
    return res.status(409).json({ error: "Пользователь с такой почтой уже существует" });
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const user = {
    id: newId("u"),
    name: entry.pending.name,
    phone: entry.pending.phone,
    email: cleanEmail,
    salt,
    pass: passwordHash(password, salt),
    avatar: null,
    createdAt: new Date().toISOString(),
    watched: [],
    playlists: [],
    notifications: [],
    blocked: false,
  };
  db.users.push(user);
  writeUsers(db);
  emailCodes.delete(cleanEmail);

  const token = issueSession(user.id);
  res.status(201).json({ token, user: publicUser(user) });
});

// Вход по паролю
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const cleanEmail = String(email || "").trim().toLowerCase();
  const db = readUsers();
  const user = db.users.find((u) => u.email === cleanEmail);
  if (!user || !user.pass || user.pass !== passwordHash(String(password || ""), user.salt)) {
    return res.status(401).json({ error: "Неверная почта или пароль" });
  }
  const token = issueSession(user.id);
  res.json({ token, user: publicUser(user) });
});

app.post("/api/auth/logout", (req, res) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
  sessions.delete(token);
  res.json({ ok: true });
});

// Текущий пользователь
app.get("/api/me", (req, res) => {
  const s = authUser(req);
  if (!s) return res.status(401).json({ error: "Требуется вход" });
  const db = readUsers();
  const user = db.users.find((u) => u.id === s.userId);
  if (!user) return res.status(401).json({ error: "Пользователь не найден" });
  res.json(publicUser(user));
});

// Фото профиля
const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(MEDIA_DIR, "_avatars");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      cb(null, "a" + crypto.randomBytes(6).toString("hex") + ext);
    },
  }),
  limits: { fileSize: 6 * 1024 * 1024 },
});

app.post("/api/me/avatar", avatarUpload.single("avatar"), (req, res) => {
  const s = authUser(req);
  if (!s) return res.status(401).json({ error: "Требуется вход" });
  if (!req.file) return res.status(400).json({ error: "Файл не загружен" });
  const db = readUsers();
  const user = db.users.find((u) => u.id === s.userId);
  if (!user) return res.status(404).json({ error: "Пользователь не найден" });
  if (user.avatar) {
    const old = path.join(MEDIA_DIR, "_avatars", path.basename(user.avatar));
    if (fs.existsSync(old)) fs.rmSync(old, { force: true });
  }
  user.avatar = `/media/_avatars/${req.file.filename}`;
  writeUsers(db);
  res.json(publicUser(user));
});

/* ================= Просмотренные / плейлисты / уведомления ================= */

function findUserByReq(req, res) {
  const s = authUser(req);
  if (!s) {
    res.status(401).json({ error: "Требуется вход" });
    return null;
  }
  const db = readUsers();
  const user = db.users.find((u) => u.id === s.userId);
  if (!user) {
    res.status(404).json({ error: "Пользователь не найден" });
    return null;
  }
  return { db, user };
}

app.get("/api/me/profile", (req, res) => {
  const hit = findUserByReq(req, res);
  if (!hit) return;
  hit.user.playlists = hit.user.playlists || [];
  hit.user.notifications = hit.user.notifications || [];
  hit.user.watched = hit.user.watched || [];
  res.json({
    user: publicUser(hit.user),
    watched: hit.user.watched,
    playlists: hit.user.playlists,
    notifications: hit.user.notifications,
  });
});

// Изменение данных профиля (имя, телефон, почта)
app.put("/api/me/profile", (req, res) => {
  const hit = findUserByReq(req, res);
  if (!hit) return;
  const { name, phone, email } = req.body || {};
  if (name != null) {
    if (!name.trim()) return res.status(400).json({ error: "Укажите имя или ник" });
    if (name.trim().length > 40) return res.status(400).json({ error: "Имя слишком длинное" });
    hit.user.name = name.trim();
  }
  if (phone != null) {
    if (String(phone).trim().length > 30) return res.status(400).json({ error: "Некорректный телефон" });
    hit.user.phone = String(phone).trim();
  }
  if (email != null) {
    const clean = String(email).trim().toLowerCase();
    if (!emailOk(clean)) return res.status(400).json({ error: "Некорректный адрес почты" });
    if (clean !== hit.user.email && hit.db.users.some((u) => u.email === clean)) {
      return res.status(409).json({ error: "Пользователь с такой почтой уже существует" });
    }
    hit.user.email = clean;
  }
  writeUsers(hit.db);
  res.json(publicUser(hit.user));
});

// Просмотренное: добавить / убрать один / очистить всё
app.post("/api/me/watched", (req, res) => {
  const hit = findUserByReq(req, res);
  if (!hit) return;
  const { movieId } = req.body || {};
  if (!movieId || !isValidId(movieId)) return res.status(400).json({ error: "Некорректный id фильма" });
  hit.user.watched = hit.user.watched || [];
  hit.user.watched = hit.user.watched.filter((w) => w.movieId !== movieId);
  hit.user.watched.unshift({ movieId, at: new Date().toISOString() });
  writeUsers(hit.db);
  res.json({ watched: hit.user.watched });
});

app.delete("/api/me/watched/:movieId", (req, res) => {
  const hit = findUserByReq(req, res);
  if (!hit) return;
  const { movieId } = req.params;
  hit.user.watched = (hit.user.watched || []).filter((w) => w.movieId !== movieId);
  writeUsers(hit.db);
  res.json({ watched: hit.user.watched });
});

app.delete("/api/me/watched", (req, res) => {
  const hit = findUserByReq(req, res);
  if (!hit) return;
  hit.user.watched = [];
  writeUsers(hit.db);
  res.json({ watched: hit.user.watched });
});

// Плейлисты
app.get("/api/me/playlists", (req, res) => {
  const hit = findUserByReq(req, res);
  if (!hit) return;
  res.json({ playlists: hit.user.playlists || [] });
});

app.post("/api/me/playlists", (req, res) => {
  const hit = findUserByReq(req, res);
  if (!hit) return;
  const { title, movieIds } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: "Укажите название плейлиста" });
  hit.user.playlists = hit.user.playlists || [];
  if (title.trim().length > 60) return res.status(400).json({ error: "Название слишком длинное" });
  const list = {
    id: newId("pl"),
    title: title.trim(),
    movieIds: Array.isArray(movieIds) ? movieIds.filter((m) => isValidId(m)) : [],
    createdAt: new Date().toISOString(),
  };
  hit.user.playlists.push(list);
  writeUsers(hit.db);
  res.status(201).json({ playlist: list });
});

app.put("/api/me/playlists/:id", (req, res) => {
  const hit = findUserByReq(req, res);
  if (!hit) return;
  const list = (hit.user.playlists || []).find((p) => p.id === req.params.id);
  if (!list) return res.status(404).json({ error: "Плейлист не найден" });
  const { title, movieIds } = req.body || {};
  if (title != null) {
    if (!title.trim()) return res.status(400).json({ error: "Название не может быть пустым" });
    list.title = title.trim().slice(0, 60);
  }
  if (Array.isArray(movieIds)) {
    list.movieIds = [...new Set(movieIds.filter((m) => isValidId(m)))];
  }
  writeUsers(hit.db);
  res.json({ playlist: list });
});

app.delete("/api/me/playlists/:id", (req, res) => {
  const hit = findUserByReq(req, res);
  if (!hit) return;
  const before = (hit.user.playlists || []).length;
  hit.user.playlists = (hit.user.playlists || []).filter((p) => p.id !== req.params.id);
  if (hit.user.playlists.length === before) return res.status(404).json({ error: "Плейлист не найден" });
  writeUsers(hit.db);
  res.json({ playlists: hit.user.playlists });
});

// Уведомления
app.get("/api/me/notifications", (req, res) => {
  const hit = findUserByReq(req, res);
  if (!hit) return;
  res.json({ notifications: hit.user.notifications || [] });
});

app.post("/api/me/notifications/read", (req, res) => {
  const hit = findUserByReq(req, res);
  if (!hit) return;
  const { id } = req.body || {};
  for (const n of hit.user.notifications || []) {
    if (!id || n.id === id) n.read = true;
  }
  writeUsers(hit.db);
  res.json({ notifications: hit.user.notifications || [] });
});

app.delete("/api/me/notifications/:id", (req, res) => {
  const hit = findUserByReq(req, res);
  if (!hit) return;
  hit.user.notifications = (hit.user.notifications || []).filter((n) => n.id !== req.params.id);
  writeUsers(hit.db);
  res.json({ notifications: hit.user.notifications || [] });
});

// Полное удаление собственного аккаунта без следов
app.delete("/api/me/account", (req, res) => {
  const s = authUser(req);
  if (!s) return res.status(401).json({ error: "Требуется вход" });
  const udb = readUsers();
  const idx = udb.users.findIndex((u) => u.id === s.userId);
  if (idx === -1) return res.status(404).json({ error: "Пользователь не найден" });
  const [user] = udb.users.splice(idx, 1);
  removeUserTraces(user);
  revokeUserSessions(user.id);
  writeUsers(udb);
  res.json({ ok: true });
});

// --- Управление пользователями (админ) ---

app.get("/api/admin/users/:id", checkAdmin, (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: "Некорректный id" });
  const udb = readUsers();
  const u = udb.users.find((x) => x.id === id);
  if (!u) return res.status(404).json({ error: "Пользователь не найден" });
  res.json(publicUser(u));
});

// Отправить пользователю уведомление от администратора
app.post("/api/admin/users/:id/notify", checkAdmin, (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: "Некорректный id" });
  const { text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: "Введите текст уведомления" });
  if (text.trim().length > 500) return res.status(400).json({ error: "Текст слишком длинный" });
  const udb = readUsers();
  const u = udb.users.find((x) => x.id === id);
  if (!u) return res.status(404).json({ error: "Пользователь не найден" });
  u.notifications = u.notifications || [];
  u.notifications.unshift({
    id: newId("n"),
    text: text.trim(),
    movieId: null,
    commentId: null,
    from: "Администратор",
    at: new Date().toISOString(),
    read: false,
  });
  u.notifications = u.notifications.slice(0, 100);
  writeUsers(udb);
  res.json({ ok: true });
});

// Блокировка / разблокировка (заблокированный не может комментировать)
app.post("/api/admin/users/:id/block", checkAdmin, (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: "Некорректный id" });
  const { blocked } = req.body || {};
  const udb = readUsers();
  const u = udb.users.find((x) => x.id === id);
  if (!u) return res.status(404).json({ error: "Пользователь не найден" });
  u.blocked = !!blocked;
  writeUsers(udb);
  res.json({ blocked: !!u.blocked });
});

// Удаление пользователя администратором (без следов)
app.delete("/api/admin/users/:id", checkAdmin, (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: "Некорректный id" });
  const udb = readUsers();
  const idx = udb.users.findIndex((u) => u.id === id);
  if (idx === -1) return res.status(404).json({ error: "Пользователь не найден" });
  const [user] = udb.users.splice(idx, 1);
  removeUserTraces(user);
  revokeUserSessions(user.id);
  writeUsers(udb);
  res.json({ ok: true });
});

// Право на изменение/удаление комментария: админ ИЛИ автор комментария
function canModerateComment(req, comment) {
  const adminToken = req.headers["x-admin-token"] || req.body?.adminToken;
  if (adminToken && adminToken === ADMIN_PASSWORD) return true;
  const s = authUser(req);
  return !!(s && comment.authorId && comment.authorId === s.userId);
}

app.put("/api/movies/:id/comments/:cid", (req, res) => {
  const { id, cid } = req.params;
  if (!isValidId(id) || !isValidId(cid)) return res.status(400).json({ error: "Некорректный id" });
  const { text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: "Пустой комментарий" });
  if (text.trim().length > 4000) return res.status(400).json({ error: "Комментарий слишком длинный" });

  const db = readDb();
  const movie = db.movies.find((m) => m.id === id);
  if (!movie) return res.status(404).json({ error: "Фильм не найден" });
  const comment = movie.comments.find((c) => c.id === cid);
  if (!comment) return res.status(404).json({ error: "Комментарий не найден" });

  if (!canModerateComment(req, comment)) {
    return res.status(403).json({ error: "Нет прав на редактирование комментария" });
  }

  comment.text = text.trim();
  comment.editedAt = new Date().toISOString();
  writeDb(db);
  res.json(comment);
});

app.delete("/api/movies/:id/comments/:cid", (req, res) => {
  const { id, cid } = req.params;
  if (!isValidId(id) || !isValidId(cid)) return res.status(400).json({ error: "Некорректный id" });
  const db = readDb();
  const movie = db.movies.find((m) => m.id === id);
  if (!movie) return res.status(404).json({ error: "Фильм не найден" });

  const before = movie.comments.length;
  const comment = movie.comments.find((c) => c.id === cid);
  if (!comment) return res.status(404).json({ error: "Комментарий не найден" });

  if (!canModerateComment(req, comment)) {
    return res.status(403).json({ error: "Нет прав на удаление комментария" });
  }

  movie.comments = movie.comments.filter((c) => c.id !== cid);
  if (movie.comments.length === before) return res.status(404).json({ error: "Комментарий не найден" });

  writeDb(db);
  res.json({ ok: true });
});

function slugOf(text) {
  return text.toLowerCase().replace(/[^a-zа-я0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "film";
}

app.delete("/api/movies/:id", checkAdmin, (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: "Некорректный id" });
  const db = readDb();
  const idx = db.movies.findIndex((m) => m.id === id);
  if (idx === -1) return res.status(404).json({ error: "Фильм не найден" });
  db.movies.splice(idx, 1);
  writeDb(db);
  fs.rmSync(path.join(MEDIA_DIR, id), { recursive: true, force: true });
  res.json({ ok: true });
});

app.use(
  "/media",
  express.static(MEDIA_DIR, {
    setHeaders: (res, filePath) => {
      res.setHeader("Accept-Ranges", "bytes");
      const ext = path.extname(filePath).toLowerCase();
      if ([".mp4", ".m4v", ".webm", ".mov"].includes(ext)) {
        if (ext === ".mp4" || ext === ".m4v") res.setHeader("Content-Type", "video/mp4");
        else if (ext === ".webm") res.setHeader("Content-Type", "video/webm");
        else if (ext === ".mov") res.setHeader("Content-Type", "video/quicktime");
      }
    },
  })
);

if (!DEV_MODE && fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
}

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Кинотека: http://localhost:${PORT}`);
});