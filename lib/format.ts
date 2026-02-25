// ── Formatting utilities (ported from app.js) ──

export function fmtNumber(n: number | null | undefined): string {
  return new Intl.NumberFormat("zh-CN").format(n || 0);
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "时间未知";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function escapeHTML(str: string | number | null | undefined): string {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function gaugeColor(value: number): string {
  if (value <= 25) return "var(--color-down)";
  if (value <= 45) return "#ff6d00";
  if (value <= 55) return "var(--color-accent)";
  if (value <= 75) return "#66bb6a";
  return "var(--color-up)";
}
