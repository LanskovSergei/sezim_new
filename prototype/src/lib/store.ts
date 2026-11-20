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
  /** Недельное расписание психолога: 7 дней (с пн) × часы с 8 до 21. */
  schedules: Record<string, boolean[][]>;
  lastQuiz: Quiz | null;
  sessionUserId: string | null;
};

const empty: Db = {
  users: [],
  bookings: [],
  messages: [],
  quizByUser: {},
  schedules: {},
  lastQuiz: null,
  sessionUserId: null,
};

/** Запасной вариант, если браузер не даёт localStorage (приватный режим, превью). */
let memory: Db | null = null;

function read(): Db {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty, ...JSON.parse(raw) } : { ...empty };
  } catch {
    return { ...empty };
  }
}

function write(db: Db) {
  memory = db;
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    // Хранилище недоступно: данные живут в памяти до перезагрузки.
  }
}

export const store = {
  /** Стереть все демо-данные: записи, чаты, анкеты, аккаунты. */
  reset() {
    memory = null;
    try {
      localStorage.removeItem(KEY);
    } catch {
      // нечего удалять
    }
  },
  scheduleFor(psychologistId: string): boolean[][] | null {
    return read().schedules[psychologistId] ?? null;
  },
  saveSchedule(psychologistId: string, grid: boolean[][]) {
    const db = read();
    write({ ...db, schedules: { ...db.schedules, [psychologistId]: grid } });
  },
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
  /** Записи всех клиентов: нужны, чтобы не продать одно окно дважды. */
  allBookings(): Booking[] {
    return read().bookings;
  },
  updateBooking(bookingId: string, patch: Partial<Booking>): Booking {
    const db = read();
    const current = db.bookings.find((b) => b.id === bookingId);
    if (!current) throw new Error("Запись не найдена");
    const next = { ...current, ...patch };
    write({ ...db, bookings: db.bookings.map((b) => (b.id === bookingId ? next : b)) });
    return next;
  },
  users(): User[] {
    return read().users;
  },
  messagesForPsychologist(psychologistId: string): ChatMessage[] {
    return read().messages.filter((m) => m.psychologistId === psychologistId);
  },
  addMessage(message: ChatMessage) {
    const db = read();
    write({ ...db, messages: [...db.messages, message] });
  },
  messagesFor(userId: string): ChatMessage[] {
    return read().messages.filter((m) => m.userId === userId);
  },
};
