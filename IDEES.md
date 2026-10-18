# Verdance — pistes pour faire évoluer le jeu

## Ce qui fait le sel du jeu (à ne pas casser)

- **Un puzzle spatial calme.** On construit, on ne détruit presque rien. Chaque jeton posé est une petite décision lisible.
- **La tension des 3 jetons.** On ne choisit jamais exactement ce qu'on veut : il faut composer avec le lot.
- **Les motifs qui se chevauchent.** Un même jeton sert à plusieurs animaux. C'est là que naissent les combos.
- **Une interaction légère.** On se dispute seulement le plateau central et les cartes, ce qui donne peu d'attente et peu de méchanceté.
- **Une partie courte**, 20 à 30 minutes.

Toute variante doit garder ça : des tours courts, un plateau lisible, pas d'attente.

---

## 1. Compléter le jeu de base

| Piste | Ce que ça change | Effort |
|---|---|---|
| **Plateau « archipel »** | Un plateau plus grand où l'eau se compte en îles plutôt qu'en rivière. | Faible |
| **Esprits du paysage** | Une carte objectif secrète par joueur, au décompte variable (« 3 pts par montagne »…). | Faible |
| **Illustrations des animaux** | Une peinture par carte, dans un style maison. | Moyen |

## 2. Variantes de règles (testables en une soirée)

1. **Les saisons**. La partie est découpée en 4 saisons. Chacune donne un bonus de décompte : au printemps, les champs valent +2 ; l'été, la rivière gagne +1 par jeton ; à l'automne, les grands arbres valent ×2 ; l'hiver, les montagnes enneigées (hauteur 3) valent +3. **Le diorama change avec la saison** : feuilles rousses, neige sur les sommets, lumière dorée. C'est la piste qui marie le mieux mécanique et émerveillement.
2. **Objectifs publics.** Trois tuiles tirées en début de partie, par exemple « le plus long champ », « 3 maisons alignées », « une montagne entourée d'eau ». Le premier à en réussir une gagne 8 points, le second 4. Ça ajoute une course sans ajouter d'attente (idée reprise de Cascadia).
3. **Pouvoirs d'animaux.** Quand une carte est complétée, l'animal donne un pouvoir unique et immédiat. Le Castor permet de poser un jeton bleu sur un champ. L'Aigle permet de prendre 4 jetons au prochain tour. La Chouette permet de regarder les 3 prochaines cartes. On garde le jeu calme, mais on ajoute des combos à la Wingspan.
4. **La défausse qui coûte.** Un jeton qu'on ne veut pas poser va dans une « réserve de friche » : −1 point par jeton en fin de partie. Ça donne plus de liberté sans casser la tension (idée reprise de la ligne de pénalité d'Azul).
5. **L'harmonie parfaite.** Bonus de 3 points pour toute case dont les 6 voisines montrent les 5 terrains différents. Ça récompense les paysages variés, et ça porte le nom du jeu.

## 3. Nouveaux modes de jeu

1. **Le défi du jour.** Tout le monde a le même sac, mélangé avec la date. Chacun joue seul quand il veut, et on compare les scores le soir. C'est le mode « Wordle », idéal pour jouer chacun de son côté.
2. **La vallée partagée (coopératif ou rival).** Un grand plateau commun au lieu d'un plateau chacun. Les animaux posés appartiennent à celui qui pose le cube. Il y a plus d'interaction : on peut finir le motif de l'autre, ou le bloquer. C'est le mode le plus original. À tester : il change beaucoup l'esprit du jeu.
3. **Coopératif contre la nature.** Ensemble, accueillez 12 animaux avant que le sac soit vide. Les événements (sécheresse, crue) retirent des jetons. Ce serait un vrai jeu à deux, sans perdant entre vous.
4. **Campagne.** Une suite de 8 scénarios : un plateau prédessiné (un lac déjà là, une falaise), un objectif, une règle spéciale. On débloque un animal ou une saison à chaque victoire.

## 4. L'expérience autour du jeu (sans toucher aux règles)

- **Le paysage vivant après la partie.** Les animaux accueillis se promènent sur l'île, on peut zoomer et prendre une photo. On garde une galerie de ses plus beaux paysages.
- **Cycle jour/nuit pendant la partie.** Les fenêtres des maisons s'allument au dernier tour.
- **Ambiance sonore.** Ruisseau près de l'eau, oiseaux près des forêts, vent sur les sommets, avec un volume qui dépend du paysage construit.
- **Statistiques entre vous deux.** Victoires, meilleur score, animal préféré, plus longue rivière jamais construite.

## 5. Version en ligne, jeu en parallèle

**Objectif :** jouer chacun sur son appareil, sans attendre l'autre.

- **Tour simultané.** Les deux joueurs choisissent leur emplacement de 3 jetons en même temps, en secret. Si vous choisissez le même, le joueur prioritaire (le jeton premier joueur, qui tourne à chaque manche) le garde, et l'autre rechoisit parmi les restants. Ensuite chacun pose ses jetons et ses animaux en parallèle. On passe à la manche suivante quand les deux ont validé. Les cartes Animal se prennent en temps réel : premier arrivé, premier servi.
- **Ou bien, en différé.** Chacun joue son tour quand il veut, et l'autre reçoit une notification.
- **Technique.** Le fichier `rules.js` est déjà séparé de l'affichage : il peut tourner tel quel sur un serveur qui arbitre la partie. Un serveur temps réel léger (Cloudflare, déjà utilisé pour vos autres projets), un lien d'invitation, et la même interface 3D. Le défi du jour s'y branche naturellement.

---

## Recommandation : l'ordre de construction

1. **Plateau archipel et esprits du paysage.** C'est rapide et ça renouvelle les parties.
2. **Les saisons.** C'est la variante la plus spectaculaire en 3D, et elle renouvelle chaque partie.
3. **Version en ligne avec tour simultané**, puis le défi du jour par-dessus.
4. **Pouvoirs d'animaux, ou la vallée partagée**, selon ce qui vous amuse le plus en testant.
