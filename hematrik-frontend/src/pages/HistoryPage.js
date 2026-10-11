import React from "react";
import { useOutletContext } from "react-router-dom";
import { useHematrikData } from "../data/HematrikDataContext";
import { getStatusColor } from "../utils/statusColors";
import { formatDateTimeId } from "../utils/formatDateTime";

export default function HistoryPage() {
  const { search } = useOutletContext();
  const { data, loading } = useHematrikData();

  if (loading) return <div className="loading">Memuat data...</div>;

  const filtered = data.filter((d) => {
    if (!search?.trim()) return true;
    const q = search.toLowerCase();
    return (
      String(d.waktu ?? "").toLowerCase().includes(q) ||
      String(formatDateTimeId(d.waktu) ?? "").toLowerCase().includes(q) ||
      String(d.jumlah_orang ?? "").toLowerCase().includes(q) ||
      String(d.status_listrik ?? "").toLowerCase().includes(q) ||
      String(d.kondisi ?? "").toLowerCase().includes(q) ||
      String(d.lampu ?? "").toLowerCase().includes(q) ||
      String(d.ac ?? "").toLowerCase().includes(q) ||
      String(d.dispenser ?? "").toLowerCase().includes(q) ||
      String(d.notifikasi ?? "").toLowerCase().includes(q)
    );
  });

  const pillClass = (v) => {
    const s = String(v || "").toUpperCase();
    if (s === "ON") return "pill pill--on";
    if (s === "OFF") return "pill pill--off";
    return "pill pill--muted";
  };

  return (
    <section className="card">
      <div className="card__title">Riwayat Data</div>
      <div className="tableWrap">
        <table className="table">
          <thead>
            <tr>
              <th>Waktu</th>
              <th>Orang</th>
              <th>Listrik</th>
              <th>Lampu</th>
              <th>AC</th>
              <th>Dispenser</th>
              <th>Kondisi</th>
              <th>Notifikasi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <tr key={d.id ?? `${d.waktu}-${d.jumlah_orang}`}
              >
                <td>{formatDateTimeId(d.waktu)}</td>
                <td>{d.jumlah_orang}</td>
                <td>
                  <span className={pillClass(d.status_listrik)}>{d.status_listrik}</span>
                </td>
                <td>
                  <span className={pillClass(d.lampu)}>{d.lampu || "-"}</span>
                </td>
                <td>
                  <span className={pillClass(d.ac)}>{d.ac || "-"}</span>
                </td>
                <td>
                  <span className={pillClass(d.dispenser)}>{d.dispenser || "-"}</span>
                </td>
                <td style={{ color: getStatusColor(d.kondisi) }}>{d.kondisi}</td>
                <td>{d.notifikasi || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
