const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { PlayniteStore } = require('../../src/storage/playniteStore');
const { createService } = require('../../src/providers/playnite/service');
const f = require('./fixtures');

let directory, time, service;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'playnite-service-'));
  time = Date.parse('2026-09-20T10:03:00.000Z');
  service = createService({ store: new PlayniteStore(directory),
    config: { libraryStaleMs: 3600000, presenceTtlMs: 180000 }, now: () => time });
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

test('publishes complete library and game snapshots atomically', () => {
  expect(service.library().status).toBe('pending');
  expect(service.ingestLibrary(f.library)).toEqual({ accepted: true, kind: 'library', sequence: 10, gameCount: 1 });
  expect(service.library()).toMatchObject({ status: 'ready', stale: false, totals: { gameCount: 1 } });
  expect(service.game(f.playniteId)).toMatchObject({ httpStatus: 200, body: { game: { name: 'Fixture Game' } } });
  expect(service.game('55555555-5555-4555-8555-555555555555').httpStatus).toBe(404);
});

test('expires now-playing presence without deleting the cached library', () => {
  service.ingestLibrary(f.library);
  service.ingestPresence(f.presence);
  expect(service.presence()).toMatchObject({ status: 'ready', state: 'playing', currentGame: { name: 'Fixture Game' } });
  time += 180001;
  expect(service.presence()).toMatchObject({ status: 'stale', stale: true, state: 'offline', currentGame: null });
  expect(service.library().games).toHaveLength(1);
});

test('rejects replayed sequences for the same device', () => {
  service.ingestLibrary(f.library);
  expect(() => service.ingestLibrary(f.library)).toThrow('stale-sequence');
});

test('validates and stores content-addressed artwork', () => {
  const body = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const hash = crypto.createHash('sha256').update(body).digest('hex');
  expect(service.writeAsset(hash, 'image/png', body)).toMatchObject({ accepted: true, assetId: hash, size: body.length });
  expect(service.asset(hash)).toMatchObject({ contentType: 'image/png', size: body.length });
  expect(() => service.writeAsset('b'.repeat(64), 'image/png', body)).toThrow('asset-hash-mismatch');
  const fake = Buffer.from('not an image');
  const fakeHash = crypto.createHash('sha256').update(fake).digest('hex');
  expect(() => service.writeAsset(fakeHash, 'image/png', fake)).toThrow('invalid-asset');
});
