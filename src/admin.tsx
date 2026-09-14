import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { verifyAdmin } from "./api";

interface AdminContextValue {
  token: string | null;
  requireAuth: () => Promise<string>;
  loginWithPassword: (password: string) => Promise<void>;
  logout: () => void;
}

const AdminCtx = createContext<AdminContextValue | null>(null);
const STORAGE_KEY = "movie_admin_token";

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminCtx);
  if (!ctx) throw new Error("useAdmin вне AdminProvider");
  return ctx;
}

export function AdminProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(STORAGE_KEY));
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const resolvers = useRef<((t: string) => void)[]>([]);

  const requireAuth = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      const cached = sessionStorage.getItem(STORAGE_KEY);
      if (cached) {
        setToken(cached);
        resolve(cached);
        return;
      }
      resolvers.current.push(resolve);
      setPassword("");
      setError("");
      setOpen(true);
    });
  }, []);

  const resolveWith = useCallback((t: string) => {
    sessionStorage.setItem(STORAGE_KEY, t);
    setToken(t);
    resolvers.current.forEach((r) => r(t));
    resolvers.current = [];
    setOpen(false);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setToken(null);
  }, []);

  const loginWithPassword = useCallback(async (password: string) => {
    await verifyAdmin(password);
    sessionStorage.setItem(STORAGE_KEY, password);
    setToken(password);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      await verifyAdmin(password);
      resolveWith(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неверный пароль");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminCtx.Provider value={{ token, requireAuth, loginWithPassword, logout }}>
      {children}

      {open && (
        <div className="modal" onMouseDown={() => setOpen(false)}>
          <form
            className="modal-box auth-box"
            onSubmit={onSubmit}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2>Вход для администратора</h2>
            <label className="field">
              Пароль
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                placeholder="Введите пароль"
              />
            </label>
            {error && <p className="error">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
                Отмена
              </button>
              <button type="submit" className="btn primary" disabled={!password || busy}>
                {busy ? "Проверка…" : "Войти"}
              </button>
            </div>
          </form>
        </div>
      )}
    </AdminCtx.Provider>
  );
}