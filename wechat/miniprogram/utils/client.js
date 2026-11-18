const Simulator = require('../lib/model');
const { ACTIVITY_FIELDS, summarizeProgress, validCheckin, dayShift } = require('../lib/progress');
const { validBaseline, summarizeSavings } = require('../lib/savings');
const BASE_FIELDS = ['bites', 'nuts_started', 'nuts_completed', 'spits', 'discarded'];
const fields = BASE_FIELDS.concat(ACTIVITY_FIELDS);
const blank = () => Object.fromEntries(fields.map(key => [key, 0]));
const today = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
function uuid() {
  // Non-secret event identifier; database uniqueness and ownership are still enforced server-side.
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  const time = Date.now(); for (let i = 0; i < 6; i++) bytes[i] ^= Math.floor(time / Math.pow(256, i)) % 256;
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.map(n => n.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
function activity(before, state, type) {
  const delta = blank(), nut = before.nut, smoke = before.cigarette;
  if (type === 'chew') {
    delta.bites++;
    if (state.nut.bites === 1) { delta.nuts_started++; delta['nuts_' + state.nut.pack]++; }
    if (state.nut.wear === 100) { delta.nuts_completed++; delta['completed_' + state.nut.pack]++; }
  }
  if (type === 'spit') delta.spits++;
  if (type === 'discard') delta.discarded++;
  if (type === 'light') delta.cigarettes_lit++;
  if (type === 'inhale') { delta.puffs++; if (!smoke.puffs) delta.cigarettes_smoked++; }
  if (['burn','inhale'].includes(type) && smoke.used < 1 && state.cigarette.used >= 1) delta.cigarettes_finished++;
  if (['extinguish','putDown'].includes(type) && smoke.lit && smoke.used < 1) delta.early_extinguished++;
  if (['discard','putDown'].includes(type) && nut && nut.bites && nut.wear < 100) delta.early_discarded++;
  if (type === 'breathDone') delta.breaths++;
  return delta;
}
class Client {
  constructor(platform, config) {
    this.wx = platform; this.config = config; this.apiBase = (config.apiBase || '').replace(/\/$/, '');
    this.prefix = 'chew-wechat-v1:' + (this.apiBase || 'local') + ':';
    this.listeners = new Set(); this.state = new Simulator(); this.runId = uuid(); this.seq = 0;
    this.session = this.read(this.prefix + 'session', null); this.expired = false; this.syncError = '';
    this.guest = this.read('chew-wechat-guest-v1', { daily: {}, checkins: [], baseline: null });
    this.preferences = this.read('chew-wechat-preferences-v1', { sound: false, reducedMotion: false });
    this.stats = this.session ? this.read(this.prefix + 'stats:' + this.session.user.id, null) : this.guestStats();
  }
  read(key, fallback) { try { const value = this.wx.getStorageSync(key); return value === '' || value === undefined || value === null ? fallback : value; } catch (_) { return fallback; } }
  write(key, value) { try { this.wx.setStorageSync(key, value); } catch (_) { throw new Error('本机存储已满或不可用，操作尚未保存。请先同步记录并释放存储空间。'); } }
  get user() { return this.session && this.session.user; }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  emit() { this.listeners.forEach(listener => listener()); }
  queueKey(id) { return this.prefix + 'events:' + id; }
  pending(id) { return id ? this.read(this.queueKey(id), []) : []; }
  get pendingCount() { return this.user ? this.pending(this.user.id).length : 0; }
  setPreference(key, value) { const next = Object.assign({}, this.preferences, { [key]: !!value }); this.write('chew-wechat-preferences-v1', next); this.preferences = next; this.emit(); }
  perform(type, value) {
    const before = JSON.parse(JSON.stringify(this.state));
    const method = { chew:'chew',take:'take',spit:'spitFibers',discard:'spitNut',pack:'changePack',light:'light',inhale:'inhale',exhale:'exhale',extinguish:'extinguish',putDown:'putDown',burn:'burn',breathDone:'finishBreath' }[type];
    if (!method) return false;
    const accepted = this.state[method](type === 'burn' ? value / 1000 : value);
    if (!accepted && type !== 'putDown') return false;
    try {
      if (this.user) {
        const queue = this.pending(this.user.id);
        if (queue.length >= 10000) throw new Error('待同步记录较多，请联网同步后继续。');
        const event = { runId: this.runId, protocol: 2, seq: this.seq + 1, type };
        if (value !== undefined) event.value = value;
        this.write(this.queueKey(this.user.id), queue.concat(event)); this.seq++;
      } else {
        const next = JSON.parse(JSON.stringify(this.guest)), day = today(), delta = activity(before, this.state, type);
        const row = Object.assign(blank(), next.daily[day] || {});
        fields.forEach(key => { row[key] += delta[key]; }); next.daily[day] = row;
        this.write('chew-wechat-guest-v1', next); this.guest = next; this.stats = this.guestStats();
      }
    } catch (error) { Object.assign(this.state, before); throw error; }
    this.emit(); return true;
  }
  guestStats() {
    const day = today(), total = blank();
    Object.values(this.guest.daily).forEach(row => fields.forEach(key => { total[key] += Number(row[key] || 0); }));
    const daily = Array.from({ length: 7 }, (_, i) => { const date = dayShift(day, i - 6); return Object.assign(blank(), this.guest.daily[date] || {}, { day: date }); });
    return { accountId: null, total, today: daily[6], daily, progress: summarizeProgress(total,daily[6],this.guest.checkins,day), savings: summarizeSavings(this.guest.baseline,this.guest.checkins,day) };
  }
  api(path, body, session = this.session) {
    if (!this.apiBase) return Promise.reject(new Error('云账号尚未配置，当前可使用访客本机记录。配置服务器后可登录原网页账号。'));
    let development = false;
    try { development = this.wx.getAccountInfoSync().miniProgram.envVersion === 'develop'; } catch (_) {}
    const secure = /^https:\/\/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?::[0-9]+)?$/i.test(this.apiBase);
    if (!secure && !(development && this.config.allowInsecureDevelopment && /^http:\/\/(localhost|127\.0\.0\.1)(:[0-9]+)?$/.test(this.apiBase))) return Promise.reject(new Error('账号同步需要已备案域名和 HTTPS；发布版不允许 HTTP 或公网 IP。'));
    return new Promise((resolve, reject) => this.wx.request({
      url: this.apiBase + '/api/native/' + path, method: body === undefined ? 'GET' : 'POST', data: body,
      timeout: 15000, header: Object.assign({ 'Content-Type': 'application/json' }, session ? { Authorization: 'Bearer ' + session.token } : {}),
      success: response => {
        const result = response.data;
        if (response.statusCode >= 200 && response.statusCode < 300 && result && typeof result === 'object') resolve(result);
        else reject(Object.assign(new Error(result && result.error || '账号服务未就绪，请确认后台已升级到 1.5.0。'), { status: response.statusCode }));
      }, fail: () => reject(new Error('暂时无法连接账号服务。模拟记录保留在本机，联网后会重试。'))
    }));
  }
  reset() { this.state = new Simulator(); this.runId = uuid(); this.seq = 0; }
  async login(mode, form) {
    if (this.authBusy) throw new Error('正在登录，请稍候。');
    this.authBusy = true;
    try {
    // A fresh credential login must work even when an expired token has a queue.
    // Do not revoke the previous session until pending ownership is resolved.
    if (this.flushing) await this.flushing;
    const result = await this.api(mode, form, null);
    if (!result.token || !result.user) throw new Error('后台版本不支持微信端账号，请先升级服务器到 1.5.0。');
    const session = { token: result.token, user: result.user };
    if (this.user && this.pendingCount && String(this.user.id) !== String(session.user.id)) {
      await this.api('logout', { accountId: session.user.id }, session).catch(() => {});
      throw new Error('原账号还有待同步记录，请先重新登录原账号并同步，再切换账号。');
    }
    this.write(this.prefix + 'session', session); this.session = session; this.expired = false; this.syncError = '';
    this.reset(); this.stats = this.read(this.prefix + 'stats:' + this.user.id, null); this.emit();
    await this.refresh();
    } finally { this.authBusy = false; }
  }
  async logout() {
    if (!this.user) return;
    if (this.pendingCount && (!await this.flush() || this.pendingCount)) throw new Error('还有待同步记录，请联网同步后退出。');
    await this.api('logout', { accountId: this.user.id });
    this.write(this.prefix + 'session', null); this.session = null; this.expired = false; this.syncError = '';
    this.reset(); this.stats = this.guestStats(); this.emit();
  }
  flush() {
    if (this.flushing) return this.flushing;
    if (!this.user || this.expired) return Promise.resolve(!this.user);
    const session = this.session, id = session.user.id;
    this.flushing = (async () => {
      try {
        const records = this.pending(id), runs = new Map();
        records.forEach(record => { if (!runs.has(record.runId)) runs.set(record.runId, []); runs.get(record.runId).push(record); });
        for (const [runId, list] of runs) {
          list.sort((a,b) => a.seq-b.seq);
          for (let offset = 0; offset < list.length; offset += 100) {
            if (this.session !== session) return false;
            const result = await this.api('events-v2', { accountId:id,runId,protocol:2,events:list.slice(offset,offset+100) }, session);
            if (!Number.isSafeInteger(result.ackSeq) || result.ackSeq < list[Math.min(offset+100,list.length)-1].seq) throw new Error('服务器未确认完整记录，已保留本机队列等待重试。');
            this.write(this.queueKey(id), this.pending(id).filter(event => event.runId !== runId || event.seq > result.ackSeq));
          }
        }
        if (this.session === session) this.syncError = '';
        return true;
      } catch (error) {
        if (this.session === session) { this.syncError = error.message; if ([401,403].includes(error.status)) this.expired = true; }
        return false;
      }
    })().finally(() => { this.flushing = null; this.emit(); }); return this.flushing;
  }
  async refresh() {
    if (!this.user) { this.stats = this.guestStats(); this.emit(); return; }
    const session = this.session, generation = this.refreshGeneration = (this.refreshGeneration || 0) + 1;
    await this.flush();
    try {
      const data = await this.api('stats', undefined, session);
      if (this.session !== session || generation !== this.refreshGeneration || String(data.accountId) !== String(session.user.id)) return;
      if (!data.progress || !data.savings) throw new Error('请先将账号后台升级到 1.5.0。');
      this.write(this.prefix + 'stats:' + data.accountId, data); this.stats = data; this.expired = false;
      if (!this.pendingCount) this.syncError = '';
    } catch (error) { if (this.session === session) { this.syncError = error.message; if ([401,403].includes(error.status)) this.expired = true; } }
    this.emit();
  }
  async checkin(body) {
    if (!validCheckin(body, today())) throw new Error('只能更正北京时间今天及前六天的记录。');
    if (this.user) { await this.api('checkin', Object.assign({ accountId:this.user.id },body)); await this.refresh(); }
    else {
      const next = JSON.parse(JSON.stringify(this.guest));
      next.checkins = next.checkins.filter(row => row.day !== body.day).concat({ day:body.day,nut_free:body.nutFree,smoke_free:body.smokeFree });
      this.write('chew-wechat-guest-v1', next); this.guest = next; this.stats = this.guestStats(); this.emit();
    }
  }
  async saveSavings(baseline) {
    if (baseline !== null && !validBaseline(baseline)) throw new Error('请填写有效价格（0–10000 元）和每日数量（0–500 的整数）。');
    if (this.user) { await this.api('savings', { accountId:this.user.id,baseline }); await this.refresh(); }
    else {
      const next = Object.assign({},this.guest,{ baseline }); this.write('chew-wechat-guest-v1',next); this.guest = next; this.stats = this.guestStats(); this.emit();
    }
  }
  resume() { this.pause(); this.refresh(); this.timer = setInterval(() => { if (this.user) this.flush(); }, 5000); }
  pause() { clearInterval(this.timer); this.timer = null; if (this.user) this.flush(); }
}
module.exports = { Client, today, activity, blank, uuid };
