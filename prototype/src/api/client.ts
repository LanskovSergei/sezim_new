import { matchPsychologists } from "../lib/match";
import { store } from "../lib/store";
import type {
  AuthProvider,
  Booking,
  ChatMessage,
  MatchResult,
  PaymentMethod,
  ProfilePatch,
  Quiz,
  User,
} from "../types";

const OTP = "1111";
const pending = new Map<string, string>();

/** Заглушка ответов психолога: в прототипе на той стороне чата никого нет. */
const AUTO_REPLIES = [
  "Спасибо за сообщение! Отвечу подробнее в течение дня.",
  "Хорошо, обсудим это на сессии. Если что-то изменится — пишите.",
];
const AUTO_REPLY_DELAY_MS = 1200;

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
    return store.upsertUser("phone", phone);
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
