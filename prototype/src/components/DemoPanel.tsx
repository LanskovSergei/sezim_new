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
  "Подборка: горящие окна −15%, «Подробнее» — образование и отзывы, ♡",
  "«Посмотреть всех» → фильтры по языку и цене → отметить двоих → «Сравнить»",
  "Календарь психолога → оплата: карта РФ / СНГ / любая",
  "Кабинет: «Записаться к …» или «Другой психолог», дневник состояния",
  "«Войти в комнату»: психолог на весь экран, себя не видно, кнопка «Вид»",
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
