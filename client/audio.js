// Chiptune sound, made on the fly with square and triangle waves. No sound files.

let ctx = null, master = null, musicGain = null, musicTimer = null, nextBar = 0;
const state = { sound: true, music: false };
try {
  const saved = JSON.parse(localStorage.getItem('kf_audio') || '{}');
  Object.assign(state, saved);
} catch { /* storage may be blocked */ }

function save() { try { localStorage.setItem('kf_audio', JSON.stringify(state)); } catch { /* ignore */ } }

function ensure() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.18; master.connect(ctx.destination);
  musicGain = ctx.createGain(); musicGain.gain.value = 0.35; musicGain.connect(master);
  return true;
}

const hz = m => 440 * Math.pow(2, (m - 69) / 12);

function tone(m, start, dur, { type = 'square', vol = 0.5, slide = 0, out } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(hz(m), start);
  if (slide) o.frequency.linearRampToValueAtTime(hz(m + slide), start + dur);
  g.gain.setValueAtTime(vol, start);
  g.gain.exponentialRampToValueAtTime(0.001, start + dur);
  o.connect(g); g.connect(out || master);
  o.start(start); o.stop(start + dur + 0.02);
}

function noise(start, dur, vol = 0.3) {
  const n = ctx.sampleRate * dur, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = buf; g.gain.setValueAtTime(vol, start); g.gain.exponentialRampToValueAtTime(0.001, start + dur);
  src.connect(g); g.connect(master); src.start(start);
}

const SFX = {
  click: t => tone(84, t, 0.04, { vol: 0.25 }),
  roll: t => { for (let i = 0; i < 6; i++) noise(t + i * 0.07, 0.05, 0.25); tone(72, t + 0.45, 0.08); },
  coin: t => { tone(83, t, 0.06); tone(88, t + 0.06, 0.18); },
  build: t => { tone(55, t, 0.07, { type: 'triangle', vol: 0.8 }); tone(60, t + 0.08, 0.07, { type: 'triangle', vol: 0.8 }); noise(t, 0.04, 0.2); },
  turn: t => { [67, 72, 76, 79].forEach((m, i) => tone(m, t + i * 0.09, 0.12, { vol: 0.35 })); },
  error: t => tone(45, t, 0.18, { vol: 0.35, slide: -3 }),
  steal: t => tone(76, t, 0.25, { vol: 0.3, slide: -12 }),
  quest: t => { [72, 76, 79, 84].forEach((m, i) => tone(m, t + i * 0.07, 0.1, { vol: 0.3 })); tone(88, t + 0.3, 0.35, { vol: 0.3 }); },
  news: t => { tone(64, t, 0.15, { vol: 0.3 }); tone(69, t + 0.16, 0.3, { vol: 0.3 }); },
  win: t => { [60, 64, 67, 72, 67, 72, 76, 79].forEach((m, i) => tone(m, t + i * 0.12, 0.2, { vol: 0.35 })); tone(84, t + 1, 0.8, { vol: 0.35 }); },
};

export function sfx(name) {
  if (!state.sound || !ensure() || !SFX[name]) return;
  SFX[name](ctx.currentTime + 0.01);
}

// A little tune in D dorian, like a lute player in a castle courtyard.
const MELODY = [
  [62, 1], [65, 1], [67, 1], [69, 2], [67, 1], [65, 1], [64, 1], [62, 2], [0, 1], [60, 1], [62, 1], [64, 1], [65, 2], [64, 1], [60, 1], [62, 3], [0, 1],
  [69, 1], [72, 1], [71, 1], [69, 2], [67, 1], [65, 1], [67, 1], [69, 2], [0, 1], [67, 1], [65, 1], [64, 1], [62, 2], [61, 1], [64, 1], [62, 3], [0, 1],
];
const BASS = [38, 38, 36, 36, 34, 34, 36, 38];
const BEAT = 0.22;

function scheduleMusic() {
  if (!state.music || !ctx) return;
  while (nextBar < ctx.currentTime + 1.5) {
    let t = nextBar;
    for (const [m, beats] of MELODY) {
      if (m) tone(m + 12, t, beats * BEAT * 0.9, { vol: 0.22, out: musicGain });
      t += beats * BEAT;
    }
    const total = MELODY.reduce((s, [, b]) => s + b, 0) * BEAT;
    BASS.forEach((m, i) => tone(m, nextBar + i * total / BASS.length, total / BASS.length * 0.95, { type: 'triangle', vol: 0.5, out: musicGain }));
    nextBar += total;
  }
}

export function setMusic(on) {
  state.music = on; save();
  clearInterval(musicTimer);
  musicTimer = null;
  if (!on && ctx) {
    // drop notes already queued for the rest of the bar
    musicGain.disconnect();
    musicGain = ctx.createGain(); musicGain.gain.value = 0.35; musicGain.connect(master);
  }
  if (on && ensure()) { nextBar = ctx.currentTime + 0.1; scheduleMusic(); musicTimer = setInterval(scheduleMusic, 500); }
}
export function setSound(on) { state.sound = on; save(); }
export function audioState() { return { ...state }; }
export function unlock() { if (ensure() && state.music && !musicTimer) setMusic(true); }
