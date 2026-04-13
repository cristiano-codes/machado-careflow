export function parseTimeToMinutes(value: string) {
  const [hh, mm] = (value || "").split(":").map((item) => Number.parseInt(item, 10));
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

export function formatMinutesToTime(minutes: number) {
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function toIsoDate(value: string | Date | null | undefined) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const text = (value || "").toString().trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const isoDateTimeMatch = text.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (isoDateTimeMatch) return isoDateTimeMatch[1];
  return null;
}

export function overlaps(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number
) {
  return leftStart < rightEnd && rightStart < leftEnd;
}
