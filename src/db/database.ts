import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

const SCHEMA_PATH = path.resolve(__dirname, 'schema.sql');

let instance: Database.Database | null = null;

export const getDb = (): Database.Database => {
  if (instance) return instance;

  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

  const db = new Database(config.databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema);

  instance = db;
  return db;
};

export const closeDb = (): void => {
  if (instance) {
    instance.close();
    instance = null;
  }
};
