import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useHematrikData } from "../../data/HematrikDataContext";

function getTitleFromPathname(pathname) {
  if (pathname === "/") return "Dasbor Hematrik";
  if (pathname.startsWith("/monitoring")) return "Pemantauan Deteksi";
  if (pathname.startsWith("/history")) return "Riwayat";
  if (pathname.startsWith("/profile")) return "Profil";
  return "Tidak Ditemukan";
}

export default function Topbar({ onToggleSidebar }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { latest, dashboard } = useHematrikData();
  const [showNotif, setShowNotif] = React.useState(false);
  const title = getTitleFromPathname(location.pathname);

  const notifications = dashboard?.notifications || [];

  // Format last check time
  const lastCheckTime = latest?.waktu 
    ? new Date(latest.waktu).toLocaleString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      })
    : "-";

  return (
    <header className="topbar">
      <div className="topbar__left">
        <button
          className="iconBtn"
          type="button"
          aria-label="Buka/tutup menu"
          onClick={onToggleSidebar}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
        <div className="topbar__title">{title}</div>
      </div>

      <div className="topbar__actions">
        <div className="topbar__status">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span>Terakhir cek: {lastCheckTime}</span>
        </div>

        <button 
          className="topbar__btn" 
          onClick={() => navigate("/monitoring?auto=true")}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
          CEK SEKARANG
        </button>

        <div className="topbar__notif-wrapper">
          <button 
            className={`topbar__notif ${showNotif ? 'topbar__notif--active' : ''}`}
            onClick={() => setShowNotif(!showNotif)}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            {notifications.length > 0 && <span className="topbar__notifBadge" />}
          </button>

          {showNotif && (
            <div className="notif-dropdown">
              <div className="notif-dropdown__header">
                <h3>Notifikasi Terbaru</h3>
                <span className="notif-dropdown__count">{notifications.length} Pesan</span>
              </div>
              <div className="notif-dropdown__list">
                {notifications.length > 0 ? (
                  notifications.map((n, i) => (
                    <div key={i} className="notif-item">
                      <div className={`notif-item__icon notif-item__icon--${n.kondisi?.toLowerCase()}`}>
                        {n.kondisi === 'PEMBOROSAN' ? '⚠️' : '✅'}
                      </div>
                      <div className="notif-item__content">
                        <div className="notif-item__text">{n.notifikasi}</div>
                        <div className="notif-item__time">
                          {n.waktu ? new Date(n.waktu).toLocaleString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit"
                          }) : "-"}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="notif-dropdown__empty">Tidak ada notifikasi baru</div>
                )}
              </div>
              <div className="notif-dropdown__footer">
                <button onClick={() => { navigate("/history"); setShowNotif(false); }}>Lihat Semua Riwayat</button>
              </div>
            </div>
          )}
        </div>

        <div className="topbar__user">
          <div className="topbar__userIcon">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </div>
          <div className="topbar__userInfo">
            <div className="topbar__userName">Admin</div>
            <div className="topbar__userRole">Administrator</div>
          </div>
          <svg className="topbar__userChevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
      </div>
    </header>
  );
}
