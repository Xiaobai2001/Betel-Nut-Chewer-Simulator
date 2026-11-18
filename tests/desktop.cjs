const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

(async () => {
  const executablePath = path.resolve(process.argv[2] || '.build/releases/windows/ChewSimulator-Windows.exe');
  const profile = path.resolve('.build/desktop-test-profile');
  fs.mkdirSync('.build/test-results', { recursive: true });
  fs.mkdirSync(profile, { recursive: true });
  const activePort = path.join(profile, 'DevToolsActivePort');
  fs.rmSync(activePort, { force: true });
  const child = spawn(executablePath, ['--remote-debugging-port=0', '--user-data-dir=' + profile], { stdio: 'ignore' });
  let launchError; child.on('error', error => { launchError = error; });
  const deadline = Date.now() + 45000;
  while (!fs.existsSync(activePort) && Date.now() < deadline && !launchError) await new Promise(resolve => setTimeout(resolve, 250));
  if (launchError) throw launchError;
  assert.ok(fs.existsSync(activePort), 'Portable executable exposes its test connection');
  const port = Number(fs.readFileSync(activePort, 'utf8').split('\n')[0]);
  const browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
  let page;
  try {
    const context = browser.contexts()[0];
    page = context.pages()[0] || await context.waitForEvent('page');
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.waitForLoadState('domcontentloaded');
    assert.match(await page.title(), /嚼槟榔模拟器/);
    await page.locator('#chew-button').click();
    assert.equal(await page.locator('#wear-value').textContent(), '7');
    await page.locator('#light-cigarette').click();
    await page.locator('#inhale').click(); await page.locator('#exhale').click();
    await page.locator('#spit-nut').click();
    assert.equal(await page.locator('#total-discarded').textContent(), '1');
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    assert.equal(await page.evaluate(() => typeof window.process), 'undefined');
    await page.locator('#extinguish').click();
    assert.equal(await page.locator('#light-cigarette').isEnabled(), true);
    await page.locator('#open-immersive').click();
    await page.waitForFunction(() => document.fullscreenElement === document.documentElement);
    await page.waitForFunction(() => document.querySelector('#immersive-scene').dataset.renderer);
    console.log('Immersive renderer:', await page.locator('#immersive-scene').getAttribute('data-renderer'));
    await page.keyboard.press('Space'); await page.keyboard.press('Space');
    await page.keyboard.press('KeyL'); await page.keyboard.press('KeyI'); await page.keyboard.press('KeyO');
    assert.equal(await page.locator('#wear-value').textContent(), '7');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.resolve('.build/test-results/windows-immersive.png') });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('#immersive').hidden && !document.fullscreenElement);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.resolve('.build/test-results/windows-app.png') });
    assert.deepEqual(errors, []);
    console.log('PASS: packaged Windows executable launched; chew/smoke/spit actions and renderer isolation verified');
  } finally {
    if (page) await page.evaluate(() => window.close()).catch(() => {});
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
