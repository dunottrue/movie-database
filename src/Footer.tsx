import { Link } from "react-router-dom";

const CURRENT_YEAR = new Date().getFullYear();

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-cols">
          <div className="footer-col">
            <div className="footer-brand">
              <span className="logo" aria-hidden="true"></span>
              <span className="footer-title">Кинотека</span>
            </div>
            <p className="footer-about">
              Домашняя медиатека: смотрите свои фильмы, делитесь
              впечатлениями и находите похожие по сюжету картины.
            </p>
          </div>

          <div className="footer-col">
            <h4 className="footer-heading">Каталог</h4>
            <ul className="footer-links">
              <li><Link to="/">Главная</Link></li>
              <li><Link to="/cabinet">Личный кабинет</Link></li>
              <li><Link to="/admin">АвтоБД (Кинопоиск)</Link></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4 className="footer-heading">Возможности</h4>
            <ul className="footer-links">
              <li><Link to="/">Поиск и фильтры по жанрам</Link></li>
              <li><Link to="/">Сортировка по рейтингам</Link></li>
              <li><Link to="/">Плейлисты и «Просмотрено»</Link></li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© {CURRENT_YEAR} Кинотека</span>
          <span>Домашняя медиатека · сделано с любовью к кино</span>
        </div>
      </div>
    </footer>
  );
}