const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
module.exports = async function (origin) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 940 }, serviceWorkers: 'block' });
  const errors = []; context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  fs.mkdirSync('.build/test-results', { recursive: true });
  let blockEvents = false, loseAcknowledgement = false;
  await context.route('**/api/events', async route => {
    if (blockEvents) return route.abort();
    if (loseAcknowledgement) { loseAcknowledgement = false; await route.fetch(); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage();
  const total = async p => p.evaluate(async () => (await (await fetch('/api/stats')).json()).total?.bites);
  const waitTotal = async (p, value) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) { if (await total(p) === value) return; await p.waitForTimeout(250); }
    assert.equal(await total(p), value);
  };
  const clicks = async (p, selector, count) => p.locator(selector).evaluate((el, n) => { for (let i = 0; i < n; i++) el.click(); }, count);
  const register = async (p, username) => {
    await p.locator('#account-register-tab').click();
    await p.locator('#account-username').fill(username); await p.locator('#account-password').fill('browser-test-password');
    await p.locator('#account-confirm').fill('browser-test-password');
    await p.locator('#account-nickname').fill(username === 'browser_a' ? '小白的模拟记录' : '另一个账号');
    await p.locator('#account-submit').click();
    await p.locator('#account-stats').waitFor({ state: 'visible' });
    await p.locator('#stats-content').waitFor({ state: 'visible' });
  };
  try {
    await page.goto(origin);
    await page.locator('#chew-button').click();
    await page.locator('#account-open').click(); await register(page, 'browser_a');
    assert.equal(await page.locator('#bite-count').textContent(), '00');
    await page.locator('#account-close').focus(); await page.keyboard.press('KeyL'); await page.keyboard.press('KeyA');
    assert.equal(await page.locator('#auto-chew').isChecked(), false); assert.equal(await page.locator('#inhale').isDisabled(), true);
    await page.locator('#account-close').click();
    await clicks(page, '#chew-button', 5); await page.locator('#spit-nut').click(); await page.locator('#chew-button').click(); await clicks(page, '#chew-button', 15);
    await page.locator('#account-open').click(); await page.locator('#stats-refresh').click();
    await page.waitForFunction(() => document.querySelector('#stats-total-bites').textContent === '20');
    assert.equal(await page.locator('#stats-total-nuts_started').textContent(), '2');
    assert.equal(await page.locator('#stats-total-nuts_completed').textContent(), '1');
    await page.screenshot({ path: '.build/test-results/accounts-desktop.png' });
    await page.reload(); await page.waitForFunction(() => document.querySelector('#account-open').textContent.includes('小白'));
    assert.equal(await page.locator('#bite-count').textContent(), '00'); await waitTotal(page, 20);
    blockEvents = true; await clicks(page, '#chew-button', 3);
    assert.ok(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('chew-event-v1:')).length >= 3));
    await page.reload(); await page.waitForFunction(() => document.querySelector('#account-open').textContent.includes('小白'));
    await clicks(page, '#chew-button', 2); blockEvents = false; await waitTotal(page, 25);
    loseAcknowledgement = true; await clicks(page, '#chew-button', 1); await waitTotal(page, 26);
    await page.waitForFunction(() => !Object.keys(localStorage).some(key => key.startsWith('chew-event-v1:')), { timeout: 15000 });
    assert.equal(await total(page), 26);
    const other = await context.newPage(); await other.goto(origin);
    await other.waitForFunction(() => document.querySelector('#account-open').textContent.includes('小白'));
    await Promise.all([clicks(page, '#chew-button', 2), clicks(other, '#chew-button', 2)]); await waitTotal(page, 30);
    await other.locator('#account-open').click(); await other.locator('#account-logout').click(); await other.locator('#account-auth').waitFor({ state: 'visible' });
    await register(other, 'browser_b'); assert.equal(await total(other), 0);
    await page.waitForFunction(() => document.querySelector('#account-open').textContent.includes('另一个'));
    assert.equal(await page.locator('#bite-count').textContent(), '00');
    await other.locator('#account-close').click(); await clicks(other, '#chew-button', 1); await waitTotal(other, 1);
    await other.locator('#account-open').click(); await other.locator('#account-logout').click(); await other.locator('#account-auth').waitFor({ state: 'visible' });
    await other.locator('[data-auth-mode="login"]').click(); await other.locator('#account-username').fill('browser_a'); await other.locator('#account-password').fill('browser-test-password'); await other.locator('#account-submit').click();
    await other.locator('#account-stats').waitFor({ state: 'visible' }); await waitTotal(other, 30);
    await other.setViewportSize({ width: 390, height: 844 }); await other.locator('#stats-refresh').click();
    await other.screenshot({ path: '.build/test-results/accounts-phone.png' });
    assert.equal(await other.locator('#account-dialog').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
    assert.deepEqual(errors, []);
    console.log('PASS: browser self-registration, guest separation, 20 bites / 2 started / 1 completed, reload persistence, offline queue across reload, lost response retry, simultaneous tabs, account switching, dialog shortcuts, mobile stats');
  } finally { await browser.close(); }
};
