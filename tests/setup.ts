import os from 'os';
import path from 'path';

// Vitest setup file: runs before any test module is imported. We point the app
// at a throwaway SQLite file and pin JWT secrets so the suite is hermetic.
process.env.DATABASE_PATH = path.join(os.tmpdir(), `fund-intel-test-${process.pid}.db`);
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.NODE_ENV = 'test';
