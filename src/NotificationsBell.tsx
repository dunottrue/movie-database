import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { deleteNotification, fetchNotifications, markNotificationsRead, type Notification } from "./api";
import { useUser } from "./user";

export default function NotificationsBell() {
  const { user, profile, refresh } = useUser();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      fetchNotifications()
        .then(setList)
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setList(profile?.notifications ?? []);
    }
  }, [open, profile]);

  if (!user) return null;

  const unread = list.filter((n) => !n.read).length;

  async function onItem(n: Notification) {
    setOpen(false);
    try {
      if (!n.read) {
        const updated = await markNotificationsRead([n.id]);
        setList(updated);
        await refresh();
      }
    } catch { /* ignore */ }
    if (!n.movieId) return;
    navigate(`/movie/${n.movieId}${n.commentId ? `#c-${n.commentId}` : ""}`);
  }

  async function onDelete(n: Notification) {
    try {
      const updated = await deleteNotification(n.id);
      setList(updated);
      await refresh();
    } catch { /* ignore */ }
  }

  async function onMarkAll() {
    try {
      const updated = await markNotificationsRead();
      setList(updated);
      await refresh();
    } catch { /* ignore */ }
  }

  return (
    <div className="bell-wrap">
      <button className="bell-btn" onClick={() => setOpen((o) => !o)} title="Уведомления" aria-label="Уведомления">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && <span className="notif-dot bell-dot">{unread > 99 ? "99+" : unread}</span>}
      </button>

      {open && (
        <>
          <div className="bell-backdrop" onClick={() => setOpen(false)} />
          <div className="bell-panel">
            <div className="bell-head">
              <strong>Уведомления</strong>
              {unread > 0 && (
                <button className="link" onClick={onMarkAll}>Прочитать все</button>
              )}
            </div>
            <div className="bell-scroll">
              {loading ? (
                <p className="bell-empty">Загрузка…</p>
              ) : list.length === 0 ? (
                <p className="bell-empty">Уведомлений пока нет</p>
              ) : (
                list.map((n) => (
                  <div key={n.id} className={`bell-item ${n.read ? "" : "unread"}`}>
                    <button className="bell-item-main" onClick={() => onItem(n)}>
                      <span className="bell-item-text">{n.text}</span>
                      <span className="bell-item-time">{new Date(n.at).toLocaleString("ru-RU")}</span>
                    </button>
                    <button className="bell-item-del" title="Удалить уведомление" aria-label="Удалить уведомление" onClick={() => onDelete(n)}>
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}