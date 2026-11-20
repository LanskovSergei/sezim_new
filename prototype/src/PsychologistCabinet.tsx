import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api } from "./api/client";
import { Avatar } from "./components/Avatar";
import { ChatThread } from "./components/ChatThread";
import { SCHEDULE_HOURS, addDays, defaultSchedule, startOfDay } from "./lib/availability";
import { formatMoney, formatTime, userLabel } from "./lib/labels";
import type { Booking, ChatMessage, Psychologist, User } from "./types";

type Tab = "today" | "schedule" | "payouts" | "chats";

type Props = {
  psy: Psychologist;
  onLogout: () => void;
  onEnterRoom: (booking: Booking, peerName: string) => void;
};

/** Комиссия платформы, доля от цены сессии. */
const COMMISSION = 0.2;
const HOURS = SCHEDULE_HOURS;
const WEEK = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const PAYOUT_STEPS = ["Создана", "Одобрена", "Отправлена", "Выплачена"];

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  {
    id: "today",
    label: "Сегодня",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  },
  {
    id: "schedule",
    label: "Расписание",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </>
    ),
  },
  {
    id: "payouts",
    label: "Выплаты",
    icon: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="3" />
        <path d="M2 10h20" />
      </>
    ),
  },
  {
    id: "chats",
    label: "Чаты",
    icon: <path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />,
  },
];

/** Демо-клиенты на сегодня, чтобы кабинет не выглядел пустым. */
function demoToday(psy: Psychologist): { booking: Booking; name: string; note: string }[] {
  const today = startOfDay(new Date());
  return [
    [10, "Ержан Б.", "6-я сессия"],
    [13, "Нурлан и Дана", "Парная, 3-я сессия"],
    [16, "Алия С.", "Дневник тревоги"],
  ].map(([hour, name, note]) => {
    const at = new Date(today);
    at.setHours(hour as number);
    return {
      name: name as string,
      note: note as string,
      booking: {
        id: `demo-${hour}`,
        userId: "demo",
        psychologistId: psy.id,
        psychologistName: psy.name,
        slotLabel: `сегодня, ${String(hour).padStart(2, "0")}:00`,
        startsAt: at.toISOString(),
        amount: psy.price,
        method: "rf_card",
        status: "paid",
        createdAt: at.toISOString(),
      },
    };
  });
}

/** Демо-начисления, доступные к выплате (те же, что во вкладке «Выплаты»). */
function demoAvailable(psy: Psychologist): number {
  const share = (amount: number) => Math.round(amount * (1 - COMMISSION));
  return share(psy.price) * 2 + share(psy.price + 1500);
}

function clientName(users: User[], userId: string): string {
  const user = users.find((u) => u.id === userId);
  if (!user) return "Клиент";
  return user.name || userLabel(user);
}

export function PsychologistCabinet({ psy, onLogout, onEnterRoom }: Props) {
  const [tab, setTab] = useState<Tab>("today");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  async function reload() {
    const [b, m, u] = await Promise.all([
      api.psychologistBookings(psy.id),
      api.psychologistMessages(psy.id),
      api.clients(),
    ]);
    setBookings(b);
    setMessages(m);
    setUsers(u);
  }

  useEffect(() => {
    reload();
  }, [psy.id]);

  const dialogs = useMemo(() => {
    const ids = new Set([...bookings.map((b) => b.userId), ...messages.map((m) => m.userId)]);
    return [...ids]
      .map((userId) => {
        const thread = messages.filter((m) => m.userId === userId);
        return { userId, name: clientName(users, userId), thread, last: thread[thread.length - 1] };
      })
      .sort((a, b) => (b.last?.createdAt ?? "").localeCompare(a.last?.createdAt ?? ""));
  }, [bookings, messages, users]);

  const open = dialogs.find((d) => d.userId === openUserId);

  if (tab === "chats" && open) {
    return (
      <div className="cabinet">
        <ChatThread
          title={open.name}
          subtitle="Ваш клиент"
          thread={open.thread}
          self="psychologist"
          emptyText="Напишите клиенту первым: например, пришлите задание к сессии."
          onBack={() => setOpenUserId(null)}
          onSend={async (text) => {
            await api.replyAsPsychologist(open.userId, psy.id, text);
            await reload();
          }}
        />
      </div>
    );
  }

  return (
    <div className="cabinet">
      <div className="cabinet-body">
        {tab === "today" && (
          <TodayTab
            psy={psy}
            bookings={bookings}
            users={users}
            onEnterRoom={onEnterRoom}
            onChat={(userId) => {
              setOpenUserId(userId);
              setTab("chats");
            }}
            onLogout={onLogout}
          />
        )}
        {tab === "schedule" && <ScheduleTab psy={psy} />}
        {tab === "payouts" && <PayoutsTab psy={psy} bookings={bookings} users={users} />}
        {tab === "chats" && (
          <>
            <h2>Чаты с клиентами</h2>
            <p className="hint">Рабочие часы: будни, 17:00–22:00. Вне их клиенты видят, когда ждать ответа.</p>
            {dialogs.length === 0 && (
              <p>Чат появится, когда клиент запишется к вам.</p>
            )}
            {dialogs.map((d) => (
              <button key={d.userId} className="dialog" onClick={() => setOpenUserId(d.userId)}>
                <Avatar name={d.name} size="small" />
                <span className="dialog-text">
                  <span className="dialog-top">
                    <strong>{d.name}</strong>
                    {d.last && <span className="hint">{formatTime(d.last.createdAt)}</span>}
                  </span>
                  <span className="dialog-preview">
                    {d.last
                      ? `${d.last.from === "psychologist" ? "Вы: " : ""}${d.last.text}`
                      : "Напишите первое сообщение"}
                  </span>
                </span>
              </button>
            ))}
          </>
        )}
      </div>
      <nav className="tabbar">
        {TABS.map((item) => (
          <button
            key={item.id}
            className={`tab ${tab === item.id ? "on" : ""}`}
            aria-current={tab === item.id ? "page" : undefined}
            onClick={() => {
              setTab(item.id);
              setOpenUserId(null);
            }}
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

function TodayTab({
  psy,
  bookings,
  users,
  onEnterRoom,
  onChat,
  onLogout,
}: {
  psy: Psychologist;
  bookings: Booking[];
  users: User[];
  onEnterRoom: (booking: Booking, peerName: string) => void;
  onChat: (userId: string) => void;
  onLogout: () => void;
}) {
  const now = Date.now();
  const tomorrow = addDays(startOfDay(new Date()), 1).getTime();
  const real = bookings
    .filter((b) => new Date(b.startsAt).getTime() >= now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const today = [
    ...demoToday(psy),
    ...real
      .filter((b) => new Date(b.startsAt).getTime() < tomorrow)
      .map((b) => ({ booking: b, name: clientName(users, b.userId), note: "Новая запись" })),
  ].sort((a, b) => a.booking.startsAt.localeCompare(b.booking.startsAt));

  return (
    <>
      <div className="header" style={{ marginBottom: 4 }}>
        <h2>Добрый день, {psy.name.split(" ")[0]}</h2>
        <button className="back" style={{ padding: 0 }} onClick={onLogout}>
          Выйти
        </button>
      </div>
      <p className="hint">
        {new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}
      </p>

      <div className="stats">
        <div className="stat">
          <span className="hint">Сессий в месяце</span>
          <strong>{42 + bookings.length}</strong>
        </div>
        <div className="stat">
          <span className="hint">Заполненность недели</span>
          <strong>78%</strong>
        </div>
        <div className="stat">
          <span className="hint">Рейтинг</span>
          <strong>{psy.rating.toFixed(1)}</strong>
        </div>
        <div className="stat">
          <span className="hint">К выплате</span>
          <strong>{formatMoney(demoAvailable(psy))}</strong>
        </div>
      </div>

      <div className="queue-title">Сегодня</div>
      {today.map(({ booking, name, note }) => {
        const done = new Date(booking.startsAt).getTime() + 50 * 60_000 < now;
        return (
          <div key={booking.id} className="timeline-row">
            <span className="timeline-time">{formatTime(booking.startsAt)}</span>
            <div className="grow">
              <strong>{name}</strong>
              <div className="hint">{note}</div>
            </div>
            {done ? (
              <span className="badge end paid">Проведена</span>
            ) : (
              <button className="btn secondary small" onClick={() => onEnterRoom(booking, name)}>
                Комната
              </button>
            )}
          </div>
        );
      })}

      <div className="queue-title">Новые записи</div>
      {real.length === 0 && (
        <p className="hint">
          Пока пусто. Запишитесь к Анне как клиент — запись сразу появится здесь.
        </p>
      )}
      {real.map((b) => (
        <div key={b.id} className="card static">
          <div className="header" style={{ marginBottom: 6 }}>
            <strong>{clientName(users, b.userId)}</strong>
            <span className="badge end paid">Оплачено</span>
          </div>
          <div className="slot">{b.slotLabel}</div>
          <div className="card-actions">
            <button className="btn small" onClick={() => onEnterRoom(b, clientName(users, b.userId))}>
              Комната
            </button>
            <button className="btn secondary small" onClick={() => onChat(b.userId)}>
              Написать
            </button>
          </div>
        </div>
      ))}
    </>
  );
}

function ScheduleTab({ psy }: { psy: Psychologist }) {
  const [grid, setGrid] = useState<boolean[][]>(() => defaultSchedule(psy));
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    let active = true;
    api.schedule(psy.id).then((stored) => {
      if (active && stored) setGrid(stored);
    });
    return () => {
      active = false;
    };
  }, [psy.id]);
  const [vacations, setVacations] = useState([{ from: "28 декабря", to: "5 января" }]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const paint = useRef<boolean | null>(null);

  const hoursPerWeek = grid.flat().filter(Boolean).length;

  function setCell(day: number, hourIndex: number, value: boolean) {
    setGrid((g) =>
      g[day][hourIndex] === value
        ? g
        : g.map((row, d) => (d === day ? row.map((v, h) => (h === hourIndex ? value : v)) : row)),
    );
    setSaved(false);
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

  return (
    <>
      <h2>Расписание</h2>
      <p className="hint">
        Отметьте рабочие часы — после сохранения клиенты сразу увидят новые окна на 3 недели
        вперёд. Нажмите или проведите по ячейкам.
      </p>
      <div className="header" style={{ margin: "10px 0" }}>
        <strong>{hoursPerWeek} ч в неделю</strong>
        <button
          className="btn small"
          onClick={async () => {
            await api.saveSchedule(psy.id, grid);
            setSaved(true);
          }}
          disabled={saved}
        >
          {saved ? "Сохранено" : "Сохранить"}
        </button>
      </div>
      <div
        className="sched"
        onPointerUp={() => (paint.current = null)}
        onPointerLeave={() => (paint.current = null)}
      >
        <span />
        {WEEK.map((d) => (
          <span key={d} className="sched-day">
            {d}
          </span>
        ))}
        {HOURS.map((hour, h) => (
          <div key={hour} style={{ display: "contents" }}>
            <span className="sched-hour">{String(hour).padStart(2, "0")}</span>
            {WEEK.map((dayName, d) => (
              <button
                key={dayName}
                className={`sched-cell ${grid[d][h] ? "on" : ""}`}
                aria-pressed={grid[d][h]}
                aria-label={`${dayName}, ${hour}:00`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  paint.current = !grid[d][h];
                  setCell(d, h, paint.current);
                }}
                onPointerEnter={() => {
                  if (paint.current !== null) setCell(d, h, paint.current);
                }}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="queue-title">Отпуск и исключения</div>
      {vacations.map((v) => (
        <div key={v.from + v.to} className="card static">
          <div className="header" style={{ marginBottom: 0 }}>
            <strong>
              {v.from} — {v.to}
            </strong>
            <span className="badge end">Записи закрыты</span>
          </div>
        </div>
      ))}
      <div className="row">
        <input className="date-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="С" />
        <input className="date-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="По" />
      </div>
      <button
        className="btn secondary small"
        style={{ marginTop: 8 }}
        disabled={!from || !to || to < from}
        onClick={() => {
          setVacations([...vacations, { from: fmt(from), to: fmt(to) }]);
          setFrom("");
          setTo("");
        }}
      >
        Добавить период
      </button>
    </>
  );
}

function PayoutsTab({
  psy,
  bookings,
  users,
}: {
  psy: Psychologist;
  bookings: Booking[];
  users: User[];
}) {
  const [step, setStep] = useState<number | null>(null);
  const share = (amount: number) => Math.round(amount * (1 - COMMISSION));

  const rows = [
    ...bookings.map((b) => ({
      id: b.id,
      date: b.slotLabel,
      client: clientName(users, b.userId),
      amount: b.amount,
      status: "pending" as const,
    })),
    { id: "d1", date: "14 нояб.", client: "Алия С.", amount: psy.price, status: "available" as const },
    { id: "d2", date: "13 нояб.", client: "Нурлан и Дана", amount: psy.price + 1500, status: "available" as const },
    { id: "d3", date: "12 нояб.", client: "Ержан Б.", amount: psy.price, status: "available" as const },
    { id: "d4", date: "10 нояб.", client: "Тимур Ж.", amount: psy.price, status: "reversed" as const },
    { id: "d5", date: "7 нояб.", client: "Ержан Б.", amount: psy.price, status: "paid" as const },
  ];
  const sum = (status: string) =>
    rows.filter((r) => r.status === status).reduce((s, r) => s + share(r.amount), 0);
  const available = step === null ? sum("available") : 0;
  const LABEL = {
    pending: ["В ожидании", ""],
    available: ["Доступно", "paid"],
    paid: ["Выплачено", ""],
    reversed: ["Сторно: возврат клиенту", "warn-badge"],
  } as const;

  function startPayout() {
    setStep(0);
    [1, 2, 3].forEach((i) => setTimeout(() => setStep(i), i * 1000));
  }

  return (
    <>
      <h2>Выплаты</h2>
      <div className="stats">
        <div className="stat">
          <span className="hint">В ожидании</span>
          <strong>{formatMoney(sum("pending"))}</strong>
        </div>
        <div className="stat">
          <span className="hint">Доступно</span>
          <strong>{formatMoney(available)}</strong>
        </div>
      </div>
      <p className="hint">
        Начисление появляется, когда видеосервер подтвердил вход обоих участников, и становится
        доступным после срока споров. Комиссия платформы — {COMMISSION * 100}%.
      </p>

      <div className="card static">
        <div className="hint">Реквизиты</div>
        <strong>Карта •• 4417 · самозанятая</strong>
        {step === null ? (
          <button className="btn" style={{ marginTop: 12 }} onClick={startPayout} disabled={available === 0}>
            Вывести {formatMoney(available)}
          </button>
        ) : (
          <div className="track">
            {PAYOUT_STEPS.map((s, i) => (
              <span key={s} className={i < step ? "done" : i === step ? "now" : ""}>
                {s}
              </span>
            ))}
          </div>
        )}
        {step === 3 && <p className="hint" style={{ margin: "8px 0 0" }}>Деньги на карте. Акт — в истории выплат.</p>}
      </div>

      <div className="queue-title">Начисления</div>
      {rows.map((r) => (
        <div key={r.id} className="card static">
          <div className="header" style={{ marginBottom: 4 }}>
            <strong>{r.client}</strong>
            <strong>
              {r.status === "reversed" ? "−" : ""}
              {formatMoney(share(r.amount))}
            </strong>
          </div>
          <div className="header" style={{ marginBottom: 0 }}>
            <span className="hint">
              {r.date} · сессия {formatMoney(r.amount)}, комиссия −{formatMoney(r.amount - share(r.amount))}
            </span>
            <span className={`badge end ${LABEL[r.status][1]}`}>
              {r.status === "available" && step !== null
                ? step === 3
                  ? "Выплачено"
                  : "В выплате"
                : LABEL[r.status][0]}
            </span>
          </div>
        </div>
      ))}
    </>
  );
}
