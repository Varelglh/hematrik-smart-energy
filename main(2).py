import cv2
import time
import numpy as np
import os
from fastapi.responses import StreamingResponse
from ultralytics import YOLO
from fastapi import FastAPI, UploadFile, File
from datetime import datetime
from fastapi.responses import HTMLResponse

# 🔥 TAMBAHAN INI
import mysql.connector

# ==============================
# KONEKSI DATABASE (TARUH DI SINI)
# ==============================
db = mysql.connector.connect(
    host="localhost",
    user="root",
    password="",
    database="hematrik"
)

cursor = db.cursor()

# ==============================
# KONFIGURASI
# ==============================
MODEL_PATH = "best.pt"
CONFIDENCE = 0.5
MIN_WIDTH = 50
MIN_HEIGHT = 70
DELAY_OFF = 7

# ==============================
# LOAD MODEL
# ==============================
model = YOLO(MODEL_PATH)

# ==============================
# FASTAPI
# ==============================
app = FastAPI()
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# ==============================
# GLOBAL
# ==============================
listrik_status = "ON"
arus_listrik = 1  # 1 = nyala, 0 = mati
last_seen_time = time.time()
last_person_count = 0
last_detect_time = 0
last_boxes = []


 
# ==============================
# TAMBAHAN FILTER & PREPROCESS
# ==============================
def enhance_frame(frame):
    # terangin gambar (fix low light)
    return cv2.convertScaleAbs(frame, alpha=1.2, beta=40)
# ==============================
# TAMBAHAN JAM KERJA
# ==============================
def is_working_hours():
    now = datetime.now().hour
    return 8 <= now < 17
# ==============================
# TAMBAHAN SIMPAN GAMBAR
# ==============================
def save_image(frame):
    if not os.path.exists("captures"):
        os.makedirs("captures")

    filename = f"captures/{int(time.time())}.jpg"
    cv2.imwrite(filename, frame)

    return filename

# ==============================
# TAMBAHAN SIMPAN DATABASE
# ==============================
# ==============================
# SIMPAN KE DATABASE (FIX FINAL)
# ==============================
def save_to_db(jumlah_orang, status_listrik, status_ruangan, kondisi, notifikasi, gambar):
    try:
        query = """
            INSERT INTO monitoring 
            (waktu, jumlah_orang, status_listrik, status_ruangan, kondisi, notifikasi, gambar)
            VALUES (NOW(), %s, %s, %s, %s, %s, %s)
        """

        values = (
            jumlah_orang,
            status_listrik,
            status_ruangan,
            kondisi,
            notifikasi,
            gambar
        )

        cursor.execute(query, values)
        db.commit()

        print("✅ DATA MASUK DB")

    except Exception as e:
        print("❌ DB ERROR:", e)
# ==============================
# DETEKSI + TRACKING
# ==============================
def detect_people(frame):
    # 🔥 TAMBAHAN: perbaiki pencahayaan
    frame = enhance_frame(frame)
    results = model.track(
        frame,
        conf=CONFIDENCE,
        iou=0.4,
        classes=[0],
        persist=True
    )

    person_boxes = []

    for r in results:
        boxes = r.boxes

        # 🔥 TAMBAHAN TRACKING ID
        if boxes.id is not None:
            ids = boxes.id.int().cpu().tolist()
        else:
            ids = [0] * len(boxes)

        for box, track_id in zip(boxes, ids):
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            conf = float(box.conf[0])

            width = x2 - x1
            height = y2 - y1
            # 🔥 TAMBAHAN: filter confidence biar ga ngawur
            if conf < 0.5:
                continue
                        # 🔥 TAMBAHAN: buang deteksi aneh (di pinggir/gelap)
            if x1 < 0 or y1 < 0:
                continue
            if width < MIN_WIDTH or height < MIN_HEIGHT:
                continue

            person_boxes.append((x1, y1, x2, y2, conf, track_id))

    return person_boxes
@app.get("/dashboard", response_class=HTMLResponse)
def dashboard():
    with open("dashboard.html", "r", encoding="utf-8") as f:
        return f.read()
# ==============================
# API DETECT
# ==============================
# ==============================
# API DETECT
# ==============================
@app.post("/detect")
async def detect(file: UploadFile = File(...)):
    
    try:
        global listrik_status, last_seen_time

        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if frame is None:
            return {"success": False, "error": "Gambar tidak valid"}

        # ==============================
        # DETEKSI ORANG
        # ==============================
        boxes = detect_people(frame)
        person_count = len(boxes)

        # 🔥 TAMBAHAN: FORMAT BOX UNTUK REACT
        boxes_data = []
        for box in boxes:
            x1, y1, x2, y2 = map(int, box)
            boxes_data.append({
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2
            })

        # ==============================
        # JAM KERJA
        # ==============================
        jam_kerja = is_working_hours()

        if jam_kerja:
            waktu_status = "JAM KERJA"
        else:
            waktu_status = "LUAR JAM KERJA"

        # ==============================
        # WAKTU
        # ==============================
        current_time = time.time()

        # ==============================
        # LOGIKA LISTRIK
        # ==============================
        if person_count > 0:
            last_seen_time = current_time
            listrik_status = "ON"
        else:
            if 'last_seen_time' not in globals():
                last_seen_time = current_time

            if current_time - last_seen_time > DELAY_OFF:
                listrik_status = "OFF"

        # ==============================
        # STATUS RUANGAN
        # ==============================
        if listrik_status == "ON":
            status_ruangan = "ADA ORANG"
            rekomendasi = "Listrik menyala"
        else:
            status_ruangan = "KOSONG"
            rekomendasi = "Listrik dimatikan"

        # ==============================
        # SMART ENERGY
        # ==============================
        if jam_kerja:
            if person_count > 0 and listrik_status == "ON":
                kondisi = "NORMAL"
            elif person_count == 0 and listrik_status == "ON":
                kondisi = "PEMBOROSAN"
            else:
                kondisi = "AMAN"
        else:
            if listrik_status == "ON":
                kondisi = "PERINGATAN"
            else:
                kondisi = "AMAN"

        # ==============================
        # NOTIFIKASI
        # ==============================
        if kondisi == "PEMBOROSAN":
            notifikasi = "⚠️ Pemborosan energi: ruangan kosong tapi listrik menyala"
        elif kondisi == "PERINGATAN":
            notifikasi = "🚨 Listrik menyala di luar jam kerja"
        elif kondisi == "AMAN":
            notifikasi = "✅ Aman: tidak ada aktivitas dan listrik mati"
        else:
            notifikasi = "✅ Kondisi normal"

        # ==============================
        # DATABASE
        # ==============================
        gambar_path = save_image(frame)

        save_to_db(
            person_count,
            listrik_status,
            status_ruangan,
            kondisi,
            notifikasi,
            gambar_path
        )

        # ==============================
        # RETURN (🔥 ADA BOX)
        # ==============================
        return {
            "success": True,
            "jumlah_orang": person_count,
            "status_ruangan": status_ruangan,
            "rekomendasi": rekomendasi,
            "status_listrik": listrik_status,
            "waktu": waktu_status,
            "kondisi": kondisi,
            "notifikasi": notifikasi,
            "boxes": boxes_data  # 🔥 WAJIB UNTUK REACT
        }

    except Exception as e:
        print("ERROR DETECT:", e)
        return {"success": False, "error": str(e)}
# ==============================
# API LISTRIK
# ==============================
@app.get("/listrik/on")
def listrik_on():
    global listrik_status
    listrik_status = "ON"
    return {"status": "Listrik dinyalakan"}

@app.get("/listrik/off")
def listrik_off():
    global listrik_status
    listrik_status = "OFF"
    return {"status": "Listrik dimatikan"}

# ==============================
# API DATA DASHBOARD
# ==============================
@app.get("/data")
def get_data():
    try:
        cursor.execute("SELECT * FROM monitoring LIMIT 20")
        rows = cursor.fetchall()

        data = []

        for row in rows:
            print("ROW:", row)  # 🔥 debug

            # 🔥 aman walau kolom beda
            data.append({
                "id": row[0] if len(row) > 0 else 0,
                "waktu": str(row[1]) if len(row) > 1 else "",
                "jumlah_orang": row[2] if len(row) > 2 else 0,
                "status_listrik": row[3] if len(row) > 3 else "",
                "status_ruangan": row[4] if len(row) > 4 else "",
                "kondisi": row[5] if len(row) > 5 else "AMAN",
                "notifikasi": row[6] if len(row) > 6 else "Normal",
                "gambar": row[7] if len(row) > 7 else ""
            })

        return data

    except Exception as e:
        print("❌ ERROR /data:", e)
        return []
# ================= CAMERA
camera = cv2.VideoCapture(0, cv2.CAP_DSHOW)

if not camera.isOpened():
    print("❌ Kamera gagal dibuka")

# ==============================
# STREAM
# ==============================
@app.get("/stream")
def stream():
    return StreamingResponse(
        generate_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

# ==============================
# STREAM REALTIME
# ==============================
# ==============================
# STREAM REALTIME (FIX FINAL)
# ==============================
def generate_frames():

    global listrik_status, last_seen_time, last_boxes

    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)

    if not cap.isOpened():
        print("❌ Kamera gagal dibuka")
        return

    while True:
        success, frame = cap.read()

        if not success:
            print("❌ Frame gagal dibaca")
            break

        # ================= DETECT =================
        boxes = detect_people(frame)
        person_count = len(boxes)

        # ================= STABILIZER =================
        if person_count == 0 and len(last_boxes) > 0:
            boxes = last_boxes
            person_count = len(boxes)
        else:
            last_boxes = boxes

        current_time = time.time()

        # ================= LOGIKA LISTRIK =================
        if person_count > 0:
            last_seen_time = current_time
            listrik_status = "ON"
        else:
            if current_time - last_seen_time > DELAY_OFF:
                listrik_status = "OFF"


        # 🔥 STABILIZER
        if person_count == 0 and len(last_boxes) > 0:
            boxes = last_boxes
            person_count = len(boxes)
        else:
            last_boxes = boxes

        current_time = time.time()

        if person_count > 0:
            last_seen_time = current_time
            listrik_status = "ON"
        else:
            if current_time - last_seen_time > DELAY_OFF:
                listrik_status = "OFF"

        # DRAW BOX + ID
        for (x1, y1, x2, y2, conf, track_id) in boxes:
            cv2.rectangle(frame, (x1,y1), (x2,y2), (0,255,0), 2)
            cv2.putText(frame,
                        f"ID {track_id}",
                        (x1, y1-10),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.6,
                        (0,255,0),
                        2)

        if listrik_status == "ON":
            status = "LAMP ON"
            color = (0,255,0)
        else:
            status = "LAMP OFF"
            color = (0,0,255)

        remaining = max(0, int(DELAY_OFF - (current_time - last_seen_time)))

        cv2.putText(frame, f"People: {person_count}", (10,30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255,255,255), 2)

        cv2.putText(frame, status, (10,60),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)

        cv2.putText(frame, f"OFF in: {remaining}s", (10,90),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255,255,0), 2)

        _, buffer = cv2.imencode('.jpg', frame)
        frame_bytes = buffer.tobytes()

        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

# ==============================
# WEBCAM TEST
# ==============================
def run_webcam():

    global listrik_status, last_seen_time, last_boxes

    cap = cv2.VideoCapture(0)

    if not cap.isOpened():
        print("Kamera tidak terdeteksi")
        return

    prev_time = 0

    while True:

        ret, frame = cap.read()
        if not ret:
            break

        boxes = detect_people(frame)
        
        person_count = len(boxes)

        # 🔥 STABILIZER
        if person_count == 0 and len(last_boxes) > 0:
            boxes = last_boxes
            person_count = len(boxes)
        else:
            last_boxes = boxes

        current_time = time.time()

        if person_count > 0:
            last_seen_time = current_time
            listrik_status = "ON"
        else:
            if current_time - last_seen_time > DELAY_OFF:
                listrik_status = "OFF"

        for (x1, y1, x2, y2, conf, track_id) in boxes:
            cv2.rectangle(frame, (x1,y1), (x2,y2), (0,255,0), 2)
            cv2.putText(frame,
                        f"ID {track_id}",
                        (x1,y1-10),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.6,
                        (0,255,0),
                        2)

        if listrik_status == "ON":
            lamp_status = "LAMP ON"
            lamp_color = (0,255,0)
        else:
            lamp_status = "LAMP OFF"
            lamp_color = (0,0,255)

        fps = 1 / (current_time - prev_time) if prev_time != 0 else 0
        prev_time = current_time

        remaining = max(0, int(DELAY_OFF - (current_time - last_seen_time)))

        cv2.rectangle(frame,(0,0),(350,140),(0,0,0),-1)

        cv2.putText(frame, f"People: {person_count}", (10,30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255,255,255), 2)

        cv2.putText(frame, lamp_status, (10,60),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, lamp_color, 2)

        cv2.putText(frame, f"OFF in: {remaining}s", (10,90),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255,255,0), 2)

        cv2.putText(frame, f"FPS: {int(fps)}", (10,115),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255,255,255), 2)

        cv2.imshow("Hematrik Smart Monitoring", frame)

        if cv2.waitKey(1) & 0xFF == 27:
            break

    cap.release()
    cv2.destroyAllWindows()

# ==============================
# MAIN
# ==============================
if __name__ == "__main__":
    run_webcam()