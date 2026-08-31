export function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function formatRange(startIso: string, endIso: string): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const a = new Date(startIso);
  const b = new Date(endIso);
  return `${pad(a.getDate())}.${pad(a.getMonth() + 1)} — ${pad(b.getDate())}.${pad(b.getMonth() + 1)}`;
}

export interface TimeParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
}

export function timeUntil(iso: string): TimeParts {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, done: true };
  const seconds = Math.floor(diff / 1000);
  return {
    days: Math.floor(seconds / 86400),
    hours: Math.floor((seconds % 86400) / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60,
    done: false,
  };
}
