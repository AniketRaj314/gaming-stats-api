const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EpicStore } = require('../../src/storage/epicStore');
const f = require('./fixtures');

let directory, store;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'epic-store-'));
  store = new EpicStore(path.join(directory, 'epic'), Buffer.alloc(32, 7));
});
afterEach(() => { store.close(); fs.rmSync(directory, { recursive: true, force: true }); });

const session = () => ({ accessToken: 'secret-access', refreshToken: 'secret-refresh', accountId: f.accountId,
  displayName: 'Spider31415', accessExpiresAt: f.now + 1000, refreshExpiresAt: f.now + 10000 });

test('encrypts credentials and separates them from sanitized snapshots', () => {
  store.connect(session());
  expect(store.session()).toEqual(session());
  const privateBytes = fs.readFileSync(path.join(directory, 'epic', 'credentials.sqlite'));
  expect(privateBytes.includes(Buffer.from('secret-access'))).toBe(false);
  store.publish('library', { games: [] }, store.state().generation, 1000, 2000);
  expect(store.get('library')).toMatchObject({ payload: { games: [] }, status: 'ready' });
  expect(fs.statSync(path.join(directory, 'epic', 'credentials.sqlite')).mode & 0o777).toBe(0o600);
});

test('rejects credentials opened with the wrong encryption key', () => {
  store.connect(session());
  const wrong = new EpicStore(path.join(directory, 'epic'), Buffer.alloc(32, 8));
  try { expect(() => wrong.session()).toThrow('credential-integrity-failed'); }
  finally { wrong.close(); }
});

test('binds token rotations to generation, version, and account identity', () => {
  store.connect(session());
  const state = store.state();
  store.beginRotation(state.generation, state.version);
  const next = { ...session(), accessToken: 'replacement' };
  store.saveRotated(next, state.generation, state.version);
  expect(store.session().accessToken).toBe('replacement');
  expect(store.state()).toMatchObject({ rotationPending: false, version: state.version + 1 });
  expect(() => store.saveRotated({ ...next, accountId: 'f'.repeat(32) }, state.generation, state.version + 1)).toThrow('connection-changed');
});

test('stores sanitized catalog entries and clears all public data on disconnect', () => {
  store.connect(session());
  store.putCatalog([{ key: 'alpha\0game', title: 'Game', categories: ['games'], hasMainGameItem: false, images: [] }], 1000);
  store.publish('library', { games: [{ name: 'Game' }] }, store.state().generation, 1000, 2000);
  expect(store.catalogCount()).toBe(1);
  store.disconnect();
  expect(store.state()).toMatchObject({ status: 'disabled', sealed: null, accountId: null });
  expect(store.get('library')).toBeNull();
  expect(store.catalogCount()).toBe(0);
});
