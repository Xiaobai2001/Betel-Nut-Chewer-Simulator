const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
async function backup(root, destination) {
  root = path.resolve(root); destination = path.resolve(destination);
  const privateRoot = path.join(root, '.private');
  const relative = path.relative(privateRoot, destination);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Backup must stay inside the existing private folder.');
  const config = JSON.parse((await fs.readFile(path.join(privateRoot, 'server.json'), 'utf8')).replace(/^\uFEFF/, ''));
  const mysql = createRequire(path.join(root, 'server/package.json'))('mysql2/promise');
  const connection = await mysql.createConnection({ ...config.mysql, charset: 'utf8mb4', timezone: 'Z', dateStrings: true, supportBigNumbers: true, bigNumberStrings: true });
  let file;
  try {
    const [tables] = await connection.query('SHOW FULL TABLES WHERE Table_type = ?', ['BASE TABLE']);
    const names = tables.map(row => Object.values(row)[0]).filter(name => /^chew_[a-z_]+$/.test(name)).sort();
    if (!names.includes('chew_users')) throw new Error('Existing account database was not found.');
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
    file = await fs.open(destination, 'wx', 0o600);
    await file.write("-- Chew Simulator account backup. Restore into an EMPTY database. Keep private.\nSET NAMES utf8mb4;\nSET TIME_ZONE='+00:00';\nSET SQL_MODE='';\nSET FOREIGN_KEY_CHECKS=0;\n");
    const counts = {};
    for (const name of names) {
      const [[schema]] = await connection.query('SHOW CREATE TABLE ' + mysql.escapeId(name));
      await file.write(schema['Create Table'] + ';\n');
      let offset = 0;
      while (true) {
        const [rows] = await connection.query('SELECT * FROM ' + mysql.escapeId(name) + ' LIMIT 500 OFFSET ' + offset);
        if (!rows.length) break;
        const columns = Object.keys(rows[0]);
        const values = rows.map(row => '(' + columns.map(key => mysql.escape(row[key] && typeof row[key] === 'object' && !Buffer.isBuffer(row[key]) ? JSON.stringify(row[key]) : row[key])).join(',') + ')');
        await file.write('INSERT INTO ' + mysql.escapeId(name) + ' (' + columns.map(mysql.escapeId).join(',') + ') VALUES\n' + values.join(',\n') + ';\n');
        offset += rows.length;
      }
      counts[name] = offset;
    }
    await file.write('SET FOREIGN_KEY_CHECKS=1;\n-- Backup complete\n'); await file.sync();
    await connection.commit(); return counts;
  } catch (error) { await connection.rollback().catch(() => {}); throw error; }
  finally { if (file) await file.close(); await connection.end(); }
}
if (require.main === module) backup(process.argv[2], process.argv[3]).then(counts => console.log('Database backup complete:', JSON.stringify(counts))).catch(error => { console.error('Backup failed:', error.code || error.message); process.exitCode = 1; });
module.exports = { backup };
