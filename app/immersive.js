(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  class ImmersiveController {
    constructor(state, flat, actions) {
      this.state = state; this.flat = flat; this.actions = actions; this.scene = null; this.active = false; this.messageTimer = null; this.ownedFullscreen = false;
      this.dialog = $('immersive'); this.previousFocus = null;
      $('open-immersive').addEventListener('click', () => this.open());
      $('close-immersive').addEventListener('click', () => this.close());
      this.dialog.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => $(button.dataset.action).click()));
      this.dialog.querySelectorAll('[data-immersive-pack]').forEach(button => button.addEventListener('click', () => document.querySelector(`[data-pack="${button.dataset.immersivePack}"]`).click()));
      $('immersive-auto').addEventListener('click', () => this.actions.toggleAuto());
      $('rotate-left').addEventListener('click', () => this.scene?.rotate(-.35, 0));
      $('rotate-right').addEventListener('click', () => this.scene?.rotate(.35, 0));
      $('reset-rotation').addEventListener('click', () => { this.scene?.resetRotation(); $('immersive-zoom').value = 100; });
      $('immersive-zoom').addEventListener('input', event => this.scene?.setZoom(event.target.value / 100));
      $('immersive-scene').addEventListener('scenezoom', event => { $('immersive-zoom').value = Math.round(event.detail * 100); });
      $('clear-floor').addEventListener('click', () => { this.scene?.clearFloor(); this.notify('地面已清理。'); });
      $('immersive-rest').addEventListener('click', () => { this.close(); this.actions.rest(); });
      document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && this.ownedFullscreen) { this.ownedFullscreen = false; this.close(); } });
      document.addEventListener('keydown', event => this.keydown(event));
    }
    open() {
      if (this.active) return;
      this.previousFocus = document.activeElement; this.active = true;
      this.dialog.hidden = false; document.body.classList.add('in-immersive');
      document.querySelector('main').inert = true; document.querySelector('.sidebar').inert = true;
      $('close-immersive').focus({ preventScroll: true });
      const nativeDisplay = window.NativeDisplay;
      if (nativeDisplay?.setImmersive) nativeDisplay.setImmersive(true);
      // Request immediately during the user gesture; scene setup can take a moment on slower devices.
      if (!nativeDisplay && !document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().then(() => {
          if (!this.active) { document.exitFullscreen().catch(() => {}); return; }
          this.ownedFullscreen = true;
        }).catch(() => this.notify('已进入沉浸画面；当前环境未启用系统全屏。'));
      }
      this.scene ||= new ImmersiveScene($('immersive-scene'), this.state, this.flat, message => this.notify(message));
      this.scene.active = true; this.scene.lastTime = 0; this.sync();
    }
    close() {
      if (!this.active) return;
      this.active = false; this.actions.stopAuto();
      if (this.scene) this.scene.active = false;
      this.dialog.hidden = true; document.body.classList.remove('in-immersive');
      if (window.NativeDisplay?.setImmersive) window.NativeDisplay.setImmersive(false);
      document.querySelector('main').inert = false; document.querySelector('.sidebar').inert = false;
      if (this.ownedFullscreen && document.fullscreenElement) document.exitFullscreen().catch(() => {});
      this.ownedFullscreen = false; this.previousFocus?.focus({ preventScroll: true });
    }
    notify(message) {
      if (!this.active) return;
      clearTimeout(this.messageTimer); $('immersive-message').textContent = message; $('immersive-message').classList.add('visible');
      this.messageTimer = setTimeout(() => $('immersive-message').classList.remove('visible'), 2800);
    }
    sync() {
      if (!this.active) return;
      this.dialog.querySelectorAll('[data-action]').forEach(button => { button.disabled = $(button.dataset.action).disabled; });
      const nut = this.state.nut;
      this.dialog.querySelector('[data-action="chew-button"] span').textContent = $('chew-button').querySelector('span').textContent;
      this.dialog.querySelector('[data-action="light-cigarette"] span').textContent = this.state.cigarette.used > 0 && !this.state.cigarette.lit ? '再点一根' : '点一根';
      $('immersive-bites').textContent = String(nut?.bites || 0).padStart(2, '0');
      $('immersive-wear').innerHTML = `${nut?.wear || 0}<small>%</small>`;
      $('immersive-progress-bar').style.width = (nut?.wear || 0) + '%';
      $('immersive-nut-status').textContent = $('wear-label').textContent;
      $('immersive-pack-label').textContent = nut ? nut.pack + ' 档' : '空口状态';
      $('immersive-stock').textContent = `剩余 ${this.state.remaining} / 8`;
      $('immersive-fibers').textContent = $('fiber-label').textContent;
      $('immersive-smoke-status').textContent = $('smoke-status').textContent;
      $('immersive-smoke-hint').textContent = this.state.cigarette.holding ? 'O 吐烟 · 烟雾向前散开' : this.state.cigarette.lit ? '可随时熄灭' : '可以独立点燃';
      $('immersive-auto').disabled = $('auto-chew').disabled;
      const auto = $('auto-chew').checked;
      $('immersive-auto').setAttribute('aria-pressed', String(auto)); $('immersive-auto').querySelector('span').textContent = auto ? '● 自动咀嚼中' : '○ 自动咀嚼';
      $('immersive-scene-hint').textContent = !nut ? '已吐出。碎渣落在前方，也可以就此休息。' : nut.wear === 100 ? '已完全纤维化 · G 吐出整颗' : '拖动旋转 · 方向键微调 · Q 吐渣 · R 复位';
      document.querySelectorAll('[data-immersive-pack]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.immersivePack) === this.state.pack)));
    }
    keydown(event) {
      if (event.key === 'Tab' && this.active) {
        const focusable = [...this.dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),canvas[tabindex]')].filter(el => el.getClientRects().length);
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !this.dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        return;
      }
      if (event.key === 'Escape' && this.active) { event.preventDefault(); this.close(); return; }
      if (event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
      if (!this.actions.isExperience()) return;
      const keys = { Space: 'chew-button', KeyQ: 'spit-fibers', KeyG: 'spit-nut', KeyL: 'light-cigarette', KeyI: 'inhale', KeyO: 'exhale', KeyX: 'extinguish' };
      if (keys[event.code]) { event.preventDefault(); const target = $(keys[event.code]); if (!target.disabled) target.click(); return; }
      if (event.code === 'KeyF') { event.preventDefault(); this.active ? this.close() : this.open(); }
      else if (event.code === 'KeyA') { event.preventDefault(); this.actions.toggleAuto(); }
      else if (['Digit1', 'Digit2', 'Digit3'].includes(event.code)) { event.preventDefault(); document.querySelector(`[data-pack="${[50,100,200][Number(event.code.slice(-1)) - 1]}"]`).click(); }
      else if (this.active) {
        if (event.code === 'KeyR') { event.preventDefault(); $('reset-rotation').click(); }
        else if (event.code.startsWith('Arrow')) { event.preventDefault(); this.scene.rotate(event.code === 'ArrowLeft' ? -.15 : event.code === 'ArrowRight' ? .15 : 0, event.code === 'ArrowUp' ? -.15 : event.code === 'ArrowDown' ? .15 : 0); }
      }
    }
    animate(now) { if (this.active) this.scene?.render(now); }
  }
  window.ImmersiveController = ImmersiveController;
})();
