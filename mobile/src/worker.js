/* Verdance mobile — serveur de jeu en ligne.
   Worker Cloudflare (assets statiques + /api/*) et Durable Object `Room`, un par code de salle.
   Les règles viennent de public/rules.js (copie de ../rules.js) : une seule source de vérité,
   le serveur rejoue chaque tour avec les mêmes fonctions que le client. */
import '../public/rules.js';

const H = globalThis.H;

/* ---------- Constantes ---------- */
// 32 caractères sans ambiguïté : ni 0/O ni 1/I.
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/;
const NAME_MAX = 20;
const BODY_MAX = 2048;          // corps JSON des requêtes HTTP
const WS_MSG_MAX = 16384;       // un message WebSocket
const ACTIONS_MAX = 40;         // un tour ne dépasse jamais quelques dizaines de gestes
const SUBS_PER_SEAT = 5;
const PUSH_TTL = 86400;         // un jour : un « c'est ton tour » vieux de plus n'a plus de sens
// Services Web Push connus : on n'envoie pas de requête sortante vers n'importe quel hôte.
const PUSH_HOSTS = [/\.googleapis\.com$/, /\.mozilla\.com$/, /\.mozaws\.net$/, /(^|\.)push\.apple\.com$/, /\.notify\.windows\.com$/];

/* ---------- Utilitaires ---------- */
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const fail = (status, msg) => json({ error: msg }, status);
function randomCode() {
  const b = crypto.getRandomValues(new Uint8Array(5));
  let s = ''; for (const x of b) s += ROOM_ALPHABET[x & 31]; return s;
}
function b64url(bytes) {
  let s = ''; for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}
const randomToken = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
function sameToken(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0;
}
// Nom affiché : texte simple, sans caractères de contrôle, 1 à 20 caractères.
function cleanName(v) {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim();
  const chars = [...s];
  if (!chars.length || chars.length > NAME_MAX) return null;
  return s;
}
async function readJson(request) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > BODY_MAX) return null;
  const text = await request.text();
  if (text.length > BODY_MAX) return null;
  try { const v = JSON.parse(text || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; }
}

/* ---------- Validation des gestes ---------- */
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const isCell = k => typeof k === 'string' && Object.prototype.hasOwnProperty.call(H.CELL_BY_KEY, k);
// Forme d'une action : ['slot', i] | ['token', handIdx, k] | ['card', marketIdx] | ['cube', cardIdx, k]
function validAction(a) {
  if (!Array.isArray(a)) return false;
  switch (a[0]) {
    case 'slot': return a.length === 2 && isInt(a[1], 0, 4);
    case 'token': return a.length === 3 && isInt(a[1], 0, 2) && isCell(a[2]);
    case 'card': return a.length === 2 && isInt(a[1], 0, 4);
    case 'cube': return a.length === 3 && isInt(a[1], 0, 3) && isCell(a[2]);
    default: return false;
  }
}
const validActions = acts => Array.isArray(acts) && acts.length <= ACTIONS_MAX && acts.every(validAction);

// Rejoue un tour complet sur une copie. Renvoie le nouvel état, ou un message d'erreur.
function replayTurn(state, actions) {
  const S = H.clone(state);
  try {
    for (const a of actions) {
      let ok;
      if (a[0] === 'slot') ok = H.takeSlot(S, a[1]);
      else if (a[0] === 'token') ok = H.placeToken(S, a[1], a[2]);
      else if (a[0] === 'card') ok = H.takeCard(S, a[1]);
      else ok = H.placeCube(S, a[1], a[2]) != null;
      if (!ok) return { error: 'Geste refusé : ' + JSON.stringify(a) };
    }
    if (!H.canEndTurn(S)) return { error: 'Le tour ne peut pas encore se terminer' };
    if (!H.endTurn(S)) return { error: 'Fin de tour refusée' };
  } catch {
    return { error: 'Tour invalide' };
  }
  return { state: S };
}

// État vu par un siège : pas de sac ni de pioche (l'ordre est secret), esprit adverse masqué.
function publicState(state, seat) {
  if (!state) return null;
  const S = H.clone(state);
  S.bagCount = S.bag.length; S.deckCount = S.deck.length;
  S.bag = []; S.deck = [];
  if (!S.over) S.players.forEach((p, i) => {
    if (i !== seat && 'spiritChoice' in p) { p.spiritChoice = null; p.spirit = null; p.spiritHidden = true; }
  });
  return S;
}

/* ---------- Web Push sans contenu (VAPID, RFC 8292) ---------- */
let vapidKeyCache = null;
async function vapidKey(env) {
  if (vapidKeyCache && vapidKeyCache.pub === env.VAPID_PUBLIC) return vapidKeyCache.key;
  const pub = unb64url(env.VAPID_PUBLIC);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID_PUBLIC invalide');
  const key = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256', ext: true,
    x: b64url(pub.slice(1, 33)), y: b64url(pub.slice(33, 65)), d: env.VAPID_PRIVATE,
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  vapidKeyCache = { pub: env.VAPID_PUBLIC, key };
  return key;
}
// JWT ES256 : WebCrypto renvoie la signature brute r||s (64 octets), c'est le format JWS attendu.
export async function vapidJwt(env, audience, subject, now = Math.floor(Date.now() / 1000)) {
  const enc = o => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = enc({ typ: 'JWT', alg: 'ES256' }) + '.' + enc({ aud: audience, exp: now + 12 * 3600, sub: subject });
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await vapidKey(env), new TextEncoder().encode(unsigned));
  return unsigned + '.' + b64url(new Uint8Array(sig));
}
function pushEndpointOk(endpoint) {
  try { const u = new URL(endpoint); return u.protocol === 'https:' && PUSH_HOSTS.some(re => re.test(u.hostname)); } catch { return false; }
}
// Renvoie le statut HTTP du service push (0 si erreur réseau).
async function sendPush(env, sub, subject) {
  const aud = new URL(sub.endpoint).origin;
  const jwt = await vapidJwt(env, aud, subject);
  try {
    const r = await fetch(sub.endpoint, {
      method: 'POST',
      headers: { TTL: String(PUSH_TTL), Urgency: 'high', Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC}`, 'Content-Length': '0' },
    });
    return r.status;
  } catch { return 0; }
}

/* ---------- Worker : routage ---------- */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]

    if (parts[1] === 'vapid' && parts.length === 2 && request.method === 'GET') {
      if (!env.VAPID_PUBLIC) return fail(503, 'Notifications non configurées');
      return json({ key: env.VAPID_PUBLIC });
    }

    // Registre des parties (serveur privé seulement, PRIVATE_LOBBY=1) : retrouver ses parties par prénom.
    if (parts[1] === 'games' && parts.length === 2 && request.method === 'GET') {
      if (env.PRIVATE_LOBBY !== '1') return fail(404, 'Route inconnue');
      const name = cleanName(url.searchParams.get('name') || '');
      if (!name) return fail(400, 'Nom invalide (1 à 20 caractères)');
      return lobbyStub(env).fetch('https://lobby/list?name=' + encodeURIComponent(name));
    }

    if (parts[1] === 'rooms') {
      // POST /api/rooms : crée une salle avec un code libre
      if (parts.length === 2 && request.method === 'POST') {
        const body = await readJson(request);
        const name = body && cleanName(body.name);
        if (!name) return fail(400, 'Nom invalide (1 à 20 caractères)');
        for (let tries = 0; tries < 8; tries++) {
          const room = randomCode();
          const r = await roomStub(env, room).fetch('https://room/create', {
            method: 'POST', body: JSON.stringify({ room, name, origin: url.origin }),
          });
          if (r.status !== 409) return r;
        }
        return fail(503, 'Aucun code de salle libre, réessaie');
      }
      const room = (parts[2] || '').toUpperCase();
      if (!ROOM_RE.test(room)) {
        // Le client attend une fermeture 4404 : une salle vide (jamais créée) s'en charge.
        if (parts[3] === 'ws' && request.headers.get('Upgrade') === 'websocket') return roomStub(env, '-').fetch(new Request('https://room/ws', request));
        return fail(404, 'Salle introuvable');
      }
      // POST /api/rooms/:room/join
      if (parts.length === 4 && parts[3] === 'join' && request.method === 'POST') {
        const body = await readJson(request);
        const name = body && cleanName(body.name);
        if (!name) return fail(400, 'Nom invalide (1 à 20 caractères)');
        return roomStub(env, room).fetch('https://room/join', { method: 'POST', body: JSON.stringify({ name }) });
      }
      // POST /api/rooms/:room/claim : reprendre sa place par son prénom (serveur privé seulement)
      if (parts.length === 4 && parts[3] === 'claim' && request.method === 'POST') {
        if (env.PRIVATE_LOBBY !== '1') return fail(404, 'Route inconnue');
        const body = await readJson(request);
        const name = body && cleanName(body.name);
        if (!name) return fail(400, 'Nom invalide (1 à 20 caractères)');
        return roomStub(env, room).fetch('https://room/claim', { method: 'POST', body: JSON.stringify({ name }) });
      }
      // POST /api/rooms/:room/index : réinscrit une salle existante au registre (serveur privé seulement)
      if (parts.length === 4 && parts[3] === 'index' && request.method === 'POST') {
        if (env.PRIVATE_LOBBY !== '1') return fail(404, 'Route inconnue');
        return roomStub(env, room).fetch('https://room/index', { method: 'POST' });
      }
      // GET /api/rooms/:room/ws?token=…
      if (parts.length === 4 && parts[3] === 'ws' && request.method === 'GET') {
        if (request.headers.get('Upgrade') !== 'websocket') return fail(426, 'WebSocket attendu');
        const token = url.searchParams.get('token') || '';
        return roomStub(env, room).fetch(new Request('https://room/ws?token=' + encodeURIComponent(token), request));
      }
    }
    return fail(404, 'Route inconnue');
  },
};
const roomStub = (env, room) => env.ROOM.get(env.ROOM.idFromName(room));
const lobbyStub = env => env.LOBBY.get(env.LOBBY.idFromName('registre'));

/* ---------- Durable Object : une salle ---------- */
// Stockage : une seule clé 'room' = { room, origin, seats: [{name, token}], state, version, subs: [[...], [...]] }
export class Room {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.data = null;
    ctx.blockConcurrencyWhile(async () => { this.data = (await ctx.storage.get('room')) || null; });
    // Le client envoie { t: 'ping' } toutes les 25 s : réponse automatique, sans réveiller l'objet.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
  }
  async save() {
    await this.ctx.storage.put('room', this.data);
    if (this.env.PRIVATE_LOBBY === '1' && this.env.LOBBY) this.ctx.waitUntil(this.report());
  }
  report() {
    const d = this.data, S = d.state;
    const entry = { room: d.room, names: d.seats.map(s => s && s.name), current: S ? S.current : null, over: S ? !!S.over : false,
      turns: S ? S.players.map(p => p.turns) : null, online: this.presence(this._closing), updated: Date.now(), created: d.created };
    return lobbyStub(this.env).fetch('https://lobby/put', { method: 'POST', body: JSON.stringify(entry) }).catch(() => {});
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/create') {
      if (this.data) return fail(409, 'Code déjà pris');
      const { room, name, origin } = await request.json();
      const token = randomToken();
      this.data = { room, origin, seats: [{ name, token }, null], state: null, version: 0, subs: [[], []], created: Date.now() };
      await this.save();
      return json({ room, seat: 0, token });
    }
    if (!this.data) return url.pathname === '/ws' ? this.refuse(4404, 'Salle introuvable') : fail(404, 'Salle introuvable');
    if (url.pathname === '/claim') {
      const { name } = await request.json();
      const want = name.toLocaleLowerCase('fr');
      const seat = this.data.seats.findIndex(s => s && s.name.trim().toLocaleLowerCase('fr') === want);
      if (seat < 0) return fail(403, 'Ce prénom ne joue pas dans cette partie');
      return json({ room: this.data.room, seat, token: this.data.seats[seat].token });
    }
    if (url.pathname === '/index') { await this.report(); return json({ ok: true, room: this.data.room }); }
    if (url.pathname === '/join') {
      if (this.data.seats[1]) return fail(409, 'Salle complète');
      const { name } = await request.json();
      const token = randomToken();
      this.data.seats[1] = { name, token };
      this.data.state = H.newState([this.data.seats[0].name, name], { spirits: true });
      this.data.version = 1;
      await this.save();
      this.broadcastState();
      this.ctx.waitUntil(this.notify(0)); // le créateur apprend que la partie commence
      return json({ room: this.data.room, seat: 1, token });
    }
    if (url.pathname === '/ws') {
      const token = url.searchParams.get('token');
      const seat = this.data.seats.findIndex(s => s && sameToken(s.token, token));
      if (seat < 0) return this.refuse(4401, 'Jeton invalide');
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1], ['s' + seat]);
      pair[1].serializeAttachment({ seat });
      this.sendState(pair[1], seat);
      this.broadcast({ t: 'presence', online: this.presence() });
      if (this.env.PRIVATE_LOBBY === '1') this.ctx.waitUntil(this.report());
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    return fail(404, 'Route inconnue');
  }

  // Refus d'un WebSocket : accepté puis fermé aussitôt avec un code applicatif que le navigateur voit
  // (4401 jeton invalide, 4404 salle inconnue) — un 403/404 HTTP n'arrive jamais jusqu'au JavaScript du client.
  refuse(code, reason) {
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], ['refused']);
    pair[1].close(code, reason);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  /* --- WebSocket (API Hibernation) --- */
  async webSocketMessage(ws, raw) {
    const { seat } = ws.deserializeAttachment() || {};
    if (seat !== 0 && seat !== 1) return ws.close(1008, 'siège inconnu');
    if (typeof raw !== 'string' || raw.length > WS_MSG_MAX) return this.err(ws, 'Message trop long');
    let m; try { m = JSON.parse(raw); } catch { return this.err(ws, 'JSON invalide'); }
    if (!m || typeof m !== 'object') return this.err(ws, 'Message invalide');
    const d = this.data, S = d.state;

    switch (m.t) {
      case 'ping': return this.send(ws, { t: 'pong' }); // variante non canonique du ping (espaces, champs en plus)
      case 'turn': {
        if (!S) return this.err(ws, 'La partie n’a pas commencé');
        if (m.version !== d.version) { this.sendState(ws, seat); return this.err(ws, 'Version périmée'); }
        if (S.over) return this.err(ws, 'La partie est finie');
        if (S.current !== seat) return this.err(ws, 'Ce n’est pas ton tour');
        if (!validActions(m.actions)) return this.err(ws, 'Gestes invalides');
        const res = replayTurn(S, m.actions);
        if (res.error) { this.sendState(ws, seat); return this.err(ws, res.error); }
        return this.commit(res.state, seat);
      }
      case 'preview': {
        if (!S || S.over || S.current !== seat || !validActions(m.actions)) return;
        return this.sendSeat(1 - seat, { t: 'preview', seat, actions: m.actions });
      }
      case 'spirit': {
        if (!S || !isInt(m.idx, 0, 1)) return this.err(ws, 'Esprit invalide');
        const N = H.clone(S);
        if (!H.chooseSpirit(N, seat, m.idx)) return this.err(ws, 'Esprit déjà choisi');
        return this.commit(N, seat, { quiet: true });
      }
      case 'continue': {
        if (!S || !(S.over || (S.endTriggered && !S.freePlay))) return this.err(ws, 'Rien à continuer');
        const N = H.clone(S);
        if (!H.continueGame(N)) return this.err(ws, 'Le sac est vide, la partie est finie');
        return this.commit(N, seat);
      }
      case 'rematch': {
        if (!S || !S.over) return this.err(ws, 'La partie n’est pas finie');
        return this.commit(H.newState(d.seats.map(s => s.name), { spirits: true }), seat);
      }
      case 'push': {
        const sub = m.sub;
        if (!sub || typeof sub.endpoint !== 'string' || sub.endpoint.length > 1024 || !pushEndpointOk(sub.endpoint)) return this.err(ws, 'Abonnement refusé');
        const list = d.subs[seat].filter(s => s.endpoint !== sub.endpoint);
        // Push sans contenu : seul l'endpoint sert (les clés de chiffrement sont inutiles).
        list.push({ endpoint: sub.endpoint });
        d.subs[seat] = list.slice(-SUBS_PER_SEAT);
        await this.save();
        return;
      }
      default: return this.err(ws, 'Type de message inconnu');
    }
  }
  async webSocketClose(ws, code) {
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, 'au revoir'); } catch { }
    this.broadcast({ t: 'presence', online: this.presence(ws) });
    if (this.env.PRIVATE_LOBBY === '1') { this._closing = ws; await this.report(); this._closing = null; }
  }
  async webSocketError(ws) {
    this.broadcast({ t: 'presence', online: this.presence(ws) });
  }

  /* --- État --- */
  // Enregistre un nouvel état, le diffuse, et prévient par push le joueur qui doit agir.
  async commit(N, actor, { quiet = false } = {}) {
    const before = this.data.state;
    this.data.state = N; this.data.version++;
    await this.save();
    this.broadcastState();
    if (quiet) return;
    const other = 1 - actor;
    // Changement de tour vers l'autre, ou fin de partie : l'autre doit regarder son téléphone.
    if ((N.over && !before.over) || (!N.over && N.current === other)) this.ctx.waitUntil(this.notify(other));
  }
  sendState(ws, seat) {
    const d = this.data;
    this.send(ws, { t: 'state', seat, version: d.version, state: publicState(d.state, seat), players: this.players() });
  }
  broadcastState() {
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment(); if (a) this.sendState(ws, a.seat);
    }
  }
  players() {
    const on = this.presence();
    return this.data.seats.map((s, i) => s ? { name: s.name, online: on[i] } : null);
  }
  presence(closing) {
    return [0, 1].map(i => this.ctx.getWebSockets('s' + i).some(w => w !== closing && w.readyState === 1));
  }
  send(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch { } }
  sendSeat(seat, msg) { for (const ws of this.ctx.getWebSockets('s' + seat)) this.send(ws, msg); }
  broadcast(msg) { for (const ws of this.ctx.getWebSockets()) this.send(ws, msg); }
  err(ws, msg) { this.send(ws, { t: 'error', msg }); }

  /* --- Notifications --- */
  async notify(seat) {
    const env = this.env, subs = this.data.subs[seat];
    if (!env.VAPID_PUBLIC || !env.VAPID_PRIVATE || !subs.length) return;
    const subject = env.VAPID_SUBJECT || (this.data.origin && this.data.origin.startsWith('https:') ? this.data.origin : 'mailto:verdance@example.com');
    const dead = new Set();
    await Promise.all(subs.map(async s => {
      try {
        const st = await sendPush(env, s, subject);
        console.log(`push salle ${this.data.room} siège ${seat} -> ${new URL(s.endpoint).hostname} : ${st}`);
        if (st === 404 || st === 410) dead.add(s.endpoint);
      } catch (e) { console.log('push en échec : ' + e.message); }
    }));
    if (dead.size) {
      this.data.subs[seat] = this.data.subs[seat].filter(s => !dead.has(s.endpoint));
      await this.save();
    }
  }
}

/* ---------- Durable Object : registre des parties (serveur privé) ---------- */
// Stockage : 'rooms' = { CODE: { room, names, current, over, turns, updated, created } }
export class Lobby {
  constructor(ctx) { this.ctx = ctx; }
  async fetch(request) {
    const url = new URL(request.url);
    const rooms = (await this.ctx.storage.get('rooms')) || {};
    if (url.pathname === '/put') {
      const e = await request.json();
      rooms[e.room] = Object.assign(rooms[e.room] || {}, e);
      await this.ctx.storage.put('rooms', rooms);
      return json({ ok: true });
    }
    if (url.pathname === '/list') {
      const want = (url.searchParams.get('name') || '').toLocaleLowerCase('fr');
      const same = n => n && n.trim().toLocaleLowerCase('fr') === want;
      const day = 7 * 86400e3, now = Date.now();
      const out = [];
      for (const e of Object.values(rooms)) {
        const seat = e.names.findIndex(same);
        if (seat >= 0) out.push({ ...e, seat });
        // Une partie qui attend encore son second joueur, lancée par quelqu'un d'autre : on peut la rejoindre.
        else if (!e.names[1] && now - (e.created || e.updated) < day) out.push({ ...e, seat: null, open: true });
      }
      out.sort((a, b) => b.updated - a.updated);
      return json({ games: out.slice(0, 30) });
    }
    return fail(404, 'Route inconnue');
  }
}

// Exposé pour les tests (tools/e2e.mjs)
export const _test = { publicState, replayTurn, validActions, cleanName, unb64url, b64url };
