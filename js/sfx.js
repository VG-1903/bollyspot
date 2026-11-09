// Tiny WebAudio sound effects — no audio files needed.
let ctx = null;

export function sfx(kind, volume = 0.9) {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const vol = Math.max(0.02, volume * 0.5);
    const t0 = ctx.currentTime;
    const tone = (freq, start, dur, type, v) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0, t0 + start);
      g.gain.linearRampToValueAtTime(v, t0 + start + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + start + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(t0 + start); o.stop(t0 + start + dur + 0.05);
    };
    if (kind === 'good') { tone(659, 0, 0.18, 'sine', vol); tone(784, 0.11, 0.18, 'sine', vol); tone(1047, 0.22, 0.3, 'sine', vol); }
    else if (kind === 'bad') { tone(196, 0, 0.3, 'sawtooth', vol * 0.8); tone(147, 0.12, 0.35, 'sawtooth', vol * 0.8); }
    else if (kind === 'win') { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.25, 'triangle', vol)); }
    else tone(523, 0, 0.1, 'triangle', vol * 0.7);
  } catch (e) {}
}
