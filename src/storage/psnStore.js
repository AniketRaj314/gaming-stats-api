const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const { ProviderError } = require('../shared/providerError');

const initialState = () => ({ status: 'not-configured', generation: 0, version: 0, sealed: null, rotationPending: false, retryAt: 0 });

function keyFromHex(value) {
  if (typeof value !== 'string' || !/^[a-f\d]{64}$/i.test(value)) {
    throw new ProviderError('invalid-encryption-key', 'configuration');
  }
  return Buffer.from(value, 'hex');
}

class PsnStore {
  constructor(directory, key, expectedOnlineId) {
    if (!Buffer.isBuffer(key) || key.length !== 32) throw new ProviderError('invalid-encryption-key', 'configuration');
    this.key = key;
    this.expectedOnlineId = expectedOnlineId.toLowerCase();
    if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) throw new ProviderError('unsafe-storage-path', 'storage');
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.chmodSync(directory, 0o700);
    const open = (name) => {
      const file = path.join(directory, name);
      if (!fs.existsSync(file)) fs.closeSync(fs.openSync(file, 'wx', 0o600));
      if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) throw new ProviderError('unsafe-storage-path', 'storage');
      fs.chmodSync(file, 0o600);
      const db = new Database(file, { timeout: 0 });
      db.pragma('synchronous = FULL');
      db.pragma('secure_delete = ON');
      return db;
    };
    // Credentials and published snapshots have separate files/backups.
    this.privateDb = open('credentials.sqlite');
    this.publicDb = open('snapshots.sqlite');
    this.lockDb = open('worker-lock.sqlite');
    this.privateDb.exec('CREATE TABLE IF NOT EXISTS connection (id INTEGER PRIMARY KEY CHECK(id=1), state TEXT NOT NULL)');
    this.privateDb.prepare('INSERT OR IGNORE INTO connection VALUES (1, ?)').run(JSON.stringify(initialState()));
    this.publicDb.exec('CREATE TABLE IF NOT EXISTS snapshots (resource TEXT PRIMARY KEY, generation INTEGER NOT NULL, payload TEXT, success INTEGER, attempted INTEGER NOT NULL, status TEXT NOT NULL, next_due INTEGER NOT NULL, failures INTEGER NOT NULL DEFAULT 0)');
  }

  state() { return JSON.parse(this.privateDb.prepare('SELECT state FROM connection WHERE id=1').get().state); }

  mutate(fn) {
    return this.privateDb.transaction(() => {
      const state = this.state();
      const result = fn(state);
      this.privateDb.prepare('UPDATE connection SET state=? WHERE id=1').run(JSON.stringify(state));
      return result;
    }).immediate();
  }

  binding(state) { return `psn:${this.expectedOnlineId}:${state.generation}:${state.version}`; }

  seal(session, state) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(this.binding(state)));
    const data = Buffer.concat([cipher.update(JSON.stringify(session)), cipher.final()]);
    return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
  }

  session() {
    const state = this.state();
    if (!state.sealed) return null;
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, Buffer.from(state.sealed.iv, 'base64'));
      decipher.setAAD(Buffer.from(this.binding(state)));
      decipher.setAuthTag(Buffer.from(state.sealed.tag, 'base64'));
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(state.sealed.data, 'base64')), decipher.final()]).toString());
    } catch { throw new ProviderError('credential-integrity-failed', 'storage'); }
  }

  connect(session) {
    this.mutate((state) => {
      if (state.sealed || state.status === 'connected') throw new ProviderError('disconnect-before-reconnecting', 'connection');
      state.generation++;
      state.version++;
      state.sealed = this.seal(session, state);
      state.status = 'connected';
      state.rotationPending = false;
      state.retryAt = 0;
    });
    this.publicDb.prepare('DELETE FROM snapshots').run();
  }

  beginRotation(generation, version) {
    this.mutate((s) => {
      if (s.status !== 'connected' || s.generation !== generation || s.version !== version || s.rotationPending) {
        throw new ProviderError('connection-changed', 'authentication');
      }
      s.rotationPending = true;
    });
  }

  saveRotated(session, generation, version) {
    this.mutate((s) => {
      if (s.status !== 'connected' || s.generation !== generation || s.version !== version) throw new ProviderError('connection-changed', 'authentication');
      s.version++;
      s.sealed = this.seal(session, s);
      s.rotationPending = false;
    });
  }

  disconnect() {
    // Invalidates in-flight writers immediately, even when a network job holds the lock.
    this.mutate((s) => Object.assign(s, initialState(), { status: 'disabled', generation: s.generation + 1, version: s.version + 1 }));
    this.publicDb.prepare('DELETE FROM snapshots').run();
  }

  publishMany(entries, generation, now) {
    if (this.state().generation !== generation || this.state().status !== 'connected') throw new ProviderError('connection-changed', 'storage');
    this.publicDb.transaction(() => {
      const put = this.publicDb.prepare('INSERT OR REPLACE INTO snapshots VALUES (?, ?, ?, ?, ?, ?, ?, 0)');
      for (const { resource, payload, nextDue } of entries) put.run(resource, generation, JSON.stringify(payload), now, now, 'ready', nextDue);
    })();
  }

  fail(resource, generation, status, now, nextDue, suppress = false) {
    if (this.state().generation !== generation || this.state().status !== 'connected') return;
    const old = this.get(resource);
    const keep = !suppress && old?.generation === generation;
    this.publicDb.prepare('INSERT OR REPLACE INTO snapshots VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(resource, generation, keep ? old.payloadJson : null, old?.generation === generation ? old.success : null, now, status, nextDue, (old?.failures || 0) + 1);
  }

  get(resource) {
    const row = this.publicDb.prepare('SELECT * FROM snapshots WHERE resource=?').get(resource);
    return row ? { ...row, payloadJson: row.payload, payload: row.payload === null ? null : JSON.parse(row.payload) } : null;
  }

  async withLock(fn) {
    if (this.locked) throw new ProviderError('busy', 'worker');
    try { this.lockDb.exec('BEGIN IMMEDIATE'); }
    catch { throw new ProviderError('busy', 'worker'); }
    this.locked = true;
    try { return await fn(); }
    finally { this.locked = false; this.lockDb.exec('ROLLBACK'); }
  }

  close() { this.privateDb.close(); this.publicDb.close(); this.lockDb.close(); }
}

module.exports = { PsnStore, keyFromHex };
