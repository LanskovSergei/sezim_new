export type Format = "individual" | "couple" | "teen";
export type Language = "ru" | "kz" | "tr";
export type TimeOfDay = "morning" | "afternoon" | "evening";
export type DayPart = "weekdays" | "weekends";
export type Gender = "female" | "male" | "any";
/** Возраст психолога, с которым клиенту комфортнее. */
export type AgeBand = "any" | "under35" | "35to45" | "over45";
/** Комфортная цена сессии: верхняя граница в рублях или «не важно». */
export type Budget = "any" | 3000 | 3500 | 4000;
/** Карты делим по региону эмитента: от этого зависит эквайер. */
export type PaymentMethod = "rf_card" | "cis_card" | "world_card" | "crypto";
export type Queue = 1 | 2 | 3 | 4;

/**
 * Анкета подбора. Время и язык в ней больше не спрашиваем:
 * время клиент выбирает в календаре психолога, язык — в фильтрах каталога.
 */
export type Quiz = {
  format: Format;
  topics: string[];
  /** Своими словами — из текста распознаём темы. */
  story: string;
  gender: Gender;
  age: AgeBand;
  budget: Budget;
};

export type Review = {
  author: string;
  text: string;
  rating: number;
};

export type Psychologist = {
  id: string;
  name: string;
  gender: Exclude<Gender, "any">;
  age: number;
  experienceYears: number;
  price: number;
  method: string;
  education: string;
  about: string;
  topics: string[];
  languages: Language[];
  formats: Format[];
  slots: TimeOfDay[];
  days: DayPart[];
  nearestDays: number;
  rating: number;
  reviews: number;
  photo: string;
};

export type MatchResult = Psychologist & {
  queue: Queue;
  reason: string;
};

export type AuthProvider =
  | "phone"
  | "google"
  | "apple"
  | "telegram"
  | "whatsapp"
  | "yandex"
  | "vk"
  | "tid"
  | "sber";

/** Куда отправили код: сначала мессенджеры (дешевле), потом SMS. */
export type OtpChannel = "whatsapp" | "telegram" | "sms";

export type User = {
  id: string;
  provider: AuthProvider;
  /** Номер телефона или идентификатор аккаунта у внешнего провайдера */
  identity: string;
  name?: string;
  email?: string;
  /** Подтверждённый один раз номер: нужен для восстановления аккаунта. */
  phone?: string;
  /** Клиентский субаккаунт психолога: id психолога-владельца. */
  ownerPsychologistId?: string;
};

export type ProfilePatch = Pick<User, "name" | "email">;

export type ChatMessage = {
  id: string;
  userId: string;
  psychologistId: string;
  from: "client" | "psychologist";
  text: string;
  createdAt: string;
};

export type Slot = {
  startsAt: string;
  label: string;
};

export type Booking = {
  id: string;
  userId: string;
  psychologistId: string;
  psychologistName: string;
  slotLabel: string;
  startsAt: string;
  amount: number;
  method: PaymentMethod;
  /** cancelled — отменена клиентом; refund показывает, сколько вернули. */
  status: "paid" | "cancelled";
  createdAt: string;
  refund?: number;
  /** Оценка после сессии, 1–5. */
  rating?: number;
};

/** Запись дневника состояния: оценка самочувствия за день, 1–5. */
export type MoodEntry = {
  date: string;
  value: number;
};
