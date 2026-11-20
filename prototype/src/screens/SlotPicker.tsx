import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import {
  HOURS_BY_PART,
  PART_LABELS,
  bookingDays,
  freeHours,
  slotAt,
} from "../lib/availability";
import { formatMoney } from "../lib/labels";
import { Avatar } from "../components/Avatar";
import type { Psychologist, Slot, TimeOfDay } from "../types";

type Props = {
  psy: Psychologist;
  /** Время суток из анкеты — подсвечиваем как «удобно вам». */
  preferred: TimeOfDay[];
  title: string;
  actionLabel: string;
  /** Текущее время записи при переносе: его не предлагаем. */
  current?: string;
  error?: string;
  onBack: () => void;
  onPick: (slot: Slot) => void;
};

const PARTS: TimeOfDay[] = ["morning", "afternoon", "evening"];

/** Выбор даты и часа у конкретного психолога. Показывает только свободные окна. */
export function SlotPicker({
  psy,
  preferred,
  title,
  actionLabel,
  current,
  error,
  onBack,
  onPick,
}: Props) {
  const [taken, setTaken] = useState<Set<string> | null>(null);
  const [schedule, setSchedule] = useState<boolean[][] | null>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [hour, setHour] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([api.takenSlots(psy.id), api.schedule(psy.id)]).then(([set, grid]) => {
      if (!active) return;
      setSchedule(grid);
      setTaken(set);
    });
    return () => {
      active = false;
    };
  }, [psy.id]);

  const days = useMemo(() => {
    if (!taken) return [];
    const busy = new Set(taken);
    if (current) busy.add(current);
    return bookingDays(psy).map((date) => ({
      date,
      hours: freeHours(psy, date, busy, schedule),
    }));
  }, [psy, taken, current, schedule]);

  // Открываем первый день, где есть окно в удобное по анкете время.
  useEffect(() => {
    if (days.length === 0) return;
    const fit = days.findIndex((d) =>
      d.hours.some((h) => preferred.some((p) => HOURS_BY_PART[p].includes(h))),
    );
    const any = days.findIndex((d) => d.hours.length > 0);
    setDayIndex(fit >= 0 ? fit : Math.max(any, 0));
    setHour(null);
  }, [days, preferred]);

  const day = days[dayIndex];
  const slot = day && hour !== null ? slotAt(day.date, hour) : null;

  return (
    <div className="screen" style={{ overflowY: "auto" }}>
      <button className="back" onClick={onBack}>
        ← Назад
      </button>
      <h2>{title}</h2>
      <div className="row" style={{ alignItems: "center", marginBottom: 18 }}>
        <Avatar name={psy.name} src={psy.photo} size="small" />
        <div className="grow">
          <strong>{psy.name}</strong>
          <div className="hint">
            {psy.method} · {formatMoney(psy.price)} за 50 мин
          </div>
        </div>
      </div>

      {!taken && <p className="hint">Загружаем расписание…</p>}

      {taken && (
        <>
          <div className="queue-title" style={{ marginTop: 0 }}>
            Дата
          </div>
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
                <span className="day-free">
                  {d.hours.length ? `${d.hours.length} ок.` : "—"}
                </span>
              </button>
            ))}
          </div>

          {day && (
            <>
              <div className="queue-title">
                Время ·{" "}
                {day.date.toLocaleDateString("ru-RU", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </div>
              {day.hours.length === 0 && <p>В этот день свободных окон нет.</p>}
              {PARTS.map((part) => {
                const hours = day.hours.filter((h) => HOURS_BY_PART[part].includes(h));
                if (hours.length === 0) return null;
                return (
                  <div key={part} className="hours-group">
                    <div className="hint">
                      {PART_LABELS[part]}
                      {preferred.includes(part) && (
                        <span className="badge paid" style={{ marginLeft: 8 }}>
                          удобно по анкете
                        </span>
                      )}
                    </div>
                    <div className="hours">
                      {hours.map((h) => (
                        <button
                          key={h}
                          className={`hour ${hour === h ? "on" : ""}`}
                          onClick={() => setHour(h)}
                        >
                          {String(h).padStart(2, "0")}:00
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </>
      )}

      {error && <p className="error">{error}</p>}
      <div className="pick-summary mt-auto">
        <span className="hint">
          {slot ? slot.label : "Выберите дату и время"}
        </span>
        <button className="btn" disabled={!slot} onClick={() => slot && onPick(slot)}>
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
