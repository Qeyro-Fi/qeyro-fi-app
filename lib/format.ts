export const shortAddr = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
export const shortHash = (h?: string) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "—");

export function timeAgo(unixSeconds: number | bigint): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - Number(unixSeconds));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
]
export const fmtDate = (unixSeconds: number | bigint) =>
  new Date(Number(unixSeconds) * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC";

export function errMsg(e: unknown): string {
  if (e && typeof e === "object") {
    const o = e as { shortMessage?: string; message?: string; details?: string };
    return o.shortMessage ?? o.details ?? o.message ?? "Unknown error";
  }
  return String(e);
}

export const LEVELS = [
  { level: 0, name: "Nominal", desc: "No verified elevated risk." },
  { level: 1, name: "Early Warning", desc: "Verified early indicator; heightened monitoring." },
  { level: 2, name: "Elevated", desc: "Verified indicator that warrants preparation." },
  { level: 3, name: "High", desc: "Verified high risk; protective policies may activate." },
  { level: 4, name: "Critical", desc: "Verified critical risk; restrictive policies activate." },
  { level: 5, name: "Emergency", desc: "Verified emergency; maximum protection." },
] as const;

export const levelColor = (l: number) =>
  ["var(--ok)", "var(--cyan)", "var(--warn)", "var(--warn2)", "var(--crit)", "var(--crit)"][Math.min(5, Math.max(0, l))];
