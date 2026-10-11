import cv2
import requests
import time



url = "http://127.0.0.1:8000/detect"

cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("❌ Kamera tidak bisa dibuka")
    exit()

print("✅ Kamera berhasil dibuka")

while True:
    print("🔄 Loop jalan...")  # DEBUG

    ret, frame = cap.read()

    if not ret:
        print("❌ Gagal ambil frame")
        break

    try:
        _, img_encoded = cv2.imencode('.jpg', frame)

        print("📤 Kirim ke API...")

        response = requests.post(
            url,
            files={"file": ("image.jpg", img_encoded.tobytes(), "image/jpeg")},
            timeout=5  # 🔥 biar ga nge-freeze
        )

        print("✅ STATUS:", response.status_code)
        print("📥 RESPONSE:", response.text)

    except Exception as e:
        print("❌ ERROR REQUEST:", e)

    # tampilkan kamera
    cv2.imshow("Camera", frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

    time.sleep(3)

cap.release()
cv2.destroyAllWindows()