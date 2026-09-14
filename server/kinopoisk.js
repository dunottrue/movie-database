import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

// Парсер-наполнитель базы из Кинопоиска (без видеофайлов).
// Источник: Kinopoisk API Unofficial (https://kinopoiskapiunofficial.tech) — нужен бесплатный API-ключ.
// Ключ хранится в data/kinopoisk_config.json либо задаётся переменной окружения KINOPOISK_API_KEY.
// Для тестов базу API можно подменить переменной KINOPOISK_BASE.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CONFIG_FILE = path.join(ROOT, "data", "kinopoisk_config.json");

const KP_DEFAULT_BASE = "https://kinopoiskapiunofficial.tech/api";
const KP_BASE = process.env.KINOPOISK_BASE || KP_DEFAULT_BASE;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class ApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const GENRE_FALLBACK = [
  { id: 1, name: "Боевик" },
  { id: 2, name: "Вестерн" },
  { id: 3, name: "Военный" },
  { id: 4, name: "Детектив" },
  { id: 5, name: "Детский" },
  { id: 6, name: "Документальный" },
  { id: 7, name: "Драма" },
  { id: 8, name: "Исторический" },
  { id: 9, name: "Комедия" },
  { id: 10, name: "Короткометражный" },
  { id: 11, name: "Криминал" },
  { id: 12, name: "Мелодрама" },
  { id: 13, name: "Музыка" },
  { id: 14, name: "Мультфильм" },
  { id: 15, name: "Мюзикл" },
  { id: 16, name: "Приключения" },
  { id: 17, name: "Развлекательное" },
  { id: 18, name: "Реальное ТВ" },
  { id: 19, name: "Семейный" },
  { id: 20, name: "Спорт" },
  { id: 21, name: "Ток-шоу" },
  { id: 22, name: "Триллер" },
  { id: 23, name: "Ужасы" },
  { id: 24, name: "Фантастика" },
  { id: 25, name: "Фэнтези" },
  { id: 26, name: "Церемония" },
  { id: 27, name: "Новости" },
  { id: 28, name: "Художественный" },
  { id: 29, name: "Аниме" },
];

const TYPES = [
  { value: "ALL", label: "Все" },
  { value: "FILM", label: "Фильмы" },
  { value: "TV_SERIES", label: "Сериалы" },
  { value: "MINI_SERIES", label: "Мини-сериалы" },
  { value: "TV_SHOW", label: "ТВ-шоу" },
];

const GENRE_MAP = {
  "фэнтези": "Фэнтези", "фентази": "Фэнтези", "фэнтази": "Фэнтези", "фентези": "Фэнтези",
  "фантастика": "Фантастика", "sci-fi": "Фантастика",
  "боевик": "Боевик", "ужасы": "Ужасы", "комедия": "Комедия", "драма": "Драма",
  "мелодрама": "Мелодрама", "приключения": "Приключения", "детектив": "Детектив",
  "криминал": "Криминал", "исторический": "Историческое", "историческое": "Историческое",
  "триллер": "Триллер", "документальный": "Документальное", "детский": "Детский",
  "мультфильм": "Мультфильм", "мюзикл": "Мюзикл", "встерн": "Вестерн", "вестерн": "Вестерн",
  "военный": "Военный", "мистика": "Мистика", "аниме": "Аниме", "биография": "Биография",
  "семейный": "Семейный", "спорт": "Спорт", "короткометражный": "Короткометражный",
  "музыка": "Музыка", "развлекательное": "Развлекательное", "реальное тв": "Реальное ТВ",
  "ток-шоу": "Ток-шоу", "киноновелла": "Киноновелла", "церемония": "Церемония",
  "новости": "Новости", "художественный": "Художественный", "концерт": "Концерт",
  "реалити-шоу": "Реалити-шоу",
};

function normGenre(name) {
  const s = String(name || "").trim();
  if (!s) return "";
  const low = s.toLowerCase();
  if (GENRE_MAP[low]) return GENRE_MAP[low];
  return low.charAt(0).toUpperCase() + low.slice(1);
}

function unique(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

function fmtRating(v) {
  if (v === undefined || v === null || v === "") return "";
  const s = String(v).replace(",", ".").trim();
  if (!s) return "";
  const n = Number(s);
  if (Number.isFinite(n)) return s.slice(0, 10);
  return "";
}

// Значение числового параметра из формы: «7,5» → «7.5», пустое → undefined.
function numParam(v) {
  if (v === undefined || v === null || v === "") return undefined;
  const s = String(v).trim().replace(",", ".");
  return s || undefined;
}

function slugOf(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "film";
}

function dummyPoster(title) {
  return `https://dummyimage.com/400x600/1a1a2e/ffffff.png&text=${encodeURIComponent(String(title || "Фильм").slice(0, 60))}`;
}

// ---------- конфигурация API ----------
function loadConfig() {
  const envKey = process.env.KINOPOISK_API_KEY;
  if (envKey) return { apiKey: envKey };
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf8");
    const data = JSON.parse(raw);
    return { apiKey: String(data.apiKey || "").trim() };
  } catch {
    return {};
  }
}

let config = loadConfig();

function saveConfig(apiKey) {
  config = { apiKey: String(apiKey || "").trim() };
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

async function kpFetch(pathName, params = {}) {
  if (!config.apiKey) throw new ApiError("Сначала сохраните API-ключ Кинопоиска", 402);
  const url = new URL(KP_BASE + pathName);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: { "X-API-KEY": config.apiKey },
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 401) throw new ApiError("Неверный API-ключ Кинопоиска", 402);
  if (res.status === 429) throw new ApiError("Слишком много запросов к Кинопоиску, попробуйте позже", 429);
  if (!res.ok) throw new ApiError(`Кинопоиск ответил ошибкой ${res.status}`, 502);
  return res.json();
}

function normalizeItem(raw) {
  return {
    kinopoiskId: String(raw.kinopoiskId ?? raw.filmId ?? ""),
    name: String(raw.nameRu || raw.nameOriginal || raw.nameEn || `Кинопоиск #${raw.kinopoiskId ?? raw.filmId ?? ""}`).trim(),
    year: String(raw.year ?? ""),
    ratingImdb: fmtRating(raw.ratingImdb),
    ratingKinopoisk: fmtRating(raw.ratingKinopoisk),
    genres: unique((raw.genres || []).map((g) => normGenre(g.genre || g)).filter(Boolean)),
    type: raw.type || null,
    posterUrl: `${raw.posterUrl || ""}`,
    posterUrlPreview: `${raw.posterUrlPreview || raw.posterUrl || ""}`,
  };
}

// Собрать «сырые» записи из API по критериям (постранично).
async function fetchCriteriaItems(criteria, track) {
  const out = [];
  const limit = criteria.limit;

  if (criteria.keyword) {
    let page = 1;
    let pagesCount = 1;
    while (out.length < limit && page <= 20) {
      const data = await kpFetch("/api/v2.1/films/search-by-keyword", { keyword: criteria.keyword, page });
      for (const f of data.films || []) {
        out.push(f);
        if (out.length >= limit) break;
        await sleep(140);
      }
      if (track) track({ total: data.searchFilmsCountResult ?? data.films?.length, pages: data.pagesCount ?? data.pages });
      const pc = Number(data.pagesCount ?? data.pages);
      if (Number.isFinite(pc)) pagesCount = Math.max(1, Math.floor(pc));
      page += 1;
      if (page > pagesCount || out.length >= limit) break;
      await sleep(250);
    }
    return out;
  }

  let page = 1;
  while (out.length < limit && page <= 20) {
    const params = {
      genres: criteria.genreId,
      countries: criteria.countryId,
      yearFrom: numParam(criteria.yearFrom),
      yearTo: numParam(criteria.yearTo),
      type: criteria.type || "ALL",
      order: criteria.order || "RATING",
      ratingFrom: numParam(criteria.ratingFrom),
      ratingTo: numParam(criteria.ratingTo),
      page,
    };
    const data = await kpFetch("/api/v2.2/films", params);
    const items = data.items || [];
    if (!items.length) break;
    for (const it of items) {
      out.push(it);
      if (out.length >= limit) break;
    }
    if (track) track({ total: data.total, pages: data.pages, totalPages: data.totalPages });
    if (out.length >= limit) break;
    const totalPages = Number(data.totalPages ?? data.pages);
    page += 1;
    if (Number.isFinite(totalPages) && page > totalPages) break;
    await sleep(250);
  }
  return out;
}

// Собрать объект фильма нашей базы из «сырой» записи (детали + постер локально).
async function buildMovie(raw, fallbackName, { readDb, writeDb, MEDIA_DIR }) {
  let details = null;
  try {
    details = await kpFetch(`/api/v2.2/films/${raw.kinopoiskId}`);
  } catch {
    // детали необязательны — обойдёмся данными списка
  }

  const genreSrc = details?.genres?.length ? details.genres : raw.genres || [];
  const genres = unique(genreSrc.map((g) => normGenre(g.genre || g)).filter(Boolean));
  const title = String(details?.nameRu || raw.nameRu || raw.nameOriginal || fallbackName || `Фильм ${raw.kinopoiskId}`).trim();
  const year = String(details?.year ?? raw.year ?? "").slice(0, 4);
  const id = crypto.randomBytes(4).toString("hex");
  const dir = path.join(MEDIA_DIR, id);
  fs.mkdirSync(dir, { recursive: true });

  const posterSrc = raw.posterUrl || details?.posterUrl || "";
  let posterFile = null;
  if (posterSrc) {
    try {
      const fetched = await fetch(posterSrc, { signal: AbortSignal.timeout(20000) });
      if (fetched.ok) {
        const buf = Buffer.from(await fetched.arrayBuffer());
        let ext = "jpg";
        try {
          const m = /\.(png|webp|jpe?g)$/i.exec(new URL(posterSrc).pathname);
          if (m) ext = m[1].toLowerCase().replace("jpeg", "jpg");
        } catch { /* без разбора */ }
        const file = `poster.${ext}`;
        fs.writeFileSync(path.join(dir, file), buf);
        posterFile = file;
      }
    } catch {
      // постер не скачался — оставим внешний URL
    }
  }

  return {
    id,
    title,
    year,
    genre: genres.join(", "),
    genres,
    description: String(details?.description || details?.shortDescription || "").trim(),
    source: slugOf(title),
    kinopoiskId: String(raw.kinopoiskId),
    fromKinopoisk: true,
    videoUrl: null,
    videoSize: null,
    posterUrl: posterFile ? `/media/${id}/${posterFile}` : posterSrc || dummyPoster(title),
    addedAt: new Date().toISOString(),
    tags: genres.map((g) => g.toLowerCase()),
    ratings: {
      imdb: fmtRating(details?.ratingImdb ?? raw.ratingImdb),
      kinopoisk: fmtRating(details?.ratingKinopoisk ?? raw.ratingKinopoisk),
    },
    isNew: false,
    newUntil: null,
    comments: [],
    votes: [],
  };
}

// ---------- фоновые задачи («Собрать…») ----------
const jobs = new Map();

function startJob({ mode, title, criteria, items, limit }, deps) {
  const job = {
    id: "job" + crypto.randomBytes(6).toString("hex"),
    status: "running",
    title: String(title || "Сбор данных").slice(0, 120),
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    progress: {
      total: 0,
      done: 0,
      imported: 0,
      skipped: 0,
      current: "",
      list: [],
      errors: [],
    },
    _cancel: false,
  };
  jobs.set(job.id, job);
  runJob(job, { mode, criteria, items, limit }, deps).catch(() => finishJob(job, "error"));
  return { jobId: job.id };
}

function finishJob(job, status) {
  job.status = status;
  job.finishedAt = new Date().toISOString();
}

function jobSnapshot(job) {
  const { _cancel, ...rest } = job;
  return rest;
}

async function runJob(job, { criteria, items, limit, mode }, deps) {
  let raws;
  try {
    if (items && items.length) {
      raws = items.map((x) => ({ kinopoiskId: x.kinopoiskId, nameRu: x.name, ...x }));
      job.progress.total = raws.length;
    } else {
      const per = Math.max(1, Math.min(Math.floor(Number(limit) || 20), 300));
      raws = await fetchCriteriaItems({ ...(criteria || {}), limit: per }, (info) => {
        job.progress.found = info.total;
      });
      if (job._cancel) return finishJob(job, "cancelled");
      job.progress.total = raws.length;
    }

    for (const raw of raws) {
      if (job._cancel) return finishJob(job, "cancelled");
      const name = String(raw.nameRu || raw.nameOriginal || `#${raw.kinopoiskId}`).slice(0, 120);
      job.progress.current = name;
      await sleep(40);

      const db = deps.readDb();
      if (db.movies.some((m) => String(m.kinopoiskId || "") === String(raw.kinopoiskId))) {
        job.progress.skipped += 1;
        job.progress.list.push({ name, ok: "skip" });
      } else {
        try {
          const movie = await buildMovie(raw, name, deps);
          db.movies.unshift(movie);
          deps.writeDb(db);
          job.progress.imported += 1;
          job.progress.list.push({ name, movieId: movie.id, ok: "ok" });
        } catch (e) {
          const msg = e.message || String(e);
          job.progress.errors.push({ name, error: msg });
          job.progress.list.push({ name, ok: "error", error: msg });
        }
      }
      job.progress.done += 1;
    }
    finishJob(job, "done");
  } catch (e) {
    const msg = e.message || String(e);
    job.progress.errors.push({ name: job.progress.current || job.title, error: msg });
    finishJob(job, "error");
  }
}

// ---------- Router ----------
export function createKinopoiskRouter(deps) {
  const router = express.Router();

  router.get("/config", (req, res) => {
    res.json({ configured: !!config.apiKey });
  });

  router.post("/config", (req, res) => {
    const { apiKey } = req.body || {};
    if (!apiKey || !String(apiKey).trim()) {
      return res.status(400).json({ error: "Укажите API-ключ" });
    }
    saveConfig(String(apiKey).trim());
    res.json({ ok: true, configured: true });
  });

  router.post("/config/clear", (req, res) => {
    saveConfig("");
    try {
      fs.rmSync(CONFIG_FILE, { force: true });
    } catch { /* ignore */ }
    res.json({ ok: true, configured: false });
  });

  router.get("/genres", async (req, res) => {
    let genres = GENRE_FALLBACK;
    try {
      const filters = await kpFetch("/api/v2.2/films/filters");
      if (Array.isArray(filters.genres) && filters.genres.length) {
        genres = filters.genres
          .map((g) => ({ id: g.id, name: normGenre(g.genre || g) }))
          .filter((g) => g.id != null && g.name)
          .sort((a, b) => a.name.localeCompare(b.name, "ru"));
      }
    } catch {
      // живёт резервный список
    }
    res.json({ genres, types: TYPES });
  });

  router.post("/search", async (req, res) => {
    const body = req.body || {};
    const limit = Math.max(1, Math.min(Math.floor(Number(body.limit) || 20), 100));
    const criteria = {
      keyword: String(body.keyword || "").trim() || undefined,
      genreId: body.genreId != null && body.genreId !== "" ? body.genreId : undefined,
      yearFrom: numParam(body.yearFrom),
      yearTo: numParam(body.yearTo),
      type: body.type || "ALL",
      order: body.order || "RATING",
      ratingFrom: numParam(body.ratingFrom),
      ratingTo: numParam(body.ratingTo),
      limit,
    };
    if (!criteria.keyword && !criteria.genreId && !criteria.yearFrom && !criteria.yearTo && !criteria.ratingFrom) {
      return res.status(400).json({ error: "Укажите хотя бы один фильтр: жанр, слово, год или минимальный рейтинг" });
    }
    try {
      let meta = {};
      const raws = await fetchCriteriaItems(criteria, (info) => { meta = info; });
      res.json({ items: raws.map(normalizeItem), total: meta.total || raws.length, totalPages: meta.totalPages || 0 });
    } catch (e) {
      res.status(e.status || 502).json({ error: e.message });
    }
  });

  router.post("/jobs", (req, res) => {
    const body = req.body || {};
    const mode = body.mode || "criteria";
    let payload = {};
    if (mode === "items") {
      const items = Array.isArray(body.items) ? body.items.filter((x) => x && x.kinopoiskId) : [];
      if (!items.length) return res.status(400).json({ error: "Ничего не выбрано для импорта" });
      payload = { mode, items, title: body.title || "Выбранные фильмы" };
    } else {
      const limit = Math.max(1, Math.min(Math.floor(Number(body.limit) || 20), 300));
      const c = body.criteria || {};
      payload = {
        mode,
        limit,
        title: body.title || "Сбор по фильтрам",
        criteria: {
          keyword: String(c.keyword || "").trim() || undefined,
          genreId: c.genreId != null && c.genreId !== "" ? c.genreId : undefined,
          yearFrom: numParam(c.yearFrom),
          yearTo: numParam(c.yearTo),
          type: c.type || "ALL",
          order: c.order || "RATING",
          ratingFrom: numParam(c.ratingFrom),
          ratingTo: numParam(c.ratingTo),
        },
      };
    }
    res.json(startJob(payload, deps));
  });

  router.get("/jobs/:id", (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: "Задача не найдена" });
    res.json(jobSnapshot(job));
  });

  router.delete("/jobs/:id", (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: "Задача не найдена" });
    if (!job.finishedAt) job._cancel = true;
    res.json({ ok: true });
  });

  return router;
}