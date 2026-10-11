# Deploy / Run Hematrik (Backend Node + YOLO Service)

## Arsitektur singkat
- **YOLO service (Python/FastAPI)**: inferensi YOLO saja.
- **Backend Hematrik (Node/Express)**: API untuk frontend + simpan data ke MySQL + memanggil YOLO service.

## 1) Jalankan YOLO service (Python)
Dari folder root `yolo-api`:

```powershell
cd c:\Users\user\yolo-api
$env:PORT = "8000"  # kalau bentrok, ganti mis. 8001
$env:RELOAD = "0"
python .\main.py
```

Cek:
- `http://localhost:8000/health`

## 2) Jalankan backend Node (Express)
Salin env:

```powershell
cd c:\Users\user\yolo-api\hematrik-backend
Copy-Item .env.example .env
```

Install deps (sekali saja):

```powershell
npm install
```

Start:

```powershell
$env:PORT = "3000"
$env:YOLO_SERVICE_URL = "http://127.0.0.1:8000" # sesuaikan dengan PORT YOLO service
node .\app.js
```

Alternatif (1 command, otomatis start YOLO + backend):

```powershell
cd c:\Users\user\yolo-api\hematrik-backend
Copy-Item .env.example .env
# kalau 8000 bentrok, ubah YOLO_PORT di .env (mis. 8001)
npm run start:all
```

Cek:
- `http://localhost:3000/health`

## 3) Tes endpoint /detect (Windows)
PowerShell 5.1 tidak punya `Invoke-RestMethod -Form`, jadi pakai `curl.exe`:

```powershell
curl.exe -s -X POST -F "file=@c:\Users\user\yolo-api\captures\1776425693.jpg" http://localhost:3000/detect
```

## Catatan DB
- Jika MySQL belum jalan, backend tetap akan mengembalikan hasil deteksi.
- Insert/select ke DB akan best-effort (log warning), dan `/data` fallback ke status terakhir bila ada.
