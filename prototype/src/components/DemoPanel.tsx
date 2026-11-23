type Props = {
  /** Кем сейчас пользуется ведущий: гость, клиент или психолог. */
  where: string;
  onReset: () => void;
  onClient: () => void;
  onTherapist: () => void;
};

const SCENARIO = [
  "Анкета: «своими словами» → темы распознаются → пол, возраст, цена",
  "Вход: телефон, код 1111 в WhatsApp (или Google — телефон спросим после оплаты)",
  "«Когда вам удобно?»: сначала время, горящие окна −15%",
  "Психологи, свободные в это время; «Изменить» — перевыбрать окно",
  "«Подробнее» — образование и отзывы, ♡; «Посмотреть всех» → фильтры, сравнение",
  "«Записаться» → оплата: карта РФ / СНГ / любая",
  "Кабинет: «Записаться к …», дневник; «Войти в комнату» → психолог на весь экран, «Вид»",
  "«Кабинет психолога»: запись уже здесь; «Терапия для себя» — клиентский аккаунт",
];

/** Панель ведущего на показе: быстрые переходы и сброс демо-данных. Не часть продукта. */
export function DemoPanel({ where, onReset, onClient, onTherapist }: Props) {
  return (
    <aside className="demo-panel" aria-label="Режим показа">
      <div className="demo-head">
        <strong>Режим показа</strong>
        <span className="badge">Сейчас: {where}</span>
      </div>
      <div className="demo-actions">
        <button className="btn small" onClick={onClient}>
          Клиент с готовой подборкой
        </button>
        <button className="btn secondary small" onClick={onTherapist}>
          Кабинет психолога
        </button>
        <button className="btn ghost small" onClick={onReset}>
          Начать заново
        </button>
      </div>
      <ol className="demo-steps">
        {SCENARIO.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="hint" style={{ margin: 0 }}>
        Код входа — 1111. Данные хранятся только в этом браузере; «Начать заново» стирает всё.
      </p>
    </aside>
  );
}
