/* Verdance mobile — le monde 3D, version téléphone.
   Fork de ../../scene.js : même terrain vivant (relief recalculé par jeton, chaînes de montagnes,
   rivières qui se creusent et coulent jusqu'à la mer, forêts, champs, hameaux, animaux),
   restylé façon « jeu de plateau low-poly » : facettes nettes, couleurs franches, îles posées
   dans un océan avec leur lagon turquoise, bancs de nuages aux bords de la carte.
   Caméra à angle fixe pour le tactile : un doigt glisse, deux doigts pincent, un toucher court joue.
   Ne connaît pas les règles : l'interface lui dit quoi éclairer via sync(state, view). */
(function () {
'use strict';
const Scene = window.Scene = { ready: false };
let THREE, mergeGeometries, GLTFLoader, skClone;
let renderer, scene, camera, clock, raycaster, pointer, sun, hemi, container;
let islands = [], anims = [], particles = [], birds = [], smoke = [];
let cloudBank = null, ocean = null;
let cb = {};
let view = { activeIdx: -1, legal: [], targets: [], patternHi: [], ghostColor: null };
let showTokens = false;
let lastState = null;
let modelsBase = 'models/';
const M = {}, G = {};
let waterUniforms, oceanUniforms;

const SQ3 = Math.sqrt(3), ISLAND_GAP = 16, WATER_Y = -0.1, SEA_Y = -0.2, STEP = 0.22;
const LIFT = 0.15, DROP = 0.75, RIVER_BED = -0.3;
const CELLS = H.BOARD_CELLS.map(c => ({ k: c.k, x: 1.5 * c.col - 3, z: SQ3 * (c.row + 0.5 * (c.col % 2)) - 2 * SQ3 }));
const CI = Object.fromEntries(CELLS.map((c, i) => [c.k, i]));
const PAIRS = []; CELLS.forEach((c, i) => H.neighborsK(c.k).forEach(n => { const j = CI[n]; if (j > i) PAIRS.push([i, j]); }));
const islandPos = i => new THREE.Vector3(i * ISLAND_GAP, 0, 0);
const PEAK = [0, 0.95, 1.95, 3.0];

/* ================= Styles (?style=…) =================
   polytopia : franc, saturé, eau bleu profond — le défaut.
   dore      : lumière de fin d'après-midi, plus douce et chaude.
   brume     : pastel froid, matin nordique (piste perso). */
const STYLES = {
  polytopia: {
    land: {
      sand: '#f3dc95', sand2: '#ead083', meadow: '#3f8f3a', meadow2: '#3a8636', plain: '#efe3bd', plain2: '#e8dbb2',
      forest: '#4a9f3a', forest2: '#43953a', wheat: '#f6c93c', wheat2: '#e7ad2b', lawn: '#88cf52', lawn2: '#7ec64a',
      path: '#ecd193', dirt: '#c08a52', dirt2: '#b07c48', rock: '#8e9fb6', rock2: '#8293ab', rockDark: '#687a94',
      snow: '#f8fbff', foothill: '#7fae5f', bank: '#eed89a', bed: '#4fb8cf', bedDeep: '#2a8cbf',
    },
    leaf: [['#4cbf3a', '#3fae34'], ['#72cf43', '#61c03b'], ['#36a23c', '#2e9339'], ['#93d84a', '#80ca40']],
    pine: ['#23864a', '#2a9553', '#1f7a45', '#33a35e'],
    roofs: ['#e2483a', '#d23c31', '#3a78d0', '#f07f2f', '#e2483a'],
    walls: { brown: ['#f2d3a2', '#e3c08c'], gray: ['#eef0f2', '#d9dde2'], red: ['#f5c7a8', '#e8b292'] },
    ocean: { deep: '#1d5aa6', deep2: '#2d6fbf', shallow: '#3fc7d6', shallow2: '#7be0e2', foam: '#ffffff', glint: .35 },
    river: { shallow: '#5fd0dc', deep: '#1f7fd0' },
    fog: '#5f9fd6', fogNear: 55, fogFar: 140,
    hemi: ['#ffffff', '#4f7090', 2.1], sun: ['#fff8ea', 1.75], sunDir: [-5, 12, 7], fill: ['#d6ebff', 0.35],
    tone: 'none', exposure: 1, cloud: '#ffffff', cloudShade: '#dbe9f7', grid: ['#1f4a2a', .16],
  },
  dore: {
    land: {
      sand: '#f1d49b', sand2: '#e6c486', meadow: '#5f8f3a', meadow2: '#588737', plain: '#f0e0bb', plain2: '#e8d6ae',
      forest: '#5f9c3c', forest2: '#56913a', wheat: '#f2bd48', wheat2: '#e09f34', lawn: '#9dc858', lawn2: '#93be50',
      path: '#e6c690', dirt: '#b98757', dirt2: '#aa7a4e', rock: '#a39a9c', rock2: '#958c90', rockDark: '#7a7179',
      snow: '#fff8ee', foothill: '#97a95c', bank: '#ebd29a', bed: '#5ab3b8', bedDeep: '#2f86a4',
    },
    leaf: [['#7cbd3e', '#6cad37'], ['#a6cc48', '#93bd3f'], ['#5c9f3a', '#4f9134'], ['#c0d452', '#a9c346']],
    pine: ['#3d7f45', '#46904d', '#356f3e', '#4f9a55'],
    roofs: ['#c9553a', '#b8482f', '#5f7fa0', '#d77a3e', '#c9553a'],
    walls: { brown: ['#efcf9f', '#dfbb88'], gray: ['#ece6dc', '#d8d0c3'], red: ['#f2bf9c', '#e4ab86'] },
    ocean: { deep: '#24609a', deep2: '#3577ad', shallow: '#4fc2c4', shallow2: '#8fdcd0', foam: '#fffaf0', glint: .55 },
    river: { shallow: '#6fd0cc', deep: '#2a7fb8' },
    fog: '#e9c99a', fogNear: 50, fogFar: 135,
    hemi: ['#fff1d8', '#6a5a50', 1.75], sun: ['#ffd9a0', 2.3], sunDir: [-8, 9, 6], fill: ['#bcd4ff', 0.45],
    tone: 'aces', exposure: 1.12, cloud: '#fff6ea', cloudShade: '#f0d9c0', grid: ['#4a3a1f', .18],
  },
  brume: {
    land: {
      sand: '#ece3c4', sand2: '#e2d7b4', meadow: '#5f9a6a', meadow2: '#579163', plain: '#f1ead6', plain2: '#e9e1cb',
      forest: '#5a9a6a', forest2: '#529063', wheat: '#eed27a', wheat2: '#ddbd62', lawn: '#a2cf86', lawn2: '#97c67c',
      path: '#e5d6ae', dirt: '#b8977a', dirt2: '#a98a6f', rock: '#a3adc4', rock2: '#96a1ba', rockDark: '#7c88a3',
      snow: '#ffffff', foothill: '#93b48a', bank: '#e8dcb6', bed: '#7cc3cf', bedDeep: '#4b9cba',
    },
    leaf: [['#6fb57c', '#62a872'], ['#93c98a', '#83bd7e'], ['#4f9a6a', '#468e62'], ['#acd496', '#9bc88a']],
    pine: ['#2f7a5e', '#378866', '#296d55', '#41957a'],
    roofs: ['#e07a6a', '#d66b5c', '#6f8fc8', '#f0a06a', '#9b7fc4'],
    walls: { brown: ['#f3e2c6', '#e6d2b2'], gray: ['#f1f3f6', '#dfe3ea'], red: ['#f6d4c4', '#ebc2b0'] },
    ocean: { deep: '#3f6fa8', deep2: '#5584b8', shallow: '#78cfd6', shallow2: '#a8e4e0', foam: '#ffffff', glint: .25 },
    river: { shallow: '#8ad8de', deep: '#4f97c8' },
    fog: '#c9d9ea', fogNear: 35, fogFar: 110,
    hemi: ['#f4f8ff', '#7a8aa0', 2.2], sun: ['#fff4f0', 1.4], sunDir: [-4, 13, 8], fill: ['#ffe6f0', 0.3],
    tone: 'none', exposure: 1, cloud: '#ffffff', cloudShade: '#e2e8f4', grid: ['#2a4a3f', .14],
  },
};
let ST = STYLES.polytopia;

/* ================= Outils ================= */
function rng(seed) { let s = 2166136261; for (const ch of String(seed)) s = Math.imul(s ^ ch.charCodeAt(0), 16777619) >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
const fbm = (x, y) => vnoise(x, y) * .55 + vnoise(x * 2.1 + 5.2, y * 2.1 + 1.3) * .3 + vnoise(x * 4.3 + 9.1, y * 4.3 + 7.7) * .15;
const ridged = (x, y) => { const n = 1 - Math.abs(vnoise(x, y) * 2 - 1); return n * n; };
function segDist(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az; const l = dx * dx + dz * dz; const t = l ? clamp(((px - ax) * dx + (pz - az) * dz) / l) : 0; return [Math.hypot(px - (ax + t * dx), pz - (az + t * dz)), t]; }
const ease = {
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inOutCubic: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  outBack: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outBounce: t => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375; return n * (t -= 2.625 / d) * t + .984375; },
};
function tween(dur, fn, { delay = 0, easing = ease.outCubic, done } = {}) { const a = { t0: performance.now() + delay, dur, fn, easing, done }; anims.push(a); fn(0); return a; }

/* ================= Contour de l'île ================= */
const OUTLINE = (() => {
  const W = 4.95, T = -4.9, SB = 1.0, B = 5.7, rc = 0.9, pts = [];
  const quad = (p0, p1, p2, n) => { for (let i = 1; i <= n; i++) { const t = i / n, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t; pts.push([a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]]); } };
  const line = (p0, p1, n) => { for (let i = 1; i <= n; i++) { const t = i / n; pts.push([p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t]); } };
  pts.push([-W + rc, T]);
  line([-W + rc, T], [W - rc, T], 14); quad([W - rc, T], [W, T], [W, T + rc], 5); line([W, T + rc], [W, SB], 10);
  quad([W, SB], [W, B], [0, B], 18); quad([0, B], [-W, B], [-W, SB], 18); line([-W, SB], [-W, T + rc], 10); quad([-W, T + rc], [-W, T], [-W + rc, T], 5);
  pts.pop(); return pts;
})();
function insideOutline(x, z) { let ins = false; for (let a = 0, b = OUTLINE.length - 1; a < OUTLINE.length; b = a++) { const [xi, zi] = OUTLINE[a], [xj, zj] = OUTLINE[b]; if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) ins = !ins; } return ins; }
function outlineNearest(x, z) { let best = Infinity, bx = 0, bz = 0; for (let a = 0, b = OUTLINE.length - 1; a < OUTLINE.length; b = a++) { const [ax, az] = OUTLINE[b], [cx, cz] = OUTLINE[a]; const dx = cx - ax, dz = cz - az, l = dx * dx + dz * dz; const t = clamp(((x - ax) * dx + (z - az) * dz) / l); const qx = ax + t * dx, qz = az + t * dz; const d = Math.hypot(x - qx, z - qz); if (d < best) { best = d; bx = qx; bz = qz; } } return { d: best, x: bx, z: bz }; }
const signedInside = (x, z) => { const n = outlineNearest(x, z); return insideOutline(x, z) ? n.d : -n.d; };
const nearestCell = (x, z) => { let bi = -1, bd = Infinity; CELLS.forEach((c, i) => { const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; bi = i; } }); return { i: bi, d: bd }; };
function hexDist(dx, dz) { const ax = Math.abs(dx), az = Math.abs(dz); return Math.max(az / (SQ3 / 2), ax + az / SQ3); }
// côte bruitée : la même fonction sert au relief (CPU) et au lagon (texture lue par le shader de l'océan)
const coastSI = (x, z, si) => si + (fbm(x * .9 + 11, z * .9 + 3) - .5) * 0.55 * smooth(1.4, 0.3, si);
const coastBase = s => LIFT * smooth(-0.35, 0.3, s) - DROP * smooth(-0.05, -0.9, s);
// distance (en si bruité) où le rivage croise le niveau de la mer
const COAST0 = (() => { let lo = -1.2, hi = 0.5; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (coastBase(m) > SEA_Y) hi = m; else lo = m; } return (lo + hi) / 2; })();

/* ================= Grille du terrain (commune à toutes les îles) =================
   Le maillage déborde de la côte : la plage plonge sous la mer, le rivage naît de l'intersection. */
const GRID = (() => {
  const pts = [];
  const x0 = -6.5, x1 = 6.5, z0 = -6.4, z1 = 7.2;
  const nx = Math.ceil((x1 - x0) / STEP) + 1, nz = Math.ceil((z1 - z0) / STEP) + 1;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    let x = x0 + i * STEP + (j % 2 ? STEP / 2 : 0), z = z0 + j * STEP * .9;
    x += (hash2(i * 1.7, j * 3.1) - .5) * STEP * .5; z += (hash2(i * 5.3, j * .7) - .5) * STEP * .5;
    const si = signedInside(x, z);
    pts.push({ x, z, ok: si >= -1.25, si });
  }
  const tris = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    const pair = j % 2 ? [[a, c, d], [a, d, b]] : [[a, c, b], [b, c, d]];
    for (const t of pair) {
      if (!t.every(v => pts[v].ok)) continue;
      const P = t.map(v => pts[v]);
      const cr = (P[1].x - P[0].x) * (P[2].z - P[0].z) - (P[2].x - P[0].x) * (P[1].z - P[0].z);
      if (Math.abs(cr) < 1e-5) continue;
      tris.push(...(cr < 0 ? t : [t[0], t[2], t[1]])); // normale vers le haut
    }
  }
  return { pts, tris: new Int32Array(tris) };
})();

/* ================= Lecture du plateau ================= */
function kindOf(stack) {
  const h = stack.length, top = stack[h - 1];
  if (!h) return { kind: 'empty', h: 0 };
  if (top === 'green') return { kind: 'forest', h };
  if (stack.every(t => t === 'gray')) return { kind: 'mountain', h };
  if (top === 'red') return h === 2 ? { kind: 'house', h, base: stack[0] } : { kind: 'foundation', h };
  if (top === 'brown') return { kind: 'clearing', h };
  if (top === 'blue') return { kind: 'water', h };
  if (top === 'yellow') return { kind: 'field', h };
  return { kind: 'empty', h: 0 };
}
function analyse(board, islIdx) {
  const info = CELLS.map(c => kindOf(board[c.k].stack));
  const isW = i => info[i].kind === 'water';
  const built = i => info[i].kind === 'house' || info[i].kind === 'foundation';
  const mtnPairs = PAIRS.filter(([a, b]) => info[a].kind === 'mountain' && info[b].kind === 'mountain');
  const housePairs = PAIRS.filter(([a, b]) => built(a) && built(b));
  // rivières : segments entre cases d'eau voisines, orientés le long de la plus longue rivière
  const lr = H.longestRiver(board); const order = {}; lr.path.slice().reverse().forEach((k, n) => { order[CI[k]] = n; });
  const segs = [];
  for (const [a, b] of PAIRS) if (isW(a) && isW(b)) {
    const fwd = (order[a] ?? 99) <= (order[b] ?? 99); const [p, q] = fwd ? [a, b] : [b, a];
    segs.push({ ax: CELLS[p].x, az: CELLS[p].z, bx: CELLS[q].x, bz: CELLS[q].z });
  }
  const pools = info.map((f, i) => f.kind === 'water' ? i : -1).filter(i => i >= 0);
  // embouchure : une extrémité de rivière au bord du plateau se jette dans la mer
  const mouths = [];
  const ends = lr.length >= 2 ? [CI[lr.path[0]], CI[lr.path[lr.path.length - 1]]] : [];
  for (const i of ends) {
    if (H.neighborsK(CELLS[i].k).length >= 6 || mouths.length >= 1) continue;
    const c = CELLS[i]; const len = Math.hypot(c.x, c.z - 0.4) || 1; const dx = c.x / len, dz = (c.z - 0.4) / len;
    const o = outlineNearest(c.x + dx * 1.6, c.z + dz * 1.6);
    if (Math.hypot(o.x - c.x, o.z - c.z) > 2.5) continue;
    const ux = o.x - c.x, uz = o.z - c.z, L = Math.hypot(ux, uz) || 1;
    segs.push({ ax: c.x, az: c.z, bx: o.x + ux / L * 1.1, bz: o.z + uz / L * 1.1, mouth: true });
    mouths.push({ x: o.x, z: o.z });
  }
  return { info, mtnPairs, housePairs, segs, pools, mouths, fieldAngle: 0.5 + islIdx * 0.9 };
}

/* ================= Relief ================= */
function carveAt(A, x, z) {
  let dw = Infinity;
  for (const s of A.segs) dw = Math.min(dw, segDist(x, z, s.ax, s.az, s.bx, s.bz)[0] - (s.mouth ? 0.04 : 0));
  for (const i of A.pools) dw = Math.min(dw, Math.hypot(x - CELLS[i].x, z - CELLS[i].z) - 0.12);
  if (dw === Infinity) return 0;
  return smooth(0.58, 0.22, dw + (fbm(x * 2.2, z * 2.2) - .5) * 0.16);
}
function heightAt(A, x, z, si) {
  if (si === undefined) si = signedInside(x, z);
  let y = (fbm(x * .8 + 3, z * .8) - .5) * 0.07, mtn = 0;
  if (si > -0.2) {
    const info = A.info;
    for (let i = 0; i < CELLS.length; i++) {
      const f = info[i]; if (f.kind === 'empty') continue;
      const c = CELLS[i]; const d = Math.hypot(x - c.x, z - c.z); if (d > 1.9) continue;
      const w = smooth(1.0, 0.5, d);
      if (f.kind === 'mountain') {
        const r = 1.05 + 0.14 * f.h, ff = Math.max(0, 1 - d / r);
        let hm = PEAK[f.h] * Math.pow(ff, 1.25) * (0.82 + 0.36 * fbm(x * 1.7 + i, z * 1.7));
        hm += ridged(x * 2.6 + i, z * 2.6) * 0.22 * f.h * ff;
        mtn = Math.max(mtn, hm);
      } else if (f.kind === 'forest') y += 0.07 * w * (0.5 + fbm(x * 3, z * 3));
      else if (f.kind === 'field') y = y * (1 - w) + 0.01 * w;
      else if (f.kind === 'house' || f.kind === 'foundation') y = y * (1 - w * .85) + 0.015 * w * .85;
    }
    for (const [a, b] of A.mtnPairs) {
      const ca = CELLS[a], cb2 = CELLS[b]; const [ds, t] = segDist(x, z, ca.x, ca.z, cb2.x, cb2.z);
      if (ds > 0.95) continue;
      const pa = PEAK[info[a].h], pb = PEAK[info[b].h];
      const hp = (pa + (pb - pa) * t) * (0.58 + 0.12 * Math.sin(t * Math.PI));
      mtn = Math.max(mtn, hp * Math.pow(Math.max(0, 1 - ds / 0.95), 1.4) * (0.8 + 0.4 * fbm(x * 2 + 7, z * 2)));
    }
    y = Math.max(y, mtn);
  }
  y = y * smooth(0, 0.55, si) + coastBase(coastSI(x, z, si));
  const c = carveAt(A, x, z);
  return Math.min(y, y * (1 - c) + RIVER_BED * c);
}
let PAL;
function colorAt(A, x, z, y, ny, faceN, si) {
  const info = A.info; const kw = {}; let nearD = Infinity;
  for (let i = 0; i < CELLS.length; i++) {
    const c = CELLS[i]; const d = Math.hypot(x - c.x, z - c.z); nearD = Math.min(nearD, d); if (d > 1.25) continue;
    const w = smooth(1.02, 0.6, d + (fbm(x * 3.1, z * 3.1) - .5) * 0.28); if (w <= 0) continue;
    const k = info[i].kind; kw[k] = (kw[k] || 0) + w;
  }
  const carve = carveAt(A, x, z);
  const pick = (a, b) => (faceN > .5 ? a : b);
  let dom = null, dw = 0.18; for (const k in kw) if (kw[k] > dw) { dw = kw[k]; dom = k; }
  if (!dom) dom = nearD > 1.0 ? 'rim' : 'empty';
  let col;
  if (carve > 0.55) col = y < -0.2 ? PAL.bedDeep : PAL.bed;
  else if (carve > 0.22) col = PAL.bank;
  else if ((y > 0.42 && (kw.mountain || 0) > 0.05) || y > 0.6) {
    const snowLine = 1.5 + (fbm(x * 1.3, z * 1.3) - .5) * .5;
    if (y > snowLine && ny > 0.4) col = PAL.snow;
    else col = ny < 0.62 ? PAL.rockDark : pick(PAL.rock, PAL.rock2);
  } else if (y < LIFT * 0.62 && si < 0.6 && nearD > 0.95) col = pick(PAL.sand, PAL.sand2);
  else {
    switch (dom) {
      case 'forest': col = pick(PAL.forest, PAL.forest2); break;
      case 'field': { const a = A.fieldAngle; const u = x * Math.cos(a) + z * Math.sin(a); col = Math.sin(u * 11) > 0 ? PAL.wheat : PAL.wheat2; break; }
      case 'house': case 'foundation': {
        let onPath = false; for (const [a, b] of A.housePairs) if (segDist(x, z, CELLS[a].x, CELLS[a].z, CELLS[b].x, CELLS[b].z)[0] < 0.14) onPath = true;
        col = onPath ? PAL.path : pick(PAL.lawn, PAL.lawn2); break;
      }
      case 'clearing': col = pick(PAL.dirt, PAL.dirt2); break;
      case 'mountain': col = PAL.foothill; break;
      case 'water': col = PAL.bank; break;
      case 'empty': col = pick(PAL.plain, PAL.plain2); break;
      default: col = pick(PAL.meadow, PAL.meadow2);
    }
  }
  return col.clone().multiplyScalar(1 + (faceN - .5) * 0.07);
}

/* ================= Initialisation ================= */
// opts : { onReady, onError, onCellClick(pi, k), style, modelsBase }
Scene.init = async function (el, opts) {
  cb = opts || {};
  container = el;
  const qs = new URLSearchParams(location.search).get('style');
  const sname = STYLES[cb.style] ? cb.style : STYLES[qs] ? qs : 'polytopia';
  ST = STYLES[sname]; Scene.style = sname;
  if (cb.modelsBase) modelsBase = cb.modelsBase;
  try {
    THREE = await import('three');
    ({ mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js'));
  } catch (e) { cb.onError && cb.onError(e); return; }
  try { ({ GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js')); ({ clone: skClone } = await import('three/addons/utils/SkeletonUtils.js')); } catch (e) { GLTFLoader = null; }
  const C = hex => new THREE.Color(hex);
  PAL = {}; for (const k in ST.land) PAL[k] = C(ST.land[k]);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(el.clientWidth, el.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = ST.tone === 'aces' ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  renderer.toneMappingExposure = ST.exposure;
  renderer.domElement.style.touchAction = 'none';
  renderer.domElement.style.display = 'block';
  el.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = C(ST.fog);
  scene.fog = new THREE.Fog(ST.fog, ST.fogNear, ST.fogFar);
  camera = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 1, 400);

  hemi = new THREE.HemisphereLight(ST.hemi[0], ST.hemi[1], ST.hemi[2]); scene.add(hemi);
  sun = new THREE.DirectionalLight(ST.sun[0], ST.sun[1]);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera; sc.left = -8; sc.right = 8; sc.top = 8; sc.bottom = -8; sc.near = 1; sc.far = 50;
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target);
  const fill = new THREE.DirectionalLight(ST.fill[0], ST.fill[1]); fill.position.set(8, 5, -6); scene.add(fill);

  buildShared();
  buildOcean();
  buildBirds();
  raycaster = new THREE.Raycaster(); pointer = new THREE.Vector2();
  clock = new THREE.Clock();
  bindPointer();
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(el);
  document.addEventListener('visibilitychange', () => {
    if (!renderer) return;
    if (document.hidden) renderer.setAnimationLoop(null);
    else { clock.getDelta(); renderer.setAnimationLoop(loop); }
  });
  resize();
  Scene.ready = true;
  renderer.setAnimationLoop(loop);
  cb.onReady && cb.onReady();
};
Scene.styles = Object.keys(STYLES);
Scene._debug = () => ({ THREE, scene, camera, renderer, islands, cur, goal, M });

/* ================= Géométries et matériaux ================= */
function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo; g.deleteAttribute('uv'); g.deleteAttribute('normal');
  const c = typeof hex === 'string' ? new THREE.Color(hex) : hex; const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
function jitter(g, amt, seed) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); p.setXYZ(i, x + (hash2(x * 31.7 + seed, y * 17.3 + z * 13.1) - .5) * amt, y + (hash2(z * 23.1 + seed, x * 7.7 + y) - .5) * amt * .7, z + (hash2(y * 11 + seed, z * 3 + x) - .5) * amt); } return g; }
function merge(list) { const g = mergeGeometries(list); g.computeVertexNormals(); return g; }
const NOISE_GLSL = `
  float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
    return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x), u.y); }`;
function buildShared() {
  M.props = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  M.terrain = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  M.window = new THREE.MeshLambertMaterial({ color: '#ffe08a', emissive: '#ffb347', emissiveIntensity: .6, flatShading: true });
  M.cube = new THREE.MeshLambertMaterial({ color: '#ff9a2e', emissive: '#ff8a1a', emissiveIntensity: .2 });
  M.cubeGhost = new THREE.MeshLambertMaterial({ color: '#ffb347', emissive: '#ff9a1a', emissiveIntensity: .5, transparent: true, opacity: .9 });
  M.gridLight = new THREE.MeshBasicMaterial({ color: '#fffbea', transparent: true, opacity: .62, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, fog: false });
  M.grid = new THREE.MeshBasicMaterial({ color: ST.grid[0], transparent: true, opacity: ST.grid[1] * 2, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false });
  // surbrillances : fond léger, contour épais qui pulse, voile lumineux vertical (lisible au doigt)
  const flat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: false });
  const veil = c => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(c) }, uOpacity: { value: .6 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `attribute float v; varying float vV; void main(){ vV=v; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying float vV; void main(){ float a=pow(1.-vV,1.6)*uOpacity; gl_FragColor=vec4(uColor,a);
      #include <colorspace_fragment>
    }`,
  });
  M.hl = {
    legal: { fill: flat('#ffffff', .2), edge: flat('#ffffff', .95), veil: veil('#ffffff') },
    target: { fill: flat('#ffd24a', .25), edge: flat('#ffe27a', .95), veil: veil('#ffc93a') },
    pattern: { fill: flat('#fff2a8', .32), edge: flat('#fff6c8', .7), veil: null },
  };
  // liseré sombre autour du contour blanc : il ressort aussi sur les cases claires
  M.hlShadow = flat('#123524', .45);
  M.smoke = new THREE.MeshLambertMaterial({ color: '#f6f6f2', transparent: true, opacity: .7, flatShading: true, depthWrite: false });
  M.cloud = new THREE.MeshLambertMaterial({ color: ST.cloud, emissive: ST.cloudShade, emissiveIntensity: .3, flatShading: true });
  const tokCol = { blue: '#2f8fd8', gray: '#9aa6b5', brown: '#9a6238', green: '#46b04a', yellow: '#f5c63c', red: '#e0483a' };
  M.tok = {};
  for (const k in tokCol) M.tok[k] = new THREE.MeshLambertMaterial({ color: tokCol[k] });
  const e = 0.03, R = 0.3, Hh = 0.1, prof = [[0, 0], [R - e, 0], [R, e], [R, Hh - e], [R - e, Hh], [0, Hh]];
  G.token = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 12);
  G.cube = new THREE.BoxGeometry(0.24, 0.24, 0.24);
  G.spark = new THREE.OctahedronGeometry(0.06, 0);
  G.blob = new THREE.IcosahedronGeometry(1, 0);
  G.puff = new THREE.IcosahedronGeometry(1, 1);

  waterUniforms = { uTime: { value: 0 } };
  const rs = ST.river, v3 = h => { const c = new THREE.Color(h); return `vec3(${[c.r, c.g, c.b].map(x => x.toFixed(4)).join(',')})`; };
  M.water = new THREE.ShaderMaterial({
    uniforms: waterUniforms, transparent: true,
    vertexShader: `attribute vec2 flow; attribute float depth; attribute float fade; varying vec2 vFlow; varying float vDepth; varying float vFade; varying vec3 vW; uniform float uTime;
      void main(){ vec4 w = modelMatrix*vec4(position,1.); w.y += sin(w.x*3.1+uTime*1.6)*.006 + cos(w.z*2.7+uTime*1.3)*.006;
        vW=w.xyz; vFlow=flow; vDepth=depth; vFade=fade; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float uTime; varying vec2 vFlow; varying float vDepth; varying float vFade; varying vec3 vW; ${NOISE_GLSL}
      void main(){
        float sp = length(vFlow);
        vec2 p = vW.xz*3.2 - vFlow*uTime*0.9;
        float n = vn(p)*.6 + vn(p*2.3+3.7 - vFlow*uTime*.6)*.4;
        float streak = step(.7, n) * (.3 + .7*sp);
        vec3 col = mix(${v3(rs.shallow)}, ${v3(rs.deep)}, smoothstep(0.,1.,vDepth));
        col += streak*.16;
        float foam = step(vDepth, .07 + .05*vn(vW.xz*7. + uTime*.8));
        col = mix(col, vec3(.97,.99,1.), foam*.7);
        gl_FragColor = vec4(col, .94*vFade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/* ================= Océan : eau profonde, lagon turquoise, écume ================= */
const SDF_N = 192, SDF_R = 9.5;
function buildOcean() {
  // distance au rivage (bruitée comme le relief), échantillonnée une fois : toutes les îles ont le même contour
  const data = new Uint8Array(SDF_N * SDF_N);
  for (let j = 0; j < SDF_N; j++) for (let i = 0; i < SDF_N; i++) {
    const x = -SDF_R + (i + .5) / SDF_N * 2 * SDF_R, z = -SDF_R + (j + .5) / SDF_N * 2 * SDF_R;
    const d = COAST0 - coastSI(x, z, signedInside(x, z)); // > 0 au large
    data[j * SDF_N + i] = Math.round(clamp((d + 1) / 8) * 255);
  }
  const tex = new THREE.DataTexture(data, SDF_N, SDF_N, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  const O = ST.ocean, col = h => new THREE.Color(h);
  oceanUniforms = {
    uTime: waterUniforms.uTime, uSdf: { value: tex }, uIsl: { value: [new THREE.Vector2(0, 0), new THREE.Vector2(9999, 0), new THREE.Vector2(9999, 0), new THREE.Vector2(9999, 0)] },
    uDeep: { value: col(O.deep) }, uDeep2: { value: col(O.deep2) }, uShallow: { value: col(O.shallow) }, uShallow2: { value: col(O.shallow2) }, uFoam: { value: col(O.foam) },
    uSun: { value: new THREE.Vector3(...ST.sunDir).normalize() }, uGlint: { value: O.glint },
    uFogColor: { value: col(ST.fog) }, uFogNear: { value: ST.fogNear }, uFogFar: { value: ST.fogFar },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: oceanUniforms,
    vertexShader: `uniform float uTime; varying vec3 vW; varying float vDist;
      void main(){ vec4 w = modelMatrix*vec4(position,1.);
        w.y += sin(w.x*1.3+uTime*1.1)*.035 + sin(w.z*1.7-uTime*.9+w.x*.4)*.03;
        vW=w.xyz; vec4 mv=viewMatrix*w; vDist=-mv.z; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform float uTime; uniform sampler2D uSdf; uniform vec2 uIsl[4];
      uniform vec3 uDeep, uDeep2, uShallow, uShallow2, uFoam, uSun, uFogColor; uniform float uGlint, uFogNear, uFogFar;
      varying vec3 vW; varying float vDist; ${NOISE_GLSL}
      float coast(vec2 p){ float d = 99.;
        for (int i=0;i<4;i++){ vec2 uv = (p-uIsl[i])/${(2 * SDF_R).toFixed(1)} + .5;
          if (uv.x>0. && uv.x<1. && uv.y>0. && uv.y<1.) d = min(d, texture2D(uSdf, uv).r*8.-1.); }
        return d; }
      void main(){
        vec3 n = normalize(cross(dFdx(vW), dFdy(vW))); if (n.y<0.) n=-n;
        float d = coast(vW.xz);
        float wob = (vn(vW.xz*.9 + vec2(3.1,7.7))-.5)*.35;
        // eau profonde : deux tons en larges plaques, très calmes
        float pat = vn(vW.xz*.18 + vec2(uTime*.02, 0.));
        vec3 col = mix(uDeep, uDeep2, step(.6, pat)*.35);
        // lagon : bande peu profonde nette autour des côtes, plus claire près du rivage
        float sh = 1. - step(1.35 + wob, d);
        float sh2 = 1. - step(.5 + wob*.5, d);
        col = mix(col, uShallow, sh);
        col = mix(col, uShallow2, sh2*.75);
        // fin liseré clair à la limite du lagon
        col = mix(col, uShallow2, (1.-smoothstep(0., .06, abs(d-(1.35+wob))))*.35);
        // écume : un trait qui épouse le rivage et une vague qui respire
        float f1 = (1. - smoothstep(.05, .13, d)) * step(-.12, d); // sous l'île (trous de rivière) : pas d'écume
        float br = .22 + .07*sin(uTime*1.6 + vW.x*.7 + vW.z*.5);
        float f2 = (1.-smoothstep(.0, .04, abs(d-br))) * step(.45, vn(vW.xz*3. + uTime*.3));
        col = mix(col, uFoam, clamp(f1*.9 + f2*.8, 0., 1.));
        // facettes : la houle low-poly accroche la lumière
        float lam = .82 + .22*max(dot(n, uSun), 0.);
        col *= lam;
        col += uGlint * pow(max(dot(reflect(-uSun, n), normalize(cameraPosition - vW)), 0.), 40.) * .5;
        float fogF = smoothstep(uFogNear, uFogFar, vDist);
        gl_FragColor = vec4(mix(col, uFogColor, fogF), 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  mat.extensions = { derivatives: true };
  const geo = new THREE.PlaneGeometry(260, 220, 104, 88).rotateX(-Math.PI / 2);
  ocean = new THREE.Mesh(geo, mat); ocean.position.set(ISLAND_GAP * .5, SEA_Y, 0); ocean.receiveShadow = false;
  scene.add(ocean);
}
function placeOcean(n) { oceanUniforms.uIsl.value.forEach((v, i) => v.set(i < n ? i * ISLAND_GAP : 9999, 0)); ocean.position.x = (n - 1) * ISLAND_GAP / 2; }

/* nuages : un banc tout autour de la carte (une seule InstancedMesh, un seul appel de rendu) */
function buildCloudBank(n) {
  if (cloudBank) { scene.remove(cloudBank); cloudBank.dispose(); cloudBank = null; }
  const x0 = -9.5, x1 = (n - 1) * ISLAND_GAP + 9.5, z0 = -9.5, z1 = 11;
  const pts = [], r = rng('clouds' + n);
  const edge = (ax, az, bx, bz, ox, oz) => {
    const L = Math.hypot(bx - ax, bz - az), m = Math.ceil(L / 1.25);
    for (let s = 0; s <= m; s++) for (let row = 0; row < 3; row++) {
      const t = s / m + (r() - .5) * .02, x = ax + (bx - ax) * t + ox * row * 1.6 + (r() - .5) * .9, z = az + (bz - az) * t + oz * row * 1.6 + (r() - .5) * .9;
      const sz = (0.75 + r() * .7) * (1 + row * .3);
      pts.push([x, SEA_Y + sz * .15 + row * .15, z, sz]);
      if (r() < .45) pts.push([x + (r() - .5) * 1.2, SEA_Y + sz * .4 + .1, z + (r() - .5) * 1.2, sz * .65]);
    }
  };
  edge(x0, z0, x1, z0, 0, -1); edge(x1, z0, x1, z1, 1, 0); edge(x1, z1, x0, z1, 0, 1); edge(x0, z1, x0, z0, -1, 0);
  const im = new THREE.InstancedMesh(G.puff, M.cloud, pts.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  pts.forEach(([x, y, z, s], i) => { e.set(r() * .4, r() * 6.28, r() * .4); q.setFromEuler(e); m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s * 1.3, s * .55, s)); im.setMatrixAt(i, m4); });
  im.instanceMatrix.needsUpdate = true; im.castShadow = false; im.receiveShadow = false;
  cloudBank = im; scene.add(im);
}

/* ================= Bibliothèque d'objets procéduraux (style jouet) ================= */
function makePine(r, s) {
  const PINE = ST.pine;
  const parts = [paint(new THREE.CylinderGeometry(0.035, 0.05, 0.16, 5).translate(0, 0.08, 0), '#7a4a2a')];
  const n = 2 + (r() < .45 ? 1 : 0), base = r() * 4 | 0, sy = 0.95 + r() * .3;
  for (let l = 0; l < n; l++) {
    const rad = 0.27 * (1 - l * 0.24), hh = 0.36 - l * .03;
    const g = new THREE.ConeGeometry(rad, hh, 6).rotateY(r() * 6).translate(0, 0.13 + l * 0.19 + hh / 2, 0);
    parts.push(paint(jitter(g, 0.012, r() * 10), PINE[(base + l) % 4]));
  }
  return { geo: merge(parts.map(g => g.scale(s, s * sy, s))), top: s * sy * (0.13 + (n - 1) * 0.19 + 0.36) };
}
function makeRound(r, s) {
  const LEAF = ST.leaf, pal = LEAF[r() * LEAF.length | 0], th = 0.2 + r() * .06;
  const parts = [paint(new THREE.CylinderGeometry(0.035, 0.05, th, 5).translate(0, th / 2, 0), '#7a4a2a')];
  const rad = 0.24 + r() * .05;
  parts.push(paint(new THREE.IcosahedronGeometry(rad, 0).rotateY(r() * 6).scale(1, 1.08, 1).translate(0, th + rad * .8, 0), pal[0]));
  if (r() < .5) { const r2 = rad * .6, a = r() * 6.28; parts.push(paint(new THREE.IcosahedronGeometry(r2, 0).translate(Math.cos(a) * rad * .7, th + rad * 1.3, Math.sin(a) * rad * .7), pal[1])); }
  return { geo: merge(parts.map(g => g.scale(s, s, s))), top: s * (th + rad * 2) };
}
function makeBush(r, s) {
  const LEAF = ST.leaf, pal = LEAF[r() * LEAF.length | 0], parts = [];
  const n = 1 + (r() * 2 | 0);
  for (let b = 0; b < n; b++) { const rad = 0.1 + r() * .04; parts.push(paint(new THREE.IcosahedronGeometry(rad, 0).rotateY(r() * 6).translate((r() - .5) * .14 * b, rad * .75, (r() - .5) * .14 * b), pal[b % 2])); }
  return { geo: merge(parts.map(g => g.scale(s, s, s))), top: 0.22 * s };
}
function makeShrub(r, s) {
  // massif de feuillage : trois boules à facettes serrées, deux tons, sur un socle sombre
  const LEAF = ST.leaf, pal = LEAF[1], parts = [];
  parts.push(paint(new THREE.CylinderGeometry(0.36, 0.4, 0.06, 7).translate(0, 0.03, 0), '#2f6f2a'));
  [[0, 0.3, 0, 0.3], [0.2, 0.22, 0.1, 0.21], [-0.18, 0.2, 0.12, 0.2], [0.02, 0.2, -0.2, 0.2]].forEach(([x, y, z, rad], i) =>
    parts.push(paint(new THREE.IcosahedronGeometry(rad, 0).rotateY(r() * 6).translate(x, y, z), pal[i ? 1 : 0])));
  return { geo: merge(parts.map(g => g.scale(s, s, s))), top: 0.6 * s };
}
// pose : l'objet tombe du ciel et rebondit en grandissant
function dropIn(grp, animate) {
  if (!animate) return;
  grp.position.y = 1.1; tween(700, p => { grp.position.y = 1.1 * (1 - p); }, { delay: 250, easing: ease.outBounce });
  grp.children.forEach(m => { const s = m.userData.s || 1; m.scale.setScalar(0.001); tween(520, p => m.scale.setScalar(Math.max(0.001, p * s)), { delay: 250 + (m.userData.delay || 0) * .5, easing: ease.outBack }); });
}
function makeRock(r, s, tint) {
  const g = new THREE.DodecahedronGeometry(0.1, 0).scale(1 + r() * .6, .6 + r() * .4, 1 + r() * .4).rotateY(r() * 6).translate(0, 0.03, 0);
  const c = new THREE.Color(tint || ST.land.rock2).multiplyScalar(.92 + r() * .16);
  return { geo: merge([paint(g, c).scale(s, s, s)]), top: 0.1 * s };
}
function prism(w, h, d) { const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(0, h); sh.closePath(); return new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2); }
function makeHouse(r, base) {
  const parts = [], wins = [];
  const [wc, wc2] = ST.walls[base] || ST.walls.brown, roof = ST.roofs[r() * ST.roofs.length | 0];
  const body = (w, h, d, ox, oz, rot) => {
    const g = [paint(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), wc), paint(prism(w + 0.1, 0.24 + r() * .05, d + 0.1).translate(0, h, 0), roof),
      paint(new THREE.BoxGeometry(0.09, 0.15, 0.014).translate(-w * .2, 0.075, d / 2 + .006), '#6a3f22')];
    g.forEach(x => x.rotateY(rot).translate(ox, 0, oz)); parts.push(...g);
    const w1 = new THREE.BoxGeometry(0.08, 0.08, 0.014).translate(w * .22, h * .58, d / 2 + .006), w2 = new THREE.BoxGeometry(0.014, 0.08, 0.08).translate(w / 2 + .006, h * .58, 0);
    for (const x of [w1, w2]) { x.deleteAttribute('uv'); wins.push(x.rotateY(rot).translate(ox, 0, oz)); }
  };
  const w = 0.4 + r() * .08, d = 0.34 + r() * .05, h = 0.28 + r() * .05;
  body(w, h, d, 0, 0, 0);
  body(w * .66, h * .82, d * .74, w * .52, -d * .22, Math.PI / 2); // toujours une annexe : la maison a du volume
  parts.push(paint(new THREE.BoxGeometry(0.07, 0.16, 0.07).translate(-w * .25, h + 0.13, -d * .15), wc2));
  return { geo: merge(parts), winGeo: mergeGeometries(wins), top: h + 0.32, chimney: [-w * .25, h + 0.24, -d * .15] };
}
function makeTuft(r) { const parts = []; for (let i = 0; i < 2; i++) { const g = new THREE.ConeGeometry(0.03, 0.2 + r() * .06, 4).translate(0, 0.1, 0).rotateZ((r() - .5) * .35).translate((r() - .5) * .05, 0, (r() - .5) * .05); parts.push(paint(g, r() < .5 ? ST.land.wheat : ST.land.wheat2)); } return parts; }
function makeHay() { return merge([paint(new THREE.CylinderGeometry(0.09, 0.09, 0.14, 8).rotateZ(Math.PI / 2).translate(0, 0.09, 0), '#e2b84f'), paint(new THREE.CylinderGeometry(0.072, 0.072, 0.142, 8).rotateZ(Math.PI / 2).translate(0, 0.09, 0), '#f3d97f')]); }
function makeStump(r, s) { return merge([paint(new THREE.CylinderGeometry(0.06, 0.075, 0.08, 6).translate(0, 0.04, 0), '#7a4a2a'), paint(new THREE.CylinderGeometry(0.055, 0.055, 0.004, 6).translate(0, 0.082, 0), '#e2b980')].map(g => g.scale(s, s, s))); }
function makeLogs(r) { const p = []; [[0, .04, 0], [0, .04, .085], [0, .11, .042]].forEach(([x, y, z]) => p.push(paint(new THREE.CylinderGeometry(0.04, 0.04, 0.34, 6).rotateZ(Math.PI / 2).translate(x, y, z), r() < .5 ? '#7a4a2a' : '#6a3f22'))); return merge(p); }
function makeScaffold() {
  const p = [paint(new THREE.BoxGeometry(0.5, 0.07, 0.42).translate(0, 0.035, 0), '#d8cdb8')];
  for (const [x, z] of [[-.22, -.18], [.22, -.18], [-.22, .18], [.22, .18]]) p.push(paint(new THREE.BoxGeometry(0.03, 0.32, 0.03).translate(x, 0.22, z), '#a8784a'));
  p.push(paint(new THREE.BoxGeometry(0.48, 0.03, 0.03).translate(0, 0.37, -.18), '#a8784a'), paint(new THREE.BoxGeometry(0.48, 0.03, 0.03).translate(0, 0.37, .18), '#a8784a'));
  p.push(paint(new THREE.BoxGeometry(0.32, 0.06, 0.13).translate(0.05, 0.1, 0.02), ST.roofs[0]));
  return merge(p);
}
function makeReed(r) { const p = []; for (let i = 0; i < 3; i++) p.push(paint(new THREE.ConeGeometry(0.018, 0.22 + r() * .1, 3).translate((r() - .5) * .07, 0.12, (r() - .5) * .07).rotateZ((r() - .5) * .3), r() < .5 ? '#4f9a3a' : '#3f8a30')); p.push(paint(new THREE.CylinderGeometry(0.016, 0.016, 0.06, 5).translate(0, 0.26, 0), '#7a4a2a')); return merge(p); }
function makeLily(r) { const p = [paint(new THREE.CylinderGeometry(0.07, 0.07, 0.01, 6), '#4fa83f')]; if (r() < .45) p.push(paint(new THREE.OctahedronGeometry(0.03, 0).translate(0.02, 0.02, 0), '#ffd6e6')); return merge(p); }
function makeFlower(r) { return merge([paint(new THREE.ConeGeometry(0.01, 0.1, 3).translate(0, .05, 0), '#4f9a3a'), paint(new THREE.OctahedronGeometry(0.03, 0).translate(0, 0.105, 0), ['#ffffff', '#ff9ec0', '#ffd84a', '#b9a6ff'][r() * 4 | 0])]); }

/* ================= Île ================= */
function buildIsland(i) {
  const g = new THREE.Group(); g.position.copy(islandPos(i));
  const nT = GRID.tris.length;
  const tgeo = new THREE.BufferGeometry();
  tgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nT * 3), 3));
  tgeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nT * 3), 3));
  const terrain = new THREE.Mesh(tgeo, M.terrain); terrain.receiveShadow = true; terrain.castShadow = true; g.add(terrain);
  const water = new THREE.Mesh(new THREE.BufferGeometry(), M.water); water.renderOrder = 1; g.add(water);
  const isl = {
    idx: i, group: g, terrain, water, props: new THREE.Group(), cells: {}, animals: {}, grid: null, hlGroup: new THREE.Group(), tokens: new THREE.Group(),
    Hd: new Float32Array(GRID.pts.length), Ht: new Float32Array(GRID.pts.length), A: null, sig: {}, patch: {}, center: islandPos(i).clone().add(new THREE.Vector3(0, 0.3, 0.4)),
  };
  g.add(isl.props, isl.hlGroup, isl.tokens); isl.tokens.visible = showTokens;
  for (const c of CELLS) { const cg = new THREE.Group(); isl.props.add(cg); isl.cells[c.k] = { group: cg, top: 0.1 }; }
  // décor du pourtour, entre les cases et la plage
  const r = rng('rim' + i); const deco = new THREE.Group(); g.add(deco); isl.deco = deco;
  let placed = 0;
  for (let t = 0; t < 1400 && placed < 64; t++) {
    const x = (r() * 2 - 1) * 4.9, z = -4.9 + r() * 10.5; const si = signedInside(x, z);
    if (si < 0.55 || nearestCell(x, z).d < 1.05) continue;
    const k = r(); const o = k < .25 ? makeFlower(r) : k < .5 ? makeBush(r, .8 + r() * .4).geo : k < .68 ? makeRound(r, .55 + r() * .2).geo : makeRock(r, .9 + r() * .9).geo;
    const m = new THREE.Mesh(o, M.props); m.position.set(x, 0, z); m.rotation.y = r() * 6; m.castShadow = true; m.userData.rim = [x, z]; deco.add(m); placed++;
  }
  scene.add(g);
  return isl;
}
function ensureIslands(n) {
  if (islands.length === n) return;
  for (const isl of islands) scene.remove(isl.group);
  islands = []; for (let i = 0; i < n; i++) islands.push(buildIsland(i));
  placeOcean(n); buildCloudBank(n); fitCache = {};
  if (!camInit) { camInit = true; Scene.focus(Math.max(0, view.activeIdx), { instant: true }); }
}

/* ----- terrain : hauteurs, couleurs, eau ----- */
function computeHeights(isl) { const P = GRID.pts; for (let v = 0; v < P.length; v++) { const p = P[v]; isl.Ht[v] = p.ok ? heightAt(isl.A, p.x, p.z, p.si) : SEA_Y - 1; } }
function writeTerrain(isl, Hh) {
  const pos = isl.terrain.geometry.attributes.position.array, P = GRID.pts, T = GRID.tris;
  for (let n = 0; n < T.length; n++) { const p = P[T[n]]; pos[n * 3] = p.x; pos[n * 3 + 1] = Hh[T[n]]; pos[n * 3 + 2] = p.z; }
  const g = isl.terrain.geometry; g.attributes.position.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox();
}
function writeColors(isl) {
  const col = isl.terrain.geometry.attributes.color.array, P = GRID.pts, T = GRID.tris, Hh = isl.Ht;
  for (let n = 0; n < T.length; n += 3) {
    const p0 = P[T[n]], p1 = P[T[n + 1]], p2 = P[T[n + 2]], y0 = Hh[T[n]], y1 = Hh[T[n + 1]], y2 = Hh[T[n + 2]];
    const cy = (y0 + y1 + y2) / 3;
    let k;
    if (Math.max(y0, y1, y2) < SEA_Y - 0.05) k = PAL.sand2; // sous la mer : jamais vu
    else {
      const ux = p1.x - p0.x, uy = y1 - y0, uz = p1.z - p0.z, vx = p2.x - p0.x, vy = y2 - y0, vz = p2.z - p0.z;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const ny1 = Math.abs(ny) / (Math.hypot(nx, ny, nz) || 1);
      const cx = (p0.x + p1.x + p2.x) / 3, cz = (p0.z + p1.z + p2.z) / 3;
      k = colorAt(isl.A, cx, cz, cy, ny1, hash2(cx * 13.1, cz * 7.3), (p0.si + p1.si + p2.si) / 3);
    }
    for (let q = 0; q < 3; q++) { col[(n + q) * 3] = k.r; col[(n + q) * 3 + 1] = k.g; col[(n + q) * 3 + 2] = k.b; }
  }
  isl.terrain.geometry.attributes.color.needsUpdate = true;
}
function buildWater(isl) {
  const P = GRID.pts, T = GRID.tris, Hh = isl.Ht, A = isl.A;
  const pos = [], flow = [], depth = [], fade = [];
  const fl = (x, z) => { let best = Infinity, fx = 0, fz = 0; for (const s of A.segs) { const [d] = segDist(x, z, s.ax, s.az, s.bx, s.bz); if (d < best) { best = d; const L = Math.hypot(s.bx - s.ax, s.bz - s.az) || 1; fx = (s.bx - s.ax) / L; fz = (s.bz - s.az) / L; } } const k = smooth(0.7, 0.2, best); return [fx * k, fz * k]; };
  for (let n = 0; n < T.length; n += 3) {
    const ys = [Hh[T[n]], Hh[T[n + 1]], Hh[T[n + 2]]];
    if (Math.min(...ys) > WATER_Y + 0.01) continue;
    const ps = [P[T[n]], P[T[n + 1]], P[T[n + 2]]];
    // seulement les rivières et les mares : la mer, c'est l'océan
    if (Math.max(ps[0].si, ps[1].si, ps[2].si) < -0.25) continue;
    const cx = (ps[0].x + ps[1].x + ps[2].x) / 3, cz = (ps[0].z + ps[1].z + ps[2].z) / 3;
    if (Math.min(ps[0].si, ps[1].si, ps[2].si) < 0.3 && carveAt(A, cx, cz) < 0.05) continue;
    for (let q = 0; q < 3; q++) { const p = ps[q]; pos.push(p.x, WATER_Y, p.z); const [fx, fz] = fl(p.x, p.z); flow.push(fx, fz); depth.push(clamp((WATER_Y - ys[q]) / 0.2)); fade.push(smooth(-0.3, 0.35, coastSI(p.x, p.z, p.si))); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('flow', new THREE.Float32BufferAttribute(flow, 2));
  g.setAttribute('depth', new THREE.Float32BufferAttribute(depth, 1));
  g.setAttribute('fade', new THREE.Float32BufferAttribute(fade, 1));
  isl.water.geometry.dispose(); isl.water.geometry = g;
}
function buildGridLines(isl) {
  if (isl.grid) { isl.group.remove(isl.grid); isl.grid.children.forEach(m => m.geometry.dispose()); }
  const seen = new Set(), pos = [], idx = [], pos2 = [], idx2 = [];
  const ribbon = (pts, w, pos, idx, lift) => { const base = pos.length / 3; for (let s = 0; s < pts.length; s++) { const [x, z] = pts[s]; const [dx, dz] = s < pts.length - 1 ? [pts[s + 1][0] - x, pts[s + 1][1] - z] : [x - pts[s - 1][0], z - pts[s - 1][1]]; const L = Math.hypot(dx, dz) || 1, px = -dz / L * w / 2, pz = dx / L * w / 2; const y = Math.max(heightAt(isl.A, x, z), WATER_Y) + 0.05 + lift; pos.push(x + px, y, z + pz, x - px, y, z - pz); if (s) { const a = base + (s - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } } };
  for (const c of CELLS) for (let e = 0; e < 6; e++) {
    const a1 = Math.PI / 3 * e, a2 = Math.PI / 3 * (e + 1);
    const x1 = c.x + Math.cos(a1), z1 = c.z + Math.sin(a1), x2 = c.x + Math.cos(a2), z2 = c.z + Math.sin(a2);
    const key = Math.round((x1 + x2) * 50) + ',' + Math.round((z1 + z2) * 50); if (seen.has(key)) continue; seen.add(key);
    const pts = []; for (let s = 0; s <= 5; s++) pts.push([x1 + (x2 - x1) * s / 5, z1 + (z2 - z1) * s / 5]); ribbon(pts, 0.11, pos, idx, 0); ribbon(pts, 0.045, pos2, idx2, 0.004);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(pos2, 3)); g2.setIndex(idx2);
  isl.grid = new THREE.Group(); isl.grid.renderOrder = 3;
  const dark = new THREE.Mesh(g, M.grid); dark.renderOrder = 3;
  const light = new THREE.Mesh(g2, M.gridLight); light.renderOrder = 3;
  isl.grid.add(dark, light); isl.group.add(isl.grid);
}

/* ----- objets d'une case ----- */
function addProp(isl, k, geo, x, z, { rot = 0, sway = 0, yOff = 0, scale = 1, mat = M.props, delay = 0 } = {}) {
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true;
  m.position.set(x, heightAt(isl.A, x, z) + yOff, z); m.rotation.y = rot; m.userData = { k, sway, px: x, pz: z, yOff, delay, s: scale, own: true }; m.scale.setScalar(scale);
  isl.cells[k].group.add(m); return m;
}
function scatter(r, cx, cz, n, radius, minD, avoid = []) {
  const pts = [];
  for (let t = 0; t < n * 30 && pts.length < n; t++) {
    const a = r() * 6.28, d = Math.sqrt(r()) * radius, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    if (hexDist(x - cx, z - cz) > radius * 1.05) continue;
    if (pts.some(p => Math.hypot(p[0] - x, p[1] - z) < minD) || avoid.some(p => Math.hypot(p[0] - x, p[1] - z) < minD)) continue;
    pts.push([x, z]);
  }
  return pts;
}
function buildCellProps(isl, k, board, animate) {
  const cell = isl.cells[k]; const grp = cell.group;
  grp.traverse(o => { if (o.isMesh && o.userData.own) o.geometry.dispose(); }); grp.clear();
  const ci = CI[k], c = CELLS[ci], f = isl.A.info[ci], stack = board[k].stack;
  const r = rng(isl.idx + ':' + k + ':' + stack.join(''));
  let top = 0.1;
  if (f.kind === 'forest') {
    // peu d'arbres mais gros : la forêt se lit de loin sur un petit écran
    if (f.h === 1) {
      // buisson (feuillage seul) : un gros massif rond bien découpé, entouré de deux petits
      const big = makeShrub(r, 1.15); addProp(isl, k, big.geo, c.x, c.z, { rot: r() * 6, sway: .6 }); top = big.top;
      scatter(r, c.x, c.z, 2, 0.62, 0.55, [[c.x, c.z]]).forEach(([x, z], n) => addProp(isl, k, makeShrub(r, .55).geo, x, z, { rot: r() * 6, sway: .6, delay: 60 + n * 40 }));
      cell.top = Math.max(heightAt(isl.A, c.x, c.z), WATER_Y) + top;
      return dropIn(grp, animate);
    }
    const cfg = [null, null, { n: 5, sc: 1.05, pine: .45 }, { n: 7, sc: 1.3, pine: .6 }][f.h];
    const pts = scatter(r, c.x, c.z, cfg.n, 0.68, 0.3 * cfg.sc + .06);
    pts.forEach(([x, z], n) => {
      const s = cfg.sc * (0.85 + r() * .3);
      const o = r() < cfg.pine ? makePine(r, s) : makeRound(r, s);
      addProp(isl, k, o.geo, x, z, { rot: r() * 6, sway: 1, delay: n * 45 }); top = Math.max(top, o.top);
    });
    scatter(r, c.x, c.z, 2, 0.72, 0.25, pts).forEach(([x, z]) => addProp(isl, k, makeBush(r, .9).geo, x, z, { rot: r() * 6 }));
  } else if (f.kind === 'mountain') {
    scatter(r, c.x, c.z, 1 + f.h, 0.85, 0.35).forEach(([x, z]) => addProp(isl, k, makeRock(r, 1 + r() * .8).geo, x, z, { rot: r() * 6, yOff: -0.02 }));
    if (f.h === 1) scatter(r, c.x, c.z, 2, 0.75, 0.4).forEach(([x, z]) => addProp(isl, k, makePine(r, .6).geo, x, z, { sway: 1 }));
    top = PEAK[f.h] + 0.05;
  } else if (f.kind === 'field') {
    const a = isl.A.fieldAngle, ca = Math.cos(a), sa = Math.sin(a), parts = [];
    for (let u = -0.84; u <= 0.84; u += 0.2) for (let v = -0.84; v <= 0.84; v += 0.15) {
      const x = c.x + u * ca - v * sa, z = c.z + u * sa + v * ca;
      if (hexDist(x - c.x, z - c.z) > 0.8 || r() < .1) continue;
      const y = heightAt(isl.A, x, z); makeTuft(r).forEach(g => parts.push(g.translate(x - c.x, y, z - c.z)));
    }
    const m = new THREE.Mesh(merge(parts), M.props); m.position.set(c.x, 0, c.z); m.castShadow = true; m.receiveShadow = true; m.userData = { k, own: true, sway: .5, px: c.x, pz: c.z, yOff: 0, s: 1, abs: true }; grp.add(m);
    if (r() < .5) { const [x, z] = scatter(r, c.x, c.z, 1, .5, .1)[0] || [c.x, c.z]; addProp(isl, k, makeHay(), x, z, { rot: r() * 6 }); }
    top = 0.3;
  } else if (f.kind === 'water') {
    for (let t = 0, n = 0; t < 40 && n < 5; t++) {
      const a = r() * 6.28, d = 0.25 + r() * .6, x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      const cv = carveAt(isl.A, x, z), y = heightAt(isl.A, x, z);
      if (cv > 0.08 && cv < 0.32 && y > WATER_Y - 0.02) { addProp(isl, k, makeReed(r), x, z, { sway: 1.2 }); n++; }
      else if (cv > 0.8 && r() < .2) { const m = addProp(isl, k, makeLily(r), x, z, { rot: r() * 6 }); m.userData.fixedY = WATER_Y + 0.008; m.position.y = WATER_Y + 0.008; }
    }
    top = 0.15;
  } else if (f.kind === 'house') {
    let rot = (r() * 6 | 0) * Math.PI / 3 + Math.PI / 6;
    const nb = isl.A.housePairs.find(([a, b]) => a === ci || b === ci);
    if (nb) { const o = CELLS[nb[0] === ci ? nb[1] : nb[0]]; rot = Math.atan2(o.x - c.x, o.z - c.z); }
    const hs = makeHouse(r, f.base);
    const hm = addProp(isl, k, hs.geo, c.x, c.z, { rot, scale: 1.7 }); hm.userData.chimney = hs.chimney; addProp(isl, k, hs.winGeo, c.x, c.z, { rot, mat: M.window, scale: 1.7 });
    scatter(r, c.x, c.z, 3, 0.82, 0.32, [[c.x, c.z]]).forEach(([x, z], n) => { if (Math.hypot(x - c.x, z - c.z) < .62) return; const o = n === 0 && r() < .6 ? makeRound(r, .6) : makeBush(r, 1.1); addProp(isl, k, o.geo, x, z, { sway: 1, rot: r() * 6 }); });
    top = hs.top * 1.7;
  } else if (f.kind === 'foundation') { addProp(isl, k, makeScaffold(), c.x, c.z, { rot: (r() * 6 | 0) * Math.PI / 3, scale: 1.2 }); top = 0.45; }
  else if (f.kind === 'clearing') {
    scatter(r, c.x, c.z, 1 + f.h, 0.7, 0.24).forEach(([x, z]) => addProp(isl, k, makeStump(r, 1.1 + r() * .5), x, z));
    addProp(isl, k, makeLogs(r), c.x + (r() - .5) * .3, c.z + (r() - .5) * .3, { rot: r() * 6 });
    if (f.h === 2) addProp(isl, k, makeLogs(r), c.x + (r() - .5) * .5, c.z + (r() - .5) * .5, { rot: r() * 6 });
    top = 0.2;
  }
  cell.top = Math.max(heightAt(isl.A, c.x, c.z), WATER_Y) + top;
  dropIn(grp, animate);
}
function propMovers(isl) {
  const out = [];
  isl.props.traverse(m => { if (!m.isMesh) return; const u = m.userData; if (u.fixedY !== undefined || u.abs) return; out.push([m, m.position.y, heightAt(isl.A, u.px, u.pz) + (u.yOff || 0)]); });
  isl.deco.children.forEach(m => out.push([m, m.position.y, heightAt(isl.A, m.userData.rim[0], m.userData.rim[1])]));
  return out;
}

/* ----- animaux : les cubes deviennent des animaux qui vivent sur leur case ----- */
// carte -> [modèle, hauteur visée, comportement, teinte]
const ANIMALS = {
  'Fennec': ['fennec', .32, 'walk', '#e9c48a'], 'Lapin': ['rabbit', .24, 'hop'], 'Abeille': ['bee', .13, 'buzz'], 'Perdrix': ['partridge', .2, 'hop'],
  'Hamster': ['hamster', .16, 'hop'], 'Alouette': ['lark', .17, 'hop'], 'Coccinelle': ['ladybug', .11, 'walk'], 'Loutre': ['otter', .22, 'swim'],
  'Héron': ['heron', .5, 'still'], 'Grenouille': ['frog_animated', .14, 'hop'], 'Castor': ['beaver', .24, 'swim'], 'Martin-pêcheur': ['bluebird', .17, 'hop'],
  'Canard': ['duck', .22, 'swim'], 'Flamant': ['flamingo', .55, 'still', '#f59bb2'], 'Bouquetin': ['ibex', .46, 'walk'], 'Aigle': ['eagle', .38, 'soar'],
  'Marmotte': ['marmot', .24, 'still'], 'Chamois': ['chamois', .42, 'walk'], 'Chauve-souris': ['bat', .3, 'flutter'], 'Ours': ['bear', .52, 'walk'],
  'Écureuil': ['squirrel', .2, 'hop'], 'Chouette': ['owl', .28, 'perch'], 'Cerf': ['stag', .62, 'walk'], 'Hérisson': ['hedgehog', .16, 'walk'],
  'Pic-vert': ['woodpecker', .22, 'perch', '#6fae45'], 'Sanglier': ['boar', .36, 'walk'], 'Loup': ['wolf', .42, 'walk'], 'Souris': ['mouse', .12, 'walk'],
  'Renard': ['fox', .34, 'walk'], 'Hirondelle': ['swallow', .17, 'soar'], 'Raton laveur': ['raccoon', .28, 'walk'], 'Cigogne': ['stork', .55, 'still'],
};
const modelCache = {};
let loader = null;
function loadModel(file) {
  if (modelCache[file]) return modelCache[file];
  if (!GLTFLoader) return (modelCache[file] = Promise.resolve(null));
  loader = loader || new GLTFLoader();
  return (modelCache[file] = new Promise(res => loader.load(modelsBase + file + '.glb', g => res(g), undefined, e => { console.warn('modèle', file, e); res(null); })));
}
function instance(gltf, spec) {
  const skinned = gltf.animations.length > 0;
  const obj = skinned ? skClone(gltf.scene) : gltf.scene.clone(true);
  obj.traverse(o => { if (o.isMesh) { o.castShadow = true; if (o.isSkinnedMesh) o.frustumCulled = false; if (spec[3]) { o.material = o.material.clone(); o.material.color.lerp(new THREE.Color(spec[3]), .55); } } });
  const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3());
  const ref = ['soar', 'flutter', 'buzz'].includes(spec[2]) ? Math.max(size.x, size.y, size.z) : size.y;
  obj.scale.multiplyScalar(spec[1] * 1.9 / (ref || 1)); // nettement plus grands que nature : lisibles sur un téléphone
  box.setFromObject(obj); const ctr = box.getCenter(new THREE.Vector3());
  obj.position.x -= ctr.x; obj.position.z -= ctr.z; obj.position.y -= box.min.y;
  const wrap = new THREE.Group(); wrap.add(obj);
  let mixer = null; const actions = {};
  if (skinned) {
    mixer = new THREE.AnimationMixer(obj);
    const find = n => gltf.animations.find(a => a.name === n) || gltf.animations.find(a => a.name.endsWith('_' + n) || a.name.endsWith('|' + n));
    actions.Idle = find('Idle') || find('Frog_Idle'); actions.Walk = find('Walk') || find('Frog_Jump') || actions.Idle;
    for (const k in actions) if (actions[k]) actions[k] = mixer.clipAction(actions[k]);
  }
  return { wrap, mixer, actions };
}
function setAction(u, name) {
  const inst = u.inst; if (!inst || !inst.mixer) return; const a = inst.actions[name]; if (!a || u.cur === a) return;
  a.reset().fadeIn(.3).play(); if (u.cur) u.cur.fadeOut(.3); u.cur = a;
}
function buildAnimal(isl, k, card, animate) {
  const c = CELLS[CI[k]], name = H.CARDS[card] && H.CARDS[card].name, spec = ANIMALS[name] || ['fox', .3, 'walk'];
  const g = new THREE.Group(); g.position.set(c.x, isl.cells[k].top, c.z);
  const inForest = isl.A && isl.A.info[CI[k]].kind === 'forest';
  g.userData = { k, spec, mode: spec[2], x: c.x + .1, z: c.z + (inForest ? .58 : .1), tx: c.x, tz: c.z, wait: Math.random() * 2, phase: Math.random() * 6.28, heading: Math.random() * 6.28 };
  isl.group.add(g); isl.animals[k] = g;
  loadModel(spec[0]).then(gltf => {
    if (isl.animals[k] !== g) return;
    if (!gltf) { const m = new THREE.Mesh(G.cube, M.cube); m.position.y = .12; g.add(m); return; }
    const inst = instance(gltf, spec); g.add(inst.wrap); g.userData.inst = inst; setAction(g.userData, 'Idle');
    if (animate) { g.scale.setScalar(.001); tween(700, p => g.scale.setScalar(Math.max(.001, p)), { delay: 150, easing: ease.outBack }); burst(isl, g.userData.x, isl.cells[k].top, g.userData.z); }
  });
}
function removeAnimal(isl, k) { const a = isl.animals[k]; if (a) { isl.group.remove(a); delete isl.animals[k]; } }
function tickAnimals(isl, t, dt) {
  for (const k in isl.animals) {
    const g = isl.animals[k], u = g.userData, c = CELLS[CI[k]]; if (!isl.A) continue;
    if (u.inst && u.inst.mixer) u.inst.mixer.update(dt);
    const top = isl.cells[k].top;
    if (u.mode === 'soar' || u.mode === 'flutter' || u.mode === 'buzz') {
      const sp = u.mode === 'buzz' ? 1.6 : u.mode === 'flutter' ? 1.1 : .55, R = u.mode === 'buzz' ? .25 : u.mode === 'flutter' ? .35 : .55;
      const a = u.phase + t * sp, x = c.x + Math.cos(a) * R, z = c.z + Math.sin(a) * R * (u.mode === 'buzz' ? Math.cos(a) : 1);
      if (u.gy === undefined) u.gy = Math.max(top, heightAt(isl.A, c.x, c.z));
      const y = u.gy + (u.mode === 'buzz' ? .25 : .55) + Math.sin(t * (u.mode === 'flutter' ? 5 : 1.3) + u.phase) * (u.mode === 'flutter' ? .08 : .1);
      g.position.set(x, y, z); g.rotation.y = -a; g.rotation.z = u.mode === 'soar' ? -.35 : 0;
      continue;
    }
    if (u.mode === 'perch') { g.position.set(c.x + .05, top - .04, c.z); g.rotation.y = u.phase + Math.sin(t * .4 + u.phase) * 1.2; continue; }
    if (u.mode === 'still') { const x = c.x + .18, z = c.z + .12; if (u.sy === undefined) u.sy = Math.max(heightAt(isl.A, x, z), WATER_Y - .02); g.position.set(x, u.sy, z); g.rotation.y = u.phase + Math.sin(t * .3 + u.phase) * .8; continue; }
    // marcheurs : petites promenades dans leur case
    const dx = u.tx - u.x, dz = u.tz - u.z, d = Math.hypot(dx, dz);
    let moving = false;
    if (d < 0.02) {
      u.wait -= dt; setAction(u, 'Idle');
      if (u.wait <= 0) {
        // en forêt, on se promène en lisière (côté caméra) pour rester visible
        const forest = isl.A.info[CI[k]].kind === 'forest', oz = forest ? .58 : 0, R = forest ? .22 : .45;
        const a = Math.random() * 6.28, r = Math.random() * R; u.tx = c.x + Math.cos(a) * r; u.tz = c.z + oz + Math.sin(a) * r * .6; u.wait = 2 + Math.random() * 4;
      }
    } else {
      const sp = (u.mode === 'hop' ? .2 : .08) + u.spec[1] * .22, step = Math.min(d, sp * dt);
      u.x += dx / d * step; u.z += dz / d * step; moving = true; setAction(u, 'Walk');
      const want = Math.atan2(dx, dz); let diff = want - u.heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); u.heading += diff * Math.min(1, dt * 6);
    }
    // la hauteur du sol n'est recalculée que quand l'animal bouge
    if (moving || u.gy === undefined || isl.dirtyY) u.gy = heightAt(isl.A, u.x, u.z);
    let y = u.mode === 'swim' ? Math.max(u.gy, WATER_Y - .04) : Math.max(u.gy, WATER_Y);
    if (moving && !(u.inst && u.inst.mixer)) y += Math.abs(Math.sin(t * (u.mode === 'hop' ? 11 : 14) + u.phase)) * (u.mode === 'hop' ? .06 : .015);
    g.position.set(u.x, y, u.z); g.rotation.y = u.heading;
  }
  isl.dirtyY = false;
}

/* ----- jetons (aide à la lecture des règles) ----- */
function buildTokens(isl, board) {
  isl.tokens.clear();
  for (const c of CELLS) {
    const st = board[c.k].stack; if (!st.length) continue;
    const g = new THREE.Group(); g.position.set(c.x + 0.45, Math.max(heightAt(isl.A, c.x + 0.45, c.z - 0.5), WATER_Y) + 0.05, c.z - 0.5);
    st.forEach((col, n) => { const t = new THREE.Mesh(G.token, M.tok[col]); t.position.y = n * 0.1; t.castShadow = true; g.add(t); });
    isl.tokens.add(g);
  }
}

/* ----- mise à jour d'une île ----- */
function updateIsland(isl, p, animate) {
  const board = p.board; const changed = [];
  for (const c of CELLS) { const s = board[c.k].stack.join('.'); if (isl.sig[c.k] !== s) { changed.push(c.k); isl.sig[c.k] = s; } }
  const cubesNow = Object.fromEntries(CELLS.filter(c => board[c.k].cube).map(c => [c.k, board[c.k].cube.card]));
  if (changed.length || !isl.A) {
    const first = !isl.inited; isl.inited = true;
    const anim = animate && !first;
    isl.A = analyse(board, isl.idx);
    const from = isl.Hd.slice(); computeHeights(isl); writeColors(isl); buildWater(isl);
    for (const k in isl.patch) isl.patch[k].dispose(); isl.patch = {};
    for (const k of (first ? CELLS.map(c => c.k) : changed)) buildCellProps(isl, k, board, anim);
    const movers = propMovers(isl);
    if (anim) {
      tween(900, t => { for (let v = 0; v < isl.Hd.length; v++) isl.Hd[v] = from[v] + (isl.Ht[v] - from[v]) * t; writeTerrain(isl, isl.Hd); for (const [m, y0, y1] of movers) m.position.y = y0 + (y1 - y0) * t; isl.dirtyY = true; },
        { easing: ease.inOutCubic, done: () => { buildGridLines(isl); refreshHighlights(true); } });
      if (Scene.onLand) { const k0 = changed[0]; setTimeout(() => Scene.onLand(board[k0].stack[board[k0].stack.length - 1]), 250); }
    } else { isl.Hd.set(isl.Ht); writeTerrain(isl, isl.Hd); for (const [m, , y1] of movers) m.position.y = y1; buildGridLines(isl); isl.dirtyY = true; }
    for (const a of Object.values(isl.animals)) { a.userData.gy = undefined; a.userData.sy = undefined; }
    buildTokens(isl, board);
  }
  for (const k of Object.keys(isl.animals)) if (cubesNow[k] === undefined) removeAnimal(isl, k);
  for (const k in cubesNow) if (!isl.animals[k]) buildAnimal(isl, k, cubesNow[k], animate && isl.cubesInited);
  isl.cubesInited = true;
}

/* ================= Surbrillances : cases jouables bien visibles au doigt ================= */
const HEX_RING = (() => { const ring = []; for (let e = 0; e < 6; e++) for (let s = 0; s < 4; s++) { const a1 = Math.PI / 3 * e, a2 = Math.PI / 3 * (e + 1), t = s / 4; ring.push([Math.cos(a1) * (1 - t) + Math.cos(a2) * t, Math.sin(a1) * (1 - t) + Math.sin(a2) * t]); } return ring; })();
function hexPatch(isl, k, R, w) {
  const key = k + '|' + R + '|' + w; if (isl.patch[key]) return isl.patch[key];
  const c = CELLS[CI[k]], pos = [], idx = [];
  const pt = (x, z) => { pos.push(x, Math.max(heightAt(isl.A, x, z), WATER_Y) + 0.06, z); return pos.length / 3 - 1; };
  const ring = HEX_RING;
  if (!w) {
    const center = pt(c.x, c.z), mid = ring.map(([x, z]) => pt(c.x + x * R * .5, c.z + z * R * .5)), out = ring.map(([x, z]) => pt(c.x + x * R, c.z + z * R));
    for (let n = 0; n < ring.length; n++) { const m = (n + 1) % ring.length; idx.push(center, mid[m], mid[n], mid[n], mid[m], out[n], mid[m], out[m], out[n]); }
  } else {
    const inn = ring.map(([x, z]) => pt(c.x + x * (R - w), c.z + z * (R - w))), out = ring.map(([x, z]) => pt(c.x + x * R, c.z + z * R));
    for (let n = 0; n < ring.length; n++) { const m = (n + 1) % ring.length; idx.push(inn[n], inn[m], out[n], inn[m], out[m], out[n]); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  isl.patch[key] = g; return g;
}
function hexVeil(isl, k, R, hgt) {
  const key = k + '|veil|' + R; if (isl.patch[key]) return isl.patch[key];
  const c = CELLS[CI[k]], pos = [], vv = [], idx = [];
  HEX_RING.forEach(([x, z]) => { const px = c.x + x * R, pz = c.z + z * R, y = Math.max(heightAt(isl.A, px, pz), WATER_Y) + 0.05; pos.push(px, y, pz, px, y + hgt, pz); vv.push(0, 1); });
  const n = HEX_RING.length; for (let i = 0; i < n; i++) { const a = i * 2, b = ((i + 1) % n) * 2; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('v', new THREE.Float32BufferAttribute(vv, 1)); g.setIndex(idx);
  isl.patch[key] = g; return g;
}
function refreshHighlights(force) {
  const sig = JSON.stringify([view.activeIdx, view.legal, view.targets, view.patternHi]);
  if (sig === refreshHighlights.last && !force) return; refreshHighlights.last = sig;
  for (const isl of islands) { isl.hlGroup.clear(); for (const c of CELLS) if (isl.cells[c.k].ghostCube) isl.cells[c.k].ghostCube.visible = false; }
  const isl = islands[view.activeIdx]; if (!isl || !isl.A) return;
  const add = (k, mode) => {
    const m = M.hl[mode];
    const fill = new THREE.Mesh(hexPatch(isl, k, 0.9, 0), m.fill); fill.renderOrder = 4;
    const edge = new THREE.Mesh(hexPatch(isl, k, 0.9, mode === 'pattern' ? 0.07 : 0.13), m.edge); edge.renderOrder = 5;
    isl.hlGroup.add(fill, edge);
    if (mode !== 'pattern') { const sh = new THREE.Mesh(hexPatch(isl, k, 0.99, 0.09), M.hlShadow); sh.renderOrder = 4; isl.hlGroup.add(sh); const inner = new THREE.Mesh(hexPatch(isl, k, 0.77, 0.05), M.hlShadow); inner.renderOrder = 4; isl.hlGroup.add(inner); }
    if (m.veil) { const v = new THREE.Mesh(hexVeil(isl, k, 0.9, 0.42), m.veil); v.renderOrder = 6; isl.hlGroup.add(v); }
  };
  const done = new Set();
  view.targets.forEach(k => { add(k, 'target'); done.add(k); });
  view.patternHi.forEach(k => { if (!done.has(k)) { add(k, 'pattern'); done.add(k); } });
  view.legal.forEach(k => { if (!done.has(k)) add(k, 'legal'); });
  for (const k of view.targets) { const cell = isl.cells[k]; if (!cell.ghostCube) { cell.ghostCube = new THREE.Mesh(G.cube, M.cubeGhost); isl.group.add(cell.ghostCube); } cell.ghostCube.visible = true; }
}

/* ================= Synchronisation ================= */
Scene.sync = function (state, v) {
  if (!Scene.ready) return;
  view = Object.assign({ legal: [], targets: [], patternHi: [] }, v); lastState = state;
  ensureIslands(state.players.length);
  state.players.forEach((p, pi) => updateIsland(islands[pi], p, v.animate !== false));
  refreshHighlights();
};
Scene.reset = function () { for (const isl of islands) scene.remove(isl.group); islands = []; refreshHighlights.last = null; };
Scene.setShowTokens = function (on) { showTokens = on; islands.forEach(isl => { isl.tokens.visible = on; }); };

/* ================= Caméra : angle fixe, déplacement et zoom bornés =================
   L'état visé est { focus, panX, panZ, zoom } ; la caméra réelle le rejoint en douceur. */
const PITCH = 54 * Math.PI / 180, YAW = 0, LOOK_Y = 0.25;
const PAN_X = 4.2, PAN_Z = 4.6, ZOOM_MIN = 0.42, ZOOM_MAX = 1.25;
let insets = { top: 0, bottom: 0 };
let camInit = false, fitCache = {};
const goal = { focus: 0, panX: 0, panZ: 0, zoom: 1 };
const cur = { tx: 0, tz: 0, dist: 30 };
let flight = null;
const camDir = () => new THREE.Vector3(Math.sin(YAW) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(YAW) * Math.cos(PITCH));
function placeCamera(tx, tz, dist) { const d = camDir(); camera.position.set(tx + d.x * dist, LOOK_Y + d.y * dist, tz + d.z * dist); camera.lookAt(tx, LOOK_Y, tz); camera.updateMatrixWorld(); }
function viewSize() { return { W: container.clientWidth || 1, Hh: container.clientHeight || 1 }; }
function applyViewOffset() {
  const { W, Hh } = viewSize();
  const top = Math.min(insets.top, Hh * .8), bottom = Math.min(insets.bottom, Hh * .8 - top);
  const cy = top + (Hh - top - bottom) / 2;
  camera.setViewOffset(W, Hh, 0, Hh / 2 - cy, W, Hh); camera.updateProjectionMatrix();
}
function resize() {
  if (!renderer) return;
  const { W, Hh } = viewSize();
  renderer.setSize(W, Hh); camera.aspect = W / Hh;
  // champ horizontal ~22° : presque isométrique, l'île garde ses proportions en portrait comme en paysage
  camera.fov = clamp(2 * Math.atan(Math.tan(11 * Math.PI / 180) / camera.aspect) * 180 / Math.PI, 24, 50);
  applyViewOffset(); fitCache = {};
}
// points à faire tenir dans la zone visible : le rivage de l'île (ou des îles), un peu au-dessus du sol
function framePoints(which) {
  const ids = which === 'all' ? islands.map((_, i) => i) : [which], pts = [];
  for (const i of ids) { const o = islandPos(i); OUTLINE.forEach(([x, z], n) => { if (n % 3 === 0) pts.push(new THREE.Vector3(o.x + x * .97, 0.1, o.z + z * .99)); }); pts.push(new THREE.Vector3(o.x, 0.9, o.z - 3.2)); }
  return pts;
}
function screenBox(pts) {
  const { W, Hh } = viewSize(); let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; const v = new THREE.Vector3();
  for (const p of pts) { v.copy(p).project(camera); const sx = (v.x + 1) / 2 * W, sy = (1 - v.y) / 2 * Hh; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); }
  return { x0, x1, y0, y1 };
}
function computeFit(which) {
  if (fitCache[which]) return fitCache[which];
  const { W, Hh } = viewSize(); const pts = framePoints(which); if (!pts.length) return { tx: 0, tz: 0, dist: 30 };
  const top = Math.min(insets.top, Hh * .8), bottom = Math.min(insets.bottom, Hh * .8 - top), vh = Hh - top - bottom, m = Math.min(W, vh) * 0.015;
  let tx = pts.reduce((s, p) => s + p.x, 0) / pts.length, tz = pts.reduce((s, p) => s + p.z, 0) / pts.length, dist = 30;
  for (let it = 0; it < 3; it++) {
    let lo = 4, hi = 300;
    for (let s = 0; s < 32; s++) { const mid = (lo + hi) / 2; placeCamera(tx, tz, mid); const b = screenBox(pts); if (b.x1 - b.x0 <= W - 2 * m && b.y1 - b.y0 <= vh - 2 * m) hi = mid; else lo = mid; }
    dist = hi; placeCamera(tx, tz, dist); const b = screenBox(pts);
    const wpp = 2 * dist * Math.tan(camera.fov * Math.PI / 360) / Hh; // unités monde par pixel à la cible
    tx += ((b.x0 + b.x1) / 2 - W / 2) * wpp;
    tz += ((b.y0 + b.y1) / 2 - (top + vh / 2)) * wpp / Math.sin(PITCH);
  }
  placeCamera(tx, tz, dist); // re-cadre après le dernier recentrage
  const out = { tx, tz, dist }; fitCache[which] = out; placeCamera(cur.tx, cur.tz, cur.dist); return out;
}
function goalCam() { const f = computeFit(goal.focus); return { tx: f.tx + goal.panX, tz: f.tz + goal.panZ, dist: f.dist * goal.zoom }; }
Scene.setInsets = function ({ top = 0, bottom = 0 } = {}) {
  insets = { top: Math.max(0, top), bottom: Math.max(0, bottom) }; if (!renderer) return;
  applyViewOffset(); fitCache = {};
  if (!flight) { const g = goalCam(); Object.assign(cur, g); }
};
// cadre l'île i en entier dans la zone visible (vol au-dessus de l'eau si on change d'île)
Scene.focus = function (i, { instant = false } = {}) {
  if (!Scene.ready || !islands[i]) return;
  goal.focus = i; goal.panX = 0; goal.panZ = 0; goal.zoom = 1; camInit = true;
  const to = goalCam();
  if (instant) { flight = null; Object.assign(cur, to); return; }
  const from = { ...cur }, far = Math.abs(to.tx - from.tx) > 4;
  flight = tween(far ? 1500 : 800, p => {
    cur.tx = from.tx + (to.tx - from.tx) * p; cur.tz = from.tz + (to.tz - from.tz) * p;
    cur.dist = from.dist + (to.dist - from.dist) * p + (far ? Math.sin(p * Math.PI) * to.dist * .28 : 0);
  }, { easing: ease.inOutCubic, done: () => { flight = null; } });
};
// toutes les îles à la fois (fin de partie)
Scene.overview = function () {
  if (!islands.length) return; goal.focus = 'all'; goal.panX = goal.panZ = 0; goal.zoom = 1;
  const to = goalCam(), from = { ...cur };
  flight = tween(1400, p => { cur.tx = from.tx + (to.tx - from.tx) * p; cur.tz = from.tz + (to.tz - from.tz) * p; cur.dist = from.dist + (to.dist - from.dist) * p; }, { easing: ease.inOutCubic, done: () => { flight = null; } });
};
Scene.screenPos = function (pi, k) {
  const isl = islands[pi]; if (!isl) return null; const c = CELLS[CI[k]];
  const v = new THREE.Vector3(c.x, isl.cells[k].top + 0.3, c.z); isl.group.localToWorld(v); v.project(camera);
  const rect = renderer.domElement.getBoundingClientRect();
  return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height };
};
function tickCamera(dt) {
  if (!flight) {
    const g = goalCam(), k = 1 - Math.exp(-dt * 14);
    cur.tx += (g.tx - cur.tx) * k; cur.tz += (g.tz - cur.tz) * k; cur.dist += (g.dist - cur.dist) * k;
  }
  placeCamera(cur.tx, cur.tz, cur.dist);
}

/* ================= Tactile : un doigt glisse, deux doigts pincent, un toucher court joue ================= */
function islandOf(o) { while (o) { const isl = islands.find(s => s.group === o); if (isl) return isl; o = o.parent; } return null; }
function setPointer(cx, cy) { const rect = renderer.domElement.getBoundingClientRect(); pointer.x = ((cx - rect.left) / rect.width) * 2 - 1; pointer.y = -((cy - rect.top) / rect.height) * 2 + 1; raycaster.setFromCamera(pointer, camera); }
function pick(cx, cy) {
  setPointer(cx, cy);
  const objs = []; islands.forEach(isl => objs.push(isl.terrain, isl.props, isl.water));
  for (const h of raycaster.intersectObjects(objs, true)) {
    const isl = islandOf(h.object); if (!isl) continue;
    if (h.object.userData && h.object.userData.k) return { pi: isl.idx, k: h.object.userData.k };
    const local = isl.group.worldToLocal(h.point.clone());
    const n = nearestCell(local.x, local.z);
    if (hexDist(local.x - CELLS[n.i].x, local.z - CELLS[n.i].z) <= 1.0) return { pi: isl.idx, k: CELLS[n.i].k };
    return null;
  }
  return null;
}
const groundPlane = () => new THREE.Plane(new THREE.Vector3(0, 1, 0), -LOOK_Y);
function groundAt(cx, cy) { setPointer(cx, cy); const p = new THREE.Vector3(); return raycaster.ray.intersectPlane(groundPlane(), p) ? p : null; }
function bindPointer() {
  const el = renderer.domElement, pts = new Map();
  let tap = null, pinch0 = null;
  const stopFlight = () => { if (flight) { anims.splice(anims.indexOf(flight), 1); flight = null; const f = computeFit(goal.focus); goal.panX = clamp(cur.tx - f.tx, -PAN_X, PAN_X); goal.panZ = clamp(cur.tz - f.tz, -PAN_Z, PAN_Z); goal.zoom = clamp(cur.dist / f.dist, ZOOM_MIN, ZOOM_MAX); } };
  const pinchState = () => { const [a, b] = [...pts.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
  el.addEventListener('pointerdown', ev => {
    el.setPointerCapture && el.setPointerCapture(ev.pointerId);
    pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pts.size === 1) tap = { x: ev.clientX, y: ev.clientY, t: performance.now() };
    else { tap = null; pinch0 = pinchState(); }
    stopFlight();
  });
  el.addEventListener('pointermove', ev => {
    const p = pts.get(ev.pointerId); if (!p) return;
    const prev = { x: p.x, y: p.y }; p.x = ev.clientX; p.y = ev.clientY;
    if (tap && Math.hypot(p.x - tap.x, p.y - tap.y) > 9) tap = null;
    if (pts.size === 1) {
      if (tap) return; // on attend de savoir si c'est un glissé
      placeCamera(cur.tx, cur.tz, cur.dist);
      const a = groundAt(prev.x, prev.y), b = groundAt(p.x, p.y); if (!a || !b) return;
      goal.panX = clamp(goal.panX + (a.x - b.x), -PAN_X, PAN_X); goal.panZ = clamp(goal.panZ + (a.z - b.z), -PAN_Z, PAN_Z);
      cur.tx += a.x - b.x; cur.tz += a.z - b.z; // suit le doigt sans retard
      const f = computeFit(goal.focus); cur.tx = clamp(cur.tx, f.tx - PAN_X, f.tx + PAN_X); cur.tz = clamp(cur.tz, f.tz - PAN_Z, f.tz + PAN_Z);
    } else if (pts.size === 2 && pinch0) {
      const s = pinchState(); if (s.d < 10) return;
      goal.zoom = clamp(goal.zoom * pinch0.d / s.d, ZOOM_MIN, ZOOM_MAX); pinch0 = s;
    }
  });
  const up = ev => {
    if (!pts.has(ev.pointerId)) return;
    pts.delete(ev.pointerId);
    if (pts.size < 2) pinch0 = null;
    if (ev.type === 'pointerup' && tap && pts.size === 0 && performance.now() - tap.t < 600) {
      const h = pick(ev.clientX, ev.clientY); if (h) cb.onCellClick && cb.onCellClick(h.pi, h.k);
    }
    if (pts.size === 0) tap = null;
  };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', ev => { ev.preventDefault(); stopFlight(); goal.zoom = clamp(goal.zoom * Math.exp(ev.deltaY * 0.0012), ZOOM_MIN, ZOOM_MAX); }, { passive: false });
  el.addEventListener('contextmenu', ev => ev.preventDefault());
}

/* ================= Effets ================= */
function burst(isl, x, y, z, color = '#ffd36b') {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
  for (let i = 0; i < 18; i++) {
    const m = new THREE.Mesh(G.spark, mat); m.position.set(x, y, z);
    const a = Math.random() * Math.PI * 2, s = 1.2 + Math.random() * 1.6;
    m.userData = { v: new THREE.Vector3(Math.cos(a) * s, 2 + Math.random() * 2.2, Math.sin(a) * s), life: 0, mat };
    isl.group.add(m); particles.push(m);
  }
}
Scene.celebrate = function (pi, k) { const isl = islands[pi]; if (isl) { const c = CELLS[CI[k]]; burst(isl, c.x, isl.cells[k].top, c.z); } };

// mouettes qui tournent au-dessus de l'île regardée
function buildBirds() {
  const wingL = new THREE.BufferGeometry(); wingL.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.06, 0, 0, 0.07, -0.26, 0.02, 0], 3)); wingL.computeVertexNormals();
  const wingR = new THREE.BufferGeometry(); wingR.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.07, 0, 0, -0.06, 0.26, 0.02, 0], 3)); wingR.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ color: '#ffffff', side: THREE.DoubleSide, flatShading: true, emissive: '#cfd8e0', emissiveIntensity: .3 });
  const body = new THREE.ConeGeometry(0.035, 0.16, 4).rotateX(Math.PI / 2);
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Group(); const l = new THREE.Mesh(wingL, mat), r = new THREE.Mesh(wingR, mat);
    b.add(l, r, new THREE.Mesh(body, mat)); b.traverse(o => { if (o.isMesh) o.castShadow = true; });
    b.userData = { l, r, rad: 4 + Math.random() * 3.5, h: 3 + Math.random() * 2, sp: (0.22 + Math.random() * .18) * (i % 2 ? 1 : -1), ph: Math.random() * 6.28 };
    scene.add(b); birds.push(b);
  }
}
const _v = { x: 0, z: 0 };
function tickLife(t, dt) {
  _v.x = cur.tx; _v.z = cur.tz;
  birds.forEach((b, i) => { const u = b.userData; const a = u.ph + t * u.sp; b.position.set(_v.x + Math.cos(a) * u.rad, LOOK_Y + u.h + Math.sin(t * .7 + i) * .3, _v.z + Math.sin(a) * u.rad);
    b.rotation.y = -a + (u.sp > 0 ? 0 : Math.PI); const f = Math.sin(t * 6 + i) * .5; u.l.rotation.z = f; u.r.rotation.z = -f; });
  // fumée des cheminées
  for (const isl of islands) for (const cg of isl.props.children) for (const m of cg.children) {
    const ch = m.userData.chimney; if (!ch || m.scale.x < .9) continue;
    m.userData.smokeT = (m.userData.smokeT || Math.random()) - dt;
    if (m.userData.smokeT <= 0 && smoke.length < 40) {
      m.userData.smokeT = 0.7 + Math.random() * .4;
      const p = new THREE.Mesh(G.blob, M.smoke); p.position.set(...ch); m.localToWorld(p.position);
      p.scale.setScalar(0.04); p.userData = { life: 0, dx: (Math.random() - .5) * .1 }; scene.add(p); smoke.push(p);
    }
  }
  for (let i = smoke.length - 1; i >= 0; i--) { const p = smoke[i], u = p.userData; u.life += dt; p.position.y += dt * .35; p.position.x += (u.dx + .06) * dt; p.scale.setScalar((.04 + u.life * .06) * (u.life > 1.8 ? Math.max(0.01, (2.4 - u.life) / .6) : 1)); if (u.life > 2.4) { scene.remove(p); smoke.splice(i, 1); } }
}

/* ================= Boucle ================= */
const SUN_OFF = () => new THREE.Vector3(...ST.sunDir);
let sunOff = null;
function loop() {
  const now = performance.now(), dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  for (let i = anims.length - 1; i >= 0; i--) { const a = anims[i]; if (now < a.t0) continue; const p = Math.min(1, (now - a.t0) / a.dur); a.fn(a.easing(p)); if (p >= 1) { anims.splice(i, 1); a.done && a.done(); } }
  waterUniforms.uTime.value = t;
  // pulsation des cases jouables (comme les cases atteignables d'un jeu de stratégie)
  const pulse = 0.5 + 0.5 * Math.sin(t * 4);
  for (const k in M.hl) { const m = M.hl[k]; m.edge.opacity = (k === 'pattern' ? .45 : .6) + .4 * pulse; if (m.veil) m.veil.uniforms.uOpacity.value = .3 + .4 * pulse; m.fill.opacity = (k === 'pattern' ? .28 : .12) + .12 * pulse; }
  for (const isl of islands) {
    for (const cg of isl.props.children) for (const m of cg.children) { const s = m.userData.sway; if (s) { m.rotation.z = Math.sin(t * 1.3 + m.userData.px * 3 + m.userData.pz) * 0.025 * s; m.rotation.x = Math.cos(t * 1.1 + m.userData.pz * 2) * 0.015 * s; } }
    tickAnimals(isl, t, dt);
    for (const k in isl.cells) { const gc = isl.cells[k].ghostCube; if (gc && gc.visible) { const c = CELLS[CI[k]]; gc.position.set(c.x, isl.cells[k].top + 0.5 + Math.sin(t * 3 + c.x) * 0.08, c.z); gc.rotation.y = t * 1.2; } }
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const m = particles[i], u = m.userData; u.life += dt; u.v.y -= 6 * dt; m.position.addScaledVector(u.v, dt);
    u.mat.opacity = Math.max(0, 1 - u.life / 0.9); m.scale.setScalar(1 - u.life * 0.6);
    if (u.life > 0.9) { m.parent && m.parent.remove(m); particles.splice(i, 1); }
  }
  tickCamera(dt);
  // une île hors champ ne coûte rien (ni rendu ni passe d'ombre)
  const span = 12.5 + Math.max(0, cur.dist - 32) * .5;
  for (const isl of islands) isl.group.visible = Math.abs(isl.group.position.x - cur.tx) < span;
  tickLife(t, dt);
  if (cloudBank) cloudBank.position.y = Math.sin(t * .4) * .05;
  sunOff = sunOff || SUN_OFF();
  sun.target.position.set(cur.tx, 0, cur.tz); sun.position.set(cur.tx + sunOff.x, sunOff.y, cur.tz + sunOff.z);
  // l'ombre couvre ce qu'on regarde : plus large quand on dézoome
  const sc = sun.shadow.camera, ext = clamp(cur.dist * .3, 7, 16);
  if (Math.abs(sc.right - ext) > .5) { sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.updateProjectionMatrix(); }
  renderer.render(scene, camera);
}
})();
