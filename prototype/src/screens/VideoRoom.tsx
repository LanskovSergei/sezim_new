import { useEffect, useRef, useState } from "react";
import type { Booking, Psychologist } from "../types";

type Stage = "check" | "waiting" | "call" | "ended";
/** Где показывать своё видео, если клиент его включил. */
type Pip = "top-right" | "bottom-right" | "bottom-left";

const PIP_OPTIONS: [Pip, string][] = [
  ["top-right", "Справа вверху"],
  ["bottom-right", "Справа внизу"],
  ["bottom-left", "Слева внизу"],
];

type Props = {
  booking: Booking;
  psy: Psychologist | undefined;
  /** Кто входит: клиент или психолог. От этого зависит экран после звонка. */
  role: "client" | "psychologist";
  /** Как зовут собеседника. */
  peerName: string;
  onExit: () => void;
  onRate: (rating: number) => void;
};

const CHECKS = [
  ["Камера", "HD 720p, изображение есть"],
  ["Микрофон", "Голос слышно"],
  ["Сеть", "Задержка 42 мс, скорость 18 Мбит/с"],
] as const;

/** Демо видеосессии: проверка связи, зал ожидания, звонок и итог. */
export function VideoRoom({ booking, psy, role, peerName, onExit, onRate }: Props) {
  const [stage, setStage] = useState<Stage>("check");
  const [checked, setChecked] = useState(0);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [poorNetwork, setPoorNetwork] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [rating, setRating] = useState(0);
  // По умолчанию собеседник на весь экран, себя не видно: так легче не отвлекаться.
  const [showSelf, setShowSelf] = useState(false);
  const [pip, setPip] = useState<Pip>("top-right");
  const [split, setSplit] = useState(false);
  const [settings, setSettings] = useState(false);
  const roomRef = useRef<HTMLDivElement>(null);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    } else {
      roomRef.current?.requestFullscreen?.().catch(() => undefined);
    }
  }

  // Проверки связи «проходят» по очереди.
  useEffect(() => {
    if (stage !== "check" || checked >= CHECKS.length) return;
    const timer = setTimeout(() => setChecked((n) => n + 1), 700);
    return () => clearTimeout(timer);
  }, [stage, checked]);

  // Собеседник подключается через пару секунд.
  useEffect(() => {
    if (stage !== "waiting") return;
    const timer = setTimeout(() => {
      setStartedAt(Date.now());
      setStage("call");
    }, 1800);
    return () => clearTimeout(timer);
  }, [stage]);

  useEffect(() => {
    if (stage !== "call") return;
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [stage, startedAt]);

  const clock = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const peerInitials = peerName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
  const controls = (
    <div className="room-controls">
      <button
        className={`room-btn ${mic ? "" : "off"}`}
        onClick={() => setMic(!mic)}
        aria-label={mic ? "Выключить микрофон" : "Включить микрофон"}
      >
        {mic ? "Микр." : "Микр. выкл"}
      </button>
      <button
        className={`room-btn ${cam ? "" : "off"}`}
        onClick={() => setCam(!cam)}
        aria-label={cam ? "Выключить камеру" : "Включить камеру"}
      >
        {cam ? "Камера" : "Кам. выкл"}
      </button>
    </div>
  );

  if (stage === "check") {
    const ready = checked >= CHECKS.length;
    return (
      <div className="screen" style={{ overflowY: "auto" }}>
        <button className="back" onClick={onExit}>
          ← В кабинет
        </button>
        <h2>Проверим связь</h2>
        <p>
          Сессия с {peerName} · {booking.slotLabel}
        </p>
        <div className="room room-preview">
          <div className="room-stage">
            <span className="room-avatar">{cam ? "Вы" : "Камера выключена"}</span>
          </div>
          {controls}
        </div>
        <div className="card static">
          {CHECKS.map(([title, ok], i) => (
            <div key={title} className="check-row">
              <span className={`dot ${i < checked ? "ok" : i === checked ? "wait" : ""}`} />
              <div className="grow">
                <strong>{title}</strong>
                <div className="hint">{i < checked ? ok : "Проверяем…"}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="hint">
          В комнате собеседник будет на весь экран, а своё видео по умолчанию скрыто — его
          можно включить кнопкой «Вид». Сессия не записывается, связь зашифрована. В прототипе комната открыта сразу; в
          продукте — за 10 минут до начала.
        </p>
        <button className="btn mt-auto" disabled={!ready} onClick={() => setStage("waiting")}>
          Войти в комнату
        </button>
      </div>
    );
  }

  if (stage === "ended") {
    return (
      <div className="screen">
        <h2>Сессия завершена</h2>
        <p>
          {peerName} · длительность {clock}
        </p>
        {role === "client" ? (
          <>
            <p>Как прошла сессия? Оценку видят только психолог и модераторы.</p>
            <div className="stars" role="radiogroup" aria-label="Оценка">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  className={rating >= n ? "on" : ""}
                  aria-label={`${n} из 5`}
                  onClick={() => setRating(n)}
                >
                  ★
                </button>
              ))}
            </div>
            <button
              className="btn mt-auto"
              disabled={rating === 0}
              onClick={() => onRate(rating)}
            >
              Отправить оценку
            </button>
            <button className="btn ghost" style={{ marginTop: 10 }} onClick={onExit}>
              Пропустить
            </button>
          </>
        ) : (
          <>
            <div className="card static">
              Факт входа обоих участников зафиксирован. Начисление{" "}
              <strong>{Math.round((psy?.price ?? booking.amount) * 0.8).toLocaleString("ru-RU")} ₽</strong>{" "}
              появится во вкладке «Выплаты» после окончания срока споров.
            </div>
            <button className="btn mt-auto" onClick={onExit}>
              В кабинет психолога
            </button>
          </>
        )}
      </div>
    );
  }

  const self = <span>{cam ? "Вы" : "Камера выкл."}</span>;

  return (
    <div className="room room-full" ref={roomRef}>
      <div className="room-top">
        <strong>{peerName}</strong>
        <span className="room-meta">
          {stage === "call" ? clock : "Подключение…"}
          <span className={`signal ${poorNetwork ? "poor" : ""}`} aria-label="Качество связи">
            <i />
            <i />
            <i />
            <i />
          </span>
        </span>
      </div>
      <div className={`room-stage ${split && stage === "call" ? "split" : ""}`}>
        {stage === "waiting" && (
          <div className="room-center">
            <span className="room-avatar">{peerInitials}</span>
            <strong>{peerName} подключается…</strong>
            <span className="room-hint">Вы в зале ожидания</span>
          </div>
        )}
        {stage === "call" && poorNetwork && (
          <>
            <div className="room-banner">
              Слабое соединение: перешли на звук, чтобы разговор не прерывался. Видео
              вернётся само.
            </div>
            <div className="room-center">
              <span className="room-avatar">{peerInitials}</span>
              <div className="wave" aria-hidden="true">
                {Array.from({ length: 7 }, (_, i) => (
                  <i key={i} style={{ animationDelay: `${i * 0.12}s` }} />
                ))}
              </div>
            </div>
          </>
        )}
        {stage === "call" && !poorNetwork && (
          <div className="room-center">
            <span className="room-avatar big">{peerInitials}</span>
            <span className="room-hint">Видео собеседника на весь экран</span>
          </div>
        )}
        {stage === "call" && split && <div className="room-self">{self}</div>}
        {!split && showSelf && <div className={`room-pip ${pip}`}>{self}</div>}
      </div>
      {settings && (
        <div className="room-settings" role="dialog" aria-label="Вид">
          <label className="room-toggle">
            <input
              type="checkbox"
              checked={showSelf}
              onChange={(e) => setShowSelf(e.target.checked)}
            />
            Показывать моё видео
          </label>
          {showSelf && !split && (
            <div className="room-seg" role="group" aria-label="Где показывать">
              {PIP_OPTIONS.map(([id, label]) => (
                <button key={id} className={pip === id ? "on" : ""} onClick={() => setPip(id)}>
                  {label}
                </button>
              ))}
            </div>
          )}
          <label className="room-toggle">
            <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
            Разделить экран пополам
          </label>
          <label className="room-toggle">
            <input
              type="checkbox"
              checked={poorNetwork}
              onChange={(e) => setPoorNetwork(e.target.checked)}
            />
            Имитировать плохую сеть (для показа)
          </label>
        </div>
      )}
      <div className="room-bottom">
        {controls}
        <button
          className={`room-btn ${settings ? "active" : ""}`}
          aria-expanded={settings}
          onClick={() => setSettings(!settings)}
        >
          Вид
        </button>
        <button className="room-btn" onClick={toggleFullscreen} aria-label="Полный экран">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </svg>
        </button>
        <button className="room-btn end" onClick={() => setStage("ended")}>
          Завершить
        </button>
      </div>
    </div>
  );
}
