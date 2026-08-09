// Persistence layer — uses Postgres if DATABASE_URL is set, SQLite otherwise.
// This means local dev and hackathon deploys use SQLite (zero config),
// and production scale-out just needs a DATABASE_URL env var.

const path = require("path");

let adapter;

if (process.env.DATABASE_URL) {
  // Postgres adapter
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

  // Boot: create table if needed
  pool.query(`
    CREATE TABLE IF NOT EXISTS agents (
      hash TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `).catch(e => console.error("[db] pg init error:", e.message));

  adapter = {
    loadAll() {
      return pool.query("SELECT hash, data FROM agents").then(r => {
        const map = new Map();
        for (const row of r.rows) {
          try { map.set(row.hash, JSON.parse(row.data)); } catch {}
        }
        return map;
      });
    },
    saveAll(registryMap) {
      const now = Math.floor(Date.now() / 1000);
      const promises = [...registryMap.entries()].map(([hash, state]) =>
        pool.query(
          `INSERT INTO agents (hash, data, updated_at) VALUES ($1, $2, $3)
           ON CONFLICT(hash) DO UPDATE SET data=$2, updated_at=$3`,
          [hash, JSON.stringify(state), now]
        )
      );
      return Promise.all(promises);
    },
    deleteAgent(hash) {
      return pool.query("DELETE FROM agents WHERE hash = $1", [hash]);
    }
  };
  console.log("[db] using Postgres");
} else {
  // SQLite adapter (default)
  const Database = require("better-sqlite3");
  const db = new Database(path.join(__dirname, "agents.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      hash TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  const upsertStmt = db.prepare(`
    INSERT INTO agents (hash, data, updated_at) VALUES (@hash, @data, @updated_at)
    ON CONFLICT(hash) DO UPDATE SET data=@data, updated_at=@updated_at
  `);

  adapter = {
    loadAll() {
      const map = new Map();
      for (const row of db.prepare("SELECT hash, data FROM agents").all()) {
        try { map.set(row.hash, JSON.parse(row.data)); } catch {}
      }
      return map;
    },
    saveAll(registryMap) {
      const now = Math.floor(Date.now() / 1000);
      const tx = db.transaction(entries => {
        for (const [hash, state] of entries)
          upsertStmt.run({ hash, data: JSON.stringify(state), updated_at: now });
      });
      tx([...registryMap.entries()]);
    },
    deleteAgent(hash) {
      db.prepare("DELETE FROM agents WHERE hash = ?").run(hash);
    }
  };
  console.log("[db] using SQLite");
}

function loadAll() {
  const result = adapter.loadAll();
  // Support both sync (SQLite) and async (Postgres) returns
  return result instanceof Promise ? result : Promise.resolve(result);
}
function saveAll(map) {
  const result = adapter.saveAll(map);
  return result instanceof Promise ? result : Promise.resolve(result);
}
function deleteAgent(hash) {
  const result = adapter.deleteAgent(hash);
  return result instanceof Promise ? result : Promise.resolve(result);
}

module.exports = { loadAll, saveAll, deleteAgent };
