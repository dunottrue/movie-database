import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Hls from "hls.js";

interface PlayerProps {
  src: string;
  subtitlesUrl?: string | null;
  onClose: () => void;
}

interface LevelItem {
  index: number;
  height: number;
  bitrate: number;
}

interface SubItem {
  index: number;
  label: string;
}

type MenuKind = "gear" | "quality" | "subs" | "speed" | null;

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const NOT_PLAYABLE = /\.(mkv|avi|flv|vob|wmv|mpg|mpeg|ts|rmvb|divx)([?#].*)?$/i;

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

export default function Player({ src, subtitlesUrl, onClose }: PlayerProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const volumeWrapRef = useRef<HTMLSpanElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const idleTimer = useRef<number | null>(null);
  const clickTimer = useRef<number | null>(null);
  const osdTimer = useRef<number | null>(null);
  const volRef = useRef(1);

  const isHls = useMemo(() => /\.m3u8([?#].*)?$/i.test(src), [src]);
  const formatWarn = useMemo(() => {
    if (!isHls && NOT_PLAYABLE.test(src)) return true;
    return false;
  }, [src, isHls]);

  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => {
    const raw = Number(localStorage.getItem("movie_volume"));
    return isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 1;
  });
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [buffered, setBuffered] = useState<{ start: number; end: number }[]>([]);
  const [isFull, setIsFull] = useState(false);
  const [levels, setLevels] = useState<LevelItem[]>([]);
  const [level, setLevel] = useState(-1);
  const [subTracks, setSubTracks] = useState<SubItem[]>([]);
  const [sub, setSub] = useState(-1);
  const [menu, setMenu] = useState<MenuKind>(null);
  const [uiHidden, setUiHidden] = useState(false);
  const [osd, setOsd] = useState<number | null>(null);

  const pipSupported = typeof document !== "undefined" && "pictureInPictureEnabled" in document && !!document.pictureInPictureEnabled;

  const showUi = useCallback(() => {
    setUiHidden(false);
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setUiHidden((h) => (h ? h : true)), 2800);
  }, []);

  useEffect(() => {
    volRef.current = volume;
  }, [volume]);

  useEffect(() => {
    showUi();
    return () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      if (clickTimer.current) window.clearTimeout(clickTimer.current);
      if (osdTimer.current) window.clearTimeout(osdTimer.current);
    };
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    setLevels([]);
    setLevel(-1);
    setSubTracks([]);
    setSub(-1);
    setCurrent(0);
    setDuration(0);
    setWaiting(false);
    setPlaying(false);

    let hls: Hls | null = null;

    if (isHls && !v.canPlayType("application/vnd.apple.mpegurl")) {
      if (!Hls.isSupported()) return;
      hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(v);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (hls!.levels.length > 1) {
          setLevels(hls!.levels.map((l, i) => ({ index: i, height: l.height || 0, bitrate: l.bitrate || 0 })));
        }
        const tracks = (hls!.subtitleTracks || []).map((t, i) => ({
          index: i,
          label: t.name || (t.lang ? t.lang.toUpperCase() : "Дорожка " + (i + 1)),
        }));
        if (tracks.length) setSubTracks(tracks);
        v.play().then(() => setPlaying(true)).catch(() => {});
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
        if (typeof data.level === "number") setLevel(hls!.currentLevel);
      });
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
        const tracks = (hls!.subtitleTracks || []).map((t, i) => ({
          index: i,
          label: t.name || (t.lang ? t.lang.toUpperCase() : "Дорожка " + (i + 1)),
        }));
        if (tracks.length) setSubTracks(tracks);
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls!.startLoad();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls!.recoverMediaError();
        }
      });
    } else {
      v.src = src;
    }

    return () => {
      if (hls) {
        hls.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, isHls]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !subtitlesUrl) return;
    const t = () => {
      const tracks = Array.from(v.textTracks || []);
      const info = tracks.filter((tt) => tt.kind === "subtitles" || tt.kind === "captions");
      if (info.length) {
        setSubTracks((prev) =>
          prev.length ? prev : info.map((tt, i) => ({ index: i, label: tt.label || "Субтитры" }))
        );
      }
    };
    v.addEventListener("loadedmetadata", t);
    t();
    return () => v.removeEventListener("loadedmetadata", t);
  }, [subtitlesUrl, src]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCurrent(v.currentTime);
    const onDur = () => setDuration(v.duration || 0);
    const onPlay = () => { setPlaying(true); setUiHidden(false); };
    const onPause = () => { setPlaying(false); setUiHidden(false); };
    const onWait = () => setWaiting(true);
    const onCan = () => setWaiting(false);
    const onBuf = () => {
      const list: { start: number; end: number }[] = [];
      for (let i = 0; i < v.buffered.length; i++) list.push({ start: v.buffered.start(i), end: v.buffered.end(i) });
      setBuffered(list);
    };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("durationchange", onDur);
    v.addEventListener("loadedmetadata", onDur);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("waiting", onWait);
    v.addEventListener("canplay", onCan);
    v.addEventListener("progress", onBuf);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("durationchange", onDur);
      v.removeEventListener("loadedmetadata", onDur);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("waiting", onWait);
      v.removeEventListener("canplay", onCan);
      v.removeEventListener("progress", onBuf);
    };
  }, [src, isHls]);

  useEffect(() => {
    const v = videoRef.current;
    const wrap = wrapRef.current;
    if (!v || !wrap) return;
    const onFs = () => setIsFull(!!document.fullscreenElement);
    wrap.addEventListener("fullscreenchange", onFs);
    return () => {
      wrap.removeEventListener("fullscreenchange", onFs);
    };
  }, [src]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    v.muted = muted;
  }, [volume, muted, src]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = rate;
  }, [rate, src]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const vol = volumeWrapRef.current;
    if (!wrap || !vol) return;
    const onWheel = (e: WheelEvent) => {
      const isFull = !!document.fullscreenElement;
      const overVol = vol.contains(e.target as Node);
      if (!overVol && !isFull) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -1 : 1;
      changeVolume(volRef.current + delta * 0.1);
      showVolumeOsd();
    };
    wrap.addEventListener("wheel", onWheel, { passive: false });
    return () => wrap.removeEventListener("wheel", onWheel);
  }, []);

  function pickLevel(i: number) {
    setLevel(i);
    const hls = hlsRef.current;
    if (hls) hls.currentLevel = i;
    setMenu(null);
  }

  function pickSub(i: number) {
    setSub(i);
    const v = videoRef.current;
    const hls = hlsRef.current;
    if (hls && subTracks.length) {
      hls.subtitleTrack = i;
    } else if (v && v.textTracks) {
      for (let t = 0; t < v.textTracks.length; t++) {
        v.textTracks[t].mode = t === i ? "showing" : "disabled";
      }
    }
    setMenu(null);
  }

  async function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    showUi();
    if (v.paused) {
      try { await v.play(); } catch {}
    } else {
      v.pause();
    }
  }

  function seekTo(t: number) {
    const v = videoRef.current;
    if (!v || !isFinite(t)) return;
    v.currentTime = Math.min(Math.max(t, 0), v.duration || 0);
    setCurrent(v.currentTime);
  }

  function changeVolume(vol: number) {
    const n = Math.min(Math.max(vol, 0), 1);
    volRef.current = n;
    setVolume(n);
    setMuted(n === 0);
    localStorage.setItem("movie_volume", String(n));
  }

  function showVolumeOsd() {
    setOsd(volRef.current);
    if (osdTimer.current) window.clearTimeout(osdTimer.current);
    osdTimer.current = window.setTimeout(() => setOsd(null), 900);
  }

  function toggleMute() {
    setMuted((m) => !m);
  }

  async function toggleFull() {
    const wrap = wrapRef.current;
    if (!wrap) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await wrap.requestFullscreen();
    } catch {}
    setMenu(null);
  }

  async function togglePip() {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch {}
  }

  function onVideoClick() {
    if (clickTimer.current) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
      return;
    }
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      const v = videoRef.current;
      if (!v) return;
      showUi();
      if (v.paused) {
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    }, 260);
  }

  async function onVideoDblClick() {
    if (clickTimer.current) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    const wrap = wrapRef.current;
    const v = videoRef.current;
    if (!wrap || !v) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        if (!v.paused) v.pause();
      } else {
        await wrap.requestFullscreen();
        if (v.paused) {
          try { await v.play(); } catch {}
        }
      }
    } catch {}
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = (e.target as HTMLElement)?.tagName;
      if (target === "INPUT" || target === "TEXTAREA") return;
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowRight":
          e.preventDefault();
          if (videoRef.current) seekTo(videoRef.current.currentTime + 10);
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (videoRef.current) seekTo(videoRef.current.currentTime - 10);
          break;
        case "ArrowUp":
          e.preventDefault();
          changeVolume(volRef.current + 0.1);
          break;
        case "ArrowDown":
          e.preventDefault();
          changeVolume(volRef.current - 0.1);
          break;
        case "m":
          toggleMute();
          break;
        case "f":
          toggleFull();
          break;
        case "Escape":
          if (!document.fullscreenElement) onClose();
          break;
      }
      showUi();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const levelLabel = level >= 0 && levels[level] ? `${levels[level].height || "?"}p` : "Авто";
  const subLabel = sub >= 0 && subTracks[sub] ? subTracks[sub].label : "Выкл";
  const pct = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div
      ref={wrapRef}
      className={`player${uiHidden && playing ? " ui-hidden" : ""}`}
      onMouseMove={showUi}
      onMouseLeave={() => playing && setUiHidden(true)}
    >
      <video
        ref={videoRef}
        className="player-video"
        playsInline
        onClick={onVideoClick}
        onDoubleClick={onVideoDblClick}
      >
        {subtitlesUrl && <track kind="subtitles" src={subtitlesUrl} label="Субтитры" default />}
      </video>

      <div className={`player-osd${osd == null ? " hide" : ""}`}>
        {osd != null && (
          <>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor" stroke="none" />
              <path d="M15.5 8.5a5 5 0 0 1 0 7 M19 5a9 9 0 0 1 0 14" strokeLinecap="round" />
            </svg>
            <span className="player-osd-val">{Math.round(osd * 100)}%</span>
          </>
        )}
      </div>

      {formatWarn && (
        <div className="player-warn">
          Этот формат (MKV/AVI) браузер не проигрывает напрямую. Конвертируйте в MP4/WebM
          или укажите ссылку на поток (HLS).
        </div>
      )}

      {waiting && !formatWarn && (
        <div className="player-spinner"><span className="loader-spinner" /></div>
      )}

      {!playing && !waiting && !formatWarn && (
        <button className="player-big" onClick={togglePlay} aria-label="Смотреть">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        </button>
      )}

      {menu === "gear" && (
        <>
          <div className="player-menu-backdrop" onClick={() => setMenu(null)} />
          <div className="player-menu-drop center">
            <div className="player-menu">
              <div className="player-menu-title">Настройки</div>
              <button
                className="player-menu-item"
                disabled={!subTracks.length}
                onClick={() => { if (subTracks.length) setMenu("subs"); }}
              >
                <span>Субтитры</span>
                <span className="player-menu-val">{subLabel}<span className="player-menu-chev">›</span></span>
              </button>
              <button
                className="player-menu-item"
                disabled={!levels.length}
                onClick={() => { if (levels.length) setMenu("quality"); }}
              >
                <span>Качество</span>
                <span className="player-menu-val">{levelLabel}<span className="player-menu-chev">›</span></span>
              </button>
              <button className="player-menu-item" onClick={() => setMenu("speed")}>
                <span>Скорость</span>
                <span className="player-menu-val">{rate}×<span className="player-menu-chev">›</span></span>
              </button>
            </div>
          </div>
        </>
      )}

      {menu === "quality" && levels.length > 0 && (
        <DropMenu
          title="Качество"
          onBack={() => setMenu("gear")}
          onClose={() => setMenu(null)}
          items={[{ value: -1, label: "Авто" }, ...levels.map((l) => ({
            value: l.index,
            label: `${l.height}p${l.bitrate ? ` · ${(l.bitrate / 1000).toFixed(0)} kbps` : ""}`,
          }))]}
          active={level}
          onPick={pickLevel}
        />
      )}

      {menu === "subs" && subTracks.length > 0 && (
        <DropMenu
          title="Субтитры"
          onBack={() => setMenu("gear")}
          onClose={() => setMenu(null)}
          items={[{ value: -1, label: "Выключены" }, ...subTracks.map((t) => ({ value: t.index, label: t.label }))]}
          active={sub}
          onPick={pickSub}
        />
      )}

      {menu === "speed" && (
        <DropMenu
          title="Скорость"
          onBack={() => setMenu("gear")}
          onClose={() => setMenu(null)}
          items={[...SPEEDS].sort((a, b) => b - a).map((s) => ({ value: s, label: `${s}×` }))}
          active={rate}
          onPick={(v) => { setRate(v as number); setMenu(null); }}
        />
      )}

      <div className="player-bar" onClick={() => setMenu(null)}>
        <div className="player-seek">
          <div className="player-seek-track">
            {buffered.map((b, i) => (
              <div key={i} className="player-buffered" style={{ left: `${(b.start / (duration || 1)) * 100}%`, width: `${((b.end - b.start) / (duration || 1)) * 100}%` }} />
            ))}
            <div className="player-progress" style={{ width: `${pct}%` }} />
            <div className="player-thumb" style={{ left: `${pct}%` }} />
          </div>
          <input
            type="range"
            className="player-range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={current}
            aria-label="Перемотка"
            onChange={(e) => seekTo(Number(e.target.value))}
          />
        </div>

        <div className="player-controls">
          <div className="player-left">
            <button className="player-btn" onClick={togglePlay} title={playing ? "Пауза (K)" : "Смотреть (K)"} aria-label={playing ? "Пауза" : "Смотреть"}>
              {playing ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>
            <span className="player-time">{fmt(current)} / {fmt(duration)}</span>
          </div>

          <div className="player-right">
            <span className="player-ctrl-group vol" ref={volumeWrapRef}>
              <button className="player-btn" onClick={toggleMute} title={muted ? "Включить звук (M)" : "Выключить звук (M)"} aria-label={muted ? "Включить звук" : "Выключить звук"}>
                {muted || volume === 0 ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                ) : volume < 0.5 ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor" stroke="none" /><path d="M15.5 8.5a5 5 0 0 1 0 7" strokeLinecap="round" /></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor" stroke="none" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" strokeLinecap="round" /></svg>
                )}
              </button>
              <input
                type="range"
                className="player-volume"
                min={0}
                max={1}
                step={0.02}
                value={muted ? 0 : volume}
                aria-label="Громкость"
                onChange={(e) => changeVolume(Number(e.target.value))}
              />
            </span>

            <span className="player-sep" />

            <button
              className={`player-btn${menu === "gear" ? " active" : ""}`}
              onClick={(e) => { e.stopPropagation(); setMenu((m) => (m === "gear" ? null : "gear")); }}
              title="Настройки"
              aria-label="Настройки"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3.2" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7" strokeLinecap="round" /></svg>
            </button>

            <span className="player-sep" />

            {pipSupported && (
              <button className="player-btn" onClick={togglePip} title="Картинка в картинке" aria-label="Картинка в картинке">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="2" /><rect x="10" y="12" width="8" height="5" rx="1" fill="currentColor" stroke="none" /></svg>
              </button>
            )}
            <button className="player-btn" onClick={toggleFull} title={isFull ? "Выйти из полного экрана (F)" : "На весь экран (F)"} aria-label="На весь экран">
              {isFull ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v5H3M16 3v5h5M8 21v-5H3M16 21v-5h5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DropMenu<T>({ title, items, active, onPick, onClose, onBack }: {
  title: string;
  items: { value: T; label: string }[];
  active: T;
  onPick: (v: T) => void;
  onClose: () => void;
  onBack?: () => void;
}) {
  return (
    <>
      <div className="player-menu-backdrop" onClick={onClose} />
      <div className="player-menu-drop center">
        <div className="player-menu">
          <div className="player-menu-title">
            {onBack && <button className="player-menu-back" onClick={onBack} aria-label="Назад">‹</button>}
            <span className="player-menu-title-text">{title}</span>
          </div>
          {items.map((it) => (
            <button
              key={String(it.value)}
              className={`player-menu-item${it.value === active ? " active" : ""}`}
              onClick={() => onPick(it.value)}
            >
              {it.label}
              {it.value === active && <span className="player-menu-check">✓</span>}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}