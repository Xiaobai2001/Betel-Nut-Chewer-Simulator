const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const { initializeSchema } = require('./store.cjs');
const { configPath, loadConfig } = require('./config.cjs');
async function setup() {
  const destination = configPath();
  if (fs.existsSync(destination)) { loadConfig(); console.log('Existing configuration preserved.'); return; }
  const origin = new URL(process.env.CHEW_PUBLIC_ORIGIN || 'http://localhost:8081');
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== process.env.CHEW_PUBLIC_ORIGIN) throw new Error('Set CHEW_PUBLIC_ORIGIN to the full public origin without a trailing slash.');
  const port = Number(process.env.CHEW_PORT || 8081);
  const database = 'chew_simulator';
  const host = process.env.CHEW_DB_HOST || '127.0.0.1';
  // The Windows installer connects to MySQL on the same server.
  if (!['127.0.0.1', 'localhost'].includes(host)) throw new Error('This installer requires local MySQL.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid web port.');
  if (!process.env.CHEW_ADMIN_PASSWORD) throw new Error('MySQL administrator password is required.');
  const connection = await mysql.createConnection({
    host, port: Number(process.env.CHEW_DB_PORT || 3306), user: process.env.CHEW_ADMIN_USER || 'root',
    password: process.env.CHEW_ADMIN_PASSWORD, charset: 'utf8mb4'
  });
  let createdUser = null, configWritten = false;
  try {
    await connection.query('CREATE DATABASE IF NOT EXISTS ' + mysql.escapeId(database) + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    await connection.query('USE ' + mysql.escapeId(database));
    await initializeSchema(connection);
    const username = 'chew_app_' + crypto.randomBytes(4).toString('hex');
    const password = crypto.randomBytes(32).toString('base64url');
    await connection.query("CREATE USER ?@'localhost' IDENTIFIED BY ?", [username, password]);
    createdUser = username;
    await connection.query("GRANT SELECT,INSERT,UPDATE,DELETE ON " + mysql.escapeId(database) + ".* TO ?@'localhost'", [username]);
    const config = { host: '0.0.0.0', port, publicOrigin: origin.origin, allowRegistration: true, mysql: { host, port: Number(process.env.CHEW_DB_PORT || 3306), user: username, password, database } };
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, JSON.stringify(config, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    configWritten = true;
    console.log('Database and limited service account ready. Private configuration saved.');
  } finally {
    if (createdUser && !configWritten) await connection.query("DROP USER ?@'localhost'", [createdUser]).catch(() => {});
    await connection.end();
  }
}
setup().catch(error => { console.error('Setup failed:', error.code || error.message); process.exitCode = 1; });
