\timing on
-- 1000 психологов, 20000 клиентов
INSERT INTO users (id, phone, role) SELECT gen_random_uuid(), '+7701' || lpad(g::text, 7, '0'), 'psychologist' FROM generate_series(1, 1000) g;
INSERT INTO users (id, phone, role) SELECT gen_random_uuid(), '+7702' || lpad(g::text, 7, '0'), 'client' FROM generate_series(1, 20000) g;
WITH t AS (SELECT ARRAY['anxiety','depression','relations','burnout','self_esteem','grief','trauma','family','parenting','addiction','career','psychosomatics'] a)
INSERT INTO psychologists (id, user_id, display_name, gender, price_kzt, couple_price_kzt, experience_years, rating, timezone, languages, topics, approaches, is_active)
SELECT gen_random_uuid(), u.id, 'Психолог ' || row_number() over (),
       (CASE WHEN random() < 0.75 THEN 'female' ELSE 'male' END)::gender,
       (8 + floor(random() * 22))::int * 1000,
       CASE WHEN random() < 0.35 THEN (15 + floor(random() * 25))::int * 1000 END,
       (1 + floor(random() * 15))::int, round((3.5 + random() * 1.5)::numeric, 2), 'Asia/Almaty',
       CASE WHEN random() < 0.4 THEN ARRAY['ru','kk'] ELSE ARRAY['ru'] END,
       ARRAY[t.a[1 + floor(random()*12)::int], t.a[1 + floor(random()*12)::int], t.a[1 + floor(random()*12)::int], t.a[1 + floor(random()*12)::int]],
       '{}', true
FROM users u, t WHERE u.role = 'psychologist';
-- 8 недель ячеек: у каждого 5 случайных рабочих дней в неделю, 9:00–21:00 по Алматы (04–16 UTC)
INSERT INTO availability_cells (psychologist_id, starts_at)
SELECT p.id, d + make_interval(mins => 240 + 30 * c)
FROM psychologists p
CROSS JOIN generate_series(date_trunc('day', now()) + interval '1 day', date_trunc('day', now()) + interval '56 days', interval '1 day') d
CROSS JOIN generate_series(0, 23) c
WHERE hashtext(p.id::text || d::text) % 7 NOT IN (0, 1);
-- ~35% часовых окон заняты подтверждёнными записями
INSERT INTO bookings (id, client_id, psychologist_id, format, starts_at, session_ends_at, period, status, price_kzt, balance_paid_kzt, policy_version)
SELECT gen_random_uuid(), (SELECT id FROM users WHERE role='client' OFFSET floor(random()*20000)::int LIMIT 1),
       c.psychologist_id, 'individual', c.starts_at, c.starts_at + interval '50 min',
       tstzrange(c.starts_at, c.starts_at + interval '60 min'), 'confirmed', 15000, 0, 'v2_24h'
FROM availability_cells c
WHERE extract(minute from c.starts_at) = 0 AND random() < 0.35;
ANALYZE;
SELECT (SELECT count(*) FROM psychologists) psy, (SELECT count(*) FROM availability_cells) cells, (SELECT count(*) FROM bookings) bookings;
