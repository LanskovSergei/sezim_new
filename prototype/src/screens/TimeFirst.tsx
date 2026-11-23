import { useEffect, useMemo, useState } from "react";
import { HOT_DISCOUNT, HOURS_BY_PART, PART_LABELS, isHot } from "../lib/availability";
import { plural } from "../lib/labels";
import { loadAvailability, poolDays } from "../lib/pool";
import type { Psychologist, Slot, TimeOfDay } from "../types";

type Props = {
  /** Подходящие по анкете психологи: считаем окна только у них. */
  list: Psychologist[];
  /** Окно, выбранное раньше, — открываем на нём. */
  initial?: Slot | null;
  backLabel?: string;
  onBack?: () => void;
  onPick: (slot: Slot) => void;
};

const PARTS: TimeOfDay[] = ["morning", "afternoon", "evening"];

function psyCount(n: number): string {
  return `${n} ${plural(n, ["психолог", "психолога", "психологов"])}`;
}

/** Шаг «Когда удобно»: общий календарь всех подходящих психологов. */
export function TimeFirst({ list, initial = null, backLabel, onBack, onPick }: Props) {
  const [days, setDays] = useState<ReturnType<typeof poolDays> | null>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [hour, setHour] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    loadAvailability(list).then((avail) => {
      if (!active) return;
      const next = poolDays(list, avail);
      setDays(next);
      const start = initial ? new Date(initial.startsAt) : null;
      const chosen = start
        ? next.findIndex((d) => d.date.toDateString() === start.toDateString())
        : -1;
      setDayIndex(chosen >= 0 ? chosen : Math.max(next.findIndex((d) => d.hours.length > 0), 0));
      setHour(chosen >= 0 && start ? start.getHours() : null);
    });
    return () => {
      active = false;
    };
  }, [list, initial]);

  const hot = useMemo(
    () =>
      (days ?? [])
        .flatMap((d) => d.hours)
        .filter((h) => isHot(h.slot.startsAt))
        // Сначала окна, где выбор психологов больше.
        .sort((a, b) => b.ids.length - a.ids.length || a.slot.startsAt.localeCompare(b.slot.startsAt))
        .slice(0, 8),
    [days],
  );

  const day = days?.[dayIndex];
  const picked = day?.hours.find((h) => h.hour === hour);

  return (
    <div className="screen" style={{ overflowY: "auto" }}>
      {onBack && (
        <button className="back" onClick={onBack}>
          ← {backLabel ?? "Назад"}
        </button>
      )}
      <h2>Когда вам удобно?</h2>
      <p className="hint">
        Выберите время — покажем психологов из вашей подборки, которые свободны именно тогда.
      </p>

      {!days && <p className="hint">Собираем расписание психологов…</p>}

      {hot.length > 0 && (
        <>
          <div className="queue-title hot-title" style={{ marginTop: 4 }}>
            Горящие окна · −{HOT_DISCOUNT * 100}%
          </div>
          <div className="time-strip">
            {hot.map((h) => (
              <button
                key={h.slot.startsAt}
                className={`time-chip hot ${picked?.slot.startsAt === h.slot.startsAt ? "on" : ""}`}
                onClick={() => {
                  const i = days!.findIndex((d) => d.hours.includes(h));
                  setDayIndex(i);
                  setHour(h.hour);
                }}
              >
                <strong>{h.slot.label}</strong>
                <span>{psyCount(h.ids.length)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {days && (
        <>
          <div className="queue-title">Дата</div>
          <div className="day-strip" role="listbox" aria-label="Дата">
            {days.map((d, i) => (
              <button
                key={d.date.toISOString()}
                className={`day ${i === dayIndex ? "on" : ""}`}
                disabled={d.hours.length === 0}
                aria-selected={i === dayIndex}
                onClick={() => {
                  setDayIndex(i);
                  setHour(null);
                }}
              >
                <span className="day-week">
                  {d.date.toLocaleDateString("ru-RU", { weekday: "short" })}
                </span>
                <span className="day-num">{d.date.getDate()}</span>
                <span className="day-free">{d.hours.length ? `${d.hours.length} ок.` : "—"}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {day && (
        <>
          <div className="queue-title">
            Время ·{" "}
            {day.date.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}
          </div>
          {day.hours.length === 0 && <p>В этот день свободных окон нет.</p>}
          {PARTS.map((part) => {
            const hours = day.hours.filter((h) => HOURS_BY_PART[part].includes(h.hour));
            if (hours.length === 0) return null;
            return (
              <div key={part} className="hours-group">
                <div className="hint">{PART_LABELS[part]}</div>
                <div className="hours">
                  {hours.map((h) => {
                    const hotHour = isHot(h.slot.startsAt);
                    return (
                      <button
                        key={h.hour}
                        className={`hour ${hour === h.hour ? "on" : ""} ${hotHour ? "hot" : ""}`}
                        aria-label={`${h.hour}:00, свободно ${psyCount(h.ids.length)}`}
                        onClick={() => setHour(h.hour)}
                      >
                        {String(h.hour).padStart(2, "0")}:00
                        <span className="count">
                          {hotHour && <small>−{HOT_DISCOUNT * 100}% · </small>}
                          {h.ids.length} псих.
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}

      <div className="pick-summary mt-auto">
        <span className="hint">
          {picked
            ? `${picked.slot.label} · ${picked.ids.length === 1 ? "свободен" : "свободны"} ${psyCount(picked.ids.length)}`
            : "Выберите дату и время"}
        </span>
        <button className="btn" disabled={!picked} onClick={() => picked && onPick(picked.slot)}>
          Показать психологов
        </button>
      </div>
    </div>
  );
}
