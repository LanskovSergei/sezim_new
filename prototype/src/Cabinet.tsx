import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { api } from "./api/client";
import { BookingCard } from "./components/BookingCard";
import { psychologists } from "./data/psychologists";
import {
  PAYMENT_LABELS,
  formatDay,
  formatMoney,
  formatTime,
  quizSummary,
  userLabel,
} from "./lib/labels";
import type { Booking, ChatMessage, Psychologist, Quiz, User } from "./types";

type Tab = "sessions" | "chats" | "payments" | "profile";

type Dialog = {
  id: string;
  name: string;
  psy: Psychologist | undefined;
  thread: ChatMessage[];
  last: ChatMessage | undefined;
};

type Props = {
  user: User;
  bookings: Booking[];
  /** Анкета аккаунта; null, если пользователь её ещё не проходил. */
  quiz: Quiz | null;
  onFindPsychologist: () => void;
  onEditQuiz: () => void;
  onUserChange: (user: User) => void;
  onLogout: () => void;
};

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  {
    id: "sessions",
    label: "Сессии",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </>
    ),
  },
  {
    id: "chats",
    label: "Чаты",
    icon: <path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />,
  },
  {
    id: "payments",
    label: "Платежи",
    icon: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="3" />
        <path d="M2 10h20" />
      </>
    ),
  },
  {
    id: "profile",
    label: "Профиль",
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
      </>
    ),
  },
];

export function Cabinet({
  user,
  bookings,
  quiz,
  onFindPsychologist,
  onEditQuiz,
  onUserChange,
  onLogout,
}: Props) {
  const [tab, setTab] = useState<Tab>("sessions");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [typing, setTyping] = useState<string[]>([]);
  const pendingReplies = useRef(new Set<string>());

  useEffect(() => {
    let active = true;
    api.messages(user.id).then((list) => {
      if (active) setMessages(list);
    });
    return () => {
      active = false;
    };
  }, [user.id]);

  /** Диалог есть с каждым психологом, к которому пользователь записывался. */
  const dialogs = useMemo<Dialog[]>(() => {
    const names = new Map<string, string>();
    for (const booking of bookings) {
      if (!names.has(booking.psychologistId)) {
        names.set(booking.psychologistId, booking.psychologistName);
      }
    }
    return [...names.entries()]
      .map(([id, name]) => {
        const thread = messages.filter((m) => m.psychologistId === id);
        const last: ChatMessage | undefined = thread[thread.length - 1];
        return { id, name, psy: psychologists.find((p) => p.id === id), thread, last };
      })
      .sort((a, b) => (b.last?.createdAt ?? "").localeCompare(a.last?.createdAt ?? ""));
  }, [bookings, messages]);

  const open = dialogs.find((d) => d.id === openId);

  function openChat(psychologistId: string) {
    setOpenId(psychologistId);
    setTab("chats");
  }

  async function send(psychologistId: string, text: string) {
    await api.sendMessage(user.id, psychologistId, text);
    setMessages(await api.messages(user.id));

    // Один шаблонный ответ на серию сообщений, пока предыдущий ещё «печатается».
    if (pendingReplies.current.has(psychologistId)) return;
    pendingReplies.current.add(psychologistId);
    setTyping((ids) => [...ids, psychologistId]);
    try {
      await api.awaitReply(user.id, psychologistId);
    } finally {
      pendingReplies.current.delete(psychologistId);
      setTyping((ids) => ids.filter((id) => id !== psychologistId));
    }
    setMessages(await api.messages(user.id));
  }

  if (tab === "chats" && open) {
    return (
      <div className="cabinet">
        <ChatThread
          dialog={open}
          typing={typing.includes(open.id)}
          onBack={() => setOpenId(null)}
          onSend={(text) => send(open.id, text)}
        />
      </div>
    );
  }

  return (
    <div className="cabinet">
      <div className="cabinet-body">
        {tab === "sessions" && (
          <SessionsTab
            user={user}
            bookings={bookings}
            onChat={openChat}
            onFindPsychologist={onFindPsychologist}
          />
        )}
        {tab === "chats" && (
          <ChatsTab
            dialogs={dialogs}
            onOpen={setOpenId}
            onFindPsychologist={onFindPsychologist}
          />
        )}
        {tab === "payments" && <PaymentsTab bookings={bookings} />}
        {tab === "profile" && (
          <ProfileTab
            user={user}
            quiz={quiz}
            onEditQuiz={onEditQuiz}
            onUserChange={onUserChange}
            onLogout={onLogout}
          />
        )}
      </div>
      <nav className="tabbar">
        {TABS.map((item) => (
          <button
            key={item.id}
            className={`tab ${tab === item.id ? "on" : ""}`}
            aria-current={tab === item.id ? "page" : undefined}
            onClick={() => setTab(item.id)}
          >
            <svg
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {item.icon}
            </svg>
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function SessionsTab({
  user,
  bookings,
  onChat,
  onFindPsychologist,
}: {
  user: User;
  bookings: Booking[];
  onChat: (psychologistId: string) => void;
  onFindPsychologist: () => void;
}) {
  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const time = (b: Booking) => new Date(b.startsAt).getTime();
    return {
      upcoming: bookings.filter((b) => time(b) >= now).sort((a, b) => time(a) - time(b)),
      past: bookings.filter((b) => time(b) < now).sort((a, b) => time(b) - time(a)),
    };
  }, [bookings]);

  return (
    <>
      <h2>Мои сессии</h2>
      <p className="hint">
        {user.name ? `${user.name} · ${userLabel(user)}` : userLabel(user)}
      </p>

      <div className="queue-title">Ближайшие</div>
      {upcoming.length === 0 && (
        <p>Пока нет записей. Подберите специалиста по анкете.</p>
      )}
      {upcoming.map((booking) => (
        <BookingCard key={booking.id} booking={booking}>
          <button
            className="btn secondary small"
            onClick={() => onChat(booking.psychologistId)}
          >
            Написать психологу
          </button>
        </BookingCard>
      ))}

      <div className="queue-title">Прошедшие</div>
      {past.length === 0 && <p>Здесь появятся завершённые сессии.</p>}
      {past.map((booking) => (
        <BookingCard key={booking.id} booking={booking} past>
          <button
            className="btn secondary small"
            onClick={() => onChat(booking.psychologistId)}
          >
            Написать психологу
          </button>
        </BookingCard>
      ))}

      <button className="btn mt-auto" onClick={onFindPsychologist}>
        Подобрать психолога
      </button>
    </>
  );
}

function ChatsTab({
  dialogs,
  onOpen,
  onFindPsychologist,
}: {
  dialogs: Dialog[];
  onOpen: (psychologistId: string) => void;
  onFindPsychologist: () => void;
}) {
  return (
    <>
      <h2>Чаты</h2>
      {dialogs.length === 0 && (
        <>
          <p>Чат с психологом откроется после записи на первую сессию.</p>
          <button className="btn mt-auto" onClick={onFindPsychologist}>
            Подобрать психолога
          </button>
        </>
      )}
      {dialogs.map((dialog) => (
        <button key={dialog.id} className="dialog" onClick={() => onOpen(dialog.id)}>
          {dialog.psy && <img className="avatar" src={dialog.psy.photo} alt="" />}
          <span className="dialog-text">
            <span className="dialog-top">
              <strong>{dialog.name}</strong>
              {dialog.last && (
                <span className="hint">{formatTime(dialog.last.createdAt)}</span>
              )}
            </span>
            <span className="dialog-preview">
              {dialog.last
                ? `${dialog.last.from === "client" ? "Вы: " : ""}${dialog.last.text}`
                : "Напишите первое сообщение"}
            </span>
          </span>
        </button>
      ))}
    </>
  );
}

function ChatThread({
  dialog,
  typing,
  onBack,
  onSend,
}: {
  dialog: Dialog;
  typing: boolean;
  onBack: () => void;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [dialog.thread.length, typing]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    onSend(text);
  }

  return (
    <>
      <div className="chat-head">
        <button className="chat-back" onClick={onBack} aria-label="Назад к чатам">
          ←
        </button>
        {dialog.psy && <img className="avatar small" src={dialog.psy.photo} alt="" />}
        <div className="grow">
          <strong>{dialog.name}</strong>
          {dialog.psy && <div className="hint">{dialog.psy.method}</div>}
        </div>
      </div>
      <div className="chat-messages" ref={listRef}>
        {dialog.thread.length === 0 && (
          <p className="hint chat-empty">
            Здесь можно задать вопрос психологу до сессии или между встречами.
          </p>
        )}
        {dialog.thread.map((message) => (
          <div key={message.id} className={`msg ${message.from}`}>
            <div className="bubble">{message.text}</div>
            <span className="msg-time">{formatTime(message.createdAt)}</span>
          </div>
        ))}
        {typing && <div className="hint">{dialog.name} печатает…</div>}
      </div>
      <form className="composer" onSubmit={submit}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Сообщение"
          aria-label="Сообщение"
        />
        <button className="btn small" disabled={!draft.trim()}>
          Отправить
        </button>
      </form>
    </>
  );
}

function PaymentsTab({ bookings }: { bookings: Booking[] }) {
  const total = bookings.reduce((sum, b) => sum + b.amount, 0);
  const payments = [...bookings].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <>
      <h2>Платежи</h2>
      <div className="card static">
        <div className="hint">Оплачено всего</div>
        <div className="total">{formatMoney(total)}</div>
        <div className="hint">Сессий оплачено: {bookings.length}</div>
      </div>

      <div className="queue-title">История</div>
      {payments.length === 0 && <p>Платежей пока нет.</p>}
      {payments.map((booking) => (
        <div key={booking.id} className="card static">
          <div className="header" style={{ marginBottom: 4 }}>
            <strong>Сессия · {booking.psychologistName}</strong>
            <strong>{formatMoney(booking.amount)}</strong>
          </div>
          <div className="header" style={{ marginBottom: 0 }}>
            <span className="hint">
              {formatDay(booking.createdAt)}, {formatTime(booking.createdAt)} ·{" "}
              {PAYMENT_LABELS[booking.method]}
            </span>
            <span className="badge end paid">Оплачено</span>
          </div>
        </div>
      ))}
    </>
  );
}

function ProfileTab({
  user,
  quiz,
  onEditQuiz,
  onUserChange,
  onLogout,
}: {
  user: User;
  quiz: Quiz | null;
  onEditQuiz: () => void;
  onUserChange: (user: User) => void;
  onLogout: () => void;
}) {
  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [saved, setSaved] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    onUserChange(
      await api.updateProfile(user.id, { name: name.trim(), email: email.trim() }),
    );
    setSaved(true);
  }

  return (
    <>
      <h2>Профиль</h2>

      <form className="card static" onSubmit={save}>
        <label className="field">
          <span className="hint">Имя</span>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
            placeholder="Как к вам обращаться"
          />
        </label>
        <label className="field">
          <span className="hint">Email для чеков</span>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setSaved(false);
            }}
            placeholder="name@example.com"
          />
        </label>
        <div className="row" style={{ alignItems: "center" }}>
          <button className="btn small">Сохранить</button>
          {saved && <span className="hint">Сохранено</span>}
        </div>
      </form>

      <div className="queue-title">Способ входа</div>
      <div className="card static">{userLabel(user)}</div>

      <div className="queue-title">Анкета</div>
      <div className="card static">
        {quiz ? (
          <dl className="facts">
            {quizSummary(quiz).map(([question, answer]) => (
              <div key={question}>
                <dt>{question}</dt>
                <dd>{answer}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p>Анкета ещё не заполнена.</p>
        )}
        <button className="btn secondary small" onClick={onEditQuiz}>
          {quiz ? "Изменить анкету" : "Пройти анкету"}
        </button>
      </div>

      <button className="btn ghost" style={{ marginTop: 8 }} onClick={onLogout}>
        Выйти
      </button>
    </>
  );
}
