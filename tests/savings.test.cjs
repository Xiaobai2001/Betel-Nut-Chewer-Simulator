const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validBaseline, summarizeSavings } = require('../server/savings.cjs');
const { publicId, sameId } = require('../server/identity.cjs');
const { synthesize } = require('../app/sound.js');
const baseline = { nutTier: 100, nutPriceCents: 10000, nutsPerDay: 1, smokePriceCents: 2000, cigarettesPerDay: 1 };
test('savings are absent until configured and use confirmed real-life days, with cumulative cent rounding', () => {
  const rows = ['2026-11-16','2026-11-17','2026-11-18'].map(day => ({ day, nut_free: 1, smoke_free: 0 }));
  assert.equal(summarizeSavings(null, rows, '2026-11-18').totalCents, null);
  let stats = summarizeSavings(baseline, rows, '2026-11-18');
  assert.equal(stats.nutCents, 2000); assert.equal(stats.todayCents, 667); assert.equal(stats.smokeCents, 0);
  rows[2].smoke_free = 1; rows[1].nut_free = 0;
  stats = summarizeSavings(baseline, rows, '2026-11-18'); assert.equal(stats.totalCents, 1433);
  stats = summarizeSavings({ ...baseline, nutPriceCents: 3000 }, rows, '2026-11-18'); assert.equal(stats.totalCents, 500);
  assert.equal(summarizeSavings(baseline, rows, '2026-11-15').totalCents, 0);
});
test('savings baseline accepts zero, all capacities, and rejects missing/fractional/unbounded values', () => {
  for (const tier of [50,100,200]) assert.equal(validBaseline({ ...baseline, nutTier: tier }), true);
  for (const bad of [{ nutPriceCents: 1.1 }, { nutsPerDay: -1 }, { cigarettesPerDay: 501 }, { smokePriceCents: 1000001 }, { nutTier: 80 }, { nutPriceCents: '100' }, { nutsPerDay: null }]) assert.equal(validBaseline({ ...baseline, ...bad }), false);
  const zero = { ...baseline, nutsPerDay: 0, cigarettesPerDay: 0 }; assert.equal(validBaseline(zero), true);
  assert.equal(summarizeSavings(zero, [{ day: '2026-11-18', nut_free: 1, smoke_free: 1 }], '2026-11-18').totalCents, 0);
});
test('large account IDs remain exact and cannot collide through float rounding', () => {
  assert.equal(publicId('123'), 123); assert.equal(publicId('9007199254740993'), '9007199254740993');
  assert.equal(sameId('9007199254740992', '9007199254740993'), false);
  assert.equal(sameId(9007199254740992, '9007199254740992'), false);
  assert.equal(sameId(123, '123'), true); assert.equal(sameId('00123', 123), false);
});
test('chewing, inhaling, exhaling and tearing produce distinct bounded, audible PCM with smooth edges', () => {
  const outputs = ['chew','inhale','exhale','pack'].map(kind => synthesize(kind, 44100));
  for (const pcm of outputs) {
    const rms = Math.sqrt(pcm.reduce((sum, n) => sum + n * n, 0) / pcm.length);
    assert.ok(rms > .015 && rms < .15); assert.ok(pcm.every(n => Number.isFinite(n) && Math.abs(n) <= .65));
    assert.equal(Math.abs(pcm[0]), 0); assert.ok(Math.abs(pcm.at(-1)) < .001);
  }
  assert.equal(new Set(outputs.map(pcm => pcm.length)).size, 4);
});
