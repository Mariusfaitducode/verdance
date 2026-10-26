/* Verdance — règles du jeu (sans aucun affichage).
   Toutes les actions modifient l'état S passé en paramètre. Réutilisable côté serveur. */
(function (root) {
'use strict';

const COLORS = ['blue', 'gray', 'brown', 'green', 'yellow', 'red'];
const COLOR_FR = { blue: 'eau', gray: 'montagne', brown: 'tronc', green: 'feuillage', yellow: 'champ', red: 'bâtiment' };
const BAG_COUNTS = { blue: 23, gray: 23, brown: 21, green: 19, yellow: 19, red: 15 };
const PLAYER_COLORS = ['#2f6f62', '#c0573f', '#5b5ea6', '#b08a2e'];

// Exigences d'une case de motif
const REQ = {
  W:  { label: 'Eau', color: 'blue', stack: ['blue'] },
  F:  { label: 'Champ', color: 'yellow', stack: ['yellow'] },
  M1: { label: 'Montagne 1', color: 'gray', stack: ['gray'] },
  M2: { label: 'Montagne 2', color: 'gray', stack: ['gray', 'gray'] },
  M3: { label: 'Montagne 3', color: 'gray', stack: ['gray', 'gray', 'gray'] },
  T1: { label: 'Buisson', color: 'green', stack: ['green'] },
  T2: { label: 'Arbre 2', color: 'green', stack: ['brown', 'green'] },
  T3: { label: 'Arbre 3', color: 'green', stack: ['brown', 'brown', 'green'] },
  B:  { label: 'Bâtiment', color: 'red', stack: ['brown', 'red'] },
};

// Directions axiales (hexagones à sommet plat)
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

// 32 cartes Animal originales.
// La 1re case porte le cube. n cubes posés = n-ième valeur.
const CARDS = [
  ['Fennec', [3, 7, 12], [['F', 0, 0], ['M1', 1, 0]]],
  ['Lapin', [2, 5, 9, 14], [['F', 0, 0], ['F', 0, -1]]],
  ['Abeille', [4, 9, 15], [['F', 0, 0], ['T1', 1, 0], ['T1', -1, 1]]],
  ['Perdrix', [5, 11], [['F', 0, 0], ['B', 0, -1], ['W', 0, 1]]],
  ['Hamster', [3, 7, 12], [['F', 0, 0], ['B', 1, -1]]],
  ['Alouette', [4, 9], [['F', 0, 0], ['F', 0, 1], ['F', 0, 2]]],
  ['Coccinelle', [3, 8, 13], [['F', 0, 0], ['T2', 1, 0]]],
  ['Loutre', [3, 7, 12], [['W', 0, 0], ['W', 1, 0], ['T1', 0, -1]]],
  ['Héron', [5, 11], [['W', 0, 0], ['F', 0, 1], ['F', 0, -1]]],
  ['Grenouille', [2, 5, 9, 14], [['W', 0, 0], ['T1', 1, 0]]],
  ['Castor', [4, 9, 15], [['W', 0, 0], ['T2', 1, -1], ['W', 0, 1]]],
  ['Martin-pêcheur', [5, 12], [['W', 0, 0], ['T3', 0, -1]]],
  ['Canard', [3, 7, 12], [['W', 0, 0], ['F', 1, 0]]],
  ['Flamant', [4, 9, 15], [['W', 0, 0], ['W', 1, 0], ['W', 0, 1]]],
  ['Bouquetin', [4, 10, 17], [['M2', 0, 0], ['M1', 1, 0]]],
  ['Aigle', [6, 14], [['M3', 0, 0], ['M2', 0, 1]]],
  ['Marmotte', [3, 7, 12], [['M1', 0, 0], ['F', 1, 0]]],
  ['Chamois', [5, 11], [['M2', 0, 0], ['M2', 1, -1]]],
  ['Chauve-souris', [4, 9, 15], [['M2', 0, 0], ['B', 1, 0]]],
  ['Ours', [5, 11, 18], [['M2', 0, 0], ['T3', 1, 0]]],
  ['Écureuil', [3, 7, 12], [['T2', 0, 0], ['T2', 1, 0]]],
  ['Chouette', [5, 12], [['T3', 0, 0], ['B', 0, 1]]],
  ['Cerf', [4, 9, 15], [['T2', 0, 0], ['F', 0, 1], ['F', 1, 0]]],
  ['Hérisson', [2, 5, 9, 14], [['T1', 0, 0], ['F', 1, 0]]],
  ['Pic-vert', [6, 14], [['T3', 0, 0], ['T3', 1, -1]]],
  ['Sanglier', [3, 8, 13], [['T2', 0, 0], ['M1', 1, 0]]],
  ['Loup', [5, 11, 18], [['T3', 0, 0], ['M2', 0, 1], ['T2', 0, -1]]],
  ['Souris', [4, 9, 15], [['B', 0, 0], ['F', 0, -1], ['F', 0, 1]]],
  ['Renard', [3, 7, 12], [['B', 0, 0], ['T1', 1, 0]]],
  ['Hirondelle', [4, 9, 15], [['B', 0, 0], ['B', 1, 0]]],
  ['Raton laveur', [4, 10], [['B', 0, 0], ['W', 0, 1], ['T2', 0, -1]]],
  ['Cigogne', [5, 11], [['B', 0, 0], ['W', 1, 0], ['W', 1, -1]]],
].map(([name, pts, cells], id) => ({ id, name, pts, cells, color: REQ[cells[0][0]].color }));

// Esprits du paysage : objectifs secrets de fin de partie (un par joueur, choisi parmi 2).
// cells / animal servent à leur illustration.
const isTree = (b, k) => { const s = b[k].stack; return s.length > 0 && s[s.length - 1] === 'green'; };
const isBuilding = (b, k) => b[k].stack.length === 2 && b[k].stack[1] === 'red';
const isWater = (b, k) => b[k].stack.length === 1 && b[k].stack[0] === 'blue';
const isField = (b, k) => b[k].stack.length === 1 && b[k].stack[0] === 'yellow';
const countCells = (b, f) => Object.keys(b).filter(k => f(k)).length;
const SPIRITS = [
  { name: 'Esprit des Sources', color: 'blue', text: '4 pts par case d’eau qui touche une forêt', cells: [['W', 0, 0], ['T2', 1, -1], ['W', 0, 1]],
    score: p => 4 * countCells(p.board, k => isWater(p.board, k) && neighborsK(k).some(n => isTree(p.board, n))) },
  { name: 'Esprit des Cimes', color: 'gray', text: '6 pts par montagne de 3 jetons', cells: [['M3', 0, 0], ['M2', 1, 0], ['M1', 0, 1]],
    score: p => 6 * countCells(p.board, k => p.board[k].stack.length === 3 && isMountain(p.board, k)) },
  { name: 'Esprit des Moissons', color: 'yellow', text: '3 pts par champ qui touche une maison', cells: [['F', 0, 0], ['B', 1, 0], ['F', 0, 1]],
    score: p => 3 * countCells(p.board, k => isField(p.board, k) && neighborsK(k).some(n => isBuilding(p.board, n))) },
  { name: 'Esprit des Bois profonds', color: 'green', text: '3 pts par arbre qui touche au moins 2 autres arbres', cells: [['T3', 0, 0], ['T2', 1, 0], ['T2', 0, 1]],
    score: p => 3 * countCells(p.board, k => isTree(p.board, k) && neighborsK(k).filter(n => isTree(p.board, n)).length >= 2) },
  { name: 'Esprit du Hameau', color: 'red', text: '4 pts par bâtiment qui touche un autre bâtiment', cells: [['B', 0, 0], ['B', 1, 0], ['T1', 0, 1]],
    score: p => 4 * countCells(p.board, k => isBuilding(p.board, k) && neighborsK(k).some(n => isBuilding(p.board, n))) },
  { name: 'Esprit de l’Équilibre', color: 'brown', text: '5 pts par série complète des 5 paysages (eau, montagne, arbre, champ, bâtiment)', cells: [['W', 0, 0], ['M2', 1, -1], ['T2', 1, 0], ['F', 0, 1], ['B', -1, 1]],
    score: p => { const b = p.board; return 5 * Math.min(countCells(b, k => isWater(b, k)), countCells(b, k => isMountain(b, k)), countCells(b, k => isTree(b, k)), countCells(b, k => isField(b, k)), countCells(b, k => isBuilding(b, k))); } },
  { name: 'Esprit des Rives', color: 'blue', text: '2 pts par case hors de l’eau qui borde ta plus longue rivière', cells: [['W', 0, 0], ['W', 1, 0], ['F', 0, 1], ['T1', 1, -1]],
    score: p => { const lr = new Set(longestRiver(p.board).path); const near = new Set(); lr.forEach(k => neighborsK(k).forEach(n => { if (!lr.has(n) && p.board[n].stack.length && !isWater(p.board, n)) near.add(n); })); return 2 * near.size; } },
  { name: 'Esprit des Bêtes', color: 'orange', text: '2 pts par animal accueilli', cells: [['T2', 0, 0], ['F', 1, 0], ['W', 0, 1]],
    score: p => 2 * cubesPlaced(p) },
];

// Plateau face A : 23 cases, 5 colonnes de 5/4/5/4/5 (colonnes impaires décalées vers le bas)
const BOARD_CELLS = (() => {
  const out = [];
  for (let c = 0; c < 5; c++) {
    const n = c % 2 ? 4 : 5;
    for (let r = 0; r < n; r++) out.push({ col: c, row: r, q: c, r: r - (c - (c & 1)) / 2, k: c + ',' + (r - (c - (c & 1)) / 2) });
  }
  return out;
})();
const key = (q, r) => q + ',' + r;
const CELL_BY_KEY = Object.fromEntries(BOARD_CELLS.map(c => [c.k, c]));
const neighbors = (q, r) => DIRS.map(([dq, dr]) => key(q + dq, r + dr)).filter(k => CELL_BY_KEY[k]);
const neighborsK = k => { const c = CELL_BY_KEY[k]; return neighbors(c.q, c.r); };

const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clone = o => JSON.parse(JSON.stringify(o));

function newState(names, opts = {}) {
  const bag = []; for (const c of COLORS) for (let i = 0; i < BAG_COUNTS[c]; i++) bag.push(c); shuffle(bag);
  const deck = shuffle(CARDS.map(c => c.id));
  const st = {
    players: names.map((name, i) => ({ name, color: PLAYER_COLORS[i], board: Object.fromEntries(BOARD_CELLS.map(c => [c.k, { stack: [], cube: null }])), cards: [], done: [], turns: 0 })),
    current: 0, bag, deck, market: deck.splice(0, 5),
    slots: Array.from({ length: 5 }, () => bag.splice(0, 3)),
    hand: [], tookSlot: false, tookCard: false, endTriggered: false, over: false, freePlay: false, spirits: !!opts.spirits,
  };
  if (opts.spirits) { const sp = shuffle(SPIRITS.map((_, i) => i)); st.players.forEach((p, i) => { p.spiritChoice = sp.slice(i * 2, i * 2 + 2); p.spirit = null; }); }
  return st;
}
function chooseSpirit(S, pi, idx) { const p = S.players[pi]; if (!p.spiritChoice || p.spirit != null) return false; p.spirit = p.spiritChoice[idx]; return true; }
// Continuer après la fin : on ignore les conditions de fin, la partie ne s'arrête plus que quand il n'y a plus rien à prendre.
const tokensLeft = S => S.slots.some(s => s.length);
function continueGame(S) {
  if (!tokensLeft(S)) return false;
  if (S.over) { S.over = false; S.current = (S.current + 1) % S.players.length; S.tookSlot = false; S.tookCard = false; S.hand = []; }
  S.freePlay = true; S.endTriggered = false; return true;
}
function finishNow(S) { S.over = true; S.hand = []; }

/* ---------- Placement ---------- */
function canPlace(cell, color) {
  if (cell.cube) return false;
  const s = cell.stack, h = s.length, top = s[h - 1];
  if (h === 0) return true;
  if (color === 'gray') return h < 3 && s.every(t => t === 'gray');
  if (color === 'brown') return h === 1 && top === 'brown';
  if (color === 'green') return (h === 1 || h === 2) && s.every(t => t === 'brown');
  if (color === 'red') return h === 1 && (top === 'brown' || top === 'gray' || top === 'red');
  return false;
}
function matches(cell, req) {
  const s = cell.stack;
  if (req === 'B') return s.length === 2 && s[1] === 'red';
  const want = REQ[req].stack;
  return s.length === want.length && s.every((t, i) => t === want[i]);
}
const rot = ([q, r]) => [-r, q + r];
// Cases où le cube de la carte peut être posé (motif réalisé, 6 orientations)
function cardTargets(board, cardId) {
  const card = CARDS[cardId]; const targets = new Set();
  let cells = card.cells.map(([req, q, r]) => ({ req, q, r }));
  for (let k = 0; k < 6; k++) {
    for (const a of BOARD_CELLS) {
      if (board[a.k].cube) continue;
      let ok = true;
      for (const c of cells) { const cell = board[key(a.q + c.q, a.r + c.r)]; if (!cell || !matches(cell, c.req)) { ok = false; break; } }
      if (ok) targets.add(a.k);
    }
    cells = cells.map(c => { const [q, r] = rot([c.q, c.r]); return { req: c.req, q, r }; });
  }
  return [...targets];
}
// Cases qui forment le motif autour d'une cible donnée (pour l'éclairage du motif)
function patternCellsAt(board, cardId, targetK) {
  const card = CARDS[cardId]; const t = CELL_BY_KEY[targetK];
  let cells = card.cells.map(([req, q, r]) => ({ req, q, r }));
  for (let k = 0; k < 6; k++) {
    const ks = cells.map(c => key(t.q + c.q, t.r + c.r));
    if (cells.every((c, i) => board[ks[i]] && matches(board[ks[i]], c.req))) return ks;
    cells = cells.map(c => { const [q, r] = rot([c.q, c.r]); return { req: c.req, q, r }; });
  }
  return [targetK];
}

/* ---------- Décompte ---------- */
const RIVER = [0, 0, 2, 5, 8, 11, 15];
const riverPoints = n => n <= 6 ? RIVER[n] : 15 + 4 * (n - 6);
const isMountain = (b, k) => b[k].stack.length > 0 && b[k].stack.every(t => t === 'gray');
const topOf = (b, k) => { const s = b[k].stack; return s[s.length - 1]; };
function components(b, color) {
  const seen = new Set(), out = [];
  const ok = k => b[k].stack.length === 1 && b[k].stack[0] === color;
  for (const c of BOARD_CELLS) {
    if (seen.has(c.k) || !ok(c.k)) continue;
    const comp = [], st = [c.k]; seen.add(c.k);
    while (st.length) { const x = st.pop(); comp.push(x); for (const n of neighborsK(x)) if (!seen.has(n) && ok(n)) { seen.add(n); st.push(n); } }
    out.push(comp);
  }
  return out;
}
function longestRiver(b) {
  let best = 0, bestPath = [];
  for (const comp of components(b, 'blue')) {
    const set = new Set(comp);
    for (const start of comp) {
      const dist = { [start]: 1 }, prev = {}; const q = [start];
      while (q.length) { const x = q.shift(); for (const n of neighborsK(x)) if (set.has(n) && !dist[n]) { dist[n] = dist[x] + 1; prev[n] = x; q.push(n); } }
      for (const [k, d] of Object.entries(dist)) if (d > best) { best = d; bestPath = [k]; let p = k; while (prev[p]) { p = prev[p]; bestPath.push(p); } }
    }
  }
  return { length: best, path: bestPath };
}
// Points de paysage rapportés par chaque case (pour les étiquettes et les animations)
function cellPoints(b, k) {
  const s = b[k].stack, h = s.length; if (!h) return 0;
  if (s[h - 1] === 'green') return [0, 1, 3, 7][h];
  if (isMountain(b, k)) return neighborsK(k).some(n => isMountain(b, n)) ? [0, 1, 3, 7][h] : 0;
  if (h === 2 && s[1] === 'red') return new Set(neighborsK(k).map(n => topOf(b, n)).filter(Boolean)).size >= 3 ? 5 : 0;
  return 0;
}
function score(p) {
  const b = p.board; const res = { trees: 0, mountains: 0, fields: 0, buildings: 0, water: 0, animals: 0 };
  for (const c of BOARD_CELLS) {
    const s = b[c.k].stack, h = s.length; if (!h) continue;
    const pts = cellPoints(b, c.k);
    if (s[h - 1] === 'green') res.trees += pts;
    else if (isMountain(b, c.k)) res.mountains += pts;
    else if (h === 2 && s[1] === 'red') res.buildings += pts;
  }
  res.fields = components(b, 'yellow').filter(c => c.length >= 2).length * 5;
  res.water = riverPoints(longestRiver(b).length);
  for (const c of [...p.cards, ...p.done]) if (c.placed > 0) res.animals += CARDS[c.id].pts[c.placed - 1];
  res.spirit = p.spirit != null && SPIRITS[p.spirit] ? SPIRITS[p.spirit].score(p) : 0;
  res.landscape = res.trees + res.mountains + res.fields + res.buildings + res.water;
  res.total = res.landscape + res.animals + res.spirit;
  return res;
}
const cubesPlaced = p => [...p.cards, ...p.done].reduce((a, c) => a + c.placed, 0);
const emptyCells = p => Object.values(p.board).filter(c => !c.stack.length).length;
const me = S => S.players[S.current];
const handStuck = S => S.hand.length > 0 && S.hand.every(c => !Object.values(me(S).board).some(x => canPlace(x, c)));

/* ---------- Actions ---------- */
function takeSlot(S, i) {
  if (S.tookSlot || !S.slots[i] || !S.slots[i].length) return false;
  S.hand = S.slots[i]; S.slots[i] = []; S.tookSlot = true; return true;
}
function placeToken(S, hi, k) {
  const color = S.hand[hi]; const cell = me(S).board[k];
  if (!color || !cell || !canPlace(cell, color)) return false;
  cell.stack.push(color); S.hand.splice(hi, 1); return true;
}
function takeCard(S, i) {
  if (S.tookCard || me(S).cards.length >= 4 || S.market[i] === undefined) return false;
  const id = S.market.splice(i, 1)[0]; me(S).cards.push({ id, placed: 0 }); S.tookCard = true; return true;
}
function placeCube(S, ci, k) {
  const p = me(S), c = p.cards[ci]; if (!c) return null;
  if (!cardTargets(p.board, c.id).includes(k)) return null;
  const card = CARDS[c.id];
  p.board[k].cube = { card: c.id, color: card.color };
  c.placed++;
  const completed = c.placed >= card.pts.length;
  if (completed) { p.cards.splice(ci, 1); p.done.push(c); }
  return { card, completed, points: card.pts[c.placed - 1] };
}
function canEndTurn(S) { return S.tookSlot && (!S.hand.length || handStuck(S)) && !S.over; }
function endTurn(S) {
  if (!canEndTurn(S)) return null;
  const p = me(S); S.hand = []; p.turns++;
  for (let i = 0; i < 5; i++) {
    if (!S.slots[i].length) {
      if (S.bag.length < 3) { S.slots[i] = S.bag.splice(0); S.endTriggered = true; }
      else S.slots[i] = S.bag.splice(0, 3);
    }
  }
  while (S.market.length < 5 && S.deck.length) S.market.push(S.deck.shift());
  if (emptyCells(p) <= 2 && !S.freePlay) S.endTriggered = true;
  const next = (S.current + 1) % S.players.length;
  if (!tokensLeft(S)) { S.over = true; return { over: true, exhausted: true }; }
  if (S.endTriggered && !S.freePlay && next === 0) { S.over = true; return { over: true }; }
  S.current = next; S.tookSlot = false; S.tookCard = false;
  return { over: false, next };
}
function ranking(S) {
  const rows = S.players.map((p, i) => ({ i, p, sc: score(p), cubes: cubesPlaced(p) }));
  return rows.sort((a, b) => b.sc.total - a.sc.total || b.cubes - a.cubes);
}

root.H = {
  SPIRITS, chooseSpirit, continueGame, finishNow, tokensLeft,
  COLORS, COLOR_FR, BAG_COUNTS, PLAYER_COLORS, REQ, DIRS, CARDS, BOARD_CELLS, CELL_BY_KEY,
  key, neighbors, neighborsK, shuffle, clone, newState, canPlace, matches, cardTargets, patternCellsAt,
  score, cellPoints, longestRiver, components, isMountain, cubesPlaced, emptyCells, me, handStuck,
  takeSlot, placeToken, takeCard, placeCube, canEndTurn, endTurn, ranking, riverPoints,
};
})(typeof window !== 'undefined' ? window : globalThis);
