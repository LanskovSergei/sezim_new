import type {
  AuthProvider,
  Booking,
  ChatMessage,
  ProfilePatch,
  Quiz,
  User,
} from "../types";

const KEY = "психологи-prototype-v2";

type Db = {
  users: User[];
  bookings: Booking[];
  messages: ChatMessage[];
  quizByUser: Record<string, Quiz>;
  lastQuiz: Quiz | null;
  sessionUserId: string | null;
};

const empty: Db = {
  users: [],
  bookings: [],
  messages: [],
  quizByUser: {},
  lastQuiz: null,
  sessionUserId: null,
};

function read(): Db {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty, ...JSON.parse(raw) } : { ...empty };
  } catch {
    return { ...empty };
  }
}

function write(db: Db) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

export const store = {
  getQuiz(): Quiz | null {
    return read().lastQuiz;
  },
  saveQuiz(quiz: Quiz) {
    write({ ...read(), lastQuiz: quiz });
  },
  quizFor(userId: string): Quiz | null {
    return read().quizByUser[userId] ?? null;
  },
  saveQuizFor(userId: string, quiz: Quiz) {
    const db = read();
    write({ ...db, quizByUser: { ...db.quizByUser, [userId]: quiz } });
  },
  upsertUser(provider: AuthProvider, identity: string): User {
    const db = read();
    let user = db.users.find((u) => u.provider === provider && u.identity === identity);
    if (!user) {
      user = { id: crypto.randomUUID(), provider, identity };
      db.users = [...db.users, user];
    }
    db.sessionUserId = user.id;
    write(db);
    return user;
  },
  updateUser(userId: string, patch: ProfilePatch): User {
    const db = read();
    const current = db.users.find((u) => u.id === userId);
    if (!current) throw new Error("Пользователь не найден");
    const next = { ...current, ...patch };
    write({ ...db, users: db.users.map((u) => (u.id === userId ? next : u)) });
    return next;
  },
  logout() {
    write({ ...read(), sessionUserId: null });
  },
  addBooking(booking: Booking) {
    const db = read();
    db.bookings = [booking, ...db.bookings];
    write(db);
  },
  bookingsFor(userId: string): Booking[] {
    return read().bookings.filter((b) => b.userId === userId);
  },
  addMessage(message: ChatMessage) {
    const db = read();
    write({ ...db, messages: [...db.messages, message] });
  },
  messagesFor(userId: string): ChatMessage[] {
    return read().messages.filter((m) => m.userId === userId);
  },
};
