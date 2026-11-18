(function (root) {
  'use strict';
  const durations = { chew: .46, inhale: .85, exhale: 1.35, spit: .22, pack: .75 };
  function synthesize(kind, rate = 44100) {
    const duration = durations[kind] || .22, samples = new Float32Array(Math.ceil(rate * duration));
    let low = 0, smooth = 0, seed = 8103;
    for (let i = 0; i < samples.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = seed / 2147483648 - 1, t = i / rate, u = t / duration;
      low += .12 * (noise - low); smooth += .022 * (noise - smooth);
      const edge = Math.min(1, t / .015, (duration - t) / .03);
      let value;
      if (kind === 'chew') {
        const pulse = [0.045, .16, .29].reduce((sum, at) => sum + Math.exp(-Math.pow((t - at) / .032, 2)), 0);
        const crunch = noise * .15 + low * .70;
        value = pulse * (crunch + Math.sin(2 * Math.PI * (125 * t - 65 * t * t)) * .07);
      } else if (kind === 'inhale') {
        value = (noise - low) * .09 * Math.pow(Math.sin(Math.PI * u), .8) * (.35 + u);
      } else if (kind === 'exhale') {
        value = (low * .62 + smooth * .6 + noise * .035) * Math.pow(Math.sin(Math.PI * u), .65) * (1 - u * .5);
      } else if (kind === 'pack') {
        const tear = .2 + .8 * Math.pow(Math.sin(t * 31), 4);
        value = (noise * .16 + low * .25) * tear * Math.sin(Math.PI * u);
      } else value = (low * .7 + noise * .15) * Math.pow(1 - u, 2);
      samples[i] = Math.max(-.65, Math.min(.65, value * edge));
    }
    return samples;
  }
  class SimulatorSound {
    constructor() { this.context = new (root.AudioContext || root.webkitAudioContext)(); this.buffers = new Map(); this.active = new Set(); }
    get state() { return this.context.state; }
    play(kind) {
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
      if (!this.buffers.has(kind)) {
        const samples = synthesize(kind, this.context.sampleRate), buffer = this.context.createBuffer(1, samples.length, this.context.sampleRate);
        buffer.copyToChannel(samples, 0); this.buffers.set(kind, buffer);
      }
      if (this.active.size >= 4) this.active.values().next().value.stop();
      const source = this.context.createBufferSource(); source.buffer = this.buffers.get(kind);
      source.connect(this.context.destination); this.active.add(source);
      source.onended = () => { source.disconnect(); this.active.delete(source); };
      source.start();
    }
    stop() { for (const source of this.active) { try { source.stop(); } catch {} } this.active.clear(); }
    suspend() { this.stop(); return this.context.suspend(); }
  }
  root.SimulatorSound = SimulatorSound;
  if (typeof module !== 'undefined') module.exports = { synthesize, durations };
})(typeof window !== 'undefined' ? window : globalThis);
