import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const dataDirectory = path.join(process.cwd(), 'data');
mkdirSync(dataDirectory, { recursive: true });
const databasePath = path.join(dataDirectory, 'splitsmart.json');
const emptyDatabase = { nextUserId: 1, users: [], sessions: [] };

export default function readDatabase() {
  if (!existsSync(databasePath)) return emptyDatabase;
  const contents = readFileSync(databasePath, 'utf8').replace(/^\uFEFF/, '').trim();
  if (!contents) return emptyDatabase;

  try {
    const database = JSON.parse(contents);
    if (!database || !Array.isArray(database.users) || !Array.isArray(database.sessions)) {
      throw new Error('Auth database has an invalid structure.');
    }
    return {
      nextUserId: Number.isInteger(database.nextUserId) ? database.nextUserId : 1,
      users: database.users,
      sessions: database.sessions,
    };
  } catch (error) {
    throw new Error(`Could not read the auth database at ${databasePath}: ${error.message}`);
  }
}

export function updateDatabase(update) {
  const nextDatabase = update(readDatabase());
  const temporaryPath = `${databasePath}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify(nextDatabase, null, 2), 'utf8');
  renameSync(temporaryPath, databasePath);
  return nextDatabase;
}
