import { useEffect, useMemo, useState } from "react";
import { Cabinet } from "./Cabinet";
import { PsychologistCabinet } from "./PsychologistCabinet";
import { DemoPanel } from "./components/DemoPanel";
import { Catalog } from "./screens/Catalog";
import { SlotPicker } from "./screens/SlotPicker";
import { VideoRoom } from "./screens/VideoRoom";
import { Avatar } from "./components/Avatar";
import { BookingCard } from "./components/BookingCard";
import { PsyCard } from "./components/PsyCard";
import { TOPIC_GROUPS, UNSURE, psychologists } from "./data/psychologists";
import { api } from "./api/client";
import {
  AGE_OPTIONS,
  BUDGET_OPTIONS,
  GENDER_OPTIONS,
  OTP_CHANNELS,
  PAYMENT_OPTIONS,
  PROVIDERS,
  formatMoney,
} from "./lib/labels";
import type { ExternalProvider } from "./lib/labels";
import { HOT_DISCOUNT, slotPrice } from "./lib/availability";
import { interpretTopics } from "./lib/interpret";
import { hotSlots, nearestSlot } from "./lib/slot";
import type {
  Booking,
  Format,
  MatchResult,
  OtpChannel,
  PaymentMethod,
  Psychologist,
  Quiz,
  Slot,
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
  | "catalog"
  | "slot"
  | "checkout"
  | "paid"
  | "addPhone"
  | "cabinet"
  | "reschedule"
  | "video"
  | "therapistLogin"
  | "therapist";

/** Кто и с кем входит в видеокомнату. */
type Room = {
  booking: Booking;
  role: "client" | "psychologist";
  peerName: string;
};

/** Горящее окно конкретного психолога для полосы над подборкой. */
type HotOffer = { psy: Psychologist; slot: Slot };

const FIRST_SESSION_DISCOUNT = 500;
const DEMO_PHONE = "9001234567";
const MAX_TOPICS = 5;

const QUEUE_TITLES: Record<number, string> = {
  1: "Лучшее совпадение",
  2: "Чуть дороже комфортной цены",
  3: "Специалисты по вашей теме",
  4: "Тоже могут помочь",
};

const emptyQuiz: Quiz = {
  format: "individual",
  topics: [],
  story: "",
  gender: "any",
  age: "any",
  budget: "any",
};

export default function App() {
  const [step, setStep] = useState<Step>("landing");
  const [quiz, setQuiz] = useState<Quiz>(emptyQuiz);
  const [user, setUser] = useState<User | null>(null);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", ""]);
  const [otpHint, setOtpHint] = useState("1111");
  const [otpChannel, setOtpChannel] = useState<OtpChannel>("whatsapp");
  const [otpNext, setOtpNext] = useState<OtpChannel | null>(null);
  /** Привязка телефона после входа через Google/Apple: код уже отправлен. */
  const [attachSent, setAttachSent] = useState(false);
  const [error, setError] = useState("");
  const [matches, setMatches] = useState<MatchResult[]>([]);
  /** Темы, распознанные из текста «своими словами», ждут подтверждения. */
  const [guess, setGuess] = useState<string[] | null>(null);
  /** Текст уже разобран и темы отмечены — кнопку «Подобрать темы» прячем. */
  const [storyChecked, setStoryChecked] = useState(false);
  const [selected, setSelected] = useState<Psychologist | null>(null);
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
  const [hot, setHot] = useState<HotOffer[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [slotError, setSlotError] = useState("");
  const [rescheduling, setRescheduling] = useState<Booking | null>(null);
  const [notice, setNotice] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [therapist, setTherapist] = useState<Psychologist | null>(null);
  /** Откуда пришли в каталог и к выбору времени — туда же ведёт «Назад». */
  const [catalogBack, setCatalogBack] = useState<"landing" | "matches" | "cabinet">("landing");
  const [catalogFavOnly, setCatalogFavOnly] = useState(false);
  const [slotBack, setSlotBack] = useState<"matches" | "catalog" | "cabinet">("matches");
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    api.favorites().then(setFavorites);
  }, []);

  useEffect(() => {
    if (step !== "matches") return;
    let active = true;
    Promise.all(
      matches.map(async (psy) => {
        const [taken, schedule] = await Promise.all([api.takenSlots(psy.id), api.schedule(psy.id)]);
        return {
          psy,
          nearest: nearestSlot(psy, taken, schedule),
          hot: hotSlots(psy, taken, schedule),
        };
      }),
    ).then((rows) => {
      if (!active) return;
      setNearest(Object.fromEntries(rows.map((r) => [r.psy.id, r.nearest])));
      setHot(
        rows
          .filter((r) => r.psy.queue < 4 && r.hot.length > 0)
          .map((r) => ({ psy: r.psy, slot: r.hot[0] }))
          .sort((a, b) => a.slot.startsAt.localeCompare(b.slot.startsAt)),
      );
    });
    return () => {
      active = false;
    };
  }, [step, matches]);

  const fromQuiz = matches.length > 0;
  const discount = bookings.length === 0 ? FIRST_SESSION_DISCOUNT : 0;

  const grouped = useMemo(() => {
    const best = matches.filter((m) => m.queue < 4);
    const list = best.length > 0 ? best : matches.slice(0, 3);
    const map = new Map<number, MatchResult[]>();
    for (const item of list) {
      map.set(item.queue, [...(map.get(item.queue) ?? []), item]);
    }
    return [...map.entries()];
  }, [matches]);

  async function toggleFavorite(id: string) {
    setFavorites(await api.toggleFavorite(id));
  }

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
    if (selected && slot) setStep("checkout");
    else setStep(fromQuiz ? "matches" : "cabinet");
  }

  function openCabinet() {
    // Брошенные на полпути правки анкеты откатываем к сохранённым ответам.
    if (savedQuiz) setQuiz(savedQuiz);
    setFromCabinet(false);
    setStep("cabinet");
  }

  function pickPsychologist(psy: Psychologist, back: "matches" | "catalog" | "cabinet") {
    setSelected(psy);
    setSlot(null);
    setSlotError("");
    setSlotBack(back);
    setStep("slot");
  }

  function digits(): string {
    return phone.replace(/\D/g, "");
  }

  async function sendCode(after: OtpChannel | null = null) {
    setError("");
    if (digits().length < 10) {
      setError("Введите номер телефона");
      return false;
    }
    const res = await api.requestCode(digits(), after);
    setOtpHint(res.hint);
    setOtpChannel(res.channel);
    setOtpNext(res.next);
    setOtp(["", "", "", ""]);
    return true;
  }

  async function verify() {
    setError("");
    try {
      await enter(await api.verify(digits(), otp.join("")));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка входа");
    }
  }

  async function attachPhone() {
    if (!user) return;
    setError("");
    try {
      setUser(await api.attachPhone(user.id, digits(), otp.join("")));
      setAttachSent(false);
      setOtp(["", "", "", ""]);
      setNotice("Телефон подтверждён. Код больше не понадобится.");
      openCabinet();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось подтвердить");
    }
  }

  async function loginWith(provider: ExternalProvider) {
    await enter(await api.loginWithProvider(provider));
  }

  const price = selected && slot ? slotPrice(selected.price, slot.startsAt) : 0;
  const hotDiscount = selected && slot ? selected.price - price : 0;
  const total = Math.max(price - discount, 0);

  async function pay() {
    if (!selected || !slot) return;
    if (!user) {
      setStep("auth");
      return;
    }
    setPaying(true);
    // Имитация ответа платёжной системы.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    setPaying(false);
    let booking: Booking;
    try {
      booking = await api.checkout({
        userId: user.id,
        psychologistId: selected.id,
        psychologistName: selected.name,
        slotLabel: slot.label,
        startsAt: slot.startsAt,
        amount: total,
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

  /** После первой покупки просим телефон, если вошли через Google, Apple или Telegram. */
  function afterPaid() {
    if (user && !user.phone && !user.ownerPsychologistId) {
      setPhone("");
      setAttachSent(false);
      setError("");
      setStep("addPhone");
    } else {
      openCabinet();
    }
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

  /** Психолог открывает свой клиентский субаккаунт. */
  async function openClientAccount() {
    if (!therapist) return;
    const next = await api.clientAccountFor(therapist);
    setUser(next);
    setBookings(await api.bookings(next.id));
    setMatches([]);
    setSavedQuiz(await api.quiz(next.id));
    setNotice("Вы в клиентском аккаунте. Вернуться к работе — в «Профиле».");
    openCabinet();
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

  function clearSession() {
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
    setRoom(null);
    setRescheduling(null);
    setGuess(null);
    setStep("landing");
  }

  async function logout() {
    await api.logout();
    clearSession();
  }

  /** Режим показа: всё стереть и вернуться на главную. */
  async function resetDemo() {
    await api.resetDemo();
    setFavorites([]);
    clearSession();
  }

  /** Режим показа: войти клиентом с заполненной анкетой и сразу открыть подборку. */
  async function demoClient() {
    const demoQuiz: Quiz = {
      ...emptyQuiz,
      topics: ["Тревога и страхи", "Апатия и выгорание", "Нарушения сна"],
      budget: 4000,
    };
    const list = await api.match(demoQuiz);
    await api.requestCode(DEMO_PHONE);
    const next = await api.verify(DEMO_PHONE, "1111");
    await api.saveQuiz(next.id, demoQuiz);
    if ((await api.moods(next.id)).length === 0) await api.seedDemoMoods(next.id);
    setQuiz(demoQuiz);
    setSavedQuiz(demoQuiz);
    setMatches(list);
    setUser(next);
    setPhone(DEMO_PHONE);
    setBookings(await api.bookings(next.id));
    setTherapist(null);
    setRoom(null);
    setFromCabinet(false);
    setStep("matches");
  }

  async function demoTherapist() {
    await api.logout();
    clearSession();
    await enterTherapist();
  }

  function toggleTopic(topic: string) {
    const on = quiz.topics.includes(topic);
    let next: string[];
    if (topic === UNSURE) next = on ? [] : [UNSURE];
    else if (on) next = quiz.topics.filter((t) => t !== topic);
    else next = [...quiz.topics.filter((t) => t !== UNSURE), topic].slice(0, MAX_TOPICS);
    setQuiz({ ...quiz, topics: next });
  }

  const otpInputs = (
    <div className="otp">
      {otp.map((d, i) => (
        <input
          key={i}
          value={d}
          inputMode="numeric"
          maxLength={1}
          aria-label={`Цифра ${i + 1}`}
          onChange={(e) => {
            const next = [...otp];
            next[i] = e.target.value.replace(/\D/g, "").slice(-1);
            setOtp(next);
          }}
        />
      ))}
    </div>
  );

  const phoneInput = (
    <div className="phone-input">
      <span>+7</span>
      <input
        value={phone}
        inputMode="tel"
        aria-label="Номер телефона"
        onChange={(e) => setPhone(e.target.value)}
        placeholder="900 123 45 67"
      />
    </div>
  );

  return (
    <div className="app-shell">
      <DemoPanel
        where={
          step === "therapist" || (step === "video" && room?.role === "psychologist")
            ? "Психолог"
            : user
              ? "Клиент"
              : "Гость"
        }
        onReset={resetDemo}
        onClient={demoClient}
        onTherapist={demoTherapist}
      />
      <div className={`phone ${["cabinet", "therapist", "video"].includes(step) ? "fit" : ""}`}>
        {step === "landing" && (
          <div className="screen landing">
            <span className="eyebrow">Онлайн-психологи · RU · KZ · UZ · KG · AZ · TR</span>
            <h1>Подберём психолога под ваш запрос</h1>
            <p>
              Ответьте на 3 вопроса — покажем подходящих специалистов. Время выберете прямо в
              календаре психолога, сессии — по видео на сайте.
            </p>
            <ul className="perks">
              <li>{psychologists.length} специалистов с проверенными дипломами и отзывами</li>
              <li>
                Сессия от {formatMoney(Math.min(...psychologists.map((p) => p.price)))}, первая —
                со скидкой {formatMoney(FIRST_SESSION_DISCOUNT)}
              </li>
              <li>Горящие окна на ближайшие 48 часов — ещё −{HOT_DISCOUNT * 100}%</li>
              <li>Перенос и отмена бесплатно за 24 часа</li>
            </ul>
            <button className="btn" onClick={() => setStep("quiz1")}>
              Подобрать психолога
            </button>
            <button
              className="btn secondary"
              style={{ marginTop: 10 }}
              onClick={() => {
                setCatalogBack("landing");
                setCatalogFavOnly(false);
                setStep("catalog");
              }}
            >
              Смотреть всех специалистов
            </button>
            <button className="link-btn" style={{ marginTop: 14 }} onClick={() => setStep("auth")}>
              Уже есть аккаунт — войти
            </button>
            <button className="therapist-entry mt-auto" onClick={() => setStep("therapistLogin")}>
              <strong>Я психолог</strong>
              <span className="hint">Кабинет специалиста: расписание, клиенты, выплаты</span>
            </button>
          </div>
        )}

        {step === "catalog" && (
          <Catalog
            key={`${catalogBack}-${catalogFavOnly}`}
            quiz={savedQuiz}
            favorites={favorites}
            onFavorite={toggleFavorite}
            onlyFavorites={catalogFavOnly}
            backLabel={
              catalogBack === "matches"
                ? "К подборке"
                : catalogBack === "cabinet"
                  ? "В личный кабинет"
                  : "На главную"
            }
            onBack={() => (catalogBack === "cabinet" ? openCabinet() : setStep(catalogBack))}
            onPick={(psy) => pickPsychologist(psy, "catalog")}
          />
        )}

        {step === "quiz1" && (
          <div className="screen">
            <button className="back" onClick={fromCabinet ? openCabinet : () => setStep("landing")}>
              ← {fromCabinet ? "В личный кабинет" : "На главную"}
            </button>
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
          <div className="screen" style={{ overflowY: "auto" }}>
            <button className="back" onClick={() => setStep("quiz1")}>
              ← Назад
            </button>
            <Progress n={2} />
            <h2>Что вас сейчас беспокоит?</h2>
            <p>Выберите до {MAX_TOPICS} тем или опишите своими словами.</p>

            <label className="story">
              <span className="hint">Своими словами</span>
              <textarea
                rows={3}
                value={quiz.story}
                placeholder="Например: тяжело засыпать, постоянно переживаю из-за работы"
                onChange={(e) => {
                  setQuiz({ ...quiz, story: e.target.value });
                  setGuess(null);
                  setStoryChecked(false);
                }}
              />
            </label>
            {quiz.story.trim().length > 0 && guess === null && !storyChecked && (
              <button
                className="btn secondary small"
                style={{ alignSelf: "flex-start", marginBottom: 14 }}
                onClick={() => setGuess(interpretTopics(quiz.story))}
              >
                Подобрать темы по тексту
              </button>
            )}
            {guess !== null && (
              <div className="notice guess">
                {guess.length === 0 ? (
                  <span className="grow">
                    Не получилось распознать тему. Выберите её ниже или «{UNSURE}» — психолог
                    разберётся на первой встрече.
                  </span>
                ) : (
                  <div className="grow">
                    <div>
                      Правильно ли мы поняли, что вас беспокоит:{" "}
                      <strong>{guess.join(", ").toLowerCase()}</strong>?
                    </div>
                    <div className="row" style={{ marginTop: 10 }}>
                      <button
                        className="btn small"
                        onClick={() => {
                          const merged = [
                            ...quiz.topics.filter((t) => t !== UNSURE),
                            ...guess.filter((g) => !quiz.topics.includes(g)),
                          ].slice(0, MAX_TOPICS);
                          setQuiz({ ...quiz, topics: merged });
                          setGuess(null);
                          setStoryChecked(true);
                        }}
                      >
                        Да, отметить
                      </button>
                      <button className="btn secondary small" onClick={() => setGuess(null)}>
                        Нет, выберу сам
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {TOPIC_GROUPS.map((group) => (
              <div key={group.title}>
                <div className="queue-title" style={{ marginTop: 6 }}>
                  {group.title}
                </div>
                <div className="chips" style={{ marginBottom: 8 }}>
                  {group.topics.map((topic) => (
                    <button
                      key={topic}
                      className={`chip ${quiz.topics.includes(topic) ? "on" : ""}`}
                      aria-pressed={quiz.topics.includes(topic)}
                      onClick={() => toggleTopic(topic)}
                    >
                      {topic}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="chips">
              <button
                className={`chip ${quiz.topics.includes(UNSURE) ? "on" : ""}`}
                aria-pressed={quiz.topics.includes(UNSURE)}
                onClick={() => toggleTopic(UNSURE)}
              >
                {UNSURE}
              </button>
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
            <h2>С кем вам будет комфортнее?</h2>
            <p>Метод работы, язык и образование можно уточнить потом в каталоге.</p>
            <div className="queue-title">Пол специалиста</div>
            <OptionRow
              options={GENDER_OPTIONS}
              value={quiz.gender}
              onChange={(gender) => setQuiz({ ...quiz, gender })}
            />
            <div className="queue-title">Возраст специалиста</div>
            <OptionRow
              options={AGE_OPTIONS}
              value={quiz.age}
              onChange={(age) => setQuiz({ ...quiz, age })}
            />
            <div className="queue-title">Комфортная цена за сессию</div>
            <OptionRow
              options={BUDGET_OPTIONS}
              value={quiz.budget}
              onChange={(budget) => setQuiz({ ...quiz, budget })}
            />
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
                setStep(selected && slot ? "checkout" : fromQuiz ? "quiz3" : "landing");
              }}
            >
              ← Назад
            </button>
            <h2>
              {selected && slot
                ? "Войдите, чтобы оплатить"
                : fromQuiz
                  ? "Сохраните подборку"
                  : "Вход в личный кабинет"}
            </h2>
            <p>
              {fromQuiz
                ? `Мы нашли ${matches.filter((m) => m.queue < 4).length || matches.length} подходящих специалистов. Войдите, чтобы увидеть подборку.`
                : "Войдите по номеру телефона или через Google, Apple, Telegram."}
            </p>
            {phoneInput}
            {error && <p className="error">{error}</p>}
            <button
              className="btn"
              onClick={async () => {
                if (await sendCode()) setStep("otp");
              }}
            >
              Получить код
            </button>
            <p className="hint" style={{ marginTop: 10 }}>
              Код пришлём в WhatsApp или Telegram, если их нет — по SMS. Номер проверяем один
              раз, дальше вход без кода.
            </p>
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
              В прототипе вход через сервисы срабатывает сразу. Телефон попросим после первой
              оплаты — чтобы можно было восстановить доступ.
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
              Отправили код в <strong>{OTP_CHANNELS[otpChannel]}</strong> на +7 {phone}. В
              прототипе код всегда {otpHint}.
            </p>
            {otpInputs}
            {error && <p className="error">{error}</p>}
            <button className="btn" onClick={verify}>
              Войти
            </button>
            {otpNext && (
              <button
                className="link-btn"
                style={{ marginTop: 14 }}
                onClick={() => sendCode(otpChannel)}
              >
                Не пришёл? Отправить {otpNext === "sms" ? "по SMS" : `в ${OTP_CHANNELS[otpNext]}`}
              </button>
            )}
          </div>
        )}

        {step === "addPhone" && user && (
          <div className="screen">
            <span className="eyebrow">Последний шаг</span>
            <h2>Оставьте номер телефона</h2>
            <p>
              По нему восстановим доступ, если потеряете вход через{" "}
              {PROVIDERS.find((p) => p.id === user.provider)?.label ?? "сервис"}, и напомним о
              сессии. Подтвердим один раз.
            </p>
            {phoneInput}
            {attachSent && (
              <>
                <p className="hint" style={{ marginBottom: 0 }}>
                  Код отправлен в {OTP_CHANNELS[otpChannel]}. В прототипе — {otpHint}.
                </p>
                {otpInputs}
              </>
            )}
            {error && <p className="error">{error}</p>}
            {attachSent ? (
              <button className="btn" onClick={attachPhone}>
                Подтвердить
              </button>
            ) : (
              <button
                className="btn"
                onClick={async () => {
                  if (await sendCode()) setAttachSent(true);
                }}
              >
                Получить код
              </button>
            )}
            <button className="btn ghost mt-auto" onClick={openCabinet}>
              Позже
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
                <p className="hint" style={{ marginBottom: 0 }}>
                  Самые подходящие по анкете. Время выберете в календаре психолога.
                </p>
              </div>
            </div>

            {hot.length > 0 && (
              <>
                <div className="queue-title hot-title">
                  Горящие окна · −{HOT_DISCOUNT * 100}%
                </div>
                <div className="hot-strip">
                  {hot.map(({ psy, slot: offer }) => (
                    <div key={psy.id} className="hot-card">
                      <div className="row" style={{ alignItems: "center" }}>
                        <Avatar name={psy.name} src={psy.photo} size="small" />
                        <strong className="grow">{psy.name}</strong>
                      </div>
                      <span className="hint">{offer.label}</span>
                      <span>
                        <s className="hint">{formatMoney(psy.price)}</s>{" "}
                        <strong className="hot-price">
                          {formatMoney(slotPrice(psy.price, offer.startsAt))}
                        </strong>
                      </span>
                      <button
                        className="btn small"
                        onClick={() => {
                          setSelected(psy);
                          setSlot(offer);
                          setSlotBack("matches");
                          setStep("checkout");
                        }}
                      >
                        Записаться
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {grouped.map(([queue, list]) => (
              <div key={queue}>
                <div className="queue-title">{QUEUE_TITLES[queue]}</div>
                {list.map((psy) => (
                  <PsyCard
                    key={psy.id}
                    psy={psy}
                    reason={psy.queue > 1 ? psy.reason : undefined}
                    highlight={quiz.topics}
                    nearest={psy.id in nearest ? nearest[psy.id] : undefined}
                    favorite={favorites.includes(psy.id)}
                    onFavorite={() => toggleFavorite(psy.id)}
                    onPick={() => pickPsychologist(psy, "matches")}
                  />
                ))}
              </div>
            ))}

            <button
              className="see-all"
              onClick={() => {
                setCatalogBack("matches");
                setCatalogFavOnly(false);
                setStep("catalog");
              }}
            >
              <strong>Посмотреть всех специалистов</strong>
              <span className="hint">
                Каталог с фильтрами по языку, цене и методу, избранное и сравнение →
              </span>
            </button>
          </div>
        )}

        {step === "slot" && selected && (
          <SlotPicker
            psy={selected}
            title="Выберите дату и время"
            actionLabel="Перейти к оплате"
            error={slotError}
            onBack={() => (slotBack === "cabinet" ? openCabinet() : setStep(slotBack))}
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
            title="Перенос сессии"
            actionLabel="Перенести сюда"
            showPrice={false}
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

        {step === "therapistLogin" && (
          <div className="screen">
            <button className="back" onClick={() => setStep("landing")}>
              ← На главную
            </button>
            <h2>Вход для психологов</h2>
            <p>
              Аккаунт психолога открывает платформа после проверки дипломов — по приглашению.
              Самостоятельной регистрации специалистов нет.
            </p>
            <div className="card static">
              <div className="hint">Приглашение для демо</div>
              <strong>Анна Смирнова · КПТ, гештальт</strong>
            </div>
            <button className="btn" onClick={enterTherapist}>
              Войти по приглашению
            </button>
            <p className="hint" style={{ marginTop: 14 }}>
              Хотите пройти терапию сами? В кабинете психолога есть отдельный клиентский
              аккаунт — под тем же входом.
            </p>
          </div>
        )}

        {step === "therapist" && therapist && (
          <PsychologistCabinet
            psy={therapist}
            onLogout={logout}
            onClientAccount={openClientAccount}
            onEnterRoom={(booking, peerName) => {
              setRoom({ booking, role: "psychologist", peerName });
              setStep("video");
            }}
          />
        )}

        {step === "checkout" && selected && slot && (
          <div className="screen" style={{ overflowY: "auto" }}>
            <button className="back" onClick={() => setStep("slot")}>
              ← Изменить время
            </button>
            <h2>Оформление сессии</h2>
            <p>
              {selected.name} · {slot.label}
            </p>
            <div className="queue-title" style={{ marginTop: 0 }}>
              Чем оплатить
            </div>
            {PAYMENT_OPTIONS.map((option) => (
              <button
                key={option.id}
                className={`choice pay-option ${method === option.id ? "on" : ""}`}
                aria-pressed={method === option.id}
                onClick={() => setMethod(option.id)}
              >
                <strong>{option.label}</strong>
                <div className="hint">{option.hint}</div>
              </button>
            ))}
            <div className="card static">
              <div className="header">
                <span>Сессия 50 мин</span>
                <span>{formatMoney(selected.price)}</span>
              </div>
              {hotDiscount > 0 && (
                <div className="header">
                  <span>Горящее окно</span>
                  <span className="hot-price">−{formatMoney(hotDiscount)}</span>
                </div>
              )}
              {discount > 0 && (
                <div className="header">
                  <span>Скидка на первую</span>
                  <span>−{formatMoney(discount)}</span>
                </div>
              )}
              <div className="header" style={{ marginBottom: 0 }}>
                <strong>Итого</strong>
                <strong>{formatMoney(total)}</strong>
              </div>
            </div>
            <p className="hint">
              Отмена и перенос бесплатно, если до сессии больше 24 часов.
            </p>
            <button className="btn mt-auto" onClick={pay} disabled={paying}>
              {paying
                ? "Ждём подтверждения банка…"
                : user
                  ? `Оплатить ${formatMoney(total)}`
                  : "Войти и оплатить"}
            </button>
          </div>
        )}

        {step === "paid" && paidBooking && (
          <div className="screen">
            <h2>Сессия оплачена</h2>
            <p>Запись добавлена в личный кабинет.</p>
            <BookingCard booking={paidBooking} />
            <button className="btn mt-auto" onClick={afterPaid}>
              Перейти в личный кабинет
            </button>
          </div>
        )}

        {step === "cabinet" && user && (
          <Cabinet
            user={user}
            bookings={bookings}
            quiz={savedQuiz}
            favorites={favorites}
            onBookWith={(psy) => pickPsychologist(psy, "cabinet")}
            onFindPsychologist={() => {
              setFromCabinet(true);
              setStep(fromQuiz ? "matches" : "quiz1");
            }}
            onOpenFavorites={() => {
              setCatalogBack("cabinet");
              setCatalogFavOnly(true);
              setStep("catalog");
            }}
            onAddPhone={() => {
              setPhone("");
              setAttachSent(false);
              setError("");
              setStep("addPhone");
            }}
            onSwitchToTherapist={() => {
              setNotice("");
              if (therapist) setStep("therapist");
              else enterTherapist();
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

/** Ряд вариантов ответа, которые листаются по горизонтали. */
function OptionRow<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: [T, string][];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="option-row" role="radiogroup">
      {options.map(([id, label]) => (
        <button
          key={String(id)}
          role="radio"
          aria-checked={value === id}
          className={`choice ${value === id ? "on" : ""}`}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
