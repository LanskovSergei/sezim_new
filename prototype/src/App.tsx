import { useMemo, useState } from "react";
import { TOPICS } from "./data/psychologists";
import { api } from "./api/client";
import type {
  DayPart,
  Format,
  Gender,
  Horizon,
  Language,
  MatchResult,
  PaymentMethod,
  Quiz,
  TimeOfDay,
} from "./types";

type Step =
  | "landing"
  | "quiz1"
  | "quiz2"
  | "quiz3"
  | "auth"
  | "otp"
  | "dashboard"
  | "checkout"
  | "success";

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
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", ""]);
  const [otpHint, setOtpHint] = useState("1111");
  const [error, setError] = useState("");
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [selected, setSelected] = useState<MatchResult | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("rf_card");
  const [slotLabel, setSlotLabel] = useState("14 ноября, 19:00");

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
    setStep("auth");
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
      await api.verify(phone.replace(/\D/g, ""), otp.join(""));
      setStep("dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка входа");
    }
  }

  async function pay() {
    if (!selected) return;
    await api.checkout({
      psychologistId: selected.id,
      psychologistName: selected.name,
      slotLabel,
      amount: selected.price - 500,
      method,
    });
    setStep("success");
  }

  return (
    <div className="app-shell">
      <div className="phone">
        {step === "landing" && (
          <div className="screen">
            <p className="hint">Прототип психологи · данные в localStorage</p>
            <h1>Личный кабинет как центр</h1>
            <p>
              Сначала анкета и подбор, потом вход по телефону, затем запись и оплата.
              Код подтверждения в прототипе: 1111.
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
          </div>
        )}

        {step === "quiz1" && (
          <div className="screen">
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
          <div className="screen">
            <button className="back" onClick={() => setStep("landing")}>
              ← Назад
            </button>
            <h2>Сохраните подборку</h2>
            <p>
              Мы нашли {matches.length || "несколько"} специалистов. Введите номер,
              чтобы открыть личный кабинет.
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
            <p className="hint" style={{ marginTop: 16 }}>
              Позже сюда встанет каскад Telegram → WhatsApp → SMS.
            </p>
          </div>
        )}

        {step === "otp" && (
          <div className="screen">
            <button className="back" onClick={() => setStep("auth")}>
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

        {step === "dashboard" && (
          <div className="screen" style={{ overflowY: "auto" }}>
            <div className="header">
              <div>
                <h2>Личный кабинет</h2>
                <p className="hint">Баланс: 0 сессий · {phone}</p>
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
                          setSlotLabel(
                            psy.slots.some((slot) => quiz.times.includes(slot))
                              ? quiz.times.includes("evening")
                                ? "14 ноября, 19:00"
                                : quiz.times.includes("afternoon")
                                  ? "15 ноября, 14:00"
                                  : "15 ноября, 10:00"
                              : "Ближайшее окно: 15 ноября, 10:00",
                          );
                          setStep("checkout");
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

        {step === "checkout" && selected && (
          <div className="screen">
            <button className="back" onClick={() => setStep("dashboard")}>
              ← Назад
            </button>
            <h2>Оформление сессии</h2>
            <p>
              {selected.name} · {slotLabel}
            </p>
            {(
              [
                ["rf_card", "Карта РФ"],
                ["cis_card", "Карта СНГ (Kaspi, Payme)"],
                ["crypto", "USDT / USDC"],
              ] as [PaymentMethod, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                className={`choice pay-option ${method === id ? "on" : ""}`}
                onClick={() => setMethod(id)}
              >
                {label}
              </button>
            ))}
            <div className="card">
              <div className="header">
                <span>Сессия 50 мин</span>
                <span>{selected.price.toLocaleString("ru-RU")} ₽</span>
              </div>
              <div className="header">
                <span>Скидка на первую</span>
                <span>−500 ₽</span>
              </div>
              <div className="header" style={{ marginBottom: 0 }}>
                <strong>Итого</strong>
                <strong>{(selected.price - 500).toLocaleString("ru-RU")} ₽</strong>
              </div>
            </div>
            <button className="btn mt-auto" onClick={pay}>
              Оплатить
            </button>
          </div>
        )}

        {step === "success" && (
          <div className="screen success">
            <h2>Сессия оплачена</h2>
            <p>
              {selected?.name} · {slotLabel}. Ссылка на комнату появится в кабинете.
              Бронь сохранена в localStorage — это заглушка базы.
            </p>
            <button
              className="btn ghost"
              onClick={() => setStep("dashboard")}
            >
              Вернуться в кабинет
            </button>
          </div>
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
