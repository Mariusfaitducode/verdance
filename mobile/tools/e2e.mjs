// Test de bout en bout du serveur Verdance, contre `wrangler dev` local.
//   terminal 1 : npx wrangler@4 dev --port 8787
//   terminal 2 : node tools/e2e.mjs [http://localhost:8787]
// Nécessite Node 22+ (WebSocket global).
import '../public/rules.js';
import { vapidJwt } from '../src/worker.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const H = globalThis.H;
const BASE = process.argv.slice(2).find(a => a.startsWith('http')) || process.env.BASE || 'http://localhost:8787';
const WS_BASE = BASE.replace(/^http/, 'ws');
let passed = 0;
const ok = (cond, label) => { if (!cond) throw new Error('ÉCHEC : ' + label); passed++; console.log('  ok  ' + label); };
const section = s => console.log('\n# ' + s);

async function api(path, body) {
  const r = await fetch(BASE + path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let data = null; try { data = await r.json(); } catch { }
  return { status: r.status, data };
}

// Client WebSocket minimal avec file d'attente de messages.
function connect(room, token) {
  const ws = new WebSocket(`${WS_BASE}/api/rooms/${room}/ws?token=${encodeURIComponent(token)}`);
  const queue = [], waiters = [];
  ws.closeInfo = new Promise(res => ws.addEventListener('close', e => res({ code: e.code, reason: e.reason })));
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    const i = waiters.findIndex(w => w.pred(m));
    if (i >= 0) { const [w] = waiters.splice(i, 1); clearTimeout(w.timer); w.res(m); } else queue.push(m);
  });
  ws.next = (pred = () => true, label = 'message', ms = 5000) => {
    const i = queue.findIndex(pred);
    if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
    return new Promise((res, rej) => {
      const w = { pred, res, timer: setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); rej(new Error('délai dépassé : ' + label)); }, ms) };
      waiters.push(w);
    });
  };
  ws.drain = () => queue.splice(0);
  ws.json = m => ws.send(JSON.stringify(m));
  ws.opened = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  return ws;
}
const isState = v => m => m.t === 'state' && (v == null || m.version === v);
const isError = m => m.t === 'error';

// Construit un tour légal sur l'état public : un emplacement, puis chaque jeton sur une case où il peut aller.
function buildTurn(pub) {
  const S = H.clone(pub), actions = [];
  const slot = S.slots.findIndex(s => s.length);
  H.takeSlot(S, slot); actions.push(['slot', slot]);
  while (S.hand.length) {
    const color = S.hand[0];
    const k = H.BOARD_CELLS.map(c => c.k).find(k => H.canPlace(S.players[S.current].board[k], color));
    if (!k) break;
    H.placeToken(S, 0, k); actions.push(['token', 0, k]);
  }
  return { actions, after: S };
}

// Salle de la dernière exécution : `node tools/e2e.mjs URL --after-restart` vérifie qu'elle a survécu
// à un redémarrage de wrangler dev (stockage du Durable Object sur disque, pas en mémoire).
const LAST = new URL('../.wrangler/e2e-last.json', import.meta.url);
async function afterRestart() {
  section('Persistance après redémarrage du serveur');
  const last = JSON.parse(readFileSync(LAST, 'utf8'));
  const ws = connect(last.room, last.tok0);
  const m = await ws.next(isState(), 'état après redémarrage');
  ok(m.version === last.version && m.seat === 0, `salle ${last.room} retrouvée, version ${m.version}`);
  ok(JSON.stringify(m.state.players[0].board) === JSON.stringify(last.board), 'plateau identique après redémarrage');
  ws.close();
  console.log(`\n${passed} vérifications passées.`);
}

async function main() {
  if (process.argv.includes('--after-restart')) return afterRestart();
  mkdirSync(new URL('../.wrangler/', import.meta.url), { recursive: true });
  section('VAPID');
  const vap = await api('/api/vapid');
  ok(vap.status === 200 && typeof vap.data.key === 'string', 'GET /api/vapid renvoie une clé');
  const pubRaw = Buffer.from(vap.data.key, 'base64url');
  ok(pubRaw.length === 65 && pubRaw[0] === 4, 'clé publique = point P-256 non compressé (applicationServerKey)');
  // Signature JWT ES256 vérifiée avec la clé publique servie (clés lues dans .dev.vars, comme wrangler dev)
  const devVars = Object.fromEntries(readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').trim().split('\n').map(l => l.split('=')));
  ok(devVars.VAPID_PUBLIC === vap.data.key, 'le serveur sert la clé de .dev.vars');
  const jwt = await vapidJwt(devVars, 'https://fcm.googleapis.com', 'mailto:test@example.com');
  const [h, p, sig] = jwt.split('.');
  const pk = await crypto.subtle.importKey('raw', pubRaw, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pk, Buffer.from(sig, 'base64url'), new TextEncoder().encode(h + '.' + p));
  const claims = JSON.parse(Buffer.from(p, 'base64url'));
  ok(valid && claims.aud === 'https://fcm.googleapis.com' && claims.exp > Date.now() / 1000, 'JWT VAPID ES256 signé et vérifiable');

  section('Salle');
  ok((await api('/api/rooms', { name: 'x'.repeat(21) })).status === 400, 'nom de 21 caractères refusé');
  ok((await api('/api/rooms', { name: '   ' })).status === 400, 'nom vide refusé');
  const big = await fetch(BASE + '/api/rooms', { method: 'POST', body: JSON.stringify({ name: 'a', pad: 'x'.repeat(5000) }) });
  ok(big.status === 400, 'corps trop gros refusé');
  const c = await api('/api/rooms', { name: 'Marius' });
  ok(c.status === 200 && /^[A-HJ-NP-Z2-9]{5}$/.test(c.data.room) && c.data.seat === 0 && c.data.token.length >= 40, `salle créée (${c.data.room}), siège 0, jeton`);
  const room = c.data.room, tok0 = c.data.token;

  // Le créateur se connecte avant l'arrivée de l'invité : état nul
  const early = connect(room, tok0);
  const m0 = await early.next(isState(), 'état initial siège 0');
  ok(m0.seat === 0 && m0.state === null && m0.players[0].name === 'Marius' && m0.players[1] === null, 'avant le siège 1 : state null');

  ok((await api(`/api/rooms/ZZZZZ/join`, { name: 'Yasmine' })).status === 404, 'rejoindre une salle inexistante : 404');
  const j = await api(`/api/rooms/${room.toLowerCase()}/join`, { name: 'Yasmine' });
  ok(j.status === 200 && j.data.seat === 1 && j.data.room === room, 'siège 1 rejoint (code insensible à la casse)');
  ok((await api(`/api/rooms/${room}/join`, { name: 'Intrus' })).status === 409, 'salle complète : 409');
  const tok1 = j.data.token;
  const started = await early.next(m => m.t === 'state' && m.state, 'début de partie poussé au siège 0');
  ok(started.version === 1, 'le créateur reçoit l’état de départ en direct');
  early.close();

  section('Refus WebSocket');
  const bad = connect(room, 'faux-jeton');
  const badClose = await bad.closeInfo;
  ok(badClose.code === 4401, `jeton invalide : fermeture 4401 (« ${badClose.reason} »)`);
  const noRoom = connect('QQQQQ', tok0);
  const noRoomClose = await noRoom.closeInfo;
  ok(noRoomClose.code === 4404, `salle inconnue : fermeture 4404 (« ${noRoomClose.reason} »)`);
  const badCode = connect('O0I1!', tok0);
  ok((await badCode.closeInfo).code === 4404, 'code de salle mal formé : fermeture 4404');

  section('État initial et masquage');
  const ws0 = connect(room, tok0), ws1 = connect(room, tok1);
  const s0 = await ws0.next(isState(1), 'état siège 0'), s1 = await ws1.next(isState(1), 'état siège 1');
  ok(s0.seat === 0 && s1.seat === 1, 'chaque socket connaît son siège');
  ok(s0.state.bag.length === 0 && s0.state.deck.length === 0 && s0.state.bagCount === 120 - 15 && s0.state.deckCount === 32 - 5, 'sac et pioche vidés, remplacés par bagCount/deckCount');
  ok(s0.state.players[0].spiritChoice.length === 2 && s0.state.players[1].spiritChoice === null && s0.state.players[1].spiritHidden === true, 'siège 0 : ses esprits visibles, ceux de l’adversaire masqués');
  ok(s1.state.players[1].spiritChoice.length === 2 && s1.state.players[0].spiritChoice === null, 'siège 1 : idem, symétrique');
  ok(s0.state.players.map(p => p.name).join() === 'Marius,Yasmine' && s0.state.current === 0, 'joueurs nommés, le siège 0 commence');
  await ws1.next(m => m.t === 'presence' && m.online[0] && m.online[1], 'présence des deux');
  ok(true, 'présence : les deux en ligne');

  ws0.json({ t: 'ping' });
  ok((await ws0.next(m => m.t === 'pong', 'pong')).t === 'pong', 'ping -> pong, sans erreur');
  ws0.json({ t: 'ping', at: 1 });
  ok((await ws0.next(m => m.t === 'pong' || m.t === 'error', 'pong (variante)')).t === 'pong', 'ping avec champs en plus -> pong');

  section('Esprit');
  ws0.json({ t: 'spirit', idx: 1 });
  const sp0 = await ws0.next(isState(2), 'état après esprit (siège 0)');
  const sp1 = await ws1.next(isState(2), 'état après esprit (siège 1)');
  ok(sp0.state.players[0].spirit === s0.state.players[0].spiritChoice[1], 'esprit choisi visible pour soi');
  ok(sp1.state.players[0].spirit === null && sp1.state.players[0].spiritHidden, 'esprit choisi masqué pour l’adversaire');
  ws0.json({ t: 'spirit', idx: 0 });
  ok(isError(await ws0.next(isError, 'refus 2e esprit')), 'on ne rechoisit pas son esprit');

  section('Tour valide');
  ws0.drain(); ws1.drain();
  const { actions, after } = buildTurn(sp0.state);
  ok(actions.length === 4 && H.canEndTurn(after), `tour local construit : ${JSON.stringify(actions)}`);
  ws0.json({ t: 'preview', actions: actions.slice(0, 2) });
  const pv = await ws1.next(m => m.t === 'preview', 'aperçu relayé');
  ok(pv.seat === 0 && pv.actions.length === 2, 'l’adversaire voit le tour se construire (preview)');
  ws0.json({ t: 'turn', version: 2, actions });
  const t1 = await ws1.next(isState(3), 'nouvel état chez le siège 1');
  const t0 = await ws0.next(isState(3), 'nouvel état chez le siège 0');
  const board0 = t1.state.players[0].board;
  ok(t1.state.current === 1 && t0.state.current === 1, 'le tour passe au siège 1');
  ok(actions.filter(a => a[0] === 'token').every(a => board0[a[2]].stack.length > 0), 'les 3 jetons sont sur le plateau du siège 0, vus par le siège 1');
  ok(t1.state.slots[actions[0][1]].length === 3 && t1.state.bagCount === 120 - 18, 'emplacement rechargé depuis le sac (bagCount 102)');
  ok(t1.state.players[0].turns === 1, 'compteur de tours du siège 0 = 1');

  section('Triche refusée');
  ws0.json({ t: 'turn', version: 3, actions: buildTurn(t0.state).actions });
  ok((await ws0.next(isError, 'mauvais siège')).msg.includes('pas ton tour'), 'tour joué par le mauvais siège : refusé');
  const legit = buildTurn(t1.state).actions;
  ws1.json({ t: 'turn', version: 2, actions: legit });
  ok((await ws1.next(isError, 'mauvaise version')).msg.includes('Version'), 'tour avec une version périmée : refusé');
  ws1.json({ t: 'turn', version: 3, actions: legit.slice(0, 2) });
  ok(isError(await ws1.next(isError, 'tour incomplet')), 'tour incomplet (jetons en main) : refusé');
  ws1.json({ t: 'turn', version: 3, actions: [...legit.slice(0, 1), ['token', 0, '__proto__']] });
  ok(isError(await ws1.next(isError, 'case inconnue')), 'case hors plateau : refusé');
  ws1.json({ t: 'turn', version: 3, actions: [['slot', 0], ['slot', 1]] });
  ok(isError(await ws1.next(isError, 'deux emplacements')), 'deux emplacements dans un tour : refusé');
  ws1.json({ t: 'turn', version: 3, actions: [legit[0], ['cube', 0, '0,0']] });
  ok(isError(await ws1.next(isError, 'cube sans carte')), 'animal posé sans carte : refusé');
  // Empiler sur de l'eau ou un champ est illégal : on le force si la main en contient
  const S = H.clone(t1.state); H.takeSlot(S, legit[0][1]);
  const flat = S.hand.findIndex(c => c === 'blue' || c === 'yellow');
  if (flat >= 0) {
    ws1.json({ t: 'turn', version: 3, actions: [legit[0], ['token', flat, '2,0'], ['token', 0, '2,0']] });
    ok(isError(await ws1.next(isError, 'empilement illégal')), `jeton empilé sur ${S.hand[flat] === 'blue' ? 'de l’eau' : 'un champ'} : refusé`);
  }
  ws1.json({ t: 'turn', version: 3, actions: 'n’importe quoi' });
  ok(isError(await ws1.next(isError, 'gestes mal formés')), 'gestes mal formés : refusé');
  ws1.send('x'.repeat(20000));
  ok((await ws1.next(isError, 'message trop long')).msg.includes('long'), 'message trop long : refusé');
  ws1.json({ t: 'push', sub: { endpoint: 'https://evil.example.com/x' } });
  ok(isError(await ws1.next(isError, 'push hors service')), 'abonnement push vers un hôte inconnu : refusé');

  // Abonnement push (endpoint FCM factice) : le tour suivant du siège 1 déclenche un vrai POST VAPID vers FCM,
  // qui répond 4xx ; le serveur doit encaisser sans casser la partie (voir le journal de wrangler dev).
  ws0.json({ t: 'push', sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-faux-abonnement', keys: { p256dh: 'x', auth: 'y' } } });
  await new Promise(r => setTimeout(r, 300));
  ok(!ws0.drain().some(isError), 'abonnement push FCM accepté');

  section('Reconnexion et persistance');
  ws0.close(); ws1.close();
  await Promise.all([ws0.closeInfo, ws1.closeInfo]);
  const r1 = connect(room, tok1);
  const rs = await r1.next(isState(), 'état à la reconnexion');
  ok(rs.version === 3 && rs.state.current === 1, 'reconnexion : version 3, c’est au siège 1');
  ok(actions.filter(a => a[0] === 'token').every(a => rs.state.players[0].board[a[2]].stack.length > 0), 'reconnexion : le plateau joué est toujours là');
  ok(rs.players[0].online === false && rs.players[1].online === true, 'présence : le siège 0 est hors ligne');
  // Le siège 1 joue son tour après reconnexion : la partie continue
  const t2 = buildTurn(rs.state);
  r1.json({ t: 'turn', version: 3, actions: t2.actions });
  const after2 = await r1.next(isState(4), 'tour du siège 1');
  ok(after2.state.current === 0 && after2.state.players[1].turns === 1, 'tour du siège 1 accepté après reconnexion');
  const r0 = connect(room, tok0);
  const rs0 = await r0.next(isState(4), 'siège 0 revient');
  ok(rs0.state.players[1].board && rs0.state.players[0].spirit === sp0.state.players[0].spirit, 'siège 0 reconnecté : état à jour, son esprit conservé');
  const pres = await r1.next(m => m.t === 'presence' && m.online[0], 'présence siège 0 revenu');
  ok(pres.online[0] && pres.online[1], 'présence mise à jour au retour du siège 0');
  r0.close(); r1.close();
  writeFileSync(LAST, JSON.stringify({ room, tok0, tok1, version: 4, board: rs0.state.players[0].board }));

  console.log(`\n${passed} vérifications passées. Salle de test : ${room}`);
}

main().then(() => process.exit(0), e => { console.error('\n' + e.message); process.exit(1); });
