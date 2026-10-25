"""Нагрузочный тест через HTTP (ASGI): типичная сессия клиента = анкета → календарь → подборка → слоты."""
import asyncio, random, statistics, sys, time
sys.path.insert(0, "/mnt/user-data/outputs/sezim")
from datetime import timedelta
import httpx
from sqlalchemy import select
from app.main import app
from app.db import SessionFactory, engine
from app.models import Psychologist
from app.services.availability import utcnow

TOPICS = ['anxiety','depression','relations','burnout','self_esteem','grief','trauma','family']
lat: dict[str, list[float]] = {}

async def call(c, name, coro):
    t = time.perf_counter(); r = await coro; lat.setdefault(name, []).append((time.perf_counter() - t) * 1000)
    r.raise_for_status(); return r

async def user_session(c, psy):
    now = utcnow(); day = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=random.randint(1, 10))
    q = (await call(c, "анкета", c.post("/v1/questionnaires", json={"topics": random.sample(TOPICS, 2), "format": random.choice(["individual"] * 4 + ["couple"])}))).json()["id"]
    await call(c, "календарь 14 дн", c.get("/v1/availability", params={"questionnaire_id": q, "date_from": now.isoformat(), "date_to": (now + timedelta(days=14)).isoformat()}))
    await call(c, "подборка", c.post("/v1/matches", json={"questionnaire_id": q, "windows": [{"starts_at": (day + timedelta(hours=12)).isoformat(), "ends_at": (day + timedelta(hours=16)).isoformat()}]}))
    await call(c, "слоты психолога", c.get(f"/v1/psychologists/{random.choice(psy)}/free-starts", params={"date_from": now.isoformat(), "date_to": (now + timedelta(days=14)).isoformat()}))

async def main(concurrency=int(sys.argv[1]), sessions=int(sys.argv[2])):
    async with SessionFactory() as s:
        psy = [str(x) for x in (await s.scalars(select(Psychologist.id))).all()]
    sem = asyncio.Semaphore(concurrency)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t", timeout=60) as c:
        async def one():
            async with sem: await user_session(c, psy)
        t = time.perf_counter(); await asyncio.gather(*(one() for _ in range(sessions))); total = time.perf_counter() - t
    print(f"параллельно {concurrency}, сессий {sessions}: {total:.1f} с → {sessions / total:.1f} клиентских сессий/с ({4 * sessions / total:.0f} запросов/с)")
    for k, v in lat.items():
        v.sort(); print(f"  {k:18s} p50={statistics.median(v):6.1f} ms  p95={v[int(len(v) * .95) - 1]:6.1f} ms")
    await engine.dispose()
asyncio.run(main())
