import { bookingDays, freeHours, isHot, slotAt } from "./availability";
import type { Psychologist, Slot } from "../types";

/** Ближайшее свободное окно психолога. */
export function nearestSlot(
  psy: Psychologist,
  taken: Set<string>,
  schedule: boolean[][] | null = null,
  now = new Date(),
): Slot | null {
  for (const day of bookingDays(psy, now)) {
    const hours = freeHours(psy, day, taken, schedule, now);
    if (hours.length > 0) return slotAt(day, hours[0]);
  }
  return null;
}

/** Горящие окна психолога: свободные в ближайшие 48 часов. */
export function hotSlots(
  psy: Psychologist,
  taken: Set<string>,
  schedule: boolean[][] | null = null,
  now = new Date(),
): Slot[] {
  return bookingDays(psy, now)
    .slice(0, 3)
    .flatMap((day) => freeHours(psy, day, taken, schedule, now).map((h) => slotAt(day, h)))
    .filter((slot) => isHot(slot.startsAt, now));
}
