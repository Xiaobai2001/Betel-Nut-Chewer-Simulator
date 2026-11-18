(function (root) {
  'use strict';
  class Simulator {
    constructor() {
      this.pack = 50; this.remaining = 9; this.smokeRemaining = 20;
      this.nut = { wear: 0, fibers: 0, bites: 0, pack: 50 };
      this.totalBites = 0; this.discarded = 0; this.spits = 0;
      this.cigarette = { lit: false, holding: false, used: 0, puffs: 0, burnedMs: 0 };
      this.restReady = false;
    }
    get capacity() { return Simulator.PACK_SIZES[this.pack]; }
    chew() {
      if (!this.nut || this.nut.wear >= 100) return false;
      this.restReady = false;
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
      this.restReady = false;
      this.remaining--; this.nut = { wear: 0, fibers: 0, bites: 0, pack: this.pack }; return true;
    }
    changePack(value) {
      if (![50, 100, 200].includes(value)) return false;
      this.pack = value; this.remaining = this.capacity; return true;
    }
    light() {
      // Smoking is independent of the nut. A finished cigarette can always be replaced.
      if (this.cigarette.lit) return false;
      this.restReady = false;
      if (this.smokeRemaining === 0) this.smokeRemaining = 20;
      this.smokeRemaining--;
      this.cigarette = { lit: true, holding: false, used: 0, puffs: 0, burnedMs: 0 }; return true;
    }
    inhale() {
      const c = this.cigarette;
      if (!c.lit || c.holding) return false;
      c.holding = true; c.puffs++; c.used = Math.min(1, (c.puffs * 14000 + c.burnedMs) / 100000);
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
      if (!this.cigarette.lit || !Number.isFinite(seconds) || seconds <= 0) return false;
      this.cigarette.burnedMs += Math.round(seconds * 1000);
      this.cigarette.used = Math.min(1, (this.cigarette.puffs * 14000 + this.cigarette.burnedMs) / 100000);
      if (this.cigarette.used >= 1) this.cigarette.lit = false;
      return true;
    }
    putDown() { this.nut = null; this.extinguish(); this.restReady = true; }
    finishBreath() { if (!this.restReady) return false; this.restReady = false; return true; }
  }
  Simulator.PACK_SIZES = Object.freeze({ 50: 10, 100: 15, 200: 20 });
  if (typeof module !== 'undefined' && module.exports) module.exports = Simulator;
  else root.Simulator = Simulator;
})(typeof window !== 'undefined' ? window : globalThis);
