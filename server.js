/* B2B Hacks Challenge 1 — static host + participant API.
   Uses Postgres when DATABASE_URL is set (see schema.sql),
   otherwise a local file store (db.json) with the same shape. */
const express = require("express");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8000;
const DB_FILE = path.join(__dirname, "db.json");
const app = express();
app.use(express.json());

// ---------- admin auth (admin dashboard only; participants never need this) ----------
const ADMIN_USER = process.env.ADMIN_USER || "B2B hacks.prajwals";
const ADMIN_PASS = process.env.ADMIN_PASS || "prajwals246_API@red24";
const crypto = require("crypto");
const adminTokens = new Set();
function requireAdmin(req, res, next) {
  const tok = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (tok && adminTokens.has(tok)) return next();
  return res.status(401).json({ ok: false, error: "admin login required" });
}

// ---------- store abstraction ----------
let pgPool = null;
if (process.env.DATABASE_URL) {
  try {
    const { Pool } = require("pg");
    pgPool = new Pool({ connectionString: process.env.DATABASE_URL });
    pgPool.query(`
      CREATE TABLE IF NOT EXISTS participants (
        id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
        plays INTEGER NOT NULL DEFAULT 0, best_score INTEGER NOT NULL DEFAULT 0,
        last_played_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS plays (
        id SERIAL PRIMARY KEY, participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
        score INTEGER NOT NULL DEFAULT 0, solved INTEGER NOT NULL DEFAULT 0,
        attempted INTEGER NOT NULL DEFAULT 0, violations INTEGER NOT NULL DEFAULT 0,
        played_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`)
      .then(() => console.log("[db] postgres ready"))
      .catch((e) => { console.log("[db] postgres init failed, falling back to file:", e.message); pgPool = null; });
  } catch (e) { console.log("[db] pg module missing, file store it is."); pgPool = null; }
}

function fileRead() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
  catch (e1) {
    // self-heal: tolerate trailing commas from hand edits (the #1 cause of "db.json error")
    try {
      const raw = fs.readFileSync(DB_FILE, "utf8");
      const db = JSON.parse(raw.replace(/,\s*([}\]])/g, "$1"));
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
      console.log("[db] auto-repaired trailing commas in db.json");
      return db;
    } catch (e2) {
      // truly unreadable: back it up instead of silently wiping participant data
      try { fs.copyFileSync(DB_FILE, DB_FILE + ".corrupt-" + Date.now() + ".bak"); } catch {}
      console.log("[db] db.json unreadable, backed up, starting fresh:", e2.message);
      return { participants: [], plays: [], seq: 1 };
    }
  }
}
function fileWrite(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

async function recordPlay({ name, email }) {
  email = String(email || "").toLowerCase().trim();
  name = String(name || "").trim() || "Player";
  if (!email) return null;
  if (pgPool) {
    const { rows } = await pgPool.query(
      `INSERT INTO participants (name, email, plays, last_played_at)
       VALUES ($1, $2, 1, NOW())
       ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name, plays=participants.plays+1, last_played_at=NOW()
       RETURNING id, name, email, plays, best_score`,
      [name, email]);
    return rows[0];
  }
  const db = fileRead();
  let p = db.participants.find((x) => x.email === email);
  if (!p) { p = { id: db.seq++, name, email, plays: 0, best_score: 0, last_played_at: null }; db.participants.push(p); }
  p.name = name; p.plays += 1; p.last_played_at = new Date().toISOString();
  fileWrite(db);
  return p;
}

async function recordFinish({ email, score = 0, solved = 0, attempted = 0, violations = 0 }) {
  email = String(email || "").toLowerCase().trim();
  if (!email) return null;
  if (pgPool) {
    const found = await pgPool.query("SELECT id, best_score FROM participants WHERE email=$1", [email]);
    if (!found.rows.length) return null;
    const p = found.rows[0];
    await pgPool.query("INSERT INTO plays (participant_id, score, solved, attempted, violations) VALUES ($1,$2,$3,$4,$5)",
      [p.id, score, solved, attempted, violations]);
    await pgPool.query("UPDATE participants SET best_score=GREATEST(best_score,$1) WHERE id=$2", [score, p.id]);
    return { ok: true };
  }
  const db = fileRead();
  const p = db.participants.find((x) => x.email === email);
  if (!p) return null;
  p.best_score = Math.max(p.best_score, Number(score) || 0);
  db.plays.push({ id: db.seq++, participant_id: p.id, score, solved, attempted, violations, played_at: new Date().toISOString() });
  fileWrite(db);
  return { ok: true };
}

async function listParticipants() {
  if (pgPool) {
    const { rows } = await pgPool.query(
      "SELECT id, name, email, plays, best_score, last_played_at FROM participants ORDER BY plays DESC, best_score DESC");
    return { source: "postgres", participants: rows };
  }
  const db = fileRead();
  const participants = [...db.participants].sort((a, b) => b.plays - a.plays || b.best_score - a.best_score);
  return { source: "local-file (db.json) — set DATABASE_URL for Postgres", participants };
}

// ---------- api ----------
app.post("/api/login", (req, res) => {
  const username = String((req.body || {}).username || "").trim();
  const password = String((req.body || {}).password || "").trim();
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const tok = crypto.randomBytes(24).toString("hex");
    adminTokens.add(tok);
    return res.json({ ok: true, token: tok });
  }
  return res.status(401).json({ ok: false, error: "invalid credentials" });
});
app.post("/api/play", async (req, res) => {
  try { res.json({ ok: true, participant: await recordPlay(req.body || {}) }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
app.post("/api/finish", async (req, res) => {
  try { res.json(await recordFinish(req.body || {}) || { ok: false }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
app.get("/api/participants", requireAdmin, async (req, res) => {
  try { res.json(await listParticipants()); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.use((req, res, next) => {
  if (req.path === "/db.json" || req.path === "/server.js") return res.status(404).send("not found");
  next();
});
app.use(express.static(__dirname));
app.listen(PORT, () => console.log(`[b2b] live on http://localhost:${PORT}  (db: ${process.env.DATABASE_URL ? "postgres" : "local file"})`));
