# Verdance mobile : architecture

Version téléphone de Verdance, jouable en ligne à deux (Alice contre Bob).
Application web installable (PWA), pas d'App Store. Direction artistique inspirée de *The Battle of Polytopia*.

## Arborescence

```
mobile/
  public/            servi tel quel (Cloudflare Workers, assets statiques)
    index.html       coquille de l'app, importmap three@0.160.0
    app.css          interface
    app.js           interface téléphone (écrans, plateau central, main, cartes, fin de partie)
    net.js           client en ligne (HTTP + WebSocket)
    world.js         monde 3D (fork de ../scene.js, restylé façon Polytopia), expose window.Scene
    rules.js         copie de ../rules.js (règles pures, expose globalThis.H) — ne pas modifier ici
    models/*.glb     animaux (chargés à la demande par URL)
    manifest.webmanifest, sw.js, icons/
  src/worker.js      Worker Cloudflare + Durable Object `Room`
  wrangler.jsonc
  tools/sync-rules.sh  recopie ../rules.js dans public/
  tools/vapid-keys.mjs génère la paire de clés VAPID (--dev-vars : écrit .dev.vars)
  tools/e2e.mjs        test de bout en bout contre `wrangler dev`
  .dev.vars            clés VAPID locales (ignoré par git)
```

Local : `npx wrangler@4 dev --port 8799` (le port 8787 est pris par le cockpit), puis `node tools/e2e.mjs http://127.0.0.1:8799`.

## API du monde 3D (`window.Scene`, world.js)

Mêmes appels que la version bureau, plus deux ajouts mobiles :

- `Scene.init(el, { onReady, onError, onCellClick(pi, k) })`
- `Scene.sync(state, view)` avec `view = { activeIdx, legal: [k], targets: [k], patternHi: [k], ghostColor, animate }`
  - `activeIdx` : île sur laquelle on peut agir (-1 si aucune)
  - `legal` : cases où le jeton sélectionné peut aller ; `targets` : cases où un cube animal peut aller
- `Scene.focus(i, { instant })` : vole jusqu'à l'île du joueur i
- `Scene.setInsets({ top, bottom })` (px) : zone de l'écran masquée par l'interface, pour cadrer l'île dans l'espace visible
- `Scene.celebrate(pi, k)`, `Scene.screenPos(pi, k)` → `{x, y}` écran
- `Scene.reset()`
- Pas de survol (tactile). Toucher = `onCellClick`. Un doigt glisse = déplacement, pincer = zoom.

## Protocole en ligne

Salle = code de 5 caractères (ex. `K7P2Q`), un Durable Object par salle (`idFromName(code)`).
Deux sièges : 0 (créateur) et 1 (invité). Chaque siège a un jeton secret, gardé dans le localStorage du téléphone.

HTTP :
- `POST /api/rooms` `{ name }` → `{ room, seat: 0, token }`
- `POST /api/rooms/:room/join` `{ name }` → `{ room, seat: 1, token }` (409 si complet)
- `GET  /api/rooms/:room/ws?token=…` → WebSocket
- `GET  /api/vapid` → `{ key }` clé publique Web Push (base64url, point P-256 non compressé = `applicationServerKey`) ; 503 si non configurée
- Erreurs HTTP : `{ error }` en français. Nom : 1 à 20 caractères, sans caractères de contrôle (400 sinon). Code de salle insensible à la casse,
  alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (ni 0/O ni 1/I). Salle inconnue : 404.
- WebSocket refusé : la connexion est acceptée puis fermée aussitôt avec le code **4401** (« Jeton invalide ») ou **4404** (« Salle introuvable »).

La partie démarre quand le siège 1 rejoint : `H.newState([nom0, nom1], { spirits: true })`.

Serveur → client :
- `{ t: 'state', seat, version, state, players: [{ name, online }] }` (envoyé à la connexion et après chaque changement ;
  `players[1]` vaut `null` tant que l'invité n'a pas rejoint ; `version` vaut 0 avant le début, 1 au début)
  - `state` est l'état public pour ce siège : `bag` et `deck` vidés (remplacés par `bagCount`, `deckCount`),
    esprit de l'adversaire masqué (`spiritChoice: null, spirit: null, spiritHidden: true`) tant que la partie n'est pas finie.
  - avant que le siège 1 ait rejoint : `state: null`
- `{ t: 'preview', seat, actions }` : tour en cours de l'adversaire, relayé tel quel (non persistant)
- `{ t: 'presence', online: [bool, bool] }`
- `{ t: 'error', msg }` (message en français). Quand un tour est refusé (version périmée, geste illégal), le serveur renvoie
  d'abord un `state` frais à l'expéditeur, puis l'erreur.
- `{ t: 'pong' }` : réponse à `ping`.

Client → serveur :
- `{ t: 'turn', version, actions }` : le tour complet, envoyé au moment de « Terminer le tour ».
  `actions` : liste de `['slot', i]`, `['token', handIdx, k]`, `['card', marketIdx]`, `['cube', cardIdx, k]`.
  Le serveur vérifie `version` et `state.current === seat`, rejoue sur une copie avec `H.takeSlot/placeToken/takeCard/placeCube`
  (chaque appel doit réussir), puis `H.canEndTurn` et `H.endTurn`. Si tout passe : version+1, sauvegarde, diffusion.
- `{ t: 'preview', actions }` : après chaque geste, pour que l'autre voie le tour se construire en direct.
  Relayé seulement si c'est le tour de l'expéditeur et si les gestes sont bien formés ; ignoré sinon, sans erreur.
- `{ t: 'spirit', idx }` : `H.chooseSpirit(state, seat, idx)`, `idx` ∈ {0, 1}, une seule fois.
- `{ t: 'continue' }` / `{ t: 'rematch' }` : `continue` est accepté quand la partie est finie ou quand la fin est déclenchée
  (`endTriggered && !freePlay`, bouton « Ignorer la fin ») ; `rematch` seulement partie finie (nouvelle partie, mêmes sièges).
- `{ t: 'push', sub }` : abonnement Web Push (objet `PushSubscription.toJSON()`) pour ce siège. Seul `endpoint` est gardé
  (push sans contenu), 5 abonnements max par siège ; refusé (`error`) si l'endpoint n'est pas en https chez un service
  push connu (FCM, Mozilla, Apple, Windows).
- `{ t: 'ping' }` : toutes les 25 s ; le serveur répond `{ t: 'pong' }` (réponse automatique, l'objet n'est pas réveillé).
- Taille max d'un message : 16 Ko ; 40 gestes max par tour.

Notifications : à chaque changement de tour, le serveur envoie un Web Push **sans contenu** aux abonnements du joueur
dont c'est le tour (VAPID, secrets `VAPID_PUBLIC`, `VAPID_PRIVATE`). Le service worker affiche « C'est ton tour ».
Aussi : au créateur quand l'invité rejoint (la partie commence), et à l'adversaire quand un coup termine la partie.
Les abonnements qui répondent 404/410 sont supprimés. `VAPID_SUBJECT` (facultatif, `mailto:` ou `https:`) ; à défaut, l'origine du site.

Le client joue son tour en local sur une copie (annuler = revenir à une copie précédente), et n'envoie qu'à la fin.
