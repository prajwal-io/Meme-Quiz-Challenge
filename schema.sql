-- B2B Hacks Challenge 1 — Postgres schema (admin participant tracking)
-- Run once:  psql $DATABASE_URL -f schema.sql

CREATE TABLE IF NOT EXISTS participants (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  plays       INTEGER NOT NULL DEFAULT 0,
  best_score  INTEGER NOT NULL DEFAULT 0,
  last_played_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plays (
  id             SERIAL PRIMARY KEY,
  participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  score          INTEGER NOT NULL DEFAULT 0,
  solved         INTEGER NOT NULL DEFAULT 0,
  attempted      INTEGER NOT NULL DEFAULT 0,
  violations     INTEGER NOT NULL DEFAULT 0,
  played_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plays_participant ON plays(participant_id);

-- Admin view: every person + how many times they played + best score
CREATE OR REPLACE VIEW admin_scoreboard AS
SELECT p.id, p.name, p.email, p.plays,
       p.best_score, p.last_played_at,
       COUNT(pl.id) AS recorded_finishes
FROM participants p
LEFT JOIN plays pl ON pl.participant_id = p.id
GROUP BY p.id
ORDER BY p.plays DESC, p.best_score DESC;
