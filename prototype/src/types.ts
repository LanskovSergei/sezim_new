export type Format = "individual" | "couple" | "teen";
export type Language = "ru" | "kz" | "tr";
export type TimeOfDay = "morning" | "afternoon" | "evening";
export type DayPart = "weekdays" | "weekends";
export type Horizon = "week" | "two_weeks" | "month";
export type Gender = "female" | "male" | "any";
export type PaymentMethod = "rf_card" | "cis_card" | "crypto";
export type Queue = 1 | 2 | 3 | 4;

export type Quiz = {
  format: Format;
  topics: string[];
  languages: Language[];
  times: TimeOfDay[];
  days: DayPart[];
  horizon: Horizon;
  gender: Gender;
};

export type Psychologist = {
  id: string;
  name: string;
  gender: Exclude<Gender, "any">;
  age: number;
  experienceYears: number;
  price: number;
  method: string;
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

export type User = {
  id: string;
  phone: string;
  name?: string;
};

export type Booking = {
  id: string;
  psychologistId: string;
  psychologistName: string;
  slotLabel: string;
  amount: number;
  method: PaymentMethod;
  status: "paid";
  createdAt: string;
};
