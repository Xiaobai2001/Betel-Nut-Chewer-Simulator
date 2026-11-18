(function () {
  let current = null, timer = null;
  window.openPackEffect = function (host, tier, capacity) {
    clearTimeout(timer); current?.remove();
    const overlay = document.createElement('div'); overlay.className = 'pack-opening'; overlay.dataset.tier = tier; overlay.setAttribute('aria-hidden', 'true');
    const bag = document.createElement('div'); bag.className = 'opening-bag';
    const tear = document.createElement('i'); tear.className = 'opening-tear';
    const seam = document.createElement('div'); seam.className = 'opening-seam';
    const label = document.createElement('span'); label.textContent = { 50: '青 椰', 100: '秋 山', 200: '夜 岩' }[tier];
    const number = document.createElement('strong'); number.textContent = tier;
    const note = document.createElement('small'); note.textContent = capacity + ' 颗 · 虚拟包装';
    bag.append(tear, seam, label, number, note); overlay.append(bag);
    for (let i = 0; i < 8; i++) { const fleck = document.createElement('b'); fleck.style.setProperty('--i', i); overlay.append(fleck); }
    host.append(overlay); current = overlay;
    timer = setTimeout(() => { overlay.remove(); if (current === overlay) current = null; }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 650 : 1300);
  };
})();
