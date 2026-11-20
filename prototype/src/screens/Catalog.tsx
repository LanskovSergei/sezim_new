import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { Avatar } from "../components/Avatar";
import { TOPICS, psychologists } from "../data/psychologists";
import { formatMoney } from "../lib/labels";
import { nearestSlot } from "../lib/slot";
import type { Psychologist, Quiz, Slot } from "../types";

type Sort = "rating" | "price" | "experience";

type Props = {
  quiz: Quiz;
  onBack: () => void;
  backLabel: string;
  onPick: (psy: Psychologist) => void;
};

const SORTS: [Sort, string][] = [
  ["rating", "Рейтинг"],
  ["price", "Цена"],
  ["experience", "Опыт"],
];

/** Все специалисты с фильтром по теме и ближайшим свободным окном. */
export function Catalog({ quiz, onBack, backLabel, onPick }: Props) {
  const [topic, setTopic] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("rating");
  const [nearest, setNearest] = useState<Record<string, Slot | null>>({});

  useEffect(() => {
    let active = true;
    Promise.all(
      psychologists.map(async (psy) => {
        const [taken, schedule] = await Promise.all([api.takenSlots(psy.id), api.schedule(psy.id)]);
        return [psy.id, nearestSlot(psy, quiz, taken, schedule)] as const;
      }),
    ).then((pairs) => {
      if (active) setNearest(Object.fromEntries(pairs));
    });
    return () => {
      active = false;
    };
  }, [quiz]);

  const list = useMemo(() => {
    const filtered = psychologists.filter((p) => !topic || p.topics.includes(topic));
    return [...filtered].sort((a, b) => {
      if (sort === "price") return a.price - b.price;
      if (sort === "experience") return b.experienceYears - a.experienceYears;
      return b.rating - a.rating || b.reviews - a.reviews;
    });
  }, [topic, sort]);

  return (
    <div className="screen" style={{ overflowY: "auto" }}>
      <button className="back" onClick={onBack}>
        ← {backLabel}
      </button>
      <h2>Все специалисты</h2>
      <p className="hint">
        {psychologists.length} психологов · документы и дипломы проверены
      </p>

      <div className="chips scroll-x">
        <button className={`chip ${topic === null ? "on" : ""}`} onClick={() => setTopic(null)}>
          Все темы
        </button>
        {TOPICS.map((t) => (
          <button key={t} className={`chip ${topic === t ? "on" : ""}`} onClick={() => setTopic(t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="seg" role="group" aria-label="Сортировка">
        {SORTS.map(([id, label]) => (
          <button key={id} className={sort === id ? "on" : ""} onClick={() => setSort(id)}>
            {label}
          </button>
        ))}
      </div>

      {list.length === 0 && <p>По этой теме специалистов пока нет.</p>}
      {list.map((psy) => {
        const slot = nearest[psy.id];
        return (
          <div key={psy.id} className="card static">
            <div className="row" style={{ alignItems: "center", marginBottom: 10 }}>
              <Avatar name={psy.name} src={psy.photo} />
              <div className="grow">
                <strong>{psy.name}</strong>
                <div className="hint">
                  {psy.method} · {psy.experienceYears} лет · ★ {psy.rating.toFixed(1)} ({psy.reviews})
                </div>
              </div>
            </div>
            {psy.topics.slice(0, 3).map((t) => (
              <span key={t} className="badge">
                {t}
              </span>
            ))}
            <div className="hint" style={{ margin: "8px 0 0" }}>
              {psy.id in nearest
                ? slot
                  ? `Ближайшее окно: ${slot.label}`
                  : "Свободных окон в ближайшие недели нет"
                : "Ищем ближайшее окно…"}
            </div>
            <div className="header" style={{ marginTop: 12, marginBottom: 0 }}>
              <strong>{formatMoney(psy.price)}</strong>
              <button className="btn small" onClick={() => onPick(psy)} disabled={slot === null}>
                Выбрать время
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
