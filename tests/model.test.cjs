const { test } = require('node:test');
const assert = require('node:assert/strict');
const Simulator = require('../app/model.js');

test('chewing progresses to full wear and then stops; spitting allows a fresh nut', () => {
  const s = new Simulator();
  for (let i = 0; i < 15; i++) assert.equal(s.chew(), true);
  assert.equal(s.nut.wear, 100); assert.equal(s.chew(), false); assert.equal(s.totalBites, 15);
  assert.equal(s.spitNut(), true); assert.equal(s.chew(), false); assert.equal(s.spitNut(), false);
  assert.equal(s.take(), true); assert.equal(s.nut.wear, 0); assert.equal(s.remaining, 8);
});
test('spitting fibers preserves wear and cannot repeat without more chewing', () => {
  const s = new Simulator(); assert.equal(s.spitFibers(), false); s.chew(); s.chew();
  assert.equal(s.spitFibers(), true); assert.equal(s.nut.wear, 14); assert.equal(s.nut.fibers, 0);
  assert.equal(s.spitFibers(), false); assert.equal(s.spits, 1);
});
test('pack changes retain the current nut and inventory cannot go below zero', () => {
  const s = new Simulator(); s.chew(); assert.equal(s.changePack(100), true);
  assert.equal(s.nut.pack, 50); assert.equal(s.nut.bites, 1); assert.equal(s.remaining, 15);
  s.spitNut(); for (let i = 0; i < 15; i++) { assert.equal(s.take(), true); assert.equal(s.nut.pack, 100); s.spitNut(); }
  assert.equal(s.remaining, 0); assert.equal(s.take(), false); assert.equal(s.changePack(500), false);
});
test('smoking requires lighting and alternating inhale/exhale; last puff can be exhaled', () => {
  const s = new Simulator(); assert.equal(s.inhale(), false); assert.equal(s.exhale(), false);
  s.spitNut(); assert.equal(s.light(), true); s.take();
  assert.equal(s.light(), false); assert.equal(s.inhale(), true); assert.equal(s.inhale(), false);
  assert.equal(s.exhale(), true); assert.equal(s.exhale(), false);
  s.burn(85); assert.equal(s.inhale(), true); assert.equal(s.cigarette.lit, false);
  assert.equal(s.cigarette.holding, true); assert.equal(s.exhale(), true);
  assert.equal(s.light(), true); s.burn(101); assert.equal(s.cigarette.lit, false);
});
test('an empty mouth never blocks a new cigarette after burnout or extinction', () => {
  const s = new Simulator(); s.spitNut();
  assert.equal(s.light(), true); s.burn(100); assert.equal(s.light(), true);
  s.extinguish(); assert.equal(s.light(), true);
  for (let i = 0; i < 8; i++) { assert.equal(s.inhale(), true); if (i < 7) s.exhale(); }
  assert.equal(s.cigarette.lit, false); assert.equal(s.cigarette.holding, true);
  assert.equal(s.light(), true); assert.equal(s.cigarette.holding, false);
  assert.equal(s.cigarette.used, 0); assert.equal(s.cigarette.puffs, 0);
});
test('putting down clears both simulations, including held smoke', () => {
  const s = new Simulator(); s.light(); s.inhale(); s.putDown();
  assert.equal(s.nut, null); assert.equal(s.cigarette.lit, false); assert.equal(s.cigarette.holding, false);
});
