import pg from "pg";

let pool = null;

export function isDbEnabled() {
  return !!(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
}

export function getPool() {
  if (!isDbEnabled()) return null;
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
      max: 10,
    });
    pool.on("error", (err) => console.error("PG pool error:", err.message));
  }
  return pool;
}

export async function query(text, params) {
  const p = getPool();
  if (!p) throw new Error("Database not configured (DATABASE_URL missing)");
  return p.query(text, params);
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
