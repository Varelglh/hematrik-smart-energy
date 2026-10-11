import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement
} from "chart.js";
import axios from "axios";
import { API_BASE_URL } from "../config";
import { useHematrikData } from "../data/HematrikDataContext";
import { getStatusColor } from "../utils/statusColors";
import { formatDateId, formatDateTimeId, toLocalDateKey } from "../utils/formatDateTime";
import Toggle from "../components/ui/Toggle";
import Button from "../components/ui/Button";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement);

function Icon({ children, className, title }) {
  return (
    <span className={["hIcon", className].filter(Boolean).join(" ")}
      role={title ? "img" : undefined}
      aria-label={title}
      title={title}
    >
      {children}
    </span>
  );
}

function IconPerson({ className }) {
  return (
    <Icon className={className} title="Orang">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 12a4.2 4.2 0 1 0-4.2-4.2A4.2 4.2 0 0 0 12 12Z" stroke="currentColor" strokeWidth="2" />
        <path d="M4.5 20.2c1.7-4 5-6.2 7.5-6.2s5.8 2.2 7.5 6.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </Icon>
  );
}

function IconBulb({ className }) {
  return (
    <Icon className={className} title="Lampu">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 20h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M10 23h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path
          d="M8.2 14.5A7 7 0 1 1 15.8 14.5c-.6.5-1.3 1.6-1.5 2.5H9.7c-.2-.9-.9-2-1.5-2.5Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    </Icon>
  );
}

function IconSnow({ className }) {
  return (
    <Icon className={className} title="AC">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2v20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M4 6l16 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M20 6L4 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 7l-2-2m2 2l2-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 17l-2 2m2-2l2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </Icon>
  );
}

function IconDispenser({ className }) {
  return (
    <Icon className={className} title="Dispenser">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 2h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M9 2v4a3 3 0 0 0 6 0V2" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M7 10h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M7 10v11h10V10" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M12 13v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </Icon>
  );
}

function IconWarning({ className }) {
  return (
    <Icon className={className} title="Peringatan">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 3 1.8 20.2c-.4.7.1 1.6.9 1.6h18.6c.8 0 1.3-.9.9-1.6L12 3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M12 9v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 18h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </Icon>
  );
}

function toUpperSafe(v) {
  return String(v ?? "").toUpperCase();
}

function isOn(v) {
  return toUpperSafe(v) === "ON";
}

function formatKondisi(v) {
  const s = String(v ?? "").trim();
  return s || "-";
}

function getKondisiTone(kondisi) {
  const s = toUpperSafe(kondisi);
  if (s === "PEMBOROSAN") return "danger";
  if (s === "PERINGATAN") return "warning";
  return "ok";
}

function coerceNumber(value, fallback = 0) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function compute7DayActivityFromHistory(history) {
  const rows = Array.isArray(history) ? history : [];
  const byDay = new Map();

  for (const row of rows) {
    const key = toLocalDateKey(row?.waktu);
    if (!key) continue;
    const entry = byDay.get(key) ?? { key, sumOrang: 0, count: 0, pemborosan: 0 };
    entry.sumOrang += coerceNumber(row?.jumlah_orang, 0);
    entry.count += 1;
    if (toUpperSafe(row?.kondisi) === "PEMBOROSAN") entry.pemborosan += 1;
    byDay.set(key, entry);
  }

  const days = Array.from(byDay.values())
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-7);

  return days.map((d) => ({
    label: formatDateId(d.key),
    avgOrang: d.count ? d.sumOrang / d.count : 0,
    pemborosan: d.pemborosan,
  }));
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data, latest, loading, dashboard, devices, summary, reload } = useHematrikData();
  const [deviceSaving, setDeviceSaving] = useState(false);
  const [deviceError, setDeviceError] = useState(null);
  const [popup, setPopup] = useState({ open: false, kondisi: null, text: "" });

  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 5;

  const notifications = dashboard?.notifications ?? [];

  const deviceView = {
    status_listrik: devices?.status_listrik ?? latest?.status_listrik,
    lampu: devices?.lampu ?? latest?.lampu,
    ac: devices?.ac ?? latest?.ac,
    dispenser: devices?.dispenser ?? latest?.dispenser,
  };

  const chartSeries = useMemo(() => {
    const activity = Array.isArray(dashboard?.activity_7d) ? dashboard.activity_7d : [];
    if (activity.length > 0) {
      return activity
        .map((d) => {
          const label = formatDateId(d?.tanggal ?? d?.date ?? d?.day ?? d?.waktu);
          const avgOrang = coerceNumber(d?.avg_orang ?? d?.avgOrang ?? d?.avg_people ?? d?.avgPeople, 0);
          const pemborosan = coerceNumber(d?.pemborosan ?? d?.pemborosan_count ?? d?.count_pemborosan ?? d?.waste_count, 0);
          return { label, avgOrang, pemborosan };
        })
        .filter((x) => x.label && x.label !== "-");
    }
    return compute7DayActivityFromHistory(data);
  }, [dashboard, data]);

  const chartData = useMemo(() => {
    const labels = chartSeries.map((p) => p.label);
    return {
      labels,
      datasets: [
        {
          label: "Jumlah Orang",
          data: chartSeries.map((p) => Math.round(coerceNumber(p.avgOrang, 0) * 100) / 100),
          borderColor: "#2563eb",
          backgroundColor: "#2563eb",
          pointRadius: 3,
          tension: 0.35,
        },
        {
          label: "Kejadian Pemborosan",
          data: chartSeries.map((p) => coerceNumber(p.pemborosan, 0)),
          borderColor: "#ef4444",
          backgroundColor: "#ef4444",
          pointRadius: 3,
          tension: 0.35,
        }
      ]
    };
  }, [chartSeries]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "bottom" },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { precision: 0 },
      },
    },
  }), []);

  useEffect(() => {
    if (!latest) return;
    const kondisi = String(latest?.kondisi || "").toUpperCase();
    const notif = latest?.notifikasi || "";
    
    // Show popup for waste, warning, or automatic system actions
    const isAutoOff = notif.includes("Sistem Otomatis");
    if (kondisi !== "PEMBOROSAN" && kondisi !== "PERINGATAN" && !isAutoOff) return;

    const key = `${latest?.waktu || ""}|${kondisi}|${notif}`;
    const lastKey = window.localStorage.getItem("hematrik_last_alert_key");
    if (lastKey === key) return;

    window.localStorage.setItem("hematrik_last_alert_key", key);
    setPopup({ 
      open: true, 
      kondisi: isAutoOff ? "AMAN" : kondisi, 
      text: notif 
    });

    const t = window.setTimeout(() => {
      setPopup((p) => ({ ...p, open: false }));
    }, 8000);
    return () => window.clearTimeout(t);
  }, [latest]);

  if (loading) return <div className="loading">Memuat data...</div>;
  if (!latest) return <div className="loading">Belum ada data.</div>;

  const lastChecked = formatDateTimeId(latest?.waktu);
  const peopleCount = Number(latest?.jumlah_orang ?? 0);
  const adaOrang = Number.isFinite(peopleCount) && peopleCount > 0;

  const kondisi = formatKondisi(latest?.kondisi);
  const kondisiTone = getKondisiTone(kondisi);

  const history = Array.isArray(data) ? data : [];
  const historyTotalPages = Math.max(1, Math.ceil(history.length / historyPageSize));
  const historyPageSafe = Math.min(Math.max(1, historyPage), historyTotalPages);
  const historyStart = (historyPageSafe - 1) * historyPageSize;
  const historyItems = history.slice(historyStart, historyStart + historyPageSize);

  const setDevice = async (patch) => {
    setDeviceSaving(true);
    setDeviceError(null);
    try {
      await axios.post(`${API_BASE_URL}/devices`, patch);
      // Refresh from server so UI matches DB-persisted state.
      await reload();
    } catch (e) {
      setDeviceError("Gagal menyimpan status perangkat.");
    } finally {
      setDeviceSaving(false);
    }
  };

  return (
    <>
      {popup.open ? (
        <div
          className="banner"
          style={{
            borderLeftColor: getStatusColor(popup.kondisi),
            position: "fixed",
            top: 12,
            right: 12,
            width: "min(520px, calc(100vw - 24px))",
            zIndex: 50,
          }}
          role="alert"
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div className="banner__label">Peringatan</div>
              <div className="banner__text">{popup.text}</div>
            </div>
            <button
              type="button"
              onClick={() => setPopup((p) => ({ ...p, open: false }))}
              aria-label="Tutup"
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontSize: 18,
                lineHeight: "18px",
              }}
            >
              ×
            </button>
          </div>
        </div>
      ) : null}

      <section className="dashTop">
        <div className="card dashCard">
          <div className="card__title">Status Orang di Ruangan</div>
          <div className="dashPeople">
            <div className={adaOrang ? "dashPeople__icon dashPeople__icon--on" : "dashPeople__icon"}>
              <IconPerson />
            </div>
            <div className="dashPeople__main">
              <div className={adaOrang ? "dashPeople__state dashPeople__state--on" : "dashPeople__state"}>
                {adaOrang ? "ADA ORANG" : "TIDAK ADA ORANG"}
              </div>
              <div className="dashPeople__meta">Jumlah terdeteksi: {latest.jumlah_orang ?? 0} orang</div>
              <div className="dashPeople__meta">Terakhir diperbarui: {lastChecked}</div>
            </div>
          </div>
        </div>

        <div className="card dashCard">
          <div className="card__title">Status Perangkat (IoT)</div>
          <div className="dashDevices">
            <div className="dashDevice">
              <div
                className={[
                  "dashDevice__icon",
                  "dashDevice__icon--lampu",
                  isOn(deviceView.lampu) ? "dashDevice__icon--solid" : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <IconBulb />
              </div>
              <div className="dashDevice__name">Lampu</div>
              <div className={isOn(deviceView.lampu) ? "pill pill--on" : "pill pill--off"}>
                {toUpperSafe(deviceView.lampu) || "-"}
              </div>
              <div className="dashDevice__actions">
                <Toggle
                  label=""
                  checked={isOn(deviceView.lampu)}
                  disabled={deviceSaving}
                  onChange={(v) => setDevice({ lampu: v ? "ON" : "OFF" })}
                />
              </div>
            </div>

            <div className="dashDevice">
              <div
                className={[
                  "dashDevice__icon",
                  "dashDevice__icon--ac",
                  isOn(deviceView.ac) ? "dashDevice__icon--solid" : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <IconSnow />
              </div>
              <div className="dashDevice__name">AC</div>
              <div className={isOn(deviceView.ac) ? "pill pill--on" : "pill pill--off"}>
                {toUpperSafe(deviceView.ac) || "-"}
              </div>
              <div className="dashDevice__actions">
                <Toggle
                  label=""
                  checked={isOn(deviceView.ac)}
                  disabled={deviceSaving}
                  onChange={(v) => setDevice({ ac: v ? "ON" : "OFF" })}
                />
              </div>
            </div>

            <div className="dashDevice">
              <div
                className={[
                  "dashDevice__icon",
                  "dashDevice__icon--dispenser",
                  isOn(deviceView.dispenser) ? "dashDevice__icon--solid" : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <IconDispenser />
              </div>
              <div className="dashDevice__name">Dispenser</div>
              <div className={isOn(deviceView.dispenser) ? "pill pill--on" : "pill pill--off"}>
                {toUpperSafe(deviceView.dispenser) || "-"}
              </div>
              <div className="dashDevice__actions">
                <Toggle
                  label=""
                  checked={isOn(deviceView.dispenser)}
                  disabled={deviceSaving}
                  onChange={(v) => setDevice({ dispenser: v ? "ON" : "OFF" })}
                />
              </div>
            </div>
          </div>
          <div className="dashHint">
            Diperbarui: {lastChecked}
            {deviceError ? ` • ${deviceError}` : deviceSaving ? " • Menyimpan…" : ""}
          </div>
        </div>

        <div className="card dashCard">
          <div className="card__title">Kondisi Sistem Saat Ini</div>
          <div className="dashKondisi">
            <div className={
              kondisiTone === "danger"
                ? "dashKondisi__icon dashKondisi__icon--danger"
                : kondisiTone === "warning"
                  ? "dashKondisi__icon dashKondisi__icon--warning"
                  : "dashKondisi__icon dashKondisi__icon--ok"
            }>
              <IconWarning />
            </div>
            <div className="dashKondisi__main">
              <div className={
                kondisiTone === "danger"
                  ? "dashKondisi__state dashKondisi__state--danger"
                  : kondisiTone === "warning"
                    ? "dashKondisi__state dashKondisi__state--warning"
                    : "dashKondisi__state"
              }>
                {formatKondisi(latest.kondisi)}
              </div>
              <div className="dashKondisi__meta">{latest.notifikasi || "-"}</div>
              <div className="dashKondisi__meta">{lastChecked}</div>
            </div>
          </div>
        </div>
      </section>

      {(kondisiTone === "danger" || kondisiTone === "warning") && latest?.notifikasi ? (
        <div
          className={kondisiTone === "danger" ? "banner banner--danger" : "banner banner--warning"}
          style={{ borderLeftColor: getStatusColor(latest.kondisi) }}
          role="status"
        >
          <div className="dashAlertRow">
            <div className="dashAlertRow__left">
              <IconWarning className="dashAlertRow__icon" />
              <div>
                <div className="banner__label">Peringatan</div>
                <div className="banner__text">{latest.notifikasi}</div>
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                const el = document.getElementById("dash-history");
                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              Lihat Detail
            </Button>
          </div>
        </div>
      ) : null}

      <section className="dashMain">
        <section className="card card--chart dashChart">
          <div className="card__title">Grafik Aktivitas Ruangan (7 Hari Terakhir)</div>
          <div className="chart">
            <Line data={chartData} options={chartOptions} />
          </div>
        </section>

        <section className="card dashSummary">
          <div className="dashCardHeader">
            <div className="card__title" style={{ marginBottom: 0 }}>
              Ringkasan Bulanan
            </div>
            <div className="dashCardHeader__meta">{summary?.monthly?.bulan ? `(${summary.monthly.bulan})` : ""}</div>
          </div>

          {summary?.monthly ? (
            <div className="dashSummaryGrid">
              <div className="dashMini dashMini--danger">
                <div className="dashMini__label">Kejadian Pemborosan</div>
                <div className="dashMini__value">{summary.monthly.pemborosan ?? 0}</div>
                <div className="dashMini__suffix">kali</div>
              </div>
              <div className="dashMini dashMini--warning">
                <div className="dashMini__label">Peringatan</div>
                <div className="dashMini__value">{summary.monthly.peringatan ?? 0}</div>
                <div className="dashMini__suffix">kali</div>
              </div>
              <div className="dashMini dashMini--ok">
                <div className="dashMini__label">Kondisi Normal</div>
                <div className="dashMini__value">{summary.monthly.normal ?? 0}</div>
                <div className="dashMini__suffix">kali</div>
              </div>
              <div className="dashMini dashMini--blue">
                <div className="dashMini__label">Total Pengecekan</div>
                <div className="dashMini__value">{summary.monthly.total_pengecekan ?? 0}</div>
                <div className="dashMini__suffix">kali</div>
              </div>
            </div>
          ) : (
            <div className="card__meta">Belum ada data ringkasan.</div>
          )}
        </section>
      </section>

      <section className="dashBottom">
        <section className="card dashHistory" id="dash-history">
          <div className="card__title">Riwayat Pengecekan Terakhir</div>
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Jumlah Orang</th>
                  <th>Lampu</th>
                  <th>AC</th>
                  <th>Dispenser</th>
                  <th>Kondisi</th>
                  <th>Notifikasi</th>
                </tr>
              </thead>
              <tbody>
                {historyItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ color: "var(--muted)" }}>
                      Belum ada data riwayat.
                    </td>
                  </tr>
                ) : (
                  historyItems.map((d) => (
                    <tr key={d.id ?? `${d.waktu}-${d.jumlah_orang}`}> 
                      <td>{formatDateTimeId(d.waktu)}</td>
                      <td>{d.jumlah_orang ?? 0} orang</td>
                      <td>
                        <span className={isOn(d.lampu) ? "pill pill--on" : "pill pill--off"}>{toUpperSafe(d.lampu) || "-"}</span>
                      </td>
                      <td>
                        <span className={isOn(d.ac) ? "pill pill--on" : "pill pill--off"}>{toUpperSafe(d.ac) || "-"}</span>
                      </td>
                      <td>
                        <span className={isOn(d.dispenser) ? "pill pill--on" : "pill pill--off"}>{toUpperSafe(d.dispenser) || "-"}</span>
                      </td>
                      <td style={{ color: getStatusColor(d.kondisi) }}>{formatKondisi(d.kondisi)}</td>
                      <td>{d.notifikasi || ""}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="dashPager">
            <Button
              variant="secondary"
              disabled={historyPageSafe <= 1}
              onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <div className="dashPager__meta">
              Halaman {historyPageSafe} / {historyTotalPages}
            </div>
            <Button
              variant="secondary"
              disabled={historyPageSafe >= historyTotalPages}
              onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </section>

        <section className="dashRight">
          <section className="card">
            <div className="card__title">Notifikasi Terbaru</div>
            {notifications.length === 0 ? (
              <div className="card__meta">Belum ada notifikasi.</div>
            ) : (
              <div className="dashNotifList">
                {notifications.slice(0, 5).map((n) => {
                  const tone = getKondisiTone(n.kondisi);
                  const dotClass =
                    tone === "danger"
                      ? "dashNotifDot dashNotifDot--danger"
                      : tone === "warning"
                        ? "dashNotifDot dashNotifDot--warning"
                        : "dashNotifDot dashNotifDot--ok";
                  return (
                    <div className="dashNotif" key={n.id ?? `${n.waktu}-${n.kondisi}`}> 
                      <div className={dotClass} />
                      <div className="dashNotif__main">
                        <div className="dashNotif__title">{n.notifikasi || formatKondisi(n.kondisi)}</div>
                        <div className="dashNotif__meta">{formatDateTimeId(n.waktu)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="card" style={{ marginTop: 16 }}>
            <div className="card__title">Informasi Sistem</div>
            <div className="dashInfo">
              <div className="dashInfo__row">
                <div className="dashInfo__label">Status Sistem</div>
                <div className={latest ? "dashInfo__value dashInfo__value--ok" : "dashInfo__value"}>
                  {latest ? "Online" : "Offline"}
                </div>
              </div>
              <div className="dashInfo__row">
                <div className="dashInfo__label">Terakhir cek</div>
                <div className="dashInfo__value">{lastChecked}</div>
              </div>
              <div className="dashInfo__row">
                <div className="dashInfo__label">Jumlah perangkat</div>
                <div className="dashInfo__value">
                  {[
                    deviceView?.lampu,
                    deviceView?.ac,
                    deviceView?.dispenser
                  ].filter((v) => v !== undefined && v !== null).length || 0}
                </div>
              </div>
              <div className="dashInfo__row">
                <div className="dashInfo__label">Kondisi saat ini</div>
                <div className="dashInfo__value">{formatKondisi(latest?.kondisi)}</div>
              </div>
            </div>
          </section>
        </section>
      </section>
    </>
  );
}
