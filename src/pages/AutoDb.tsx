import { useEffect, useRef, useState } from "react";
import {
  clearKpConfig,
  fetchKpConfig,
  fetchKpGenres,
  kpCancelJob,
  kpJobStatus,
  kpSearch,
  kpStartJob,
  saveKpConfig,
  type KpGenre,
  type KpItem,
  type KpJob,
  type KpType,
} from "../api";
import { useAdmin } from "../admin";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 300;

function fmtRating(v: string): string {
  if (!v) return "—";
  return Number(v).toLocaleString("ru-RU", { maximumFractionDigits: 1 });
}

function fmtCount(n: number): string {
  return n.toLocaleString("ru-RU");
}

function jobLabel(criteria: {
  keyword?: string;
  genreId?: number | string;
  yearFrom?: string;
  yearTo?: string;
  type?: string;
}, genres: KpGenre[], types: KpType[]): string {
  if (criteria.keyword) return `Поиск «${criteria.keyword}»`;
  const g = genres.find((x) => String(x.id) === String(criteria.genreId))?.name;
  const t = types.find((x) => x.value === criteria.type)?.label ?? "Все";
  const years = criteria.yearFrom || criteria.yearTo ? `${criteria.yearFrom || "?"}–${criteria.yearTo || "?"}` : "";
  return [g || "Любой жанр", t, years].filter(Boolean).join(" · ");
}

export default function AutoDb() {
  const { token, requireAuth } = useAdmin();
  const [authed, setAuthed] = useState(!!token);

  const [configured, setConfigured] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [clearingKey, setClearingKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [keyError, setKeyError] = useState("");

  const [genres, setGenres] = useState<KpGenre[]>([]);
  const [types, setTypes] = useState<KpType[]>([]);
  const [genresError, setGenresError] = useState("");

  const [mode, setMode] = useState<"filters" | "keyword">("filters");
  const [genreId, setGenreId] = useState("");
  const [type, setType] = useState("FILM");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [order, setOrder] = useState("RATING");
  const [ratingFrom, setRatingFrom] = useState("");
  const [keyword, setKeyword] = useState("");
  const [limit, setLimit] = useState(DEFAULT_LIMIT);

  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searched, setSearched] = useState(false);
  const [items, setItems] = useState<KpItem[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [job, setJob] = useState<KpJob | null>(null);
  const [jobError, setJobError] = useState("");
  const pollRef = useRef<number | null>(null);
  const [busy, setBusy] = useState(false); // распознаём ли мы кнопки «Собрать»
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (token) setAuthed(true);
  }, [token]);

  useEffect(() => {
    if (!authed || !token) return;
    let alive = true;
    fetchKpConfig(token).then((c) => {
      if (alive) {
        setConfigured(c.configured);
        setShowKeyInput(!c.configured);
      }
    }).catch((e) => setKeyError(e instanceof Error ? e.message : "Не удалось получить настройки"));
    fetchKpGenres(token).then((g) => {
      if (alive) {
        setGenres(g.genres);
        setTypes(g.types);
      }
    }).catch((e) => setGenresError(e instanceof Error ? e.message : "Не удалось получить список жанров"));
    return () => { alive = false; };
  }, [authed, token]);

  // опрос статуса задачи
  useEffect(() => {
    if (!job || !token || job.status !== "running" || !job.id) return;
    clearInterval(pollRef.current ?? undefined);
    pollRef.current = window.setInterval(async () => {
      try {
        const j = await kpJobStatus(job.id, token);
        setJob(j);
        if (j.status !== "running" && pollRef.current != null) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        // сеть моргнула — следующая итерация
      }
    }, 800);
    return () => {
      if (pollRef.current != null) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [job?.id, job?.status, token]);

  const cleanNum = (s: string) => s.trim().replace(",", ".");

  function criteria() {
    const lim = Math.max(1, Math.min(Math.floor(Number(limit) || DEFAULT_LIMIT), MAX_LIMIT));
    return mode === "keyword"
      ? {
          keyword: keyword.trim() || undefined,
          ratingFrom: cleanNum(ratingFrom) || undefined,
          limit: lim,
        }
      : {
          genreId: genreId || undefined,
          yearFrom: cleanNum(yearFrom) || undefined,
          yearTo: cleanNum(yearTo) || undefined,
          type,
          order,
          ratingFrom: cleanNum(ratingFrom) || undefined,
          limit: lim,
        };
  }

  const hasFilter = mode === "keyword"
    ? !!keyword.trim()
    : !!(genreId || yearFrom.trim() || yearTo.trim() || ratingFrom.trim());

  async function onSaveKey() {
    if (!token || !keyDraft.trim()) return;
    setSavingKey(true);
    setKeyError("");
    try {
      await saveKpConfig(keyDraft.trim(), token);
      setConfigured(true);
      setShowKeyInput(false);
      setKeyDraft("");
    } catch (e) {
      setKeyError(e instanceof Error ? e.message : "Не удалось сохранить ключ");
    } finally {
      setSavingKey(false);
    }
  }

  async function onClearKey() {
    if (!token) return;
    setClearingKey(true);
    setKeyError("");
    try {
      await clearKpConfig(token);
      setConfigured(false);
      setShowKeyInput(true);
    } catch (e) {
      setKeyError(e instanceof Error ? e.message : "Не удалось удалить ключ");
    } finally {
      setClearingKey(false);
    }
  }

  async function onFind(e?: React.FormEvent) {
    e?.preventDefault();
    if (!token || !configured) return;
    const c = criteria();
    if (!c.keyword && !c.genreId && !c.yearFrom && !c.yearTo && !c.ratingFrom) {
      setSearchError("Укажите хотя бы один фильтр: жанр, слово, год или минимальный рейтинг");
      return;
    }
    setSearching(true);
    setSearchError("");
    setSearched(false);
    try {
      const r = await kpSearch({ ...c, limit: Math.min(c.limit ?? 20, 100) }, token);
      setItems(r.items);
      setSearchTotal(r.total || 0);
      setSelected(new Set(r.items.map((i) => i.kinopoiskId)));
      setSearched(true);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Ошибка поиска");
    } finally {
      setSearching(false);
    }
  }

  function toggleItem(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((s) => (s.size === items.length ? new Set() : new Set(items.map((i) => i.kinopoiskId))));
  }

  async function startCollect(payload: { mode: "criteria" | "items"; criteria?: ReturnType<typeof criteria>; items?: KpItem[]; limit?: number; title?: string }) {
    if (!token || !configured) return;
    if (job && job.status === "running") {
      setJobError("Сначала дождитесь или отмените текущую задачу");
      return;
    }
    setBusy(true);
    setJobError("");
    try {
      const r = await kpStartJob(payload, token);
      setJob((await kpJobStatus(r.jobId, token)) as KpJob);
      setCancelling(false);
    } catch (e) {
      setJobError(e instanceof Error ? e.message : "Не удалось запустить сбор");
    } finally {
      setBusy(false);
    }
  }

  function onCollectAll() {
    const c = criteria();
    if (!hasFilter) {
      setJobError("Укажите хотя бы один фильтр");
      return;
    }
    void startCollect({ mode: "criteria", criteria: c, limit: c.limit, title: `Сбор: ${jobLabel(c, genres, types)}` });
  }

  function onCollectSelected() {
    const sel = items.filter((i) => selected.has(i.kinopoiskId));
    if (!sel.length) return;
    void startCollect({ mode: "items", items: sel, title: `Выборка: ${sel.length} фильмов` });
  }

  async function onCancelJob() {
    if (!token || !job || job.status !== "running") return;
    setCancelling(true);
    try {
      await kpCancelJob(job.id, token);
    } catch { /* игнорируем — следующая итерация опроса */ }
  }

  if (!authed) {
    return (
      <div className="page">
        <div className="block empty">
          <p>Для доступа к АвтоБД войдите как администратор.</p>
          <button className="btn primary" onClick={() => { void requireAuth(); }}>Войти</button>
        </div>
      </div>
    );
  }

  const running = !!job && job.status === "running";
  const fetching = running && !job!.progress.total;
  const pct = job && job.progress.total > 0 ? Math.min(100, Math.round((job.progress.done / job.progress.total) * 100)) : 0;
  const jobSummary = job && job.finishedAt;

  return (
    <div className="page autodb">
      <div className="page-head">
        <h2>АвтоБД — наполнение из Кинопоиска</h2>
        <p className="muted">
          Кинотека ищет фильмы в базе Кинопоиска и добавляет их в вашу коллекцию без видеофайлов
          (постер, описание, оценки, жанры). Видео добавите вручную через «✎ Редактировать».
        </p>
      </div>

      <section className="block kp-card">
        <h3 className="block-title">API-ключ Кинопоиска</h3>
        {configured && !showKeyInput ? (
          <div className="kp-key-ready">
            <span className="chip ok">Ключ настроен ✓</span>
            <button className="btn ghost small" onClick={() => setShowKeyInput(true)}>Сменить</button>
            <button className="btn danger ghost small" onClick={onClearKey} disabled={clearingKey}>
              {clearingKey ? "Удаляю…" : "Удалить ключ"}
            </button>
          </div>
        ) : (
          <div className="kp-key-input">
            <input
              className="search"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder="Вставьте API-ключ (kinopoiskapiunofficial.tech)"
            />
            <button className="btn primary" onClick={onSaveKey} disabled={savingKey || !keyDraft.trim()}>
              {savingKey ? "Сохраняю…" : "Сохранить ключ"}
            </button>
          </div>
        )}
        <p className="muted">
          Бесплатный ключ выдаётся на{" "}
          <a href="https://kinopoiskapiunofficial.tech" target="_blank" rel="noreferrer">kinopoiskapiunofficial.tech</a>{" "}
          и хранится только на вашем сервере.
        </p>
        {keyError && <p className="error">{keyError}</p>}
        {!configured && (
          <p className="kp-tip">
            Сначала вставьте и сохраните ключ — без него поиск и сбор не работают.
          </p>
        )}
      </section>

      <section className="block kp-card">
        <form onSubmit={onFind}>
          <div className="form-grid">
            <div className="field span-2">
              <label>Режим</label>
              <div className="segmented">
                <button type="button" className={mode === "filters" ? "active" : ""} onClick={() => setMode("filters")}>По жанру и годам</button>
                <button type="button" className={mode === "keyword" ? "active" : ""} onClick={() => setMode("keyword")}>По ключевым словам</button>
              </div>
            </div>

            {mode === "filters" && (
              <>
                <div className="field">
                  <label>Жанр</label>
                  <select value={genreId} onChange={(e) => setGenreId(e.target.value)}>
                    <option value="">Любой</option>
                    {genres.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                  {genresError && <span className="error small">{genresError}</span>}
                </div>

                <div className="field">
                  <label>Тип</label>
                  <select value={type} onChange={(e) => setType(e.target.value)}>
                    {types.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label>Год от</label>
                  <input className="search" type="number" min="1900" max="2100" value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} placeholder="2020" />
                </div>

                <div className="field">
                  <label>Год до</label>
                  <input className="search" type="number" min="1900" max="2100" value={yearTo} onChange={(e) => setYearTo(e.target.value)} placeholder="2026" />
                </div>

                <div className="field">
                  <label>Сортировка</label>
                  <select value={order} onChange={(e) => setOrder(e.target.value)}>
                    <option value="RATING">По рейтингу</option>
                    <option value="NUM_VOTE">По числу голосов</option>
                    <option value="YEAR">По году</option>
                  </select>
                </div>

                <div className="field">
                  <label>Рейтинг от</label>
                  <input className="search" type="number" min="0" max="10" step="0.1" value={ratingFrom} onChange={(e) => setRatingFrom(e.target.value)} placeholder="7.5" />
                </div>
              </>
            )}

            {mode === "keyword" && (
              <div className="field span-2">
                <label>Ключевое слово</label>
                <input className="search" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Например: Матрица или Сталкер" />
              </div>
            )}

            <div className="field span-2">
              <label>Сколько собрать (макс.)</label>
              <input className="search" type="number" min="1" max={MAX_LIMIT} value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
            </div>
          </div>

          <div className="kp-actions">
            <button className="btn" type="submit" disabled={searching || running || !configured}>
              {searching ? "Ищу…" : "Предпросмотр"}
            </button>
            <button className="btn primary" type="button" onClick={onCollectAll} disabled={running || busy || !configured || !hasFilter}>
              Собрать все ({limit})
            </button>
            <button className="btn ghost" type="button" onClick={() => { setItems([]); setSelected(new Set()); setSearched(false); setSearchTotal(0); }}
              disabled={running || searching || items.length === 0}>Очистить</button>
          </div>
          {searchError && <p className="error">{searchError}</p>}
        </form>
      </section>

      {items.length > 0 && (
        <section className="block kp-card">
          <div className="kp-results-head">
            <div className="kp-results-head-info">
              <h3 className="block-title">Результаты</h3>
              <span className="kp-results-count">
                Найдено: {fmtCount(items.length)}
                {searchTotal > items.length && <> · в API ещё больше: <b>{fmtCount(searchTotal)}</b></>}
              </span>
            </div>
            <label className="check-all">
              <input type="checkbox" checked={selected.size === items.length && items.length > 0} onChange={toggleAll} />
              Выбрать все
            </label>
            <button className="btn primary small" onClick={onCollectSelected} disabled={running || busy || selected.size === 0}>
              Добавить выбранные ({selected.size})
            </button>
          </div>
          <ul className="kp-results">
            {items.map((it) => (
              <li key={it.kinopoiskId} className={selected.has(it.kinopoiskId) ? "kp-item sel" : "kp-item"}>
                <label className="kp-check">
                  <input type="checkbox" checked={selected.has(it.kinopoiskId)} onChange={() => toggleItem(it.kinopoiskId)} />
                </label>
                <div className="kp-thumb">
                  {it.posterUrlPreview ? <img src={it.posterUrlPreview} alt="" loading="lazy" /> : <span className="kp-thumb-empty">🎬</span>}
                </div>
                <div className="kp-info">
                  <div className="kp-name">{it.name}</div>
                  <div className="kp-meta">
                    {it.year && <span className="chip">{it.year}</span>}
                    <span className="chip">К.п. {fmtRating(it.ratingKinopoisk)}</span>
                    <span className="chip">IMDb {fmtRating(it.ratingImdb)}</span>
                    {it.type && <span className="chip">{it.type}</span>}
                  </div>
                  {it.genres.length > 0 && <div className="kp-tags">{it.genres.join(", ")}</div>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {searched && items.length === 0 && !searching && (
        <section className="block kp-card">
          <div className="kp-empty">
            <p>По этим фильтрам ничего не нашлось.</p>
            <p className="muted">Попробуйте расширить фильтры: другой жанр, больше лет или без минимального рейтинга.</p>
          </div>
        </section>
      )}

      {job && (
        <section className="block kp-card">
          <div className="kp-results-head">
            <div className="kp-results-head-info">
              <h3 className="block-title">{job.title}</h3>
              <span className={`kp-status-chip ${job.status}`}>
                {job.status === "running" && "Идёт…"}
                {job.status === "done" && "Готово ✓"}
                {job.status === "cancelled" && "Отменено"}
                {job.status === "error" && "Ошибка"}
              </span>
            </div>
            {running && <button className="btn danger small" onClick={onCancelJob} disabled={cancelling}>
              {cancelling ? "Отменяю…" : "Отменить"}
            </button>}
          </div>

          {running && (
            <div className="progress-wrap">
              <div className="progress-caption">
                <span>{fetching ? "Поиск по API…" : `Обработано ${job.progress.done} из ${job.progress.total}`}</span>
                <span>{fetching ? (job.progress.found ? `найдено ${fmtCount(job.progress.found)}` : "страница…") : `${pct}%`}</span>
              </div>
              <div className="progress-track">
                <div className={`progress-fill ${fetching ? "fetching" : ""}`} style={{ width: fetching ? "100%" : `${pct}%` }} />
              </div>
              <div className="job-current">
                {fetching
                  ? "Собираю список фильмов по вашим фильтрам…"
                  : job.progress.current
                    ? <>Сейчас: <em>{job.progress.current}</em></>
                    : "Готовлюсь…"}
              </div>
            </div>
          )}

          {(job.progress.imported > 0 || job.progress.skipped > 0 || job.progress.errors.length > 0 || jobSummary) && (
            <div className="job-stats">
              <span className={`stat ${job.progress.imported > 0 ? "ok" : ""}`}>Добавлено: {fmtCount(job.progress.imported)}</span>
              <span className="stat">Уже было: {fmtCount(job.progress.skipped)}</span>
              {job.progress.errors.length > 0 && <span className="stat err">Ошибки: {fmtCount(job.progress.errors.length)}</span>}
            </div>
          )}

          {jobSummary && (
            <div className={`job-done ${job.status === "error" ? "err" : job.status === "cancelled" ? "muted" : "ok"}`}>
              {job.status === "done" && "Готово ✓ — можно открывать фильмы и добавлять к ним видео."}
              {job.status === "cancelled" && "Сбор отменён. Добавленное сохранилось в базе."}
              {job.status === "error" && "Сбор завершился с ошибкой."}
            </div>
          )}

          {job.progress.list.length > 0 && (
            <ul className="job-list">
              {job.progress.list.map((line, i) => (
                <li key={i} className={`job-line ${line.ok === "ok" ? "ok" : line.ok === "error" ? "err" : "skip"}`}>
                  {line.ok === "ok" && <span className="job-mark">+</span>}
                  {line.ok === "skip" && <span className="job-mark">≈</span>}
                  {line.ok === "error" && <span className="job-mark">!</span>}
                  <span className="job-line-name">{line.name}</span>
                  {line.ok === "ok" && <span className="job-line-info">добавлен</span>}
                  {line.ok === "skip" && <span className="job-line-info">уже был в базе</span>}
                  {line.ok === "error" && <span className="job-line-info">{line.error}</span>}
                </li>
              ))}
            </ul>
          )}

          {jobError && <p className="error">{jobError}</p>}
        </section>
      )}
    </div>
  );
}