/* Verdance mobile — client en ligne : création de salle, invitation, WebSocket qui se reconnecte tout seul. */
(function () {
'use strict';

async function post(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
  let data = null; try { data = await res.json(); } catch (e) {}
  if (!res.ok) { const err = new Error((data && (data.error || data.msg)) || ('HTTP ' + res.status)); err.status = res.status; throw err; }
  return data;
}

// Une connexion à une salle. handlers : { state, preview, presence, error, status(online: bool) }
function connect(room, token, handlers) {
  let ws = null, closed = false, retry = 0, timer = null, ping = null;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${location.host}/api/rooms/${encodeURIComponent(room)}/ws?token=${encodeURIComponent(token)}`;
  function open() {
    if (closed) return;
    try { ws = new WebSocket(url); } catch (e) { schedule(); return; }
    ws.onopen = () => {
      retry = 0; handlers.status && handlers.status(true);
      clearInterval(ping); ping = setInterval(() => send({ t: 'ping' }), 25000);
    };
    ws.onmessage = ev => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      const h = handlers[m.t]; if (h) h(m);
    };
    ws.onclose = ev => {
      clearInterval(ping); handlers.status && handlers.status(false);
      if (ev.code === 4401 || ev.code === 4404) { closed = true; handlers.error && handlers.error({ msg: ev.reason || 'Partie introuvable', fatal: true }); return; }
      schedule();
    };
    ws.onerror = () => {};
  }
  function schedule() { if (closed) return; clearTimeout(timer); timer = setTimeout(open, Math.min(8000, 500 * Math.pow(2, retry++))); }
  function send(msg) { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(msg)); return true; } return false; }
  // Au retour sur l'app (téléphone sorti de veille), on rouvre tout de suite.
  const wake = () => { if (document.visibilityState === 'visible' && (!ws || ws.readyState > 1)) { retry = 0; clearTimeout(timer); open(); } };
  document.addEventListener('visibilitychange', wake);
  open();
  return {
    send,
    close() { closed = true; clearTimeout(timer); clearInterval(ping); document.removeEventListener('visibilitychange', wake); if (ws) try { ws.close(); } catch (e) {} },
    get online() { return !!ws && ws.readyState === 1; },
  };
}

function b64ToBytes(b64) { const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4)); return Uint8Array.from(s, c => c.charCodeAt(0)); }

// Abonnement aux notifications « c'est ton tour ». Renvoie l'abonnement, ou lève une erreur lisible.
async function subscribePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error(isIOS() ? 'Ajoute d’abord Verdance à ton écran d’accueil, puis ouvre-le depuis l’icône.' : 'Ce navigateur ne gère pas les notifications.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications refusées. Tu peux les réactiver dans les réglages du téléphone.');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { key } = await (await fetch('/api/vapid')).json();
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
  }
  return sub.toJSON();
}
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

window.Net = {
  create: name => post('/api/rooms', { name }),
  join: (room, name) => post(`/api/rooms/${encodeURIComponent(room)}/join`, { name }),
  claim: (room, name) => post(`/api/rooms/${encodeURIComponent(room)}/claim`, { name }),
  // Parties connues du serveur pour ce prénom (null si le serveur n'a pas de registre)
  async games(name) {
    const res = await fetch('/api/games?name=' + encodeURIComponent(name));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return (await res.json()).games;
  },
  connect, subscribePush, isIOS, isStandalone,
};
})();
