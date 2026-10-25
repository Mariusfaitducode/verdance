/* Verdance — cartes Animal illustrées (peinture pleine page, colonne de cubes, bandeau du motif).
   Réutilisé par le jeu et par la maquette. */
(function () {
'use strict';
// Peintures disponibles (domaine public, voir assets/cards/CREDITS.md)
const ART = {
  'Lièvre': 'assets/cards/lievre.jpg',
  'Lapin': 'assets/cards/lapin.jpg',
  'Rat des moissons': 'assets/cards/rat-des-moissons.jpg',
  'Campagnol': 'assets/cards/campagnol.jpg',
  'Mulot': 'assets/cards/mulot.jpg',
  'Blaireau': 'assets/cards/blaireau.jpg',
  'Belette': 'assets/cards/belette.jpg',
  'Loutre': 'assets/cards/loutre.jpg',
  'Vison': 'assets/cards/vison.jpg',
  "Musaraigne d'eau": 'assets/cards/musaraigne-eau.jpg',
  'Castor': 'assets/cards/castor.jpg',
  'Desman': 'assets/cards/desman.jpg',
  "Rat d'eau": 'assets/cards/rat-eau.jpg',
  'Putois': 'assets/cards/putois.jpg',
  'Bouquetin': 'assets/cards/bouquetin.jpg',
  'Mouflon': 'assets/cards/mouflon.jpg',
  'Marmotte': 'assets/cards/marmotte.jpg',
  'Chamois': 'assets/cards/chamois.jpg',
  'Chauve-souris': 'assets/cards/chauve-souris.jpg',
  'Ours': 'assets/cards/ours.jpg',
  'Écureuil': 'assets/cards/ecureuil.jpg',
  'Martre': 'assets/cards/martre.jpg',
  'Cerf': 'assets/cards/cerf.jpg',
  'Hérisson': 'assets/cards/herisson.jpg',
  'Chevreuil': 'assets/cards/chevreuil.jpg',
  'Sanglier': 'assets/cards/sanglier.jpg',
  'Loup': 'assets/cards/loup.jpg',
  'Souris': 'assets/cards/souris.jpg',
  'Renard': 'assets/cards/renard.jpg',
  'Oreillard': 'assets/cards/oreillard.jpg',
  'Fouine': 'assets/cards/fouine.jpg',
  'Chat sauvage': 'assets/cards/chat-sauvage.jpg',
};
const HAB = { blue: '#3a8ec4', yellow: '#d9a22c', gray: '#8a8e95', green: '#4f9a3c', red: '#c9563f' };
const HAB_LABEL = { blue: 'Eau', yellow: 'Champ', gray: 'Montagne', green: 'Forêt', red: 'Village' };
const HAB_STACK = { blue: ['blue'], yellow: ['yellow'], gray: ['gray', 'gray'], green: ['brown', 'green'], red: ['brown', 'red'] };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// width : largeur en px ; placed : cubes déjà posés ; fallbackArt : HTML si aucune peinture
function html(id, { width = 150, placed = 0, cls = '', attrs = '', fallbackArt = '', footer = '' } = {}) {
  const c = H.CARDS[id], art = ART[c.name];
  const slots = c.pts.map((v, i) => `<div class="vc-slot${i < placed ? ' open' : ''}${i === placed - 1 ? ' cur' : ''}"><span>${v}</span>${i >= placed ? '<i class="vc-cube"></i>' : ''}</div>`).join('');
  return `<div class="vcard ${cls}" style="--w:${width}px;--hab:${HAB[c.color]}" ${attrs}>
    <div class="vc-art">${art ? `<img src="${art}" alt="${esc(c.name)}" draggable="false">` : `<div class="vc-noart">${fallbackArt}</div>`}<div class="vc-name">${esc(c.name)}</div></div>
    <div class="vc-cubes">${slots}</div>
    <div class="vc-band">
      <div class="vc-hab" title="L'animal s'installe sur ce terrain">${Draw.tokenIcon(HAB_STACK[c.color], 40)}<span>${HAB_LABEL[c.color]}</span></div>
      <div class="vc-pat">${Draw.patternSvg(c).replace(/ width="[^"]*"/, '')}</div>
    </div>
    ${footer}
  </div>`;
}
window.VCard = { html, ART, hasArt: name => !!ART[name] };
})();
