import type { Booking, DayPart, Psychologist, Slot, TimeOfDay } from "../types";

/** Часы начала сессий в каждой части дня. */
export const HOURS_BY_PART: Record<TimeOfDay, number[]> = {
  morning: [8, 9, 10, 11],
  afternoon: [12, 13, 14, 15, 16],
  evening: [17, 18, 19, 20, 21],
};

export const PART_LABELS: Record<TimeOfDay, string> = {
  morning: "Утро",
  afternoon: "День",
  evening: "Вечер",
};

/** Сколько дней вперёд открыта запись. */
export const DAYS_AHEAD = 21;

/** Записаться можно не позже чем за 2 часа до начала. */
const MIN_LEAD_MS = 2 * 60 * 60 * 1000;

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function dayPart(date: Date): DayPart {
  const day = date.getDay();
  return day === 0 || day === 6 ? "weekends" : "weekdays";
}

export function partOfHour(hour: number): TimeOfDay {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

/** Детерминированный «шум»: одинаковое расписание при каждом открытии прототипа. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export function slotAt(day: Date, hour: number): Slot {
  const date = startOfDay(day);
  date.setHours(hour, 0, 0, 0);
  const label = date.toLocaleDateString("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
  const time = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return { startsAt: date.toISOString(), label: `${label}, ${time}` };
}

/** Окна, которые уже заняты оплаченными записями любого клиента. */
export function takenSlots(bookings: Booking[], psychologistId: string): Set<string> {
  return new Set(
    bookings
      .filter((b) => b.psychologistId === psychologistId && b.status === "paid")
      .map((b) => b.startsAt),
  );
}

/** Свободные часы психолога в выбранный день. */
export function freeHours(
  psy: Psychologist,
  day: Date,
  taken: Set<string>,
  now = new Date(),
): number[] {
  const offset = Math.round(
    (startOfDay(day).getTime() - startOfDay(now).getTime()) / 86_400_000,
  );
  if (offset < psy.nearestDays || offset >= psy.nearestDays + DAYS_AHEAD) return [];
  if (!psy.days.includes(dayPart(day))) return [];

  const key = dateKey(day);
  return psy.slots
    .flatMap((part) => HOURS_BY_PART[part])
    .sort((a, b) => a - b)
    .filter((hour) => {
      const slot = slotAt(day, hour);
      if (new Date(slot.startsAt).getTime() - now.getTime() < MIN_LEAD_MS) return false;
      if (taken.has(slot.startsAt)) return false;
      return hash(`${psy.id}:${key}:${hour}`) % 10 < 8;
    });
}

/** Дни, начиная с которых у психолога открыта запись. */
export function bookingDays(psy: Psychologist, now = new Date()): Date[] {
  const first = startOfDay(addDays(now, Math.max(psy.nearestDays, 0)));
  return Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(first, i));
}
