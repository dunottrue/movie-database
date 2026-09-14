import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  deleteAccount as deleteAccountApi,
  fetchProfile,
  loginUser,
  logoutUser,
  requestRegister,
  setAuthToken,
  verifyRegister,
  type User,
  type UserProfile,
} from "./api";
import { useAdmin } from "./admin";

const TOKEN_KEY = "movie_user_token";

interface UserContextValue {
  user: User | null;
  token: string | null;
  profile: UserProfile | null;
  booting: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, phone: string, code: string, password: string) => Promise<void>;
  requestCode: (email: string, name: string, phone: string) => Promise<string>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refresh: () => Promise<UserProfile | null>;
  openAuth: () => Promise<boolean>;
  finishAdminAuth: () => void;
  cancelAuth: () => void;
}

const UserCtx = createContext<UserContextValue | null>(null);

export function useUser(): UserContextValue {
  const ctx = useContext(UserCtx);
  if (!ctx) throw new Error("useUser вне UserProvider");
  return ctx;
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [booting, setBooting] = useState(() => !!localStorage.getItem(TOKEN_KEY));
  const [open, setOpen] = useState(false);
  const resolvers = useRef<((ok: boolean) => void)[]>([]);

  const applySession = useCallback((t: string, u: User) => {
    localStorage.setItem(TOKEN_KEY, t);
    setAuthToken(t);
    setToken(t);
    setUser(u);
  }, []);

  const resolve = useCallback((ok: boolean) => {
    resolvers.current.forEach((r) => r(ok));
    resolvers.current = [];
    setOpen(false);
  }, []);

  const refresh = useCallback(async (): Promise<UserProfile | null> => {
    if (!token) return null;
    try {
      const p = await fetchProfile();
      setProfile(p);
      setUser(p.user);
      return p;
    } catch {
      logoutUser().catch(() => {});
      localStorage.removeItem(TOKEN_KEY);
      setAuthToken(null);
      setToken(null);
      setUser(null);
      setProfile(null);
      return null;
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setBooting(false);
      return;
    }
    setAuthToken(token);
    refresh().then(() => setBooting(false));
  }, [token, refresh]);

  const login = useCallback(
    async (em: string, pw: string) => {
      const s = await loginUser(em, pw);
      applySession(s.token, s.user);
      setProfile(await fetchProfile());
      resolve(true);
    },
    [applySession, resolve]
  );

  const requestCode = useCallback(async (em: string, nm: string, ph: string) => {
    const r = await requestRegister(em, nm, ph);
    void nm; void ph;
    return r.code;
  }, []);

  const register = useCallback(
    async (em: string, nm: string, ph: string, c: string, pw: string) => {
      const s = await verifyRegister(em, c, pw);
      void nm; void ph;
      applySession(s.token, s.user);
      setProfile(await fetchProfile());
      resolve(true);
    },
    [applySession, resolve]
  );

  const logout = useCallback(async () => {
    await logoutUser();
    localStorage.removeItem(TOKEN_KEY);
    setAuthToken(null);
    setToken(null);
    setUser(null);
    setProfile(null);
  }, []);

  const deleteAccount = useCallback(async () => {
    await deleteAccountApi();
    localStorage.removeItem(TOKEN_KEY);
    setAuthToken(null);
    setToken(null);
    setUser(null);
    setProfile(null);
  }, []);

  const openAuth = useCallback((): Promise<boolean> => {
    return new Promise((res) => {
      if (localStorage.getItem(TOKEN_KEY) && user) {
        res(true);
        return;
      }
      resolvers.current.push(res);
      setOpen(true);
    });
  }, [user]);

  const finishAdminAuth = useCallback(() => resolve(true), [resolve]);
  const cancelAuth = useCallback(() => resolve(false), [resolve]);

  return (
    <UserCtx.Provider
      value={{ user, token, profile, booting, login, register, requestCode, logout, deleteAccount, refresh, openAuth, finishAdminAuth, cancelAuth }}
    >
      {children}
      <AuthModal open={open} />
    </UserCtx.Provider>
  );
}

type AuthMode = "login" | "register" | "verify";

function AuthModal({ open }: { open: boolean }) {
  const { login, register, requestCode, finishAdminAuth, cancelAuth } = useUser();
  const { loginWithPassword } = useAdmin();

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");

  useEffect(() => {
    if (open) {
      setMode("login");
      setError("");
      setBusy(false);
    }
  }, [open]);

  if (!open) return null;

  function switchMode(m: AuthMode) {
    setMode(m);
    setError("");
  }

  async function submitLogin(e: FormEvent) {
    e.preventDefault();
    if (busy || !email || !password) return;
    setBusy(true);
    setError("");
    try {
      const loginVal = email.trim();
      if (loginVal.toLowerCase() === "admin") {
        await loginWithPassword(password);
        finishAdminAuth();
      } else {
        await login(loginVal, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось войти");
    } finally {
      setBusy(false);
    }
  }

  async function submitRegister(e: FormEvent) {
    e.preventDefault();
    if (busy || !email) return;
    setBusy(true);
    setError("");
    try {
      const c = await requestCode(email, name, phone);
      setPendingEmail(email.trim().toLowerCase());
      setCode(c);
      setMode("verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить код");
    } finally {
      setBusy(false);
    }
  }

  async function submitVerify(e: FormEvent) {
    e.preventDefault();
    if (busy || !pendingEmail || !code || !password) return;
    setBusy(true);
    setError("");
    try {
      await register(pendingEmail, name, phone, code, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось завершить регистрацию");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal" onMouseDown={cancelAuth}>
      <form
        className="modal-box auth-box"
        onSubmit={mode === "login" ? submitLogin : mode === "register" ? submitRegister : submitVerify}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {mode === "login" && (
          <>
            <h2>Вход</h2>
            <div className="auth-tabs">
              <button type="button" className="chip-btn active" onClick={() => switchMode("login")}>Вход</button>
              <button type="button" className="chip-btn" onClick={() => switchMode("register")}>Регистрация</button>
            </div>
            <label className="field">
              Логин (почта или Admin)
              <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus placeholder="you@example.ru или Admin" autoComplete="username" />
            </label>
            <label className="field">
              Пароль
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
            </label>
            {error && <p className="error">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={cancelAuth}>Отмена</button>
              <button type="submit" className="btn primary" disabled={!email || !password || busy}>
                {busy ? "Вход…" : "Войти"}
              </button>
            </div>
          </>
        )}

        {mode === "register" && (
          <>
            <h2>Регистрация</h2>
            <div className="auth-tabs">
              <button type="button" className="chip-btn" onClick={() => switchMode("login")}>Вход</button>
              <button type="button" className="chip-btn active" onClick={() => switchMode("register")}>Регистрация</button>
            </div>
            <label className="field">
              Имя / ник *
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Как вас зовут" />
            </label>
            <label className="field">
              Телефон (необязательно)
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 900 000-00-00" />
            </label>
            <label className="field">
              Почта для кода *
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.ru" />
            </label>
            {error && <p className="error">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={cancelAuth}>Отмена</button>
              <button type="submit" className="btn primary" disabled={!name || !email || busy}>
                {busy ? "Отправка…" : "Получить код"}
              </button>
            </div>
          </>
        )}

        {mode === "verify" && (
          <>
            <h2>Подтверждение</h2>
            <p className="verify-note">
              Код отправлен на {pendingEmail}. Имитация почты: ниже ваш код.
            </p>
            <label className="field">
              Код подтверждения (имитация): <b className="code-echo">{code}</b>
            </label>
            <label className="field">
              Придумайте пароль
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="не короче 4 символов" autoComplete="new-password" />
            </label>
            {error && <p className="error">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => switchMode("register")}>Назад</button>
              <button type="submit" className="btn primary" disabled={!password || password.length < 4 || busy}>
                {busy ? "Создание…" : "Создать аккаунт"}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}