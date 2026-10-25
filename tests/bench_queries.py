import asyncio, statistics, sys, time, uuid, random
sys.path.insert(0, "/mnt/user-data/outputs/sezim")
from datetime import timedelta
from sqlalchemy import select, func
from app.db import SessionFactory, engine
from app.models import Psychologist, User, Booking, BookingStatus, SessionFormat
from app.schemas import TimeWindow
from app.services.availability import availability_calendar, free_psychologists, psychologist_free_starts, utcnow
from app.services.matching import MatchCriteria
from app.services.booking import hold_slot
from app.errors import SlotUnavailableError

CRIT = [
    {"format": "individual", "topics": ["anxiety"], "languages": ["ru"]},
    {"format": "individual", "topics": ["burnout", "self_esteem"], "preferred_gender": "female", "max_price_kzt": 20000},
    {"format": "couple", "topics": ["relations", "family"], "languages": ["ru"]},
    {"format": "individual", "topics": ["grief"], "languages": ["kk"], "min_experience_years": 5},
]

async def timed(fn, n=20):
    xs = []
    for i in range(n):
        async with SessionFactory() as s:
            t = time.perf_counter(); r = await fn(s, i); xs.append((time.perf_counter() - t) * 1000)
    xs.sort()
    return statistics.median(xs), xs[int(len(xs) * 0.95) - 1], r

async def main():
    async with SessionFactory() as s:
        psy = (await s.scalars(select(Psychologist.id).limit(200))).all()
        pusers = (await s.scalars(select(Psychologist.user_id).limit(200))).all()
        clients = (await s.scalars(select(User.id).where(User.role == "client").offset(100).limit(500))).all()
    now = utcnow(); D = lambda i: now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=2 + i % 5)
    res = {}
    res["Календарь, 14 дней"] = await timed(lambda s, i: availability_calendar(s, MatchCriteria.from_answers(CRIT[i % 4]), now, now + timedelta(days=14)))
    res["Подборка на 1 вечер"] = await timed(lambda s, i: free_psychologists(s, MatchCriteria.from_answers(CRIT[i % 4]),
        [TimeWindow(starts_at=D(i) + timedelta(hours=13), ends_at=D(i) + timedelta(hours=16))]))
    res["Подборка на неделю"] = await timed(lambda s, i: free_psychologists(s, MatchCriteria.from_answers(CRIT[i % 4]),
        [TimeWindow(starts_at=now, ends_at=now + timedelta(days=7))]))
    res["Слоты психолога, 2 недели"] = await timed(lambda s, i: psychologist_free_starts(s, psy[i], SessionFormat.INDIVIDUAL, now, now + timedelta(days=14)))
    async def lk(s, i):
        return (await s.scalars(select(Booking).where(Booking.psychologist_id == psy[i], Booking.status == BookingStatus.CONFIRMED,
                Booking.starts_at >= now, Booking.starts_at < now + timedelta(days=7)).order_by(Booking.starts_at))).all()
    res["ЛК психолога: неделя"] = await timed(lk)
    async def hold(s, i):
        starts = await psychologist_free_starts(s, psy[50 + i], SessionFormat.INDIVIDUAL, now, now + timedelta(days=14))
        try: return await hold_slot(s, clients[i], psy[50 + i], starts[0], SessionFormat.INDIVIDUAL)
        except SlotUnavailableError: return None
    res["Холд (запись)"] = await timed(hold)
    for k, (p50, p95, r) in res.items():
        n = len(r) if isinstance(r, list) else ""
        print(f"{k:28s} p50={p50:7.1f} ms  p95={p95:7.1f} ms  {n}")
    await engine.dispose()
asyncio.run(main())
