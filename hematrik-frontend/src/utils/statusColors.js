export function getStatusColor(kondisi) {
  if (kondisi === "PEMBOROSAN") return "#ef4444";
  if (kondisi === "PERINGATAN") return "#f59e0b";
  return "#22c55e";
}
