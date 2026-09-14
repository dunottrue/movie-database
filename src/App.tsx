import { useState } from "react";
import { BrowserRouter, Route, Routes, Link } from "react-router-dom";
import { AdminProvider, useAdmin } from "./admin";
import { UserProvider, useUser } from "./user";
import AddMovieModal from "./components/AddMovieModal";
import Home from "./pages/Home";
import MoviePage from "./pages/MoviePage";
import Cabinet from "./pages/Cabinet";
import AutoDb from "./pages/AutoDb";
import Footer from "./Footer";
import NotificationsBell from "./NotificationsBell";

function userInitials(name: string): string {
  const parts = String(name || "?").trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function UserHeaderItem() {
  const { user, openAuth } = useUser();

  if (!user) {
    return <button className="btn" onClick={() => openAuth()}>Войти</button>;
  }
  return (
    <div className="user-header">
      <Link to="/cabinet" className="user-chip" title="Личный кабинет">
        <span className="avatar">
          {user.avatar ? <img src={user.avatar} alt="" /> : userInitials(user.name)}
        </span>
        <span className="user-chip-name">{user.name}</span>
      </Link>
      <NotificationsBell />
    </div>
  );
}

function Header() {
  const { token, logout } = useAdmin();
  const [showAdd, setShowAdd] = useState(false);

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <Link to="/" className="brand">
            <span className="logo" aria-hidden="true"></span>
            <h1>Кинотека</h1>
          </Link>

          <div className="header-actions">
            <UserHeaderItem />
            {token ? (
              <>
                <span className="admin-chip">✓ Админ</span>
                <Link to="/admin" className="btn">АвтоБД</Link>
                <button className="btn" onClick={logout}>Выход админа</button>
                <button className="btn admin" onClick={() => setShowAdd(true)}>
                  + Добавить фильм
                </button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      {showAdd && (
        <AddMovieModal
          onClose={() => setShowAdd(false)}
          onAdded={() => setShowAdd(false)}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <AdminProvider>
      <UserProvider>
        <BrowserRouter>
          <div className="app">
            <Header />
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/genre/:genre" element={<Home />} />
              <Route path="/movie/:id" element={<MoviePage />} />
              <Route path="/cabinet" element={<Cabinet />} />
              <Route path="/admin" element={<AutoDb />} />
              <Route path="*" element={<Home />} />
            </Routes>
            <Footer />
          </div>
        </BrowserRouter>
      </UserProvider>
    </AdminProvider>
  );
}