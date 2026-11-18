// Generated from app/visuals.js; same website artwork.
  const TAU = Math.PI * 2;
  const seeded = n => { const value = Math.sin(n * 127.1 + 311.7) * 43758.5453; return value - Math.floor(value); };
  const mix = (a, b, n) => a + (b - a) * n;
  const color = (a, b, n) => `rgb(${a.map((v, i) => Math.round(mix(v, b[i], n))).join(',')})`;
  function ellipse(ctx, x, y, rx, ry, fill) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); if (fill) { ctx.fillStyle = fill; ctx.fill(); } else ctx.stroke();
  }
  function rounded(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

module.exports=function nut(ctx, x, y, nut, scale = 1, bite = 0, rotation = -.22) {
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
    };
