# Verdance mobile

La version téléphone de Verdance, pour jouer en ligne à deux. C'est une application web installable, sans App Store. Le monde 3D s'inspire de *The Battle of Polytopia* : îles dans un lagon, facettes nettes, couleurs franches.

L'architecture et le protocole en ligne sont décrits dans [ARCHITECTURE.md](ARCHITECTURE.md).

## Jouer

- **Créer une partie en ligne** : l'app donne un code et un lien à envoyer. La partie commence dès que l'autre rejoint.
- **Rejoindre** : ouvrir le lien reçu, ou saisir le code.
- **Jouer ici** : à deux sur le même téléphone, en se le passant.

Chacun joue son tour quand il veut. Le tour ne part qu'au moment de « Terminer » ; avant, « Annuler » revient en arrière. Quand l'autre joue en même temps que toi, tu vois ses jetons arriver en direct sur son île.

Sur iPhone, pour recevoir « C'est ton tour » :

1. Ouvrir le site dans Safari.
2. Toucher Partager, puis « Sur l'écran d'accueil ».
3. Ouvrir Verdance depuis l'icône.
4. Activer les notifications dans le menu de la partie.

## Développer

```sh
cd mobile
node tools/vapid-keys.mjs --dev-vars        # une seule fois : clés de notification locales
npx wrangler@4 dev --port 8799 --ip 127.0.0.1
# http://127.0.0.1:8799/        l'app
# http://127.0.0.1:8799/world-test.html   banc d'essai du monde 3D (?style=polytopia|dore|brume)
node tools/e2e.mjs http://127.0.0.1:8799    # test de bout en bout du serveur (50 vérifications)
```

`public/rules.js` est une copie de `../rules.js`. Après une modification des règles, lancer `bash tools/sync-rules.sh`.

## Mettre en ligne

```sh
cd mobile
npx wrangler@4 deploy
node tools/vapid-keys.mjs                   # clés de prod, à garder
npx wrangler@4 secret put VAPID_PUBLIC      # coller la valeur affichée
npx wrangler@4 secret put VAPID_PRIVATE
```

Une fois que des téléphones sont abonnés aux notifications, ne plus changer `VAPID_PUBLIC`.

## Crédits

Les modèles d'animaux sont décrits dans `public/models/CREDITS.md` (CC-BY 3.0 et CC0). Ils restent sous leur propre licence.
