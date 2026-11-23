import { UNSURE, psychologists } from "../data/psychologists";
import type { AgeBand, Budget, MatchResult, Psychologist, Quiz } from "../types";

export function ageFits(psy: Psychologist, band: AgeBand): boolean {
  if (band === "under35") return psy.age < 35;
  if (band === "35to45") return psy.age >= 35 && psy.age <= 45;
  if (band === "over45") return psy.age > 45;
  return true;
}

export function budgetFits(psy: Psychologist, budget: Budget): boolean {
  return budget === "any" || psy.price <= budget;
}

/**
 * Подбор по анкете. Время и язык не участвуют: время выбирают в календаре
 * психолога, язык — в фильтрах каталога.
 *
 * Очереди: 1 — совпало всё; 2 — всё, кроме цены; 3 — тема совпала,
 * но пол или возраст другие; 4 — остальные.
 */
export function matchPsychologists(quiz: Quiz): MatchResult[] {
  const topics = quiz.topics.filter((t) => t !== UNSURE);

  return psychologists
    .map((psy) => {
      const overlap = psy.topics.filter((t) => topics.includes(t)).length;
      const topicHit = topics.length === 0 || overlap > 0;
      const formatHit = psy.formats.includes(quiz.format);
      const personHit =
        (quiz.gender === "any" || psy.gender === quiz.gender) && ageFits(psy, quiz.age);
      const priceHit = budgetFits(psy, quiz.budget);

      let queue: MatchResult["queue"] = 4;
      let reason = "Работает с похожими запросами";
      if (formatHit && topicHit && personHit && priceHit) {
        queue = 1;
        reason = "Совпали запрос и все пожелания";
      } else if (formatHit && topicHit && personHit) {
        queue = 2;
        reason = `Подходит по запросу, но сессия дороже — ${psy.price.toLocaleString("ru-RU")} ₽`;
      } else if (formatHit && topicHit) {
        queue = 3;
        reason = "Специалист по вашей теме, но пол или возраст другие";
      } else if (!formatHit) {
        reason = "Не работает в выбранном формате";
      }
      return { item: { ...psy, queue, reason } as MatchResult, overlap };
    })
    .sort(
      (a, b) =>
        a.item.queue - b.item.queue || b.overlap - a.overlap || b.item.rating - a.item.rating,
    )
    .map(({ item }) => item);
}
