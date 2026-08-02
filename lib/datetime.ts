const TOKYO_TIME_ZONE = "Asia/Tokyo";

export type TokyoDateParts = {
  year: number;
  month: number;
  day: number;
  weekday: string;
  hour: string;
  minute: string;
};

export function tokyoParts(iso: string | Date): TokyoDateParts {
  const date = iso instanceof Date ? iso : new Date(iso);
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: TOKYO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(value.year),
    month: Number(value.month),
    day: Number(value.day),
    weekday: value.weekday,
    hour: value.hour,
    minute: value.minute,
  };
}

export function tokyoDateKey(iso: string | Date) {
  const value = tokyoParts(iso);
  return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
}

export function tokyoTimeLabel(iso: string | Date) {
  const value = tokyoParts(iso);
  return `${value.hour}:${value.minute}`;
}

export function toTokyoDatetimeLocal(iso: string) {
  const value = tokyoParts(iso);
  return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}T${value.hour}:${value.minute}`;
}

export function tokyoLocalToIso(localValue: string) {
  const normalized = localValue.length === 16 ? `${localValue}:00` : localValue;
  const parsed = new Date(`${normalized}+09:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function eachTokyoDateKey(startsAt: string, endsAt: string) {
  const [startYear, startMonth, startDay] = tokyoDateKey(startsAt).split("-").map(Number);
  const [endYear, endMonth, endDay] = tokyoDateKey(endsAt).split("-").map(Number);
  const cursor = new Date(Date.UTC(startYear, startMonth - 1, startDay));
  const end = new Date(Date.UTC(endYear, endMonth - 1, endDay));
  const keys: string[] = [];
  while (cursor <= end) {
    keys.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}-${String(cursor.getUTCDate()).padStart(2, "0")}`);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}
