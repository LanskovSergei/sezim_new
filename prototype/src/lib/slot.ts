import { bookingDays, freeHours, partOfHour, slotAt } from "./availability";
import type { Psychologist, Quiz, Slot } from "../types";

/**
 * Ближайшее свободное окно психолога: сначала в то время суток,
 * которое выбрано в анкете, иначе любое.
 */
export function nearestSlot(
  psy: Psychologist,
  quiz: Quiz,
  taken: Set<string>,
  now = new Date(),
): Slot | null {
  let fallback: Slot | null = null;
  for (const day of bookingDays(psy, now)) {
    for (const hour of freeHours(psy, day, taken, now)) {
      const slot = slotAt(day, hour);
      if (quiz.times.includes(partOfHour(hour))) return slot;
      fallback ??= slot;
    }
  }
  return fallback;
}
