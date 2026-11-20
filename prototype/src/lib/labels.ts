import type {
  AuthProvider,
  DayPart,
  Format,
  Gender,
  Horizon,
  Language,
  PaymentMethod,
  Quiz,
  TimeOfDay,
  User,
} from "../types";

export type ExternalProvider = Exclude<AuthProvider, "phone">;

export const PROVIDERS: {
  id: ExternalProvider;
  label: string;
  mark: string;
  color: string;
  darkMark?: boolean;
}[] = [
  { id: "google", label: "Google", mark: "G", color: "#4285f4" },
  { id: "apple", label: "Apple", mark: "A", color: "#111111" },
  { id: "telegram", label: "Telegram", mark: "T", color: "#229ed9" },
  { id: "whatsapp", label: "WhatsApp", mark: "W", color: "#25d366", darkMark: true },
  { id: "yandex", label: "Яндекс ID", mark: "Я", color: "#fc3f1d" },
  { id: "vk", label: "VK ID", mark: "VK", color: "#0077ff" },
  { id: "tid", label: "T-ID", mark: "Т", color: "#ffdd2d", darkMark: true },
  { id: "sber", label: "Сбер ID", mark: "С", color: "#21a038" },
];

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  rf_card: "Карта РФ",
  cis_card: "Карта СНГ (Kaspi, Payme)",
  crypto: "USDT / USDC",
};

const FORMAT_LABELS: Record<Format, string> = {
  individual: "Индивидуальная терапия",
  couple: "Парная / семейная терапия",
  teen: "Детский и подростковый формат",
};

const LANGUAGE_LABELS: Record<Language, string> = {
  ru: "Русский",
  kz: "Қазақша",
  tr: "Türkçe",
};

const TIME_LABELS: Record<TimeOfDay, string> = {
  morning: "утро",
  afternoon: "день",
  evening: "вечер",
};

const DAY_LABELS: Record<DayPart, string> = {
  weekdays: "будни",
  weekends: "выходные",
};

const HORIZON_LABELS: Record<Horizon, string> = {
  week: "на этой неделе",
  two_weeks: "в течение 2 недель",
  month: "в течение месяца",
};

const GENDER_LABELS: Record<Gender, string> = {
  any: "не важно",
  female: "женщина",
  male: "мужчина",
};

export function userLabel(user: User): string {
  if (user.provider === "phone") return `+7 ${user.identity}`;
  const provider = PROVIDERS.find((p) => p.id === user.provider);
  return `${provider?.label ?? user.provider} · демо-аккаунт`;
}

/** Ответы анкеты в виде пар «вопрос — ответ» для профиля. */
export function quizSummary(quiz: Quiz): [string, string][] {
  const times = quiz.times.map((t) => TIME_LABELS[t]).join(", ");
  const days = quiz.days.map((d) => DAY_LABELS[d]).join(", ");
  return [
    ["Формат", FORMAT_LABELS[quiz.format]],
    ["Темы", quiz.topics.length > 0 ? quiz.topics.join(", ") : "не выбраны"],
    ["Язык", quiz.languages.map((l) => LANGUAGE_LABELS[l]).join(", ")],
    ["Время", `${times}; ${days}`],
    ["Первая сессия", HORIZON_LABELS[quiz.horizon]],
    ["Пол специалиста", GENDER_LABELS[quiz.gender]],
  ];
}

export function formatMoney(amount: number): string {
  return `${amount.toLocaleString("ru-RU")} ₽`;
}

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}
