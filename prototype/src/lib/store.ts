import type { Booking, Quiz, User } from "../types";

const KEY = "психологи-prototype-v1";

type Db = {
  users: User[];
  bookings: Booking[];
  lastQuiz: Quiz | null;
  sessionUserId: string | null;
};

const empty: Db = {
  users: [],
  bookings: [],
  lastQuiz: null,
  sessionUserId: null,
};

function read(): Db {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty, ...JSON.parse(raw) } : empty;
  } catch {
    return empty;
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
  upsertUser(phone: string): User {
    const db = read();
    let user = db.users.find((u) => u.phone === phone);
    if (!user) {
      user = { id: crypto.randomUUID(), phone };
      db.users.push(user);
    }
    db.sessionUserId = user.id;
    write(db);
    return user;
  },
  currentUser(): User | null {
    const db = read();
    return db.users.find((u) => u.id === db.sessionUserId) ?? null;
  },
  addBooking(booking: Booking) {
    const db = read();
    db.bookings.unshift(booking);
    write(db);
  },
  bookingsFor(userPhone: string): Booking[] {
    const db = read();
    const user = db.users.find((u) => u.phone === userPhone);
    if (!user) return [];
    return db.bookings;
  },
};
