const { prompt } = require('./prompt');
const { readApplicationCredential } = require('./import-application-credential');
const { ProviderError } = require('../../src/shared/providerError');

async function guidedCredentials({ applicationCredential = '', logFile, ask = prompt,
  readApplication = readApplicationCredential, output = process.stderr } = {}) {
  let application = applicationCredential;
  if (!application) {
    try {
      application = readApplication(logFile);
      output.write('Imported the application credential from the local game login log.\n');
    } catch (error) {
      if (!['ENOENT', 'application-credential-not-found', 'ambiguous-application-credential'].includes(error.code)) throw error;
      output.write('No unambiguous local application credential is available. Paste the value imported on your gaming computer, without the Basic prefix.\n');
      application = (await ask('Application credential')).trim();
    }
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(application)) throw new ProviderError('invalid-application-credential', 'setup');
  const username = (await ask('Miscrits username', { hidden: false })).trim();
  if (!username) throw new ProviderError('invalid-username', 'setup');
  const password = await ask('Miscrits password');
  if (!password) throw new ProviderError('invalid-password', 'setup');
  return { username, password, applicationCredential: application };
}
module.exports = { guidedCredentials };
