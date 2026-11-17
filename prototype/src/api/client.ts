import { matchPsychologists } from "../lib/match";
import { store } from "../lib/store";
import type { Booking, MatchResult, PaymentMethod, Quiz, User } from "../types";

const OTP = "1111";
const pending = new Map<string, string>();

/** Слой, который позже заменяется на fetch('/api/...') */
export const api = {
  async requestCode(phone: string): Promise<{ channel: string; hint: string }> {
    pending.set(phone, OTP);
    const channel = phone.startsWith("998") ? "Telegram" : "SMS / Telegram";
    return { channel, hint: OTP };
  },

  async verify(phone: string, code: string): Promise<User> {
    if (pending.get(phone) !== code) {
      throw new Error("Неверный код. Для прототипа используйте 1111");
    }
    pending.delete(phone);
    return store.upsertUser(phone);
  },

  async saveQuiz(quiz: Quiz): Promise<void> {
    store.saveQuiz(quiz);
  },

  async match(quiz: Quiz): Promise<MatchResult[]> {
    store.saveQuiz(quiz);
    return matchPsychologists(quiz);
  },

  async checkout(input: {
    psychologistId: string;
    psychologistName: string;
    slotLabel: string;
    amount: number;
    method: PaymentMethod;
  }): Promise<Booking> {
    const booking: Booking = {
      id: crypto.randomUUID(),
      ...input,
      status: "paid",
      createdAt: new Date().toISOString(),
    };
    store.addBooking(booking);
    return booking;
  },
};
