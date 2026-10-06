// WebAudio로 합성하는 효과음 (파일 없음)
const Sound = (() => {
  let ctx = null, master = null, noiseBuf = null;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; } // iOS는 제스처 뒤에 resume 필요
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();
    master = ctx.createGain();
    master.gain.value = 0.45;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function noise(dur, freq, gain, type = 'lowpass') {
    if (!ctx || gain <= 0.001) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  function tone(freq, dur, type, gain, slideTo) {
    if (!ctx || gain <= 0.001) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  return {
    init,
    rifle(v = 1) { noise(0.16, 2400, 0.9 * v); tone(130, 0.1, 'square', 0.25 * v, 50); },
    sniper(v = 1) { noise(0.45, 1500, 1.0 * v); tone(90, 0.25, 'square', 0.35 * v, 35); setTimeout(() => tone(600, 0.04, 'square', 0.12), 450); },
    pistol(v = 1) { noise(0.12, 3200, 0.7 * v); tone(200, 0.09, 'square', 0.2 * v, 70); },
    knife() { noise(0.12, 5000, 0.3, 'highpass'); },
    hit() { tone(1300, 0.05, 'sine', 0.25); },
    headshot() { tone(1900, 0.09, 'triangle', 0.35); tone(950, 0.12, 'sine', 0.2); },
    hurt() { tone(160, 0.18, 'sawtooth', 0.3, 70); noise(0.1, 800, 0.4); },
    empty() { tone(900, 0.03, 'square', 0.12); },
    reload() { tone(500, 0.04, 'square', 0.15); setTimeout(() => tone(380, 0.05, 'square', 0.15), 700); },
    kill() { tone(700, 0.1, 'sine', 0.25); setTimeout(() => tone(1050, 0.14, 'sine', 0.25), 90); },
    switch() { tone(300, 0.05, 'square', 0.1); },
    over(win) { tone(win ? 660 : 220, 0.5, 'triangle', 0.3, win ? 990 : 110); },
  };
})();
