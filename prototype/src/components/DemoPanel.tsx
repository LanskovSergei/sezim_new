type Props = {
  /** Кем сейчас пользуется ведущий: гость, клиент или психолог. */
  where: string;
  onReset: () => void;
  onClient: () => void;
  onTherapist: () => void;
};

const SCENARIO = [
  "Анкета → вход по коду 1111 → подборка по очередям",
  "«Выбрать время» → день и час → оплата",
  "Кабинет: «Перенести» на другой день",
  "«Войти в комнату» → звонок → плохая сеть → оценка",
  "«Чат» → написать психологу",
  "«Кабинет психолога»: запись уже здесь, ответить в чате",
  "Психолог открывает субботу в «Расписании» → клиент видит новые окна",
  "«Выплаты» → вывести",
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
