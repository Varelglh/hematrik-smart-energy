import React from "react";
import { Link } from "react-router-dom";

export default function LandingPage() {
  return (
    <div className="landing">
      <header className="landing__header">
        <div className="landing__container">
          <div className="landing__brand">
            <img src={`${process.env.PUBLIC_URL}/asset/icon-logo.png`} alt="Logo" className="landing__logo" />
            <span className="landing__brandName">Hematrik</span>
          </div>
          <nav className="landing__nav">
            <Link to="/login" className="btn btn--outline">Masuk</Link>
          </nav>
        </div>
      </header>

      <main className="landing__hero">
        <div className="landing__container">
          <div className="hero__content">
            <h1 className="hero__title">
              Solusi Cerdas <span className="text--gradient">Efisiensi Energi</span>
            </h1>
            <p className="hero__subtitle">
              Pantau penggunaan listrik Anda secara real-time dengan teknologi AI tercanggih. 
              Hemat biaya, selamatkan bumi, mulai dari langkah kecil hari ini.
            </p>
            <div className="hero__actions">
              <Link to="/login" className="btn btn--primary btn--lg">Mulai Sekarang</Link>
              <a href="#features" className="btn btn--text">Pelajari Lebih Lanjut ↓</a>
            </div>
          </div>
          <div className="hero__image">
            <div className="hero__blob"></div>
            <img src={`${process.env.PUBLIC_URL}/asset/icon-logo.png`} alt="Hematrik Dashboard Preview" className="hero__preview" />
          </div>
        </div>
      </main>

      <section id="features" className="landing__features">
        <div className="landing__container">
          <div className="section-header">
            <h2 className="section-title">Fitur Unggulan</h2>
            <p className="section-subtitle">Teknologi modern untuk kenyamanan Anda</p>
          </div>
          <div className="features__grid">
            <div className="feature-card">
              <div className="feature-card__icon">🤖</div>
              <h3 className="feature-card__title">Deteksi AI</h3>
              <p>Mendeteksi keberadaan orang secara otomatis untuk mengoptimalkan penggunaan listrik.</p>
            </div>
            <div className="feature-card">
              <div className="feature-card__icon">📊</div>
              <h3 className="feature-card__title">Analitik Real-time</h3>
              <p>Pantau statistik penggunaan energi Anda kapan saja dan di mana saja.</p>
            </div>
            <div className="feature-card">
              <div className="feature-card__icon">⚡</div>
              <h3 className="feature-card__title">Kendali Otomatis</h3>
              <p>Mematikan perangkat secara otomatis saat ruangan kosong untuk menghemat biaya.</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="landing__footer">
        <div className="landing__container">
          <p>© 2026 Hematrik. Seluruh hak cipta dilindungi.</p>
        </div>
      </footer>
    </div>
  );
}
