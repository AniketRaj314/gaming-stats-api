const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SteamStore } = require('../../src/storage/steamStore');

let directory;
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'steam-store-')); });
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

test('atomically persists public snapshots with private filesystem modes', () => {
  const store = new SteamStore(path.join(directory, 'steam'));
  store.publish('library', { games: [] }, 1000, 2000);
  store.publish('game:570', { achievements: [] }, 1000, 2000);
  expect(store.get('library')).toMatchObject({ payload: { games: [] }, status: 'ready', success: 1000, nextDue: 2000 });
  expect(fs.statSync(path.join(directory, 'steam')).mode & 0o777).toBe(0o700);
  expect(fs.statSync(path.join(directory, 'steam', 'library.json')).mode & 0o777).toBe(0o600);
  expect(fs.readdirSync(path.join(directory, 'steam')).some(name => name.endsWith('.tmp'))).toBe(false);
});

test('failure can retain a stale payload or suppress it for privacy', () => {
  const store = new SteamStore(path.join(directory, 'steam'));
  store.publish('profile', { personaName: 'Fixture' }, 1000, 2000);
  store.fail('profile', 'unavailable', 2000, 3000);
  expect(store.get('profile')).toMatchObject({ payload: { personaName: 'Fixture' }, status: 'unavailable', success: 1000 });
  store.fail('profile', 'private', 3000, 4000, true);
  expect(store.get('profile')).toMatchObject({ payload: null, status: 'private', success: null });
});

test('rejects traversal-like resources and corrupt snapshots', () => {
  const store = new SteamStore(path.join(directory, 'steam'));
  expect(() => store.get('game:../../secret')).toThrow('invalid-resource');
  fs.writeFileSync(path.join(directory, 'steam', 'recent.json'), '{broken', { mode: 0o600 });
  expect(() => store.get('recent')).toThrow('snapshot-corrupt');
});

test('a failed refresh replaces a corrupt snapshot with safe failure metadata', () => {
  const store = new SteamStore(path.join(directory, 'steam'));
  fs.writeFileSync(path.join(directory, 'steam', 'profile.json'), '{broken', { mode: 0o600 });
  store.fail('profile', 'unavailable', 2000, 3000);
  expect(store.get('profile')).toMatchObject({ payload: null, status: 'unavailable', success: null, attempted: 2000 });
});
