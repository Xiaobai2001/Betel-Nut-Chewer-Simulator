const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { dayInChina } = require('../server/store.cjs');
const { dayShift } = require('../server/progress.cjs');
const LegacySimulator = require('../server/legacy-model.cjs');
module.exports = async function (request, pool, otherCookie, otherId) {
  const user = await request('register', { username: 'progress_tester', password: 'progress-test-password' }, null, 201);
  const id = user.data.user.id, cookie = user.cookie, runId = crypto.randomUUID(), events = [];
  const add = (type, value) => events.push({ seq: events.length + 1, type, ...(value === undefined ? {} : { value }) });
  for (const [tier, size] of [[50, 10], [100, 15], [200, 20]]) {
    if (tier !== 50) add('pack', tier);
    for (let i = 0; i < size; i++) {
      if (tier !== 50 || i > 0) add('take');
      for (let bite = 0; bite < (tier === 100 && i === 0 ? 15 : 1); bite++) add('chew');
      add('discard');
    }
  }
  for (let i = 0; i < 20; i++) { add('light'); add('inhale'); add('extinguish'); }
  add('light'); add('burn', 100000);
  add('light'); for (let i = 0; i < 8; i++) { add('inhale'); add('exhale'); }
  add('putDown'); add('breathDone');
  for (let offset = 0; offset < events.length; offset += 100) {
    const body = { accountId: id, runId, protocol: 2, events: events.slice(offset, offset + 100) };
    await Promise.all([request('events-v2', body, cookie), request('events-v2', body, cookie)]);
  }
  let data = (await request('stats', undefined, cookie)).data;
  assert.equal(data.total.nuts_started, 45); assert.equal(data.total.nuts_completed, 1); assert.equal(data.total.bites, 59);
  assert.deepEqual(data.progress.packs.map(p => [p.count, p.whole, p.remainder]), [[10,1,0],[15,1,0],[20,1,0]]);
  assert.equal(data.total.completed_100, 1);
  assert.equal(data.total.cigarettes_lit, 22); assert.equal(data.total.cigarettes_smoked, 21); assert.equal(data.total.cigarettes_finished, 2);
  assert.equal(data.total.early_extinguished, 20); assert.equal(data.total.puffs, 28); assert.equal(data.total.early_discarded, 44); assert.equal(data.total.breaths, 1);
  assert.equal(data.progress.cigaretteBoxes.whole, 1); assert.equal(data.progress.cigaretteBoxes.remainder, 2);
  assert.equal(data.progress.achievements.find(a => a.id === 'breath_one').unlocked, true);
  assert.equal(data.progress.real.recordedDays, 0);
  const invalid = { accountId: id, runId, protocol: 2, events: [{ seq: events.length + 1, type: 'light' }, { seq: events.length + 2, type: 'light' }] };
  await request('events', invalid, cookie, 409);
  await request('events', { ...invalid, events: [{ seq: events.length + 1, type: 'breathDone' }] }, cookie, 409);
  assert.equal((await request('stats', undefined, cookie)).data.total.cigarettes_lit, 22);
  await request('events', { accountId: id, runId: crypto.randomUUID(), protocol: 2, events: [{ seq: 1, type: 'burn', value: -1 }] }, cookie, 400);
  await request('events-v2', { accountId: id, runId: crypto.randomUUID(), protocol: 1, events: [{ seq: 1, type: 'chew' }] }, cookie, 400);
  const today = dayInChina();
  const first = { accountId: id, day: today, nutFree: true, smokeFree: true };
  await Promise.all([request('checkin', first, cookie), request('checkin', first, cookie)]);
  for (let i = 1; i < 7; i++) await request('checkin', { ...first, day: dayShift(today, -i) }, cookie);
  data = (await request('stats', undefined, cookie)).data;
  assert.equal(data.progress.real.recordedDays, 7); assert.equal(data.progress.real.both.current, 7);
  assert.equal(data.progress.achievements.find(a => a.id === 'both_seven').unlocked, true);
  await request('checkin', { ...first, day: dayShift(today, -3), smokeFree: false }, cookie);
  data = (await request('stats', undefined, cookie)).data;
  assert.equal(data.progress.real.both.current, 3); assert.equal(data.progress.achievements.find(a => a.id === 'both_seven').unlocked, false);
  for (const body of [{ ...first, day: dayShift(today, 1) }, { ...first, day: dayShift(today, -7) }, { ...first, smokeFree: 'true' }]) await request('checkin', body, cookie, 400);
  await request('checkin', first, otherCookie, 403);
  await request('checkin', { ...first, accountId: otherId }, cookie, 403);
  assert.equal((await request('stats', undefined, otherCookie)).data.progress.real.recordedDays, 0);
  const oldRun = crypto.randomUUID();
  await pool.execute('INSERT INTO chew_runs(id,user_id,state_json) VALUES(?,?,?)', [oldRun, id, JSON.stringify(new LegacySimulator())]);
  const oldEvents = [{ type: 'pack', value: 100 }, { type: 'discard' }];
  for (let i = 0; i < 8; i++) oldEvents.push({ type: 'take' }, { type: 'chew' }, { type: 'discard' });
  const legacyBody = { accountId: id, runId: oldRun, events: oldEvents.map((e, i) => ({ ...e, seq: i + 1 })) };
  await request('events', legacyBody, cookie); await request('events', legacyBody, cookie);
  data = (await request('stats', undefined, cookie)).data;
  assert.equal(data.total.nuts_started, 53); assert.equal(data.progress.unknownLegacyNuts, 8); assert.equal(data.total.nuts_100, 15);
  await request('events', { ...legacyBody, protocol: 2 }, cookie, 409);
  console.log('PASS: 10/15/20 nut attribution, 20-cigarette equivalents, inhaled/burnt/extinguished counts, rest achievements, transactional retries, editable real-life streaks, account isolation and version-1 queued events');
};
