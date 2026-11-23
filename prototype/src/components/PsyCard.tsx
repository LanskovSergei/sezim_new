import { useState } from "react";
import { Avatar } from "./Avatar";
import { reviewsFor } from "../data/psychologists";
import { FORMAT_LABELS, LANGUAGE_LABELS, formatMoney, plural, years } from "../lib/labels";
import type { Psychologist, Slot } from "../types";

type Props = {
  psy: Psychologist;
  /** Почему психолог в подборке не в первой очереди. */
  reason?: string;
  /** Темы клиента — подсвечиваем совпадения. */
  highlight?: string[];
  /** undefined — ещё ищем; null — окон нет. */
  nearest?: Slot | null;
  favorite: boolean;
  onFavorite: () => void;
  /** Отмечен для сравнения; undefined — сравнение на этом экране не показываем. */
  comparing?: boolean;
  onCompare?: () => void;
  onPick: () => void;
  /** Текст главной кнопки; по умолчанию «Выбрать время». */
  actionLabel?: string;
  /** Строка вместо «Ближайшее окно», например «Свободна в выбранное время». */
  note?: string;
  /** Посмотреть другие окна этого психолога. */
  onOtherTime?: () => void;
};

/** Карточка психолога: коротко в списке, по «Подробнее» — образование, языки, отзывы. */
export function PsyCard({
  psy,
  reason,
  highlight = [],
  nearest,
  favorite,
  onFavorite,
  comparing,
  onCompare,
  onPick,
  actionLabel = "Выбрать время",
  note,
  onOtherTime,
}: Props) {
  const [open, setOpen] = useState(false);
  const topics = [...psy.topics].sort(
    (a, b) => Number(highlight.includes(b)) - Number(highlight.includes(a)),
  );

  return (
    <div className="card static psy-card">
      <div className="row" style={{ alignItems: "center", marginBottom: 10 }}>
        <Avatar name={psy.name} src={psy.photo} />
        <div className="grow">
          <strong>{psy.name}</strong>
          <div className="hint">
            {psy.method} · опыт {years(psy.experienceYears)}
          </div>
          <div className="rating">
            ★ {psy.rating.toFixed(1)}{" "}
            <span className="hint">
              · {psy.reviews} {plural(psy.reviews, ["отзыв", "отзыва", "отзывов"])} · {years(psy.age)}
            </span>
          </div>
        </div>
        <button
          className={`fav ${favorite ? "on" : ""}`}
          aria-pressed={favorite}
          aria-label={favorite ? "Убрать из избранного" : "В избранное"}
          onClick={onFavorite}
        >
          {favorite ? "♥" : "♡"}
        </button>
      </div>

      {reason && <div className="warn">{reason}</div>}

      <div className="badges">
        {topics.slice(0, open ? topics.length : 3).map((t) => (
          <span key={t} className={`badge ${highlight.includes(t) ? "paid" : ""}`}>
            {t}
          </span>
        ))}
      </div>

      {open && (
        <div className="psy-more">
          <p>{psy.about}</p>
          <dl className="facts">
            <div>
              <dt>Образование</dt>
              <dd>{psy.education}</dd>
            </div>
            <div>
              <dt>Языки</dt>
              <dd>{psy.languages.map((l) => LANGUAGE_LABELS[l]).join(", ")}</dd>
            </div>
            <div>
              <dt>Форматы</dt>
              <dd>{psy.formats.map((f) => FORMAT_LABELS[f]).join(", ")}</dd>
            </div>
          </dl>
          <div className="queue-title" style={{ marginTop: 4 }}>
            Отзывы
          </div>
          {reviewsFor(psy).map((r) => (
            <blockquote key={r.text} className="review">
              <span className="review-stars" aria-label={`${r.rating} из 5`}>
                {"★".repeat(r.rating)}
              </span>
              {r.text}
              <cite>{r.author}</cite>
            </blockquote>
          ))}
        </div>
      )}
      <button className="link-btn" onClick={() => setOpen(!open)}>
        {open ? "Свернуть" : "Подробнее: образование, отзывы"}
      </button>

      <div className="hint" style={{ margin: "8px 0 0" }}>
        {note ??
          (nearest === undefined
            ? "Ищем ближайшее окно…"
            : nearest
              ? `Ближайшее окно: ${nearest.label}`
              : "Свободных окон в ближайшие недели нет")}
        {onOtherTime && (
          <>
            {" · "}
            <button className="link-btn inline" onClick={onOtherTime}>
              другое время
            </button>
          </>
        )}
      </div>
      <div className="header" style={{ marginTop: 12, marginBottom: 0, gap: 8 }}>
        <strong>{formatMoney(psy.price)}</strong>
        <div className="row" style={{ alignItems: "center" }}>
          {onCompare && (
            <label className="compare-check">
              <input type="checkbox" checked={!!comparing} onChange={onCompare} />
              Сравнить
            </label>
          )}
          <button className="btn small" onClick={onPick} disabled={!note && nearest === null}>
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
