// SQLite persistence layer for BuildOS agent registry.
// Replaces the flat agents.json file with a real embedded database —
// same on-disk simplicity (no separate DB service to host), but with
// proper atomic writes so concurrent registrations/check-ins can't
// corrupt the file the way a naive JSON.stringify + writeFileSync could.
const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(__dirname, "agents.db");
const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL"); // safer concurrent reads/writes

db.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    hash TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )
`);

function loadAll() {
  const rows = db.prepare("SELECT hash, data FROM agents").all();
  const map = new Map();
  for (const row of rows) {
    try {
      map.set(row.hash, JSON.parse(row.data));
    } catch (e) {
      console.warn(`[db] failed to parse agent ${row.hash}:`, e.message);
    }
  }
  return map;
}

const upsertStmt = db.prepare(`
  INSERT INTO agents (hash, data, updated_at)
  VALUES (@hash, @data, @updated_at)
  ON CONFLICT(hash) DO UPDATE SET data = @data, updated_at = @updated_at
`);

function saveAll(registryMap) {
  const now = Math.floor(Date.now() / 1000);
  const tx = db.transaction((entries) => {
    for (const [hash, state] of entries) {
      upsertStmt.run({ hash, data: JSON.stringify(state), updated_at: now });
    }
  });
  tx([...registryMap.entries()]);
}

function deleteAgent(hash) {
  db.prepare("DELETE FROM agents WHERE hash = ?").run(hash);
}

module.exports = { loadAll, saveAll, deleteAgent };
