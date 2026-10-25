"""Подбор психологов: жёсткие фильтры в SQL, ранжирование в Python."""

import logging
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from sqlalchemy import ColumnElement

from app.config import get_settings
from app.models import Gender, Psychologist, SessionFormat

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class MatchCriteria:
    """Нормализованные критерии подбора из анкеты."""

    format: SessionFormat
    topics: frozenset[str]
    languages: frozenset[str]
    gender: Gender | None = None
    max_price_kzt: int | None = None
    min_experience_years: int | None = None

    @classmethod
    def from_answers(cls, answers: Mapping[str, Any]) -> "MatchCriteria":
        """Строит критерии из сохранённых ответов анкеты.

        Args:
            answers: JSON ответов (как в QuestionnaireIn).

        Returns:
            MatchCriteria: Критерии подбора.
        """
        match answers.get("preferred_gender"):
            case "male" | "female" as value:
                gender: Gender | None = Gender(value)
            case None | "any":
                gender = None
            case other:
                logger.warning("Неизвестное значение пола в анкете: %r", other)
                gender = None

        return cls(
            format=SessionFormat(answers.get("format", SessionFormat.INDIVIDUAL.value)),
            topics=frozenset(answers.get("topics") or []),
            languages=frozenset(answers.get("languages") or ["ru"]),
            gender=gender,
            max_price_kzt=answers.get("max_price_kzt"),
            min_experience_years=answers.get("min_experience_years"),
        )

    def cache_key(self) -> list[object]:
        """Каноничное представление критериев для ключа кэша.

        Returns:
            list[object]: Сериализуемый список полей.
        """
        return [
            self.format.value,
            sorted(self.topics),
            sorted(self.languages),
            self.gender.value if self.gender else None,
            self.max_price_kzt,
            self.min_experience_years,
        ]

    def sql_filters(self) -> list[ColumnElement[bool]]:
        """Жёсткие фильтры для WHERE (используют GIN-индексы).

        Returns:
            list[ColumnElement[bool]]: Условия SQLAlchemy.
        """
        price_col = Psychologist.couple_price_kzt if self.format is SessionFormat.COUPLE else Psychologist.price_kzt
        filters: list[ColumnElement[bool]] = [
            Psychologist.is_active.is_(True),
            Psychologist.languages.overlap(sorted(self.languages)),
            price_col.is_not(None),
        ]
        if self.topics:
            filters.append(Psychologist.topics.overlap(sorted(self.topics)))
        if self.gender is not None:
            filters.append(Psychologist.gender == self.gender)
        if self.max_price_kzt is not None:
            filters.append(price_col <= self.max_price_kzt)
        if self.min_experience_years is not None:
            filters.append(Psychologist.experience_years >= self.min_experience_years)
        return filters


def score(psychologist: Psychologist, criteria: MatchCriteria) -> float:
    """Считает релевантность психолога анкете в диапазоне [0, 1].

    Args:
        psychologist: Профиль психолога.
        criteria: Критерии подбора.

    Returns:
        float: Итоговый балл.
    """
    settings = get_settings()
    topic_share = (
        len(criteria.topics & set(psychologist.topics)) / len(criteria.topics) if criteria.topics else 0.0
    )
    experience = min(psychologist.experience_years, 10) / 10
    rating = max(0.0, min(psychologist.rating, 5.0)) / 5
    total = (
        settings.weight_topics * topic_share
        + settings.weight_experience * experience
        + settings.weight_rating * rating
    )
    return round(total, 4)
