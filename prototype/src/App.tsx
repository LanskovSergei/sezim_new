import { useEffect, useMemo, useState } from "react";
import { Cabinet } from "./Cabinet";
import { PsychologistCabinet } from "./PsychologistCabinet";
import { SlotPicker } from "./screens/SlotPicker";
import { VideoRoom } from "./screens/VideoRoom";
import { BookingCard } from "./components/BookingCard";
import { TOPICS, psychologists } from "./data/psychologists";
import { api } from "./api/client";
import { PAYMENT_LABELS, PROVIDERS, formatMoney } from "./lib/labels";
import type { ExternalProvider } from "./lib/labels";
import { nearestSlot } from "./lib/slot";
import type {
  Booking,
  DayPart,
  Format,
  Gender,
  Horizon,
  Language,
  MatchResult,
  PaymentMethod,
  Psychologist,
  Quiz,
  Slot,
  TimeOfDay,
  User,
} from "./types";

type Step =
  | "landing"
  | "quiz1"
  | "quiz2"
  | "quiz3"
  | "auth"
  | "otp"
  | "matches"
  | "slot"
  | "checkout"
  | "paid"
  | "cabinet"
  | "reschedule"
  | "video"
  | "therapist";

/** Кто и с кем входит в видеокомнату. */
type Room = {
  booking: Booking;
  role: "client" | "psychologist";
  peerName: string;
};

const FIRST_SESSION_DISCOUNT = 500;

const emptyQuiz: Quiz = {
  format: "individual",
  topics: [],
  languages: ["ru"],
  times: ["evening"],
  days: ["weekdays"],
  horizon: "two_weeks",
  gender: "any",
};

export default function App() {
  const [step, setStep] = useState<Step>("landing");
  const [quiz, setQuiz] = useState<Quiz>(emptyQuiz);
  const [user, setUser] = useState<User | null>(null);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", ""]);
  const [otpHint, setOtpHint] = useState("1111");
  const [error, setError] = useState("");
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [selected, setSelected] = useState<MatchResult | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("rf_card");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [paidBooking, setPaidBooking] = useState<Booking | null>(null);
  /** Последняя завершённая анкета; незаконченные правки в неё не попадают. */
  const [savedQuiz, setSavedQuiz] = useState<Quiz | null>(null);
  /** Пользователь ушёл в анкету или подборку из кабинета — показываем путь назад. */
  const [fromCabinet, setFromCabinet] = useState(false);
  /** Ближайшее свободное окно каждого психолога из подборки. */
  const [nearest, setNearest] = useState<Record<string, Slot | null>>({});
  const [slotError, setSlotError] = useState("");
  const [rescheduling, setRescheduling] = useState<Booking | null>(null);
  const [notice, setNotice] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [therapist, setTherapist] = useState<Psychologist | null>(null);

  useEffect(() => {
    if (step !== "matches") return;
    let active = true;
    Promise.all(
      matches.map(async (psy) => [psy.id, nearestSlot(psy, quiz, await api.takenSlots(psy.id))] as const),
    ).then((pairs) => {
      if (active) setNearest(Object.fromEntries(pairs));
    });
    return () => {
      active = false;
    };
  }, [step, matches, quiz]);

  const fromQuiz = matches.length > 0;
  const discount = bookings.length === 0 ? FIRST_SESSION_DISCOUNT : 0;

  const grouped = useMemo(() => {
    const map = new Map<number, MatchResult[]>();
    for (const item of matches) {
      const list = map.get(item.queue) ?? [];
      list.push(item);
      map.set(item.queue, list);
    }
    return [...map.entries()];
  }, [matches]);

  async function finishQuiz() {
    const list = await api.match(quiz);
    setMatches(list);
    setSavedQuiz(quiz);
    if (user) await api.saveQuiz(user.id, quiz);
    setStep(user ? "matches" : "auth");
  }

  /** После любого способа входа: с анкетой — к подборке, без неё — в кабинет. */
  async function enter(next: User) {
    setUser(next);
    setError("");
    setOtp(["", "", "", ""]);
    setBookings(await api.bookings(next.id));
    if (fromQuiz) {
      await api.saveQuiz(next.id, quiz);
    } else {
      const saved = await api.quiz(next.id);
      if (saved) {
        setQuiz(saved);
        setSavedQuiz(saved);
      }
    }
    setStep(fromQuiz ? "matches" : "cabinet");
  }

  function openCabinet() {
    // Брошенные на полпути правки анкеты откатываем к сохранённым ответам.
    if (savedQuiz) setQuiz(savedQuiz);
    setFromCabinet(false);
    setStep("cabinet");
  }

  async function sendCode() {
    setError("");
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      setError("Введите номер телефона");
      return;
    }
    const res = await api.requestCode(digits);
    setOtpHint(res.hint);
    setStep("otp");
  }

  async function verify() {
    setError("");
    try {
      await enter(await api.verify(phone.replace(/\D/g, ""), otp.join("")));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка входа");
    }
  }

  async function loginWith(provider: ExternalProvider) {
    await enter(await api.loginWithProvider(provider));
  }

  async function pay() {
    if (!selected || !slot || !user) return;
    let booking: Booking;
    try {
      booking = await api.checkout({
      userId: user.id,
      psychologistId: selected.id,
      psychologistName: selected.name,
      slotLabel: slot.label,
      startsAt: slot.startsAt,
      amount: selected.price - discount,
      method,
    });
    } catch (e) {
      setSlotError(e instanceof Error ? e.message : "Не удалось оплатить");
      setStep("slot");
      return;
    }
    setBookings(await api.bookings(user.id));
    setPaidBooking(booking);
    setStep("paid");
  }

  async function cancelBooking(booking: Booking) {
    if (!user) return;
    const result = await api.cancelBooking(booking.id);
    setBookings(await api.bookings(user.id));
    setNotice(
      result.refund
        ? `Запись отменена. ${formatMoney(result.refund)} вернутся на карту в течение 3 дней.`
        : "Запись отменена без возврата: до начала было меньше 24 часов.",
    );
  }

  async function confirmReschedule(next: Slot) {
    if (!user || !rescheduling) return;
    try {
      await api.reschedule(rescheduling.id, next);
    } catch (e) {
      setSlotError(e instanceof Error ? e.message : "Не удалось перенести");
      return;
    }
    setBookings(await api.bookings(user.id));
    setRescheduling(null);
    setNotice(`Сессия перенесена на ${next.label}. Психолог получит уведомление.`);
    openCabinet();
  }

  async function enterTherapist() {
    setTherapist(await api.loginAsPsychologist());
    setStep("therapist");
  }

  function exitRoom() {
    const role = room?.role;
    setRoom(null);
    if (role === "psychologist") setStep("therapist");
    else openCabinet();
  }

  async function rate(rating: number) {
    if (room && user && room.role === "client") {
      await api.rateBooking(room.booking.id, rating);
      setBookings(await api.bookings(user.id));
      setNotice("Спасибо за оценку! Она помогает подбирать специалистов точнее.");
    }
    exitRoom();
  }

  async function logout() {
    await api.logout();
    setUser(null);
    setQuiz(emptyQuiz);
    setMatches([]);
    setBookings([]);
    setSelected(null);
    setSlot(null);
    setPaidBooking(null);
    setSavedQuiz(null);
    setFromCabinet(false);
    setPhone("");
    setNotice("");
    setTherapist(null);
    setStep("landing");
  }

  return (
    <div className="app-shell">
      <div className={`phone ${["cabinet", "therapist", "video"].includes(step) ? "fit" : ""}`}>
        {step === "landing" && (
          <div className="screen">
            <p className="hint">Прототип психологи · данные в localStorage</p>
            <h1>Личный кабинет как центр</h1>
            <p>
              Сначала анкета, потом вход любым удобным способом, затем подборка
              психологов и оплата. Бронь появляется в личном кабинете. Код
              подтверждения в прототипе: 1111.
            </p>
            <button className="btn" onClick={() => setStep("quiz1")}>
              Подобрать психолога
            </button>
            <button
              className="btn secondary"
              style={{ marginTop: 10 }}
              onClick={() => setStep("auth")}
            >
              Уже есть аккаунт
            </button>
            <button className="btn ghost mt-auto" onClick={enterTherapist}>
              Я психолог — открыть кабинет специалиста
            </button>
          </div>
        )}

        {step === "quiz1" && (
          <div className="screen">
            {fromCabinet && (
              <button className="back" onClick={openCabinet}>
                ← В личный кабинет
              </button>
            )}
            <Progress n={1} />
            <h2>Для кого ищем специалиста?</h2>
            {(
              [
                ["individual", "Только для меня", "Индивидуальная терапия"],
                ["couple", "Для пары", "Парная / семейная терапия"],
                ["teen", "Для ребенка", "Детский и подростковый формат"],
              ] as [Format, string, string][]
            ).map(([id, title, desc]) => (
              <button
                key={id}
                className={`choice ${quiz.format === id ? "on" : ""}`}
                onClick={() => {
                  setQuiz({ ...quiz, format: id });
                  setStep("quiz2");
                }}
              >
                <strong>{title}</strong>
                <div className="hint">{desc}</div>
              </button>
            ))}
          </div>
        )}

        {step === "quiz2" && (
          <div className="screen">
            <button className="back" onClick={() => setStep("quiz1")}>
              ← Назад
            </button>
            <Progress n={2} />
            <h2>Что вас сейчас беспокоит?</h2>
            <p>Выберите 1–3 темы. Можно пропустить.</p>
            <div className="chips">
              {TOPICS.map((topic) => {
                const on = quiz.topics.includes(topic);
                return (
                  <button
                    key={topic}
                    className={`chip ${on ? "on" : ""}`}
                    onClick={() => {
                      const next = on
                        ? quiz.topics.filter((t) => t !== topic)
                        : quiz.topics.length >= 3
                          ? quiz.topics
                          : [...quiz.topics, topic];
                      setQuiz({ ...quiz, topics: next });
                    }}
                  >
                    {topic}
                  </button>
                );
              })}
            </div>
            <button className="btn mt-auto" onClick={() => setStep("quiz3")}>
              Продолжить
            </button>
          </div>
        )}

        {step === "quiz3" && (
          <div className="screen" style={{ overflowY: "auto" }}>
            <button className="back" onClick={() => setStep("quiz2")}>
              ← Назад
            </button>
            <Progress n={3} />
            <h2>Организационные моменты</h2>
            <p>Язык консультации — можно выбрать несколько</p>
            <div className="row">
              {(
                [
                  ["ru", "Русский"],
                  ["kz", "Қазақша"],
                  ["tr", "Türkçe"],
                ] as [Language, string][]
              ).map(([id, label]) => {
                const on = quiz.languages.includes(id);
                return (
                  <button
                    key={id}
                    className={`choice grow ${on ? "on" : ""}`}
                    onClick={() => {
                      const next = on
                        ? quiz.languages.filter((lang) => lang !== id)
                        : [...quiz.languages, id];
                      if (next.length === 0) return;
                      setQuiz({ ...quiz, languages: next });
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <p>Удобное время суток — можно выбрать несколько</p>
            <div className="row wrap">
              {(
                [
                  ["morning", "Утро 8–12"],
                  ["afternoon", "День 12–17"],
                  ["evening", "Вечер 17–22"],
                ] as [TimeOfDay, string][]
              ).map(([id, label]) => {
                const on = quiz.times.includes(id);
                return (
                  <button
                    key={id}
                    className={`choice grow ${on ? "on" : ""}`}
                    onClick={() => {
                      const next = on
                        ? quiz.times.filter((t) => t !== id)
                        : [...quiz.times, id];
                      if (next.length === 0) return;
                      setQuiz({ ...quiz, times: next });
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <p>Дни</p>
            <div className="row">
              {(
                [
                  ["weekdays", "Будни"],
                  ["weekends", "Выходные"],
                ] as [DayPart, string][]
              ).map(([id, label]) => {
                const on = quiz.days.includes(id);
                return (
                  <button
                    key={id}
                    className={`choice grow ${on ? "on" : ""}`}
                    onClick={() => {
                      const next = on
                        ? quiz.days.filter((d) => d !== id)
                        : [...quiz.days, id];
                      if (next.length === 0) return;
                      setQuiz({ ...quiz, days: next });
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <p>Период, когда нужна первая сессия</p>
            <div className="row wrap">
              {(
                [
                  ["week", "Эта неделя"],
                  ["two_weeks", "2 недели"],
                  ["month", "В течение месяца"],
                ] as [Horizon, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  className={`choice grow ${quiz.horizon === id ? "on" : ""}`}
                  onClick={() => setQuiz({ ...quiz, horizon: id })}
                >
                  {label}
                </button>
              ))}
            </div>
            <p>Пол специалиста</p>
            <div className="row">
              {(
                [
                  ["any", "Не важно"],
                  ["female", "Женщина"],
                  ["male", "Мужчина"],
                ] as [Gender, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  className={`choice grow ${quiz.gender === id ? "on" : ""}`}
                  onClick={() => setQuiz({ ...quiz, gender: id })}
                >
                  {label}
                </button>
              ))}
            </div>
            <button className="btn mt-auto" onClick={finishQuiz}>
              Подобрать специалистов
            </button>
          </div>
        )}

        {step === "auth" && (
          <div className="screen" style={{ overflowY: "auto" }}>
            <button
              className="back"
              onClick={() => {
                setError("");
                setStep(fromQuiz ? "quiz3" : "landing");
              }}
            >
              ← Назад
            </button>
            <h2>{fromQuiz ? "Сохраните подборку" : "Вход в личный кабинет"}</h2>
            <p>
              {fromQuiz
                ? `Мы нашли ${matches.length} специалистов. Войдите любым способом, чтобы увидеть подборку.`
                : "Войдите любым удобным способом."}
            </p>
            <div className="phone-input">
              <span>+7</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="900 123 45 67"
              />
            </div>
            {error && <p className="error">{error}</p>}
            <button className="btn" onClick={sendCode}>
              Получить код
            </button>
            <div className="divider">или войти через</div>
            <div className="providers">
              {PROVIDERS.map((p) => (
                <button key={p.id} className="provider" onClick={() => loginWith(p.id)}>
                  <span
                    className="provider-mark"
                    aria-hidden="true"
                    style={{ background: p.color, color: p.darkMark ? "#1c1915" : "white" }}
                  >
                    {p.mark}
                  </span>
                  {p.label}
                </button>
              ))}
            </div>
            <p className="hint" style={{ marginTop: 16 }}>
              Кнопки сервисов в прототипе — заглушки: вход срабатывает сразу, без
              перехода к провайдеру.
            </p>
          </div>
        )}

        {step === "otp" && (
          <div className="screen">
            <button
              className="back"
              onClick={() => {
                setError("");
                setStep("auth");
              }}
            >
              ← Назад
            </button>
            <h2>Введите код</h2>
            <p>
              Для прототипа код всегда {otpHint}. Потом это заменит реальный OTP API.
            </p>
            <div className="otp">
              {otp.map((d, i) => (
                <input
                  key={i}
                  value={d}
                  maxLength={1}
                  onChange={(e) => {
                    const next = [...otp];
                    next[i] = e.target.value.replace(/\D/g, "").slice(-1);
                    setOtp(next);
                  }}
                />
              ))}
            </div>
            {error && <p className="error">{error}</p>}
            <button className="btn" onClick={verify}>
              Войти
            </button>
          </div>
        )}

        {step === "matches" && (
          <div className="screen" style={{ overflowY: "auto" }}>
            {fromCabinet && (
              <button className="back" onClick={openCabinet}>
                ← В личный кабинет
              </button>
            )}
            <div className="header">
              <div>
                <h2>Ваша подборка</h2>
                <p className="hint">
                  Подобрано по анкете. Выберите специалиста и оплатите сессию.
                </p>
              </div>
            </div>
            {grouped.map(([queue, list]) => (
              <div key={queue}>
                <div className="queue-title">
                  Очередь {queue}
                  {queue === 1 && " · идеальный мэтч"}
                  {queue === 2 && " · компромисс по времени"}
                  {queue === 3 && " · компромисс по фильтрам"}
                  {queue === 4 && " · широкий профиль"}
                </div>
                {list.map((psy) => (
                  <div key={psy.id} className="card">
                    <div className="row" style={{ alignItems: "center", marginBottom: 10 }}>
                      <img className="avatar" src={psy.photo} alt="" />
                      <div className="grow">
                        <strong>{psy.name}</strong>
                        <div className="hint">
                          {psy.method} · {psy.experienceYears} лет опыта
                        </div>
                      </div>
                    </div>
                    {psy.queue > 1 && <div className="warn">{psy.reason}</div>}
                    {psy.id in nearest && (
                      <div className="hint" style={{ marginBottom: 8 }}>
                        {nearest[psy.id]
                          ? `Ближайшее окно: ${nearest[psy.id]!.label}`
                          : "Свободных окон в ближайшие недели нет"}
                      </div>
                    )}
                    {psy.topics.slice(0, 3).map((t) => (
                      <span key={t} className="badge">
                        {t}
                      </span>
                    ))}
                    <div className="header" style={{ marginTop: 12, marginBottom: 0 }}>
                      <strong>{psy.price.toLocaleString("ru-RU")} ₽</strong>
                      <button
                        className="btn"
                        style={{ width: "auto", padding: "8px 14px" }}
                        onClick={() => {
                          setSelected(psy);
                          setSlot(null);
                          setSlotError("");
                          setStep("slot");
                        }}
                      >
                        Выбрать время
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {step === "slot" && selected && (
          <SlotPicker
            psy={selected}
            preferred={quiz.times}
            title="Выберите дату и время"
            actionLabel="Перейти к оплате"
            error={slotError}
            onBack={() => setStep("matches")}
            onPick={(next) => {
              setSlot(next);
              setSlotError("");
              setStep("checkout");
            }}
          />
        )}

        {step === "reschedule" && rescheduling && (
          <SlotPicker
            psy={psychologists.find((p) => p.id === rescheduling.psychologistId)!}
            preferred={quiz.times}
            title="Перенос сессии"
            actionLabel="Перенести сюда"
            current={rescheduling.startsAt}
            error={slotError}
            onBack={() => {
              setRescheduling(null);
              openCabinet();
            }}
            onPick={confirmReschedule}
          />
        )}

        {step === "video" && room && (
          <VideoRoom
            booking={room.booking}
            psy={psychologists.find((p) => p.id === room.booking.psychologistId)}
            role={room.role}
            peerName={room.peerName}
            onExit={exitRoom}
            onRate={rate}
          />
        )}

        {step === "therapist" && therapist && (
          <PsychologistCabinet
            psy={therapist}
            onLogout={logout}
            onEnterRoom={(booking, peerName) => {
              setRoom({ booking, role: "psychologist", peerName });
              setStep("video");
            }}
          />
        )}

        {step === "checkout" && selected && slot && (
          <div className="screen">
            <button className="back" onClick={() => setStep("slot")}>
              ← Изменить время
            </button>
            <h2>Оформление сессии</h2>
            <p>
              {selected.name} · {slot.label}
            </p>
            {(Object.entries(PAYMENT_LABELS) as [PaymentMethod, string][]).map(
              ([id, label]) => (
                <button
                  key={id}
                  className={`choice pay-option ${method === id ? "on" : ""}`}
                  onClick={() => setMethod(id)}
                >
                  {label}
                </button>
              ),
            )}
            <div className="card static">
              <div className="header">
                <span>Сессия 50 мин</span>
                <span>{selected.price.toLocaleString("ru-RU")} ₽</span>
              </div>
              {discount > 0 && (
                <div className="header">
                  <span>Скидка на первую</span>
                  <span>−{discount} ₽</span>
                </div>
              )}
              <div className="header" style={{ marginBottom: 0 }}>
                <strong>Итого</strong>
                <strong>{(selected.price - discount).toLocaleString("ru-RU")} ₽</strong>
              </div>
            </div>
            <button className="btn mt-auto" onClick={pay}>
              Оплатить
            </button>
          </div>
        )}

        {step === "paid" && paidBooking && (
          <div className="screen">
            <h2>Сессия оплачена</h2>
            <p>Запись добавлена в личный кабинет.</p>
            <BookingCard booking={paidBooking} />
            <button className="btn mt-auto" onClick={openCabinet}>
              Перейти в личный кабинет
            </button>
          </div>
        )}

        {step === "cabinet" && user && (
          <Cabinet
            user={user}
            bookings={bookings}
            quiz={savedQuiz}
            onFindPsychologist={() => {
              setFromCabinet(true);
              setStep(fromQuiz ? "matches" : "quiz1");
            }}
            onEditQuiz={() => {
              setFromCabinet(true);
              setStep("quiz1");
            }}
            onUserChange={setUser}
            onLogout={logout}
            notice={notice}
            onDismissNotice={() => setNotice("")}
            onCancel={cancelBooking}
            onReschedule={(booking) => {
              setRescheduling(booking);
              setSlotError("");
              setStep("reschedule");
            }}
            onEnterRoom={(booking) => {
              setRoom({ booking, role: "client", peerName: booking.psychologistName });
              setStep("video");
            }}
          />
        )}
      </div>
    </div>
  );
}

function Progress({ n }: { n: number }) {
  return (
    <div className="progress">
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= n ? "on" : ""} />
      ))}
    </div>
  );
}
