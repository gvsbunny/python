/* ===== Synthesised sound: bat on ball, crowd bed, chants, horns, stingers ===== */
const SND = {
  ctx: null, on: true,
  init() {
    if (this.ctx) { if (this.ctx.resume) this.ctx.resume(); return; }
    try { const C = window.AudioContext || window.webkitAudioContext; this.ctx = new C(); } catch (e) { return; }
    const ctx = this.ctx;
    this.master = ctx.createGain(); this.master.gain.value = this.on ? 0.85 : 0;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ctx.destination);
    const len = ctx.sampleRate * 3, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.025 * w) / 1.025; d[i] = last * 3.2 + w * 0.1; } }
    this.noise = buf;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 0.45;
    this.crowd = ctx.createGain(); this.crowd.gain.value = 0.09;
    src.connect(bp); bp.connect(this.crowd); this.crowd.connect(this.master); src.start();
    this.nextChant = ctx.currentTime + 6;
  },
  burst(dur, type, freq, vol, delay = 0, q = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random() * 2); s.stop(t + dur + 0.05);
  },
  tone(f0, f1, dur, vol, type = 'triangle', delay = 0, attack = 0.004) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  },
  hit(q) {
    // willow "tok": a short resonant body plus a bright click
    this.burst(0.05, 'bandpass', 1900, 0.9 * (0.5 + q * 0.5), 0, 6);
    this.burst(0.02, 'highpass', 4000, 0.5);
    this.tone(1250, 900, 0.09, 0.45 * (0.5 + q), 'sine');
    this.tone(620, 480, 0.12, 0.25 * q, 'sine');
  },
  edge() { this.burst(0.03, 'highpass', 3000, 0.45); this.tone(2400, 1400, 0.04, 0.12, 'sine'); },
  pad() { this.burst(0.08, 'lowpass', 500, 0.5); this.tone(180, 90, 0.1, 0.2, 'sine'); },
  thud() { this.tone(150, 70, 0.1, 0.22, 'sine'); this.burst(0.05, 'lowpass', 400, 0.25); },
  glove() { this.burst(0.06, 'lowpass', 900, 0.5); this.tone(220, 120, 0.07, 0.2, 'sine'); },
  stumps() { [0, 0.025, 0.06, 0.1].forEach((d, i) => { this.burst(0.06, 'bandpass', 2600 - i * 350, 0.6, d, 4); }); this.tone(900, 600, 0.15, 0.15, 'square', 0.02); },
  whoosh() { this.burst(0.35, 'bandpass', 900, 0.18, 0, 0.8); },
  click() { this.tone(1400, 1100, 0.04, 0.12, 'sine'); },
  swell(level, hold = 2.8) {
    if (!this.ctx) return;
    const g = this.crowd.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(Math.max(0.05, g.value), t);
    g.linearRampToValueAtTime(0.09 + 0.6 * level, t + 0.25); g.setValueAtTime(0.09 + 0.6 * level, t + 0.25 + hold * 0.3); g.exponentialRampToValueAtTime(0.09, t + hold + 0.6);
  },
  groan() { if (!this.ctx) return; const g = this.crowd.gain, t = this.ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(Math.max(0.05, g.value), t); g.linearRampToValueAtTime(0.32, t + 0.15); g.exponentialRampToValueAtTime(0.09, t + 1.6); this.tone(300, 180, 1.2, 0.05, 'sawtooth', 0, 0.2); },
  horn(delay = 0) { [0, 0.22, 0.44].forEach((d, i) => this.tone(i === 2 ? 392 : 330, i === 2 ? 392 : 330, 0.2, 0.12, 'sawtooth', delay + d, 0.02)); },
  stinger(big) {
    // short synth riff for boundaries
    const notes = big ? [523, 659, 784, 1047, 784, 1047] : [440, 554, 659, 880];
    notes.forEach((f, i) => { this.tone(f, f, 0.16, 0.12, 'square', 0.05 + i * 0.09, 0.005); this.tone(f / 2, f / 2, 0.16, 0.08, 'sawtooth', 0.05 + i * 0.09, 0.005); });
    this.burst(0.5, 'highpass', 6000, 0.12, 0.05);
  },
  chant() {
    // the crowd clapping a rhythm
    if (!this.ctx) return;
    [0, 0.3, 0.6, 1.05, 1.35, 1.65, 2.1, 2.4].forEach(d => this.burst(0.07, 'bandpass', 1400, 0.16, d, 1.2));
  },
  tick() {
    if (!this.ctx || !this.on) return;
    if (this.ctx.currentTime > this.nextChant) { this.chant(); this.nextChant = this.ctx.currentTime + 14 + Math.random() * 16; }
  },
  toggle() { this.on = !this.on; if (this.master) this.master.gain.value = this.on ? 0.85 : 0; return this.on; },
};
