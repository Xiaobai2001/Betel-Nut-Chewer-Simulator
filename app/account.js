(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const PREFIX = 'chew-event-v1:';
  function uuid() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map(n => n.toString(16).padStart(2, '0')).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }
  class AccountController {
    constructor(actions) {
      this.actions = actions; this.user = null; this.expired = false; this.available = false;
      this.mode = 'login'; this.registration = true; this.memory = new Map(); this.runId = uuid(); this.seq = 0;
      this.saving = null; this.authBusy = false; this.storageWarning = false;
      this.dialog = $('account-dialog');
      $('account-open').addEventListener('click', () => this.open());
      $('account-close').addEventListener('click', () => this.dialog.close());
      document.querySelectorAll('[data-auth-mode]').forEach(button => button.addEventListener('click', () => this.setMode(button.dataset.authMode)));
      $('account-form').addEventListener('submit', event => { event.preventDefault(); this.submit(); });
      $('account-logout').addEventListener('click', () => this.logout());
      $('stats-refresh').addEventListener('click', () => this.refresh());
      if (location.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) $('connection-note').hidden = false;
      this.render();
      this.checkSession();
      this.timer = setInterval(() => { if (this.user && !this.expired) this.flush(); }, 2500);
      this.sessionTimer = setInterval(() => { if (!document.hidden) this.checkSession(); }, 60000);
      window.addEventListener('online', () => this.checkSession());
      window.addEventListener('storage', event => { if (event.key === 'chew-auth-change') this.checkSession(); });
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.flush(true); else this.checkSession(); });
      window.addEventListener('pagehide', () => this.flush(true));
    }
    async api(url, body, keepalive = false) {
      if (!/^https?:$/.test(location.protocol)) throw new Error('离线版仅支持访客体验。请打开已部署的账号网页版。');
      let response;
      try { response = await fetch('/api/' + url, {
        method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), keepalive,
        signal: AbortSignal.timeout(15000)
      }); } catch { throw new Error('暂时无法连接账号服务，请检查网络后重试。'); }
      let result;
      try { result = await response.json(); } catch { throw new Error('账号服务未连接，请使用账号版服务器地址。'); }
      if (!response.ok) throw Object.assign(new Error(result.error || '请求失败，请稍后重试。'), { status: response.status });
      return result;
    }
    broadcast() { try { localStorage.setItem('chew-auth-change', uuid()); } catch {} }
    adopt(user) {
      const changed = this.user?.id !== user?.id;
      this.user = user; this.expired = false;
      if (changed) { this.runId = uuid(); this.seq = 0; this.actions.reset(); $('stats-content').hidden = true; }
      this.render();
    }
    async checkSession() {
      if (this.authBusy || this.checking) return;
      this.checking = true; this.render();
      try {
        const result = await this.api('session');
        this.available = true; this.registration = result.registration;
        if (!result.user && this.user) { this.expired = true; this.message('登录已失效，请重新登录；待同步记录仍保留。'); }
        else this.adopt(result.user);
        this.render();
        if (this.user && !this.expired) { await this.flush(); if (this.dialog.open) await this.loadStats(); }
      } catch (error) { if (!this.available) this.message(error.message); }
      finally { this.checking = false; this.render(); }
    }
    setMode(mode) {
      this.mode = mode; this.message(''); this.render();
      $('account-password').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    }
    render() {
      const logged = !!this.user && !this.expired;
      $('account-open').textContent = logged ? this.user.displayName + ' · 统计' : '登录 / 注册';
      $('cloud-status').textContent = logged ? '账号统计已开启' : this.expired ? '请重新登录' : '访客体验';
      $('account-auth').hidden = logged; $('account-stats').hidden = !logged;
      $('account-title').textContent = logged ? '我的模拟记录' : '留下一份自己的记录';
      $('account-subtitle').textContent = logged ? this.user.displayName + ' · @' + this.user.username : '登录后，模拟记录可在不同设备间查看。';
      $('register-fields').hidden = this.mode !== 'register';
      $('account-confirm').required = this.mode === 'register';
      $('account-register-tab').hidden = !this.registration;
      $('account-submit').textContent = this.authBusy ? '正在处理…' : this.mode === 'register' ? '注册并登录' : '登录';
      $('account-submit').disabled = this.authBusy || this.checking;
      document.querySelectorAll('[data-auth-mode]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.authMode === this.mode)));
    }
    message(text) { $('auth-error').textContent = text; }
    syncMessage(text) { $('stats-sync').textContent = text; }
    async open() {
      this.actions.pause(); this.dialog.showModal();
      await this.checkSession();
      if (this.user && !this.expired) await this.refresh();
    }
    async submit() {
      if (this.authBusy || this.checking) return;
      if (this.mode === 'register' && $('account-password').value !== $('account-confirm').value) { this.message('两次输入的密码不一致。'); return; }
      this.authBusy = true; this.message(''); this.render();
      try {
        if (this.saving) await this.saving;
        const result = await this.api(this.mode, { username: $('account-username').value.trim(), password: $('account-password').value, displayName: $('account-nickname').value.trim() || $('account-username').value.trim() });
        this.available = true; this.adopt(result.user); this.broadcast();
        $('account-password').value = ''; $('account-confirm').value = '';
        await this.flush(); await this.loadStats();
      } catch (error) { this.message(error.message); }
      finally { this.authBusy = false; this.render(); }
    }
    record(type, value) {
      if (!this.user) return;
      const event = { seq: ++this.seq, type }; if (value !== undefined) event.value = value;
      const key = PREFIX + this.user.id + ':' + this.runId + ':' + event.seq;
      // Each event is immutable. Tabs may safely upload the same events; server acknowledgements remove only those keys.
      this.memory.set(key, event);
      try { localStorage.setItem(key, JSON.stringify(event)); } catch {
        if (!this.storageWarning) this.actions.warn('浏览器无法保存待同步记录，请联网同步完成后再关闭页面。');
        this.storageWarning = true;
      }
      this.syncMessage(this.storageWarning ? '本机存储不可用，请联网同步完成后再关闭页面。' : '有新记录，等待同步…');
    }
    pending(userId) {
      const prefix = PREFIX + userId + ':', events = new Map();
      try {
        for (const key of Object.keys(localStorage)) {
          if (!key.startsWith(prefix)) continue;
          try { const event = JSON.parse(localStorage.getItem(key)); if (event && Number.isSafeInteger(event.seq)) events.set(key, event); } catch {}
        }
      } catch { this.storageWarning = true; }
      for (const [key, event] of this.memory) if (key.startsWith(prefix)) events.set(key, event);
      const runs = new Map();
      for (const [key, event] of events) {
        const runId = key.split(':')[2];
        if (!runs.has(runId)) runs.set(runId, []);
        runs.get(runId).push({ key, event });
      }
      for (const list of runs.values()) list.sort((a, b) => a.event.seq - b.event.seq);
      return runs;
    }
    flush(keepalive = false) {
      if (this.saving) return this.saving;
      if (!this.user || this.expired) return Promise.resolve(false);
      this.saving = this.sendPending(keepalive).finally(() => { this.saving = null; });
      return this.saving;
    }
    async sendPending(keepalive) {
      const userId = this.user.id;
      try {
        for (const [runId, records] of this.pending(userId)) {
          for (let start = 0; start < records.length; start += 100) {
            if (this.user?.id !== userId || this.expired) return false;
            const batch = records.slice(start, start + 100);
            const result = await this.api('events', { accountId: userId, runId, events: batch.map(item => item.event) }, keepalive);
            for (const { key, event } of batch) if (event.seq <= result.ackSeq) {
              this.memory.delete(key);
              try { localStorage.removeItem(key); } catch { this.storageWarning = true; }
            }
          }
        }
        if (this.user?.id === userId) this.syncMessage(this.pending(userId).size ? '有新记录，等待同步…' : '已同步 · 今日按北京时间统计');
        return true;
      } catch (error) {
        if (this.user?.id === userId) {
          if (error.status === 401 || error.status === 403) { this.expired = true; this.message('登录状态已变化，请重新登录后同步。'); this.render(); }
          this.syncMessage(this.storageWarning ? '同步失败且本机存储不可用，请保留页面重试。' : '尚未同步，记录保留在本机。' + (error.status ? ' ' + error.message : '联网后会自动重试。'));
        }
        return false;
      }
    }
    async loadStats() {
      if (!this.user || this.expired) return;
      const id = this.user.id;
      try {
        const data = await this.api('stats');
        if (this.user?.id !== id || data.accountId !== id) return;
        for (const scope of ['today', 'total']) for (const field of ['bites', 'nuts_started', 'nuts_completed', 'discarded']) $('stats-' + scope + '-' + field).textContent = Number(data[scope][field]).toLocaleString('zh-CN');
        const rows = data.daily.slice().reverse().map(day => {
          const tr = document.createElement('tr');
          for (const value of [day.day, day.bites, day.nuts_started, day.nuts_completed]) { const td = document.createElement('td'); td.textContent = value; tr.append(td); }
          return tr;
        });
        $('stats-days').replaceChildren(...rows); $('stats-content').hidden = false; $('stats-error').textContent = '';
      } catch (error) { $('stats-error').textContent = error.message; }
    }
    async refresh() { await this.flush(); await this.loadStats(); }
    async logout() {
      if (this.authBusy) return;
      this.authBusy = true; $('account-logout').disabled = true; this.actions.pause();
      try {
        const id = this.user?.id;
        if (!await this.flush() || this.pending(id).size) { $('stats-error').textContent = '还有待同步记录，请联网并同步完成后退出。'; return; }
        await this.api('logout', { accountId: id });
        this.adopt(null); this.broadcast(); this.message('已退出登录。访客操作不会计入账号。');
      } catch (error) { $('stats-error').textContent = error.message; }
      finally { this.authBusy = false; $('account-logout').disabled = false; this.render(); }
    }
  }
  window.AccountController = AccountController;
})();
