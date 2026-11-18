const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const mysql = require('../server/node_modules/mysql2/promise');
const { initializeSchema } = require('../server/store.cjs');
(async () => {
  if (!process.env.TEST_MYSQL_PORT) throw new Error('Explicit isolated TEST_MYSQL_PORT required.');
  const folder = path.resolve(process.env.TEST_ACCOUNTS_PACKAGE || '.build/accounts-package-check');
  const database = 'chew_test_package_' + Date.now();
  const options = { host: '127.0.0.1', port: Number(process.env.TEST_MYSQL_PORT), user: 'root', password: process.env.TEST_MYSQL_PASSWORD || '' };
  const connection = await mysql.createConnection(options);
  await connection.query('CREATE DATABASE ' + mysql.escapeId(database));
  await connection.query('USE ' + mysql.escapeId(database)); await initializeSchema(connection);
  const publicOrigin = 'http://accounts-preview.test:4182', localOrigin = 'http://127.0.0.1:4182';
  const privateFolder = path.join(folder, '.private'); fs.mkdirSync(privateFolder, { recursive: true });
  fs.writeFileSync(path.join(privateFolder, 'server.json'), JSON.stringify({ host: '127.0.0.1', port: 4182, publicOrigin, mysql: { ...options, database } }));
  const child = spawn(process.execPath, [path.join(folder, 'server/index.cjs')], { cwd: folder, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', data => output += data); child.stderr.on('data', data => output += data);
  let browser;
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) { try { const health = await (await fetch(localOrigin + '/api/health')).json(); if (health.ok && health.version === require('../package.json').version) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.ok(ready, output);
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route(publicOrigin + '/**', async route => {
      const response = await route.fetch({ url: route.request().url().replace(publicOrigin, localOrigin) });
      await route.fulfill({ response });
    });
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(publicOrigin);
    assert.equal(await page.evaluate(() => isSecureContext), false);
    await page.locator('#account-open').click();
    assert.equal(await page.locator('#connection-note').isVisible(), true);
    await page.locator('#account-register-tab').click();
    await page.locator('#account-username').fill('public_http');
    await page.locator('#account-password').fill('test-http-password');
    await page.locator('#account-confirm').fill('test-http-password');
    await page.locator('#account-submit').click();
    await page.locator('#account-stats').waitFor({ state: 'visible' });
    await page.locator('#account-close').click(); await page.locator('#chew-button').click();
    await page.locator('#account-open').click(); await page.locator('#stats-refresh').click();
    await page.waitForFunction(() => document.querySelector('#stats-total-bites').textContent === '1');
    assert.deepEqual(errors, []);
    console.log('PASS: extracted package starts with installed lockfile dependencies; account registration and statistics work on non-secure public-style HTTP origin');
  } finally {
    if (browser) await browser.close();
    child.kill(); await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve));
    assert.match(database, /^chew_test_package_[0-9]+$/);
    await connection.query('DROP DATABASE ' + mysql.escapeId(database)); await connection.end();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
