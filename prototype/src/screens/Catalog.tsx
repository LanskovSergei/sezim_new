import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { Avatar } from "../components/Avatar";
import { PsyCard } from "../components/PsyCard";
import { TOPICS, psychologists } from "../data/psychologists";
import {
  AGE_OPTIONS,
  BUDGET_OPTIONS,
  GENDER_OPTIONS,
  LANGUAGE_LABELS,
  formatMoney,
  years,
} from "../lib/labels";
import { ageFits, budgetFits } from "../lib/match";
import { nearestSlot } from "../lib/slot";
import type { AgeBand, Budget, Gender, Language, Psychologist, Quiz, Slot } from "../types";

type Sort = "rating" | "price" | "experience";

type Props = {
  /** Анкета клиента: из неё берём стартовые фильтры. */
  quiz: Quiz | null;
  favorites: string[];
  onFavorite: (psychologistId: string) => void;
  /** Открыть сразу с фильтром «Избранное». */
  onlyFavorites?: boolean;
  onBack: () => void;
  backLabel: string;
  onPick: (psy: Psychologist) => void;
};

const SORTS: [Sort, string][] = [
  ["rating", "Рейтинг"],
  ["price", "Цена"],
  ["experience", "Опыт"],
];

const MAX_COMPARE = 3;

/** Каталог: фильтры по языку, полу, возрасту и цене, избранное и сравнение. */
export function Catalog({
  quiz,
  favorites,
  onFavorite,
  onlyFavorites = false,
  onBack,
  backLabel,
  onPick,
}: Props) {
  const [topic, setTopic] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language | "any">("any");
  const [gender, setGender] = useState<Gender>(quiz?.gender ?? "any");
  const [age, setAge] = useState<AgeBand>(quiz?.age ?? "any");
  const [budget, setBudget] = useState<Budget>(quiz?.budget ?? "any");
  const [favOnly, setFavOnly] = useState(onlyFavorites);
  const [sort, setSort] = useState<Sort>("rating");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [nearest, setNearest] = useState<Record<string, Slot | null>>({});

  useEffect(() => {
    let active = true;
    Promise.all(
      psychologists.map(async (psy) => {
        const [taken, schedule] = await Promise.all([api.takenSlots(psy.id), api.schedule(psy.id)]);
        return [psy.id, nearestSlot(psy, taken, schedule)] as const;
      }),
    ).then((pairs) => {
      if (active) setNearest(Object.fromEntries(pairs));
    });
    return () => {
      active = false;
    };
  }, []);

  const list = useMemo(() => {
    const filtered = psychologists.filter(
      (p) =>
        (!topic || p.topics.includes(topic)) &&
        (language === "any" || p.languages.includes(language)) &&
        (gender === "any" || p.gender === gender) &&
        ageFits(p, age) &&
        budgetFits(p, budget) &&
        (!favOnly || favorites.includes(p.id)),
    );
    return [...filtered].sort((a, b) => {
      if (sort === "price") return a.price - b.price;
      if (sort === "experience") return b.experienceYears - a.experienceYears;
      return b.rating - a.rating || b.reviews - a.reviews;
    });
  }, [topic, language, gender, age, budget, favOnly, favorites, sort]);

  const activeFilters =
    Number(language !== "any") +
    Number(gender !== "any") +
    Number(age !== "any") +
    Number(budget !== "any");

  function resetFilters() {
    setTopic(null);
    setLanguage("any");
    setGender("any");
    setAge("any");
    setBudget("any");
    setFavOnly(false);
  }

  function toggleCompare(id: string) {
    setCompare((ids) =>
      ids.includes(id)
        ? ids.filter((x) => x !== id)
        : ids.length >= MAX_COMPARE
          ? ids
          : [...ids, id],
    );
  }

  if (comparing) {
    return (
      <Compare
        list={psychologists.filter((p) => compare.includes(p.id))}
        nearest={nearest}
        onBack={() => setComparing(false)}
        onPick={onPick}
      />
    );
  }

  return (
    <div className="screen catalog" style={{ overflowY: "auto" }}>
      <button className="back" onClick={onBack}>
        ← {backLabel}
      </button>
      <h2>Все специалисты</h2>
      <p className="hint">
        {psychologists.length} психологов · документы и дипломы проверены
      </p>

      <div className="chips scroll-x">
        <button className={`chip ${favOnly ? "on" : ""}`} onClick={() => setFavOnly(!favOnly)}>
          ♥ Избранное{favorites.length > 0 ? ` · ${favorites.length}` : ""}
        </button>
        <button
          className={`chip ${filtersOpen || activeFilters > 0 ? "on" : ""}`}
          onClick={() => setFiltersOpen(!filtersOpen)}
          aria-expanded={filtersOpen}
        >
          Фильтры{activeFilters > 0 ? ` · ${activeFilters}` : ""}
        </button>
        <button className={`chip ${topic === null ? "on" : ""}`} onClick={() => setTopic(null)}>
          Все темы
        </button>
        {TOPICS.map((t) => (
          <button key={t} className={`chip ${topic === t ? "on" : ""}`} onClick={() => setTopic(t)}>
            {t}
          </button>
        ))}
      </div>

      {filtersOpen && (
        <div className="card static filters">
          <Filter
            title="Язык сессии"
            options={[["any", "Любой"], ...(Object.entries(LANGUAGE_LABELS) as [Language, string][])]}
            value={language}
            onChange={setLanguage}
          />
          <Filter title="Пол" options={GENDER_OPTIONS} value={gender} onChange={setGender} />
          <Filter title="Возраст" options={AGE_OPTIONS} value={age} onChange={setAge} />
          <Filter title="Цена сессии" options={BUDGET_OPTIONS} value={budget} onChange={setBudget} />
          <button className="link-btn" onClick={resetFilters}>
            Сбросить все
          </button>
        </div>
      )}

      <div className="seg" role="group" aria-label="Сортировка">
        {SORTS.map(([id, label]) => (
          <button key={id} className={sort === id ? "on" : ""} onClick={() => setSort(id)}>
            {label}
          </button>
        ))}
      </div>

      {list.length === 0 && (
        <div className="card static">
          <p style={{ marginBottom: 10 }}>
            {favOnly && favorites.length === 0
              ? "В избранном пока никого. Нажмите ♡ на карточке, чтобы сохранить психолога."
              : "Никто не подходит под все фильтры сразу."}
          </p>
          <button className="btn secondary small" onClick={resetFilters}>
            Сбросить фильтры
          </button>
        </div>
      )}
      {list.map((psy) => (
        <PsyCard
          key={psy.id}
          psy={psy}
          highlight={quiz?.topics}
          nearest={psy.id in nearest ? nearest[psy.id] : undefined}
          favorite={favorites.includes(psy.id)}
          onFavorite={() => onFavorite(psy.id)}
          comparing={compare.includes(psy.id)}
          onCompare={() => toggleCompare(psy.id)}
          onPick={() => onPick(psy)}
        />
      ))}

      {compare.length > 0 && (
        <div className="compare-bar">
          <span className="grow">
            Для сравнения: {compare.length} из {MAX_COMPARE}
          </span>
          <button className="link-btn" onClick={() => setCompare([])}>
            Очистить
          </button>
          <button
            className="btn small"
            disabled={compare.length < 2}
            onClick={() => setComparing(true)}
          >
            Сравнить
          </button>
        </div>
      )}
    </div>
  );
}

function Filter<T extends string | number>({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: [T, string][];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="filter">
      <div className="hint">{title}</div>
      <div className="chips scroll-x">
        {options.map(([id, label]) => (
          <button
            key={String(id)}
            className={`chip ${value === id ? "on" : ""}`}
            onClick={() => onChange(id)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Сравнение 2–3 психологов по главным параметрам. */
function Compare({
  list,
  nearest,
  onBack,
  onPick,
}: {
  list: Psychologist[];
  nearest: Record<string, Slot | null>;
  onBack: () => void;
  onPick: (psy: Psychologist) => void;
}) {
  const rows: [string, (p: Psychologist) => string][] = [
    ["Цена", (p) => formatMoney(p.price)],
    ["Рейтинг", (p) => `★ ${p.rating.toFixed(1)} · ${p.reviews}`],
    ["Опыт", (p) => years(p.experienceYears)],
    ["Возраст", (p) => years(p.age)],
    ["Метод", (p) => p.method],
    ["Образование", (p) => p.education],
    ["Языки", (p) => p.languages.map((l) => LANGUAGE_LABELS[l]).join(", ")],
    ["Ближайшее окно", (p) => nearest[p.id]?.label ?? "нет окон"],
  ];
  const best = Math.min(...list.map((p) => p.price));

  return (
    <div className="screen" style={{ overflowY: "auto" }}>
      <button className="back" onClick={onBack}>
        ← К каталогу
      </button>
      <h2>Сравнение</h2>
      <div className="compare-scroll">
        <table className="compare">
          <thead>
            <tr>
              <th />
              {list.map((p) => (
                <th key={p.id}>
                  <Avatar name={p.name} src={p.photo} size="small" />
                  <span>{p.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([title, value]) => (
              <tr key={title}>
                <th scope="row">{title}</th>
                {list.map((p) => (
                  <td key={p.id} className={title === "Цена" && p.price === best ? "best" : ""}>
                    {value(p)}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th />
              {list.map((p) => (
                <td key={p.id}>
                  <button
                    className="btn small"
                    disabled={!nearest[p.id]}
                    onClick={() => onPick(p)}
                  >
                    Выбрать
                  </button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
