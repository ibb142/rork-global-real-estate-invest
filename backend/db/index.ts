let SqliteDatabase: any = null;

try {
  const bunSqlite = require('bun:sqlite');
  SqliteDatabase = bunSqlite.Database;
  console.log('[DB] bun:sqlite module loaded');
} catch {
  console.log('[DB] bun:sqlite not available, data will be in-memory only');
}

const DB_PATH = '/tmp/ipx-holding.db';

class IPXDatabase {
  private db: any = null;
  private stmtCache: Map<string, any> = new Map();

  constructor() {
    if (SqliteDatabase) {
      try {
        this.db = new SqliteDatabase(DB_PATH);
        this.db.exec('PRAGMA journal_mode = WAL');
        this.db.exec('PRAGMA synchronous = NORMAL');
        this.db.exec('PRAGMA cache_size = -64000');
        this.createTables();
        console.log(`[DB] SQLite initialized at ${DB_PATH}`);
      } catch (err) {
        console.error('[DB] SQLite init failed:', err);
        this.db = null;
      }
    }
  }

  private createTables(): void {
    if (!this.db) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entities (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (collection, id)
      );

      CREATE TABLE IF NOT EXISTS user_entities (
        collection TEXT NOT NULL,
        user_id TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (collection, user_id, id)
      );

      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        user_id TEXT,
        details TEXT,
        timestamp TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_entities_col ON entities(collection);
      CREATE INDEX IF NOT EXISTS idx_user_entities_col ON user_entities(collection, user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(timestamp);
    `);
  }

  private stmt(sql: string): any {
    if (!this.db) return null;
    let s = this.stmtCache.get(sql);
    if (!s) {
      s = this.db.prepare(sql);
      this.stmtCache.set(sql, s);
    }
    return s;
  }

  get isAvailable(): boolean {
    return this.db !== null;
  }

  put(collection: string, id: string, data: unknown): void {
    if (!this.db) return;
    this.stmt(
      `INSERT OR REPLACE INTO entities (collection, id, data, updated_at) VALUES (?, ?, ?, datetime('now'))`
    ).run(collection, id, JSON.stringify(data));
  }

  get<T>(collection: string, id: string): T | null {
    if (!this.db) return null;
    const row = this.stmt('SELECT data FROM entities WHERE collection = ? AND id = ?').get(collection, id) as { data: string } | null;
    return row ? JSON.parse(row.data) as T : null;
  }

  getAll<T>(collection: string): T[] {
    if (!this.db) return [];
    const rows = this.stmt('SELECT data FROM entities WHERE collection = ? ORDER BY created_at').all(collection) as { data: string }[];
    return rows.map(r => JSON.parse(r.data) as T);
  }

  remove(collection: string, id: string): void {
    if (!this.db) return;
    this.stmt('DELETE FROM entities WHERE collection = ? AND id = ?').run(collection, id);
  }

  clearCollection(collection: string): void {
    if (!this.db) return;
    this.stmt('DELETE FROM entities WHERE collection = ?').run(collection);
  }

  count(collection: string): number {
    if (!this.db) return 0;
    const row = this.stmt('SELECT COUNT(*) as cnt FROM entities WHERE collection = ?').get(collection) as { cnt: number };
    return row.cnt;
  }

  putUserEntity(collection: string, userId: string, id: string, data: unknown): void {
    if (!this.db) return;
    this.stmt(
      `INSERT OR REPLACE INTO user_entities (collection, user_id, id, data, updated_at) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run(collection, userId, id, JSON.stringify(data));
  }

  getUserEntities<T>(collection: string, userId: string): T[] {
    if (!this.db) return [];
    const rows = this.stmt('SELECT data FROM user_entities WHERE collection = ? AND user_id = ? ORDER BY created_at DESC').all(collection, userId) as { data: string }[];
    return rows.map(r => JSON.parse(r.data) as T);
  }

  getAllUserEntities<T>(collection: string): Array<{ userId: string; id: string; data: T }> {
    if (!this.db) return [];
    const rows = this.stmt('SELECT user_id, id, data FROM user_entities WHERE collection = ?').all(collection) as { user_id: string; id: string; data: string }[];
    return rows.map(r => ({ userId: r.user_id, id: r.id, data: JSON.parse(r.data) as T }));
  }

  removeUserEntity(collection: string, userId: string, id: string): void {
    if (!this.db) return;
    this.stmt('DELETE FROM user_entities WHERE collection = ? AND user_id = ? AND id = ?').run(collection, userId, id);
  }

  clearUserCollection(collection: string, userId: string): void {
    if (!this.db) return;
    this.stmt('DELETE FROM user_entities WHERE collection = ? AND user_id = ?').run(collection, userId);
  }

  clearAllUserData(collection: string): void {
    if (!this.db) return;
    this.stmt('DELETE FROM user_entities WHERE collection = ?').run(collection);
  }

  setConfig(key: string, value: unknown): void {
    if (!this.db) return;
    this.stmt(
      `INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))`
    ).run(key, JSON.stringify(value));
  }

  getConfig<T>(key: string): T | null {
    if (!this.db) return null;
    const row = this.stmt('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | null;
    return row ? JSON.parse(row.value) as T : null;
  }

  addAudit(id: string, action: string, userId: string, details: string): void {
    if (!this.db) return;
    this.stmt('INSERT OR IGNORE INTO audit_log (id, action, user_id, details) VALUES (?, ?, ?, ?)').run(id, action, userId, details);
  }

  getAuditLog(limit: number = 100): Array<{ id: string; action: string; userId: string; details: string; timestamp: string }> {
    if (!this.db) return [];
    return this.stmt('SELECT id, action, user_id as userId, details, timestamp FROM audit_log ORDER BY timestamp DESC LIMIT ?').all(limit) as any[];
  }

  batchPut(collection: string, items: Array<{ id: string; data: unknown }>): void {
    if (!this.db || items.length === 0) return;
    const s = this.stmt(
      `INSERT OR REPLACE INTO entities (collection, id, data, updated_at) VALUES (?, ?, ?, datetime('now'))`
    );
    const run = this.db.transaction(() => {
      for (const item of items) {
        s.run(collection, item.id, JSON.stringify(item.data));
      }
    });
    run();
  }

  batchPutUserEntities(collection: string, items: Array<{ userId: string; id: string; data: unknown }>): void {
    if (!this.db || items.length === 0) return;
    const s = this.stmt(
      `INSERT OR REPLACE INTO user_entities (collection, user_id, id, data, updated_at) VALUES (?, ?, ?, ?, datetime('now'))`
    );
    const run = this.db.transaction(() => {
      for (const item of items) {
        s.run(collection, item.userId, item.id, JSON.stringify(item.data));
      }
    });
    run();
  }

  hasData(collection: string): boolean {
    return this.count(collection) > 0;
  }

  runTransaction<T>(fn: () => T): T {
    if (!this.db) return fn();
    return this.db.transaction(fn)();
  }

  close(): void {
    this.stmtCache.clear();
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export const db = new IPXDatabase();
