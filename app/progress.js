(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const make = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; };
  const number = value => Number(value || 0).toLocaleString('zh-CN');
  const decimal = value => Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  class ProgressView {
    constructor(actions) {
      this.actions = actions; this.user = null; this.data = null; this.scope = 'total'; this.editing = false; this.saving = false;
      $('progress-login').addEventListener('click', () => actions.getAccount()?.open());
      $('progress-refresh').addEventListener('click', () => actions.getAccount()?.refresh());
      $('progress-breath').addEventListener('click', actions.rest);
      document.querySelectorAll('[data-progress-scope]').forEach(button => button.addEventListener('click', () => { this.scope = button.dataset.progressScope; this.drawUsage(); }));
      $('checkin-day').addEventListener('change', () => { this.fillCheckin(); this.editing = true; });
      for (const id of ['checkin-nut', 'checkin-smoke']) $(id).addEventListener('change', () => { this.editing = true; $('checkin-feedback').textContent = '尚未保存，请按实际情况确认。'; });
      $('checkin-form').addEventListener('submit', event => { event.preventDefault(); this.saveCheckin(); });
      $('savings-form').addEventListener('input', () => { this.savingsEditing = true; $('savings-feedback').textContent = '尚未保存。'; });
      $('savings-form').addEventListener('submit', event => { event.preventDefault(); this.saveSavings(false); });
      $('savings-clear').addEventListener('click', () => this.saveSavings(true));
      this.setUser(null);
    }
    setUser(user) {
      if (this.user?.id === user?.id && this.initialized) return;
      this.initialized = true; this.user = user; this.data = null; this.editing = false; this.savingsEditing = false;
      $('savings-form').reset(); $('savings-feedback').textContent = ''; $('savings-total').textContent = '尚未设置'; $('savings-breakdown').replaceChildren();
      $('progress-content').hidden = true; $('progress-guest').hidden = false;
      $('progress-login').hidden = !!user;
      $('progress-guest').querySelector('h2').textContent = user ? '正在同步你的记录…' : '这是属于你的记录。';
      $('progress-guest').querySelector('p').textContent = user ? '正在读取包装足迹、现实打卡与成就。' : '登录后，包装足迹、戒除打卡和成就都会同步到账号。';
      $('checkin-feedback').textContent = ''; $('checkin-day').replaceChildren();
      for (const id of ['package-shelf', 'achievement-grid', 'checkin-calendar', 'reality-streaks', 'journal-days']) $(id).replaceChildren();
    }
    render(data) {
      if (!this.user || data.accountId !== this.user.id) return;
      if (!data.progress) { this.data = null; $('progress-content').hidden = true; $('progress-guest').hidden = false; $('progress-guest').querySelector('p').textContent = '请将服务器升级到 1.4.0，以读取完整记录。'; return; }
      this.data = data; $('progress-content').hidden = false; $('progress-guest').hidden = true; $('progress-error').textContent = '';
      this.drawUsage(); this.drawAchievements(); this.drawReality(); this.drawSavings();
      const rows = data.daily.slice().reverse().map(row => {
        const tr = make('tr');
        for (const value of [row.day, row.nuts_started, row.nuts_completed, row.cigarettes_lit, row.puffs, row.breaths]) tr.append(make('td', '', value));
        return tr;
      });
      $('journal-days').replaceChildren(...rows);
    }
    metric(id, value, unit) { $(id).replaceChildren(document.createTextNode(number(value)), make('small', '', unit)); }
    shape(tier, count, className = '') {
      const shape = make('div', 'package-shape ' + ({ 50: '', 100: 'gold', 200: 'dark', smoke: 'cig-box' }[tier]) + (count ? '' : ' ghost') + ' ' + className);
      shape.setAttribute('aria-hidden', 'true');
      shape.append(make('span', '', tier === 'smoke' ? '虚拟烟盒' : { 50: '青 椰', 100: '秋 山', 200: '夜 岩' }[tier]), make('strong', '', tier === 'smoke' ? '20' : tier), make('small', '', 'SIMULATION ONLY'));
      return shape;
    }
    packageCard(tier, count, capacity, completed) {
      const whole = Math.floor(count / capacity), remainder = count % capacity;
      const card = make('article', 'package-card'); card.dataset.tier = tier;
      const header = make('header'); header.append(make('span', '', tier === 'smoke' ? '烟盒 · 20 根' : tier + ' 档 · ' + capacity + ' 颗'), make('small', '', '折合包装'));
      const visual = make('div', 'package-visual');
      if (whole >= 2) visual.append(this.shape(tier, count, 'package-copy'));
      if (whole >= 3) visual.append(this.shape(tier, count, 'package-copy second'));
      visual.append(this.shape(tier, count, whole > 0 && !remainder && tier !== 'smoke' ? 'empty' : ''));
      if (whole) visual.append(make('span', 'package-stack-count', '× ' + number(whole)));
      const title = count ? number(whole) + (tier === 'smoke' ? ' 盒' : ' 袋') + (remainder ? ' + ' + remainder + (tier === 'smoke' ? ' 根' : ' 颗') : '的量') : '还没有记录';
      const detail = tier === 'smoke' ? '点燃 ' + number(count) + ' 根 · 每 20 根折合一盒' : '嚼过 ' + number(count) + ' 颗 · 其中嚼完 ' + number(completed) + ' 颗';
      const dots = make('div', 'package-dots' + (tier === 'smoke' ? ' cig-dots' : ''));
      dots.setAttribute('aria-hidden', 'true');
      const used = remainder || (whole ? capacity : 0);
      for (let i = 0; i < capacity; i++) dots.append(make('i', i < used ? 'used' : ''));
      card.append(header, visual, make('h3', '', title), make('p', '', detail), dots);
      return card;
    }
    drawUsage() {
      if (!this.data) return;
      const stats = this.data[this.scope];
      document.querySelectorAll('[data-progress-scope]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.progressScope === this.scope)));
      this.metric('journal-nuts', stats.nuts_started, '颗'); this.metric('journal-bites', stats.bites, '次');
      this.metric('journal-cigarettes', stats.cigarettes_lit, '根'); this.metric('journal-breaths', stats.breaths, '分钟');
      $('journal-completed').textContent = '其中嚼完 ' + number(stats.nuts_completed) + ' 颗';
      $('journal-smoked').textContent = '吸过 ' + number(stats.cigarettes_smoked) + ' 根 · 抽完 ' + number(stats.cigarettes_finished) + ' 根';
      $('journal-early').textContent = '提前吐出 ' + number(stats.early_discarded) + ' 次 · 提前熄灭 ' + number(stats.early_extinguished) + ' 次';
      const cards = [50, 100, 200].map((tier, index) => this.packageCard(tier, stats['nuts_' + tier], [10, 15, 20][index], stats['completed_' + tier]));
      cards.push(this.packageCard('smoke', stats.cigarettes_lit, 20));
      $('package-shelf').replaceChildren(...cards);
      const bags = stats.nuts_50 / 10 + stats.nuts_100 / 15 + stats.nuts_200 / 20;
      $('journal-package-total').textContent = '折合 ' + decimal(bags) + ' 袋槟榔 · ' + decimal(stats.cigarettes_lit / 20) + ' 盒烟';
      const unknown = Math.max(0, stats.nuts_started - stats.nuts_50 - stats.nuts_100 - stats.nuts_200);
      $('legacy-note').hidden = !unknown;
      $('legacy-note').textContent = '另有旧版记录 ' + number(unknown) + ' 颗，原包装为每包 8 颗，未纳入新版 10 / 15 / 20 颗的折合量。旧版未记录香烟用量。';
      $('daily-observations').replaceChildren(...this.data.progress.observations.map(item => {
        const card = make('article', item.reached ? 'reached' : '');
        card.append(make('strong', '', item.title + '：' + number(item.count) + ' ' + item.unit));
        card.append(document.createTextNode(item.reached ? '已到每日 ' + item.line + ' ' + item.unit + '的自省提醒线。可以在这一刻放下，喝口水。' : '这是用量记录，不是挑战目标。少一点，也值得被记住。'));
        return card;
      }));
    }
    drawAchievements() {
      const list = this.data.progress.achievements;
      $('achievement-count').textContent = '已点亮 ' + list.filter(item => item.unlocked).length + ' / ' + list.length;
      $('achievement-grid').replaceChildren(...list.map(item => {
        const card = make('article', 'achievement-card' + (item.unlocked ? ' unlocked' : '')); card.dataset.achievement = item.id;
        const header = make('header'), label = make('div');
        label.append(make('h3', '', item.title), make('small', '', item.category === 'real' ? '现实 · 自己确认' : '模拟 · 觉察与停顿'));
        header.append(make('span', 'achievement-symbol', item.unlocked ? '✓' : '✳'), label);
        const meter = make('div', 'achievement-meter'), fill = make('i'); fill.style.width = Math.min(100, item.value / item.target * 100) + '%'; meter.append(fill);
        const footer = make('footer'); footer.append(make('span', '', item.unlocked ? '已点亮' : '慢慢来'), make('span', '', Math.min(item.value, item.target) + ' / ' + item.target + ' ' + item.unit));
        card.append(header, make('p', '', item.description), meter, footer); return card;
      }));
    }
    fillCheckin() {
      if (!this.data) return;
      const entry = this.data.progress.calendar.find(day => day.day === $('checkin-day').value);
      const when = $('checkin-day').value === this.data.today.day ? '今天到现在' : '这一天';
      $('checkin-nut').closest('label').querySelector('strong').textContent = when + '，现实中没嚼槟榔';
      $('checkin-smoke').closest('label').querySelector('strong').textContent = when + '，现实中没吸烟';
      $('checkin-nut').checked = !!entry?.nutFree; $('checkin-smoke').checked = !!entry?.smokeFree;
      $('checkin-feedback').textContent = entry?.recorded ? '已保存的确认，可按实际情况更正。' : '根据现实情况勾选，保存后才会计入账号。';
      this.markSelectedDay();
    }
    markSelectedDay() { for (const button of $('checkin-calendar').children) { const selected = button.dataset.day === $('checkin-day').value; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); } }
    drawReality() {
      const { real, calendar } = this.data.progress;
      $('reality-streaks').replaceChildren(...[['nut', '现实没嚼槟榔'], ['smoke', '现实没吸烟'], ['both', '两者都没有使用']].map(([key, title]) => {
        const value = real[key], row = make('div', 'streak-item'), count = make('strong', '', number(value.current)); count.append(make('small', '', '天'));
        row.append(make('span', '', title), count, make('p', '', '历史最佳 ' + value.best + ' 天' + (value.through ? ' · 连续截至 ' + value.through : ' · 等待你的确认')));
        return row;
      }));
      const previous = $('checkin-day').value;
      if (!this.editing) {
        $('checkin-day').replaceChildren(...calendar.map((entry, i) => { const option = make('option', '', entry.day + (i === 0 ? ' · 今天' : '')); option.value = entry.day; return option; }));
        if (calendar.some(entry => entry.day === previous)) $('checkin-day').value = previous;
        this.fillCheckin();
      }
      $('checkin-calendar').replaceChildren(...calendar.slice().reverse().map(entry => {
        const button = make('button', 'calendar-day'); button.type = 'button'; button.dataset.day = entry.day;
        const marks = make('span', 'calendar-marks'); marks.setAttribute('aria-hidden', 'true'); marks.append(make('i', entry.nutFree ? 'yes' : ''), make('i', entry.smokeFree ? 'yes' : ''));
        button.append(make('small', '', entry.day.slice(5, 7) + '月'), make('span', '', entry.day.slice(8)), marks);
        button.setAttribute('aria-label', entry.day + '，未嚼槟榔' + (entry.nutFree ? '已确认' : '未确认') + '，未吸烟' + (entry.smokeFree ? '已确认' : '未确认'));
        button.addEventListener('click', () => { $('checkin-day').value = entry.day; this.fillCheckin(); this.editing = true; });
        return button;
      }));
      this.markSelectedDay();
    }
    drawSavings() {
      const value = this.data.savings;
      const money = cents => '¥ ' + (cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      $('savings-save').disabled = !value;
      $('savings-clear').disabled = !value?.configured;
      $('savings-total').textContent = value?.configured ? money(value.totalCents) : '尚未设置';
      $('savings-today').textContent = value?.configured ? '今天暂估 ' + money(value.todayCents) : value ? '填写原来的用量与价格后开始估算' : '请先将服务器升级至 1.4.0';
      $('savings-breakdown').replaceChildren(...(value?.configured ? [
        make('p', '', '槟榔 · 确认 ' + value.nutDays + ' 天 · ' + money(value.nutCents)),
        make('p', '', '香烟 · 确认 ' + value.smokeDays + ' 天 · ' + money(value.smokeCents))
      ] : []));
      if (!this.savingsEditing) {
        const baseline = value?.baseline;
        $('savings-tier').value = baseline?.nutTier || 50;
        for (const [id, key, divisor] of [['savings-nut-price','nutPriceCents',100],['savings-nut-count','nutsPerDay',1],['savings-smoke-price','smokePriceCents',100],['savings-smoke-count','cigarettesPerDay',1]]) $(id).value = baseline ? baseline[key] / divisor : '';
      }
    }
    async saveSavings(clear) {
      const account = this.actions.getAccount();
      if (this.savingsBusy) return;
      if (!account?.user || account.expired) { account?.open(); return; }
      const id = account.user.id;
      const baseline = clear ? null : { nutTier: Number($('savings-tier').value), nutPriceCents: Math.round(Number($('savings-nut-price').value) * 100), nutsPerDay: Number($('savings-nut-count').value), smokePriceCents: Math.round(Number($('savings-smoke-price').value) * 100), cigarettesPerDay: Number($('savings-smoke-count').value) };
      this.savingsBusy = true; $('savings-save').disabled = true; $('savings-clear').disabled = true;
      $('savings-feedback').textContent = '正在保存…';
      try {
        await account.api('savings', { accountId: id, baseline });
        if (this.user?.id !== id) return;
        this.savingsEditing = false; await account.loadStats();
        if (this.user?.id === id) $('savings-feedback').textContent = clear ? '已清除花费设置，打卡和历史记录保留。' : '已保存到账号，全部现实打卡已按当前设置重新估算。';
      } catch (error) { if (this.user?.id === id) $('savings-feedback').textContent = '尚未保存：' + error.message; }
      finally { this.savingsBusy = false; if (this.data) this.drawSavings(); }
    }
    async saveCheckin() {
      const account = this.actions.getAccount();
      if (this.saving) return;
      if (!account?.user || account.expired) { account?.open(); return; }
      const id = account.user.id, body = { accountId: id, day: $('checkin-day').value, nutFree: $('checkin-nut').checked, smokeFree: $('checkin-smoke').checked };
      this.saving = true; $('checkin-save').disabled = true; $('checkin-feedback').textContent = '正在保存…';
      try {
        await account.api('checkin', body);
        if (this.user?.id !== id) return;
        this.editing = false; await account.loadStats();
        if (this.user?.id === id) $('checkin-feedback').textContent = '已保存到当前账号。谢谢你认真记录这一天。';
      } catch (error) { if (this.user?.id === id) $('checkin-feedback').textContent = '尚未保存：' + error.message; }
      finally { this.saving = false; $('checkin-save').disabled = false; }
    }
  }
  window.ProgressView = ProgressView;
})();
