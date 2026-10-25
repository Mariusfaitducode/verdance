/* Verdance — ambiance sonore synthétisée (aucun fichier) : musique générative,
   bruits de la nature selon le paysage, cris des animaux. */
(function () {
'use strict';
let ctx = null, master, reverb, musicBus, ambBus, cryBus, noiseBuf;
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
const Snd = window.Snd = { musicOn: store.get('verdance-music', true), natureOn: store.get('verdance-nature', true) };
const amb = { water: 0, forest: 0, mountain: 0, field: 0 }; let animals = [], layers = null, started = false;

function ensure() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    master = ctx.createGain(); master.gain.value = 2.6; master.connect(ctx.destination);
    reverb = ctx.createConvolver(); reverb.buffer = impulse(3.2); const wet = ctx.createGain(); wet.gain.value = .55; reverb.connect(wet).connect(master);
    musicBus = bus(.16, .5); ambBus = bus(.9, .15); cryBus = bus(.55, .35);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function bus(level, send) { const g = ctx.createGain(); g.gain.value = level; g.connect(master); const s = ctx.createGain(); s.gain.value = send; g.connect(s).connect(reverb); return g; }
function impulse(sec) { const n = ctx.sampleRate * sec, b = ctx.createBuffer(2, n, ctx.sampleRate); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6); } return b; }
const now = () => ctx.currentTime;
function osc(type, f, t0, dur, gain, dest, { f2, glide = dur, vib = 0, vibF = 5, filter } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + glide);
  if (vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = vibF; lg.gain.value = vib; l.connect(lg).connect(o.frequency); l.start(t0); l.stop(t0 + dur + .1); }
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + Math.min(.04, dur * .2)); g.gain.exponentialRampToValueAtTime(.0005, t0 + dur);
  let node = o; if (filter) { const f0 = ctx.createBiquadFilter(); Object.assign(f0, { type: filter.type || 'bandpass' }); f0.frequency.value = filter.f; f0.Q.value = filter.q || 1; node.connect(f0); node = f0; }
  node.connect(g).connect(dest); o.start(t0); o.stop(t0 + dur + .05); return o;
}
function noise(t0, dur, gain, dest, { type = 'bandpass', f = 1000, q = 1, attack = .01 } = {}) {
  const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noiseBuf; s.loop = true;
  fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + attack); g.gain.exponentialRampToValueAtTime(.0005, t0 + dur);
  s.connect(fl).connect(g).connect(dest); s.start(t0, Math.random()); s.stop(t0 + dur + .05);
}

/* ---------- Musique générative (ré lydien, très douce) ---------- */
const CHORDS = [[146.8, 220, 277.2, 370], [123.5, 185, 246.9, 293.7], [98, 146.8, 196, 246.9], [110, 164.8, 220, 277.2]];
const PENTA = [587.3, 659.3, 740, 880, 987.8, 1174.7, 1318.5];
let chordI = 0, musicTimer = null, pluckTimer = null;
function pad() {
  if (!Snd.musicOn || !ctx) return;
  const t = now(), ch = CHORDS[chordI++ % CHORDS.length];
  ch.forEach((f, i) => {
    for (const det of [-5, 6]) {
      const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter(); o.type = i === 0 ? 'triangle' : 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(1100, t + 4); lp.frequency.linearRampToValueAtTime(600, t + 9);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(i === 0 ? .05 : .022, t + 3); g.gain.linearRampToValueAtTime(0, t + 10.5);
      o.connect(lp).connect(g).connect(musicBus); o.start(t); o.stop(t + 11);
    }
  });
}
function pluck() {
  if (Snd.musicOn && ctx) { const t = now(), f = PENTA[Math.random() * PENTA.length | 0]; osc('sine', f, t, 1.6, .05, musicBus); osc('sine', f * 2, t, .7, .012, musicBus); if (Math.random() < .35) osc('sine', PENTA[Math.random() * PENTA.length | 0], t + .22, 1.4, .035, musicBus); }
  pluckTimer = setTimeout(pluck, 1400 + Math.random() * 2600);
}

/* ---------- Nature : couches continues + événements ---------- */
function startLayers() {
  layers = {};
  const loop = (type, f, q) => { const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noiseBuf; s.loop = true; fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.value = 0; s.connect(fl).connect(g).connect(ambBus); s.start(); return { s, fl, g }; };
  layers.water = loop('bandpass', 900, .6); layers.water2 = loop('bandpass', 2600, 2.5);
  layers.wind = loop('lowpass', 420, .8);
  const lfo = (target, rate, depth, base) => { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = rate; lg.gain.value = depth; l.connect(lg).connect(target); target.value = base; l.start(); };
  lfo(layers.wind.fl.frequency, .07, 220, 450); lfo(layers.water2.fl.frequency, .9, 700, 2600);
  natureTick();
}
function applyAmbience() {
  if (!layers) return; const t = now(), on = Snd.natureOn ? 1 : 0;
  layers.water.g.gain.setTargetAtTime(on * .05 * Math.min(1, amb.water), t, 1.2); layers.water2.g.gain.setTargetAtTime(on * .018 * Math.min(1, amb.water), t, 1.2);
  layers.wind.g.gain.setTargetAtTime(on * (.012 + .05 * Math.min(1, amb.mountain)), t, 1.5);
}
function bird() { const t = now(), base = 2600 + Math.random() * 1800, n = 2 + (Math.random() * 4 | 0); for (let i = 0; i < n; i++) osc('sine', base * (1 + Math.random() * .25), t + i * .11, .09, .022, ambBus, { f2: base * (1.25 + Math.random() * .4), glide: .07 }); }
function cricket() { const t = now(); for (let i = 0; i < 3; i++) osc('square', 4300, t + i * .045, .025, .004, ambBus, { filter: { f: 4300, q: 8 } }); }
function natureTick() {
  if (Snd.natureOn && ctx) {
    if (Math.random() < .25 + amb.forest * .6) bird();
    if (amb.field > 0 && Math.random() < .2 + amb.field * .5) cricket();
    if (animals.length && Math.random() < .07) Snd.cry(animals[Math.random() * animals.length | 0], .45);
  }
  setTimeout(natureTick, 700 + Math.random() * 1500);
}

/* ---------- Cris des animaux ---------- */
const CRY = {
  howl: (t, d) => { osc('sine', 330, t, 2.2, .1, d, { f2: 540, glide: .7, vib: 8, vibF: 5.5 }); osc('sine', 540, t + .7, 1.5, .08, d, { f2: 380, glide: 1.4, vib: 6 }); },
  bellow: (t, d) => { osc('sawtooth', 120, t, 1.3, .12, d, { f2: 85, glide: 1.2, filter: { f: 520, q: 3 } }); osc('sawtooth', 240, t, 1.1, .05, d, { f2: 170, filter: { f: 1200, q: 4 } }); },
  bark: (t, d) => { for (let i = 0; i < 2; i++) { osc('sawtooth', 420, t + i * .35, .22, .1, d, { f2: 260, filter: { f: 900, q: 2 } }); noise(t + i * .35, .18, .05, d, { f: 1200, q: 1.5 }); } },
  grunt: (t, d) => { for (let i = 0; i < 3; i++) { osc('sawtooth', 85, t + i * .22, .17, .14, d, { f2: 65, filter: { type: 'lowpass', f: 420 } }); noise(t + i * .22, .15, .08, d, { type: 'lowpass', f: 500 }); } },
  growl: (t, d) => { osc('sawtooth', 70, t, 1.2, .16, d, { f2: 60, vib: 6, vibF: 22, filter: { type: 'lowpass', f: 380 } }); noise(t, 1.1, .1, d, { type: 'lowpass', f: 320, attack: .2 }); },
  scream: (t, d) => { osc('sawtooth', 950, t, .5, .07, d, { f2: 620, glide: .45, filter: { f: 1500, q: 2.5 } }); },
  meow: (t, d) => { const o = osc('sawtooth', 480, t, .75, .07, d, { filter: { f: 1300, q: 3 } }); o.frequency.linearRampToValueAtTime(760, t + .25); o.frequency.linearRampToValueAtTime(430, t + .7); },
  whistle: (t, d) => { osc('sine', 2700, t, .32, .07, d, { f2: 2500, glide: .3 }); },
  squeak: (t, d) => { for (let i = 0; i < 3; i++) osc('sine', 5200 + Math.random() * 1500, t + i * .09, .06, .03, d, { f2: 6800, glide: .05 }); },
  chatter: (t, d) => { for (let i = 0; i < 12; i++) osc('square', 1900 + Math.random() * 400, t + i * .045, .03, .02 * (1 - i / 14), d, { filter: { f: 2200, q: 3 } }); },
  sniff: (t, d) => { for (let i = 0; i < 3; i++) noise(t + i * .16, .1, .06, d, { f: 3200, q: 1.2 }); },
  slap: (t, d) => { osc('sine', 130, t, .18, .25, d, { f2: 45, glide: .15 }); noise(t + .02, .45, .07, d, { f: 1800, q: .8 }); },
  chirp: (t, d) => { for (let i = 0; i < 2; i++) osc('sine', 1700, t + i * .16, .12, .05, d, { f2: 2500, glide: .1 }); },
  bat: (t, d) => { for (let i = 0; i < 8; i++) osc('sine', 9000, t + i * .05, .02, .02, d, { f2: 7000, glide: .02 }); },
  bleat: (t, d) => { osc('sawtooth', 380, t, .7, .07, d, { vib: 18, vibF: 7, filter: { f: 950, q: 2.5 } }); },
};
const VOICE = {
  'Loup': 'howl', 'Cerf': 'bellow', 'Chevreuil': 'bark', 'Sanglier': 'grunt', 'Ours': 'growl', 'Renard': 'scream', 'Fouine': 'scream', 'Martre': 'scream',
  'Belette': 'squeak', 'Putois': 'scream', 'Vison': 'chirp', 'Chat sauvage': 'meow', 'Marmotte': 'whistle', 'Souris': 'squeak', 'Mulot': 'squeak',
  'Rat des moissons': 'squeak', 'Campagnol': 'squeak', "Musaraigne d'eau": 'squeak', 'Desman': 'squeak', "Rat d'eau": 'chirp', 'Écureuil': 'chatter',
  'Hérisson': 'sniff', 'Blaireau': 'sniff', 'Lapin': 'sniff', 'Lièvre': 'sniff', 'Castor': 'slap', 'Loutre': 'chirp', 'Chauve-souris': 'bat', 'Oreillard': 'bat',
  'Bouquetin': 'bleat', 'Mouflon': 'bleat', 'Chamois': 'bleat',
};
const lastCry = {};
Snd.cry = function (name, vol = 1) {
  if (!Snd.natureOn || !ensure()) return; const v = VOICE[name]; if (!v) return;
  const t0 = performance.now(); if (lastCry[name] && t0 - lastCry[name] < 1800) return; lastCry[name] = t0;
  const g = ctx.createGain(); g.gain.value = vol; g.connect(cryBus); CRY[v](now() + .02, g);
};
Snd.start = function () {
  if (started || !ensure()) return; started = true;
  startLayers(); applyAmbience(); pad(); musicTimer = setInterval(pad, 9000); pluck();
};
Snd.setAmbience = function (a) { Object.assign(amb, a); applyAmbience(); };
Snd.setAnimals = function (list) { animals = list.filter(n => VOICE[n]); };
Snd.toggleMusic = function () { Snd.musicOn = !Snd.musicOn; store.set('verdance-music', Snd.musicOn); if (Snd.musicOn) { ensure(); Snd.start(); pad(); } };
Snd.toggleNature = function () { Snd.natureOn = !Snd.natureOn; store.set('verdance-nature', Snd.natureOn); applyAmbience(); };
})();
