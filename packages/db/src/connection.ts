import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema.js';

export function createDatabase(dbPath: string = './data/app.db') {
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  return sqlite;
}

export function getDb(dbPath: string = './data/app.db') {
  const sqlite = createDatabase(dbPath);
  return drizzle(sqlite, { schema });
}
