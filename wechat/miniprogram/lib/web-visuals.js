// Generated from app/visuals.js: the complete 2D mouth, tray and smoking scene.
module.exports=function(platform){
const window={devicePixelRatio:platform.pixelRatio};
const performance={now:platform.now};
const matchMedia=()=>({matches:platform.reduced});
  const TAU = Math.PI * 2;
  const seeded = n => { const value = Math.sin(n * 127.1 + 311.7) * 43758.5453; return value - Math.floor(value); };
  const mix = (a, b, n) => a + (b - a) * n;
  const color = (a, b, n) => `rgb(${a.map((v, i) => Math.round(mix(v, b[i], n))).join(',')})`;
  function ellipse(ctx, x, y, rx, ry, fill) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); if (fill) { ctx.fillStyle = fill; ctx.fill(); } else ctx.stroke();
  }
  function rounded(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
  class Visuals {
    constructor(mainCanvas, smokeCanvas, state) {
      this.main = mainCanvas; this.smoke = smokeCanvas; this.state = state;
      this.lastChew = -10000; this.lastTake = -10000; this.lastInhale = -10000; this.lastExhale = -10000;
      this.particles = []; this.ejected = []; this.clouds = [];
      this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.t = 0; this.dt = 0;
    }
    setup(canvas, baseWidth, baseHeight) {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth; const height = canvas.clientHeight;
      if (width < 1 || height < 1) return null;
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      }
      const ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (canvas === this.main) {
        const scale = Math.min(canvas.width / 500, canvas.height / baseHeight);
        ctx.setTransform(scale, 0, 0, scale, (canvas.width - baseWidth * scale) / 2, (canvas.height - baseHeight * scale) / 2);
      } else ctx.setTransform(canvas.width / baseWidth, 0, 0, canvas.height / baseHeight, 0, 0);
      return ctx;
    }
    chew() { this.lastChew = performance.now(); }
    take() { this.lastTake = performance.now(); }
    spit(whole, nut) {
      const time = performance.now();
      if (whole) this.ejected.push({ nut: { ...nut }, time });
      const count = whole ? 13 : 24;
      for (let i = 0; i < count; i++) this.particles.push({ time, vx: 120 + seeded(i + time) * 100, vy: -140 + seeded(i * 3 + time) * 120, rot: seeded(i + 91) * TAU, length: 4 + seeded(i + 52) * 11, origin: i });
    }
    inhale() { this.lastInhale = performance.now(); }
    exhale() {
      this.lastExhale = performance.now();
      for (let i = 0; i < 18; i++) this.clouds.push({ time: this.lastExhale + i * 23, x: 220, y: 57, vx: -42 - seeded(i + 20) * 48, vy: -12 - seeded(i + 55) * 26, r: 5 + seeded(i) * 12 });
    }
    nut(ctx, x, y, nut, scale = 1, bite = 0, rotation = -.22) {
      const w = nut.wear / 100;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); ctx.scale(scale * (1 + w * .32 + bite * .05), scale * (1 - w * .53 - bite * .2));
      const grad = ctx.createLinearGradient(-70, -50, 55, 45);
      grad.addColorStop(0, color([175, 132, 80], [111, 76, 48], w));
      grad.addColorStop(.4, color([135, 89, 48], [89, 55, 35], w));
      grad.addColorStop(.78, color([92, 58, 32], [65, 40, 29], w));
      grad.addColorStop(1, '#513721');
      const outline = () => {
        ctx.beginPath();
        for (let i = 0; i <= 90; i++) {
          const a = i / 90 * TAU;
          const rough = 1 + (seeded(i + 4) - .5) * (.045 + w * .11);
          const px = Math.cos(a) * 83 * rough;
          const py = Math.sin(a) * (40 + 9 * Math.sin(a * 2 + .5)) * rough;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
      };
      ctx.shadowColor = '#44341f2e'; ctx.shadowBlur = 9; ctx.shadowOffsetY = 5;
      outline(); ctx.fillStyle = grad; ctx.fill(); ctx.shadowColor = 'transparent';
      ctx.save(); outline(); ctx.clip();
      for (let i = 0; i < 180; i++) {
        const y1 = (seeded(i + 5) - .5) * 110;
        const x1 = (seeded(i + 234) - .5) * 170;
        ctx.beginPath(); ctx.moveTo(x1 - 30, y1);
        ctx.bezierCurveTo(x1 - 5, y1 - 12, x1 + 28, y1 + 7, x1 + 75, y1 - 8);
        ctx.strokeStyle = i % 3 === 0 ? `rgba(222,182,119,${.12 + seeded(i) * .26})` : `rgba(51,27,13,${.12 + seeded(i) * .32})`;
        ctx.lineWidth = .5 + seeded(i + 1) * 1.3; ctx.stroke();
      }
      for (let i = 0; i < 150; i++) {
        const xx = (seeded(i + 800) - .5) * 170; const yy = (seeded(i + 2000) - .5) * 98;
        ctx.fillStyle = i % 2 ? '#f8dfac35' : '#2e1b1350'; ellipse(ctx, xx, yy, seeded(i) * 1.7 + .3, .6, ctx.fillStyle);
      }
      ctx.beginPath(); ctx.moveTo(-75, 8); ctx.bezierCurveTo(-40, -8, 20, 8, 73, -4); ctx.strokeStyle = '#42281577'; ctx.lineWidth = 7; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-75, 6); ctx.bezierCurveTo(-40, -9, 20, 5, 73, -7); ctx.strokeStyle = '#c3996155'; ctx.lineWidth = 2; ctx.stroke();
      const shine = ctx.createRadialGradient(-28, -21, 2, -15, -7, 62); shine.addColorStop(0, '#efdcb43a'); shine.addColorStop(1, '#f0d29b00');
      ctx.fillStyle = shine; ctx.fillRect(-90, -60, 180, 120); ctx.restore();
      if (w > .08) {
        const fibers = Math.round(w * 50) + Math.round(nut.fibers / 8);
        for (let i = 0; i < fibers; i++) {
          const angle = seeded(i + 3) * TAU; const x1 = Math.cos(angle) * (65 + seeded(i) * 10); const y1 = Math.sin(angle) * 35;
          const extension = (9 + seeded(i + 9) * 30) * w;
          ctx.beginPath(); ctx.moveTo(x1 * .75, y1 * .65);
          ctx.quadraticCurveTo(x1 + Math.cos(angle) * extension * .8, y1 + Math.sin(angle) * extension, x1 + Math.cos(angle) * extension, y1 + Math.sin(angle) * extension * .7 + seeded(i + 7) * 9);
          ctx.strokeStyle = i % 3 ? '#ad8658' : '#68482c'; ctx.lineWidth = .7 + seeded(i) * 1.1; ctx.stroke();
        }
      }
      ctx.restore();
    }
    mouth(ctx, bite) {
      ctx.save(); ctx.translate(310, 160);
      // An illustrative open mouth, with independently moving rows of teeth.
      ctx.fillStyle = '#e9ded125'; ellipse(ctx, 0, 0, 150, 87, ctx.fillStyle);
      ctx.strokeStyle = '#c9af9f68'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-153, -2); ctx.bezierCurveTo(-121, -64, -61, -78 + bite * 17, 0, -64 + bite * 17); ctx.bezierCurveTo(61, -78 + bite * 17, 121, -64, 153, -2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-153, 3); ctx.bezierCurveTo(-96, 100 - bite * 20, 96, 100 - bite * 20, 153, 3); ctx.stroke();
      for (let row = 0; row < 2; row++) {
        for (let i = -3; i <= 3; i++) {
          const xx = i * 28; const arch = Math.abs(i) * 4;
          const yy = row === 0 ? -70 + arch + bite * 22 : 40 - arch - bite * 22;
          const height = row === 0 ? 25 : 23;
          const fill = ctx.createLinearGradient(0, yy, 0, yy + height); fill.addColorStop(0, row ? '#fffff6' : '#ebe9dd'); fill.addColorStop(.6, '#fffff8'); fill.addColorStop(1, row ? '#e6e6da' : '#f9f9f0');
          rounded(ctx, xx - 13, yy, 26, height, row ? [8, 8, 5, 5] : [5, 5, 9, 9]);
          ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = '#d6d8c9aa'; ctx.lineWidth = .8; ctx.stroke();
        }
      }
      ctx.restore();
    }
    drawMain(now) {
      const ctx = this.setup(this.main, 620, 340); if (!ctx) return;
      const w = this.state.nut ? this.state.nut.wear / 100 : 0;
      const since = (now - this.lastChew) / 450;
      const bite = since > 0 && since < 1 && !this.reduced ? Math.sin(since * Math.PI) : 0;
      const glow = ctx.createRadialGradient(310, 164, 25, 310, 164, 140); glow.addColorStop(0, '#e5ebdccc'); glow.addColorStop(1, '#e5ebdc00');
      ellipse(ctx, 310, 164, 150, 145, glow);
      ctx.strokeStyle = '#dde5d255'; ctx.lineWidth = .8; ellipse(ctx, 310, 164, 114, 114); ellipse(ctx, 310, 164, 167, 142);
      this.mouth(ctx, bite);
      if (this.state.nut) {
        const age = Math.min(1, (now - this.lastTake) / 400);
        const entrance = this.reduced ? 1 : 1 - Math.pow(1 - age, 3);
        ellipse(ctx, 310, 208, 86 + w * 13, 10, '#7260430d');
        this.nut(ctx, 310, 161 - bite * 3, this.state.nut, entrance, bite, -.22 + w * .13);
        for (let i = 0; i < Math.floor(this.state.nut.fibers / 8); i++) {
          const px = 250 + seeded(i + 90) * 120; const py = 205 + seeded(i + 33) * 14;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + 4, py - 4, px + 10, py + 1); ctx.strokeStyle = '#92714b8c'; ctx.lineWidth = 1.3; ctx.stroke();
        }
      } else {
        ctx.fillStyle = '#9fa98e'; ctx.font = '11px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.fillText('此刻，嘴里空空的。', 310, 164);
      }
      // A small virtual tray catches the pieces being spat out.
      ctx.save(); if (this.main.clientWidth < 450) ctx.translate(-60, -5);
      ctx.strokeStyle = '#a4af9570'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(483, 252); ctx.quadraticCurveTo(489, 271, 501, 272); ctx.lineTo(539, 272); ctx.quadraticCurveTo(551, 271, 557, 252); ctx.stroke();
      ellipse(ctx, 520, 252, 37, 7, '#e6ebdd'); ctx.stroke();
      ctx.fillStyle = '#a7b096'; ctx.font = '8px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.fillText('虚拟收集盘', 520, 287);
      for (let i = 0; i < Math.min(7, this.state.spits + this.state.discarded); i++) ellipse(ctx, 500 + i * 6, 252, 4, 1.5, '#9b805958');
      ctx.restore();
      this.ejected = this.ejected.filter(p => now - p.time < 800);
      const narrow = this.main.clientWidth < 450;
      this.ejected.forEach(p => { const age = (now - p.time) / 800; ctx.globalAlpha = 1 - age * .7; this.nut(ctx, 310 + (narrow ? 150 : 210) * age, 161 - Math.sin(age * Math.PI) * 85 + age * (narrow ? 86 : 91), p.nut, 1 - age * .85, 0, -.2 + age * 3); ctx.globalAlpha = 1; });
      this.particles = this.particles.filter(p => now - p.time < 1000);
      this.particles.forEach(p => {
        const age = (now - p.time) / 1000; const x = 310 + p.vx * age * (narrow ? .72 : 1); const y = 164 + p.vy * age + 220 * age * age;
        ctx.save(); ctx.translate(x, Math.min(narrow ? 249 : 254, y)); ctx.rotate(p.rot + age * 5); ctx.globalAlpha = 1 - age;
        ctx.strokeStyle = '#9e7e50'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(p.length / 2, -3, p.length, 1); ctx.stroke(); ctx.restore();
      });
    }
    drawSmoke(now) {
      const ctx = this.setup(this.smoke, 320, 108); if (!ctx) return;
      const c = this.state.cigarette; const tip = 62 + c.used * 120;
      ctx.save(); ctx.translate(0, 2);
      ellipse(ctx, 160, 79, 102 - c.used * 45, 5, '#50613d08');
      const paper = ctx.createLinearGradient(0, 61, 0, 75); paper.addColorStop(0, '#f7f7ec'); paper.addColorStop(.4, '#ffffff'); paper.addColorStop(1, '#d9daca');
      rounded(ctx, tip, 59, 202 - tip, 15, [2, 0, 0, 2]); ctx.fillStyle = paper; ctx.fill(); ctx.strokeStyle = '#dedfd2'; ctx.lineWidth = .6; ctx.stroke();
      for (let i = 0; i < 35; i++) { const xx = 65 + i * 4; if (xx > tip && xx < 202) { ctx.strokeStyle = '#c8cdbb20'; ctx.beginPath(); ctx.moveTo(xx, 61); ctx.lineTo(xx - 1, 73); ctx.stroke(); } }
      const filter = ctx.createLinearGradient(0, 59, 0, 75); filter.addColorStop(0, '#dcb17b'); filter.addColorStop(.4, '#e9c394'); filter.addColorStop(1, '#c99762');
      rounded(ctx, 202, 59, 48, 15, [0, 3, 3, 0]); ctx.fillStyle = filter; ctx.fill();
      for (let i = 0; i < 28; i++) ellipse(ctx, 205 + seeded(i) * 42, 61 + seeded(i + 5) * 10, .7, .55, '#9a6e3d35');
      ctx.fillStyle = '#dbc6a0'; ctx.fillRect(201, 59, 2, 15);
      if (c.lit) {
        const inhaleAge = now - this.lastInhale; const hot = inhaleAge < 1500 ? 1 - inhaleAge / 1500 : 0;
        const ember = ctx.createRadialGradient(tip, 66, 0, tip, 66, 13 + hot * 7); ember.addColorStop(0, '#f08e4990'); ember.addColorStop(1, '#f08e4900');
        ellipse(ctx, tip, 66, 18 + hot * 10, 18 + hot * 10, ember);
        ctx.fillStyle = '#9c7762'; ctx.fillRect(tip, 59, 5, 15); ctx.fillStyle = '#dd8b4c'; ctx.fillRect(tip + 4, 61, 2, 11);
        for (let j = 0; j < 4; j++) {
          ctx.beginPath();
          for (let i = 0; i < 35; i++) {
            const progress = i / 34; const xx = tip + Math.sin(progress * 5 + now / 1300 + j) * (3 + progress * 11) - progress * 6;
            const yy = 58 - progress * 48;
            i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
          }
          ctx.strokeStyle = `rgba(164,176,153,${.11 - j * .018})`; ctx.lineWidth = 2 + j; ctx.stroke();
        }
      } else { ctx.fillStyle = c.used > 0 ? '#9e9687' : '#9c7953'; ctx.fillRect(tip, 60, 2, 13); }
      if (now - this.lastInhale < 1000 && c.holding) {
        const age = (now - this.lastInhale) / 1000;
        for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(260 + i * 6 - age * 15, 61 + i * 2); ctx.lineTo(268 + i * 6 - age * 15, 61 + i * 2); ctx.strokeStyle = `rgba(145,162,129,${(1 - age) * .6})`; ctx.lineWidth = 1; ctx.stroke(); }
      }
      this.clouds = this.clouds.filter(p => now - p.time < 3100);
      this.clouds.forEach(p => {
        const age = (now - p.time) / 1000; if (age < 0) return;
        const x = p.x + p.vx * age; const y = p.y + p.vy * age;
        const r = p.r + age * 13; const cloud = ctx.createRadialGradient(x, y, 0, x, y, r);
        cloud.addColorStop(0, `rgba(153,160,149,${Math.max(0, .08 * (1 - age / 3.1))})`); cloud.addColorStop(1, '#a0aba000'); ellipse(ctx, x, y, r, r, cloud);
      });
      ctx.restore();
    }
    draw(now) { this.drawMain(now); this.drawSmoke(now); }
  }

return Visuals;
};
