/* Verdance — interface (HUD, cartes, main, sons) au-dessus de la scène 3D. */
(function () {
'use strict';
const SAVE_KEY = 'verdance-v2-save';
const MODE = { embed: /[?&]embed/.test(location.search), demo: /[?&]demo/.test(location.search) };
if (MODE.embed || MODE.demo) document.documentElement.classList.add(MODE.embed ? 'embed' : 'demo');
const SQ3 = Math.sqrt(3);
const hud = document.getElementById('hud');
let S = null, history = [];
const UI = { spirits: true, sel: 0, cubeCard: null, viewIdx: 0, overlay: null, toast: null, hoverK: null, hoverCard: null, handIds: [], names: ['', ''], rules: false };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };
UI.spirits = store.get('verdance-spirits', true);

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
const { isoStack, stackTopY, cubeSvg, tokenIcon, hexIso, patternSvg } = window.Draw;
const CAT_ICON = {
  trees: tokenIcon(['brown', 'green'], 44), mountains: tokenIcon(['gray', 'gray'], 44), fields: tokenIcon(['yellow'], 44),
  buildings: tokenIcon(['brown', 'red'], 44), water: tokenIcon(['blue'], 44),
  animals: `<svg viewBox="0 0 44 44">${cubeSvg(22, 24, 11)}</svg>`,
  spirit: '<svg viewBox="0 0 44 44"><defs><radialGradient id="spg"><stop offset="0" stop-color="#fffbe8"/><stop offset=".45" stop-color="#ffd36a"/><stop offset="1" stop-color="#ffd36a" stop-opacity="0"/></radialGradient></defs><circle cx="22" cy="22" r="18" fill="url(#spg)"/><circle cx="22" cy="22" r="6" fill="#fff6d0"/></svg>',
};
const I = {
  top: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
  tokens: '<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v4c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 11v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4"/>',
  center: '<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  all: '<rect x="2.5" y="8" width="8" height="9" rx="2.5"/><rect x="13.5" y="6" width="8" height="9" rx="2.5"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
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
function startGame(names, opts = { spirits: UI.spirits }) {
  S = H.newState(names, opts); history = []; UI.sel = 0; UI.cubeCard = null; UI.viewIdx = 0; UI.handIds = [];
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
function updateAmbience() {
  if (!window.Snd) return; const p = S ? viewing() : demoState().players[0]; const b = p.board, n = { water: 0, forest: 0, mountain: 0, field: 0 }, names = [];
  for (const k in b) { const s = b[k].stack, t = s[s.length - 1]; if (t === 'blue') n.water++; else if (t === 'green') n.forest++; else if (s.length && s.every(x => x === 'gray')) n.mountain++; else if (t === 'yellow') n.field++; if (b[k].cube && H.CARDS[b[k].cube.card]) names.push(H.CARDS[b[k].cube.card].name); }
  Snd.setAmbience({ water: n.water / 5, forest: n.forest / 5, mountain: n.mountain / 4, field: n.field / 4 }); Snd.setAnimals(names);
}
function syncScene(animate = true) {
  updateAmbience();
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

const PORT = {};
function portraitHtml(spec, fallback) {
  if (PORT[spec.key]) return `<img class="portrait" src="${PORT[spec.key]}" alt="">`;
  if (window.Scene && Scene.ready && Scene.portrait) Scene.portrait(spec).then(url => {
    if (!url) return; PORT[spec.key] = url;
    document.querySelectorAll(`[data-portrait="${spec.key}"]`).forEach(el => { el.innerHTML = `<img class="portrait fadein" src="${url}" alt="">`; });
  });
  return fallback;
}
const reqIcons = cells => cells.map(([req], i) => `<span class="rq${i === 0 ? ' tg' : ''}" title="${H.REQ[req].label}">${tokenIcon(req === 'B' ? ['brown', 'red'] : H.REQ[req].stack, 30)}</span>`).join('');
function spiritHtml(id, { pick = null, owner = null, hidden = false } = {}) {
  const sp = H.SPIRITS[id];
  if (hidden) return `<div class="card spirit back"><div class="art"><span class="sigil"></span></div><div class="body"><div class="nm">Esprit secret</div><p class="stext">Révélé en fin de partie</p></div></div>`;
  const spec = { key: 'spirit-' + id, cells: sp.cells, wisp: { blue: '#7fd3ff', gray: '#d9e3f0', yellow: '#ffd36a', green: '#9cf07a', red: '#ffab7a', brown: '#ffe2a0', orange: '#ffb35c' }[sp.color] };
  const pts = owner ? sp.score(owner) : null;
  return `<div class="card spirit" style="--c:var(--${sp.color === 'orange' ? 'cube' : sp.color})"><div class="art" data-portrait="${spec.key}">${portraitHtml(spec, '<span class="sigil"></span>')}</div>
    <div class="body"><div class="nm">${esc(sp.name)}</div><p class="stext">${esc(sp.text)}</p>${pts !== null ? `<div class="spts">${pts} pts pour l'instant</div>` : ''}
    ${pick !== null ? `<button class="cbtn gold" data-act="spirit" data-i="${pick}">Choisir cet esprit</button>` : ''}</div></div>`;
}
function cardHtml(c, { mode, idx }) {
  const placed = c.placed || 0; let cls = '', btn = '';
  if (mode === 'market') {
    const ok = isMyView() && !S.tookCard && me().cards.length < 4 && !UI.overlay;
    if (ok) cls += ' can';
    const why = !isMyView() ? '' : S.tookCard ? 'Déjà adopté' : me().cards.length >= 4 ? '4 cartes max' : 'Adopter';
    btn = `<button class="cbtn" data-act="take" data-i="${idx}" ${ok ? '' : 'disabled'}>${why || 'Adopter'}</button>`;
  } else if (mode === 'mine') {
    const mine = isMyView(), ready = mine && H.cardTargets(me().board, c.id).length > 0;
    if (ready) cls += ' ready';
    if (mine && UI.cubeCard === idx) cls += ' picked';
    btn = ready ? `<button class="cbtn warm" data-act="cubemode" data-i="${idx}">${UI.cubeCard === idx ? 'Annuler' : 'Accueillir'}</button>` : '';
  }
  const narrow = window.innerWidth <= 1180, width = Math.floor(((mode === 'market' ? (narrow ? 280 : 316) : (narrow ? 260 : 300)) - 41) / 2);
  return `<div class="cardwrap" data-flip="card-${c.id}" ${mode === 'mine' ? `data-hovercard="${idx}"` : ''}>${VCard.html(c.id, { width, placed, cls })}${btn}</div>`;
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
  return `<div class="score">${row('trees', 'Arbres')}${row('mountains', 'Montagnes')}${row('fields', 'Champs')}${row('buildings', 'Bâtiments')}${row('water', 'Rivière', lr ? `<small>${lr} jeton${lr > 1 ? 's' : ''}</small>` : '')}${row('animals', 'Animaux')}${p.spirit != null ? row('spirit', 'Esprit') : ''}</div>
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
    <div class="dbtns">${S.endTriggered && !S.freePlay && isMyView() ? '<button class="btn ghost small-btn" data-act="continue" title="Ignorer la fin et jouer jusqu\'à vider le sac">Ignorer la fin</button>' : ''}<button class="btn ghost sqbtn" data-act="undo" title="Annuler (Ctrl+Z)" ${history.length && isMyView() ? '' : 'disabled'}>${icon('undo')}</button>
    <button class="btn ${H.canEndTurn(S) && isMyView() ? 'pulse' : ''}" data-act="end" ${H.canEndTurn(S) && isMyView() ? '' : 'disabled'}>Terminer le tour</button></div></div>`;
}
function topHtml(intro) {
  const players = S ? S.players.map((p, i) => `<button class="pchip ${i === S.current && !S.over ? 'on' : ''} ${i === UI.viewIdx && i !== S.current ? 'viewing' : ''}" style="--pc:${p.color}" data-act="view" data-i="${i}" title="Voir le paysage de ${esc(p.name)}">
      <span class="av">${esc((p.name[0] || '?').toUpperCase())}</span><span><div class="nm">${esc(p.name)}</div>${i === S.current && !S.over ? '<div class="turnlbl">joue</div>' : ''}</span><span class="sc">${H.score(p).total}</span></button>`).join('') : '';
  return `<div class="top"><div class="brand" style="${intro ? 'visibility:hidden' : ''}">Verdance</div><div class="players">${players}</div>
    <div class="tools">${S ? `<div class="meta"><span>Sac <b>${S.bag.length}</b></span><span>Pioche <b>${S.deck.length}</b></span>${S.freePlay && !S.over ? '<span class="freebadge">Partie libre</span><button class="btn ghost small-btn" data-act="finish">Terminer</button>' : ''}</div>
      <button class="ibtn" data-act="topview" title="Vue de dessus (T)">${icon('top')}</button>
      <button class="ibtn ${UI.tokens ? 'on' : ''}" data-act="tokens" title="Afficher les jetons (J)">${icon('tokens')}</button>
      <button class="ibtn" data-act="recenter" title="Recentrer">${icon('center')}</button>
      ${S.players.length > 1 ? `<button class="ibtn" data-act="overview" title="Tous les paysages">${icon('all')}</button>` : ''}` : ''}
      <button class="ibtn ${Snd.musicOn ? '' : 'off'}" data-act="music" title="Musique">${icon('music')}</button>
      <button class="ibtn" data-act="sound" title="Sons et nature">${icon(Sound.on ? 'sound' : 'mute')}</button>
      <button class="ibtn" data-act="rules" title="Règles">${icon('book')}</button>
      ${S ? `<button class="ibtn" data-act="quit" title="Accueil">${icon('quit')}</button>` : ''}</div></div>`;
}
function gameHtml() {
  const v = viewing(), mine = isMyView();
  if (S.over) { const w = H.ranking(S)[0]; return topHtml() + `<div class="endbar panel"><span>${esc(w.p.name)} l'emporte avec ${w.sc.total} points</span><button class="btn ghost" data-act="results">Résultats</button>${H.tokensLeft(S) ? '<button class="btn warm" data-act="continue">Continuer</button>' : ''}<button class="btn" data-act="rematch">Revanche</button><button class="btn ghost" data-act="quit">Accueil</button></div>`; }
  return topHtml() + `
  <div class="left">
    <section class="panel"><div class="ptitle"><h2>Plateau central</h2><small>${S.tookSlot ? 'jetons pris' : 'prends 3 jetons'}</small></div>
      <div class="nests">${S.slots.map(nestHtml).join('')}</div></section>
    <section class="panel"><div class="ptitle"><h2>Cartes Animal</h2><small>${S.tookCard ? 'déjà adoptée' : '1 par tour'}</small></div>
      <div class="market">${S.market.map((id, i) => cardHtml({ id }, { mode: 'market', idx: i })).join('')}${S.deck.length ? `<div class="deck"><div><b>${S.deck.length}</b><span>cartes</span></div></div>` : ''}</div></section>
  </div>
  <div class="right">
    <section class="panel" style="--pc:${v.color}"><div class="ptitle"><h2 style="color:${v.color}">${esc(v.name)}</h2><small>${H.emptyCells(v)} cases libres</small></div>${scoreHtml(v)}</section>
    ${v.spirit != null || v.spiritChoice ? `<section class="panel"><div class="ptitle"><h2>Esprit du paysage</h2><small>objectif secret</small></div>${v.spirit == null ? '<div class="empty-slot" style="min-height:70px">À choisir au début du tour</div>' : (UI.viewIdx === S.current ? spiritHtml(v.spirit, { owner: v }) : spiritHtml(v.spirit, { hidden: true }))}</section>` : ''}
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
    <div class="pl-list">${UI.names.map((n, i) => `<div class="pl" style="--pc:${H.PLAYER_COLORS[i]}"><span class="av"></span><input value="${esc(n)}" placeholder="Joueur ${i + 1}" maxlength="16" data-name="${i}" aria-label="Joueur ${i + 1}">${UI.names.length > 1 ? `<button data-act="rmp" data-i="${i}" title="Retirer">${icon('x')}</button>` : ''}</div>`).join('')}</div>
    ${UI.names.length < 4 ? '<button class="linkbtn" data-act="addp">+ Ajouter un joueur</button>' : ''}
    <button class="opt ${UI.spirits ? 'on' : ''}" data-act="togglespirits"><span class="tick"></span><span><b>Esprits du paysage</b><small>un objectif secret par joueur, choisi parmi deux</small></span></button>
    <div class="row" style="margin-top:22px"><button class="btn" data-act="start" style="padding:14px 24px;font-size:1.02rem">Commencer la partie</button>
    ${saved && saved.S ? '<button class="btn warm" data-act="resume">Reprendre</button>' : ''}<button class="btn ghost" data-act="rules">Règles</button></div>
  </div></div>`;
}
function turnHtml() {
  const p = me();
  const mustPick = p.spirit == null && p.spiritChoice;
  return `<div class="turn" ${mustPick ? '' : 'data-act="closeturn"'} style="--pc:${p.color}"><div class="turn-card">
    <div class="eyebrow">Tour ${p.turns + 1}${S.endTriggered ? ' · dernier tour' : ''}</div>
    <h1 class="display">À toi, ${esc(p.name)}</h1>
    ${p.spirit == null && p.spiritChoice ? `<p>Choisis d'abord ton <b>Esprit du paysage</b> : un objectif secret qui rapporte des points en fin de partie.</p><div class="spirit-pick" data-stop="1">${p.spiritChoice.map((id, j) => spiritHtml(id, { pick: j })).join('')}</div>` : `
    <p>${S.freePlay ? 'Partie libre : on joue jusqu\'à vider le sac.' : S.endTriggered ? 'La fin est déclenchée : c\'est le dernier tour de table.' : 'Ton paysage t\'attend.'}</p>
    <div class="row" style="justify-content:center"><button class="btn" data-act="closeturn" style="padding:14px 28px">Jouer</button>${S.endTriggered && !S.freePlay ? '<button class="btn ghost" data-act="continue" title="La partie ne s\'arrêtera qu\'une fois le sac vide">Ignorer la fin</button>' : ''}</div>`}</div></div>`;
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
    ${S.spirits ? `<tr><td class="lbl">${CAT_ICON.spirit}Esprit</td>${rows.map(r => `<td title="${r.p.spirit != null ? esc(H.SPIRITS[r.p.spirit].name) : ''}">${r.sc.spirit}</td>`).join('')}</tr>` : ''}
    <tr><td>Cubes posés</td>${rows.map(r => `<td>${r.cubes}</td>`).join('')}</tr>
    <tr class="tot"><td>Total</td>${rows.map(r => `<td class="${r.i === w.i && !tie ? 'win' : ''}" data-count="${r.sc.total}">0</td>`).join('')}</tr></table>
    ${S.spirits ? `<p class="spirit-reveal">${rows.map(r => `<b style="color:${r.p.color}">${esc(r.p.name)}</b> : ${r.p.spirit != null ? esc(H.SPIRITS[r.p.spirit].name) : 'aucun esprit'}`).join(' · ')}</p>` : ''}
    <div class="row">${H.tokensLeft(S) ? '<button class="btn warm" data-act="continue" title="Ignorer la fin et jouer jusqu\'à vider le sac">Continuer la partie</button>' : ''}<button class="btn" data-act="rematch">Revanche</button><button class="btn ghost" data-act="closeend">Admirer les paysages</button><button class="btn ghost" data-act="quit">Accueil</button></div>
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
    <h3>Esprits du paysage</h3><ul><li>En option : au premier tour, chacun choisit un Esprit parmi deux. C'est un objectif secret, comme « 6 pts par montagne de 3 jetons », compté en fin de partie.</li></ul>
    <h3>Partie libre</h3><ul><li>Quand la fin est déclenchée, ou une fois la partie terminée, « Continuer » permet d'ignorer la fin : vous jouez jusqu'à vider le sac, puis « Terminer » affiche les scores.</li></ul>
    <h3>Crédits</h3><ul><li>Verdance est un projet indépendant et open source, inspiré des jeux de pose et de motifs comme <i>Harmonies</i> (Libellud). Il n'est ni affilié à Libellud ni approuvé par eux.</li>
    <li>Peintures des cartes : <i>Atlas de poche des mammifères de France</i> (René Martin et collaborateurs, Klincksieck, vers 1910), domaine public, via Wikimedia Commons.</li>
    <li>Modèles 3D d'animaux : « Poly by Google » (CC-BY 3.0), « Gwym Hendawyr » (CC-BY 3.0) et « Хмара Сергей » (CC-BY 3.0), via poly.pizza ; Quaternius (CC0). Textures redimensionnées, certains modèles réorientés ou teintés.</li></ul>
    <h3>Raccourcis</h3><ul><li><b>1 2 3</b> choisir un jeton · <b>T</b> vue de dessus · <b>J</b> afficher les jetons · <b>Ctrl+Z</b> annuler · <b>Entrée</b> terminer le tour · glisser pour tourner, molette pour zoomer.</li></ul>
  </div></div>`;
}

function frame() { if (Scene.ready) Scene.setFraming(MODE.embed ? { x: 0, y: 0, dist: 1.12 } : S ? { x: 0, y: 46, dist: 1 } : { x: window.innerWidth > 900 ? 0.17 : 0, y: 0, dist: 1.18 }); }
function render({ animate = true } = {}) {
  frame();
  const prev = new Map(); document.querySelectorAll('[data-flip]').forEach(el => prev.set(el.dataset.flip, el.getBoundingClientRect()));
  let html = MODE.embed ? '' : S ? gameHtml() : introHtml();
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
  Sound.ac(); Snd.start();
  switch (act) {
    case 'start': readNames(); startGame(UI.names.map((n, j) => n.trim() || 'Joueur ' + (j + 1))); break;
    case 'resume': { const d = store.get(SAVE_KEY, null); if (d && d.S) { S = d.S; history = d.history || []; UI.handIds = []; if (Scene.ready) { Scene.reset(); Scene.autoRotate(false); } showTurn(); } break; }
    case 'addp': readNames(); if (UI.names.length < 4) UI.names.push(''); render(); break;
    case 'rmp': readNames(); UI.names.splice(i, 1); render(); break;
    case 'rules': UI.rules = true; render({ animate: false }); break;
    case 'closerules': UI.rules = false; render({ animate: false }); break;
    case 'closeturn': UI.overlay = null; render({ animate: false }); break;
    case 'closeend': UI.overlay = null; render({ animate: false }); break;
    case 'results': UI.overlay = 'end'; render({ animate: false }); startCountUp(); break;
    case 'quit': S = null; UI.overlay = null; if (Scene.ready) { Scene.reset(); Scene.autoRotate(true); } render({ animate: false }); if (Scene.ready) Scene.focus(0, { keepAngle: false }); break;
    case 'rematch': startGame(S.players.map(p => p.name), { spirits: S.spirits }); break;
    case 'spirit': H.chooseSpirit(S, S.current, i); save(); Sound.chime(); render({ animate: false }); break;
    case 'togglespirits': UI.spirits = !UI.spirits; store.set('verdance-spirits', UI.spirits); readNames(); render({ animate: false }); break;
    case 'continue': if (H.continueGame(S)) { const wasOver = UI.overlay === 'end' || document.querySelector('.endbar'); Scene.autoRotate(false); toast('Partie libre : la fin est ignorée, vous jouez jusqu\'à vider le sac'); if (wasOver) showTurn(); else render({ animate: false }); save(); } break;
    case 'finish': H.finishNow(S); store.del(SAVE_KEY); UI.overlay = 'end'; render({ animate: false }); if (Scene.ready) { Scene.overview(); Scene.autoRotate(true); } Sound.chime(); startCountUp(); break;
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
    case 'sound': Sound.on = !Sound.on; store.set('verdance-sound', Sound.on); if (Snd.natureOn !== Sound.on) Snd.toggleNature(); render({ animate: false }); break;
    case 'music': Snd.toggleMusic(); render({ animate: false }); break;
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
  if (UI.overlay === 'turn' && (e.key === 'Enter' || e.key === ' ') && !(me().spirit == null && me().spiritChoice)) { e.preventDefault(); UI.overlay = null; render({ animate: false }); return; }
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
  onReady() { frame(); render({ animate: false }); Scene.focus(0, { instant: true, keepAngle: false }); if (!S) Scene.autoRotate(true); },
  onError() { document.body.insertAdjacentHTML('beforeend', '<div class="fallback"><div><h1 class="display" style="font-size:3rem">Verdance</h1><p>La 3D n\'a pas pu se charger (connexion internet requise la première fois).</p><p><a href="prototype-v1.html">Jouer à la version 2D</a></p></div></div>'); },
  onHover,
  onAnimalHover(name) { Snd.cry(name, .8); },
  onAnimalArrive(name) { setTimeout(() => Snd.cry(name), 450); },
  onCellClick(pi, k) {
    if (!S || UI.overlay || pi !== S.current || !isMyView()) return;
    if (UI.cubeCard !== null) placeCube(k); else if (S.hand.length) placeToken(k);
  },
});
/* ================= Mode démo : une île construite du début à la fin, pour filmer ================= */
const DEMO_TXT = {
  fr: [['Jouez à plusieurs, sur ordinateur et sur téléphone', ''], ['Gratuit et open source', 'Le code est sur GitHub, sous licence MIT']],
  en: [['Play with friends, on desktop and mobile', ''], ['Free and open source', 'The code is on GitHub, under the MIT license']],
};
async function runDemo() {
  const W = ms => new Promise(r => setTimeout(r, ms));
  const lang = /lang=en/.test(location.search) ? 'en' : 'fr';
  UI.names = ['Alice', 'Bob']; render({ animate: false }); // prénoms neutres pour la vidéo
  while (!Scene.ready) await W(100);
  if (!/autostart/.test(location.search)) await new Promise(res => { const o = document.createElement('div'); o.className = 'demo-start'; o.innerHTML = '<div><b>Cliquer pour lancer la démo</b><span>Lance l\'enregistrement de l\'écran avant de cliquer</span></div>'; o.onclick = () => { o.remove(); res(); }; document.body.appendChild(o); });
  Snd.start();
  // curseur visible : il va là où l'action a lieu
  const cur = document.createElement('div'); cur.className = 'demo-cursor'; cur.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 2l15 10-6.5 1.5L16 21l-3 1.2-3.4-7.6L4 19z" fill="#fff" stroke="#1d2a24" stroke-width="1.6" stroke-linejoin="round"/></svg>'; document.body.appendChild(cur);
  let cx = innerWidth * .5, cy = innerHeight * .7; cur.style.transform = `translate(${cx}px,${cy}px)`;
  const moveTo = async (x, y, ms) => { cur.animate([{ transform: `translate(${cx}px,${cy}px)` }, { transform: `translate(${x}px,${y}px)` }], { duration: ms, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'forwards' }); cx = x; cy = y; await W(ms); };
  const tap = async () => { const r = document.createElement('div'); r.className = 'demo-tap'; r.style.left = cx + 'px'; r.style.top = cy + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 550); await W(90); };
  const center = sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const at = async (sel, ms = 260) => { const c = center(sel); if (c) { await moveTo(c[0], c[1], ms); await tap(); } };
  const cell = async (pi, k, ms = 210) => { const p = Scene.screenPos(pi, k); if (p) { await moveTo(p.x, p.y + 26, ms); await tap(); } };
  const id = n => H.CARDS.find(c => c.name === n).id;
  const tagEl = document.createElement('div'); tagEl.className = 'demo-tag'; document.body.appendChild(tagEl);
  const tag = p => { tagEl.innerHTML = `<span style="background:${p.color}">${esc(p.name[0])}</span>${esc(p.name)}`; tagEl.style.setProperty('--pc', p.color); tagEl.classList.remove('show'); void tagEl.offsetWidth; tagEl.classList.add('show'); };
  const capEl = document.createElement('div'); capEl.className = 'demo-caption'; document.body.appendChild(capEl);
  const caption = txt => { capEl.textContent = txt || ''; capEl.classList.toggle('show', !!txt); };

  // 1. l'accueil, très vite
  await W(1100); await at('[data-act="start"]', 500); await W(120);
  startGame(['Alice', 'Bob'], { spirits: false });
  S.market = ['Loutre', 'Renard', 'Lièvre', 'Cerf', 'Marmotte'].map(id); S.deck = S.deck.filter(x => !S.market.includes(x));
  UI.overlay = null; render({ animate: false }); tag(S.players[0]); Scene.focus(0, { dur: 800, keepAngle: false }); await W(850);

  // 2. le duel
  // avance d'une île de plusieurs tours (appliqué au moment où la caméra y arrive)
  const pending = {};
  const advance = pi => {
    const adv = pending[pi]; if (!adv) return false; delete pending[pi];
    const p = S.players[pi];
    for (const [k, col] of adv.moves) if (H.canPlace(p.board[k], col)) p.board[k].stack.push(col);
    for (const n of adv.cards) {
      const cid = id(n); if (p.cards.length >= 4) continue; S.market = S.market.filter(x => x !== cid); S.deck = S.deck.filter(x => x !== cid);
      p.cards.push({ id: cid, placed: 0 }); const cur0 = S.current; S.current = pi; const tg = H.cardTargets(p.board, cid); if (tg.length) H.placeCube(S, p.cards.length - 1, tg[0]); S.current = cur0;
    }
    p.turns += adv.turns; while (S.market.length < 5 && S.deck.length) S.market.push(S.deck.shift());
    caption(adv.label); return true;
  };
  // même passage d'une île à l'autre qu'entre deux tours
  const goTo = async (pi, hold = 0) => {
    S.current = pi; S.tookSlot = false; S.tookCard = false; S.hand = []; UI.viewIdx = pi; UI.cubeCard = null;
    const adv = advance(pi); render({ animate: adv }); tag(S.players[pi]); Scene.focus(pi, { dur: 1050, keepAngle: false }); Sound.whoosh(); await W(1150 + hold);
    if (adv) caption(null);
  };
  const playTurn = async step => {
    if (S.current !== step.p || pending[step.p]) await goTo(step.p, pending[step.p] ? 200 : 0);
    cur.style.opacity = '1';
    S.slots[2] = step.m.map(m => m[1]);
    await at('.nest[data-i="2"]', 300); takeSlot(2); await W(150);
    for (const [k] of step.m) { UI.sel = 0; render(); await cell(step.p, k); placeToken(k); await W(120); }
    if (step.card) {
      const mi = S.market.indexOf(id(step.card));
      if (mi >= 0) { await at(`[data-act="take"][data-i="${mi}"]`, 300); takeCard(mi); await W(320); }
      const p = me(), ci = p.cards.findIndex(c => c.id === id(step.card)), tg = ci >= 0 ? H.cardTargets(p.board, p.cards[ci].id) : [];
      if (tg.length) {
        UI.cubeCard = ci; render(); await cell(step.p, tg[0], 280); placeCube(tg[0]);
        cur.style.opacity = '0'; Scene.zoomTo(step.p, tg[0], { dur: 400 }); await W(820); Scene.focus(step.p, { dur: 340 }); await W(360); cur.style.opacity = '1';
      }
    }
    document.querySelectorAll('.toast').forEach(e => e.remove());
    me().turns++; for (let i = 0; i < 5; i++) if (!S.slots[i].length) S.slots[i] = S.bag.splice(0, 3); while (S.market.length < 5 && S.deck.length) S.market.push(S.deck.shift());
  };
  const later = n => lang === 'en' ? `${n} turns later…` : `${n} tours plus tard…`;

  // manche 1
  await playTurn({ p: 0, m: [['0,1', 'blue'], ['1,1', 'blue'], ['0,0', 'green']], card: 'Loutre' });
  await playTurn({ p: 1, m: [['0,3', 'brown'], ['0,3', 'red'], ['1,3', 'green']], card: 'Renard' });
  // quatre tours plus tard
  pending[0] = { label: later(4), turns: 4, cards: ['Bouquetin', 'Castor'], moves: [['3,-1', 'gray'], ['3,-1', 'gray'], ['4,-1', 'gray'], ['2,1', 'blue'], ['2,2', 'blue'], ['3,2', 'blue'], ['4,-2', 'gray'], ['4,-2', 'gray'], ['4,-2', 'gray'], ['3,0', 'brown'], ['3,0', 'green'], ['2,0', 'green']] };
  pending[1] = { label: later(4), turns: 4, cards: ['Mulot'], moves: [['4,0', 'brown'], ['4,0', 'green'], ['4,1', 'yellow'], ['2,-1', 'brown'], ['2,-1', 'brown'], ['2,-1', 'green'], ['0,1', 'blue'], ['1,1', 'blue'], ['0,2', 'yellow'], ['3,-1', 'gray'], ['3,-1', 'gray'], ['4,-1', 'gray']] };
  // manche 2
  await playTurn({ p: 0, m: [['4,0', 'yellow'], ['4,1', 'yellow'], ['1,3', 'green']], card: 'Lièvre' });
  await playTurn({ p: 1, m: [['3,1', 'yellow'], ['1,2', 'brown'], ['1,2', 'green']], card: 'Cerf' });
  // trois tours plus tard : les deux îles presque terminées
  pending[0] = { label: later(3), turns: 3, cards: [], moves: [['0,3', 'yellow'], ['0,4', 'yellow'], ['1,2', 'brown'], ['1,2', 'green'], ['1,0', 'brown'], ['1,0', 'green'], ['2,3', 'brown'], ['2,3', 'red'], ['4,2', 'gray']] };
  pending[1] = { label: later(3), turns: 3, cards: ['Hérisson'], moves: [['2,1', 'blue'], ['2,2', 'blue'], ['2,0', 'green'], ['0,4', 'yellow'], ['1,0', 'brown'], ['1,0', 'green'], ['2,3', 'brown'], ['2,3', 'red'], ['3,2', 'blue']] };
  cur.style.opacity = '0';
  await goTo(0, 400); await goTo(1, 400);
  Scene.overview(1000); await W(1050);

  // 3. les deux îles, puis le message de fin
  cur.style.opacity = '0'; tagEl.remove(); capEl.remove(); hud.style.transition = 'opacity .6s'; hud.style.opacity = '0';
  Scene.autoRotate(true); await W(600);
  window.__outroT = performance.now(); // la vidéo insère ici le segment téléphone
  const outro = document.createElement('div'); outro.className = 'demo-outro'; document.body.appendChild(outro);
  const lines = DEMO_TXT[lang].slice(/phone/.test(location.search) ? 1 : 0);
  for (const [line, sub] of lines) { const ms = 3800; outro.innerHTML = `<div class="demo-line" style="animation-duration:${ms}ms">${line}</div>${sub ? `<div class="demo-url" style="animation:dline ${ms}ms ease both">${sub}</div>` : ''}`; await W(ms); }
  outro.innerHTML = '<div class="demo-line big">Verdance</div><div class="demo-url">mariusfaitducode.github.io/verdance</div>'; await W(2600);
  window.__demoDone = true;
}
if (MODE.demo) runDemo();

window.__H = { get S() { return S; }, UI, render, startGame, takeSlot, placeToken, takeCard, placeCube, endTurn, syncScene };
})();
