/* Verdance — le monde vivant. Chaque île est un terrain continu sculpté par les jetons :
   les montagnes émergent et se soudent en chaînes, les rivières se creusent et coulent,
   les forêts se densifient, les champs se labourent, les maisons forment des hameaux.
   Ne connaît pas les règles : l'interface lui dit quoi éclairer via sync(state, view). */
(function () {
'use strict';
const Scene = window.Scene = { ready: false };
let THREE, OrbitControls, mergeGeometries, GLTFLoader, skClone;
let renderer, scene, camera, controls, clock, raycaster, pointer, sun, container;
let islands = [], clouds = [], anims = [], particles = [], birds = [], smoke = [];
let cb = {};
let view = { activeIdx: -1, legal: [], targets: [], patternHi: [], ghostColor: null };
let hover = null;
let showTokens = false;
let lastState = null;
const M = {}, G = {};
let waterUniforms;

const SQ3 = Math.sqrt(3), ISLAND_GAP = 13.5, WATER_Y = -0.1, STEP = 0.17;
const CELLS = H.BOARD_CELLS.map(c => ({ k: c.k, x: 1.5 * c.col - 3, z: SQ3 * (c.row + 0.5 * (c.col % 2)) - 2 * SQ3 }));
const CI = Object.fromEntries(CELLS.map((c, i) => [c.k, i]));
const PAIRS = []; CELLS.forEach((c, i) => H.neighborsK(c.k).forEach(n => { const j = CI[n]; if (j > i) PAIRS.push([i, j]); }));
const islandPos = i => new THREE.Vector3(i * ISLAND_GAP, i % 2 ? -0.6 : 0, i % 2 ? -1.4 : 0);
const PEAK = [0, 0.85, 1.8, 2.85];

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
function tween(dur, fn, { delay = 0, easing = ease.outCubic, done } = {}) { anims.push({ t0: performance.now() + delay, dur, fn, easing, done }); fn(0); }

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
// distance hexagonale normalisée (0 au centre, 1 sur le bord ; case de rayon 1 à sommet plat)
function hexDist(dx, dz) { const ax = Math.abs(dx), az = Math.abs(dz); return Math.max(az / (SQ3 / 2), ax + az / SQ3); }

/* ================= Grille du terrain (commune à toutes les îles) ================= */
const GRID = (() => {
  const pts = [];
  const x0 = -5.25, x1 = 5.25, z0 = -5.2, z1 = 5.95;
  const nx = Math.ceil((x1 - x0) / STEP) + 1, nz = Math.ceil((z1 - z0) / STEP) + 1;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    let x = x0 + i * STEP, z = z0 + j * STEP;
    let si = signedInside(x, z);
    if (si > STEP * .6) { x += (hash2(i * 1.7, j * 3.1) - .5) * STEP * .45; z += (hash2(i * 5.3, j * .7) - .5) * STEP * .45; si = signedInside(x, z); }
    else if (si > -STEP * 1.2 && si < STEP * .35) { const n = outlineNearest(x, z); x = n.x; z = n.z; si = 0; }
    pts.push({ x, z, ok: si >= 0, si: Math.max(si, 0) });
  }
  const tris = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    const pair = (i + j) % 2 ? [[a, c, b], [b, c, d]] : [[a, c, d], [a, d, b]];
    for (const t of pair) {
      if (!t.every(v => pts[v].ok)) continue;
      const P = t.map(v => pts[v]);
      if (Math.abs((P[1].x - P[0].x) * (P[2].z - P[0].z) - (P[2].x - P[0].x) * (P[1].z - P[0].z)) < 1e-4) continue;
      tris.push(...t);
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
  // cascades : une extrémité de rivière en bord de plateau se jette dans le vide
  const falls = [];
  const ends = lr.length >= 2 ? [CI[lr.path[0]], CI[lr.path[lr.path.length - 1]]] : [];
  for (const i of ends) {
    if (H.neighborsK(CELLS[i].k).length >= 6) continue;
    const c = CELLS[i]; const len = Math.hypot(c.x, c.z - 0.4) || 1; const dx = c.x / len, dz = (c.z - 0.4) / len;
    const o = outlineNearest(c.x + dx * 1.6, c.z + dz * 1.6);
    if (Math.hypot(o.x - c.x, o.z - c.z) > 2.5 || falls.length >= 1) continue;
    segs.push({ ax: c.x, az: c.z, bx: o.x + (o.x - c.x) * .1, bz: o.z + (o.z - c.z) * .1, fall: true });
    falls.push({ x: o.x, z: o.z, dx: o.x - c.x, dz: o.z - c.z });
  }
  return { info, mtnPairs, housePairs, segs, pools, falls, fieldAngle: 0.5 + islIdx * 0.9 };
}

/* ================= Relief ================= */
function carveAt(A, x, z) {
  let dw = Infinity;
  for (const s of A.segs) dw = Math.min(dw, segDist(x, z, s.ax, s.az, s.bx, s.bz)[0] + (s.fall ? 0.06 : 0));
  for (const i of A.pools) dw = Math.min(dw, Math.hypot(x - CELLS[i].x, z - CELLS[i].z) - 0.12);
  if (dw === Infinity) return 0;
  return smooth(0.56, 0.2, dw + (fbm(x * 2.2, z * 2.2) - .5) * 0.16);
}
function heightAt(A, x, z, si) {
  let y = 0.035 + (fbm(x * .8 + 3, z * .8) - .5) * 0.06, mtn = 0;
  const info = A.info;
  for (let i = 0; i < CELLS.length; i++) {
    const f = info[i]; if (f.kind === 'empty') continue;
    const c = CELLS[i]; const d = Math.hypot(x - c.x, z - c.z); if (d > 1.9) continue;
    const w = smooth(1.0, 0.5, d);
    if (f.kind === 'mountain') {
      const r = 1.05 + 0.14 * f.h, ff = Math.max(0, 1 - d / r);
      let hm = PEAK[f.h] * Math.pow(ff, 1.3) * (0.82 + 0.36 * fbm(x * 1.7 + i, z * 1.7));
      hm += ridged(x * 2.6 + i, z * 2.6) * 0.2 * f.h * ff;
      mtn = Math.max(mtn, hm);
    } else if (f.kind === 'forest') y += 0.06 * w * (0.5 + fbm(x * 3, z * 3));
    else if (f.kind === 'field') y = y * (1 - w) + 0.045 * w;
    else if (f.kind === 'house' || f.kind === 'foundation') y = y * (1 - w * .85) + 0.05 * w * .85;
  }
  for (const [a, b] of A.mtnPairs) {
    const ca = CELLS[a], cb2 = CELLS[b]; const [ds, t] = segDist(x, z, ca.x, ca.z, cb2.x, cb2.z);
    if (ds > 0.95) continue;
    const pa = PEAK[info[a].h], pb = PEAK[info[b].h];
    const hp = (pa + (pb - pa) * t) * (0.55 + 0.12 * Math.sin(t * Math.PI));
    mtn = Math.max(mtn, hp * Math.pow(Math.max(0, 1 - ds / 0.95), 1.4) * (0.8 + 0.4 * fbm(x * 2 + 7, z * 2)));
  }
  y = Math.max(y, mtn);
  if (si === undefined) si = Math.max(0, signedInside(x, z));
  y *= smooth(0, 0.55, si);
  const c = carveAt(A, x, z);
  return y * (1 - c) + (-0.3) * c;
}
let PAL;
function colorAt(A, x, z, y, ny, faceN) {
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
  else if ((y > 0.28 && (kw.mountain || 0) > 0.05) || y > 0.45) {
    const snowLine = 1.55 + (fbm(x * 1.3, z * 1.3) - .5) * .5;
    if (y > snowLine && ny > 0.45) col = PAL.snow;
    else col = ny < 0.6 ? PAL.rockDark : pick(PAL.rock, PAL.rock2);
  } else {
    switch (dom) {
      case 'forest': col = pick(PAL.forest, PAL.forest2); break;
      case 'field': { const a = A.fieldAngle; const u = x * Math.cos(a) + z * Math.sin(a); col = Math.sin(u * 15) > 0 ? PAL.wheat : PAL.wheat2; break; }
      case 'house': case 'foundation': {
        let onPath = false; for (const [a, b] of A.housePairs) if (segDist(x, z, CELLS[a].x, CELLS[a].z, CELLS[b].x, CELLS[b].z)[0] < 0.11) onPath = true;
        col = onPath ? PAL.path : pick(PAL.lawn, PAL.lawn2); break;
      }
      case 'clearing': col = pick(PAL.dirt, PAL.dirt2); break;
      case 'mountain': col = PAL.foothill; break;
      case 'water': col = PAL.bank; break;
      case 'empty': col = pick(PAL.sand, PAL.sand2); break;
      default: col = pick(PAL.meadow, PAL.meadow2);
    }
  }
  return col.clone().multiplyScalar(1 + (faceN - .5) * 0.08);
}

/* ================= Initialisation ================= */
Scene.init = async function (el, callbacks) {
  cb = callbacks || {};
  container = el;
  try {
    THREE = await import('three');
    ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
    ({ mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js'));
  } catch (e) { cb.onError && cb.onError(e); return; }
  try { ({ GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js')); ({ clone: skClone } = await import('three/addons/utils/SkeletonUtils.js')); } catch (e) { GLTFLoader = null; }
  const C = hex => new THREE.Color(hex);
  PAL = {
    sand: C('#e7d6a6'), sand2: C('#dfcb96'), meadow: C('#8dbb55'), meadow2: C('#7fae4b'),
    forest: C('#5f9b3f'), forest2: C('#548f39'), wheat: C('#e7bd4c'), wheat2: C('#d4a53b'),
    lawn: C('#93c25d'), lawn2: C('#88b854'), path: C('#d2b27a'), dirt: C('#a5805a'), dirt2: C('#98734f'),
    rock: C('#9c8070'), rock2: C('#8c705f'), rockDark: C('#76604f'), snow: C('#f5f4ef'), foothill: C('#8f9a5c'),
    bank: C('#d6c48f'), bed: C('#8fae8c'), bedDeep: C('#5f8f86'),
  };
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(el.clientWidth, el.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  el.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#f1dfc0', 36, 80);
  camera = new THREE.PerspectiveCamera(34, el.clientWidth / el.clientHeight, 0.1, 220);
  camera.position.set(0, 14.5, 13);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 6; controls.maxDistance = 28;
  controls.minPolarAngle = 0.02; controls.maxPolarAngle = 1.25;
  controls.rotateSpeed = 0.6; controls.zoomSpeed = 0.8; controls.autoRotateSpeed = 0.5;
  controls.target.set(0, 0.3, 0.4);

  scene.add(new THREE.HemisphereLight('#fff4de', '#6f6248', 1.2));
  sun = new THREE.DirectionalLight('#fff0d2', 2.6);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -8; sc.right = 8; sc.top = 8; sc.bottom = -8; sc.near = 1; sc.far = 45;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.025; sun.shadow.radius = 3;
  scene.add(sun); scene.add(sun.target);
  const fill = new THREE.DirectionalLight('#cfe3ff', 0.55); fill.position.set(-8, 6, -6); scene.add(fill);

  buildShared();
  buildClouds();
  buildBirds();
  raycaster = new THREE.Raycaster(); pointer = new THREE.Vector2();
  clock = new THREE.Clock();
  bindPointer();
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(el);
  Scene.ready = true;
  renderer.setAnimationLoop(loop);
  cb.onReady && cb.onReady();
};
let framing = { x: 0, y: 0, dist: 1 };
function resize() {
  if (!renderer) return;
  const w = container.clientWidth, h = container.clientHeight;
  renderer.setSize(w, h); camera.aspect = w / h; camera.fov = w / h < 0.9 ? 46 : 34; applyFraming();
}
function applyFraming() { const w = container.clientWidth, h = container.clientHeight; camera.setViewOffset(w, h, -framing.x * w, framing.y, w, h); camera.updateProjectionMatrix(); }
Scene.setFraming = function (f) {
  const changed = f.dist !== framing.dist; framing = Object.assign({}, f); if (!renderer) return; applyFraming();
  if (changed) { const off = camera.position.clone().sub(controls.target).setLength(defaultOffset().length()); camera.position.copy(controls.target).add(off); }
};

/* ================= Géométries et matériaux ================= */
function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo; g.deleteAttribute('uv'); g.deleteAttribute('normal');
  const c = typeof hex === 'string' ? new THREE.Color(hex) : hex; const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
function jitter(g, amt, seed) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); p.setXYZ(i, x + (hash2(x * 31.7 + seed, y * 17.3 + z * 13.1) - .5) * amt, y + (hash2(z * 23.1 + seed, x * 7.7 + y) - .5) * amt * .7, z + (hash2(y * 11 + seed, z * 3 + x) - .5) * amt); } return g; }
function merge(list) { const g = mergeGeometries(list); g.computeVertexNormals(); return g; }
function buildShared() {
  M.props = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });
  M.terrain = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
  M.window = new THREE.MeshStandardMaterial({ color: '#ffd777', emissive: '#ffb347', emissiveIntensity: .7, flatShading: true });
  M.cube = new THREE.MeshStandardMaterial({ color: '#ee8d2a', roughness: .45, emissive: '#ff8a1a', emissiveIntensity: .15 });
  M.cubeGhost = new THREE.MeshStandardMaterial({ color: '#ee8d2a', emissive: '#ff7a10', emissiveIntensity: .35, transparent: true, opacity: .85 });
  M.grid = new THREE.MeshBasicMaterial({ color: '#4a3a1f', transparent: true, opacity: .3, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const hl = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .3, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  M.hl = { legal: [hl('#3fc18e'), hl('#25a370')], target: [hl('#ffa347'), hl('#f07f1a')], pattern: [hl('#ffe7b0'), hl('#ffd27a')], hover: [hl('#ffffff'), hl('#ffffff')] };
  M.hl.hover[0].opacity = .35;
  M.smoke = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 1, transparent: true, opacity: .55, flatShading: true, depthWrite: false });
  M.cloud = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#fff1e0', emissiveIntensity: .45, flatShading: true });
  const tokCol = { blue: '#3a8ec4', gray: '#9aa0a8', brown: '#8d5a36', green: '#5ea544', yellow: '#efbb3c', red: '#d14b35' };
  M.tok = {}; M.tokGhost = {};
  for (const k in tokCol) { M.tok[k] = new THREE.MeshStandardMaterial({ color: tokCol[k], roughness: .6 }); M.tokGhost[k] = new THREE.MeshStandardMaterial({ color: tokCol[k], roughness: .5, transparent: true, opacity: .7, emissive: tokCol[k], emissiveIntensity: .25 }); }
  const e = 0.03, R = 0.3, Hh = 0.1, prof = [[0, 0], [R - e, 0], [R, e], [R, Hh - e], [R - e, Hh], [0, Hh]];
  G.token = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 28);
  G.cube = new THREE.BoxGeometry(0.22, 0.22, 0.22);
  G.spark = new THREE.IcosahedronGeometry(0.05, 0);
  G.cloudBlob = new THREE.IcosahedronGeometry(1, 1);

  waterUniforms = { uTime: { value: 0 } };
  const noiseGLSL = `
    float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
      return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x), u.y); }`;
  M.water = new THREE.ShaderMaterial({
    uniforms: waterUniforms, transparent: true,
    vertexShader: `attribute vec2 flow; attribute float depth; varying vec2 vFlow; varying float vDepth; varying vec3 vW; uniform float uTime;
      void main(){ vec4 w = modelMatrix*vec4(position,1.); w.y += sin(w.x*3.1+uTime*1.6)*.008 + cos(w.z*2.7+uTime*1.3)*.008;
        vW=w.xyz; vFlow=flow; vDepth=depth; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float uTime; varying vec2 vFlow; varying float vDepth; varying vec3 vW; ${noiseGLSL}
      void main(){
        float sp = length(vFlow);
        vec2 p = vW.xz*3.2 - vFlow*uTime*0.9;
        float n = vn(p)*.6 + vn(p*2.3+3.7 - vFlow*uTime*.6)*.4;
        float streak = smoothstep(.6,.82,n) * (.35 + .65*sp);
        float rip = smoothstep(.72,.9, vn(vW.xz*5. + vec2(uTime*.3, -uTime*.25)));
        vec3 shallow = vec3(.42,.80,.82), deep = vec3(.11,.47,.66);
        vec3 col = mix(shallow, deep, smoothstep(0.,1.,vDepth));
        col += streak*.22 + rip*.08*(1.-sp);
        float foam = smoothstep(.28, .0, vDepth) * (.55 + .45*vn(vW.xz*9. + uTime*.8));
        col = mix(col, vec3(.97,.99,1.), foam*.75);
        gl_FragColor = vec4(col, .9 - foam*.1);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  M.fall = new THREE.ShaderMaterial({
    uniforms: waterUniforms, transparent: true, side: THREE.DoubleSide, depthWrite: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv; ${noiseGLSL}
      void main(){
        float n = vn(vec2(vUv.x*9., vUv.y*3. + uTime*2.6))*.65 + vn(vec2(vUv.x*21., vUv.y*7. + uTime*4.))*.35;
        vec3 col = mix(vec3(.45,.78,.9), vec3(.97,.99,1.), smoothstep(.45,.8,n));
        float edge = smoothstep(0.,.18,vUv.x)*smoothstep(1.,.82,vUv.x);
        float fade = smoothstep(0.,.75,vUv.y);
        gl_FragColor = vec4(col, edge*fade*(.75+.25*n));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/* ================= Bibliothèque d'objets procéduraux ================= */
const LEAF = [['#8cc63f', '#79b336'], ['#a5cf4c', '#8dbb3e'], ['#62a03b', '#4f8c33'], ['#b6d65a', '#97c049']];
const PINE = ['#2f7d4a', '#378c52', '#43995b', '#2a6f43'];
function makePine(r, s) {
  const parts = [paint(new THREE.CylinderGeometry(0.028, 0.045, 0.22, 5).translate(0, 0.11, 0), '#6b4428')];
  const n = 3 + (r() < .5 ? 1 : 0), base = r() * 4 | 0, sy = 0.9 + r() * .35;
  for (let l = 0; l < n; l++) {
    const rad = 0.25 * (1 - l * 0.2), hh = 0.34;
    const g = new THREE.ConeGeometry(rad, hh, 7).rotateY(r() * 6).translate(0, 0.17 + l * 0.17 + hh / 2, 0);
    parts.push(paint(jitter(g, 0.03, r() * 10), PINE[(base + l) % 4]));
  }
  return { geo: merge(parts.map(g => g.scale(s, s * sy, s))), top: s * sy * (0.17 + (n - 1) * 0.17 + 0.34) };
}
function makeRound(r, s) {
  const pal = LEAF[r() * LEAF.length | 0], th = 0.3 + r() * .1;
  const parts = [paint(new THREE.CylinderGeometry(0.03, 0.05, th, 5).translate(0, th / 2, 0).rotateZ((r() - .5) * .15), '#6f4629')];
  const nb = 2 + (r() * 2 | 0);
  for (let b = 0; b < nb; b++) {
    const rad = 0.17 + r() * 0.09; const a = r() * 6.28, d = b ? 0.1 + r() * .06 : 0;
    const g = new THREE.IcosahedronGeometry(rad, b === 0 ? 1 : 0).scale(1, .86, 1).translate(Math.cos(a) * d, th + rad * .55 + (b ? -0.04 + r() * .08 : 0.04), Math.sin(a) * d);
    parts.push(paint(jitter(g, 0.035, r() * 10), pal[b % 2]));
  }
  return { geo: merge(parts.map(g => g.scale(s, s, s))), top: s * (th + 0.45) };
}
function makeBush(r, s) {
  const pal = LEAF[r() * LEAF.length | 0], parts = [];
  for (let b = 0; b < 3; b++) { const rad = 0.08 + r() * .05; parts.push(paint(jitter(new THREE.IcosahedronGeometry(rad, 0).translate((r() - .5) * .14, rad * .7, (r() - .5) * .14), .02, r() * 9), pal[b % 2])); }
  return { geo: merge(parts.map(g => g.scale(s, s, s))), top: 0.2 * s };
}
function makeRock(r, s, tint = '#9a968e') {
  const g = new THREE.DodecahedronGeometry(0.1, 0).scale(1 + r() * .7, .55 + r() * .45, 1 + r() * .5).rotateY(r() * 6).translate(0, 0.03, 0);
  const c = new THREE.Color(tint).multiplyScalar(.9 + r() * .2);
  return { geo: merge([paint(jitter(g, .03, r() * 9), c).scale(s, s, s)]), top: 0.1 * s };
}
function prism(w, h, d) { const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(0, h); sh.closePath(); return new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2); }
const ROOFS = ['#b5452f', '#a23f2c', '#8a4a33', '#c25e37', '#56708c'];
const WALLS = { brown: ['#c9945e', '#b98450'], gray: ['#d3cec4', '#bfb9ae'], red: ['#df9a74', '#cf8862'] };
function makeHouse(r, base) {
  const parts = [], wins = [];
  const [wc, wc2] = WALLS[base] || WALLS.brown, roof = ROOFS[r() * ROOFS.length | 0];
  const body = (w, h, d, ox, oz, rot) => {
    const g = [paint(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), wc), paint(prism(w + 0.09, 0.2 + r() * .06, d + 0.08).translate(0, h, 0), roof),
      paint(new THREE.BoxGeometry(0.08, 0.14, 0.012).translate(-w * .2, 0.07, d / 2 + .005), '#5a3a22')];
    g.forEach(x => x.rotateY(rot).translate(ox, 0, oz)); parts.push(...g);
    const w1 = new THREE.BoxGeometry(0.07, 0.07, 0.012).translate(w * .22, h * .58, d / 2 + .005), w2 = new THREE.BoxGeometry(0.012, 0.07, 0.07).translate(w / 2 + .005, h * .58, 0);
    for (const x of [w1, w2]) { x.deleteAttribute('uv'); wins.push(x.rotateY(rot).translate(ox, 0, oz)); }
  };
  const w = 0.38 + r() * .1, d = 0.32 + r() * .06, h = 0.26 + r() * .06;
  body(w, h, d, 0, 0, 0);
  if (r() < .45) body(w * .62, h * .8, d * .7, w * .5, -d * .25, Math.PI / 2);
  parts.push(paint(new THREE.BoxGeometry(0.06, 0.15, 0.06).translate(-w * .25, h + 0.12, -d * .15), wc2));
  return { geo: merge(parts), winGeo: mergeGeometries(wins), top: h + 0.3, chimney: [-w * .25, h + 0.22, -d * .15] };
}
function makeTuft(r) { const parts = []; for (let i = 0; i < 3; i++) { const g = new THREE.ConeGeometry(0.016, 0.15 + r() * .05, 3).translate(0, 0.08, 0).rotateZ((r() - .5) * .5).rotateX((r() - .5) * .4).translate((r() - .5) * .04, 0, (r() - .5) * .04); parts.push(paint(g, r() < .5 ? '#e2b648' : '#cf9f35')); } return parts; }
function makeHay() { return merge([paint(new THREE.CylinderGeometry(0.075, 0.075, 0.12, 9).rotateZ(Math.PI / 2).translate(0, 0.075, 0), '#dcb456'), paint(new THREE.CylinderGeometry(0.06, 0.06, 0.122, 9).rotateZ(Math.PI / 2).translate(0, 0.075, 0), '#ecd27e')]); }
function makeStump(r, s) { return merge([paint(new THREE.CylinderGeometry(0.05, 0.065, 0.07, 7).translate(0, 0.035, 0), '#7a5233'), paint(new THREE.CylinderGeometry(0.045, 0.045, 0.004, 7).translate(0, 0.072, 0), '#d8b07a')].map(g => g.scale(s, s, s))); }
function makeLogs(r) { const p = []; [[0, .035, 0], [0, .035, .075], [0, .095, .037]].forEach(([x, y, z]) => p.push(paint(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 6).rotateZ(Math.PI / 2).translate(x, y, z), r() < .5 ? '#7a5233' : '#6b4629'))); return merge(p); }
function makeScaffold() {
  const p = [paint(new THREE.BoxGeometry(0.46, 0.06, 0.38).translate(0, 0.03, 0), '#b9ad98')];
  for (const [x, z] of [[-.2, -.16], [.2, -.16], [-.2, .16], [.2, .16]]) p.push(paint(new THREE.BoxGeometry(0.025, 0.3, 0.025).translate(x, 0.21, z), '#9c7448'));
  p.push(paint(new THREE.BoxGeometry(0.44, 0.025, 0.025).translate(0, 0.35, -.16), '#9c7448'), paint(new THREE.BoxGeometry(0.44, 0.025, 0.025).translate(0, 0.35, .16), '#9c7448'));
  p.push(paint(new THREE.BoxGeometry(0.3, 0.05, 0.12).translate(0.05, 0.09, 0.02), '#c96848'));
  return merge(p);
}
function makeReed(r) { const p = []; for (let i = 0; i < 4; i++) p.push(paint(new THREE.ConeGeometry(0.012, 0.18 + r() * .1, 3).translate((r() - .5) * .06, 0.1, (r() - .5) * .06).rotateZ((r() - .5) * .3), r() < .5 ? '#5d8a3a' : '#4c7a30')); p.push(paint(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 5).translate(0, 0.22, 0), '#6b4428')); return merge(p); }
function makeLily(r) { const p = [paint(new THREE.CylinderGeometry(0.06, 0.06, 0.008, 7), '#5c9e48')]; if (r() < .4) p.push(paint(new THREE.IcosahedronGeometry(0.022, 0).translate(0.02, 0.015, 0), '#f6d6e4')); return merge(p); }
function makeFlower(r) { return merge([paint(new THREE.ConeGeometry(0.008, 0.08, 3).translate(0, .04, 0), '#5d8a3a'), paint(new THREE.IcosahedronGeometry(0.022, 0).translate(0, 0.085, 0), ['#f4f0e6', '#f2b6c6', '#f7d65a', '#b9a6f0'][r() * 4 | 0])]); }

/* ================= Île ================= */
function buildIsland(i) {
  const g = new THREE.Group(); g.position.copy(islandPos(i));
  // socle : bord herbeux (sans dessus, le terrain le recouvre) et strates rocheuses
  const shape = new THREE.Shape(OUTLINE.map(([x, z]) => new THREE.Vector2(x, -z)));
  const slab = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.12, bevelSegments: 2, curveSegments: 1 });
  slab.rotateX(-Math.PI / 2); slab.translate(0, -0.4, 0);
  const slabMesh = new THREE.Mesh(slab, [new THREE.MeshBasicMaterial({ visible: false }), new THREE.MeshStandardMaterial({ color: '#7fae4b', roughness: .9, flatShading: true })]);
  slabMesh.castShadow = true; g.add(slabMesh);
  const strata = [[0.98, '#b48a5c'], [0.88, '#9b7149'], [0.72, '#80593a'], [0.52, '#674731'], [0.3, '#523829']];
  let y = -0.4;
  strata.forEach(([s, col], j) => {
    const sh = new THREE.Shape(OUTLINE.filter((_, n) => n % 3 === 0).map(([x, z]) => new THREE.Vector2(x * s, -(z * s + 0.25 * j))));
    const depth = 0.6 + j * 0.14;
    const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2); geo.translate(0, y - depth, 0);
    const pos = geo.attributes.position;
    for (let v = 0; v < pos.count; v++) { const px = pos.getX(v), py = pos.getY(v), pz = pos.getZ(v); const n = hash2(Math.round(px * 10) + i, Math.round(pz * 10) + Math.round(py * 10) * 7); const k = 1 + (n - .5) * .14; pos.setX(v, px * k); pos.setZ(v, pz * k); if (j) pos.setY(v, py - n * .14); }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col, roughness: .95, flatShading: true })); m.castShadow = true; g.add(m); y -= depth;
  });
  // terrain
  const nT = GRID.tris.length;
  const tgeo = new THREE.BufferGeometry();
  tgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nT * 3), 3));
  tgeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nT * 3), 3));
  const terrain = new THREE.Mesh(tgeo, M.terrain); terrain.receiveShadow = true; terrain.castShadow = true; g.add(terrain);
  const water = new THREE.Mesh(new THREE.BufferGeometry(), M.water); water.renderOrder = 1; g.add(water);
  const isl = {
    idx: i, group: g, terrain, water, props: new THREE.Group(), cells: {}, animals: {}, grid: null, hlGroup: new THREE.Group(), falls: new THREE.Group(), tokens: new THREE.Group(),
    Hd: new Float32Array(GRID.pts.length), Ht: new Float32Array(GRID.pts.length), A: null, sig: {}, patch: {}, center: islandPos(i).clone().add(new THREE.Vector3(0, 0.4, 0.4)),
  };
  g.add(isl.props, isl.hlGroup, isl.falls, isl.tokens); isl.tokens.visible = showTokens;
  for (const c of CELLS) { const cg = new THREE.Group(); isl.props.add(cg); isl.cells[c.k] = { group: cg, top: 0.1 }; }
  // décor du pourtour
  const r = rng('rim' + i); const deco = new THREE.Group(); g.add(deco); isl.deco = deco;
  let placed = 0;
  for (let t = 0; t < 900 && placed < 60; t++) {
    const x = (r() * 2 - 1) * 4.9, z = -4.9 + r() * 10.5; const si = signedInside(x, z);
    if (si < 0.08 || nearestCell(x, z).d < 1.05) continue;
    const k = r(); const o = k < .45 ? makeFlower(r) : k < .75 ? makeBush(r, .6 + r() * .4).geo : makeRock(r, .6 + r() * .6).geo;
    const m = new THREE.Mesh(o, M.props); m.position.set(x, 0, z); m.rotation.y = r() * 6; m.castShadow = true; m.userData.rim = [x, z]; deco.add(m); placed++;
  }
  scene.add(g);
  return isl;
}
function ensureIslands(n) {
  if (islands.length === n) return;
  for (const isl of islands) scene.remove(isl.group);
  islands = []; for (let i = 0; i < n; i++) islands.push(buildIsland(i));
}

/* ----- terrain : hauteurs, couleurs, eau ----- */
function computeHeights(isl) { const P = GRID.pts; for (let v = 0; v < P.length; v++) { const p = P[v]; isl.Ht[v] = p.ok ? heightAt(isl.A, p.x, p.z, p.si) : 0; } }
function writeTerrain(isl, Hh) {
  const pos = isl.terrain.geometry.attributes.position.array, P = GRID.pts, T = GRID.tris;
  for (let n = 0; n < T.length; n++) { const p = P[T[n]]; pos[n * 3] = p.x; pos[n * 3 + 1] = Hh[T[n]]; pos[n * 3 + 2] = p.z; }
  const g = isl.terrain.geometry; g.attributes.position.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox();
}
function writeColors(isl) {
  const col = isl.terrain.geometry.attributes.color.array, P = GRID.pts, T = GRID.tris, Hh = isl.Ht;
  for (let n = 0; n < T.length; n += 3) {
    const p0 = P[T[n]], p1 = P[T[n + 1]], p2 = P[T[n + 2]], y0 = Hh[T[n]], y1 = Hh[T[n + 1]], y2 = Hh[T[n + 2]];
    const ux = p1.x - p0.x, uy = y1 - y0, uz = p1.z - p0.z, vx = p2.x - p0.x, vy = y2 - y0, vz = p2.z - p0.z;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const ny1 = Math.abs(ny) / (Math.hypot(nx, ny, nz) || 1);
    const cx = (p0.x + p1.x + p2.x) / 3, cy = (y0 + y1 + y2) / 3, cz = (p0.z + p1.z + p2.z) / 3;
    const k = colorAt(isl.A, cx, cz, cy, ny1, hash2(cx * 13.1, cz * 7.3));
    for (let q = 0; q < 3; q++) { col[(n + q) * 3] = k.r; col[(n + q) * 3 + 1] = k.g; col[(n + q) * 3 + 2] = k.b; }
  }
  isl.terrain.geometry.attributes.color.needsUpdate = true;
}
function buildWater(isl) {
  const P = GRID.pts, T = GRID.tris, Hh = isl.Ht, A = isl.A;
  const pos = [], flow = [], depth = [];
  const fl = (x, z) => { let best = Infinity, fx = 0, fz = 0; for (const s of A.segs) { const [d] = segDist(x, z, s.ax, s.az, s.bx, s.bz); if (d < best) { best = d; const L = Math.hypot(s.bx - s.ax, s.bz - s.az) || 1; fx = (s.bx - s.ax) / L; fz = (s.bz - s.az) / L; } } const k = smooth(0.7, 0.2, best); return [fx * k, fz * k]; };
  for (let n = 0; n < T.length; n += 3) {
    const ys = [Hh[T[n]], Hh[T[n + 1]], Hh[T[n + 2]]];
    if (Math.min(...ys) > WATER_Y + 0.01) continue;
    for (let q = 0; q < 3; q++) { const p = P[T[n + q]]; pos.push(p.x, WATER_Y, p.z); const [fx, fz] = fl(p.x, p.z); flow.push(fx, fz); depth.push(clamp((WATER_Y - ys[q]) / 0.2)); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('flow', new THREE.Float32BufferAttribute(flow, 2));
  g.setAttribute('depth', new THREE.Float32BufferAttribute(depth, 1));
  isl.water.geometry.dispose(); isl.water.geometry = g;
  // cascades qui tombent du bord de l'île
  isl.falls.traverse(o => o.geometry && o.geometry !== G.cloudBlob && o.geometry.dispose()); isl.falls.clear();
  for (const f of A.falls) {
    const L = Math.hypot(f.dx, f.dz) || 1, ux = f.dx / L, uz = f.dz / L;
    const geo = new THREE.PlaneGeometry(0.5, 1, 1, 14); const p = geo.attributes.position;
    for (let v = 0; v < p.count; v++) { const t = 0.5 - p.getY(v); p.setY(v, -t * 3.8); p.setZ(v, 0.06 + Math.pow(t, .5) * 0.38); }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, M.fall); m.position.set(f.x, WATER_Y + 0.05, f.z); m.rotation.y = Math.atan2(ux, uz); m.renderOrder = 2; isl.falls.add(m);
    const lip = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), M.water); lip.rotation.x = -Math.PI / 2; lip.rotation.z = -Math.atan2(ux, uz); lip.position.set(f.x - ux * .05, WATER_Y + 0.004, f.z - uz * .05); isl.falls.add(lip);
    for (let s = 0; s < 3; s++) { const mist = new THREE.Mesh(G.cloudBlob, M.cloud); mist.position.set(f.x + ux * (.45 + s * .1), -3.9 - s * .15, f.z + uz * (.45 + s * .1)); mist.scale.set(.42 - s * .08, .22, .42 - s * .08); isl.falls.add(mist); }
  }
}
function buildGridLines(isl) {
  if (isl.grid) { isl.group.remove(isl.grid); isl.grid.geometry.dispose(); }
  const seen = new Set(), pos = [], idx = [];
  const ribbon = (pts, w) => { const base = pos.length / 3; for (let s = 0; s < pts.length; s++) { const [x, z] = pts[s]; const [dx, dz] = s < pts.length - 1 ? [pts[s + 1][0] - x, pts[s + 1][1] - z] : [x - pts[s - 1][0], z - pts[s - 1][1]]; const L = Math.hypot(dx, dz) || 1, px = -dz / L * w / 2, pz = dx / L * w / 2; const y = Math.max(heightAt(isl.A, x, z), WATER_Y) + 0.045; pos.push(x + px, y, z + pz, x - px, y, z - pz); if (s) { const a = base + (s - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } } };
  for (const c of CELLS) for (let e = 0; e < 6; e++) {
    const a1 = Math.PI / 3 * e, a2 = Math.PI / 3 * (e + 1);
    const x1 = c.x + Math.cos(a1), z1 = c.z + Math.sin(a1), x2 = c.x + Math.cos(a2), z2 = c.z + Math.sin(a2);
    const key = Math.round((x1 + x2) * 50) + ',' + Math.round((z1 + z2) * 50); if (seen.has(key)) continue; seen.add(key);
    const pts = []; for (let s = 0; s <= 6; s++) pts.push([x1 + (x2 - x1) * s / 6, z1 + (z2 - z1) * s / 6]); ribbon(pts, 0.05);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  isl.grid = new THREE.Mesh(g, M.grid); isl.grid.renderOrder = 3; isl.group.add(isl.grid);
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
    const cfg = [null, { n: 6, sc: .6, pine: .25 }, { n: 9, sc: .85, pine: .45 }, { n: 13, sc: 1.08, pine: .6 }][f.h];
    const pts = scatter(r, c.x, c.z, cfg.n, 0.8, 0.22 * cfg.sc + .04);
    pts.forEach(([x, z], n) => {
      const s = cfg.sc * (0.8 + r() * .4);
      const o = f.h === 1 && n % 2 ? makeBush(r, 1.3) : r() < cfg.pine ? makePine(r, s) : makeRound(r, s);
      addProp(isl, k, o.geo, x, z, { rot: r() * 6, sway: 1, delay: n * 45 }); top = Math.max(top, o.top);
    });
    scatter(r, c.x, c.z, 3, 0.75, 0.2, pts).forEach(([x, z]) => addProp(isl, k, makeBush(r, .8).geo, x, z, { rot: r() * 6 }));
  } else if (f.kind === 'mountain') {
    scatter(r, c.x, c.z, 2 + f.h, 0.85, 0.3).forEach(([x, z]) => addProp(isl, k, makeRock(r, .9 + r() * .8, '#8f8278').geo, x, z, { rot: r() * 6, yOff: -0.02 }));
    if (f.h === 1) scatter(r, c.x, c.z, 2, 0.75, 0.35).forEach(([x, z]) => addProp(isl, k, makePine(r, .55).geo, x, z, { sway: 1 }));
    top = PEAK[f.h] + 0.05;
  } else if (f.kind === 'field') {
    const a = isl.A.fieldAngle, ca = Math.cos(a), sa = Math.sin(a), parts = [];
    for (let u = -0.84; u <= 0.84; u += 0.135) for (let v = -0.84; v <= 0.84; v += 0.12) {
      const x = c.x + u * ca - v * sa, z = c.z + u * sa + v * ca;
      if (hexDist(x - c.x, z - c.z) > 0.82 || r() < .12) continue;
      const y = heightAt(isl.A, x, z); makeTuft(r).forEach(g => parts.push(g.translate(x - c.x, y, z - c.z)));
    }
    const m = new THREE.Mesh(merge(parts), M.props); m.position.set(c.x, 0, c.z); m.castShadow = true; m.receiveShadow = true; m.userData = { k, own: true, sway: .5, px: c.x, pz: c.z, yOff: 0, s: 1, abs: true }; grp.add(m);
    if (r() < .45) { const [x, z] = scatter(r, c.x, c.z, 1, .5, .1)[0] || [c.x, c.z]; addProp(isl, k, makeHay(), x, z, { rot: r() * 6 }); }
    top = 0.3;
  } else if (f.kind === 'water') {
    for (let t = 0, n = 0; t < 40 && n < 6; t++) {
      const a = r() * 6.28, d = 0.25 + r() * .6, x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      const cv = carveAt(isl.A, x, z), y = heightAt(isl.A, x, z);
      if (cv > 0.08 && cv < 0.32 && y > WATER_Y - 0.02) { addProp(isl, k, makeReed(r), x, z, { sway: 1.2 }); n++; }
      else if (cv > 0.8 && r() < .2) { const m = addProp(isl, k, makeLily(r), x, z, { rot: r() * 6 }); m.userData.fixedY = WATER_Y + 0.006; m.position.y = WATER_Y + 0.006; }
    }
    top = 0.15;
  } else if (f.kind === 'house') {
    let rot = (r() * 6 | 0) * Math.PI / 3 + Math.PI / 6;
    const nb = isl.A.housePairs.find(([a, b]) => a === ci || b === ci);
    if (nb) { const o = CELLS[nb[0] === ci ? nb[1] : nb[0]]; rot = Math.atan2(o.x - c.x, o.z - c.z); }
    const hs = makeHouse(r, f.base);
    const hm = addProp(isl, k, hs.geo, c.x, c.z, { rot }); hm.userData.chimney = hs.chimney; addProp(isl, k, hs.winGeo, c.x, c.z, { rot, mat: M.window });
    scatter(r, c.x, c.z, 3, 0.8, 0.3, [[c.x, c.z]]).forEach(([x, z], n) => { if (Math.hypot(x - c.x, z - c.z) < .38) return; const o = n === 0 && r() < .6 ? makeRound(r, .55) : makeBush(r, 1); addProp(isl, k, o.geo, x, z, { sway: 1, rot: r() * 6 }); });
    top = hs.top;
  } else if (f.kind === 'foundation') { addProp(isl, k, makeScaffold(), c.x, c.z, { rot: (r() * 6 | 0) * Math.PI / 3 }); top = 0.4; }
  else if (f.kind === 'clearing') {
    scatter(r, c.x, c.z, 2 + f.h, 0.7, 0.2).forEach(([x, z]) => addProp(isl, k, makeStump(r, .9 + r() * .5), x, z));
    addProp(isl, k, makeLogs(r), c.x + (r() - .5) * .3, c.z + (r() - .5) * .3, { rot: r() * 6 });
    if (f.h === 2) addProp(isl, k, makeLogs(r), c.x + (r() - .5) * .5, c.z + (r() - .5) * .5, { rot: r() * 6 });
    top = 0.2;
  }
  cell.top = Math.max(heightAt(isl.A, c.x, c.z), WATER_Y) + top;
  if (animate) grp.children.forEach(m => { const s = m.userData.s || 1; m.scale.setScalar(0.001); tween(650, p => m.scale.setScalar(Math.max(0.001, p * s)), { delay: 320 + (m.userData.delay || 0) + Math.random() * 120, easing: ease.outBack }); });
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
function loadModel(file) {
  if (modelCache[file]) return modelCache[file];
  const b64 = window.VERDANCE_MODELS && window.VERDANCE_MODELS[file];
  if (!b64 || !GLTFLoader) return (modelCache[file] = Promise.resolve(null));
  const bin = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0)).buffer;
  return (modelCache[file] = new Promise(res => new GLTFLoader().parse(bin, '', g => res(g), () => res(null))));
}
function instance(gltf, spec) {
  const skinned = gltf.animations.length > 0;
  const obj = skinned ? skClone(gltf.scene) : gltf.scene.clone(true);
  obj.traverse(o => { if (o.isMesh) { o.castShadow = true; if (o.isSkinnedMesh) o.frustumCulled = false; if (spec[3]) { o.material = o.material.clone(); o.material.color.lerp(new THREE.Color(spec[3]), .55); } } });
  const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3());
  const ref = ['soar', 'flutter', 'buzz'].includes(spec[2]) ? Math.max(size.x, size.y, size.z) : size.y;
  obj.scale.multiplyScalar(spec[1] * 1.7 / (ref || 1)); // plus grands que nature, pour se lire de loin
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
    if (!gltf) { const m = new THREE.Mesh(G.cube, M.cube); m.position.y = .11; g.add(m); return; }
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
      const y = Math.max(top, heightAt(isl.A, x, z)) + (u.mode === 'buzz' ? .25 : .55) + Math.sin(t * (u.mode === 'flutter' ? 5 : 1.3) + u.phase) * (u.mode === 'flutter' ? .08 : .1);
      g.position.set(x, y, z); g.rotation.y = -a; g.rotation.z = u.mode === 'soar' ? -.35 : 0;
      continue;
    }
    if (u.mode === 'perch') { g.position.set(c.x + .05, top - .04, c.z); g.rotation.y = u.phase + Math.sin(t * .4 + u.phase) * 1.2; continue; }
    if (u.mode === 'still') { const x = c.x + .18, z = c.z + .12; g.position.set(x, Math.max(heightAt(isl.A, x, z), WATER_Y - .02), z); g.rotation.y = u.phase + Math.sin(t * .3 + u.phase) * .8; continue; }
    // marcheurs : petites promenades dans leur case
    const dx = u.tx - u.x, dz = u.tz - u.z, d = Math.hypot(dx, dz);
    let moving = false;
    if (d < 0.02) {
      u.wait -= dt; setAction(u, 'Idle');
      if (u.wait <= 0) {
        // en forêt, on se promène en lisière (côté caméra) pour rester visible
        const forest = isl.A.info[CI[k]].kind === 'forest', ox = forest ? 0 : 0, oz = forest ? .58 : 0, R = forest ? .22 : .45;
        const a = Math.random() * 6.28, r = Math.random() * R; u.tx = c.x + ox + Math.cos(a) * r; u.tz = c.z + oz + Math.sin(a) * r * .6; u.wait = 2 + Math.random() * 4;
      }
    } else {
      const sp = (u.mode === 'hop' ? .2 : .08) + u.spec[1] * .22, step = Math.min(d, sp * dt);
      u.x += dx / d * step; u.z += dz / d * step; moving = true; setAction(u, 'Walk');
      const want = Math.atan2(dx, dz); let diff = want - u.heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); u.heading += diff * Math.min(1, dt * 6);
    }
    let y = heightAt(isl.A, u.x, u.z);
    y = u.mode === 'swim' ? Math.max(y, WATER_Y - .04) : Math.max(y, WATER_Y);
    if (moving && !(u.inst && u.inst.mixer)) y += Math.abs(Math.sin(t * (u.mode === 'hop' ? 11 : 14) + u.phase)) * (u.mode === 'hop' ? .06 : .015);
    g.position.set(u.x, y, u.z); g.rotation.y = u.heading;
  }
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
      tween(900, t => { for (let v = 0; v < isl.Hd.length; v++) isl.Hd[v] = from[v] + (isl.Ht[v] - from[v]) * t; writeTerrain(isl, isl.Hd); for (const [m, y0, y1] of movers) m.position.y = y0 + (y1 - y0) * t; },
        { easing: ease.inOutCubic, done: () => { buildGridLines(isl); refreshHighlights(true); } });
      if (Scene.onLand) { const k0 = changed[0]; setTimeout(() => Scene.onLand(board[k0].stack[board[k0].stack.length - 1]), 250); }
    } else { isl.Hd.set(isl.Ht); writeTerrain(isl, isl.Hd); for (const [m, , y1] of movers) m.position.y = y1; buildGridLines(isl); }
    buildTokens(isl, board);
  }
  for (const k of Object.keys(isl.animals)) if (cubesNow[k] === undefined) removeAnimal(isl, k);
  for (const k in cubesNow) if (!isl.animals[k]) buildAnimal(isl, k, cubesNow[k], animate && isl.cubesInited);
  isl.cubesInited = true;
}

/* ================= Surbrillances ================= */
function hexPatch(isl, k, R, w) {
  const key = k + '|' + R + '|' + w; if (isl.patch[key]) return isl.patch[key];
  const c = CELLS[CI[k]], pos = [], idx = [];
  const pt = (x, z) => { pos.push(x, Math.max(heightAt(isl.A, x, z), WATER_Y) + 0.045, z); return pos.length / 3 - 1; };
  const ring = []; for (let e = 0; e < 6; e++) for (let s = 0; s < 4; s++) { const a1 = Math.PI / 3 * e, a2 = Math.PI / 3 * (e + 1), t = s / 4; ring.push([Math.cos(a1) * (1 - t) + Math.cos(a2) * t, Math.sin(a1) * (1 - t) + Math.sin(a2) * t]); }
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
let ghost = null;
function refreshHighlights(force) {
  const sig = JSON.stringify([view.activeIdx, view.legal, view.targets, view.patternHi, view.ghostColor, hover && hover.k, hover && hover.pi]);
  if (sig === refreshHighlights.last && !force) return; refreshHighlights.last = sig;
  for (const isl of islands) { isl.hlGroup.clear(); for (const c of CELLS) if (isl.cells[c.k].ghostCube) isl.cells[c.k].ghostCube.visible = false; }
  if (ghost) { ghost.parent && ghost.parent.remove(ghost); ghost = null; }
  const isl = islands[view.activeIdx]; if (!isl || !isl.A) return;
  const hk = hover && hover.pi === view.activeIdx ? hover.k : null;
  const add = (k, mode) => {
    const h = k === hk && mode !== 'pattern' ? 'hover' : mode;
    const fill = new THREE.Mesh(hexPatch(isl, k, 0.93, 0), M.hl[h][0]); fill.renderOrder = 4;
    const edge = new THREE.Mesh(hexPatch(isl, k, 0.95, h === 'hover' ? 0.11 : 0.07), M.hl[h][1]); edge.renderOrder = 5;
    isl.hlGroup.add(fill, edge);
  };
  const done = new Set();
  view.targets.forEach(k => { add(k, 'target'); done.add(k); });
  view.patternHi.forEach(k => { if (!done.has(k)) { add(k, 'pattern'); done.add(k); } });
  view.legal.forEach(k => { if (!done.has(k)) add(k, 'legal'); });
  if (hk && !done.has(hk) && !view.legal.includes(hk)) add(hk, 'pattern');
  for (const k of view.targets) { const cell = isl.cells[k]; if (!cell.ghostCube) { cell.ghostCube = new THREE.Mesh(G.cube, M.cubeGhost); isl.group.add(cell.ghostCube); } cell.ghostCube.visible = true; }
  if (hk && view.ghostColor && view.legal.includes(hk)) {
    ghost = new THREE.Group(); const c = CELLS[CI[hk]];
    const st = lastState.players[view.activeIdx].board[hk].stack.concat([view.ghostColor]);
    st.forEach((col, n) => { const t = new THREE.Mesh(G.token, n === st.length - 1 ? M.tokGhost[col] : M.tok[col]); t.position.y = n * 0.1; ghost.add(t); });
    ghost.position.set(c.x, isl.cells[hk].top + 0.35, c.z); ghost.userData.baseY = ghost.position.y; isl.group.add(ghost);
  }
}

/* ================= Synchronisation ================= */
Scene.sync = function (state, v) {
  if (!Scene.ready) return;
  view = Object.assign({ legal: [], targets: [], patternHi: [] }, v); lastState = state;
  ensureIslands(state.players.length);
  state.players.forEach((p, pi) => updateIsland(islands[pi], p, v.animate !== false));
  refreshHighlights();
};
Scene.reset = function () { for (const isl of islands) scene.remove(isl.group); islands = []; };
Scene.setShowTokens = function (on) { showTokens = on; islands.forEach(isl => { isl.tokens.visible = on; }); };

/* ================= Caméra ================= */
function flyTo(target, offset, dur = 1300) {
  const t0 = controls.target.clone(), p0 = camera.position.clone(), p1 = target.clone().add(offset);
  tween(dur, p => { controls.target.lerpVectors(t0, target, p); camera.position.lerpVectors(p0, p1, p); }, { easing: ease.inOutCubic });
}
const defaultOffset = () => new THREE.Vector3(0, 14.2, 12.6).multiplyScalar(framing.dist);
Scene.focus = function (i, { instant = false, keepAngle = true } = {}) {
  if (!Scene.ready || !islands[i]) return;
  const target = islands[i].center.clone();
  const off = keepAngle ? camera.position.clone().sub(controls.target) : defaultOffset();
  if (off.length() < 5) off.copy(defaultOffset());
  if (instant) { controls.target.copy(target); camera.position.copy(target.clone().add(off)); return; }
  flyTo(target, off);
};
Scene.topView = function () {
  const d = camera.position.distanceTo(controls.target);
  const top = controls.target.clone().sub(camera.position).normalize().dot(new THREE.Vector3(0, -1, 0)) > 0.97;
  flyTo(controls.target.clone(), top ? defaultOffset() : new THREE.Vector3(0, Math.max(d, 16), 0.6), 900);
};
Scene.resetView = function (i) { flyTo(islands[i] ? islands[i].center.clone() : controls.target.clone(), defaultOffset(), 900); };
Scene.autoRotate = function (on) { if (controls) controls.autoRotate = on; };
Scene.overview = function () {
  if (!islands.length) return;
  const c = new THREE.Vector3(); islands.forEach(isl => c.add(isl.center)); c.divideScalar(islands.length);
  const span = (islands.length - 1) * ISLAND_GAP;
  flyTo(c, new THREE.Vector3(0, 10 + span * 0.55, 10 + span * 0.65), 1600);
};
Scene.screenPos = function (pi, k) {
  const isl = islands[pi]; if (!isl) return null; const c = CELLS[CI[k]];
  const v = new THREE.Vector3(c.x, isl.cells[k].top + 0.3, c.z); isl.group.localToWorld(v); v.project(camera);
  const rect = renderer.domElement.getBoundingClientRect();
  return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height };
};

/* ================= Survol et clic : on vise ce qu'on voit ================= */
function islandOf(o) { while (o) { const isl = islands.find(s => s.group === o); if (isl) return isl; o = o.parent; } return null; }
function pick(ev) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1; pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
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
function bindPointer() {
  const el = renderer.domElement; let down = null;
  el.addEventListener('pointermove', ev => {
    const h = pick(ev);
    const changed = (h && h.k) !== (hover && hover.k) || (h && h.pi) !== (hover && hover.pi);
    hover = h; if (changed) refreshHighlights();
    const act = h && h.pi === view.activeIdx && (view.legal.includes(h.k) || view.targets.includes(h.k));
    el.style.cursor = act ? 'pointer' : 'grab';
    cb.onHover && cb.onHover(h, ev.clientX, ev.clientY);
  });
  el.addEventListener('pointerleave', () => { hover = null; refreshHighlights(); cb.onHover && cb.onHover(null); });
  el.addEventListener('pointerdown', ev => { down = { x: ev.clientX, y: ev.clientY }; });
  el.addEventListener('pointerup', ev => {
    if (!down) return; const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y); down = null;
    if (moved > 6) return;
    const h = pick(ev); if (h) cb.onCellClick && cb.onCellClick(h.pi, h.k);
  });
}

/* ================= Effets ================= */
function burst(isl, x, y, z, color = '#ffc56b') {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
  for (let i = 0; i < 18; i++) {
    const m = new THREE.Mesh(G.spark, mat); m.position.set(x, y, z);
    const a = Math.random() * Math.PI * 2, s = 1.2 + Math.random() * 1.6;
    m.userData = { v: new THREE.Vector3(Math.cos(a) * s, 2 + Math.random() * 2.2, Math.sin(a) * s), life: 0, mat };
    isl.group.add(m); particles.push(m);
  }
}
Scene.celebrate = function (pi, k) { const isl = islands[pi]; if (isl) { const c = CELLS[CI[k]]; burst(isl, c.x, isl.cells[k].top, c.z); } };
function buildClouds() {
  const r = rng('clouds');
  for (let i = 0; i < 16; i++) {
    const c = new THREE.Group(); const n = 4 + (r() * 4 | 0);
    for (let j = 0; j < n; j++) { const b = new THREE.Mesh(G.cloudBlob, M.cloud); const s = 0.8 + r() * 1.3; b.scale.set(s * 1.3, s * .8, s); b.position.set(j * 1.1 - n * .5, r() * .5, (r() - .5) * 1.2); c.add(b); }
    const low = i % 3 !== 0;
    c.position.set(-25 + r() * 80, low ? -6 - r() * 5 : 4 + r() * 6, low ? -10 + r() * 22 : -26 - r() * 16);
    c.userData.speed = 0.15 + r() * 0.25; c.scale.setScalar(low ? 1 : 1.8);
    scene.add(c); clouds.push(c);
  }
}

function buildBirds() {
  const wingL = new THREE.BufferGeometry(); wingL.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.05, 0, 0, 0.06, -0.22, 0, 0], 3)); wingL.computeVertexNormals();
  const wingR = new THREE.BufferGeometry(); wingR.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.06, 0, 0, -0.05, 0.22, 0, 0], 3)); wingR.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: '#3b3a36', side: THREE.DoubleSide, flatShading: true });
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Group(); const l = new THREE.Mesh(wingL, mat), r = new THREE.Mesh(wingR, mat);
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 4).rotateX(Math.PI / 2), mat); b.add(l, r, body);
    b.userData = { l, r, rad: 3.5 + Math.random() * 3, h: 3 + Math.random() * 2.2, sp: (0.25 + Math.random() * .2) * (i % 2 ? 1 : -1), ph: Math.random() * 6.28, cx: 0 };
    scene.add(b); birds.push(b);
  }
}
function tickLife(t, dt) {
  // oiseaux qui tournent au-dessus de l'île regardée
  const c = controls.target;
  birds.forEach((b, i) => { const u = b.userData; const a = u.ph + t * u.sp; b.position.set(c.x + Math.cos(a) * u.rad, c.y + u.h + Math.sin(t * .7 + i) * .3, c.z + Math.sin(a) * u.rad);
    b.rotation.y = -a + (u.sp > 0 ? 0 : Math.PI); const f = Math.sin(t * 9 + i) * .6; u.l.rotation.z = f; u.r.rotation.z = -f; });
  // fumée des cheminées
  for (const isl of islands) for (const cg of isl.props.children) for (const m of cg.children) {
    const ch = m.userData.chimney; if (!ch || m.scale.x < .9) continue;
    m.userData.smokeT = (m.userData.smokeT || Math.random()) - dt;
    if (m.userData.smokeT <= 0 && smoke.length < 80) {
      m.userData.smokeT = 0.55 + Math.random() * .3;
      const p = new THREE.Mesh(G.cloudBlob, M.smoke); p.position.set(...ch); m.localToWorld(p.position);
      p.scale.setScalar(0.03); p.userData = { life: 0, dx: (Math.random() - .5) * .1 }; scene.add(p); smoke.push(p);
    }
  }
  for (let i = smoke.length - 1; i >= 0; i--) { const p = smoke[i], u = p.userData; u.life += dt; p.position.y += dt * .35; p.position.x += (u.dx + .06) * dt; p.scale.setScalar((.03 + u.life * .06) * (u.life > 1.8 ? Math.max(0.01, (2.4 - u.life) / .6) : 1)); if (u.life > 2.4) { scene.remove(p); smoke.splice(i, 1); } }
  M.smoke.opacity = .55;
}

/* ================= Boucle ================= */
function loop() {
  const now = performance.now(), dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  for (let i = anims.length - 1; i >= 0; i--) { const a = anims[i]; if (now < a.t0) continue; const p = Math.min(1, (now - a.t0) / a.dur); a.fn(a.easing(p)); if (p >= 1) { anims.splice(i, 1); a.done && a.done(); } }
  waterUniforms.uTime.value = t;
  const pulse = 0.5 + 0.5 * Math.sin(t * 3.5);
  for (const k in M.hl) if (k !== 'hover') M.hl[k][1].opacity = .55 + .4 * pulse;
  for (const isl of islands) {
    for (const cg of isl.props.children) for (const m of cg.children) { const s = m.userData.sway; if (s) { m.rotation.z = Math.sin(t * 1.3 + m.userData.px * 3 + m.userData.pz) * 0.025 * s; m.rotation.x = Math.cos(t * 1.1 + m.userData.pz * 2) * 0.015 * s; } }
    tickAnimals(isl, t, dt);
    for (const k in isl.cells) { const gc = isl.cells[k].ghostCube; if (gc && gc.visible) { const c = CELLS[CI[k]]; gc.position.set(c.x, isl.cells[k].top + 0.45 + Math.sin(t * 3 + c.x) * 0.07, c.z); gc.rotation.y = t * 1.2; gc.scale.setScalar(hover && hover.k === k ? 1.3 : 1); } }
  }
  if (ghost) ghost.position.y = ghost.userData.baseY + Math.sin(t * 3) * 0.05;
  for (let i = particles.length - 1; i >= 0; i--) {
    const m = particles[i], u = m.userData; u.life += dt; u.v.y -= 6 * dt; m.position.addScaledVector(u.v, dt);
    u.mat.opacity = Math.max(0, 1 - u.life / 0.9); m.scale.setScalar(1 - u.life * 0.6);
    if (u.life > 0.9) { m.parent && m.parent.remove(m); particles.splice(i, 1); }
  }
  tickLife(t, dt);
  for (const c of clouds) { c.position.x += c.userData.speed * dt; if (c.position.x > 60) c.position.x = -30; }
  sun.target.position.copy(controls.target); sun.position.copy(controls.target).add(new THREE.Vector3(6, 14, 7));
  controls.update();
  renderer.render(scene, camera);
}
})();
