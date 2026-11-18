const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');

(async () => {
  const root = path.resolve('成品/云服务器部署/site');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'release-manifest.json')));
  assert.equal(manifest.format, 'chew-static-release-v1');
  assert.equal(manifest.version, require('../package.json').version);
  for (const entry of manifest.files) {
    assert.ok(!entry.path.split('/').includes('..') && !entry.path.includes('\\') && !entry.path.includes(':'));
    const file = path.resolve(root, entry.path);
    assert.ok(file.startsWith(root + path.sep));
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), entry.sha256, entry.path);
    assert.ok(!/\.(jks|keystore|pem|key|pfx)$|password\.txt/i.test(entry.path));
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'downloads.json'))).otaAvailable, false);
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
  const server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : decodeURIComponent(name)));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.stat(file, (error, stat) => {
      if (error || !stat.isFile()) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Length': stat.size });
      if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const base = 'http://127.0.0.1:' + server.address().port;
    await page.goto(base); await page.locator('#chew-button').click();
    assert.equal(await page.locator('#wear-value').textContent(), '7');
    await page.goto(base + '/download.html');
    assert.equal(await page.locator('a').count(), 4);
    for (const href of await page.locator('a').evaluateAll(elements => elements.map(a => a.getAttribute('href')))) {
      const response = await fetch(new URL(href, base + '/download.html'), { method: 'HEAD' });
      assert.equal(response.status, 200, href);
    }
    fs.mkdirSync('.build/test-results', { recursive: true });
    await page.screenshot({ path: '.build/test-results/download-page.png', fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: publication hashes, no private files, web actions and all download links. IIS itself was not run.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
