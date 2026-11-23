import type {
  AgeBand,
  AuthProvider,
  Budget,
  Format,
  Gender,
  Language,
  OtpChannel,
  PaymentMethod,
  Quiz,
  User,
} from "../types";

export type ExternalProvider = Exclude<AuthProvider, "phone">;

/** Оставили самые частые способы входа; остальные — после пилота, по статистике. */
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
];

export const OTP_CHANNELS: Record<OtpChannel, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  sms: "SMS",
};

/** Способы оплаты: карту выбирают по стране банка, от неё зависит эквайер. */
export const PAYMENT_OPTIONS: { id: PaymentMethod; label: string; hint: string }[] = [
  { id: "rf_card", label: "Карта российского банка", hint: "Мир, Visa, Mastercard · СБП" },
  { id: "cis_card", label: "Карта банка СНГ", hint: "Kaspi, Halyk, Humo, Uzcard, Элкарт" },
  { id: "world_card", label: "Любая другая карта", hint: "Visa, Mastercard из любой страны" },
  { id: "crypto", label: "Криптовалюта", hint: "USDT, USDC" },
];

export const PAYMENT_LABELS = Object.fromEntries(
  PAYMENT_OPTIONS.map((p) => [p.id, p.label]),
) as Record<PaymentMethod, string>;

export const FORMAT_LABELS: Record<Format, string> = {
  individual: "Индивидуальная терапия",
  couple: "Парная / семейная терапия",
  teen: "Детский и подростковый формат",
};

export const LANGUAGE_LABELS: Record<Language, string> = {
  ru: "Русский",
  kz: "Қазақша",
  tr: "Türkçe",
};

export const GENDER_OPTIONS: [Gender, string][] = [
  ["any", "Не важно"],
  ["female", "Женщина"],
  ["male", "Мужчина"],
];

export const AGE_OPTIONS: [AgeBand, string][] = [
  ["any", "Не важно"],
  ["under35", "До 35"],
  ["35to45", "35–45"],
  ["over45", "Старше 45"],
];

export const BUDGET_OPTIONS: [Budget, string][] = [
  ["any", "Не важно"],
  [3000, "до 3 000 ₽"],
  [3500, "до 3 500 ₽"],
  [4000, "до 4 000 ₽"],
];

function optionLabel<T>(options: [T, string][], value: T): string {
  return options.find(([id]) => id === value)?.[1] ?? String(value);
}

export function userLabel(user: User): string {
  if (user.ownerPsychologistId) return "Клиентский аккаунт психолога";
  if (user.provider === "phone") return `+7 ${user.identity}`;
  const provider = PROVIDERS.find((p) => p.id === user.provider);
  return `${provider?.label ?? user.provider} · демо-аккаунт`;
}

/** Ответы анкеты в виде пар «вопрос — ответ» для профиля. */
export function quizSummary(quiz: Quiz): [string, string][] {
  return [
    ["Формат", FORMAT_LABELS[quiz.format]],
    ["Темы", quiz.topics.length > 0 ? quiz.topics.join(", ") : "не выбраны"],
    ["Пол специалиста", optionLabel(GENDER_OPTIONS, quiz.gender).toLowerCase()],
    ["Возраст специалиста", optionLabel(AGE_OPTIONS, quiz.age).toLowerCase()],
    ["Комфортная цена", optionLabel(BUDGET_OPTIONS, quiz.budget).toLowerCase()],
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

/** Русское склонение после числа: plural(5, ["отзыв", "отзыва", "отзывов"]). */
export function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

export function years(n: number): string {
  return `${n} ${plural(n, ["год", "года", "лет"])}`;
}
