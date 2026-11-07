const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ProviderError, safeError } = require('../../src/shared/providerError');
const fail = code => { throw new ProviderError(code, 'miscrits-setup'); };

function extractApplicationCredential(log) {
  const candidates = new Set();
  for (const line of log.split(/\r?\n/)) {
    if (!line.includes('Sending request') || !line.includes('Method: POST')) continue;
    const uri = line.match(/Uri:\s*(https:\/\/[^,\s]+)/)?.[1];
    if (!uri) continue;
    let url;
    try { url = new URL(uri); } catch { continue; }
    if (url.origin !== 'https://worldofmiscrits.com' || url.username || url.password
      || !['/v2/account/authenticate/email', '/v2/account/session/refresh'].includes(url.pathname)) continue;
    const headers = line.match(/Headers:\s*(.*?)\s*,?\s*Body:/)?.[1];
    if (!headers) continue;
    for (const match of headers.matchAll(/["']?Authorization["']?\s*:\s*["']?Basic\s+([A-Za-z0-9+/]+={0,2})/g)) {
      const value = match[1];
      const decoded = Buffer.from(value, 'base64');
      // Nakama HTTP Basic uses the client key as username and an empty password.
      if (decoded.toString('base64') !== value || !decoded.toString('utf8').endsWith(':')) continue;
      candidates.add(value);
    }
  }
  if (candidates.size !== 1) fail(candidates.size ? 'ambiguous-application-credential' : 'application-credential-not-found');
  return [...candidates][0];
}
function defaultLogPath(platform = process.platform, home = os.homedir(), env = process.env) {
  const data = platform === 'darwin' ? path.join(home, 'Library', 'Application Support')
    : platform === 'win32' ? (env.APPDATA || path.join(home, 'AppData', 'Roaming'))
    : (env.XDG_DATA_HOME || path.join(home, '.local', 'share'));
  return path.join(data, platform === 'linux' ? 'godot' : 'Godot', 'app_userdata', 'Miscrits', 'logs', 'godot.log');
}
function readApplicationCredential(logFile = defaultLogPath()) {
  const fd = fs.openSync(logFile, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  let value;
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > 32 * 1024 * 1024) fail('invalid-or-oversized-game-log');
    value = extractApplicationCredential(fs.readFileSync(fd, 'utf8'));
  } finally { fs.closeSync(fd); }
  return value;
}
function importCredential(logFile, output) {
  const value = readApplicationCredential(logFile);
  const directory = path.dirname(output);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  // Never overwrite existing credentials or follow an output symlink.
  fs.writeFileSync(output, value + '\n', { flag: 'wx', mode: 0o600 });
}
function main(args = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--log-file', '--output'].includes(args[i]) || !args[i + 1] || options[args[i]]) fail('invalid-command-options');
    options[args[i]] = args[i + 1];
  }
  const output = path.resolve(options['--output'] || '.private/miscrits-application.key');
  importCredential(options['--log-file'] || defaultLogPath(), output);
  console.log('Application credential saved privately. Set MISCRITS_APPLICATION_CREDENTIAL_FILE to this output path locally, or copy its value privately into MISCRITS_APPLICATION_CREDENTIAL in your hosting settings. No account credentials or tokens were exported.');
}
if (require.main === module) {
  try { main(); }
  catch (error) {
    console.error('Miscrits ' + safeError(error) + '. Use a local game log from a recent login; never paste logs or credentials into chat.');
    process.exitCode = 1;
  }
}
module.exports = { extractApplicationCredential, readApplicationCredential, importCredential, defaultLogPath, main };
