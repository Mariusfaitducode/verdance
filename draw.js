/* Verdance — dessins iso partagés (jetons, motifs, cubes) : interface du jeu et cartes. */
(function () {
'use strict';
const SQ3 = Math.sqrt(3);
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
window.Draw = { TOP, SIDE, isoStack, stackTopY, cubeSvg, tokenIcon, hexIso, patternSvg };
})();
