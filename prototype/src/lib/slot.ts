import type { DayPart, Psychologist, Quiz, Slot, TimeOfDay } from "../types";

const START_HOUR: Record<TimeOfDay, number> = {
  morning: 10,
  afternoon: 14,
  evening: 19,
};

function dayPart(date: Date): DayPart {
  const day = date.getDay();
  return day === 0 || day === 6 ? "weekends" : "weekdays";
}

/** Ближайшее окно психолога: по возможности в то время суток, которое выбрано в анкете. */
export function nearestSlot(psy: Psychologist, quiz: Quiz, now = new Date()): Slot {
  const time = psy.slots.find((slot) => quiz.times.includes(slot)) ?? psy.slots[0];

  const date = new Date(now);
  date.setDate(date.getDate() + psy.nearestDays);
  date.setHours(START_HOUR[time], 0, 0, 0);

  for (let i = 0; i < 7 && !psy.days.includes(dayPart(date)); i++) {
    date.setDate(date.getDate() + 1);
  }

  const day = date.toLocaleDateString("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
  const hours = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

  return { startsAt: date.toISOString(), label: `${day}, ${hours}` };
}
