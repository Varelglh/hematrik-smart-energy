import os
import threading
import time

import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from ultralytics import YOLO

# ==============================
# YOLO ML SERVICE ONLY
# - Tidak ada DB, tidak ada logika monitoring/energi.
# - Backend aplikasi dipindahkan ke folder Node (hematrik-backend).
# ==============================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

MODEL_PATH      = os.getenv("YOLO_MODEL_PATH", os.path.join(BASE_DIR, "best.pt"))
CONFIDENCE      = float(os.getenv("YOLO_CONFIDENCE", "0.5"))
IOU             = float(os.getenv("YOLO_IOU", "0.4"))
MIN_WIDTH       = int(os.getenv("YOLO_MIN_WIDTH", "50"))
MIN_HEIGHT      = int(os.getenv("YOLO_MIN_HEIGHT", "70"))
ENHANCE_FRAME   = os.getenv("YOLO_ENHANCE", "1").strip().lower() not in {"0", "false", "no"}

# Target class filter
# - YOLO_CLASSES: comma-separated indices, e.g. "0" or "0,1"
# - YOLO_CLASS_NAMES: comma-separated names, e.g. "person" or "orang"
# If both empty: defaults to "person" if present in model.names, otherwise no filter.
YOLO_CLASSES_RAW    = (os.getenv("YOLO_CLASSES") or "").strip()
YOLO_CLASS_NAMES_RAW = (os.getenv("YOLO_CLASS_NAMES") or "").strip()

# Interval (dalam frame) untuk reset tracker agar cegah memory creep
TRACK_RESET_INTERVAL = int(os.getenv("TRACK_RESET_INTERVAL", "3000"))

if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError(
        f"Model file tidak ditemukan: {MODEL_PATH}. "
        "Pastikan file best.pt tersedia atau set YOLO_MODEL_PATH."
    )

model = YOLO(MODEL_PATH)


# ──────────────────────────────────────────────
# Helpers parsing
# ──────────────────────────────────────────────

def _parse_csv(raw: str) -> list[str]:
    raw = (raw or "").strip()
    if not raw:
        return []
    return [x.strip() for x in raw.split(",") if x.strip()]


def _infer_target_class_ids() -> list[int] | None:
    names = getattr(model, "names", None) or {}
    name_to_id = {str(v).strip().lower(): int(k) for k, v in names.items()}

    ids: list[int] = []
    for tok in _parse_csv(YOLO_CLASSES_RAW):
        try:
            ids.append(int(tok))
        except Exception:
            pass

    for tok in _parse_csv(YOLO_CLASS_NAMES_RAW):
        key = tok.strip().lower()
        if key in name_to_id:
            ids.append(name_to_id[key])

    if not ids:
        if "person" in name_to_id:
            ids = [name_to_id["person"]]
        else:
            try:
                numeric_keys = [int(k) for k in names.keys()]
                if len(numeric_keys) == 1:
                    ids = [numeric_keys[0]]
                else:
                    return None
            except Exception:
                return None

    ids = sorted({int(x) for x in ids})
    return ids


TARGET_CLASS_IDS = _infer_target_class_ids()


def _parse_int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)).strip())
    except Exception:
        return default


def _parse_float_env(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)).strip())
    except Exception:
        return default


# ──────────────────────────────────────────────
# Kamera helpers
# ──────────────────────────────────────────────

def _camera_backends(preferred: str):
    preferred = (preferred or "").strip().lower()
    mapping = {
        "dshow": cv2.CAP_DSHOW,
        "msmf":  cv2.CAP_MSMF,
        "any":   0,
        "":      0,
    }
    pref = mapping.get(preferred, 0)
    candidates = [pref, cv2.CAP_DSHOW, cv2.CAP_MSMF, 0]
    out = []
    for c in candidates:
        if c not in out:
            out.append(c)
    return out


def _parse_fourcc_list() -> list[str]:
    raw_list   = (os.getenv("CAMERA_FOURCC_LIST") or "").strip()
    raw_single = (os.getenv("CAMERA_FOURCC") or "").strip()

    if raw_list:
        items = [x.strip().upper() for x in raw_list.split(",")]
        return [x for x in items if x]
    if raw_single:
        return [raw_single.upper()]
    # Default: coba AUTO dulu, lalu MJPG, lalu YUY2
    return ["", "MJPG", "YUY2"]


def _configure_camera(cap: cv2.VideoCapture, width: int, height: int, fps: int, fourcc: str) -> None:
    try:
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
        cap.set(cv2.CAP_PROP_FPS, fps)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        cap.set(cv2.CAP_PROP_CONVERT_RGB, 1)
    except Exception:
        pass
    if fourcc:
        try:
            cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*fourcc))
        except Exception:
            pass


def _open_camera(index: int, width: int, height: int, fps: int) -> cv2.VideoCapture:
    backend_pref    = os.getenv("CAMERA_BACKEND", "dshow")
    fourcc_candidates = _parse_fourcc_list()

    for backend in _camera_backends(backend_pref):
        for fourcc in fourcc_candidates:
            try:
                cap = cv2.VideoCapture(index, backend) if backend else cv2.VideoCapture(index)
                if not cap.isOpened():
                    try:
                        cap.release()
                    except Exception:
                        pass
                    continue

                _configure_camera(cap, width, height, fps, fourcc)

                # Warm-up reads: driver sering output garbage frame pertama
                ok_any = False
                for _ in range(12):
                    ok, fr = cap.read()
                    if ok and fr is not None and getattr(fr, "size", 0) > 0:
                        ok_any = True
                if not ok_any:
                    try:
                        cap.release()
                    except Exception:
                        pass
                    continue

                print(
                    f"✅ Camera opened index={index} backend={backend_pref} "
                    f"selected_backend={backend} fourcc={fourcc or 'AUTO'}"
                )
                return cap
            except Exception:
                try:
                    cap.release()
                except Exception:
                    pass

    # Last resort — tanpa opsi apapun
    cap = cv2.VideoCapture(index)
    if cap.isOpened():
        _configure_camera(cap, width, height, fps, "")
    return cap


def _normalize_frame(frame: np.ndarray) -> np.ndarray:
    if frame is None:
        return frame
    try:
        if frame.dtype != np.uint8:
            frame = np.clip(frame, 0, 255).astype(np.uint8)
        if frame.ndim == 2:
            frame = cv2.cvtColor(frame, cv2.COLOR_GRAY2BGR)
        elif frame.ndim == 3 and frame.shape[2] == 4:
            frame = cv2.cvtColor(frame, cv2.COLOR_BGRA2BGR)
    except Exception:
        pass
    try:
        frame = np.ascontiguousarray(frame)
    except Exception:
        pass
    return frame


# ──────────────────────────────────────────────
# FIX #2: Singleton kamera untuk /snapshot
# Menghindari open/close kamera tiap request (lambat + warm-up 12 frame).
# ──────────────────────────────────────────────

_snapshot_cap: cv2.VideoCapture | None = None
_snapshot_lock = threading.Lock()


def _get_snapshot_cap() -> cv2.VideoCapture:
    global _snapshot_cap
    width  = _parse_int_env("CAMERA_WIDTH", 640)
    height = _parse_int_env("CAMERA_HEIGHT", 480)
    fps    = _parse_int_env("CAMERA_FPS", 30)
    index  = _parse_int_env("CAMERA_INDEX", 0)

    with _snapshot_lock:
        if _snapshot_cap is None or not _snapshot_cap.isOpened():
            _snapshot_cap = _open_camera(index, width, height, fps)
    return _snapshot_cap


def _release_snapshot_cap() -> None:
    global _snapshot_cap
    with _snapshot_lock:
        if _snapshot_cap is not None:
            try:
                _snapshot_cap.release()
            except Exception:
                pass
            _snapshot_cap = None


# ──────────────────────────────────────────────
# FastAPI app
# ──────────────────────────────────────────────

app = FastAPI(title="Hematrik YOLO Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────
# FIX #3: Thread-safe detection state
# ──────────────────────────────────────────────

_detection_lock    = threading.Lock()
detection_enabled  = True
last_boxes: list   = []


# ──────────────────────────────────────────────
# Debug endpoints
# ──────────────────────────────────────────────

@app.get("/debug/cameras")
def debug_cameras():
    """Probe beberapa camera index, return statistik frame."""
    results = []
    width  = _parse_int_env("CAMERA_WIDTH", 640)
    height = _parse_int_env("CAMERA_HEIGHT", 480)
    fps    = _parse_int_env("CAMERA_FPS", 30)

    for idx in range(0, 6):
        cap = None
        try:
            cap = _open_camera(idx, width, height, fps)
            if not cap.isOpened():
                results.append({"index": idx, "opened": False})
                continue

            ok, frame = cap.read()
            frame = _normalize_frame(frame) if ok else None
            if frame is None:
                results.append({"index": idx, "opened": True, "ok": False})
                continue

            results.append({
                "index": idx,
                "opened": True,
                "ok": True,
                "shape": list(frame.shape),
                "mean": float(np.mean(frame)),
                "std":  float(np.std(frame)),
            })
        except Exception as e:
            results.append({"index": idx, "opened": False, "error": str(e)})
        finally:
            try:
                if cap is not None:
                    cap.release()
            except Exception:
                pass

    return {"cameras": results}


@app.get("/debug/frame")
def debug_frame():
    """Grab satu frame dari CAMERA_INDEX aktif, return statistik."""
    cam_index = _parse_int_env("CAMERA_INDEX", 0)
    width     = _parse_int_env("CAMERA_WIDTH", 640)
    height    = _parse_int_env("CAMERA_HEIGHT", 480)
    fps       = _parse_int_env("CAMERA_FPS", 30)

    cap = _open_camera(cam_index, width, height, fps)
    if not cap.isOpened():
        return {"ok": False, "error": "camera not opened", "index": cam_index}

    try:
        ok, frame = cap.read()
        frame = _normalize_frame(frame) if ok else None
        if frame is None:
            return {"ok": False, "error": "no frame", "index": cam_index}
        return {
            "ok":    True,
            "index": cam_index,
            "shape": list(frame.shape),
            "mean":  float(np.mean(frame)),
            "std":   float(np.std(frame)),
        }
    finally:
        try:
            cap.release()
        except Exception:
            pass


@app.get("/debug/model")
def debug_model():
    names = getattr(model, "names", None) or {}
    out_names = {}
    for k, v in names.items():
        try:
            out_names[int(k)] = str(v)
        except Exception:
            out_names[str(k)] = str(v)

    return {
        "model_path":      MODEL_PATH,
        "confidence":      CONFIDENCE,
        "iou":             IOU,
        "min_width":       MIN_WIDTH,
        "min_height":      MIN_HEIGHT,
        "enhance":         bool(ENHANCE_FRAME),
        "target_class_ids": TARGET_CLASS_IDS,
        "model_names":     out_names,
    }


# ──────────────────────────────────────────────
# Core endpoints
# ──────────────────────────────────────────────

@app.get("/health")
def health():
    return {"ok": True}


# FIX tambahan: endpoint /status untuk Node.js polling
@app.get("/status")
def status():
    """Digunakan Node.js untuk poll state deteksi tanpa harus buka kamera."""
    with _detection_lock:
        enabled = detection_enabled
        last_count = len(last_boxes)
    return {
        "detection_enabled":    enabled,
        "model_path":           MODEL_PATH,
        "target_classes":       TARGET_CLASS_IDS,
        "last_detection_count": last_count,
        "confidence_threshold": CONFIDENCE,
    }


@app.get("/snapshot")
def snapshot():
    """Return satu JPEG frame dari kamera aktif.

    FIX #2: Menggunakan singleton kamera agar tidak open/close tiap request.
    Node backend bisa poll endpoint ini secara periodik.
    """
    cap = _get_snapshot_cap()
    if not cap.isOpened():
        # Coba reset singleton sekali
        _release_snapshot_cap()
        cap = _get_snapshot_cap()
        if not cap.isOpened():
            return Response(content=b"camera not opened", status_code=503, media_type="text/plain")

    with _snapshot_lock:
        ok, frame = cap.read()

    frame = _normalize_frame(frame) if ok else None
    if frame is None:
        _release_snapshot_cap()  # paksa reopen di request berikutnya
        return Response(content=b"no frame", status_code=503, media_type="text/plain")

    ok, buffer = cv2.imencode(".jpg", frame)
    if not ok:
        return Response(content=b"encode failed", status_code=500, media_type="text/plain")

    return Response(content=buffer.tobytes(), media_type="image/jpeg")


class DetectionEnabledPayload(BaseModel):
    enabled: bool


@app.get("/detection/enabled")
def get_detection_enabled():
    # FIX #3: thread-safe read
    with _detection_lock:
        return {"enabled": bool(detection_enabled)}


@app.post("/detection/enabled")
def set_detection_enabled(payload: DetectionEnabledPayload):
    global detection_enabled
    # FIX #3: thread-safe write
    with _detection_lock:
        detection_enabled = bool(payload.enabled)
    return {"enabled": bool(payload.enabled)}


# ──────────────────────────────────────────────
# Detection helpers
# ──────────────────────────────────────────────

def enhance_frame(frame: np.ndarray) -> np.ndarray:
    return cv2.convertScaleAbs(frame, alpha=1.2, beta=40)


# Return type: list of tuple (x1, y1, x2, y2, conf, track_id, cls_id, class_name)
BoxList = list[tuple[int, int, int, int, float, int | None, int | None, str | None]]


def detect_people(frame: np.ndarray) -> BoxList:
    """Gunakan model.track() — cocok untuk stream (stable IDs)."""
    if ENHANCE_FRAME:
        frame = enhance_frame(frame)

    results = model.track(
        frame,
        conf=CONFIDENCE,
        iou=IOU,
        classes=TARGET_CLASS_IDS,
        persist=True,
        verbose=False,
    )

    person_boxes: BoxList = []
    for r in results:
        boxes = r.boxes
        ids   = boxes.id.int().cpu().tolist() if boxes.id is not None else [None] * len(boxes)

        try:
            cls_ids = boxes.cls.int().cpu().tolist() if boxes.cls is not None else [None] * len(boxes)
        except Exception:
            cls_ids = [None] * len(boxes)

        # FIX #1: unpack semua 8 elemen tuple dengan benar
        for box, track_id, cls_id in zip(boxes, ids, cls_ids):
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            conf = float(box.conf[0])
            width  = x2 - x1
            height = y2 - y1

            if conf < CONFIDENCE:
                continue
            if x1 < 0 or y1 < 0:
                continue
            if width < MIN_WIDTH or height < MIN_HEIGHT:
                continue

            class_name: str | None = None
            try:
                if cls_id is not None:
                    class_name = str(getattr(model, "names", {}).get(int(cls_id)))
            except Exception:
                class_name = None

            person_boxes.append((x1, y1, x2, y2, conf, track_id, cls_id, class_name))

    return person_boxes


def detect_people_predict(frame: np.ndarray) -> BoxList:
    """Gunakan model.predict() — lebih stabil untuk gambar tunggal (/detect endpoint)."""
    if ENHANCE_FRAME:
        frame = enhance_frame(frame)

    results = model.predict(
        frame,
        conf=CONFIDENCE,
        iou=IOU,
        classes=TARGET_CLASS_IDS,
        verbose=False,
    )

    person_boxes: BoxList = []
    for r in results:
        boxes = r.boxes
        if boxes is None:
            continue

        try:
            cls_ids = boxes.cls.int().cpu().tolist() if boxes.cls is not None else [None] * len(boxes)
        except Exception:
            cls_ids = [None] * len(boxes)

        for box, cls_id in zip(boxes, cls_ids):
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            conf   = float(box.conf[0])
            width  = x2 - x1
            height = y2 - y1

            if conf < CONFIDENCE:
                continue
            if x1 < 0 or y1 < 0:
                continue
            if width < MIN_WIDTH or height < MIN_HEIGHT:
                continue

            class_name: str | None = None
            try:
                if cls_id is not None:
                    class_name = str(getattr(model, "names", {}).get(int(cls_id)))
            except Exception:
                class_name = None

            # track_id = None karena predict() tidak punya tracking
            person_boxes.append((x1, y1, x2, y2, conf, None, cls_id, class_name))

    return person_boxes


# ──────────────────────────────────────────────
# /detect endpoint (upload gambar)
# ──────────────────────────────────────────────

@app.post("/detect")
async def detect(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None:
            return {"success": False, "error": "Gambar tidak valid"}

        with _detection_lock:
            enabled = detection_enabled

        if enabled:
            boxes = detect_people_predict(frame)
        else:
            boxes = []

        # FIX #4: track_id selalu None untuk /detect — diberi label eksplisit
        boxes_data = [
            {
                "x1":         int(x1),
                "y1":         int(y1),
                "x2":         int(x2),
                "y2":         int(y2),
                "confidence": float(conf),
                "track_id":   None,   # predict() tidak support tracking
                "class_id":   int(cls_id) if cls_id is not None else None,
                "class_name": str(class_name) if class_name is not None else None,
            }
            for (x1, y1, x2, y2, conf, _, cls_id, class_name) in boxes
        ]

        return {
            "success":      True,
            "jumlah_orang": int(len(boxes)),
            "boxes":        boxes_data,
        }
    except Exception as e:
        print("ERROR /detect:", e)
        return {"success": False, "error": str(e)}


# ──────────────────────────────────────────────
# /stream endpoint (MJPEG)
# ──────────────────────────────────────────────

@app.get("/stream")
def stream(auto_stop_no_people_seconds: float | None = None):
    return StreamingResponse(
        _generate_frames(auto_stop_no_people_seconds=auto_stop_no_people_seconds),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


def _error_frame_generator(message: str):
    """Generator frame error — nama lebih eksplisit bahwa ini generator."""
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    cv2.putText(frame, message, (16, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
    ok, buffer = cv2.imencode(".jpg", frame)
    if not ok:
        return
    yield (
        b"--frame\r\n"
        b"Content-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n"
    )


def _generate_frames(auto_stop_no_people_seconds: float | None = None):
    global last_boxes

    cam_index  = _parse_int_env("CAMERA_INDEX", 0)
    cam_width  = _parse_int_env("CAMERA_WIDTH", 640)
    cam_height = _parse_int_env("CAMERA_HEIGHT", 480)
    cam_fps    = _parse_int_env("CAMERA_FPS", 30)
    hold_frames = _parse_int_env("STREAM_HOLD_FRAMES", 3)
    if auto_stop_no_people_seconds is None:
        auto_stop_no_people_seconds = _parse_float_env("STREAM_AUTO_STOP_NO_PEOPLE_SECONDS", 0.0)

    cap = _open_camera(cam_index, cam_width, cam_height, cam_fps)
    if not cap.isOpened():
        print("❌ Kamera gagal dibuka")
        yield from _error_frame_generator("Kamera gagal dibuka")
        return

    blank_frames  = 0
    empty_streak  = 0
    # FIX #3: counter untuk reset tracker (cegah memory creep)
    frame_count   = 0
    last_person_seen_at = time.time()

    try:
        while True:
            success, frame = cap.read()
            if not success or frame is None:
                print("❌ Frame gagal dibaca")
                yield from _error_frame_generator("Frame gagal dibaca")
                break

            frame = _normalize_frame(frame)
            frame_count += 1

            # Deteksi blank frame berulang → reopen kamera
            if not np.any(frame):
                blank_frames += 1
            else:
                blank_frames = 0

            if blank_frames >= 30:
                print("⚠️ Frame kosong berulang, reopen kamera")
                try:
                    cap.release()
                except Exception:
                    pass
                cap = _open_camera(cam_index, cam_width, cam_height, cam_fps)
                blank_frames  = 0
                frame_count   = 0
                if not cap.isOpened():
                    yield from _error_frame_generator("Kamera tidak tersedia")
                    break
                continue

            # FIX #3: reset tracker periodik agar tidak memory creep
            if frame_count % TRACK_RESET_INTERVAL == 0:
                try:
                    model.predictor = None
                    print(f"🔄 Tracker reset pada frame {frame_count}")
                except Exception:
                    pass

            with _detection_lock:
                enabled = detection_enabled

            if enabled:
                raw_boxes = detect_people(frame)
            else:
                raw_boxes = []

            # Update last seen time berdasarkan deteksi aktual (bukan hasil stabilizer).
            if enabled and len(raw_boxes) > 0:
                last_person_seen_at = time.time()

            # Optional: auto-stop stream bila tidak ada orang selama N detik.
            # Catatan: ini akan menutup koneksi MJPEG (client perlu reconnect untuk mulai lagi).
            if (
                enabled
                and auto_stop_no_people_seconds
                and auto_stop_no_people_seconds > 0
                and (time.time() - last_person_seen_at) >= auto_stop_no_people_seconds
            ):
                print(f"🛑 Auto-stop stream: no people for {auto_stop_no_people_seconds:.1f}s")
                break

            boxes = raw_boxes

            # Stabilizer: tahan box terakhir sebentar untuk kurangi flicker,
            # tapi batas hold_frames agar tidak jadi ghost detection.
            if enabled and len(boxes) == 0 and len(last_boxes) > 0 and hold_frames > 0:
                empty_streak += 1
                if empty_streak <= hold_frames:
                    boxes = last_boxes
                else:
                    last_boxes = []
                    boxes = []
            else:
                empty_streak = 0
                last_boxes = boxes

            person_count = len(boxes)

            # FIX #1: unpack 8 elemen tuple dengan benar
            for (x1, y1, x2, y2, _conf, track_id, _cls_id, _class_name) in boxes:
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                label = f"ID {track_id}" if track_id is not None else "obj"
                cv2.putText(
                    frame, label,
                    (x1, y1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2,
                )

            # Overlay info
            cv2.rectangle(frame, (0, 0), (360, 70), (0, 0, 0), -1)
            cv2.putText(
                frame, f"People: {person_count}",
                (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2,
            )
            cv2.putText(
                frame, f"Detection: {'ON' if enabled else 'OFF'}",
                (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2,
            )

            ok, buffer = cv2.imencode(".jpg", frame)
            if not ok:
                continue

            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n"
            )

    except GeneratorExit:
        pass
    except Exception as e:
        print("❌ ERROR stream:", e)
        yield from _error_frame_generator("Stream error")
    finally:
        try:
            cap.release()
        except Exception:
            pass
        print("✅ Stream kamera di-release.")


# ──────────────────────────────────────────────
# Shutdown: pastikan semua kamera di-release
# ──────────────────────────────────────────────

@app.on_event("shutdown")
def on_shutdown():
    _release_snapshot_cap()
    print("✅ Semua resource kamera di-release saat shutdown.")


# ──────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        reload=os.getenv("RELOAD", "1").strip() not in {"0", "false", "False"},
    )