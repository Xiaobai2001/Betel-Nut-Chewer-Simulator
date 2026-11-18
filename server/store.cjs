const mysql = require('mysql2/promise');
const fs = require('node:fs');
const path = require('node:path');
const Simulator = require('../app/model.js');
const FIELDS = ['bites', 'nuts_started', 'nuts_completed', 'spits', 'discarded'];
const blank = () => Object.fromEntries(FIELDS.map(key => [key, 0]));
const dayInChina = (date = new Date()) => new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10);
function createPool(config) {
  return mysql.createPool({ ...config, connectionLimit: 8, charset: 'utf8mb4', timezone: 'Z', dateStrings: true, supportBigNumbers: true });
}
async function initializeSchema(connection) {
  for (const sql of fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8').split(';').map(s => s.trim()).filter(Boolean)) await connection.query(sql);
}
function validateEvents(body) {
  if (!body || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.runId) || !Array.isArray(body.events) || body.events.length < 1 || body.events.length > 100) return false;
  return body.events.every((event, index) => event && Number.isSafeInteger(event.seq) && event.seq > 0 && event.seq < 4294967295 && (!index || event.seq === body.events[index - 1].seq + 1) && ['chew', 'take', 'spit', 'discard', 'pack', 'putDown'].includes(event.type) && (event.type !== 'pack' || [50, 100, 200].includes(event.value)));
}
async function recordEvents(pool, userId, body, now = new Date()) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('INSERT INTO chew_runs (id, user_id, state_json) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE id=id', [body.runId, userId, JSON.stringify(new Simulator())]);
    const [[run]] = await connection.execute('SELECT user_id,last_seq,state_json FROM chew_runs WHERE id=? FOR UPDATE', [body.runId]);
    if (Number(run.user_id) !== Number(userId)) throw Object.assign(new Error('记录不属于当前账号。'), { status: 403 });
    const state = Object.assign(new Simulator(), typeof run.state_json === 'string' ? JSON.parse(run.state_json) : run.state_json);
    let sequence = run.last_seq;
    const delta = blank();
    for (const event of body.events) {
      if (event.seq <= sequence) continue;
      if (event.seq !== sequence + 1) throw Object.assign(new Error('记录顺序不连续，请保留页面并重试同步。'), { status: 409 });
      let accepted = false;
      if (event.type === 'chew') {
        accepted = state.chew();
        if (accepted) { delta.bites++; if (state.nut.bites === 1) delta.nuts_started++; if (state.nut.wear === 100) delta.nuts_completed++; }
      } else if (event.type === 'take') accepted = state.take();
      else if (event.type === 'pack') accepted = state.changePack(event.value);
      else if (event.type === 'spit') { accepted = state.spitFibers(); if (accepted) delta.spits++; }
      else if (event.type === 'discard') { accepted = state.spitNut(); if (accepted) delta.discarded++; }
      else if (event.type === 'putDown') { state.putDown(); accepted = true; }
      if (!accepted) throw Object.assign(new Error('操作记录与当前状态不一致。'), { status: 409 });
      sequence = event.seq;
    }
    if (sequence !== run.last_seq) {
      await connection.execute('UPDATE chew_runs SET last_seq=?,state_json=?,updated_at=UTC_TIMESTAMP(3) WHERE id=?', [sequence, JSON.stringify(state), body.runId]);
      if (Object.values(delta).some(Boolean)) await connection.execute(`INSERT INTO chew_daily (user_id,day,${FIELDS.join(',')}) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE ${FIELDS.map(key => `${key}=${key}+VALUES(${key})`).join(',')}`, [userId, dayInChina(now), ...FIELDS.map(key => delta[key])]);
    }
    await connection.commit();
    return { ackSeq: sequence };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
async function getStats(pool, userId, now = new Date()) {
  const today = dayInChina(now);
  const firstDay = dayInChina(new Date(now.getTime() - 6 * 86400000));
  const [[total]] = await pool.execute(`SELECT ${FIELDS.map(key => `COALESCE(SUM(${key}),0) AS ${key}`).join(',')} FROM chew_daily WHERE user_id=?`, [userId]);
  const [rows] = await pool.execute(`SELECT day,${FIELDS.join(',')} FROM chew_daily WHERE user_id=? AND day BETWEEN ? AND ? ORDER BY day`, [userId, firstDay, today]);
  const daily = [];
  for (let i = 6; i >= 0; i--) {
    const day = dayInChina(new Date(now.getTime() - i * 86400000));
    const row = rows.find(r => r.day === day) || blank();
    daily.push({ day, ...Object.fromEntries(FIELDS.map(key => [key, Number(row[key])])) });
  }
  return { timezone: 'Asia/Shanghai', total: Object.fromEntries(FIELDS.map(key => [key, Number(total[key])])), today: daily[6], daily };
}
module.exports = { createPool, initializeSchema, validateEvents, recordEvents, getStats, dayInChina };
