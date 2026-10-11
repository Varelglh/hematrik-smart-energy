// Backend utama sekarang ada di Node (hematik-backend).
// YOLO service Python dipanggil lewat backend, bukan langsung dari frontend.
export const API_BASE_URL = process.env.REACT_APP_API_BASE_URL ?? "http://127.0.0.1:3000";
