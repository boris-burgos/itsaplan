import { createHash, timingSafeEqual } from 'node:crypto';
import { SQL } from 'bun';
import { extendAuth } from '@repo/auth/extensions';

// scrypt costs about 180 ms per sign-up or sign-in, and nearly every test creates users.
// bunfig.toml preloads this file for `bun test` only, so the server never hashes this way.
extendAuth({
  password: {
    hash: async (password) => createHash('sha256').update(password).digest('hex'),
    verify: async ({ hash, password }) => {
      const candidate = createHash('sha256').update(password).digest();
      const stored = Buffer.from(hash, 'hex');
      return stored.length === candidate.length && timingSafeEqual(stored, candidate);
    },
  },
});

// Every test empties the whole database, so each `bun test --parallel` worker runs on its
// own copy of the migrated test database, made afresh when the worker starts. This runs
// before a test file imports @repo/db, which reads DATABASE_URL once.
const worker = process.env.BUN_TEST_WORKER_ID;
if (worker) {
  const url = new URL(process.env.DATABASE_URL!);
  const template = url.pathname.slice(1);
  const copy = `${template}_${worker}`;
  url.pathname = '/postgres';
  const admin = new SQL(url.toString());
  await admin.unsafe(`DROP DATABASE IF EXISTS "${copy}" WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE "${copy}" TEMPLATE "${template}"`);
  await admin.close();
  url.pathname = `/${copy}`;
  process.env.DATABASE_URL = url.toString();
}
