# Архитектура

## Компоненты

```mermaid
flowchart LR
  U["Клиент и психолог: веб, мобильный"] -->|"HTTPS"| N["Nginx или Caddy: TLS"]
  N --> API["FastAPI: без состояния, N процессов"]
  API --> PG[("PostgreSQL 16")]
  API --> R[("Redis: кэш календаря")]
  W["Воркер arq: холды, напоминания, сетка"] --> PG
  W --> R
  W --> SMS["SMS и WhatsApp"]
  API -->|"создание платежа"| PAY["Robokassa, FreedomPay, Kaspi"]
  PAY -->|"вебхук"| API
  API -->|"токен комнаты"| U
  U -->|"WebRTC"| LK["LiveKit: видео"]
  LK -->|"вебхук: вход участника"| API
```

Масштабирование: API не хранит состояния — растёт добавлением процессов и серверов за балансировщиком. Следующие ступени — реплика PostgreSQL на чтение для календаря и подборки, отдельный сервер под LiveKit.

## Жизненный цикл записи

```mermaid
stateDiagram-v2
  [*] --> held: выбор времени
  held --> confirmed: оплата прошла или хватило баланса
  held --> expired: 15 минут без оплаты
  held --> cancelled: клиент отменил
  expired --> confirmed: поздняя оплата, время свободно
  confirmed --> cancelled: отмена по условиям заказа
  confirmed --> confirmed: перенос за 24 ч и больше
  confirmed --> completed: сессия прошла
  completed --> [*]
  cancelled --> [*]
  expired --> [*]
```

Две активные записи одного психолога не могут пересечься: это гарантирует ограничение `EXCLUDE USING gist` в PostgreSQL, а не код приложения.

## Схема данных

```mermaid
erDiagram
  USERS ||--o| PSYCHOLOGISTS : "профиль"
  PSYCHOLOGISTS ||--o{ AVAILABILITY_RULES : "шаблон недели"
  PSYCHOLOGISTS ||--o{ AVAILABILITY_EXCEPTIONS : "отпуск"
  PSYCHOLOGISTS ||--o{ AVAILABILITY_CELLS : "ячейки 30 мин"
  PSYCHOLOGISTS ||--o{ BOOKINGS : "сессии"
  USERS ||--o{ BOOKINGS : "записи клиента"
  BOOKINGS ||--o{ PAYMENTS : "оплата"
  CERTIFICATES ||--o| PAYMENTS : "оплата"
  USERS ||--o{ CERTIFICATES : "покупка"
  USERS ||--o{ LEDGER_ENTRIES : "баланс"
  USERS ||--o{ QUESTIONNAIRES : "анкета"

  PSYCHOLOGISTS {
    uuid id PK
    int price_kzt
    int couple_price_kzt
    text_array topics
    text_array languages
  }
  AVAILABILITY_CELLS {
    uuid psychologist_id PK
    timestamptz starts_at PK
  }
  BOOKINGS {
    uuid id PK
    uuid psychologist_id FK
    uuid client_id FK
    tstzrange period
    enum status
    int price_kzt
    int balance_paid_kzt
  }
  PAYMENTS {
    bigint id PK
    enum provider
    enum status
    int amount_kzt
  }
  CERTIFICATES {
    uuid id PK
    string code
    int nominal_kzt
    enum status
  }
  LEDGER_ENTRIES {
    bigint id PK
    uuid user_id FK
    int amount_kzt
    enum kind
  }
```
