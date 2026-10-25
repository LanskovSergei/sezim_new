import asyncio, hashlib, os, sys, uuid
os.environ.update(SEZIM_ROBOKASSA_LOGIN="sezim", SEZIM_ROBOKASSA_PASSWORD1="p1", SEZIM_ROBOKASSA_PASSWORD2="p2")
sys.path.insert(0, "/mnt/user-data/outputs/sezim")
from datetime import timedelta, datetime, timezone
import httpx
from sqlalchemy import update, select
from app.main import app
from app.db import SessionFactory, engine
from app.models import User, Psychologist, Role, Gender, Booking, Certificate
from app.services.availability import utcnow
from app.payments.freedompay import sign

def robo_sig(out_sum, inv): return hashlib.md5(f"{out_sum}:{inv}:p2".encode()).hexdigest().upper()

async def main():
    async with SessionFactory() as s:
        pu, c1, c2 = User(phone="+770001", role=Role.PSYCHOLOGIST, name="Айгерим"), User(phone="+770002", name="Клиент 1"), User(phone="+770003", name="Клиент 2")
        s.add_all([pu, c1, c2]); await s.flush()
        p = Psychologist(user_id=pu.id, display_name="Айгерим", gender=Gender.FEMALE, price_kzt=15000, couple_price_kzt=25000,
                         experience_years=7, rating=4.9, languages=["ru", "kk"], topics=["anxiety", "relations"])
        s.add(p); await s.commit(); PU, C1, C2, P = pu.id, c1.id, c2.id, p.id
    H = lambda u: {"x-user-id": str(u)}
    t = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=t, base_url="http://t") as c:
        r = await c.put("/v1/psychologist/me/availability", headers=H(PU),
                        json=[{"weekday": d, "start_local": "09:00", "end_local": "21:00"} for d in range(7)])
        print("1 rules →", r.json())
        q = (await c.post("/v1/questionnaires", json={"format": "couple", "topics": ["relations"], "preferred_gender": "female"})).json()["id"]
        now = utcnow(); fr, to = now.isoformat(), (now + timedelta(days=5)).isoformat()
        cal = (await c.get("/v1/availability", params={"questionnaire_id": q, "date_from": fr, "date_to": to})).json()
        print("2 calendar couple buckets:", len(cal))
        m = (await c.post("/v1/matches", json={"questionnaire_id": q, "windows": [{"starts_at": fr, "ends_at": to}]})).json()
        print("3 match:", m[0]["display_name"], m[0]["price_kzt"], m[0]["match_score"])
        # старт через 3 дня, 10:00 по Алматы
        day = (now + timedelta(days=3)).astimezone(timezone(timedelta(hours=5))).replace(hour=10, minute=0, second=0, microsecond=0)
        T = day.astimezone(timezone.utc)
        h1, h2 = await asyncio.gather(
            c.post("/v1/bookings/hold", headers=H(C1), json={"psychologist_id": str(P), "starts_at": T.isoformat(), "format": "individual"}),
            c.post("/v1/bookings/hold", headers=H(C2), json={"psychologist_id": str(P), "starts_at": (T + timedelta(minutes=30)).isoformat(), "format": "couple"}))
        print("4 race (overlap 10:00 ind vs 10:30 couple):", h1.status_code, h2.status_code)
        win, wu = (h1, C1) if h1.status_code == 201 else (h2, C2)
        b1 = win.json()["id"]
        co = (await c.post(f"/v1/bookings/{b1}/checkout", headers=H(wu), json={"use_balance": True, "provider": "robokassa"})).json()
        print("5 checkout:", co["status"], co["to_pay_kzt"], co["redirect_url"][:60])
        async with SessionFactory() as s:
            from app.models import Payment
            pay = await s.scalar(select(Payment).where(Payment.booking_id == uuid.UUID(b1)))
        form = {"OutSum": f"{pay.amount_kzt}.000000", "InvId": str(pay.id), "SignatureValue": robo_sig(f"{pay.amount_kzt}.000000", pay.id)}
        r = await c.post("/v1/payments/robokassa/webhook", data=form); print("6 webhook:", r.status_code, r.text)
        r = await c.post("/v1/payments/robokassa/webhook", data=form); print("7 repeat:", r.status_code, r.text)
        bad = dict(form, SignatureValue="X"); print("8 bad sig:", (await c.post("/v1/payments/robokassa/webhook", data=bad)).status_code)
        print("9 my bookings:", [b["status"] for b in (await c.get("/v1/me/bookings", headers=H(wu))).json()])
        # сертификат: C1 покупает, C2 активирует
        cp = (await c.post("/v1/certificates", headers=H(C1), json={"nominal_kzt": 30000, "provider": "robokassa", "recipient_phone": "+770003"})).json()
        async with SessionFactory() as s:
            pay = await s.scalar(select(Payment).where(Payment.certificate_id == uuid.UUID(cp["certificate_id"])))
        await c.post("/v1/payments/robokassa/webhook", data={"OutSum": "30000", "InvId": str(pay.id), "SignatureValue": robo_sig("30000", pay.id)})
        async with SessionFactory() as s:
            code = (await s.get(Certificate, uuid.UUID(cp["certificate_id"]))).code
        pretty = f"{code[:4]}-{code[4:8]}-{code[8:]}".lower()
        print("10 activate:", (await c.post("/v1/certificates/activate", headers=H(C2), json={"code": pretty})).json())
        print("11 activate again:", (await c.post("/v1/certificates/activate", headers=H(C2), json={"code": code})).status_code)
        # C2 оплачивает индивидуальную сессию балансом целиком
        T2 = T + timedelta(hours=3)
        b2 = (await c.post("/v1/bookings/hold", headers=H(C2), json={"psychologist_id": str(P), "starts_at": T2.isoformat()})).json()["id"]
        co = (await c.post(f"/v1/bookings/{b2}/checkout", headers=H(C2), json={"use_balance": True})).json()
        print("12 balance checkout:", co["status"], co["balance_paid_kzt"], co["to_pay_kzt"], (await c.get("/v1/me/balance", headers=H(C2))).json())
        r = await c.post(f"/v1/bookings/{b2}/reschedule", headers=H(C2), json={"starts_at": (T2 + timedelta(hours=1)).isoformat()})
        print("13 reschedule:", r.status_code, r.json().get("starts_at"))
        r = await c.post(f"/v1/bookings/{b2}/cancel", headers=H(C2)); print("14 cancel:", r.json(), (await c.get("/v1/me/balance", headers=H(C2))).json())
        # поздняя оплата: холд истёк, время свободно → подтверждение; затем — время занято → на баланс
        T3 = T + timedelta(hours=6)
        b3 = (await c.post("/v1/bookings/hold", headers=H(C1), json={"psychologist_id": str(P), "starts_at": T3.isoformat()})).json()["id"]
        await c.post(f"/v1/bookings/{b3}/checkout", headers=H(C1), json={"use_balance": False, "provider": "robokassa"})
        async with SessionFactory() as s:
            await s.execute(update(Booking).where(Booking.id == uuid.UUID(b3)).values(hold_expires_at=utcnow() - timedelta(minutes=1))); await s.commit()
            from app.services.booking import release_expired_holds
            print("15 released holds:", await release_expired_holds(s))
            pay3 = await s.scalar(select(Payment).where(Payment.booking_id == uuid.UUID(b3)))
        r = await c.post("/v1/payments/robokassa/webhook", data={"OutSum": "15000", "InvId": str(pay3.id), "SignatureValue": robo_sig("15000", pay3.id)})
        async with SessionFactory() as s: print("16 late payment, free slot →", (await s.get(Booking, uuid.UUID(b3))).status.value)
        T4 = T + timedelta(hours=8)
        b4 = (await c.post("/v1/bookings/hold", headers=H(C1), json={"psychologist_id": str(P), "starts_at": T4.isoformat()})).json()["id"]
        await c.post(f"/v1/bookings/{b4}/checkout", headers=H(C1), json={"use_balance": False, "provider": "robokassa"})
        async with SessionFactory() as s:
            await s.execute(update(Booking).where(Booking.id == uuid.UUID(b4)).values(hold_expires_at=utcnow() - timedelta(minutes=1))); await s.commit()
        r = await c.post("/v1/bookings/hold", headers=H(C2), json={"psychologist_id": str(P), "starts_at": T4.isoformat()})
        print("17 C2 takes expired slot:", r.status_code)
        async with SessionFactory() as s: pay4 = await s.scalar(select(Payment).where(Payment.booking_id == uuid.UUID(b4)))
        await c.post("/v1/payments/robokassa/webhook", data={"OutSum": "15000", "InvId": str(pay4.id), "SignatureValue": robo_sig("15000", pay4.id)})
        async with SessionFactory() as s: print("18 late payment, slot taken →", (await s.get(Booking, uuid.UUID(b4))).status.value)
        print("   C1 balance:", (await c.get("/v1/me/balance", headers=H(C1))).json())
        print("19 video token too early:", (await c.post(f"/v1/bookings/{b1}/video-token", headers=H(wu))).status_code)
        print("20 psychologist sessions:", len((await c.get("/v1/psychologist/me/sessions", headers=H(PU))).json()))
        print("21 lead-time violation:", (await c.post("/v1/bookings/hold", headers=H(C2), json={"psychologist_id": str(P), "starts_at": (now + timedelta(minutes=30)).replace(second=0, microsecond=0).isoformat()})).status_code)
    params = {"pg_order_id": "5", "pg_amount": "15000", "pg_result": "1", "pg_salt": "abc"}
    from app.payments.freedompay import FreedomPayGateway
    params["pg_sig"] = sign("webhook", params, "")
    print("22 freedompay parse:", FreedomPayGateway().parse_webhook(params).succeeded)
    await engine.dispose()
asyncio.run(main())
