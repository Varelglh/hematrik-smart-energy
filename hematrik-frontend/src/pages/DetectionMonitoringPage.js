import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config";
import { useHematrikData } from "../data/HematrikDataContext";
import Button from "../components/ui/Button";
import Toggle from "../components/ui/Toggle";

export default function DetectionMonitoringPage() {
  const { latest, loading } = useHematrikData();
  const peopleDetected = latest?.jumlah_orang ?? "-";

  const [detectionEnabled, setDetectionEnabled] = useState(true);
  const [detectionLoading, setDetectionLoading] = useState(true);
  const [detectionSaving, setDetectionSaving] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [active, setActive] = useState(false);
  const [streamError, setStreamError] = useState(false);
  const [streamKey, setStreamKey] = useState(0);
  const [streamImageUrl, setStreamImageUrl] = useState(null);

  const streamAbortRef = useRef(null);
  const stopRequestedRef = useRef(false);
  const alertedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const loadDetectionEnabled = async () => {
      try {
        setActionError(null);
        const res = await axios.get(`${API_BASE_URL}/detection/enabled`);
        const enabled = Boolean(res?.data?.enabled);
        if (!cancelled) {
          setDetectionEnabled(enabled);
          
          // Check for auto parameter
          const params = new URLSearchParams(window.location.search);
          if (enabled && params.get("auto") === "true") {
            setActive(true);
            setStreamKey(k => k + 1);
            axios.get(`${API_BASE_URL}/listrik/on`).catch(() => {});
          }

          if (!enabled) {
            setActive(false);
            setStreamError(false);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setActionError("Gagal mengambil status deteksi dari server.");
        }
      } finally {
        if (!cancelled) setDetectionLoading(false);
      }
    };

    loadDetectionEnabled();
    return () => {
      cancelled = true;
    };
  }, []);

  const streamSrc = useMemo(() => {
    if (!detectionEnabled || !active || streamError) return null;
    return `${API_BASE_URL}/stream?key=${streamKey}`;
  }, [active, detectionEnabled, streamError, streamKey]);

  useEffect(() => {
    // Cleanup helper
    const stopLocalStream = () => {
      try {
        if (streamAbortRef.current) {
          streamAbortRef.current.abort();
        }
      } catch (_) {}
      streamAbortRef.current = null;
      setStreamImageUrl((prev) => {
        try {
          if (prev) URL.revokeObjectURL(prev);
        } catch (_) {}
        return null;
      });
    };

    if (!streamSrc) {
      stopLocalStream();
      return;
    }

    // Start streaming via fetch so we can detect stream end.
    const controller = new AbortController();
    streamAbortRef.current = controller;
    stopRequestedRef.current = false;
    alertedRef.current = false;

    let cancelled = false;

    const concatU8 = (a, b) => {
      const out = new Uint8Array(a.length + b.length);
      out.set(a, 0);
      out.set(b, a.length);
      return out;
    };

    const findMarker = (buf, startIndex, m1, m2) => {
      for (let i = Math.max(0, startIndex); i < buf.length - 1; i += 1) {
        if (buf[i] === m1 && buf[i + 1] === m2) return i;
      }
      return -1;
    };

    const run = async () => {
      try {
        setStreamError(false);

        const res = await fetch(streamSrc, { signal: controller.signal, cache: "no-store" });
        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        let buffer = new Uint8Array(0);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (cancelled) break;
          if (!value) continue;

          buffer = concatU8(buffer, value);

          // Extract JPEG frames based on SOI/EOI markers.
          while (true) {
            const start = findMarker(buffer, 0, 0xff, 0xd8);
            if (start < 0) break;
            const end = findMarker(buffer, start + 2, 0xff, 0xd9);
            if (end < 0) break;

            const jpeg = buffer.slice(start, end + 2);
            buffer = buffer.slice(end + 2);

            const blob = new Blob([jpeg], { type: "image/jpeg" });
            const url = URL.createObjectURL(blob);
            setStreamImageUrl((prev) => {
              try {
                if (prev) URL.revokeObjectURL(prev);
              } catch (_) {}
              return url;
            });
          }
        }

        // If stream ended naturally while still active, treat as auto-stop.
        if (!cancelled && active && !stopRequestedRef.current && !alertedRef.current) {
          alertedRef.current = true;
          window.alert("Tidak ada orang terdeteksi. Kamera dimatikan otomatis.");
          setActive(false);
        }
      } catch (err) {
        // Abort is expected when user presses Stop or component unmounts.
        const msg = String(err?.message || err);
        const aborted = msg.toLowerCase().includes("abort");
        if (!aborted) {
          setStreamError(true);
          if (active && !stopRequestedRef.current && !alertedRef.current) {
            alertedRef.current = true;
            window.alert("Tidak ada orang terdeteksi. Kamera dimatikan otomatis.");
            setActive(false);
          }
        }
      } finally {
        stopLocalStream();
      }
    };

    run();

    return () => {
      cancelled = true;
      stopLocalStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamSrc]);

  const setDetectionOnServer = async (nextEnabled) => {
    setDetectionSaving(true);
    setActionError(null);

    // Optimistic UI: matikan stream dulu kalau user OFF.
    if (!nextEnabled) {
      setActive(false);
      setStreamError(false);
    }
    setDetectionEnabled(nextEnabled);

    try {
      await axios.post(`${API_BASE_URL}/detection/enabled`, { enabled: nextEnabled });
    } catch (err) {
      // Revert state kalau gagal.
      setDetectionEnabled((prev) => !prev);
      setActionError("Gagal mengubah status deteksi.");
    } finally {
      setDetectionSaving(false);
    }
  };

  const listrikOn = async () => {
    setActionError(null);
    await axios.get(`${API_BASE_URL}/listrik/on`);
  };

  const listrikOff = async () => {
    setActionError(null);
    await axios.get(`${API_BASE_URL}/listrik/off`);
  };

  return (
    <div className="dm">
      <section className="dm__media">
        {streamSrc && streamImageUrl ? (
          <img
            src={streamImageUrl}
            alt="CCTV"
            className="dm__image"
          />
        ) : (
          <div className="dm__placeholder">
            <div className="dm__placeholderTitle">Pratinjau Video</div>
            <div className="dm__placeholderMeta">
              {streamError ? "Stream tidak tersedia." : "Klik Mulai untuk memulai."}
            </div>
          </div>
        )}
      </section>

      <section className="dm__grid">
        <div className="card dmCard">
          <div className="card__title">Orang Terdeteksi</div>
          <div className="card__value">{loading ? "…" : peopleDetected}</div>
        </div>

        <div className="card dmCard dmCard--status">
          <div className="dmStatus">
            <div className="dmStatus__labels">
              <div className="dmStatus__row">
                <span className={detectionEnabled ? "dmDot dmDot--on" : "dmDot"} />
                Deteksi
              </div>
              <div className="dmStatus__row">
                <span className={active ? "dmDot dmDot--on" : "dmDot"} />
                Aktif
              </div>
            </div>
            <Toggle
              label=""
              checked={detectionEnabled}
              disabled={detectionLoading || detectionSaving}
              onChange={(v) => setDetectionOnServer(v)}
            />
          </div>
          <div className="dmStatus__hint">
            {detectionLoading
              ? "Mengambil status…"
              : detectionSaving
                ? "Menyimpan…"
                : detectionEnabled
                  ? "Deteksi siap dijalankan"
                  : "Deteksi dimatikan"}
            {actionError ? ` • ${actionError}` : ""}
          </div>
        </div>

        <div className="card dmCard dmCard--controls">
          <div className="dmControls">
            <Button
              variant="primary"
              disabled={!detectionEnabled}
              onClick={async () => {
                try {
                  setStreamError(false);
                  await listrikOn();
                  setStreamKey((k) => k + 1);
                  setActive(true);
                } catch (err) {
                  setActionError("Gagal menyalakan listrik.");
                }
              }}
            >
              Mulai
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  stopRequestedRef.current = true;
                  await listrikOff();
                } catch (err) {
                  setActionError("Gagal mematikan listrik.");
                } finally {
                  setActive(false);
                  setStreamError(false);
                }
              }}
            >
              Berhenti
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
