// Frozen 1.2 simulation rules for replaying previously queued protocol-1 events (eight nuts per bag).
(function (root) {
  'use strict';
  class Simulator {
    constructor() {
      this.pack = 50; this.remaining = 7;
      this.nut = { wear: 0, fibers: 0, bites: 0, pack: 50 };
      this.totalBites = 0; this.discarded = 0; this.spits = 0;
      this.cigarette = { lit: false, holding: false, used: 0, puffs: 0 };
    }
    chew() {
      if (!this.nut || this.nut.wear >= 100) return false;
      this.nut.bites++; this.totalBites++;
      this.nut.wear = Math.min(100, this.nut.wear + 7);
      this.nut.fibers = Math.min(100, this.nut.fibers + 12);
      return true;
    }
    spitFibers() {
      if (!this.nut || this.nut.fibers === 0) return false;
      this.nut.fibers = 0; this.spits++; return true;
    }
    spitNut() {
      if (!this.nut) return false;
      this.nut = null; this.discarded++; return true;
    }
    take() {
      if (this.nut || this.remaining <= 0) return false;
      this.remaining--; this.nut = { wear: 0, fibers: 0, bites: 0, pack: this.pack }; return true;
    }
    changePack(value) {
      if (![50, 100, 200].includes(value)) return false;
      this.pack = value; this.remaining = 8; return true;
    }
    light() {
      // Smoking is independent of the nut. A finished cigarette can always be replaced.
      if (this.cigarette.lit) return false;
      this.cigarette = { lit: true, holding: false, used: 0, puffs: 0 }; return true;
    }
    inhale() {
      const c = this.cigarette;
      if (!c.lit || c.holding) return false;
      c.holding = true; c.puffs++; c.used = Math.min(1, c.used + 0.14);
      if (c.used >= 1) c.lit = false;
      return true;
    }
    exhale() {
      if (!this.cigarette.holding) return false;
      this.cigarette.holding = false; return true;
    }
    extinguish() {
      if (!this.cigarette.lit && !this.cigarette.holding) return false;
      this.cigarette.lit = false; this.cigarette.holding = false; return true;
    }
    burn(seconds) {
      if (!this.cigarette.lit) return;
      this.cigarette.used = Math.min(1, this.cigarette.used + Math.max(0, seconds) / 100);
      if (this.cigarette.used >= 1) this.cigarette.lit = false;
    }
    putDown() { this.nut = null; this.extinguish(); }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = Simulator;
  else root.Simulator = Simulator;
})(typeof window !== 'undefined' ? window : globalThis);
