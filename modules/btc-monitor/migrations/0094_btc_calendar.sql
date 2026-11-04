CREATE TABLE IF NOT EXISTS btc_calendar_snapshots (
  source text PRIMARY KEY,
  events jsonb NOT NULL,
  collected_at timestamptz NOT NULL
);
