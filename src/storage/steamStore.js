const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ProviderError } = require('../shared/providerError');

class SteamStore {
  constructor(directory) {
    if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) {
      throw new ProviderError('unsafe-storage-path', 'storage');
    }
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.chmodSync(directory, 0o700);
    this.directory = directory;
    this.gamesDirectory = path.join(directory, 'games');
    if (fs.existsSync(this.gamesDirectory) && fs.lstatSync(this.gamesDirectory).isSymbolicLink()) {
      throw new ProviderError('unsafe-storage-path', 'storage');
    }
    fs.mkdirSync(this.gamesDirectory, { recursive: true, mode: 0o700 });
    fs.chmodSync(this.gamesDirectory, 0o700);
  }

  file(resource) {
    if (['profile', 'library', 'recent', 'badges'].includes(resource)) return path.join(this.directory, `${resource}.json`);
    const match = /^game:(\d{1,10})$/.exec(resource);
    if (match) return path.join(this.gamesDirectory, `${match[1]}.json`);
    throw new ProviderError('invalid-resource', 'storage');
  }

  get(resource) {
    const file = this.file(resource);
    try {
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16 * 1024 * 1024) throw new Error();
      const row = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!row || typeof row !== 'object' || !Number.isFinite(row.attempted) || !Number.isFinite(row.nextDue)) throw new Error();
      return row;
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw new ProviderError('snapshot-corrupt', 'storage');
    }
  }

  write(resource, row) {
    const file = this.file(resource);
    const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
    let descriptor;
    try {
      descriptor = fs.openSync(temporary, 'wx', 0o600);
      fs.writeFileSync(descriptor, JSON.stringify(row));
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      fs.renameSync(temporary, file);
      fs.chmodSync(file, 0o600);
    } catch (error) {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      try { fs.unlinkSync(temporary); } catch {}
      throw new ProviderError('snapshot-write-failed', 'storage');
    }
  }

  publish(resource, payload, now, nextDue) {
    this.write(resource, { payload, success: now, attempted: now, status: 'ready', nextDue, failures: 0 });
  }

  fail(resource, status, now, nextDue, suppress = false) {
    let old;
    try { old = this.get(resource); }
    catch (error) {
      if (!(error instanceof ProviderError && error.code === 'snapshot-corrupt')) throw error;
      old = null;
    }
    this.write(resource, {
      payload: !suppress && old?.payload ? old.payload : null,
      success: !suppress && old?.payload ? old.success : null,
      attempted: now,
      status,
      nextDue,
      failures: (old?.failures || 0) + 1,
    });
  }
}

module.exports = { SteamStore };
