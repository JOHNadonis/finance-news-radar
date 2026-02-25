import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { Subscription, SubscriptionType } from "./types";

const DB_DIR = path.join(process.cwd(), "data", "db");
const DB_PATH = path.join(DB_DIR, "subscriptions.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_token TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('ticker', 'market', 'keyword')),
      value TEXT NOT NULL,
      display_name TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_token, type, value)
    );
    CREATE INDEX IF NOT EXISTS idx_sub_user ON subscriptions(user_token);
  `);

  return _db;
}

export function getSubscriptions(userToken: string): Subscription[] {
  const db = getDb();
  const stmt = db.prepare(
    "SELECT id, user_token, type, value, display_name, created_at FROM subscriptions WHERE user_token = ? ORDER BY created_at DESC"
  );
  return stmt.all(userToken) as Subscription[];
}

export function addSubscription(
  userToken: string,
  type: SubscriptionType,
  value: string,
  displayName?: string
): Subscription {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT INTO subscriptions (user_token, type, value, display_name) VALUES (?, ?, ?, ?)"
  );
  const result = stmt.run(userToken, type, value, displayName ?? null);

  const row = db.prepare("SELECT * FROM subscriptions WHERE id = ?").get(
    result.lastInsertRowid
  ) as Subscription;

  return row;
}

export function removeSubscription(
  userToken: string,
  id: number
): boolean {
  const db = getDb();
  const stmt = db.prepare(
    "DELETE FROM subscriptions WHERE id = ? AND user_token = ?"
  );
  const result = stmt.run(id, userToken);
  return result.changes > 0;
}

export function getTickerSubscribers(): Map<string, string[]> {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT value, user_token FROM subscriptions WHERE type = 'ticker'"
    )
    .all() as { value: string; user_token: string }[];

  const map = new Map<string, string[]>();
  for (const row of rows) {
    const list = map.get(row.value) || [];
    list.push(row.user_token);
    map.set(row.value, list);
  }
  return map;
}
