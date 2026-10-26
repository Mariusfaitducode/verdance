/* Verdance mobile — interface téléphone : accueil, partie en ligne ou sur le même téléphone, plateau, main, cartes, fin.
   Le tour se joue en local (liste d'actions rejouée sur l'état de début de tour) et n'est envoyé qu'à la fin. */
(function () {
'use strict';
const $app = document.getElementById('app');
const SQ3 = Math.sqrt(3);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
const K_NAME = 'verdance-m-name', K_GAMES = 'verdance-m-games', K_LOCAL = 'verdance-m-local', K_SOUND = 'verdance-m-sound';
const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };

/* ================= Sons (synthétisés) ================= */
const Sound = {
  ctx: null, on: store.get(K_SOUND, true),
  ac() { if (!this.on) return null; if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } } if (this.ctx.state === 'suspended') this.ctx.resume(); return this.ctx; },
  noise(ctx, dur) { const b = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = ctx.createBufferSource(); s.buffer = b; return s; },
  clack(p = 1) {
    const ctx = this.ac(); if (!ctx) return; const t = ctx.currentTime;
    const n = this.noise(ctx, .09), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'bandpass'; f.frequency.value = 1500 * p; f.Q.value = 2.2; g.gain.setValueAtTime(.55, t); g.gain.exponentialRampToValueAtTime(.001, t + .08);
    n.connect(f).connect(g).connect(ctx.destination); n.start(t);
    const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(240 * p, t); o.frequency.exponentialRampToValueAtTime(110 * p, t + .09);
    og.gain.setValueAtTime(.35, t); og.gain.exponentialRampToValueAtTime(.001, t + .12); o.connect(og).connect(ctx.destination); o.start(t); o.stop(t + .13);
  },
  chime() {
    const ctx = this.ac(); if (!ctx) return; const t = ctx.currentTime;
    [659, 988, 1319, 1760].forEach((fr, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = fr; g.gain.setValueAtTime(0, t + i * .07); g.gain.linearRampToValueAtTime(.14, t + i * .07 + .01); g.gain.exponentialRampToValueAtTime(.001, t + i * .07 + 1.1); o.connect(g).connect(ctx.destination); o.start(t + i * .07); o.stop(t + i * .07 + 1.2); });
  },
  pick() { const ctx = this.ac(); if (!ctx) return; const t = ctx.currentTime; const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(820, t); o.frequency.exponentialRampToValueAtTime(1300, t + .05); g.gain.setValueAtTime(.08, t); g.gain.exponentialRampToValueAtTime(.001, t + .07); o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + .08); },
  nope() { const ctx = this.ac(); if (!ctx) return; const t = ctx.currentTime; const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.setValueAtTime(180, t); o.frequency.linearRampToValueAtTime(120, t + .12); g.gain.setValueAtTime(.05, t); g.gain.exponentialRampToValueAtTime(.001, t + .14); o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + .15); },
  whoosh() {
    const ctx = this.ac(); if (!ctx) return; const t = ctx.currentTime;
    const n = this.noise(ctx, 1.1), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'lowpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(1800, t + .45); f.frequency.exponentialRampToValueAtTime(260, t + 1.05);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.16, t + .35); g.gain.linearRampToValueAtTime(0, t + 1.05);
    n.connect(f).connect(g).connect(ctx.destination); n.start(t);
  },
};

/* ================= Dessins (jetons, motifs) ================= */
const TOP = { blue: '#3f9ad6', gray: '#a9b2bd', brown: '#9a6439', green: '#62b347', yellow: '#f4c63e', red: '#df5639' };
const SIDE = { blue: '#2672a8', gray: '#7a838e', brown: '#6c4022', green: '#43852b', yellow: '#c9961a', red: '#a8351f' };
const HAB = { blue: '#3f9ad6', gray: '#8f9cad', green: '#5fb83a', yellow: '#f0bb2c', red: '#df5f45', brown: '#a8784e', orange: '#f29a3a' };
function isoStack(stack, cx, cy, r) {
  const ry = r * .5, th = r * .42; let s = '';
  const allGray = stack.length && stack.every(t => t === 'gray');
  let yTop = cy;
  stack.forEach((col, i) => {
    const rr = allGray ? r * (1 - i * .11) : r, rry = rr * .5;
    const yt = cy - i * th - th;
    s += `<path d="M${cx - rr},${yt} L${cx - rr},${yt + th} A${rr},${rry} 0 0 0 ${cx + rr},${yt + th} L${cx + rr},${yt} Z" fill="${SIDE[col]}"/>`;
    s += `<ellipse cx="${cx}" cy="${yt}" rx="${rr}" ry="${rry}" fill="${TOP[col]}"/>`;
    s += `<ellipse cx="${cx - rr * .28}" cy="${yt - rry * .25}" rx="${rr * .42}" ry="${rry * .32}" fill="rgba(255,255,255,.22)"/>`;
    yTop = yt;
  });
  const h = stack.length, top = stack[h - 1], w = 'rgba(255,255,255,.75)';
  if (!h) return s;
  if (top === 'green') {
    const big = r * [.5, .72, .9][h - 1], lift = r * [.15, .55, .95][h - 1];
    if (h > 1) s += `<rect x="${cx - r * .07}" y="${yTop - lift}" width="${r * .14}" height="${lift}" fill="#6e4426"/>`;
    const cyc = yTop - lift - big * .55;
    s += `<path d="M${cx - big * .95},${cyc + big * .55} L${cx},${cyc - big * 1.05} L${cx + big * .95},${cyc + big * .55} Z" fill="#3f8a2c"/><path d="M${cx},${cyc - big * 1.05} L${cx + big * .95},${cyc + big * .55} L${cx + big * .05},${cyc + big * .55} Z" fill="#2f6f22"/>`;
  } else if (allGray) {
    const pr = r * (1 - (h - 1) * .11) * .8, ph = r * (.55 + .32 * h);
    s += `<path d="M${cx - pr},${yTop} L${cx - pr * .1},${yTop - ph} L${cx + pr},${yTop} Z" fill="#c2c9d1"/><path d="M${cx - pr * .1},${yTop - ph} L${cx + pr},${yTop} L${cx + pr * .2},${yTop} Z" fill="#8d96a1"/>`;
    if (h === 3) s += `<path d="M${cx - pr * .42},${yTop - ph * .58} L${cx - pr * .1},${yTop - ph} L${cx + pr * .3},${yTop - ph * .6} L${cx + pr * .05},${yTop - ph * .52} Z" fill="#fff"/>`;
  } else if (top === 'red' && h === 2) {
    const ww = r * .9, wh = r * .55;
    s += `<rect x="${cx - ww / 2}" y="${yTop - wh}" width="${ww}" height="${wh}" fill="#f6e3c8"/><rect x="${cx - ww * .1}" y="${yTop - wh * .6}" width="${ww * .22}" height="${wh * .6}" fill="#5a3a22"/><rect x="${cx + ww * .2}" y="${yTop - wh * .8}" width="${ww * .16}" height="${ww * .16}" fill="#ffd36e"/>`;
    s += `<path d="M${cx - ww * .62},${yTop - wh} L${cx},${yTop - wh - r * .55} L${cx + ww * .62},${yTop - wh} Z" fill="#c2402a"/>`;
  } else if (top === 'yellow') {
    for (const dx of [-.4, -.13, .14, .4]) s += `<path d="M${cx + dx * r},${yTop + ry * .2} l0,-${r * .55} M${cx + dx * r},${yTop - r * .32} l-${r * .1},-${r * .1} M${cx + dx * r},${yTop - r * .32} l${r * .1},-${r * .1}" stroke="#a87a10" stroke-width="${r * .07}" stroke-linecap="round" fill="none"/>`;
  } else if (top === 'blue') {
    s += `<path d="M${cx - r * .55},${yTop} q${r * .27},-${ry * .4} ${r * .55},0 t${r * .55},0" stroke="${w}" stroke-width="${r * .08}" fill="none" stroke-linecap="round"/>`;
  } else if (top === 'brown') {
    s += `<ellipse cx="${cx}" cy="${yTop}" rx="${r * .55}" ry="${ry * .55}" fill="none" stroke="rgba(255,230,200,.45)" stroke-width="${r * .06}"/><ellipse cx="${cx}" cy="${yTop}" rx="${r * .25}" ry="${ry * .25}" fill="none" stroke="rgba(255,230,200,.45)" stroke-width="${r * .06}"/>`;
  }
  return s;
}
const stackTopY = (stack, cy, r) => cy - stack.length * r * .42;
function cubeSvg(cx, cy, s) { return `<g transform="translate(${cx},${cy})"><path d="M0,${-s} L${s * .9},${-s * .5} L0,0 L${-s * .9},${-s * .5}Z" fill="#ffc46f"/><path d="M${-s * .9},${-s * .5} L0,0 L0,${s} L${-s * .9},${s * .5}Z" fill="#f08a2a"/><path d="M${s * .9},${-s * .5} L0,0 L0,${s} L${s * .9},${s * .5}Z" fill="#c2671a"/></g>`; }
function tokenIcon(stack, size = 64) {
  const r = size * .3, cy = size * .72 + (stack.length - 1) * r * .2;
  return `<svg viewBox="0 0 ${size} ${size}" aria-hidden="true">${isoStack(stack, size / 2, cy, r)}</svg>`;
}
function hexIso(cx, cy, R, k = .58) { const p = []; for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; p.push((cx + R * Math.cos(a)).toFixed(1) + ',' + (cy + R * Math.sin(a) * k).toFixed(1)); } return p.join(' '); }
function patternSvg(cells, { cube = true } = {}) {
  const R = 17, K = .58;
  const pts = cells.map(([req, q, r], i) => ({ req, i, x: 1.5 * R * q, y: SQ3 * R * (r + q / 2) * K }));
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minx = Math.min(...xs) - R * 1.1, maxx = Math.max(...xs) + R * 1.1, miny = Math.min(...ys) - R * 2.1, maxy = Math.max(...ys) + R * .75;
  let s = '';
  const sorted = [...pts].sort((a, b) => a.y - b.y);
  for (const p of sorted) s += `<polygon points="${hexIso(p.x, p.y + 3, R * .96, K)}" fill="rgba(10,30,50,.25)"/><polygon points="${hexIso(p.x, p.y, R * .96, K)}" fill="${p.i === 0 && cube ? '#fff3dc' : 'rgba(255,255,255,.88)'}" stroke="${p.i === 0 && cube ? '#f08a2a' : 'rgba(255,255,255,0)'}" stroke-width="2"/>`;
  for (const p of sorted) {
    const st = p.req === 'B' ? ['brown', 'red'] : H.REQ[p.req].stack; s += isoStack(st, p.x, p.y + R * .18, R * .55);
    if (p.i === 0 && cube) s += cubeSvg(p.x + R * .55, stackTopY(st, p.y, R * .55) - R * .25, R * .26);
  }
  return `<svg viewBox="${minx} ${miny} ${maxx - minx} ${maxy - miny}" aria-hidden="true">${s}</svg>`;
}
const I = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  paw: '<circle cx="7" cy="9" r="2"/><circle cx="12" cy="6.5" r="2"/><circle cx="17" cy="9" r="2"/><path d="M8 17c0-3 1.8-5 4-5s4 2 4 5c0 1.6-1.6 2.3-4 2.3S8 18.6 8 17z"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>',
  chart: '<path d="M5 20V11M12 20V5M19 20v-6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  home: '<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
};
const icon = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${I[n]}</svg>`;
const PCOL = ['--p0', '--p1'];
const TOKEN_FR = { blue: 'Eau', gray: 'Pierre', brown: 'Tronc', green: 'Feuillage', yellow: 'Champ', red: 'Toit' };
const avatar = (p, i) => `<div class="av" style="background:var(${PCOL[i % 2]})">${esc((p.name || '?').trim().charAt(0).toUpperCase())}</div>`;

/* ================= État de l'app ================= */
// G : la partie ouverte. base = état au début du tour en cours, actions = gestes du tour, S = base + actions (ce qu'on affiche).
let G = null;
const UI = { serverGames: null, serverFor: null, screen: 'boot', sel: 0, cubeCard: null, viewIdx: 0, sheet: null, overlay: null, joinCode: '', busy: false, notice: null };

function apply(S, a) {
  switch (a[0]) {
    case 'slot': return H.takeSlot(S, a[1]);
    case 'token': return H.placeToken(S, a[1], a[2]);
    case 'card': return H.takeCard(S, a[1]);
    case 'cube': return !!H.placeCube(S, a[1], a[2]);
  }
  return false;
}
function replay(base, actions) {
  const S = H.clone(base);
  for (const a of actions) if (!apply(S, a)) return null;
  return S;
}
const S = () => G && G.S;
const mySeat = () => G.mode === 'local' ? G.S.current : G.seat;
const meP = () => G.S.players[mySeat()];
const opp = () => G.S.players[1 - mySeat()];
const myTurn = () => G && G.S && !G.S.over && G.S.current === mySeat() && !(G.mode === 'online' && (G.pending || G.base.current !== G.seat));
const needSpirit = p => p && p.spiritChoice && p.spirit == null;
const canAct = () => myTurn() && !needSpirit(meP()) && !UI.overlay;
function recompute() {
  if (!G || !G.base) { if (G) G.S = null; return; }
  if (G.mode === 'online' && G.base.current !== G.seat && G.preview) {
    G.S = replay(G.base, G.preview) || H.clone(G.base);
  } else {
    const r = replay(G.base, G.actions);
    if (!r) G.actions = [];
    G.S = r || H.clone(G.base);
  }
}

/* ================= Gestes du tour ================= */
function act(a) {
  if (!canAct()) return false;
  const next = H.clone(G.S);
  if (!apply(next, a)) return false;
  G.actions.push(a); G.S = next;
  afterChange();
  return true;
}
function afterChange() {
  if (G.mode === 'local') store.set(K_LOCAL, { base: G.base, actions: G.actions });
  else if (G.conn) G.conn.send({ t: 'preview', actions: G.actions });
  render();
}
function takeSlot(i) {
  if (!act(['slot', i])) return;
  UI.sel = 0; UI.cubeCard = null; Sound.pick(); buzz(8);
}
function placeToken(k) {
  const before = H.score(meP()).landscape;
  if (!act(['token', UI.sel, k])) return false;
  UI.sel = Math.min(UI.sel, Math.max(0, G.S.hand.length - 1));
  Sound.clack(); buzz(12);
  const d = H.score(meP()).landscape - before;
  if (d) setTimeout(() => popAt(G.S.current, k, (d > 0 ? '+' : '−') + Math.abs(d), d > 0 ? '' : 'neg'), 380);
  const ready = meP().cards.filter(c => H.cardTargets(meP().board, c.id).length).map(c => H.CARDS[c.id].name);
  if (ready.length && !G.S.hand.length) toast(`Motif prêt : <b>${ready.map(esc).join(', ')}</b>`);
  return true;
}
function takeCard(i) { if (act(['card', i])) { Sound.pick(); buzz(8); UI.sheet = 'cards'; render(); } }
function startCube(ci) {
  if (!canAct()) return;
  const c = meP().cards[ci]; if (!c || !H.cardTargets(meP().board, c.id).length) return;
  UI.cubeCard = ci; UI.sheet = null; UI.viewIdx = mySeat(); render(); focusIsland(mySeat());
}
function placeCube(k) {
  const before = H.score(meP()).animals, card = H.CARDS[meP().cards[UI.cubeCard].id];
  if (!act(['cube', UI.cubeCard, k])) return false;
  UI.cubeCard = null; render();
  Sound.chime(); buzz([10, 40, 10]);
  Scene.celebrate && Scene.celebrate(G.S.current, k);
  const d = H.score(meP()).animals - before;
  setTimeout(() => popAt(G.S.current, k, '+' + d, 'gold'), 450);
  toast(`<b>${esc(card.name)}</b> s'installe sur ton île`);
  return true;
}
function undo() {
  if (!G || !G.actions.length || !canAct()) return;
  G.actions.pop(); UI.cubeCard = null; UI.sel = 0; recompute(); afterChange();
}
function endTurn() {
  if (!canAct() || !H.canEndTurn(G.S)) return;
  UI.cubeCard = null; UI.sel = 0;
  if (G.mode === 'local') {
    const res = H.endTurn(G.S);
    G.base = G.S; G.actions = []; recompute();
    store.set(K_LOCAL, { base: G.base, actions: [] });
    if (res.over) { gameOver(); return; }
    UI.overlay = 'pass'; render(); Sound.whoosh();
    return;
  }
  if (!G.conn || !G.conn.online) { toast('Pas de connexion. Ton tour partira dès que le réseau revient.', 'err'); return; }
  G.pending = true; G.conn.send({ t: 'turn', version: G.version, actions: G.actions });
  render(); Sound.whoosh();
}
function chooseSpirit(choice) {
  const seat = mySeat();
  if (G.mode === 'local') { H.chooseSpirit(G.base, seat, choice); store.set(K_LOCAL, { base: G.base, actions: G.actions }); }
  else { H.chooseSpirit(G.base, seat, choice); G.conn && G.conn.send({ t: 'spirit', idx: choice }); }
  recompute(); UI.sheet = null; render(); Sound.chime();
}
function gameOver() {
  UI.overlay = 'end'; UI.sheet = null; render(); Sound.chime();
}

/* ================= Retours visuels ================= */
let toastTimer;
function toast(html, cls = '') {
  clearTimeout(toastTimer); document.querySelectorAll('.toast').forEach(t => t.remove());
  const el = document.createElement('div'); el.className = 'toast ' + cls; el.innerHTML = html; $app.appendChild(el);
  toastTimer = setTimeout(() => el.remove(), 3000);
}
function popAt(pi, k, txt, cls) {
  const p = Scene.ready && Scene.screenPos && Scene.screenPos(pi, k); if (!p) return;
  const el = document.createElement('div'); el.className = 'pop ' + (cls || ''); el.textContent = txt; el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
  document.body.appendChild(el); setTimeout(() => el.remove(), 1500);
}
const WHERE = {
  blue: 'L’eau se pose seulement sur une case vide.',
  yellow: 'Un champ se pose seulement sur une case vide.',
  gray: 'La pierre se pose sur une case vide ou sur 1 ou 2 pierres.',
  brown: 'Un tronc se pose sur une case vide ou sur un tronc.',
  green: 'Le feuillage se pose sur une case vide ou sur 1 ou 2 troncs.',
  red: 'La tuile rouge se pose sur une case vide ou sur un tronc, une pierre ou une tuile rouge.',
};

/* ================= Monde 3D ================= */
let lastInsets = '';
function syncScene(animate = true) {
  if (!window.Scene || !Scene.ready) return;
  if (!G || !G.S) { Scene.sync(demoState(), { activeIdx: -1, legal: [], targets: [], patternHi: [], animate: false }); return; }
  const st = G.S, v = { activeIdx: -1, legal: [], targets: [], patternHi: [], ghostColor: null, animate };
  if (canAct() && UI.viewIdx === st.current) {
    const b = st.players[st.current].board;
    v.activeIdx = st.current;
    if (UI.cubeCard != null) { const c = st.players[st.current].cards[UI.cubeCard]; if (c) v.targets = H.cardTargets(b, c.id); }
    else if (st.hand.length) { const col = st.hand[UI.sel]; v.ghostColor = col; v.legal = Object.keys(b).filter(k => H.canPlace(b[k], col)); }
  }
  Scene.sync(st, v);
}
function measureInsets() {
  if (!window.Scene || !Scene.ready || !Scene.setInsets) return;
  const top = $app.querySelector('.top'), bottom = $app.querySelector('.bottom');
  const t = top ? Math.round(top.getBoundingClientRect().bottom) : 0;
  const b = bottom ? Math.round(window.innerHeight - bottom.getBoundingClientRect().top) : 0;
  const key = t + ',' + b; if (key === lastInsets) return; lastInsets = key;
  Scene.setInsets({ top: t, bottom: b });
}
function focusIsland(i, instant = false) { if (window.Scene && Scene.ready && Scene.focus) Scene.focus(i, { instant }); }
function demoState() {
  if (demoState.cache) return demoState.cache;
  const st = H.newState(['Alice', 'Bob']);
  const fill = (b, list) => list.forEach(([k, s, cube]) => { b[k].stack = s; if (cube !== undefined) b[k].cube = { card: cube, color: H.CARDS[cube].color }; });
  fill(st.players[0].board, [['0,0', ['blue']], ['0,1', ['blue']], ['1,1', ['blue']], ['2,1', ['blue']], ['2,2', ['blue'], 12], ['3,2', ['blue']],
    ['4,-2', ['gray', 'gray', 'gray'], 15], ['3,-1', ['gray', 'gray'], 14], ['4,-1', ['gray']], ['1,0', ['brown', 'brown', 'green'], 22], ['2,-1', ['brown', 'green']],
    ['0,2', ['green']], ['1,2', ['brown', 'green']], ['0,3', ['yellow'], 1], ['0,4', ['yellow']], ['1,3', ['yellow']], ['2,0', ['brown', 'red']], ['3,0', ['gray', 'red'], 28],
    ['4,0', ['brown', 'brown', 'green']], ['3,1', ['yellow']], ['4,1', ['yellow']], ['2,3', ['green']], ['4,2', ['gray', 'gray']]]);
  fill(st.players[1].board, [['0,1', ['gray', 'gray']], ['1,0', ['gray', 'gray', 'gray'], 15], ['0,0', ['gray']], ['2,0', ['blue']], ['2,1', ['blue'], 7], ['3,1', ['blue']], ['4,0', ['blue']],
    ['1,2', ['brown', 'green']], ['2,2', ['brown', 'brown', 'green'], 24], ['3,2', ['brown', 'green']], ['0,3', ['brown', 'red']], ['1,3', ['brown', 'red'], 29], ['0,4', ['yellow']], ['2,3', ['yellow']]]);
  return (demoState.cache = st);
}

/* ================= Rendu ================= */
function render() {
  let html = '';
  if (UI.screen === 'boot') html = `<div class="boot">Verdance</div>`;
  else if (UI.screen === 'home') html = homeHtml();
  else if (UI.screen === 'join') html = joinHtml();
  else if (UI.screen === 'game') html = gameScreenHtml();
  // Un champ en cours de saisie garde sa valeur et son curseur à travers le rendu.
  const act = document.activeElement, keep = act && act.id && act.tagName === 'INPUT' ? { id: act.id, v: act.value, s: act.selectionStart } : null;
  $app.innerHTML = html;
  if (keep) { const el = document.getElementById(keep.id); if (el) { el.value = keep.v; el.focus(); try { el.setSelectionRange(keep.s, keep.s); } catch (e) {} } }
  if (UI.notice) { const n = UI.notice; UI.notice = null; toast(n.html, n.cls); }
  measureInsets();
  syncScene();
}

/* ----- Accueil ----- */
function gamesList() { return store.get(K_GAMES, []).sort((a, b) => (b.ts || 0) - (a.ts || 0)); }
function homeHtml() {
  const name = store.get(K_NAME, '');
  const local = store.get(K_LOCAL, null);
  if (name && UI.serverFor !== name) loadServerGames(name);
  let rows = '';
  if (UI.serverGames) {
    rows = UI.serverGames.filter(g => !g.over || Date.now() - g.updated < 3 * 86400e3).map(g => {
      if (g.open) return `<button class="game-row" data-go="pick" data-room="${esc(g.room)}"><div class="who"><b>${esc(g.names[0])} t’attend</b><span>Code ${esc(g.room)}</span></div><span class="turn mine">Rejoindre</span></button>`;
      const oppName = g.names[1 - g.seat];
      const label = g.over ? 'Terminée' : !oppName ? 'En attente' : g.current === g.seat ? 'À toi' : `Tour de ${esc(oppName)}`;
      const round = g.turns ? Math.max(...g.turns) + 1 : 1;
      const here = oppName && g.online && g.online[1 - g.seat];
      return `<button class="game-row" data-go="pick" data-room="${esc(g.room)}"><div class="who"><b>${oppName ? 'Contre ' + esc(oppName) : 'Partie ' + esc(g.room)}</b><span>${here ? `<em class="here">${esc(oppName)} est là</em>` : `Code ${esc(g.room)}${oppName ? ` · manche ${round}` : ''}`}</span></div><span class="turn${!g.over && g.current === g.seat && oppName ? ' mine' : ''}">${label}</span></button>`;
    }).join('');
  } else {
    rows = gamesList().filter(g => !g.over).slice(0, 4).map(g => {
      const oppName = g.names && g.names[1 - g.seat];
      const label = !oppName ? 'En attente' : g.mine ? 'À toi' : `Tour de ${esc(oppName)}`;
      return `<button class="game-row" data-go="open" data-room="${esc(g.room)}"><div class="who"><b>${oppName ? 'Contre ' + esc(oppName) : 'Partie ' + esc(g.room)}</b><span>Code ${esc(g.room)}</span></div><span class="turn${g.mine ? ' mine' : ''}">${label}</span></button>`;
    }).join('');
  }
  const localRow = local && local.base && !local.base.over ? `<button class="game-row" data-go="resume-local"><div class="who"><b>${esc(local.base.players.map(p => p.name).join(' et '))}</b><span>Sur ce téléphone</span></div><span class="turn">Reprendre</span></button>` : '';
  return `<div class="home">
    <div class="logo"><h1>Verdance</h1><p>Chaque jeton façonne ton île.</p></div>
    <div class="home-panel"><div class="stack">
      <div class="field"><label for="nm">Ton prénom</label><input id="nm" maxlength="20" autocomplete="given-name" value="${esc(name)}" placeholder="Ton prénom"></div>
      ${rows || localRow ? `<div class="games"><h2>Vos parties</h2>${rows}${localRow}</div>` : ''}
      <button class="btn wide${rows ? ' ink' : ''}" data-go="create">Créer une nouvelle partie</button>
      <div class="row"><button class="btn sea" data-go="join-screen">Rejoindre</button><button class="btn ink" data-go="local-sheet">Jouer ici</button></div>
    </div></div>
  </div>${sheetHtml()}`;
}
let gamesReq = 0;
setInterval(() => { if (UI.screen === 'home' && UI.serverFor && document.visibilityState === 'visible') loadServerGames(UI.serverFor); }, 8000);
async function loadServerGames(name) {
  UI.serverFor = name; const id = ++gamesReq;
  try {
    const list = await Net.games(name);
    if (id !== gamesReq) return;
    UI.serverGames = list;
    // Ce que le téléphone sait déjà (jetons) complète la liste du serveur.
    if (list) for (const g of list) if (!g.open) rememberGame({ room: g.room, names: g.names, mine: !g.over && g.current === g.seat, over: g.over });
  } catch (e) { if (id === gamesReq) UI.serverGames = null; }
  if (UI.screen === 'home' && id === gamesReq) render();
}
async function pickGame(room) {
  const name = readName(); if (!name) { toast('Écris ton prénom', 'err'); return; }
  const known = store.get(K_GAMES, []).find(g => g.room === room && g.token);
  if (known) { openOnline(room); return; }
  const g = (UI.serverGames || []).find(x => x.room === room);
  try {
    const r = g && g.open ? await Net.join(room, name) : await Net.claim(room, name);
    rememberGame({ room, seat: r.seat, token: r.token, names: g ? g.names : null, ts: Date.now() });
    openOnline(room);
  } catch (e) { toast(e.status === 403 ? 'Ce prénom ne joue pas dans cette partie' : e.status === 409 ? 'Cette partie a déjà deux joueurs' : 'Impossible d’ouvrir la partie : ' + esc(e.message), 'err'); }
}
function joinHtml() {
  return `<div class="home"><div class="logo"><h1>Verdance</h1><p>On t’invite à jouer.</p></div>
    <div class="home-panel"><div class="stack">
      <div class="field"><label for="nm">Ton prénom</label><input id="nm" maxlength="20" autocomplete="given-name" value="${esc(store.get(K_NAME, ''))}" placeholder="Bob"></div>
      <div class="field"><label for="code">Code de la partie</label><input id="code" class="code-input" maxlength="5" autocapitalize="characters" autocomplete="off" value="${esc(UI.joinCode)}" placeholder="K7P2Q"></div>
      <button class="btn wide" data-go="join"${UI.busy ? ' disabled' : ''}>Rejoindre la partie</button>
      <button class="link" data-go="home">Retour</button>
    </div></div></div>`;
}
const readName = () => { const el = document.getElementById('nm'); const v = el ? el.value.trim().slice(0, 20) : ''; if (v) store.set(K_NAME, v); return v; };

/* ----- Partie ----- */
function gameScreenHtml() {
  if (!G) return '';
  if (!G.S) return lobbyHtml();
  return topHtml() + bottomHtml() + overlayHtml() + sheetHtml();
}
function lobbyHtml() {
  return `${topLobby()}<div class="center-card">
    <h2>Invite ton adversaire</h2>
    <p>Envoie-lui le lien. La partie commence dès qu’elle ou il rejoint, avec ce code :</p>
    <div class="big-code">${esc(G.room)}</div>
    <p class="waiting-text">En attente de ton adversaire</p>
    <div class="stack">
      <button class="btn sun wide" data-go="share">${icon('share')} Envoyer l’invitation</button>
      <button class="btn ink wide" data-go="copy-code">Copier le code</button>
      <button class="link" data-go="home">Voir toutes vos parties</button>
    </div>
  </div>`;
}
function topLobby() { return `<div class="top"><span style="flex:1"></span><button class="menu-btn" data-go="home" aria-label="Accueil">${icon('home')}</button></div>`; }
function topHtml() {
  const st = G.S;
  const chip = i => {
    const p = st.players[i], sc = H.score(p).total, right = i === 1;
    const status = st.over ? (H.ranking(st)[0].i === i ? 'Gagne' : 'Fin') : st.current === i ? 'Joue' : 'Attend';
    const online = G.mode === 'online' && G.players && G.players[i] ? `<i class="dot${G.players[i].online ? ' on' : ''}"></i>` : '';
    return `<button style="--pc:var(${PCOL[i]})" class="chip${right ? ' right' : ''}${st.current === i && !st.over ? ' playing' : ' idle'}${UI.viewIdx === i ? ' viewing' : ''}" data-go="view" data-i="${i}" aria-label="Voir l'île de ${esc(p.name)}">
      ${avatar(p, i)}${online}<div class="nm"><b>${esc(p.name)}</b><span>${status}</span></div><div class="sc">${sc}</div></button>`;
  };
  const round = Math.max(...st.players.map(p => p.turns)) + (st.over ? 0 : 1);
  const bag = st.bagCount != null ? st.bagCount : st.bag.length;
  return `<div class="top">${chip(0)}<button class="menu-btn" data-go="menu" aria-label="Menu">${icon('menu')}</button>${chip(1)}</div>
    <div class="meta">${presencePill()}<span class="pill">Manche <b>${round}</b></span><span class="pill">Sac <b>${bag}</b></span></div>`;
}
function presencePill() {
  if (G.mode !== 'online' || !G.players) return '';
  const o = G.players[1 - G.seat]; if (!o) return '';
  if (!G.conn || !G.conn.online) return `<span class="pill presence off"><i></i>Hors connexion</span>`;
  return `<span class="pill presence${o.online ? ' on' : ' off'}"><i></i>${esc(o.name)} ${o.online ? 'est là' : 'n’est pas là'}</span>`;
}
function nestsHtml(open) {
  return `<div class="nests${open ? ' open' : ''}">${G.S.slots.map((sl, i) => {
    if (!sl.length) return `<div class="nest empty"></div>`;
    const svg = `<svg viewBox="0 0 64 78" aria-hidden="true">${isoStack([sl[0]], 21, 34, 13)}${isoStack([sl[1]], 43, 34, 13)}${isoStack([sl[2]], 32, 60, 13)}</svg>`;
    return `<button class="nest" data-go="slot" data-i="${i}"${open ? '' : ' disabled'} aria-label="Prendre ${sl.map(c => TOKEN_FR[c]).join(', ')}">${svg}</button>`;
  }).join('')}</div>`;
}
function readyCount(p) { return p.cards.filter(c => H.cardTargets(p.board, c.id).length).length; }
function bottomHtml() {
  const st = G.S, me = meP(), mine = canAct(), viewingMine = UI.viewIdx === mySeat() || (G.mode === 'local');
  let hint = '', tray = '';
  if (st.over) {
    hint = `<div class="hint">Partie terminée</div>`;
    tray = '';
  } else if (G.mode === 'local' && UI.viewIdx !== st.current) {
    hint = `<div class="hint wait">Tu regardes l’île de <b>${esc(st.players[UI.viewIdx].name)}</b></div>`;
    tray = `<div class="tray"><button class="btn wide ink" data-go="view" data-i="${st.current}">${icon('eye')} Revenir à l’île de ${esc(st.players[st.current].name)}</button></div>`;
  } else if (!myTurn()) {
    const o = st.players[st.current], watching = UI.viewIdx === st.current;
    const live = G.mode === 'online' && G.players && G.players[st.current] && G.players[st.current].online;
    hint = G.pending ? `<div class="hint wait">Envoi du tour…</div>`
      : live ? `<div class="hint wait"><b>${esc(o.name)}</b> joue en ce moment${watching ? ', en direct' : ''}</div>`
      : `<div class="hint wait">C’est au tour de <b>${esc(o.name)}</b>. Tu seras prévenu${G.pushOn ? '' : ' si tu actives les notifications (menu)'}.</div>`;
    const swap = watching ? `<button class="btn small wide ink" data-go="view" data-i="${mySeat()}">${icon('eye')} Revenir à mon île</button>`
      : `<button class="btn small wide sea" data-go="view" data-i="${st.current}">${icon('eye')} Regarder l’île de ${esc(o.name)}</button>`;
    tray = `<div class="tray dim">${st.hand.length ? `<div class="tray-title">Main de ${esc(o.name)}</div>${handHtml(false)}` : nestsHtml(false)}<div style="margin-top:10px">${swap}</div></div>`;
  } else if (UI.viewIdx !== st.current) {
    hint = `<div class="hint wait">Tu regardes l’île de <b>${esc(st.players[UI.viewIdx].name)}</b></div>`;
    tray = `<div class="tray"><button class="btn wide ink" data-go="view" data-i="${st.current}">${icon('eye')} Revenir à ton île</button></div>`;
  } else if (needSpirit(me)) {
    hint = `<div class="hint">Choisis d’abord ton <b>esprit du paysage</b></div>`;
    tray = `<div class="tray"><button class="btn wide sun" data-go="spirit-sheet">Choisir mon esprit</button></div>`;
  } else if (UI.cubeCard != null) {
    const c = H.CARDS[me.cards[UI.cubeCard].id];
    hint = `<div class="hint">Touche une case brillante pour accueillir <b>${esc(c.name)}</b></div>`;
    tray = `<div class="tray"><button class="btn wide ink" data-go="cancel-cube">Annuler</button></div>`;
  } else if (!st.tookSlot) {
    hint = `<div class="hint">Prends <b>3 jetons</b> sur le plateau</div>`;
    tray = `<div class="tray">${nestsHtml(true)}</div>`;
  } else if (st.hand.length) {
    const stuck = H.handStuck(st);
    hint = stuck ? `<div class="hint">Plus de place pour ces jetons. Tu peux finir ton tour.</div>`
      : `<div class="hint">Pose ${st.hand.length > 1 ? 'tes jetons' : 'ton jeton'} sur une case brillante</div>`;
    tray = `<div class="tray">${handHtml(true)}</div>`;
  } else {
    const r = readyCount(me);
    hint = r ? `<div class="hint">Un animal peut s’installer. Ouvre <b>Animaux</b>.</div>` : `<div class="hint">Tu peux adopter un animal, ou finir ton tour</div>`;
    tray = '';
  }
  const ready = mine ? readyCount(me) : 0;
  const canEnd = mine && H.canEndTurn(st);
  const actions = `<div class="actions">
    <button class="btn ink act" data-go="cards-sheet" aria-label="Animaux">${icon('paw')}<span>Animaux</span>${ready ? `<i class="badge pulse">${ready}</i>` : ''}</button>
    <button class="btn ink act" data-go="score-sheet" aria-label="Score">${icon('chart')}<span>Score</span></button>
    ${st.over ? `<button class="btn sun end-turn" data-go="end-overlay">Résultats</button>` : `
    <button class="btn ink act" data-go="undo" aria-label="Annuler"${mine && G.actions.length ? '' : ' disabled'}>${icon('undo')}<span>Annuler</span></button>
    <button class="btn end-turn${canEnd ? ' sun ready' : ''}" data-go="end-turn"${canEnd ? '' : ' disabled'}>${endLabel(st, mine, canEnd)}</button>`}
  </div>`;
  return `<div class="bottom">${hint}${tray}${actions}</div>`;
}
function endLabel(st, mine, canEnd) {
  if (canEnd || !mine) return 'Terminer';
  if (!st.tookSlot) return 'Prends 3 jetons';
  const n = st.hand.length; return n ? `Encore ${n} jeton${n > 1 ? 's' : ''}` : 'Terminer';
}
function handHtml(active) {
  const st = G.S, b = st.players[st.current].board;
  return `<div class="hand">${st.hand.map((c, i) => {
    const can = Object.values(b).some(x => H.canPlace(x, c));
    return `<div><button class="tok${active && i === UI.sel ? ' sel' : ''}${can ? '' : ' stuck'}" data-go="sel" data-i="${i}"${active ? '' : ' disabled'} aria-label="${TOKEN_FR[c]}">${tokenIcon([c], 64)}</button><div class="tok-label">${TOKEN_FR[c]}</div></div>`;
  }).join('')}</div>`;
}

/* ----- Superpositions ----- */
function overlayHtml() {
  const st = G.S;
  if (UI.overlay === 'pass') {
    const p = st.players[st.current];
    return `<div class="scrim"></div><div class="center-card"><h2>Au tour de ${esc(p.name)}</h2><p>Passe le téléphone à ${esc(p.name)}.</p><button class="btn sun wide" data-go="pass-ok">C’est parti</button></div>`;
  }
  if (UI.overlay === 'end') {
    const rows = H.ranking(st);
    return `<div class="scrim"></div><div class="center-card"><h2>${esc(rows[0].p.name)} gagne</h2>
      <div class="ranking">${rows.map((r, n) => `<div class="rank${n === 0 ? ' win' : ''}">${avatar(r.p, r.i)}<div class="nm"><b>${esc(r.p.name)}</b><span>${r.sc.landscape} paysage, ${r.sc.animals} animaux${r.sc.spirit ? `, ${r.sc.spirit} esprit` : ''}</span></div><div class="pts-big">${r.sc.total}</div></div>`).join('')}</div>
      <div class="stack"><button class="btn sun wide" data-go="rematch">Revanche</button>
      <div class="row"><button class="btn ink" data-go="close-overlay">Voir les îles</button><button class="btn ink" data-go="home">Accueil</button></div></div></div>`;
  }
  return '';
}
function sheet(title, body, { closable = true } = {}) {
  return `<div class="scrim"${closable ? ' data-go="close-sheet"' : ''}></div><div class="sheet" role="dialog" aria-label="${esc(title)}"><div class="grab"></div><div class="head"><h2>${esc(title)}</h2>${closable ? `<button class="x" data-go="close-sheet" aria-label="Fermer">${icon('x')}</button>` : ''}</div><div class="body">${body}</div></div>`;
}
function cardHtml(c, { mode, idx, ready }) {
  const card = H.CARDS[c.id], placed = c.placed || 0;
  const pts = card.pts.map((v, i) => `<i class="${i < placed ? 'got' : i === placed && mode === 'mine' ? 'next' : ''}">${v}</i>`).join('');
  let btn = '';
  if (mode === 'market') btn = `<button class="btn small wide" data-go="take-card" data-i="${idx}"${canAct() && !G.S.tookCard && meP().cards.length < 4 ? '' : ' disabled'}>Adopter</button>`;
  if (mode === 'mine') btn = `<button class="btn small wide sun" data-go="cube" data-i="${idx}"${ready && canAct() ? '' : ' disabled'}>Accueillir</button>`;
  return `<div class="card${ready && mode === 'mine' ? ' ready' : ''}${mode === 'done' ? ' done' : ''}" style="--hab:${HAB[card.color]}"><div class="art">${patternSvg(card.cells)}</div>
    <div class="info"><div class="name">${esc(card.name)}</div><div class="pts">${pts}</div>${btn}</div></div>`;
}
function sheetHtml() {
  if (!UI.sheet) return '';
  if (UI.sheet === 'local') {
    const n = store.get(K_NAME, '') || 'Alice';
    return sheet('Sur ce téléphone', `<div class="stack" style="display:grid;gap:12px">
      <div class="field"><label for="n0">Joueur 1</label><input id="n0" maxlength="20" value="${esc(n)}"></div>
      <div class="field"><label for="n1">Joueur 2</label><input id="n1" maxlength="20" value="${esc(n === 'Bob' ? 'Alice' : 'Bob')}"></div>
      <button class="btn wide" data-go="start-local">Commencer</button>
      <p class="note">Vous jouez chacun votre tour en vous passant le téléphone.</p></div>`);
  }
  if (!G || !G.S) return '';
  const st = G.S;
  if (UI.sheet === 'cards') {
    const who = st.players[UI.viewIdx], isMine = UI.viewIdx === mySeat() || (G.mode === 'local' && UI.viewIdx === st.current);
    const mineCards = who.cards.map((c, i) => cardHtml(c, { mode: isMine ? 'mine' : 'view', idx: i, ready: isMine && H.cardTargets(who.board, c.id).length > 0 })).join('');
    const free = Math.max(0, 4 - who.cards.length);
    const empties = Array.from({ length: free }, () => `<div class="empty-slot">Place libre</div>`).join('');
    const market = st.market.map((id, i) => cardHtml({ id, placed: 0 }, { mode: isMine ? 'market' : 'view', idx: i })).join('');
    const done = who.done.length ? `<h3>Cartes complètes <small>${who.done.length}</small></h3><div class="cards">${who.done.map(c => cardHtml(c, { mode: 'done' })).join('')}</div>` : '';
    const note = (st.tookCard && isMine ? 'Tu as déjà adopté une carte ce tour-ci. ' : 'Adopte une carte par tour (4 en cours au maximum). ') + 'Quand son motif est sur ton île, accueille l’animal sur la case orange du motif. Les chiffres sont les points du 1er, 2e, 3e animal accueilli ; le cerclé est le prochain gain.';
    return sheet('Animaux', `<h3>${isMine ? 'Tes animaux' : 'Animaux de ' + esc(who.name)} <small>${who.cards.length} sur 4</small></h3><div class="cards">${mineCards}${empties}</div>
      <h3>À adopter <small>${st.deckCount != null ? st.deckCount : st.deck.length} dans la pioche</small></h3><div class="cards">${market}</div><p class="deck-note">${note}</p>${done}`);
  }
  if (UI.sheet === 'score') {
    const rows = [['trees', 'Arbres', ['brown', 'green']], ['mountains', 'Montagnes', ['gray', 'gray']], ['fields', 'Champs', ['yellow']], ['buildings', 'Bâtiments', ['brown', 'red']], ['water', 'Rivière', ['blue']]];
    const sc = st.players.map(p => H.score(p));
    let body = `<div class="score-cols"><span></span>${st.players.map((p, i) => `<span class="h" style="color:var(${PCOL[i]})">${esc(p.name)}</span>`).join('')}`;
    for (const [key, label, stack] of rows) body += `<span class="lbl">${tokenIcon(stack, 44)}${label}</span>${sc.map(s => `<span class="v">${s[key]}</span>`).join('')}`;
    body += `<span class="lbl"><svg viewBox="0 0 44 44">${cubeSvg(22, 24, 11)}</svg>Animaux</span>${sc.map(s => `<span class="v">${s.animals}</span>`).join('')}`;
    if (st.spirits) body += `<span class="lbl"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="11" fill="#ffd36a"/><circle cx="22" cy="22" r="5" fill="#fff8dc"/></svg>Esprit</span>${st.players.map((p, i) => `<span class="v">${p.spiritHidden ? '?' : sc[i].spirit}</span>`).join('')}`;
    body += `<hr><span class="lbl" style="font-family:var(--display);font-size:20px">Total</span>${sc.map(s => `<span class="v tot">${s.total}</span>`).join('')}</div>`;
    const lr = H.longestRiver(meP().board).length;
    body += `<p class="note">Ta plus longue rivière : ${lr} case${lr > 1 ? 's' : ''}.</p>`;
    const my = meP();
    if (my.spirit != null) { const sp = H.SPIRITS[my.spirit]; body += `<h3>Ton esprit</h3><div class="spirit" style="--hab:${HAB[sp.color]}"><div class="orb"></div><div><b>${esc(sp.name)}</b><span>${esc(sp.text)}</span></div></div>`; }
    return sheet('Score', body);
  }
  if (UI.sheet === 'spirit') {
    const p = meP();
    if (!needSpirit(p)) return '';
    const opts = p.spiritChoice.map((id, n) => { const sp = H.SPIRITS[id]; return `<button class="spirit" data-go="spirit" data-i="${n}" style="--hab:${HAB[sp.color]}"><div class="orb"></div><div><b>${esc(sp.name)}</b><span>${esc(sp.text)}</span></div></button>`; }).join('');
    return sheet('Ton esprit du paysage', `<p class="note" style="margin:0 0 14px">Un objectif secret qui rapporte des points en fin de partie. ${G.mode === 'local' ? 'Cache l’écran à l’autre.' : 'L’autre ne le verra qu’à la fin.'}</p><div class="spirits">${opts}</div>`, { closable: false });
  }
  if (UI.sheet === 'menu') {
    const pushRow = G.mode === 'online' ? `<button class="toggle-row" data-go="push"><span>Me prévenir quand c’est mon tour</span><span class="switch${G.pushOn ? ' on' : ''}"></span></button>
      ${Net.isIOS() && !Net.isStandalone() ? `<p class="note">Sur iPhone : touche Partager, puis « Sur l’écran d’accueil ». Ouvre ensuite Verdance depuis l’icône pour recevoir les notifications.</p>` : ''}` : '';
    return sheet('Menu', `<div class="menu-list">
      <button class="toggle-row" data-go="sound"><span>Son</span><span class="switch${Sound.on ? ' on' : ''}"></span></button>
      ${pushRow}
      ${G.mode === 'online' ? `<button class="btn ink wide" data-go="share">${icon('share')} Partager le lien de la partie</button>` : ''}
      <button class="btn ink wide" data-go="rules-sheet">Règles</button>
      <button class="btn ink wide" data-go="home">${icon('home')} Accueil</button>
      ${G.mode === 'online' ? `<p class="note">Partie ${esc(G.room)}. Tu peux la reprendre depuis l’accueil, sur ce téléphone.</p>` : ''}
    </div>`);
  }
  if (UI.sheet === 'rules') return sheet('Règles', rulesHtml());
  return '';
}
function rulesHtml() {
  const lg = (s, t) => `<div>${tokenIcon(s, 52)}${t}</div>`;
  return `<div class="rules">
    <p>À ton tour, <b>prends 3 jetons</b> sur le plateau et pose-les sur ton île. Tu peux aussi <b>adopter un animal</b> (4 en cours au maximum) et <b>accueillir</b> ceux dont tu as reproduit le motif, dans n’importe quel sens.</p>
    <div class="legend">${lg(['gray', 'gray'], 'Montagne : 1 à 3 pierres')}${lg(['brown', 'green'], 'Arbre : feuillage sur troncs')}${lg(['brown', 'red'], 'Maison : rouge sur une base')}${lg(['blue'], 'Eau')}${lg(['yellow'], 'Champ')}${lg(['brown'], 'Tronc')}</div>
    <p><b>Points de paysage.</b> Arbres 1, 3 ou 7 selon la hauteur. Montagnes 1, 3 ou 7 si elles touchent une autre montagne. Chaque champ d’au moins 2 cases : 5. Maison entourée d’au moins 3 couleurs : 5. Ta plus longue rivière : de 2 à 15 points et plus.</p>
    <p><b>Animaux.</b> Chaque animal accueilli rapporte la valeur suivante de sa carte. Une case qui accueille un animal ne peut plus recevoir de jeton.</p>
    <p><b>Esprit du paysage.</b> Un objectif secret choisi en début de partie, compté à la fin.</p>
    <p><b>Fin.</b> Quand le sac se vide ou qu’une île n’a plus que 2 cases libres, on termine la manche. Le plus haut score gagne.</p>
  </div>`;
}

/* ================= Navigation ================= */
function goHome() {
  if (G && G.conn) G.conn.close();
  G = null; UI.screen = 'home'; UI.sheet = null; UI.overlay = null; UI.cubeCard = null; UI.serverFor = null;
  if (location.hash) history.replaceState(null, '', location.pathname);
  render();
  if (window.Scene && Scene.ready) { Scene.reset && Scene.reset(); syncScene(false); Scene.overview && Scene.overview(); }
}
function startLocal(names) {
  const base = H.newState(names, { spirits: true });
  store.set(K_LOCAL, { base, actions: [] });
  openLocal({ base, actions: [] });
}
function openLocal(saved) {
  G = { mode: 'local', base: saved.base, actions: saved.actions || [], S: null };
  recompute();
  UI.screen = 'game'; UI.sheet = null; UI.overlay = G.S.over ? 'end' : 'pass'; UI.viewIdx = G.S.current;
  if (Scene.reset) Scene.reset();
  render(); focusIsland(G.S.current, true);
}
const inviteUrl = () => `${location.origin}/#/r/${G.room}`;
function rememberGame(patch) {
  const list = store.get(K_GAMES, []); const i = list.findIndex(g => g.room === patch.room);
  if (i >= 0) list[i] = Object.assign(list[i], patch); else list.push(patch);
  store.set(K_GAMES, list.slice(-20));
}
function forgetGame(room) { store.set(K_GAMES, store.get(K_GAMES, []).filter(g => g.room !== room)); }
async function createOnline() {
  const name = readName(); if (!name) { toast('Écris ton prénom', 'err'); document.getElementById('nm')?.focus(); return; }
  if (UI.busy) return; UI.busy = true;
  try {
    const r = await Net.create(name);
    rememberGame({ room: r.room, seat: r.seat, token: r.token, names: [name, null], ts: Date.now() });
    openOnline(r.room);
  } catch (e) { toast('Impossible de créer la partie : ' + esc(e.message), 'err'); }
  finally { UI.busy = false; }
}
async function joinOnline() {
  const name = readName(); const code = (document.getElementById('code')?.value || '').trim().toUpperCase();
  if (!name) { toast('Écris ton prénom', 'err'); return; }
  if (code.length !== 5) { toast('Le code fait 5 caractères', 'err'); return; }
  const known = store.get(K_GAMES, []).find(g => g.room === code);
  if (known) { openOnline(code); return; }
  UI.busy = true; render();
  try {
    const r = await Net.join(code, name);
    rememberGame({ room: r.room || code, seat: r.seat, token: r.token, names: [null, name], ts: Date.now() });
    openOnline(r.room || code);
  } catch (e) {
    UI.busy = false; UI.joinCode = code;
    toast(e.status === 404 ? 'Aucune partie avec ce code' : e.status === 409 ? 'Cette partie a déjà deux joueurs' : 'Impossible de rejoindre : ' + esc(e.message), 'err');
    render();
  }
  UI.busy = false;
}
function openOnline(room) {
  const g = store.get(K_GAMES, []).find(x => x.room === room); if (!g) return goHome();
  if (G && G.conn) G.conn.close();
  G = { mode: 'online', room, seat: g.seat, token: g.token, base: null, actions: [], S: null, version: -1, players: null, preview: null, pending: false, pushOn: !!g.push };
  UI.screen = 'game'; UI.sheet = null; UI.overlay = null; UI.viewIdx = g.seat; UI.cubeCard = null;
  history.replaceState(null, '', '#/r/' + room);
  if (Scene.reset) Scene.reset();
  render();
  const me = G;
  G.conn = Net.connect(room, g.token, {
    state: m => { if (G === me) onState(m); },
    preview: m => {
      if (G !== me || !G.base || m.seat === G.seat) return;
      const first = !G.preview; G.preview = m.actions || []; recompute();
      if (first && UI.viewIdx === G.seat && !UI.sheet && G.preview.length) { UI.viewIdx = G.base.current; render(); focusIsland(G.base.current); return; }
      render();
    },
    presence: m => { if (G !== me || !G.players) return; G.players.forEach((p, i) => { if (p) p.online = !!m.online[i]; }); render(); },
    error: m => {
      if (G !== me) return;
      if (m.fatal) { forgetGame(room); UI.notice = { html: esc(m.msg), cls: 'err' }; goHome(); return; }
      G.pending = false; toast(esc(m.msg || 'Action refusée'), 'err'); render();
    },
    status: on => { if (G === me && !on && G.S) render(); },
  });
}
function onState(m) {
  const wasTurn = G.base ? G.base.current : -1, wasVersion = G.version, wasNull = !G.base;
  G.players = m.players || G.players; G.version = m.version;
  if (m.seat != null) G.seat = m.seat;
  if (!m.state) { G.base = null; recompute(); render(); return; }
  const turnChanged = !G.base || m.state.current !== G.base.current || m.state.over !== G.base.over || m.version !== wasVersion && G.pending;
  // Tour refusé : le serveur renvoie l'état inchangé puis une erreur ; on garde les gestes pour pouvoir corriger.
  const rejected = G.pending && m.version === wasVersion && m.state.current === G.seat;
  G.base = m.state; G.preview = null;
  if (!rejected && (G.pending || m.state.current !== G.seat)) G.actions = [];
  G.pending = false;
  recompute();
  rememberGame({ room: G.room, names: m.state.players.map(p => p.name), mine: !m.state.over && m.state.current === G.seat, over: m.state.over, ts: Date.now() });
  if (wasNull) { UI.viewIdx = G.seat; render(); focusIsland(G.seat, true); if (needSpirit(meP())) { UI.sheet = 'spirit'; render(); } Sound.whoosh(); return; }
  if (m.state.over && UI.overlay !== 'end' && turnChanged) { gameOver(); return; }
  if (turnChanged && m.state.current === G.seat && wasTurn !== G.seat) {
    UI.viewIdx = G.seat; render(); focusIsland(G.seat); Sound.whoosh(); buzz([20, 60, 20]);
    toast('À toi de jouer');
    return;
  }
  render();
}
async function share() {
  const url = inviteUrl(), text = `On fait une partie de Verdance ? Code ${G.room}`;
  try {
    if (navigator.share) { await navigator.share({ title: 'Verdance', text, url }); return; }
    await navigator.clipboard.writeText(url); toast('Lien copié');
  } catch (e) { if (e && e.name !== 'AbortError') toast('Lien : ' + esc(url)); }
}
async function togglePush() {
  if (G.pushOn) { toast('Pour couper les notifications, passe par les réglages du téléphone.'); return; }
  try {
    const sub = await Net.subscribePush();
    G.conn && G.conn.send({ t: 'push', sub });
    G.pushOn = true; rememberGame({ room: G.room, push: true }); toast('Tu seras prévenu à chaque tour'); render();
  } catch (e) { toast(esc(e.message), 'err'); }
}

/* ================= Gestes ================= */
$app.addEventListener('click', ev => {
  const el = ev.target.closest('[data-go]'); if (!el || el.disabled) return;
  const go = el.dataset.go, i = el.dataset.i != null ? +el.dataset.i : null;
  Sound.ac();
  switch (go) {
    case 'home': goHome(); break;
    case 'create': createOnline(); break;
    case 'join-screen': readName(); UI.screen = 'join'; render(); break;
    case 'join': joinOnline(); break;
    case 'open': openOnline(el.dataset.room); break;
    case 'pick': pickGame(el.dataset.room); break;
    case 'local-sheet': readName(); UI.sheet = 'local'; render(); break;
    case 'start-local': { const a = document.getElementById('n0').value.trim() || 'Joueur 1', b = document.getElementById('n1').value.trim() || 'Joueur 2'; UI.sheet = null; startLocal([a.slice(0, 20), b.slice(0, 20)]); break; }
    case 'resume-local': openLocal(store.get(K_LOCAL)); break;
    case 'share': share(); break;
    case 'copy-code': navigator.clipboard && navigator.clipboard.writeText(G.room).then(() => toast('Code copié'), () => toast('Code : <b>' + esc(G.room) + '</b>')); break;
    case 'view': UI.viewIdx = i; UI.cubeCard = null; render(); focusIsland(i); break;
    case 'menu': UI.sheet = 'menu'; render(); break;
    case 'cards-sheet': UI.sheet = 'cards'; render(); break;
    case 'score-sheet': UI.sheet = 'score'; render(); break;
    case 'rules-sheet': UI.sheet = 'rules'; render(); break;
    case 'spirit-sheet': UI.sheet = 'spirit'; render(); break;
    case 'close-sheet': UI.sheet = null; render(); break;
    case 'slot': takeSlot(i); break;
    case 'sel': UI.sel = i; Sound.pick(); render(); break;
    case 'take-card': takeCard(i); break;
    case 'cube': startCube(i); break;
    case 'cancel-cube': UI.cubeCard = null; render(); break;
    case 'undo': undo(); break;
    case 'end-turn': endTurn(); break;
    case 'spirit': chooseSpirit(i); break;
    case 'pass-ok': UI.overlay = null; UI.viewIdx = G.S.current; render(); focusIsland(G.S.current); if (needSpirit(meP())) { UI.sheet = 'spirit'; render(); } break;
    case 'close-overlay': UI.overlay = null; render(); break;
    case 'end-overlay': UI.overlay = 'end'; render(); break;
    case 'rematch':
      if (G.mode === 'local') startLocal(G.S.players.map(p => p.name));
      else { G.conn && G.conn.send({ t: 'rematch' }); UI.overlay = null; G.base = null; recompute(); render(); }
      break;
    case 'sound': Sound.on = !Sound.on; store.set(K_SOUND, Sound.on); render(); break;
    case 'push': togglePush(); break;
  }
});
$app.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.id === 'code') joinOnline(); });
let nameTimer;
$app.addEventListener('input', ev => {
  if (ev.target.id === 'nm' && UI.screen === 'home') { clearTimeout(nameTimer); nameTimer = setTimeout(() => { const v = ev.target.value.trim(); if (v) { store.set(K_NAME, v); loadServerGames(v); } }, 500); } if (ev.target.id === 'code') { const p = ev.target.selectionStart; ev.target.value = ev.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); ev.target.setSelectionRange(p, p); } });

function onCellClick(pi, k) {
  if (!G || !G.S) return;
  const st = G.S;
  if (!canAct() || pi !== st.current) {
    const cell = st.players[pi] && st.players[pi].board[k];
    if (cell && cell.cube) toast(`Ici vit <b>${esc(H.CARDS[cell.cube.card].name)}</b>`);
    return;
  }
  if (UI.cubeCard != null) {
    if (!placeCube(k)) { Sound.nope(); toast('Le motif de cet animal ne passe pas par cette case', 'err'); }
    return;
  }
  if (!st.hand.length) {
    if (!st.tookSlot) toast('Prends d’abord 3 jetons sur le plateau');
    return;
  }
  if (!placeToken(k)) { Sound.nope(); buzz(30); const c = st.players[pi].board[k]; toast(c && c.cube ? 'Un animal vit déjà ici' : WHERE[st.hand[UI.sel]], 'err'); }
}

/* ================= Démarrage ================= */
function route() {
  const m = location.hash.match(/^#\/r\/([A-Za-z0-9]{5})/);
  if (m) {
    const code = m[1].toUpperCase();
    if (store.get(K_GAMES, []).some(g => g.room === code)) { openOnline(code); return; }
    UI.joinCode = code; UI.screen = 'join'; render(); return;
  }
  UI.screen = 'home'; render();
}
window.addEventListener('hashchange', () => { if (!G || ('#/r/' + G.room) !== location.hash) route(); });
window.addEventListener('resize', () => { lastInsets = ''; measureInsets(); });

Scene.init(document.getElementById('world'), {
  onReady() { syncScene(false); if (G && G.S) focusIsland(UI.viewIdx, true); else Scene.overview && Scene.overview(); measureInsets(); },
  onError(e) { console.error(e); toast('Le monde 3D n’a pas pu se charger. Vérifie ta connexion.', 'err'); },
  onCellClick,
});
route();

if ('serviceWorker' in navigator && location.protocol === 'https:' || location.hostname === 'localhost') {
  navigator.serviceWorker && navigator.serviceWorker.register('sw.js').catch(() => {});
}
// Pour les tests
window.VerdanceApp = { get G() { return G; }, UI, render, startLocal, act };
})();
