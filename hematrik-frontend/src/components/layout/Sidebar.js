import React, { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import axios from "axios";
import { API_BASE_URL } from "../../config";

const navItems = [
  {
    to: "/",
    label: "Dasbor",
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 9.5L12 4l9 5.5V19a1 1 0 0 1-1 1h-5v-4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v4H4a1 1 0 0 1-1-1V9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  },
  {
    to: "/monitoring",
    label: "Pemantauan",
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M21 5c0 1.66-4 3-9 3s-9-1.34-9-3 4-3 9-3 9 1.34 9 3z" stroke="currentColor" strokeWidth="2" />
        <path d="M12 12v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  },
  {
    to: "/history",
    label: "Riwayat",
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 8v4l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <path d="M12 3a9 9 0 0 0-9 9h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  },
  {
    to: "/profile",
    label: "Profil",
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
];

export default function Sidebar({ open, onNavigate }) {
  const iconSrc = `${process.env.PUBLIC_URL}/asset/icon-logo.png`;
  const wordmarkSrc = `${process.env.PUBLIC_URL}/asset/font-logo.png`;

  const [room, setRoom] = useState({ name: "Memuat...", description: "..." });
  const [time, setTime] = useState(new Date());
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    axios.get(`${API_BASE_URL}/rooms`)
      .then(res => setRoom(res.data))
      .catch(() => setRoom({ name: "Ruang Dosen", description: "Gedung 4 Sesi A & Dosen" }));
    return () => clearInterval(timer);
  }, []);

  const formattedTime = time.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const formattedDate = time.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/landing";
  };

  return (
    <>
      <aside className={open ? "sidebar sidebar--open" : "sidebar"}>
        {/* ... (previous sidebar content) */}
        <div className="sidebar__brand">
          <div className="sidebar__logo">
            <img className="sidebar__logoImg" src={iconSrc} alt="" />
          </div>
          <div className="sidebar__name">
            <img className="sidebar__wordmark" src={wordmarkSrc} alt="Hematrik" />
            <div className="sidebar__tagline">Pemantauan Energi Pintar</div>
          </div>
        </div>

        <nav className="nav" aria-label="Navigasi utama">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) => isActive ? "nav__link nav__item--active" : "nav__link"}
              onClick={() => onNavigate?.()}
            >
              <span className="nav__icon">{item.icon}</span>
              <span className="nav__label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__info">
          <div className="info-card">
            <div className="info-card__location">
              <div className="info-card__icon">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 21s-7-4.5-7-10a7 7 0 1 1 14 0c0 5.5-7 10-7 10z" stroke="#e91e63" strokeWidth="2" />
                  <circle cx="12" cy="11" r="3" stroke="#e91e63" strokeWidth="2" />
                </svg>
              </div>
              <div className="info-card__content">
                <div className="info-card__label">Lokasi Monitoring</div>
                <div className="info-card__name">{room.name}</div>
                <div className="info-card__desc">{room.description}</div>
              </div>
            </div>
            <div className="info-card__clock">
              <div className="info-card__time">{formattedTime}</div>
              <div className="info-card__date">{formattedDate}</div>
            </div>
          </div>

          <button className="logout-btn" onClick={() => setShowLogoutModal(true)}>
            <span className="logout-btn__icon">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
            </span>
            Keluar Sistem
          </button>
        </div>
      </aside>

      {showLogoutModal && (
        <div className="modal-overlay">
          <div className="logout-modal">
            <div className="logout-modal__icon">👋</div>
            <h2 className="logout-modal__title">Konfirmasi Keluar</h2>
            <p className="logout-modal__text">Apakah Anda yakin ingin keluar dari sistem Hematrik?</p>
            <div className="logout-modal__actions">
              <button className="btn btn--secondary" onClick={() => setShowLogoutModal(false)}>Batal</button>
              <button className="btn btn--danger" onClick={handleLogout}>Ya, Keluar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
