import { psychologists } from "../data/psychologists";
import type { Horizon, MatchResult, Quiz } from "../types";

function horizonLimit(horizon: Horizon): number {
  if (horizon === "week") return 7;
  if (horizon === "two_weeks") return 14;
  return 30;
}

export function matchPsychologists(quiz: Quiz): MatchResult[] {
  const topics = quiz.topics.length ? quiz.topics : ["Просто что-то не так"];
  const times = quiz.times.length ? quiz.times : ["evening"];
  const days = quiz.days.length ? quiz.days : ["weekdays"];

  return psychologists
    .map((psy) => {
      const topicHit = psy.topics.some((t) => topics.includes(t));
      const wantedLangs = quiz.languages.length ? quiz.languages : ["ru"];
      const languageHit = psy.languages.some((lang) => wantedLangs.includes(lang));
      const formatHit = psy.formats.includes(quiz.format);
      const timeHit = psy.slots.some((slot) => times.includes(slot));
      const daysHit = psy.days.some((day) => days.includes(day));
      const horizonHit = psy.nearestDays <= horizonLimit(quiz.horizon);
      const scheduleHit = timeHit && daysHit && horizonHit;
      const genderHit = quiz.gender === "any" || psy.gender === quiz.gender;

      if (!languageHit || !formatHit) {
        return {
          ...psy,
          queue: 4 as const,
          reason: "Широкий профиль: язык или формат не совпали полностью",
        };
      }

      if (topicHit && scheduleHit && genderHit) {
        return {
          ...psy,
          queue: 1 as const,
          reason: "Идеальный мэтч: запрос, период и фильтры совпали",
        };
      }

      if (topicHit && genderHit && !scheduleHit) {
        return {
          ...psy,
          queue: 2 as const,
          reason: "Подходит по запросу, но свободные окна в другой период",
        };
      }

      if (topicHit && scheduleHit && !genderHit) {
        return {
          ...psy,
          queue: 3 as const,
          reason: "Эксперт по теме и удобному периоду, но другие личные фильтры",
        };
      }

      return {
        ...psy,
        queue: 4 as const,
        reason: "Резервная выдача: общий профиль",
      };
    })
    .sort((a, b) => a.queue - b.queue || b.rating - a.rating);
}
