import { getDb } from '@job-app/db/connection';
import fs from 'fs';
import path from 'path';

// Ensure data directory exists
const dataDir = path.join(process.cwd(), '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'app.db');

// Initialize the database instance
export const db = getDb(dbPath);
