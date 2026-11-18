const mysql = require('mysql2/promise');
const fs = require('node:fs');
const path = require('node:path');
const Simulator = require('../app/model.js');
const LegacySimulator = require('./legacy-model.cjs');
const { ACTIVITY_FIELDS, summarizeProgress, validCheckin } = require('./progress.cjs');
const { validBaseline, summarizeSavings, FIELDS: SAVINGS_FIELDS } = require('./savings.cjs');
const { sameId } = require('./identity.cjs');
const FIELDS = ['bites', 'nuts_started', 'nuts_completed', 'spits', 'discarded'];
const blank = (fields = FIELDS) => Object.fromEntries(fields.map(key => [key, 0]));
const dayInChina = (date = new Date()) => new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10);
function createPool(config) {
  return mysql.createPool({ ...config, connectionLimit: 8, charset: 'utf8mb4', timezone: 'Z', dateStrings: true, supportBigNumbers: true, bigNumberStrings: true });
}
async function initializeSchema(connection) {
  for (const sql of fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8').split(';').map(s => s.trim()).filter(Boolean)) await connection.query(sql);
}
function validateEvents(body) {
  if (!body || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.runId) || ![1, 2].includes(body.protocol ?? 1) || !Array.isArray(body.events) || body.events.length < 1 || body.events.length > 100) return false;
  const kinds = ['chew', 'take', 'spit', 'discard', 'pack', 'putDown'];
  if (body.protocol === 2) kinds.push('light', 'inhale', 'exhale', 'extinguish', 'burn', 'breathDone');
  return body.events.every((event, index) => event && Number.isSafeInteger(event.seq) && event.seq > 0 && event.seq < 4294967295 && (!index || event.seq === body.events[index - 1].seq + 1) && kinds.includes(event.type) && (event.type !== 'pack' || [50, 100, 200].includes(event.value)) && (event.type !== 'burn' || Number.isInteger(event.value) && event.value > 0 && event.value <= 120000));
}
async function addDaily(connection, table, fields, userId, day, delta) {
  if (!Object.values(delta).some(Boolean)) return;
  await connection.execute(`INSERT INTO ${table} (user_id,day,${fields.join(',')}) VALUES (${Array(fields.length + 2).fill('?').join(',')}) ON DUPLICATE KEY UPDATE ${fields.map(key => `${key}=${key}+VALUES(${key})`).join(',')}`, [userId, day, ...fields.map(key => delta[key])]);
}
async function recordEvents(pool, userId, body, now = new Date()) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const protocol = body.protocol ?? 1, Model = protocol === 2 ? Simulator : LegacySimulator;
    const initial = new Model(); initial._protocol = protocol;
    await connection.execute('INSERT INTO chew_runs (id, user_id, state_json) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE id=id', [body.runId, userId, JSON.stringify(initial)]);
    const [[run]] = await connection.execute('SELECT user_id,last_seq,state_json FROM chew_runs WHERE id=? FOR UPDATE', [body.runId]);
    if (!sameId(run.user_id, userId)) throw Object.assign(new Error('记录不属于当前账号。'), { status: 403 });
    const saved = typeof run.state_json === 'string' ? JSON.parse(run.state_json) : run.state_json;
    if ((saved._protocol ?? 1) !== protocol) throw Object.assign(new Error('操作版本不匹配，请保留原始待同步记录。'), { status: 409 });
    const state = Object.assign(new Model(), saved);
    let sequence = run.last_seq;
    const delta = blank(), activity = blank(ACTIVITY_FIELDS);
    for (const event of body.events) {
      if (event.seq <= sequence) continue;
      if (event.seq !== sequence + 1) throw Object.assign(new Error('记录顺序不连续，请保留页面并重试同步。'), { status: 409 });
      let accepted = false;
      const beforeSmoke = { ...state.cigarette }, beforeNut = state.nut ? { ...state.nut } : null;
      if (event.type === 'chew') {
        accepted = state.chew();
        if (accepted) {
          delta.bites++;
          if (state.nut.bites === 1) { delta.nuts_started++; if (protocol === 2) activity['nuts_' + state.nut.pack]++; }
          if (state.nut.wear === 100) { delta.nuts_completed++; if (protocol === 2) activity['completed_' + state.nut.pack]++; }
        }
      } else if (event.type === 'take') accepted = state.take();
      else if (event.type === 'pack') accepted = state.changePack(event.value);
      else if (event.type === 'spit') { accepted = state.spitFibers(); if (accepted) delta.spits++; }
      else if (event.type === 'discard') { accepted = state.spitNut(); if (accepted) delta.discarded++; }
      else if (event.type === 'putDown') { state.putDown(); accepted = true; }
      else if (protocol === 2) {
        if (event.type === 'burn') accepted = state.burn(event.value / 1000);
        else if (event.type === 'breathDone') { accepted = state.finishBreath(); if (accepted) activity.breaths++; }
        else if (['light', 'inhale', 'exhale', 'extinguish'].includes(event.type)) accepted = state[event.type]();
      }
      if (!accepted) throw Object.assign(new Error('操作记录与当前状态不一致。'), { status: 409 });
      if (protocol === 2) {
        if (event.type === 'light') activity.cigarettes_lit++;
        if (event.type === 'inhale') { activity.puffs++; if (beforeSmoke.puffs === 0) activity.cigarettes_smoked++; }
        if (['burn', 'inhale'].includes(event.type) && beforeSmoke.used < 1 && state.cigarette.used >= 1) activity.cigarettes_finished++;
        if (['extinguish', 'putDown'].includes(event.type) && beforeSmoke.lit && beforeSmoke.used < 1) activity.early_extinguished++;
        if (['discard', 'putDown'].includes(event.type) && beforeNut?.bites > 0 && beforeNut.wear < 100) activity.early_discarded++;
        if (['chew', 'take', 'light'].includes(event.type)) state.restReady = false;
      }
      sequence = event.seq;
    }
    if (sequence !== run.last_seq) {
      await connection.execute('UPDATE chew_runs SET last_seq=?,state_json=?,updated_at=UTC_TIMESTAMP(3) WHERE id=?', [sequence, JSON.stringify(state), body.runId]);
      const day = dayInChina(now);
      await addDaily(connection, 'chew_daily', FIELDS, userId, day, delta);
      await addDaily(connection, 'chew_activity_daily', ACTIVITY_FIELDS, userId, day, activity);
    }
    await connection.commit(); return { ackSeq: sequence };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
async function getStats(pool, userId, now = new Date()) {
  const today = dayInChina(now), firstDay = dayInChina(new Date(now.getTime() - 6 * 86400000));
  // One snapshot keeps totals, daily rows and derived achievements consistent during concurrent uploads.
  const connection = await pool.getConnection();
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.beginTransaction();
    const [[baseTotal]] = await connection.execute(`SELECT ${FIELDS.map(key => `COALESCE(SUM(${key}),0) AS ${key}`).join(',')} FROM chew_daily WHERE user_id=?`, [userId]);
    const [rows] = await connection.execute(`SELECT day,${FIELDS.join(',')} FROM chew_daily WHERE user_id=? AND day BETWEEN ? AND ? ORDER BY day`, [userId, firstDay, today]);
    const [activityRows] = await connection.execute('SELECT * FROM chew_activity_daily WHERE user_id=? ORDER BY day', [userId]);
    const [checkins] = await connection.execute('SELECT day,nut_free,smoke_free FROM chew_checkins WHERE user_id=? AND day<=? ORDER BY day', [userId, today]);
    const [[settings]] = await connection.execute('SELECT baseline FROM chew_savings_settings WHERE user_id=?', [userId]);
    const baseline = settings ? (typeof settings.baseline === 'string' ? JSON.parse(settings.baseline) : settings.baseline) : null;
    await connection.commit();
    const total = { ...Object.fromEntries(FIELDS.map(key => [key, Number(baseTotal[key])])), ...blank(ACTIVITY_FIELDS) };
    for (const row of activityRows) for (const field of ACTIVITY_FIELDS) total[field] += Number(row[field]);
    const daily = [];
    for (let i = 6; i >= 0; i--) {
      const day = dayInChina(new Date(now.getTime() - i * 86400000));
      const row = { ...blank(), ...blank(ACTIVITY_FIELDS), ...rows.find(r => r.day === day), ...activityRows.find(r => r.day === day) };
      daily.push({ day, ...Object.fromEntries([...FIELDS, ...ACTIVITY_FIELDS].map(key => [key, Number(row[key])])) });
    }
    return { timezone: 'Asia/Shanghai', total, today: daily[6], daily, savings: summarizeSavings(baseline, checkins, today), progress: summarizeProgress(total, daily[6], checkins, today) };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
async function saveCheckin(pool, userId, body, now = new Date()) {
  if (!validCheckin(body, dayInChina(now))) throw Object.assign(new Error('只能记录或更正北京时间今天及前六天的打卡。'), { status: 400 });
  await pool.execute('INSERT INTO chew_checkins (user_id,day,nut_free,smoke_free) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE nut_free=VALUES(nut_free),smoke_free=VALUES(smoke_free),updated_at=UTC_TIMESTAMP(3)', [userId, body.day, body.nutFree, body.smokeFree]);
  return { ok: true };
}
async function saveSavings(pool, userId, body) {
  if (body.baseline === null) { await pool.execute('DELETE FROM chew_savings_settings WHERE user_id=?', [userId]); return { ok: true }; }
  if (!validBaseline(body.baseline)) throw Object.assign(new Error('请填写有效的价格（最多两位小数，0–10000 元）和每日数量（0–500）。'), { status: 400 });
  const baseline = Object.fromEntries(SAVINGS_FIELDS.map(key => [key, body.baseline[key]]));
  await pool.execute('INSERT INTO chew_savings_settings (user_id,baseline) VALUES (?,?) ON DUPLICATE KEY UPDATE baseline=VALUES(baseline),updated_at=UTC_TIMESTAMP(3)', [userId, JSON.stringify(baseline)]);
  return { ok: true };
}
module.exports = { saveSavings, createPool, initializeSchema, validateEvents, recordEvents, getStats, saveCheckin, dayInChina };
