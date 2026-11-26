// Date helpers. Report ranges come from <input type="date"> values (the owner's local day); the server
// gets ISO timestamps. `to` is the start of the day after the last picked day (end excluded).
const pad = (n: number) => String(n).padStart(2, "0");

export function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateInput(d);
}

export const startOfDayIso = (day: string) => new Date(`${day}T00:00:00`).toISOString();

export function endExclusiveIso(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

export const fmtDateTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : "—");

// <input type="datetime-local"> value <-> ISO timestamp
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${toDateInput(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const localInputToIso = (v: string): string | null => (v ? new Date(v).toISOString() : null);
