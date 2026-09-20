const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_FILE = path.join(process.cwd(), 'config', 'game-identities.json');
const PROVIDERS = new Set(['steam', 'psn', 'epic', 'playnite', 'valorant']);
const id = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,127}$/.test(value);
const text = (value, max = 512) => typeof value === 'string' && value.length > 0 && value.length <= max;

function loadRegistry(file = process.env.AGGREGATE_IDENTITIES_FILE || DEFAULT_FILE) {
  const resolved = path.resolve(file);
  const stat = fs.statSync(resolved);
  if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error('Invalid aggregate identity registry');
  const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.games) || parsed.games.length > 10000) {
    throw new Error('Invalid aggregate identity registry');
  }
  const workIds = new Set();
  const referenceKeys = new Set();
  for (const work of parsed.games) {
    if (!id(work?.id) || !text(work.name) || !Array.isArray(work.editions) || !work.editions.length || workIds.has(work.id)) {
      throw new Error('Invalid aggregate identity registry');
    }
    workIds.add(work.id);
    const editionIds = new Set();
    for (const edition of work.editions) {
      if (!id(edition?.id) || !text(edition.name, 256) || !Array.isArray(edition.references) || editionIds.has(edition.id)) {
        throw new Error('Invalid aggregate identity registry');
      }
      editionIds.add(edition.id);
      for (const reference of edition.references) {
        const key = `${reference?.provider}:${reference?.id}`;
        if (!PROVIDERS.has(reference?.provider) || !text(reference?.id, 512) || !id(reference?.copy) || referenceKeys.has(key)) {
          throw new Error('Invalid aggregate identity registry');
        }
        referenceKeys.add(key);
      }
    }
  }
  return parsed.games;
}

function buildRegistry(entries = loadRegistry()) {
  const references = new Map();
  const works = new Map();
  for (const work of entries) {
    works.set(work.id, work);
    for (const edition of work.editions) {
      for (const reference of edition.references) {
        references.set(`${reference.provider}:${reference.id}`, {
          workId: work.id,
          workName: work.name,
          editionId: edition.id,
          editionName: edition.name,
          copy: reference.copy,
        });
      }
    }
  }
  return { references, works };
}

module.exports = { DEFAULT_FILE, loadRegistry, buildRegistry };
