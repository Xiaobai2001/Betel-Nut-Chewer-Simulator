(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = new Simulator();
  const visuals = new SimulatorVisuals($('chew-canvas'), $('smoke-canvas'), state);
  let immersive = null; let account = null; let progress = null; let smokeMs = 0;
  let currentPage = 'experience'; let autoTimer = null; let toastTimer = null;
  let breathTimer = null; let breathStart = 0; let breathPhase = -1;
  let sound = false; let audio = null; let background = false;
  try { sound = localStorage.getItem('chew-sound') === 'true'; } catch { /* Storage can be unavailable in private browsers. */ }
  function toast(message) {
    immersive?.notify(message);
    clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.add('visible');
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3000);
  }
  function flushSmokeTime() { if (smokeMs > 0) { account?.record('burn', smokeMs); smokeMs = 0; } }
  function track(type, value) { flushSmokeTime(); account?.record(type, value); }
  function playSound(kind) {
    if (!sound) return;
    try {
      audio ||= new SimulatorSound();
      audio.play(kind);
    } catch { toast('当前设备不支持音效，其他功能可正常使用。'); sound = false; updateSound(); }
  }
  function updateSound() {
    $('immersive-sound').setAttribute('aria-pressed', String(sound));
    $('immersive-sound').firstChild.textContent = sound ? '音效开 ' : '音效关 ';
    $('sound-toggle').setAttribute('aria-pressed', String(sound));
    $('sound-toggle').setAttribute('aria-label', sound ? '关闭音效' : '开启音效');
    $('sound-toggle').title = sound ? '关闭音效' : '开启音效';
    $('sound-toggle').querySelector('use').setAttribute('href', sound ? '#i-sound' : '#i-mute');
  }
  function stopAuto() { clearInterval(autoTimer); autoTimer = null; $('auto-chew').checked = false; }
  function render() {
    const nut = state.nut; const wear = nut ? nut.wear : 0; const c = state.cigarette;
    $('bite-count').textContent = String(nut ? nut.bites : 0).padStart(2, '0');
    $('wear-value').textContent = wear; $('wear-bar').style.width = wear + '%';
    const descriptions = !nut ? ['已吐出 · 空口状态', '暂无槟榔'] : wear === 0 ? ['完整 · 尚未咀嚼', '饱满完整'] : wear < 35 ? ['轻微压扁 · 纹理松动', '轻微压扁'] : wear < 75 ? ['逐渐松散 · 颜色加深', '压扁松散'] : wear < 100 ? ['明显变扁 · 纤维散开', '明显纤维化'] : ['完全纤维化 · 可以吐出了', '完全纤维化'];
    $('nut-status').textContent = descriptions[0]; $('wear-label').textContent = descriptions[1];
    $('chew-canvas').setAttribute('aria-label', nut ? `虚拟槟榔，已嚼 ${nut.bites} 次，形态变化 ${wear}%，${descriptions[1]}` : '口中没有槟榔');
    $('stage-caption').textContent = !nut ? '空口也很好。可以休息，或从包里取一颗。' : wear === 100 ? '形态变化已完成，可以吐出并休息一下' : '每一口都在变扁、变深，纤维逐渐散开';
    $('current-pack').textContent = nut ? nut.pack + ' 档包装' : '休息一下也不错';
    $('chew-button').querySelector('span').textContent = !nut ? (state.remaining ? '取一颗' : '换包并取一颗') : wear >= 100 ? '已嚼完' : '嚼一口';
    $('chew-button').disabled = !!nut && wear >= 100;
    $('spit-fibers').disabled = !nut || nut.fibers === 0; $('spit-nut').disabled = !nut;
    $('auto-chew').disabled = !nut || wear >= 100;
    $('fiber-label').textContent = nut && nut.fibers > 0 ? '碎渣积累 ' + nut.fibers + '% · 可以吐渣' : '口中暂无碎渣';
    $('total-bites').textContent = state.totalBites; $('total-spits').textContent = state.spits; $('total-discarded').textContent = state.discarded;
    $('remaining').textContent = state.remaining; $('pack-capacity').textContent = state.capacity; $('smoke-stock').textContent = state.smokeRemaining;
    $('smoke-box').style.setProperty('--box-fill', (state.smokeRemaining / 20 * 100) + '%');
    document.querySelectorAll('[data-pack]').forEach(button => { const selected = Number(button.dataset.pack) === state.pack; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
    $('light-cigarette').disabled = c.lit;
    $('light-cigarette').lastChild.textContent = c.used > 0 && !c.lit ? '再点一根' : '点一根';
    $('inhale').disabled = !c.lit || c.holding; $('exhale').disabled = !c.holding; $('extinguish').disabled = !c.lit && !c.holding;
    $('smoke-status').textContent = c.holding ? '已吸入 · 可以吐烟' : c.lit ? '燃烧中 · ' + Math.round((1 - c.used) * 100) + '%' : c.used >= 1 ? '已抽完 · 可再点一根' : c.used > 0 ? '已熄灭' : '未点燃';
    $('smoke-hint').textContent = c.holding ? '点击“吐烟”，观察烟雾扩散' : c.lit ? '可随时熄灭，让这一口停在屏幕里' : '模拟烟雾，不点燃真实香烟';
    immersive?.sync();
  }
  function chew() {
    if (state.chew()) {
      track('chew');
      visuals.chew(); immersive?.scene?.chew(); playSound('chew');
      if (state.nut.wear === 100) { stopAuto(); toast('这颗已经完全纤维化，吐出后休息一下吧。'); }
      render();
    }
  }
  function primaryAction() {
    if (!state.nut) { if (!state.remaining) { changePack(state.pack); } if (state.take()) track('take'); visuals.take(); render(); }
    else chew();
  }
  $('chew-button').addEventListener('click', primaryAction);
  $('auto-chew').addEventListener('change', event => {
    if (event.target.checked && state.nut && state.nut.wear < 100) { stopAuto(); $('auto-chew').checked = true; chew(); if (state.nut.wear < 100) autoTimer = setInterval(chew, 760); }
    else stopAuto();
  });
  $('spit-fibers').addEventListener('click', () => { if (state.spitFibers()) { track('spit'); visuals.spit(false, state.nut); immersive?.scene?.spit(false, state.nut); playSound('spit'); render(); toast(immersive?.active ? '碎渣已向前吐出，落在地面上。' : '碎渣已吐入虚拟收集盘。'); } });
  $('spit-nut').addEventListener('click', () => { const nut = state.nut; if (state.spitNut()) { track('discard'); stopAuto(); visuals.spit(true, nut); immersive?.scene?.spit(true, nut); playSound('spit'); render(); toast('已吐出槟榔。要不要喝口水，歇一会？'); } });
  function changePack(value) { if (state.changePack(value)) { track('pack', value); render(); openPackEffect(immersive?.active ? document.querySelector('.immersive-stage') : $('stage'), value, state.capacity); playSound('pack'); toast(`已换成 ${value} 档虚拟包装，内含 ${state.capacity} 颗。${state.nut ? '口中这颗保留。' : ''}`); } }
  document.querySelectorAll('[data-pack]').forEach(button => button.addEventListener('click', () => changePack(Number(button.dataset.pack))));
  $('refill-pack').addEventListener('click', () => changePack(state.pack));
  $('light-cigarette').addEventListener('click', () => { if (state.light()) { track('light'); render(); toast('仅在屏幕里模拟。现实中建议戒槟榔、戒烟。'); } });
  $('inhale').addEventListener('click', () => { if (state.inhale()) { track('inhale'); visuals.inhale(); immersive?.scene?.inhale(); playSound('inhale'); render(); } });
  $('exhale').addEventListener('click', () => { if (state.exhale()) { track('exhale'); visuals.exhale(); immersive?.scene?.exhale(); playSound('exhale'); render(); } });
  $('extinguish').addEventListener('click', () => { if (state.extinguish()) { track('extinguish'); render(); toast('已经熄灭。给自己一个清新的停顿。'); } });
  $('sound-toggle').addEventListener('click', () => { sound = !sound; try { localStorage.setItem('chew-sound', String(sound)); } catch {} updateSound(); toast(sound ? '音效已开启' : '音效已关闭'); if (sound) playSound('chew'); else audio?.stop(); });
  function showPage(name) {
    if (immersive?.active) immersive.close();
    if (!['experience', 'pause', 'guide', 'progress'].includes(name)) name = 'experience';
    stopAuto(); flushSmokeTime(); if (currentPage === 'pause' && name !== 'pause') stopBreath(false);
    currentPage = name;
    document.querySelectorAll('.page').forEach(page => page.classList.toggle('active-page', page.id === name));
    document.querySelectorAll('[data-page]').forEach(button => { const selected = button.dataset.page === name; button.classList.toggle('active', selected); if (selected) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
    $('page-label').textContent = { experience: '模拟体验', pause: '放下练习', guide: '使用说明', progress: '记录与成就' }[name];
    if (name === 'progress') account?.refresh();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => showPage(button.dataset.page)));
  $('account-progress').addEventListener('click', () => { $('account-dialog').close(); showPage('progress'); });
  document.querySelectorAll('[data-open-pause]').forEach(button => button.addEventListener('click', () => showPage('pause')));
  document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); showPage('experience'); });
  window.returnToSimulation = () => { if (immersive?.active) { immersive.close(); return true; } if (currentPage === 'experience') return false; showPage('experience'); return true; };
  immersive = new ImmersiveController(state, visuals, {
    stopAuto,
    isExperience: () => currentPage === 'experience',
    toggleAuto: () => { if ($('auto-chew').disabled) return; $('auto-chew').checked = !$('auto-chew').checked; $('auto-chew').dispatchEvent(new Event('change')); render(); },
    rest: () => { showPage('pause'); $('start-breath').click(); }
  });
  function stopBreath(done) {
    clearInterval(breathTimer); breathTimer = null; breathPhase = -1;
    $('breath-circle').style.transform = 'scale(1)'; $('breath-circle').style.transitionDuration = '1s';
    $('breath-instruction').textContent = done ? '做得很好' : '准备好了';
    $('breath-seconds').textContent = done ? '这一分钟，留给了自己' : '按舒适的节奏呼吸';
    $('breath-title').textContent = done ? '把下一分钟，也留给健康。' : '给身体一个小小的休息。';
    $('start-breath').hidden = false; $('start-breath').style.display = ''; $('stop-breath').hidden = true;
    $('start-breath').textContent = done ? '再给自己 1 分钟' : '放下模拟，开始 1 分钟';
  }
  function updateBreath() {
    const elapsed = (performance.now() - breathStart) / 1000;
    if (elapsed >= 60) { if (state.finishBreath()) track('breathDone'); stopBreath(true); toast('一分钟练习完成。可以喝口水，活动一下。'); return; }
    const phase = elapsed % 10 < 4 ? 0 : 1;
    if (phase !== breathPhase) {
      breathPhase = phase; $('breath-circle').style.transitionDuration = phase ? '6s' : '4s';
      $('breath-circle').style.transform = phase ? 'scale(.88)' : 'scale(1.15)';
      $('breath-instruction').textContent = phase ? '缓缓呼气' : '轻轻吸气';
    }
    $('breath-seconds').textContent = `还剩 ${Math.ceil(60 - elapsed)} 秒 · 第 ${Math.floor(elapsed / 10) + 1} / 6 轮`;
  }
  $('start-breath').addEventListener('click', () => {
    stopAuto(); state.putDown(); track('putDown'); render(); breathStart = performance.now(); breathPhase = -1;
    $('start-breath').hidden = true; $('start-breath').style.display = 'none'; $('stop-breath').hidden = false;
    updateBreath(); breathTimer = setInterval(updateBreath, 200);
  });
  $('stop-breath').addEventListener('click', () => stopBreath(false));
  function pauseApp() { flushSmokeTime(); background = true; stopAuto(); if (breathTimer) stopBreath(false); if (audio && audio.state === 'running') audio.suspend().catch(() => {}); }
  function resumeApp() { background = false; lastFrame = performance.now(); }
  document.addEventListener('visibilitychange', () => document.hidden ? pauseApp() : resumeApp());
  window.addEventListener('blur', () => { stopAuto(); flushSmokeTime(); });
  window.addEventListener('pagehide', flushSmokeTime);
  window.addEventListener('appPause', pauseApp); window.addEventListener('appResume', resumeApp);
  let lastFrame = performance.now(); let lastUI = 0;
  function animate(now) {
    const elapsed = Math.min(.1, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now;
    if (!background && !document.hidden && currentPage === 'experience') {
      if (state.burn(elapsed)) { smokeMs += Math.round(elapsed * 1000); if (smokeMs >= 5000 || !state.cigarette.lit) flushSmokeTime(); }
      if (immersive.active) immersive.animate(now); else visuals.draw(now);
      if (now - lastUI > 400) { render(); lastUI = now; }
    }
    requestAnimationFrame(animate);
  }
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('./sw.js').catch(() => {});
  progress = new ProgressView({ getAccount: () => account, rest: () => { showPage('pause'); $('start-breath').click(); } });
  account = new AccountController({
    beforeAccountChange: flushSmokeTime,
    onUser: user => progress.setUser(user),
    onStats: data => progress.render(data),
    isProgress: () => currentPage === 'progress',
    warn: toast,
    pause: () => { stopAuto(); flushSmokeTime(); render(); },
    reset: () => { smokeMs = 0; stopAuto(); stopBreath(false); Object.assign(state, new Simulator()); immersive?.scene?.clearFloor(); render(); }
  });
  updateSound(); render(); requestAnimationFrame(animate);
})();
