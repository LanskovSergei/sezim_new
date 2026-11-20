import type { ReactNode } from "react";
import { psychologists } from "../data/psychologists";
import { PAYMENT_LABELS, formatMoney } from "../lib/labels";
import type { Booking } from "../types";

type Props = {
  booking: Booking;
  /** Сессия уже прошла: другой статус и без подсказки про ссылку на комнату. */
  past?: boolean;
  /** Кнопки действий под карточкой. */
  children?: ReactNode;
};

export function BookingCard({ booking, past = false, children }: Props) {
  const psy = psychologists.find((p) => p.id === booking.psychologistId);
  return (
    <div className="card static">
      <div className="row" style={{ alignItems: "center", marginBottom: 10 }}>
        {psy && <img className="avatar" src={psy.photo} alt="" />}
        <div className="grow">
          <strong>{booking.psychologistName}</strong>
          {psy && <div className="hint">{psy.method}</div>}
        </div>
        <span className={`badge end ${past ? "" : "paid"}`}>
          {past ? "Прошла" : "Оплачено"}
        </span>
      </div>
      <div className="slot">{booking.slotLabel}</div>
      <div className="hint">
        Сессия 50 мин · {formatMoney(booking.amount)} · {PAYMENT_LABELS[booking.method]}
      </div>
      {!past && (
        <div className="hint" style={{ marginTop: 8 }}>
          Ссылка на комнату придёт за 15 минут до начала.
        </div>
      )}
      {children && <div className="card-actions">{children}</div>}
    </div>
  );
}
