const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('../server/node_modules/mysql2/promise');
const { backup } = require('../server/backup.cjs');
const { initializeSchema, dayInChina } = require('../server/store.cjs');
module.exports = async function (request, pool, config) {
  const [a, b] = await Promise.all(['savings_a','savings_b'].map(username => request('register', { username, password: 'savings-test-password' }, null, 201)));
  const uid = a.data.user.id, bid = b.data.user.id;
  assert.notEqual(uid, bid);
  const baseline = { nutTier: 100, nutPriceCents: 10000, nutsPerDay: 3, smokePriceCents: 2000, cigarettesPerDay: 10 };
  const day = dayInChina();
  await request('checkin', { accountId: uid, day, nutFree: true, smokeFree: true }, a.cookie);
  assert.equal((await request('stats', undefined, a.cookie)).data.savings.totalCents, null);
  await request('savings', { accountId: uid, baseline }, b.cookie, 403);
  await request('savings', { accountId: uid, baseline }, null, 401);
  await request('savings', { accountId: uid, baseline: { ...baseline, nutsPerDay: '3' } }, a.cookie, 400);
  await request('savings', { accountId: uid, baseline }, a.cookie);
  await request('savings', { accountId: uid, baseline }, a.cookie);
  assert.equal((await request('stats', undefined, a.cookie)).data.savings.totalCents, 3000);
  assert.equal((await request('stats', undefined, b.cookie)).data.savings.totalCents, null);
  const [[before]] = await pool.query('SELECT * FROM chew_users WHERE id=?', [uid]);
  await initializeSchema(pool); await initializeSchema(pool);
  const [[after]] = await pool.query('SELECT * FROM chew_users WHERE id=?', [uid]); assert.deepEqual(before, after);
  assert.equal((await request('stats', undefined, a.cookie)).data.savings.totalCents, 3000);
  await request('checkin', { accountId: uid, day, nutFree: false, smokeFree: true }, a.cookie);
  assert.equal((await request('stats', undefined, a.cookie)).data.savings.totalCents, 1000);
  await request('savings', { accountId: uid, baseline: { ...baseline, smokePriceCents: 3000 } }, a.cookie);
  assert.equal((await request('stats', undefined, a.cookie)).data.savings.totalCents, 1500);
  await request('savings', { accountId: uid, baseline: null }, a.cookie);
  assert.equal((await request('stats', undefined, a.cookie)).data.savings.totalCents, null);
  assert.equal((await request('stats', undefined, a.cookie)).data.progress.calendar[0].smokeFree, true);
  await request('savings', { accountId: uid, baseline }, a.cookie);

  await pool.query('ALTER TABLE chew_users AUTO_INCREMENT=9007199254740992');
  const [largeA, largeB] = await Promise.all(['large_a','large_b'].map(username => request('register', { username, password: 'large-id-test-password' }, null, 201)));
  assert.equal(typeof largeA.data.user.id, 'string'); assert.equal(typeof largeB.data.user.id, 'string');
  assert.notEqual(largeA.data.user.id, largeB.data.user.id);
  await request('savings', { accountId: largeA.data.user.id, baseline }, largeB.cookie, 403);
  await request('savings', { accountId: largeA.data.user.id, baseline }, largeA.cookie);
  assert.equal((await request('stats', undefined, largeA.cookie)).data.accountId, largeA.data.user.id);
  assert.equal((await request('stats', undefined, largeB.cookie)).data.savings.configured, false);

  // Restore a real SQL backup into another throwaway database, including large IDs and settings.
  const fixture = path.resolve('.build/backup-check-' + process.pid + '-' + Date.now());
  assert.ok(fixture.startsWith(path.resolve('.build') + path.sep));
  const restored = 'chew_test_restore_' + process.pid + '_' + Date.now();
  assert.match(restored, /^chew_test_restore_[0-9_]+$/);
  const admin = await mysql.createConnection({ ...config, multipleStatements: true, supportBigNumbers: true, bigNumberStrings: true });
  try {
    await fs.mkdir(path.join(fixture, '.private'), { recursive: true }); await fs.mkdir(path.join(fixture, 'server'), { recursive: true });
    await fs.copyFile('server/package.json', path.join(fixture, 'server/package.json'));
    await fs.cp('server/node_modules', path.join(fixture, 'server/node_modules'), { recursive: true });
    await fs.writeFile(path.join(fixture, '.private/server.json'), JSON.stringify({ mysql: config }));
    const file = path.join(fixture, '.private/database.sql');
    const counts = await backup(fixture, file); assert.ok(counts.chew_users >= 6);
    await assert.rejects(backup(fixture, path.join(fixture, 'app.sql')), /private folder/);
    await admin.query('CREATE DATABASE ' + mysql.escapeId(restored)); await admin.query('USE ' + mysql.escapeId(restored));
    await admin.query(await fs.readFile(file, 'utf8'));
    const [[user]] = await admin.query('SELECT * FROM chew_users WHERE id=?', [uid]);
    assert.equal(String(user.id), String(before.id)); assert.equal(user.password_hash, before.password_hash);
    const [[settings]] = await admin.query('SELECT baseline FROM chew_savings_settings WHERE user_id=?', [uid]);
    assert.deepEqual(typeof settings.baseline === 'string' ? JSON.parse(settings.baseline) : settings.baseline, baseline);
    await require('./update-installer.cjs')(fixture);
    const [next] = await admin.query("INSERT INTO chew_users(username,display_name,password_hash) VALUES('after_restore','restore','test')");
    assert.ok(BigInt(next.insertId) > BigInt(largeA.data.user.id) && BigInt(next.insertId) > BigInt(largeB.data.user.id));
  } finally {
    await admin.query('DROP DATABASE IF EXISTS ' + mysql.escapeId(restored)); await admin.end();
    await fs.rm(fixture, { recursive: true, force: true });
  }
  console.log('PASS: savings isolation, replay, corrections, baseline edits/clear, repeated upgrade, concurrent IDs beyond 2^53, and full SQL backup/restore preserving IDs and next AUTO_INCREMENT');
};
