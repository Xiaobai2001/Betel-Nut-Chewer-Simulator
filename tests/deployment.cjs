const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');

(async () => {
  const webOnly = process.argv.includes('--web-only');
  const root = path.resolve(webOnly ? '成品/网页服务器部署/site' : '成品/云服务器部署/site');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'release-manifest.json')));
  assert.equal(manifest.format, 'chew-static-release-v1');
  assert.equal(manifest.version, require('../package.json').version);
  for (const entry of manifest.files) {
    assert.ok(!entry.path.split('/').includes('..') && !entry.path.includes('\\') && !entry.path.includes(':'));
    const file = path.resolve(root, entry.path);
    assert.ok(file.startsWith(root + path.sep));
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), entry.sha256, entry.path);
    assert.ok(!/\.(jks|keystore|pem|key|pfx)$|password\.txt/i.test(entry.path));
    if (webOnly) assert.ok(!/\.(exe|apk|zip)$/i.test(entry.path));
  }
  if (webOnly) {
    assert.equal(fs.existsSync(path.join(root, 'downloads')), false);
    assert.equal(fs.existsSync(path.join(root, 'download.html')), false);
  } else assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'downloads.json'))).otaAvailable, false);
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
    const origin = webOnly ? 'http://web-preview.test' : base;
    if (webOnly) {
      // Exercise a non-localhost HTTP origin, as on the IP-only cloud server.
      await page.route(origin + '/**', async route => {
        const url = new URL(route.request().url());
        const response = await route.fetch({ url: base + url.pathname + url.search });
        await route.fulfill({ response });
      });
    }
    await page.goto(origin); await page.locator('#chew-button').click();
    assert.equal(await page.locator('#wear-value').textContent(), '7');
    fs.mkdirSync('.build/test-results', { recursive: true });
    if (webOnly) {
      assert.equal(await page.evaluate(() => isSecureContext), false);
      await page.locator('#open-immersive').click();
      await page.waitForFunction(() => document.querySelector('#immersive-scene').dataset.renderer === 'webgl');
      await page.waitForFunction(() => document.fullscreenElement === document.documentElement);
      const rotation = await page.locator('#immersive-scene').getAttribute('data-rotation');
      await page.keyboard.press('ArrowLeft');
      assert.notEqual(await page.locator('#immersive-scene').getAttribute('data-rotation'), rotation);
      await page.keyboard.press('Space'); await page.keyboard.press('KeyQ');
      await page.waitForFunction(() => Number(document.querySelector('#immersive-scene').dataset.landed) > 0);
      await page.keyboard.press('KeyL'); await page.keyboard.press('KeyI'); await page.keyboard.press('KeyO');
      await page.keyboard.press('KeyX'); await page.keyboard.press('KeyL');
      assert.equal(await page.locator('#immersive [data-action="inhale"]').isEnabled(), true);
      await page.keyboard.press('Digit3');
      assert.equal(await page.locator('[data-immersive-pack="200"]').getAttribute('aria-pressed'), 'true');
      await page.screenshot({ path: '.build/test-results/web-http-immersive.png' });
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#immersive').isHidden(), true);
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.locator('#chew-button').click();
      assert.equal(await page.locator('#wear-value').textContent(), '21');
      await page.screenshot({ path: '.build/test-results/web-http-mobile.png', fullPage: true });
    } else {
      await page.goto(base + '/download.html');
      assert.equal(await page.locator('a').count(), 4);
      for (const href of await page.locator('a').evaluateAll(elements => elements.map(a => a.getAttribute('href')))) {
        const response = await fetch(new URL(href, base + '/download.html'), { method: 'HEAD' });
        assert.equal(response.status, 200, href);
      }
      await page.screenshot({ path: '.build/test-results/download-page.png', fullPage: true });
    }
    assert.deepEqual(errors, []);
    console.log(webOnly ? 'PASS: web-only hashes, insecure HTTP origin, full-screen 3D, rotation, spitting, smoke, packs and mobile layout. IIS itself was not run.' : 'PASS: publication hashes, no private files, web actions and all download links. IIS itself was not run.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
