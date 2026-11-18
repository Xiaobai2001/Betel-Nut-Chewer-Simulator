const { test } = require('node:test');
const assert = require('node:assert/strict');
const Simulator = require('../app/model.js');
const { summarizeProgress, validCheckin, ACTIVITY_FIELDS, dayShift } = require('../server/progress.cjs');
const zero = () => Object.fromEntries(['nuts_started', ...ACTIVITY_FIELDS].map(key => [key, 0]));
test('all package tiers hold the requested quantity and preserve a nut from the previous bag', () => {
  for (const [tier, capacity] of [[50, 10], [100, 15], [200, 20]]) {
    const s = new Simulator(); s.chew(); s.changePack(tier);
    assert.equal(s.remaining, capacity); assert.equal(s.nut.pack, 50); assert.equal(s.nut.bites, 1);
    s.spitNut();
    for (let i = 0; i < capacity; i++) { assert.equal(s.take(), true); assert.equal(s.nut.pack, tier); s.spitNut(); }
    assert.equal(s.take(), false); assert.equal(s.remaining, 0);
  }
});
test('one box contains 20 cigarettes, relighting opens a new box only after it is empty', () => {
  const s = new Simulator();
  for (let i = 20; i > 0; i--) { assert.equal(s.light(), true); assert.equal(s.smokeRemaining, i - 1); assert.equal(s.light(), false); assert.equal(s.smokeRemaining, i - 1); s.extinguish(); }
  assert.equal(s.light(), true); assert.equal(s.smokeRemaining, 19);
});
test('batched burn events and frame-by-frame burn reach the same completion boundary', () => {
  const client = new Simulator(), server = new Simulator(); client.light(); server.light();
  for (let i = 0; i < 7; i++) { client.inhale(); client.exhale(); server.inhale(); server.exhale(); }
  for (let i = 0; i < 1999; i++) client.burn(.001);
  server.burn(1.999); assert.equal(client.cigarette.used, server.cigarette.used); assert.equal(client.cigarette.lit, true);
  client.burn(.001); server.burn(.001); assert.equal(client.cigarette.lit, false); assert.equal(server.cigarette.lit, false);
});
test('real abstinence never follows from missing simulation records; corrections revoke invalid streaks', () => {
  const total = zero(), today = '2026-11-18';
  let summary = summarizeProgress(total, total, [], today);
  assert.equal(summary.real.both.current, 0); assert.equal(summary.achievements.find(x => x.id === 'both_seven').unlocked, false);
  const rows = Array.from({ length: 7 }, (_, i) => ({ day: dayShift(today, -i), nut_free: 1, smoke_free: 1 }));
  summary = summarizeProgress(total, total, rows, today); assert.equal(summary.real.both.current, 7); assert.equal(summary.achievements.find(x => x.id === 'both_seven').unlocked, true);
  rows[3].smoke_free = 0;
  summary = summarizeProgress(total, total, rows, today); assert.equal(summary.real.both.current, 3); assert.equal(summary.real.both.best, 3); assert.equal(summary.real.nut.current, 7); assert.equal(summary.achievements.find(x => x.id === 'both_seven').unlocked, false);
  const oldRows = rows.map(row => ({ ...row, day: dayShift(row.day, -10) }));
  assert.equal(summarizeProgress(total, total, oldRows, today).real.nut.current, 0);
  assert.equal(summarizeProgress(total, total, oldRows, today).real.nut.best, 7);
});
test('checkins permit only a real date in the last seven China calendar days with strict booleans', () => {
  for (const day of ['2026-11-18','2026-11-12']) assert.equal(validCheckin({ day, nutFree: true, smokeFree: false }, '2026-11-18'), true);
  for (const day of ['2026-11-19','2026-11-11','2026-02-31']) assert.equal(validCheckin({ day, nutFree: true, smokeFree: true }, '2026-11-18'), false);
  assert.equal(validCheckin({ day: '2026-11-18', nutFree: 'false', smokeFree: true }, '2026-11-18'), false);
});
test('packaging equivalents separate old unclassified nuts, and cigarettes use 20 per box', () => {
  const total = { ...zero(), nuts_started: 52, nuts_50: 11, nuts_100: 15, nuts_200: 21, cigarettes_lit: 41 };
  const result = summarizeProgress(total, total, [], '2026-11-18');
  assert.deepEqual(result.packs.map(pack => [pack.whole, pack.remainder]), [[1,1],[1,0],[1,1]]);
  assert.equal(result.unknownLegacyNuts, 5); assert.equal(result.cigaretteBoxes.whole, 2); assert.equal(result.cigaretteBoxes.remainder, 1);
  assert.equal(result.achievements.filter(x => x.category === 'real' && x.unlocked).length, 0);
});
