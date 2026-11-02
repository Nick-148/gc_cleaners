-- Initial schema (ADR 0003, 0004). Append-only: never edit after it has been applied.
-- Conventions: TEXT UUID primary keys; ISO-8601 UTC timestamps in *_at columns;
-- campus-local booking windows as date 'YYYY-MM-DD' + time 'HH:MM'; money in integer cents.

CREATE TABLE IF NOT EXISTS availability_rules (
  id          TEXT PRIMARY KEY,
  weekday     INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time  TEXT NOT NULL CHECK (start_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  end_time    TEXT NOT NULL CHECK (end_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  capacity    INTEGER NOT NULL CHECK (capacity BETWEEN 0 AND 50),
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  CHECK (start_time < end_time),
  UNIQUE (weekday, start_time)
);

CREATE TABLE IF NOT EXISTS window_overrides (
  id          TEXT PRIMARY KEY,
  date        TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  start_time  TEXT NOT NULL CHECK (start_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  end_time    TEXT NOT NULL CHECK (end_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  capacity    INTEGER NOT NULL CHECK (capacity BETWEEN 0 AND 50),
  note        TEXT,
  created_at  TEXT NOT NULL,
  CHECK (start_time < end_time),
  UNIQUE (date, start_time)
);

CREATE TABLE IF NOT EXISTS closures (
  date        TEXT PRIMARY KEY CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  reason      TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id                  TEXT PRIMARY KEY,
  reference           TEXT NOT NULL UNIQUE,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
  package             TEXT NOT NULL CHECK (package IN ('room', 'bathroom', 'bundle')),
  price_cents         INTEGER NOT NULL CHECK (price_cents >= 0),
  date                TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  start_time          TEXT NOT NULL CHECK (start_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  end_time            TEXT NOT NULL CHECK (end_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  name                TEXT NOT NULL,
  email               TEXT NOT NULL,
  phone               TEXT NOT NULL,
  building            TEXT NOT NULL,
  room                TEXT NOT NULL,
  payment_preference  TEXT NOT NULL CHECK (payment_preference IN ('cash', 'venmo')),
  notes               TEXT,
  admin_notes         TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bookings_slot ON bookings (date, start_time, status);
CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings (email, status, date);
CREATE INDEX IF NOT EXISTS idx_bookings_created ON bookings (created_at);

CREATE TABLE IF NOT EXISTS quotes (
  id                TEXT PRIMARY KEY,
  reference         TEXT NOT NULL UNIQUE,
  status            TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new', 'quoted', 'booked', 'declined', 'closed')),
  name              TEXT NOT NULL,
  email             TEXT NOT NULL,
  phone             TEXT,
  building          TEXT NOT NULL,
  room              TEXT,
  space             TEXT NOT NULL CHECK (space IN ('room', 'bathroom', 'both', 'other')),
  description       TEXT NOT NULL,
  preferred_timing  TEXT,
  quoted_cents      INTEGER CHECK (quoted_cents IS NULL OR quoted_cents >= 0),
  admin_notes       TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes (status, created_at);

CREATE TABLE IF NOT EXISTS quote_photos (
  id            TEXT PRIMARY KEY,
  quote_id      TEXT NOT NULL REFERENCES quotes (id) ON DELETE CASCADE,
  r2_key        TEXT NOT NULL UNIQUE,
  content_type  TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL CHECK (size_bytes > 0),
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_quote_photos_quote ON quote_photos (quote_id);

CREATE TABLE IF NOT EXISTS applications (
  id              TEXT PRIMARY KEY,
  status          TEXT NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new', 'interviewing', 'hired', 'declined')),
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT NOT NULL,
  class_year      TEXT NOT NULL
                  CHECK (class_year IN ('first-year', 'sophomore', 'junior', 'senior', 'other')),
  availability    TEXT NOT NULL, -- JSON array of weekday keys, e.g. ["mon","wed"]
  hours_per_week  INTEGER NOT NULL CHECK (hours_per_week BETWEEN 1 AND 40),
  experience      TEXT,
  motivation      TEXT NOT NULL,
  admin_notes     TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications (status, created_at);

CREATE TABLE IF NOT EXISTS messages (
  id                 TEXT PRIMARY KEY,
  status             TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'handled')),
  name               TEXT NOT NULL,
  email              TEXT NOT NULL,
  phone              TEXT,
  topic              TEXT NOT NULL
                     CHECK (topic IN ('general', 'reschedule', 'cancel', 'feedback', 'other')),
  booking_reference  TEXT,
  body               TEXT NOT NULL,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages (status, created_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id           TEXT PRIMARY KEY,
  actor        TEXT NOT NULL,
  action       TEXT NOT NULL,
  entity_type  TEXT NOT NULL,
  entity_id    TEXT,
  details      TEXT, -- JSON; never contains customer PII
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at);

-- Fixed-window counters keyed by a salted hash of (bucket, client IP). Raw IPs are never stored.
CREATE TABLE IF NOT EXISTS rate_limits (
  key           TEXT NOT NULL,
  window_start  INTEGER NOT NULL,
  count         INTEGER NOT NULL,
  PRIMARY KEY (key, window_start)
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits (window_start);
