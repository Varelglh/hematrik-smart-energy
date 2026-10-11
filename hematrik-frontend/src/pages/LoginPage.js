import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { API_BASE_URL } from "../config";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await axios.post(`${API_BASE_URL}/login`, {
        username,
        password,
      });

      if (response.data.success) {
        localStorage.setItem("token", response.data.token);
        localStorage.setItem("user", JSON.stringify(response.data.user));
        navigate("/");
      }
    } catch (err) {
      setError(err.response?.data?.message || "Terjadi kesalahan saat login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card__header">
          <Link to="/" className="login-card__back">← Kembali</Link>
          <img src={`${process.env.PUBLIC_URL}/asset/icon-logo.png`} alt="Logo" className="login-card__logo" />
          <h1 className="login-card__title">Selamat Datang</h1>
          <p className="login-card__subtitle">Masuk ke akun Hematrik Anda</p>
        </div>

        <form className="login-form" onSubmit={handleLogin}>
          {error && <div className="login-form__error">{error}</div>}
          
          <div className="login-form__group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              placeholder="Masukkan username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="login-form__group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="Masukkan password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn--primary btn--block" disabled={loading}>
            {loading ? "Memproses..." : "Masuk Sekarang"}
          </button>
        </form>

        <div className="login-card__footer">
          <p>Hanya akun admin yang dapat mengakses sistem ini.</p>
        </div>
      </div>
      <div className="login-bg">
        <div className="login-bg__circle login-bg__circle--1"></div>
        <div className="login-bg__circle login-bg__circle--2"></div>
      </div>
    </div>
  );
}
