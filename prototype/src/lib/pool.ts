import { api } from "../api/client";
import { DAYS_AHEAD, addDays, freeHours, slotAt, startOfDay } from "./availability";
import type { Psychologist, Slot } from "../types";

/** Занятость и расписание каждого психолога — чтобы считать свободные окна разом. */
export type Availability = Record<string, { taken: Set<string>; schedule: boolean[][] | null }>;

/** Окно в общем календаре и кто из психологов в него свободен. */
export type PoolHour = { hour: number; slot: Slot; ids: string[] };
export type PoolDay = { date: Date; hours: PoolHour[] };

export async function loadAvailability(list: Psychologist[]): Promise<Availability> {
  const rows = await Promise.all(
    list.map(async (psy) => {
      const [taken, schedule] = await Promise.all([api.takenSlots(psy.id), api.schedule(psy.id)]);
      return [psy.id, { taken, schedule }] as const;
    }),
  );
  return Object.fromEntries(rows);
}

/** Свободен ли психолог ровно в это окно. */
export function freeAt(psy: Psychologist, avail: Availability, slot: Slot): boolean {
  const own = avail[psy.id];
  if (!own) return false;
  const start = new Date(slot.startsAt);
  return freeHours(psy, start, own.taken, own.schedule).includes(start.getHours());
}

/**
 * Общий календарь: по дням и часам — какие психологи из списка свободны.
 * Клиент сначала выбирает окно здесь, потом видит свободных в него психологов.
 */
export function poolDays(list: Psychologist[], avail: Availability, now = new Date()): PoolDay[] {
  const today = startOfDay(now);
  return Array.from({ length: DAYS_AHEAD }, (_, i) => {
    const date = addDays(today, i);
    const byHour = new Map<number, string[]>();
    for (const psy of list) {
      const own = avail[psy.id];
      if (!own) continue;
      for (const hour of freeHours(psy, date, own.taken, own.schedule, now)) {
        byHour.set(hour, [...(byHour.get(hour) ?? []), psy.id]);
      }
    }
    const hours = [...byHour.entries()]
      .sort(([a], [b]) => a - b)
      .map(([hour, ids]) => ({ hour, slot: slotAt(date, hour), ids }));
    return { date, hours };
  });
}
