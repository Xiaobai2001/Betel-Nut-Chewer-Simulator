const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  async function create(options = {}, fallback = false) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 940 }, ...options });
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(fallback => {
      window.soundStarts = []; window.soundStops = 0;
      const original = AudioContext.prototype.createBufferSource;
      AudioContext.prototype.createBufferSource = function () {
        const source = original.call(this), start = source.start.bind(source), stop = source.stop.bind(source);
        source.start = (...args) => {
          const pcm = source.buffer.getChannelData(0);
          window.soundStarts.push({ duration: source.buffer.duration, rms: Math.sqrt(pcm.reduce((sum,n) => sum + n*n,0)/pcm.length) }); return start(...args);
        };
        source.stop = (...args) => { window.soundStops++; return stop(...args); }; return source;
      };
      if (fallback) {
        const get = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type.includes('webgl') ? null : get.call(this, type, ...args); };
      }
    }, fallback);
    await page.goto('http://127.0.0.1:4173'); await page.locator('#open-immersive').click();
    await page.waitForFunction(() => document.querySelector('#immersive-scene').dataset.cigaretteBounds);
    return page;
  }
  async function dragSmoke(page, touch = false) {
    const host = page.locator('#immersive-scene'), rect = await host.boundingBox(), box = JSON.parse(await host.getAttribute('data-cigarette-bounds'));
    const rotation = await host.getAttribute('data-rotation');
    const x = rect.x + box.x + box.width / 2, y = rect.y + box.y + box.height / 2, dx = Math.min(110, rect.width * .15);
    if (touch) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - dx, y: y - 25 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach();
    } else {
      await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x - dx, y - 25, { steps: 5 }); await page.mouse.up();
    }
    await page.waitForFunction(() => document.querySelector('#immersive-scene').dataset.smokePosition);
    assert.equal(await host.getAttribute('data-rotation'), rotation, 'dragging a cigarette must not rotate the nut');
    const shifted = JSON.parse(await host.getAttribute('data-cigarette-bounds'));
    assert.ok(shifted.x < box.x - 20);
    await page.locator('#reset-rotation').click();
    assert.equal(await host.getAttribute('data-smoke-position'), '');
  }
  try {
    const page = await create();
    await dragSmoke(page);
    await page.keyboard.press('KeyL');
    for (let i=0;i<8;i++) { await page.keyboard.press('KeyI'); await page.keyboard.press('KeyO'); }
    await dragSmoke(page); // Even the short, burnt filter remains draggable.
    await page.keyboard.press('KeyM'); await page.keyboard.press('Space');
    await page.keyboard.press('KeyL'); await page.keyboard.press('KeyI'); await page.keyboard.press('KeyO');
    const sounds = await page.evaluate(() => soundStarts);
    for (const duration of [.46,.85,1.35]) assert.ok(sounds.some(sound => Math.abs(sound.duration-duration)<.001 && sound.rms>.015));
    const count = sounds.length; await page.keyboard.press('KeyM'); await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => soundStarts.length), count);
    assert.ok(await page.evaluate(() => soundStops > 0));
    await page.keyboard.press('Digit1'); await page.keyboard.press('Digit3');
    assert.equal(await page.locator('.pack-opening').count(), 1); assert.equal(await page.locator('.pack-opening').getAttribute('data-tier'), '200');
    await page.screenshot({ path: '.build/test-results/pack-opening.png' });
    await page.locator('.pack-opening').waitFor({ state: 'detached' });
    await page.screenshot({ path: '.build/test-results/immersive-spacing.png' });
    const phone = await create({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await dragSmoke(phone, true);
    assert.equal(await phone.evaluate(() => document.querySelector('#immersive').scrollWidth <= innerWidth), true);
    const fallback = await create({ reducedMotion: 'reduce' }, true); await dragSmoke(fallback);
    await fallback.keyboard.press('Digit2');
    assert.equal(await fallback.locator('.opening-bag').evaluate(el => getComputedStyle(el).animationName), 'none');
    await fallback.locator('.pack-opening').waitFor({ state: 'detached' });
    assert.deepEqual(errors, []);
    console.log('PASS: independent full/short-cigarette drag, touch and Canvas fallback, reset, real WebAudio signals and mute, repeated pack opening and reduced motion');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
