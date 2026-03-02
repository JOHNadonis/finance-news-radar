import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import type { Subscription, SubscriptionType, ModelGroup, AccessKey, AccessKeyWithGroup } from "./types";

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

    CREATE TABLE IF NOT EXISTS model_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      api_base_url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      model_name TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS access_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_value TEXT NOT NULL UNIQUE,
      label TEXT,
      model_group_id INTEGER NOT NULL REFERENCES model_groups(id) ON DELETE CASCADE,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      last_used_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ak_key ON access_keys(key_value);

    CREATE TABLE IF NOT EXISTS admin_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Enable foreign keys
  _db.pragma("foreign_keys = ON");

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

// ── Model Groups ──

export function getAllModelGroups(): ModelGroup[] {
  const db = getDb();
  return db.prepare("SELECT * FROM model_groups ORDER BY created_at DESC").all() as ModelGroup[];
}

export function getModelGroup(id: number): ModelGroup | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM model_groups WHERE id = ?").get(id) as ModelGroup | undefined;
}

export function createModelGroup(data: { name: string; api_base_url: string; api_key: string; model_name: string }): ModelGroup {
  const db = getDb();
  const result = db.prepare(
    "INSERT INTO model_groups (name, api_base_url, api_key, model_name) VALUES (?, ?, ?, ?)"
  ).run(data.name, data.api_base_url, data.api_key, data.model_name);
  return db.prepare("SELECT * FROM model_groups WHERE id = ?").get(result.lastInsertRowid) as ModelGroup;
}

export function deleteModelGroup(id: number): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM model_groups WHERE id = ?").run(id);
  return result.changes > 0;
}

// ── Access Keys ──

export function getAllAccessKeys(): AccessKeyWithGroup[] {
  const db = getDb();
  return db.prepare(`
    SELECT ak.*, mg.name as group_name, mg.model_name
    FROM access_keys ak
    JOIN model_groups mg ON ak.model_group_id = mg.id
    ORDER BY ak.created_at DESC
  `).all() as AccessKeyWithGroup[];
}

export function getAccessKeyByValue(key: string): (AccessKey & { group: ModelGroup }) | undefined {
  const db = getDb();
  const ak = db.prepare("SELECT * FROM access_keys WHERE key_value = ? AND is_active = 1").get(key) as AccessKey | undefined;
  if (!ak) return undefined;
  const group = db.prepare("SELECT * FROM model_groups WHERE id = ?").get(ak.model_group_id) as ModelGroup | undefined;
  if (!group) return undefined;
  return { ...ak, group };
}

export function createAccessKey(groupId: number, label?: string): AccessKey {
  const db = getDb();
  const keyValue = `fnr_${crypto.randomBytes(16).toString("hex")}`;
  const result = db.prepare(
    "INSERT INTO access_keys (key_value, label, model_group_id) VALUES (?, ?, ?)"
  ).run(keyValue, label ?? null, groupId);
  return db.prepare("SELECT * FROM access_keys WHERE id = ?").get(result.lastInsertRowid) as AccessKey;
}

export function deleteAccessKey(id: number): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM access_keys WHERE id = ?").run(id);
  return result.changes > 0;
}

export function touchAccessKeyUsage(key: string): void {
  const db = getDb();
  db.prepare("UPDATE access_keys SET last_used_at = datetime('now') WHERE key_value = ?").run(key);
}

// ── Admin Config ──

export function getAdminConfig(key: string): string | undefined {
  const db = getDb();
  const row = db.prepare("SELECT value FROM admin_config WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value;
}

export function setAdminConfig(key: string, value: string): void {
  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO admin_config (key, value) VALUES (?, ?)").run(key, value);
}
