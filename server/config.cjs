const fs = require('node:fs');
const path = require('node:path');
const configPath = () => path.resolve(process.env.CHEW_CONFIG || path.join(__dirname, '../.private/server.json'));
function loadConfig() {
  const config = JSON.parse(fs.readFileSync(configPath(), 'utf8').replace(/^\uFEFF/, ''));
  const origin = new URL(config.publicOrigin);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== config.publicOrigin) throw new Error('publicOrigin must be an HTTP(S) origin without a trailing slash.');
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('Invalid port.');
  if (!/^[a-zA-Z0-9_]{1,64}$/.test(config.mysql.database)) throw new Error('Invalid database name.');
  return config;
}
module.exports = { loadConfig, configPath };
