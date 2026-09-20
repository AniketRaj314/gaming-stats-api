const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ProviderError } = require('../shared/providerError');

const TYPES = new Map([
  ['image/jpeg', '.jpg'], ['image/png', '.png'], ['image/webp', '.webp'], ['image/avif', '.avif'],
]);

function matchesImageType(body, contentType) {
  if (contentType === 'image/jpeg') return body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
  if (contentType === 'image/png') return body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (contentType === 'image/webp') return body.length >= 12 && body.toString('ascii', 0, 4) === 'RIFF' && body.toString('ascii', 8, 12) === 'WEBP';
  if (contentType === 'image/avif') return body.length >= 12 && body.toString('ascii', 4, 12).includes('ftypavif');
  return false;
}

class PlayniteStore {
  constructor(directory) {
    if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) throw new ProviderError('unsafe-storage-path', 'storage');
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.chmodSync(directory, 0o700);
    this.directory = directory;
    this.assetsDirectory = path.join(directory, 'assets');
    if (fs.existsSync(this.assetsDirectory) && fs.lstatSync(this.assetsDirectory).isSymbolicLink()) throw new ProviderError('unsafe-storage-path', 'storage');
    fs.mkdirSync(this.assetsDirectory, { recursive: true, mode: 0o700 });
    fs.chmodSync(this.assetsDirectory, 0o700);
  }

  file(resource) {
    if (!['library', 'presence'].includes(resource)) throw new ProviderError('invalid-resource', 'storage');
    return path.join(this.directory, `${resource}.json`);
  }

  read(resource) {
    try {
      const file = this.file(resource);
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32 * 1024 * 1024) throw new Error();
      const row = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!row || !Number.isSafeInteger(row.receivedAt) || !Number.isSafeInteger(row.sequence) || !row.payload) throw new Error();
      return row;
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw new ProviderError('snapshot-corrupt', 'storage');
    }
  }

  write(resource, payload, receivedAt) {
    const old = this.read(resource);
    if (old && old.payload.deviceId === payload.deviceId && payload.sequence <= old.sequence) {
      throw new ProviderError('stale-sequence', 'schema');
    }
    const file = this.file(resource);
    const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
    let descriptor;
    try {
      descriptor = fs.openSync(temporary, 'wx', 0o600);
      fs.writeFileSync(descriptor, JSON.stringify({ payload, receivedAt, sequence: payload.sequence }));
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      fs.renameSync(temporary, file);
      fs.chmodSync(file, 0o600);
    } catch (error) {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      try { fs.unlinkSync(temporary); } catch {}
      if (error instanceof ProviderError) throw error;
      throw new ProviderError('snapshot-write-failed', 'storage');
    }
  }

  assetPath(hash, contentType) {
    const extension = TYPES.get(contentType);
    if (!extension || !/^[a-f\d]{64}$/.test(hash)) throw new ProviderError('invalid-asset', 'storage');
    return path.join(this.assetsDirectory, `${hash}${extension}`);
  }

  findAsset(hash) {
    if (!/^[a-f\d]{64}$/.test(hash)) return null;
    for (const [contentType, extension] of TYPES) {
      const file = path.join(this.assetsDirectory, `${hash}${extension}`);
      try {
        const stat = fs.lstatSync(file);
        if (stat.isFile() && !stat.isSymbolicLink() && stat.size <= 12 * 1024 * 1024) return { file, contentType, size: stat.size };
      } catch (error) { if (error?.code !== 'ENOENT') throw new ProviderError('asset-corrupt', 'storage'); }
    }
    return null;
  }

  writeAsset(hash, contentType, body) {
    if (!Buffer.isBuffer(body) || body.length === 0 || body.length > 12 * 1024 * 1024 || !matchesImageType(body, contentType)) {
      throw new ProviderError('invalid-asset', 'schema');
    }
    const actual = crypto.createHash('sha256').update(body).digest('hex');
    if (actual !== hash) throw new ProviderError('asset-hash-mismatch', 'schema');
    const existing = this.findAsset(hash);
    if (existing) {
      if (existing.contentType !== contentType) throw new ProviderError('asset-type-mismatch', 'schema');
      return existing;
    }
    const file = this.assetPath(hash, contentType);
    const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
    let descriptor;
    try {
      descriptor = fs.openSync(temporary, 'wx', 0o600);
      fs.writeFileSync(descriptor, body);
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      fs.renameSync(temporary, file);
      fs.chmodSync(file, 0o600);
      return { file, contentType, size: body.length };
    } catch {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      try { fs.unlinkSync(temporary); } catch {}
      throw new ProviderError('asset-write-failed', 'storage');
    }
  }
}

module.exports = { PlayniteStore };
