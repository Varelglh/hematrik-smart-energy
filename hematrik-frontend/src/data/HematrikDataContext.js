import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config";

const HematrikDataContext = createContext(null);

export function HematrikDataProvider({ children, pollMs = 3000, enabled = true }) {
  const [data, setData] = useState([]);
  const [status, setStatus] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [devices, setDevices] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const mountedRef = useRef(true);

  const loadHistory = async () => {
    try {
      setError(null);
      // New endpoint
      let res;
      try {
        res = await axios.get(`${API_BASE_URL}/history?limit=200`);
      } catch (e) {
        // Backward-compatible fallback
        res = await axios.get(`${API_BASE_URL}/data?limit=200`);
      }
      if (!mountedRef.current) return;
      setData(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err);
    }
  };

  const loadStatus = async () => {
    try {
      // /status masih ada dan dipakai untuk fallback.
      const res = await axios.get(`${API_BASE_URL}/status`);
      if (!mountedRef.current) return;
      setStatus(res?.data ?? null);
    } catch (err) {
      // status realtime opsional; biarkan history tetap jalan.
    }
  };

  const loadDashboard = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/dashboard`);
      if (!mountedRef.current) return;
      setDashboard(res?.data ?? null);
    } catch (err) {
      // opsional
    }
  };

  const loadDevices = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/devices`);
      if (!mountedRef.current) return;
      setDevices(res?.data ?? null);
    } catch (err) {
      // opsional
    }
  };

  const loadSummary = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/summary?hours=24`);
      if (!mountedRef.current) return;
      setSummary(res?.data ?? null);
    } catch (err) {
      // opsional
    }
  };

  useEffect(() => {
    mountedRef.current = true;

    let lastSummaryAt = 0;

    if (!enabled) {
      setLoading(false);
      return () => {
        mountedRef.current = false;
      };
    }

    const run = async () => {
      try {
        const now = Date.now();
        const shouldRefreshSummary = !lastSummaryAt || now - lastSummaryAt > 30_000;
        const tasks = [loadHistory(), loadStatus(), loadDashboard(), loadDevices()];
        if (shouldRefreshSummary) {
          lastSummaryAt = now;
          tasks.push(loadSummary());
        }
        await Promise.all(tasks);
      } finally {
        if (!mountedRef.current) return;
        setLoading(false);
      }
    };

    run();

    const interval = setInterval(run, pollMs);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollMs, enabled]);

  const latest = dashboard?.latest ?? status ?? (data.length > 0 ? data[0] : null);

  const value = useMemo(
    () => ({
      data,
      latest,
      status,
      dashboard,
      devices,
      summary,
      loading,
      error,
      reload: async () => {
        await Promise.all([loadHistory(), loadStatus(), loadDashboard(), loadDevices(), loadSummary()]);
      }
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, latest, status, dashboard, devices, summary, loading, error]
  );

  return <HematrikDataContext.Provider value={value}>{children}</HematrikDataContext.Provider>;
}

export function useHematrikData() {
  const ctx = useContext(HematrikDataContext);
  if (!ctx) {
    throw new Error("useHematrikData harus digunakan di dalam HematrikDataProvider");
  }
  return ctx;
}
