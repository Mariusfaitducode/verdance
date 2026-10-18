/* Verdance — interface (HUD, cartes, main, sons) au-dessus de la scène 3D. */
(function () {
'use strict';
const SAVE_KEY = 'verdance-v2-save';
const SQ3 = Math.sqrt(3);
const hud = document.getElementById('hud');
let S = null, history = [];
const UI = { sel: 0, cubeCard: null, viewIdx: 0, overlay: null, toast: null, hoverK: null, hoverCard: null, handIds: [], names: ['Marius', 'Yasmine'], rules: false };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };

/* ================= Sons (synthétisés, aucun fichier) ================= */
const Sound = {
  ctx: null, on: store.get('verdance-sound', true),
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
  whoosh() {
    const ctx = this.ac(); if (!ctx) return; const t = ctx.currentTime;
    const n = this.noise(ctx, 1.1), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'lowpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(1800, t + .45); f.frequency.exponentialRampToValueAtTime(260, t + 1.05);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.16, t + .35); g.gain.linearRampToValueAtTime(0, t + 1.05);
    n.connect(f).connect(g).connect(ctx.destination); n.start(t);
  },
};

/* ================= Dessins iso (cartes, main, icônes) ================= */
const TOP = { blue: '#3a8ec4', gray: '#a2a8b0', brown: '#93603b', green: '#62aa47', yellow: '#f1c044', red: '#d5533b' };
const SIDE = { blue: '#276d9d', gray: '#787e86', brown: '#683f24', green: '#447f2e', yellow: '#c9961f', red: '#a3341f' };
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
  const h = stack.length, top = stack[h - 1], w = 'rgba(255,255,255,.7)';
  if (!h) return s;
  if (top === 'green') {
    const big = r * [.5, .72, .9][h - 1], lift = r * [.15, .55, .95][h - 1];
    if (h > 1) s += `<rect x="${cx - r * .07}" y="${yTop - lift}" width="${r * .14}" height="${lift}" fill="#6e4426"/>`;
    const cyc = yTop - lift - big * .55;
    s += `<circle cx="${cx - big * .45}" cy="${cyc + big * .2}" r="${big * .55}" fill="#4c8c34"/><circle cx="${cx + big * .45}" cy="${cyc + big * .22}" r="${big * .5}" fill="#4c8c34"/>`;
    s += `<circle cx="${cx}" cy="${cyc - big * .1}" r="${big * .7}" fill="#67b04a"/><circle cx="${cx - big * .25}" cy="${cyc - big * .32}" r="${big * .28}" fill="#8fcb63"/>`;
  } else if (allGray) {
    const pr = r * (1 - (h - 1) * .11) * .8, ph = r * (.55 + .32 * h);
    s += `<path d="M${cx - pr},${yTop} L${cx - pr * .1},${yTop - ph} L${cx + pr},${yTop} Z" fill="#b4b9c0"/><path d="M${cx - pr * .1},${yTop - ph} L${cx + pr},${yTop} L${cx + pr * .2},${yTop} Z" fill="#8d939b"/>`;
    if (h === 3) s += `<path d="M${cx - pr * .42},${yTop - ph * .58} L${cx - pr * .1},${yTop - ph} L${cx + pr * .3},${yTop - ph * .6} L${cx + pr * .05},${yTop - ph * .52} Z" fill="#fff"/>`;
  } else if (top === 'red' && h === 2) {
    const ww = r * .9, wh = r * .55;
    s += `<rect x="${cx - ww / 2}" y="${yTop - wh}" width="${ww}" height="${wh}" fill="#f1dcc0"/><rect x="${cx - ww * .1}" y="${yTop - wh * .6}" width="${ww * .22}" height="${wh * .6}" fill="#5a3a22"/><rect x="${cx + ww * .2}" y="${yTop - wh * .8}" width="${ww * .16}" height="${ww * .16}" fill="#ffd36e"/>`;
    s += `<path d="M${cx - ww * .62},${yTop - wh} L${cx},${yTop - wh - r * .55} L${cx + ww * .62},${yTop - wh} Z" fill="#b5402c"/>`;
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
function cubeSvg(cx, cy, s) { return `<g transform="translate(${cx},${cy})"><path d="M0,${-s} L${s * .9},${-s * .5} L0,0 L${-s * .9},${-s * .5}Z" fill="#f8b467"/><path d="M${-s * .9},${-s * .5} L0,0 L0,${s} L${-s * .9},${s * .5}Z" fill="#e0812a"/><path d="M${s * .9},${-s * .5} L0,0 L0,${s} L${s * .9},${s * .5}Z" fill="#bb6518"/></g>`; }
function tokenIcon(stack, size = 64) {
  const r = size * .3, cy = size * .72 + (stack.length - 1) * r * .2;
  return `<svg viewBox="0 0 ${size} ${size}" aria-hidden="true">${isoStack(stack, size / 2, cy, r)}</svg>`;
}
function hexIso(cx, cy, R, k = .58) { let p = []; for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; p.push((cx + R * Math.cos(a)).toFixed(1) + ',' + (cy + R * Math.sin(a) * k).toFixed(1)); } return p.join(' '); }
function patternSvg(card) {
  const R = 17, K = .58;
  const pts = card.cells.map(([req, q, r], i) => ({ req, i, x: 1.5 * R * q, y: SQ3 * R * (r + q / 2) * K }));
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minx = Math.min(...xs) - R * 1.1, maxx = Math.max(...xs) + R * 1.1, miny = Math.min(...ys) - R * 2.1, maxy = Math.max(...ys) + R * .75;
  let s = '';
  for (const p of [...pts].sort((a, b) => a.y - b.y)) s += `<polygon points="${hexIso(p.x, p.y, R * .96, K)}" fill="${p.i === 0 ? '#ffe9c7' : 'rgba(255,250,238,.9)'}" stroke="${p.i === 0 ? '#e2862b' : 'rgba(120,98,60,.28)'}" stroke-width="${p.i === 0 ? 2 : 1}"/>`;
  for (const p of [...pts].sort((a, b) => a.y - b.y)) {
    const st = H.REQ[p.req].stack; s += isoStack(st, p.x, p.y + R * .18, R * .55);
    if (p.i === 0) s += cubeSvg(p.x + R * .55, stackTopY(st, p.y, R * .55) - R * .25, R * .26);
  }
  return `<svg viewBox="${minx} ${miny} ${maxx - minx} ${maxy - miny}" width="${(maxx - minx) * 1.25}" aria-hidden="true">${s}</svg>`;
}
const CAT_ICON = {
  trees: tokenIcon(['brown', 'green'], 44), mountains: tokenIcon(['gray', 'gray'], 44), fields: tokenIcon(['yellow'], 44),
  buildings: tokenIcon(['brown', 'red'], 44), water: tokenIcon(['blue'], 44),
  animals: `<svg viewBox="0 0 44 44">${cubeSvg(22, 24, 11)}</svg>`,
};
const I = {
  top: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
  tokens: '<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v4c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 11v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4"/>',
  center: '<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  all: '<rect x="2.5" y="8" width="8" height="9" rx="2.5"/><rect x="13.5" y="6" width="8" height="9" rx="2.5"/>',
  sound: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 9a4 4 0 010 6M19 6.5a8 8 0 010 11"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5v-15z"/><path d="M4 20.5A2.5 2.5 0 016.5 18H20v3H6.5"/>',
  quit: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
};
const icon = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${I[n]}</svg>`;

/* ================= État et sauvegarde ================= */
const me = () => S.players[S.current];
const viewing = () => S.players[UI.viewIdx];
const isMyView = () => S && UI.viewIdx === S.current && !S.over;
function save() { if (S && !S.over) store.set(SAVE_KEY, { S, history }); }
function snapshot() { history.push(H.clone(S)); if (history.length > 40) history.shift(); }
function undo() { if (!history.length || !isMyView()) return; S = history.pop(); UI.cubeCard = null; UI.sel = 0; UI.handIds = UI.handIds.slice(0, S.hand.length); save(); render({ animate: false }); }

function demoState() {
  const st = H.newState(['Démo']); const b = st.players[0].board;
  const set = (k, s, cube) => { b[k].stack = s; if (cube !== undefined) b[k].cube = { card: cube, color: 'x' }; };
  set('0,0', ['blue']); set('0,1', ['blue']); set('1,1', ['blue']); set('2,1', ['blue']); set('2,2', ['blue'], 12); set('3,2', ['blue']);
  set('4,-2', ['gray', 'gray', 'gray'], 15); set('3,-1', ['gray', 'gray'], 14); set('4,-1', ['gray']);
  set('1,0', ['brown', 'brown', 'green'], 22); set('2,-1', ['brown', 'green']); set('0,2', ['green']); set('1,2', ['brown', 'green']);
  set('0,3', ['yellow'], 1); set('0,4', ['yellow']); set('1,3', ['yellow']);
  set('2,0', ['brown', 'red']); set('3,0', ['gray', 'red'], 28); set('4,0', ['brown', 'brown', 'green']);
  set('3,1', ['yellow']); set('4,1', ['yellow']); set('2,3', ['green']); set('4,2', ['gray', 'gray']);
  return st;
}

/* ================= Actions ================= */
function startGame(names) {
  S = H.newState(names); history = []; UI.sel = 0; UI.cubeCard = null; UI.viewIdx = 0; UI.handIds = [];
  store.del(SAVE_KEY);
  if (window.Scene && Scene.ready) { Scene.reset(); Scene.autoRotate(false); }
  showTurn(); save();
}
function showTurn() {
  UI.viewIdx = S.current; UI.overlay = 'turn'; UI.cubeCard = null; UI.sel = 0;
  render({ animate: false });
  if (Scene.ready) Scene.focus(S.current, { keepAngle: false });
  Sound.whoosh();
}
function takeSlot(i) {
  if (!isMyView()) return; snapshot();
  if (!H.takeSlot(S, i)) { history.pop(); return; }
  UI.handIds = [0, 1, 2].map(j => `nest-${i}-${j}`); UI.sel = 0; UI.cubeCard = null;
  Sound.pick(); save(); render();
}
function placeToken(k) {
  if (!isMyView() || !S.hand.length) return;
  const before = H.score(me());
  snapshot();
  if (!H.placeToken(S, UI.sel, k)) { history.pop(); return; }
  UI.handIds.splice(UI.sel, 1); UI.sel = 0;
  const after = H.score(me()); const d = after.landscape - before.landscape;
  save(); render();
  if (d) setTimeout(() => popAt(S.current, k, (d > 0 ? '+' : '−') + Math.abs(d), d > 0 ? '' : 'neg'), 420);
  const ready = me().cards.filter(c => H.cardTargets(me().board, c.id).length).map(c => H.CARDS[c.id].name);
  if (ready.length) toast(`Motif prêt : <b>${ready.map(esc).join(', ')}</b>, tu peux l'accueillir`);
}
function takeCard(i) {
  if (!isMyView()) return; snapshot();
  if (!H.takeCard(S, i)) { history.pop(); return; }
  Sound.pick(); save(); render();
}
function placeCube(k) {
  const before = H.score(me()).animals;
  snapshot(); const res = H.placeCube(S, UI.cubeCard, k);
  if (!res) { history.pop(); return; }
  UI.cubeCard = null; save(); render();
  Sound.chime();
  const d = H.score(me()).animals - before;
  setTimeout(() => popAt(S.current, k, '+' + d, 'gold'), 520);
  toast(res.completed ? `<b>${esc(res.card.name)}</b> : carte complète, ${res.points} points` : `<b>${esc(res.card.name)}</b> s'installe dans ton paysage`);
}
function endTurn() {
  if (!isMyView() || !H.canEndTurn(S)) return;
  const res = H.endTurn(S); history = []; UI.handIds = [];
  if (res.over) { store.del(SAVE_KEY); UI.overlay = 'end'; render({ animate: false }); if (Scene.ready) { Scene.overview(); Scene.autoRotate(true); } Sound.chime(); startCountUp(); return; }
  save(); showTurn();
}

/* ================= Petits retours visuels ================= */
let toastTimer;
function toast(html) { UI.toast = html; clearTimeout(toastTimer); toastTimer = setTimeout(() => { UI.toast = null; const t = document.querySelector('.toast'); t && t.remove(); }, 3400); const old = document.querySelector('.toast'); old && old.remove(); document.body.insertAdjacentHTML('beforeend', `<div class="toast">${html}</div>`); }
function popAt(pi, k, txt, cls) {
  const p = Scene.ready && Scene.screenPos(pi, k); if (!p) return;
  const el = document.createElement('div'); el.className = 'pop ' + (cls || ''); el.textContent = txt; el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
  document.body.appendChild(el); setTimeout(() => el.remove(), 1500);
}
const tip = document.createElement('div'); tip.className = 'tip'; tip.style.display = 'none'; document.body.appendChild(tip);
function describe(p, k) {
  const b = p.board, cell = b[k], s = cell.stack, h = s.length, top = s[h - 1], pts = H.cellPoints(b, k);
  const P = n => `<em>${n} pt${n > 1 ? 's' : ''}</em>`;
  let t;
  if (!h) t = '<b>Case libre</b>';
  else if (top === 'green') t = `<b>${['Buisson', 'Arbre', 'Grand arbre'][h - 1]}</b> · ${P(pts)}`;
  else if (H.isMountain(b, k)) t = `<b>Montagne de ${h}</b> · ${pts ? P(pts) : 'isolée, 0 pt : elle doit toucher une autre montagne'}`;
  else if (h === 2 && top === 'red') { const n = new Set(H.neighborsK(k).map(x => b[x].stack[b[x].stack.length - 1]).filter(Boolean)).size; t = `<b>Bâtiment</b> · ${pts ? P(5) : `0 pt pour l'instant : ${n} couleur${n > 1 ? 's' : ''} autour sur 3`}`; }
  else if (top === 'red') t = '<b>Fondation rouge</b> · un 2e jeton rouge dessus en fait un bâtiment';
  else if (top === 'brown') t = h === 1 ? '<b>Tronc</b> · ajoute du vert (arbre, 3 pts) ou un rouge (bâtiment)' : '<b>Grand tronc</b> · ajoute du vert pour un grand arbre (7 pts)';
  else if (top === 'blue') { const lr = H.longestRiver(b); t = lr.path.includes(k) ? `<b>Rivière</b> · la plus longue : ${lr.length} jeton${lr.length > 1 ? 's' : ''}, ${P(H.riverPoints(lr.length))}` : `<b>Eau</b> · hors de ta plus longue rivière (${lr.length})`; }
  else if (top === 'yellow') { const comp = H.components(b, 'yellow').find(c => c.includes(k)); t = comp.length >= 2 ? `<b>Champ</b> · groupe de ${comp.length}, ${P(5)}` : '<b>Champ seul</b> · relie un 2e jeton jaune pour 5 pts'; }
  if (cell.cube && H.CARDS[cell.cube.card]) t += `<br>Habitant : <em>${esc(H.CARDS[cell.cube.card].name)}</em>`;
  return t;
}
function onHover(h, x, y) {
  const was = UI.hoverK;
  UI.hoverK = h && S && h.pi === S.current ? h.k : null;
  if (h && S) {
    const p = S.players[h.pi];
    tip.innerHTML = describe(p, h.k); tip.style.display = 'block'; tip.style.left = x + 'px'; tip.style.top = y + 'px';
  } else tip.style.display = 'none';
  if (UI.cubeCard !== null && was !== UI.hoverK) syncScene(true);
}

/* ================= Rendu ================= */
function syncScene(animate = true) {
  if (!window.Scene || !Scene.ready) return;
  if (!S) { Scene.sync(demoState(), { activeIdx: -1, animate: false }); return; }
  const v = { activeIdx: isMyView() && !UI.overlay ? S.current : -1, legal: [], targets: [], patternHi: [], ghostColor: null, animate };
  const p = me();
  if (v.activeIdx >= 0) {
    if (UI.cubeCard !== null && p.cards[UI.cubeCard]) {
      v.targets = H.cardTargets(p.board, p.cards[UI.cubeCard].id);
      if (UI.hoverK && v.targets.includes(UI.hoverK)) v.patternHi = H.patternCellsAt(p.board, p.cards[UI.cubeCard].id, UI.hoverK);
    } else if (S.hand.length) {
      const col = S.hand[UI.sel]; v.ghostColor = col;
      v.legal = H.BOARD_CELLS.map(c => c.k).filter(k => H.canPlace(p.board[k], col));
    }
    if (UI.hoverCard !== null && UI.cubeCard === null && p.cards[UI.hoverCard]) {
      const id = p.cards[UI.hoverCard].id; v.patternHi = [...new Set(H.cardTargets(p.board, id).flatMap(k => H.patternCellsAt(p.board, id, k)))];
    }
  }
  Scene.sync(S, v);
}

function cardHtml(c, { mode, idx }) {
  const card = H.CARDS[c.id], placed = c.placed || 0;
  const track = card.pts.map((v, i) => `<i class="${i >= placed ? 'cube' : ''}${i === placed - 1 ? ' cur' : ''}">${v}</i>`).join('');
  let cls = 'card', btn = '';
  if (mode === 'market') {
    const ok = isMyView() && !S.tookCard && me().cards.length < 4 && !UI.overlay;
    if (ok) cls += ' can';
    const why = !isMyView() ? '' : S.tookCard ? 'Déjà adopté' : me().cards.length >= 4 ? '4 cartes max' : 'Adopter';
    btn = `<button class="cbtn" data-act="take" data-i="${idx}" ${ok ? '' : 'disabled'}>${why || 'Adopter'}</button>`;
  } else if (mode === 'mine') {
    const mine = isMyView();
    const ready = mine && H.cardTargets(me().board, c.id).length > 0;
    if (ready) cls += ' ready';
    if (mine && UI.cubeCard === idx) cls += ' picked';
    btn = ready ? `<button class="cbtn warm" data-act="cubemode" data-i="${idx}">${UI.cubeCard === idx ? 'Annuler' : 'Accueillir'}</button>` : '';
  }
  return `<div class="${cls}" style="--c:var(--${card.color})" data-flip="card-${c.id}" ${mode === 'mine' ? `data-hovercard="${idx}"` : ''}>
    <span class="band"></span><div class="art">${patternSvg(card)}</div>
    <div class="body"><div class="nm">${esc(card.name)}</div><div class="track">${track}</div>${btn}</div></div>`;
}
function nestHtml(sl, i) {
  const can = isMyView() && !S.tookSlot && sl.length && !UI.overlay;
  const pos = [[50, 30], [27, 64], [73, 64]];
  const toks = sl.map((c, j) => `<div class="tk" data-flip="nest-${i}-${j}" style="left:${pos[j][0]}%;top:${pos[j][1]}%">${tokenIcon([c], 60)}</div>`).join('');
  return `<button class="nest ${can ? 'can' : ''} ${sl.length ? '' : 'empty'} ${S.tookSlot && sl.length ? 'dim' : ''}" data-act="slot" data-i="${i}" ${can ? '' : 'disabled'} aria-label="Emplacement ${i + 1} : ${sl.map(c => H.COLOR_FR[c]).join(', ')}">${toks}</button>`;
}
function scoreHtml(p) {
  const sc = H.score(p), lr = H.longestRiver(p.board).length;
  const row = (key, lbl, extra = '') => `<div class="srow">${CAT_ICON[key]}<span>${lbl}${extra}</span><b>${sc[key]}</b></div>`;
  return `<div class="score">${row('trees', 'Arbres')}${row('mountains', 'Montagnes')}${row('fields', 'Champs')}${row('buildings', 'Bâtiments')}${row('water', 'Rivière', lr ? `<small>${lr} jeton${lr > 1 ? 's' : ''}</small>` : '')}${row('animals', 'Animaux')}</div>
    <div class="stotal"><span>Total</span><b>${sc.total}</b></div>`;
}
function dockHtml() {
  const p = me(); const stuck = H.handStuck(S);
  let msg;
  const ready = p.cards.filter(c => H.cardTargets(p.board, c.id).length).map(c => H.CARDS[c.id].name);
  if (!isMyView()) msg = `<p>Tu regardes le paysage de <b>${esc(viewing().name)}</b>.</p>`;
  else if (UI.cubeCard !== null) msg = `<p>Clique une case <b>orange</b> pour accueillir <b>${esc(H.CARDS[p.cards[UI.cubeCard].id].name)}</b>. Le motif peut être tourné dans tous les sens.</p>`;
  else if (!S.tookSlot) msg = '<p><b>Choisis 3 jetons</b> sur le plateau central, à gauche.</p>';
  else if (stuck) msg = '<p class="warn">Aucun de ces jetons ne peut être posé : ils seront défaussés.</p>';
  else if (S.hand.length) msg = `<p>Pose ton jeton <b>${H.COLOR_FR[S.hand[UI.sel]]}</b> sur une case verte.${S.hand.length > 1 ? ' Clique un autre jeton pour changer.' : ''}</p>`;
  else msg = ready.length ? `<p><b>${ready.map(esc).join(', ')}</b> ${ready.length > 1 ? 'peuvent' : 'peut'} s'installer : clique « Accueillir » à droite.</p>` : `<p>Paysage posé.${S.tookCard ? '' : ' Tu peux encore adopter une carte Animal.'} Termine ton tour quand tu veux.</p>`;
  const st = !S.tookSlot ? 0 : S.hand.length ? 1 : 2;
  const steps = ['Prendre', 'Poser', 'Animaux', 'Fin'].map((l, i) => `<span class="${i === st ? 'now' : i < st ? 'ok' : ''}">${l}</span>`).join('');
  const slots = [0, 1, 2].map(i => S.hand[i] !== undefined
    ? `<button class="htok ${i === UI.sel && UI.cubeCard === null ? 'sel' : ''}" data-act="sel" data-i="${i}" data-flip="${UI.handIds[i] || 'h' + i}" aria-label="Jeton ${H.COLOR_FR[S.hand[i]]}" title="${H.COLOR_FR[S.hand[i]]} (touche ${i + 1})">${tokenIcon([S.hand[i]], 64)}</button>`
    : `<span class="htok ghost">${tokenIcon([], 64)}</span>`).join('');
  return `<div class="dock panel">
    <div class="hand">${slots}</div>
    <div class="msg"><div class="steps">${steps}</div>${msg}</div>
    <div class="dbtns"><button class="btn ghost sqbtn" data-act="undo" title="Annuler (Ctrl+Z)" ${history.length && isMyView() ? '' : 'disabled'}>${icon('undo')}</button>
    <button class="btn ${H.canEndTurn(S) && isMyView() ? 'pulse' : ''}" data-act="end" ${H.canEndTurn(S) && isMyView() ? '' : 'disabled'}>Terminer le tour</button></div></div>`;
}
function topHtml(intro) {
  const players = S ? S.players.map((p, i) => `<button class="pchip ${i === S.current && !S.over ? 'on' : ''} ${i === UI.viewIdx && i !== S.current ? 'viewing' : ''}" style="--pc:${p.color}" data-act="view" data-i="${i}" title="Voir le paysage de ${esc(p.name)}">
      <span class="av">${esc((p.name[0] || '?').toUpperCase())}</span><span><div class="nm">${esc(p.name)}</div>${i === S.current && !S.over ? '<div class="turnlbl">joue</div>' : ''}</span><span class="sc">${H.score(p).total}</span></button>`).join('') : '';
  return `<div class="top"><div class="brand" style="${intro ? 'visibility:hidden' : ''}">Verdance</div><div class="players">${players}</div>
    <div class="tools">${S ? `<div class="meta"><span>Sac <b>${S.bag.length}</b></span><span>Pioche <b>${S.deck.length}</b></span></div>
      <button class="ibtn" data-act="topview" title="Vue de dessus (T)">${icon('top')}</button>
      <button class="ibtn ${UI.tokens ? 'on' : ''}" data-act="tokens" title="Afficher les jetons (J)">${icon('tokens')}</button>
      <button class="ibtn" data-act="recenter" title="Recentrer">${icon('center')}</button>
      ${S.players.length > 1 ? `<button class="ibtn" data-act="overview" title="Tous les paysages">${icon('all')}</button>` : ''}` : ''}
      <button class="ibtn" data-act="sound" title="Son">${icon(Sound.on ? 'sound' : 'mute')}</button>
      <button class="ibtn" data-act="rules" title="Règles">${icon('book')}</button>
      ${S ? `<button class="ibtn" data-act="quit" title="Accueil">${icon('quit')}</button>` : ''}</div></div>`;
}
function gameHtml() {
  const v = viewing(), mine = isMyView();
  if (S.over) { const w = H.ranking(S)[0]; return topHtml() + `<div class="endbar panel"><span>${esc(w.p.name)} l'emporte avec ${w.sc.total} points</span><button class="btn ghost" data-act="results">Résultats</button><button class="btn" data-act="rematch">Revanche</button><button class="btn ghost" data-act="quit">Accueil</button></div>`; }
  return topHtml() + `
  <div class="left">
    <section class="panel"><div class="ptitle"><h2>Plateau central</h2><small>${S.tookSlot ? 'jetons pris' : 'prends 3 jetons'}</small></div>
      <div class="nests">${S.slots.map(nestHtml).join('')}</div></section>
    <section class="panel"><div class="ptitle"><h2>Cartes Animal</h2><small>${S.tookCard ? 'déjà adoptée' : '1 par tour'}</small></div>
      <div class="market">${S.market.map((id, i) => cardHtml({ id }, { mode: 'market', idx: i })).join('')}${S.deck.length ? `<div class="deck"><div><b>${S.deck.length}</b><span>cartes</span></div></div>` : ''}</div></section>
  </div>
  <div class="right">
    <section class="panel" style="--pc:${v.color}"><div class="ptitle"><h2 style="color:${v.color}">${esc(v.name)}</h2><small>${H.emptyCells(v)} cases libres</small></div>${scoreHtml(v)}</section>
    <section class="panel"><div class="ptitle"><h2>Animaux</h2><small>${v.cards.length}/4 en cours</small></div>
      <div class="mine">${[0, 1, 2, 3].map(i => v.cards[i] ? cardHtml(v.cards[i], { mode: 'mine', idx: i }) : '<div class="empty-slot">Emplacement libre</div>').join('')}</div>
      ${v.done.length ? `<div class="done">${v.done.map(c => `<span>${esc(H.CARDS[c.id].name)} <b>${H.CARDS[c.id].pts[c.placed - 1]}</b></span>`).join('')}</div>` : ''}</section>
  </div>
  ${!mine && !S.over ? `<div class="viewing-banner panel">Paysage de <b style="color:${v.color}">${esc(v.name)}</b><button class="btn" data-act="view" data-i="${S.current}" style="padding:8px 14px">Revenir à ${esc(me().name)}</button></div>` : ''}
  ${S.over ? '' : dockHtml()}`;
}
function introHtml() {
  const saved = store.get(SAVE_KEY, null);
  return topHtml(true) + `<div class="intro"><div class="intro-card">
    <h1 class="display">Verdance<em>un paysage, jeton après jeton</em></h1>
    <p class="lead">Faites pousser des forêts, élevez des montagnes, tracez des rivières. Puis invitez les animaux qui ne vivent que dans ces habitats-là.</p>
    <div class="pl-list">${UI.names.map((n, i) => `<div class="pl" style="--pc:${H.PLAYER_COLORS[i]}"><span class="av"></span><input value="${esc(n)}" maxlength="16" data-name="${i}" aria-label="Joueur ${i + 1}">${UI.names.length > 1 ? `<button data-act="rmp" data-i="${i}" title="Retirer">${icon('x')}</button>` : ''}</div>`).join('')}</div>
    ${UI.names.length < 4 ? '<button class="linkbtn" data-act="addp">+ Ajouter un joueur</button>' : ''}
    <div class="row" style="margin-top:22px"><button class="btn" data-act="start" style="padding:14px 24px;font-size:1.02rem">Commencer la partie</button>
    ${saved && saved.S ? '<button class="btn warm" data-act="resume">Reprendre</button>' : ''}<button class="btn ghost" data-act="rules">Règles</button></div>
  </div></div>`;
}
function turnHtml() {
  const p = me();
  return `<div class="turn" data-act="closeturn" style="--pc:${p.color}"><div class="turn-card">
    <div class="eyebrow">Tour ${p.turns + 1}${S.endTriggered ? ' · dernier tour' : ''}</div>
    <h1 class="display">À toi, ${esc(p.name)}</h1>
    <p>${S.endTriggered ? 'La fin est déclenchée : c\'est le dernier tour de table.' : 'Ton paysage t\'attend.'}</p>
    <button class="btn" data-act="closeturn" style="padding:14px 28px">Jouer</button></div></div>`;
}
function endHtml() {
  const rows = S.players.map((p, i) => ({ p, i, sc: H.score(p), cubes: H.cubesPlaced(p) }));
  const rk = H.ranking(S); const w = rk[0]; const tie = rk.filter(r => r.sc.total === w.sc.total && r.cubes === w.cubes).length > 1;
  const line = (key, lbl) => `<tr><td class="lbl">${CAT_ICON[key]}${lbl}</td>${rows.map(r => `<td>${r.sc[key]}</td>`).join('')}</tr>`;
  return `<div class="veil"><div class="modal">
    <div class="eyebrow">Partie terminée</div>
    <h1 class="display" style="font-size:3.4rem;color:${tie ? 'var(--accent)' : w.p.color};margin-top:8px">${tie ? 'Égalité parfaite' : esc(w.p.name) + ' gagne'}</h1>
    <table class="final"><tr><th></th>${rows.map(r => `<th style="color:${r.p.color}">${esc(r.p.name)}</th>`).join('')}</tr>
    ${line('trees', 'Arbres')}${line('mountains', 'Montagnes')}${line('fields', 'Champs')}${line('buildings', 'Bâtiments')}${line('water', 'Rivière')}
    <tr class="sub"><td>Paysages</td>${rows.map(r => `<td>${r.sc.landscape}</td>`).join('')}</tr>
    ${line('animals', 'Animaux')}
    <tr><td>Cubes posés</td>${rows.map(r => `<td>${r.cubes}</td>`).join('')}</tr>
    <tr class="tot"><td>Total</td>${rows.map(r => `<td class="${r.i === w.i && !tie ? 'win' : ''}" data-count="${r.sc.total}">0</td>`).join('')}</tr></table>
    <div class="row"><button class="btn" data-act="rematch">Revanche</button><button class="btn ghost" data-act="closeend">Admirer les paysages</button><button class="btn ghost" data-act="quit">Accueil</button></div>
  </div></div>`;
}
function rulesHtml() {
  const rc = (stack, t, d) => `<div class="rcell">${tokenIcon(stack, 46)}<div><b>${t}</b>${d}</div></div>`;
  return `<div class="veil" data-act="closerules"><div class="modal rules" data-stop="1">
    <div class="row" style="justify-content:space-between"><h1 class="display" style="font-size:2.3rem">Les règles</h1><button class="ibtn" data-act="closerules">${icon('x')}</button></div>
    <h3>À ton tour</h3><ul>
    <li><b>Obligatoire :</b> prends les 3 jetons d'un emplacement du plateau central et pose-les tous sur ton paysage.</li>
    <li><b>Une fois, si tu veux :</b> adopte une carte Animal (4 en cours au maximum).</li>
    <li><b>Autant que tu veux :</b> quand le motif d'une carte est réalisé (dans n'importe quelle orientation), accueille l'animal : son cube se pose sur la case entourée d'orange.</li></ul>
    <h3>Les paysages</h3><div class="rgrid">
    ${rc(['brown', 'brown', 'green'], 'Arbres', '1 vert sur 0, 1 ou 2 troncs : 1, 3 ou 7 pts')}
    ${rc(['gray', 'gray', 'gray'], 'Montagnes', '1 à 3 gris : 1, 3 ou 7 pts, si elles touchent une autre montagne')}
    ${rc(['yellow'], 'Champs', '5 pts par groupe d\'au moins 2 jetons jaunes')}
    ${rc(['gray', 'red'], 'Bâtiments', 'Rouge sur marron, gris ou rouge : 5 pts si 3 couleurs autour')}
    ${rc(['blue'], 'Rivière', 'La plus longue : 0, 2, 5, 8, 11, 15, puis +4 par jeton')}
    <div class="rcell"><svg viewBox="0 0 44 44" width="46" height="46">${cubeSvg(22, 24, 11)}</svg><div><b>Animaux</b>La dernière valeur découverte de chaque carte</div></div></div>
    <h3>Fin de partie</h3><ul><li>Quand le sac ne suffit plus pour remplir le plateau central, ou qu'un joueur finit son tour avec 2 cases libres ou moins. On termine le tour de table : chacun aura joué autant de tours.</li></ul>
    <h3>Crédits</h3><ul><li>Verdance est un projet indépendant et open source, inspiré des jeux de pose et de motifs comme <i>Harmonies</i> (Libellud). Il n'est ni affilié à Libellud ni approuvé par eux.</li>
    <li>Modèles 3D d'animaux : « Poly by Google » (CC-BY 3.0), « Gwym Hendawyr » (CC-BY 3.0) et « Хмара Сергей » (CC-BY 3.0), via poly.pizza ; Quaternius (CC0). Textures redimensionnées, certains modèles réorientés ou teintés.</li></ul>
    <h3>Raccourcis</h3><ul><li><b>1 2 3</b> choisir un jeton · <b>T</b> vue de dessus · <b>J</b> afficher les jetons · <b>Ctrl+Z</b> annuler · <b>Entrée</b> terminer le tour · glisser pour tourner, molette pour zoomer.</li></ul>
  </div></div>`;
}

function frame() { if (Scene.ready) Scene.setFraming(S ? { x: 0, y: 46, dist: 1 } : { x: window.innerWidth > 900 ? 0.17 : 0, y: 0, dist: 1.18 }); }
function render({ animate = true } = {}) {
  frame();
  const prev = new Map(); document.querySelectorAll('[data-flip]').forEach(el => prev.set(el.dataset.flip, el.getBoundingClientRect()));
  let html = S ? gameHtml() : introHtml();
  if (S && UI.overlay === 'turn') html += turnHtml();
  if (S && UI.overlay === 'end') html += endHtml();
  if (UI.rules) html += rulesHtml();
  hud.innerHTML = html;
  document.querySelectorAll('[data-flip]').forEach(el => {
    const r0 = prev.get(el.dataset.flip); if (!r0) return; const r1 = el.getBoundingClientRect();
    const dx = r0.left + r0.width / 2 - (r1.left + r1.width / 2), dy = r0.top + r0.height / 2 - (r1.top + r1.height / 2);
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
    el.animate([{ transform: `translate(${dx}px,${dy}px) scale(${r0.width / r1.width})` }, { transform: 'none' }], { duration: 560, easing: 'cubic-bezier(.2,.9,.3,1.06)' });
  });
  syncScene(animate);
}
let countRaf;
function startCountUp() {
  const t0 = performance.now(); cancelAnimationFrame(countRaf);
  const step = () => { const p = Math.min(1, (performance.now() - t0) / 1600), e = 1 - Math.pow(1 - p, 3);
    document.querySelectorAll('[data-count]').forEach(el => { el.textContent = Math.round(+el.dataset.count * e); });
    if (p < 1) countRaf = requestAnimationFrame(step); };
  setTimeout(step, 350);
}

/* ================= Événements ================= */
document.addEventListener('click', e => {
  if (e.target.closest('[data-stop]') && !e.target.closest('[data-act]')) return;
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, i = +el.dataset.i;
  Sound.ac();
  switch (act) {
    case 'start': readNames(); startGame(UI.names.map((n, j) => n.trim() || 'Joueur ' + (j + 1))); break;
    case 'resume': { const d = store.get(SAVE_KEY, null); if (d && d.S) { S = d.S; history = d.history || []; UI.handIds = []; if (Scene.ready) { Scene.reset(); Scene.autoRotate(false); } showTurn(); } break; }
    case 'addp': readNames(); if (UI.names.length < 4) UI.names.push('Joueur ' + (UI.names.length + 1)); render(); break;
    case 'rmp': readNames(); UI.names.splice(i, 1); render(); break;
    case 'rules': UI.rules = true; render({ animate: false }); break;
    case 'closerules': UI.rules = false; render({ animate: false }); break;
    case 'closeturn': UI.overlay = null; render({ animate: false }); break;
    case 'closeend': UI.overlay = null; render({ animate: false }); break;
    case 'results': UI.overlay = 'end'; render({ animate: false }); startCountUp(); break;
    case 'quit': S = null; UI.overlay = null; if (Scene.ready) { Scene.reset(); Scene.autoRotate(true); } render({ animate: false }); if (Scene.ready) Scene.focus(0, { keepAngle: false }); break;
    case 'rematch': startGame(S.players.map(p => p.name)); break;
    case 'slot': takeSlot(i); break;
    case 'sel': UI.sel = i; UI.cubeCard = null; Sound.pick(); render(); break;
    case 'take': takeCard(i); break;
    case 'cubemode': UI.cubeCard = UI.cubeCard === i ? null : i; render(); break;
    case 'end': endTurn(); break;
    case 'undo': undo(); break;
    case 'view': if (S) { UI.viewIdx = i; UI.cubeCard = null; render({ animate: false }); Scene.focus(i); } break;
    case 'topview': Scene.topView(); break;
    case 'recenter': Scene.resetView(S ? UI.viewIdx : 0); break;
    case 'overview': Scene.overview(); break;
    case 'tokens': UI.tokens = !UI.tokens; Scene.setShowTokens(UI.tokens); render({ animate: false }); break;
    case 'sound': Sound.on = !Sound.on; store.set('verdance-sound', Sound.on); render({ animate: false }); break;
  }
});
function readNames() { document.querySelectorAll('[data-name]').forEach(inp => { UI.names[+inp.dataset.name] = inp.value; }); }
document.addEventListener('input', e => { if (e.target.dataset.name !== undefined) UI.names[+e.target.dataset.name] = e.target.value; });
document.addEventListener('pointerover', e => {
  const c = e.target.closest('[data-hovercard]'); const v = c ? +c.dataset.hovercard : null;
  if (v !== UI.hoverCard) { UI.hoverCard = v; if (S) syncScene(); }
});
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') { if (e.key === 'Enter' && !S) { readNames(); startGame(UI.names.map((n, j) => n.trim() || 'Joueur ' + (j + 1))); } return; }
  if (e.key === 'Escape') { if (UI.rules) { UI.rules = false; render({ animate: false }); } else if (UI.cubeCard !== null) { UI.cubeCard = null; render(); } return; }
  if (!S) return;
  if (UI.overlay === 'turn' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); UI.overlay = null; render({ animate: false }); return; }
  if (UI.overlay) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  else if (['1', '2', '3'].includes(e.key) && S.hand[+e.key - 1]) { UI.sel = +e.key - 1; UI.cubeCard = null; Sound.pick(); render(); }
  else if (e.key === 'Enter') endTurn();
  else if (e.key.toLowerCase() === 't') Scene.topView();
  else if (e.key.toLowerCase() === 'j') { UI.tokens = !UI.tokens; Scene.setShowTokens(UI.tokens); render({ animate: false }); }
});

/* ================= Démarrage ================= */
render({ animate: false });
Scene.onLand = color => Sound.clack({ gray: .8, brown: .9, red: 1.05, green: 1.1, yellow: 1.2, blue: .7 }[color] || 1);
Scene.init(document.getElementById('stage'), {
  onReady() { frame(); syncScene(false); Scene.focus(0, { instant: true, keepAngle: false }); if (!S) Scene.autoRotate(true); },
  onError() { document.body.insertAdjacentHTML('beforeend', '<div class="fallback"><div><h1 class="display" style="font-size:3rem">Verdance</h1><p>La 3D n\'a pas pu se charger (connexion internet requise la première fois).</p><p><a href="prototype-v1.html">Jouer à la version 2D</a></p></div></div>'); },
  onHover,
  onCellClick(pi, k) {
    if (!S || UI.overlay || pi !== S.current || !isMyView()) return;
    if (UI.cubeCard !== null) placeCube(k); else if (S.hand.length) placeToken(k);
  },
});
window.__H = { get S() { return S; }, UI, render, startGame, takeSlot, placeToken, takeCard, placeCube, endTurn, syncScene };
})();
