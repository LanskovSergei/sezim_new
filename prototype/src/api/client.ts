import { psychologists } from "../data/psychologists";
import { takenSlots } from "../lib/availability";
import { matchPsychologists } from "../lib/match";
import { store } from "../lib/store";
import type {
  AuthProvider,
  Booking,
  ChatMessage,
  MatchResult,
  MoodEntry,
  OtpChannel,
  PaymentMethod,
  ProfilePatch,
  Psychologist,
  Quiz,
  Slot,
  User,
} from "../types";

const OTP = "1111";
const pending = new Map<string, string>();

/** Порядок доставки кода: от самого дешёвого канала к SMS. */
const CHANNEL_ORDER: OtpChannel[] = ["whatsapp", "telegram", "sms"];

/** Заглушка ответов психолога: в прототипе на той стороне чата никого нет. */
const AUTO_REPLIES = [
  "Спасибо за сообщение! Отвечу подробнее в течение дня.",
  "Хорошо, обсудим это на сессии. Если что-то изменится — пишите.",
];
const AUTO_REPLY_DELAY_MS = 1200;

/** Бесплатная отмена и перенос — если до сессии не меньше 24 часов. */
export const FREE_CANCEL_HOURS = 24;

export function hoursUntil(booking: Booking, now = new Date()): number {
  return (new Date(booking.startsAt).getTime() - now.getTime()) / 3_600_000;
}

/** Демо-аккаунт психолога: в прототипе в кабинет психолога входит Анна. */
export const DEMO_PSYCHOLOGIST_ID = "anna";

function newMessage(
  userId: string,
  psychologistId: string,
  from: ChatMessage["from"],
  text: string,
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    userId,
    psychologistId,
    from,
    text,
    createdAt: new Date().toISOString(),
  };
}

/** Слой, который позже заменяется на fetch('/api/...') */
export const api = {
  /**
   * Код подтверждения номера. Сначала пробуем мессенджеры, где у номера есть аккаунт,
   * потом SMS. after — канал, по которому код не дошёл: берём следующий.
   */
  async requestCode(
    phone: string,
    after: OtpChannel | null = null,
  ): Promise<{ channel: OtpChannel; next: OtpChannel | null; hint: string }> {
    pending.set(phone, OTP);
    const index = after ? CHANNEL_ORDER.indexOf(after) + 1 : 0;
    const channel = CHANNEL_ORDER[Math.min(index, CHANNEL_ORDER.length - 1)];
    const next = CHANNEL_ORDER[CHANNEL_ORDER.indexOf(channel) + 1] ?? null;
    return { channel, next, hint: OTP };
  },

  /** Номер проверяется кодом один раз; дальше вход без кода, по сессии или Google/Apple. */
  async verify(phone: string, code: string): Promise<User> {
    if (pending.get(phone) !== code) {
      throw new Error("Неверный код. Для прототипа используйте 1111");
    }
    pending.delete(phone);
    const user = store.upsertUser("phone", phone);
    return user.phone ? user : store.setUserPhone(user.id, phone);
  },

  /** Привязать номер к аккаунту, созданному через Google/Apple/Telegram. */
  async attachPhone(userId: string, phone: string, code: string): Promise<User> {
    if (pending.get(phone) !== code) {
      throw new Error("Неверный код. Для прототипа используйте 1111");
    }
    pending.delete(phone);
    return store.setUserPhone(userId, phone);
  },

  /** Заглушка OAuth: вместо редиректа к провайдеру сразу возвращает демо-аккаунт. */
  async loginWithProvider(provider: Exclude<AuthProvider, "phone">): Promise<User> {
    return store.upsertUser(provider, "demo");
  },

  async logout(): Promise<void> {
    store.logout();
  },

  async updateProfile(userId: string, patch: ProfilePatch): Promise<User> {
    return store.updateUser(userId, patch);
  },

  async match(quiz: Quiz): Promise<MatchResult[]> {
    store.saveQuiz(quiz);
    return matchPsychologists(quiz);
  },

  /** Анкета, привязанная к аккаунту: показывается в профиле кабинета. */
  async quiz(userId: string): Promise<Quiz | null> {
    return store.quizFor(userId);
  },

  async saveQuiz(userId: string, quiz: Quiz): Promise<void> {
    store.saveQuizFor(userId, quiz);
  },

  async bookings(userId: string): Promise<Booking[]> {
    return store.bookingsFor(userId);
  },

  async checkout(input: {
    userId: string;
    psychologistId: string;
    psychologistName: string;
    slotLabel: string;
    startsAt: string;
    amount: number;
    method: PaymentMethod;
  }): Promise<Booking> {
    if (takenSlots(store.allBookings(), input.psychologistId).has(input.startsAt)) {
      throw new Error("Это время уже заняли, выберите другое");
    }
    const booking: Booking = {
      id: crypto.randomUUID(),
      ...input,
      status: "paid",
      createdAt: new Date().toISOString(),
    };
    store.addBooking(booking);

    const hasChat = store
      .messagesFor(input.userId)
      .some((m) => m.psychologistId === input.psychologistId);
    if (!hasChat) {
      store.addMessage(
        newMessage(
          input.userId,
          input.psychologistId,
          "psychologist",
          `Здравствуйте! Вижу вашу запись на ${input.slotLabel}. Если появятся вопросы до сессии — пишите сюда.`,
        ),
      );
    }
    return booking;
  },

  /** Занятые окна психолога по всем клиентам. */
  async takenSlots(psychologistId: string): Promise<Set<string>> {
    return takenSlots(store.allBookings(), psychologistId);
  },

  /** Расписание, сохранённое психологом; null — берём из его карточки. */
  async schedule(psychologistId: string): Promise<boolean[][] | null> {
    return store.scheduleFor(psychologistId);
  },

  async saveSchedule(psychologistId: string, grid: boolean[][]): Promise<void> {
    store.saveSchedule(psychologistId, grid);
  },

  /** Режим показа: стереть все демо-данные и начать с чистого листа. */
  async resetDemo(): Promise<void> {
    store.reset();
  },

  /** Отмена записи: за 24 часа и раньше — полный возврат, позже — без возврата. */
  async cancelBooking(bookingId: string): Promise<Booking> {
    const booking = store.allBookings().find((b) => b.id === bookingId);
    if (!booking) throw new Error("Запись не найдена");
    const refund = hoursUntil(booking) >= FREE_CANCEL_HOURS ? booking.amount : 0;
    return store.updateBooking(bookingId, { status: "cancelled", refund });
  },

  /** Перенос к тому же психологу; окно проверяется на занятость. */
  async reschedule(bookingId: string, slot: Slot): Promise<Booking> {
    const booking = store.allBookings().find((b) => b.id === bookingId);
    if (!booking) throw new Error("Запись не найдена");
    if (hoursUntil(booking) < FREE_CANCEL_HOURS) {
      throw new Error("Перенести можно не позже чем за 24 часа до начала");
    }
    if (takenSlots(store.allBookings(), booking.psychologistId).has(slot.startsAt)) {
      throw new Error("Это время уже заняли, выберите другое");
    }
    return store.updateBooking(bookingId, { startsAt: slot.startsAt, slotLabel: slot.label });
  },

  async rateBooking(bookingId: string, rating: number): Promise<Booking> {
    return store.updateBooking(bookingId, { rating });
  },

  async favorites(): Promise<string[]> {
    return store.favorites();
  },

  async toggleFavorite(psychologistId: string): Promise<string[]> {
    return store.toggleFavorite(psychologistId);
  },

  async moods(userId: string): Promise<MoodEntry[]> {
    return store.moodsFor(userId);
  },

  async saveMood(userId: string, value: number): Promise<MoodEntry[]> {
    const date = new Date().toISOString().slice(0, 10);
    return store.saveMood(userId, { date, value });
  },

  /** Режим показа: дневник за прошлую неделю, чтобы был виден график. */
  async seedDemoMoods(userId: string): Promise<void> {
    const values = [2, 2, 3, 2, 3, 4];
    values.forEach((value, i) => {
      const day = new Date();
      day.setDate(day.getDate() - (values.length - i));
      store.saveMood(userId, { date: day.toISOString().slice(0, 10), value });
    });
  },

  /** Промокод друга: другу скидка на первую сессию, приглашающему — бонус на баланс. */
  referralCode(user: User): string {
    return `DRUG-${user.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
  },

  /** Клиентский аккаунт психолога: открывается из его кабинета, вход тот же. */
  async clientAccountFor(psy: Psychologist): Promise<User> {
    return store.subaccountFor(psy.id, psy.name);
  },

  /**
   * Вход психолога. Сам зарегистрироваться психологом нельзя — только по приглашению
   * платформы; в прототипе любой непустой код открывает демо-кабинет.
   */
  async loginAsPsychologist(): Promise<Psychologist> {
    const psy = psychologists.find((p) => p.id === DEMO_PSYCHOLOGIST_ID);
    if (!psy) throw new Error("Демо-психолог не найден");
    return psy;
  },

  /** Оплаченные записи к психологу от всех клиентов. */
  async psychologistBookings(psychologistId: string): Promise<Booking[]> {
    return store
      .allBookings()
      .filter((b) => b.psychologistId === psychologistId && b.status === "paid");
  },

  async psychologistMessages(psychologistId: string): Promise<ChatMessage[]> {
    return store.messagesForPsychologist(psychologistId);
  },

  /** Ответ психолога клиенту: клиент увидит его в своём кабинете. */
  async replyAsPsychologist(
    userId: string,
    psychologistId: string,
    text: string,
  ): Promise<ChatMessage> {
    const message = newMessage(userId, psychologistId, "psychologist", text);
    store.addMessage(message);
    return message;
  },

  /** Как показывать клиента психологу: имя из профиля или способ входа. */
  async clients(): Promise<User[]> {
    return store.users();
  },

  async messages(userId: string): Promise<ChatMessage[]> {
    return store.messagesFor(userId);
  },

  async sendMessage(
    userId: string,
    psychologistId: string,
    text: string,
  ): Promise<ChatMessage> {
    const message = newMessage(userId, psychologistId, "client", text);
    store.addMessage(message);
    return message;
  },

  /** Заглушка: через паузу кладёт в чат шаблонный ответ психолога. */
  async awaitReply(userId: string, psychologistId: string): Promise<ChatMessage> {
    await new Promise((resolve) => setTimeout(resolve, AUTO_REPLY_DELAY_MS));
    const replied = store
      .messagesFor(userId)
      .filter((m) => m.psychologistId === psychologistId && m.from === "psychologist");
    const reply = newMessage(
      userId,
      psychologistId,
      "psychologist",
      AUTO_REPLIES[replied.length % AUTO_REPLIES.length],
    );
    store.addMessage(reply);
    return reply;
  },
};
