const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
async function verifyPassword(password, stored) {
  const [kind, salt, encoded] = String(stored).split(':');
  if (kind !== 'scrypt' || !/^[0-9a-f]{32}$/.test(salt) || !/^[0-9a-f]{128}$/.test(encoded)) return false;
  const hash = await scrypt(password, salt, 64);
  return crypto.timingSafeEqual(hash, Buffer.from(encoded, 'hex'));
}
const digestToken = value => crypto.createHash('sha256').update(value).digest('hex');
function accountInput(body) {
  if (!body || typeof body.username !== 'string' || !/^[A-Za-z0-9_]{3,24}$/.test(body.username) || typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) return null;
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : body.username;
  if (!displayName || [...displayName].length > 24 || /[\u0000-\u001f]/.test(displayName)) return null;
  return { username: body.username.toLowerCase(), password: body.password, displayName };
}
module.exports = { hashPassword, verifyPassword, digestToken, accountInput };
