# Mealie

[Mealie](https://mealie.io/) est un gestionnaire de recettes auto-hébergé : vos
recettes, un planning des repas pour la semaine et des listes de courses
partagées. Cette intégration l'amène dans Gladys : un appareil montre les repas
d'aujourd'hui et de demain, le nombre de recettes et les articles qui restent à
acheter sur chaque liste ; les scènes peuvent ajouter un article à une liste
(« le lait est fini »), en cocher un, prévoir une recette ou envoyer le menu du
jour ; deux widgets du tableau de bord montrent le menu et une liste de
courses, avec des boutons pour ajouter, cocher et planifier depuis la tablette
murale.

Testée avec de vrais serveurs Mealie 2.0.0 et 3.28 ; pas encore sur une vraie
installation de Gladys : vos retours sont les bienvenus sur
[les issues](https://github.com/guim31/gladys-mealie/issues).

## Ce qu'il faut

- Gladys Assistant 5.2.0 ou plus récent.
- Mealie 2.0 ou plus récent (Mealie 1.x n'a pas l'API des foyers), joignable
  depuis la machine de Gladys : sur le réseau local, ou sur Internet en HTTPS.
- Un jeton d'API d'un utilisateur de Mealie. Il agit avec les droits de cet
  utilisateur, sur le planning et les listes de courses de son foyer.

## Mise en route

### 1. Créer un jeton d'API

Dans Mealie, cliquez sur votre avatar, ouvrez votre **profil**, puis **Jetons
de l'API**. Donnez un nom au jeton (par exemple `Gladys`) et cliquez sur
**Générer**. Copiez le jeton : Mealie ne le montre qu'une fois.

### 2. Configurer l'intégration

Dans Gladys, **Intégrations → Mealie → Configuration** :

- **Adresse de Mealie** : l'adresse avec laquelle vous ouvrez Mealie, port
  compris, par exemple `http://192.168.1.2:9925` ou
  `https://mealie.example.com`. Une adresse copiée depuis le navigateur
  (`…/g/home/recipes`) convient aussi.
- **Jeton d'API** : le jeton de l'étape 1.
- **Accepter les certificats auto-signés** : seulement pour une adresse en
  `https://` dont le certificat n'est pas reconnu non plus par votre
  navigateur.
- **Intervalle de rafraîchissement** : la fréquence de lecture de Mealie,
  5 minutes par défaut (de 1 à 15 minutes). Ce que vous faites depuis Gladys
  s'affiche tout de suite.
- **Langue des noms et des messages** : la langue des noms des
  fonctionnalités et des textes des actions de scène (français par défaut).

Enregistrez, puis cliquez sur **Tester la connexion** : Mealie répond avec sa
version, son foyer et ce qu'il contient.

### 3. Ajouter l'appareil

Dans **Intégrations → Mealie → Découverte**, ajoutez l'appareil **Mealie**.
Ses valeurs apparaissent tout de suite. Quand une liste de courses est créée
dans Mealie, l'appareil propose **Mettre à jour** dans l'onglet Découverte :
son compteur s'ajoute alors.

## L'appareil Mealie

Un appareil par foyer Mealie (le foyer de l'utilisateur du jeton). Ses
fonctionnalités :

| Fonctionnalité               | Type     | Valeur                                                    |
| ---------------------------- | -------- | --------------------------------------------------------- |
| `Petit-déjeuner aujourd'hui` | Texte    | Les recettes (ou notes) du planning, ou « Rien de prévu » |
| `Déjeuner aujourd'hui`       | Texte    | Idem                                                      |
| `Dîner aujourd'hui`          | Texte    | Idem                                                      |
| `Petit-déjeuner demain`      | Texte    | Idem, pour demain                                         |
| `Déjeuner demain`            | Texte    | Idem                                                      |
| `Dîner demain`               | Texte    | Idem                                                      |
| `Recettes`                   | Compteur | Nombre de recettes dans Mealie                            |
| `À acheter : <liste>`        | Compteur | Articles encore à acheter sur chaque liste (non cochés)   |

Deux recettes pour un même repas s'affichent ainsi : `Quiche lorraine ·
Salade`. « Aujourd'hui » suit le fuseau horaire de Gladys : juste après minuit,
les repas de demain deviennent ceux d'aujourd'hui. Les noms sont donnés dans
la langue de la configuration au moment où l'appareil est ajouté, et restent
tels quels ensuite (une règle de Gladys).

## Widgets du tableau de bord

Dans **Tableau de bord → Éditer le tableau de bord**, ajoutez un widget de
l'intégration **Mealie**.

### Menu

- **Période : Aujourd'hui** : la date et une ligne par repas du jour
  (petit-déjeuner, déjeuner, dîner, accompagnement, goûter, boisson, dessert).
- **Période : 7 prochains jours** : une ligne par jour, aujourd'hui et demain
  signalés ; touchez un jour pour voir ses repas.
- **Planifier** ouvre un court formulaire (recette, jour, repas) et met la
  recette dans le planning de Mealie. Une recette vide laisse Mealie en choisir
  une au hasard (ses règles de planning s'appliquent). La même recette déjà
  prévue pour le même repas n'est pas ajoutée deux fois.
- **Actualiser** relit Mealie.
- **Ouvrir Mealie** ouvre le planning, quand Mealie a une adresse en
  `https://` (Gladys n'ouvre pas d'autres liens).

### Liste de courses

Les articles encore à acheter sur une liste (réglage **Liste de courses** : son
nom dans Mealie ; vide : la première liste créée), avec leur quantité et leur
note.

- **Ajouter** ouvre un formulaire d'un seul champ, **Article** : saisi tel
  qu'il doit s'afficher sur la liste. Un article déjà sur la liste (sans tenir
  compte des majuscules, des accents ni du pluriel) n'est pas ajouté deux fois.
- **Cocher** ouvre un formulaire qui liste les articles : celui choisi est
  coché dans Mealie, comme dans son appli (le décocher là-bas l'annule).
- **Actualiser** relit Mealie.
- **Ouvrir Mealie** ouvre la liste, quand Mealie a une adresse en `https://`.

## Scènes

### Actions

| Action                                        | Champs                                         | Résultats                                                             |
| --------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------- |
| **Ajouter à la liste de courses**             | Article, Liste de courses (vide : la première) | Article ajouté (oui/non), Article, liste, articles à acheter          |
| **Cocher un article de la liste de courses**  | Article, Liste de courses                      | Article coché (oui/non), Article, liste, articles à acheter           |
| **Ajouter une recette au planning des repas** | Recette (vide : au hasard), Jour, Repas        | Recette ajoutée (oui/non), Recette, Date                              |
| **Lire les repas d'un jour**                  | Jour (aujourd'hui, demain, après-demain)       | Petit-déjeuner, Déjeuner, Dîner, tous les repas du jour, repas prévus |
| **Lire une liste de courses**                 | Liste de courses                               | Articles à acheter (séparés par des virgules), nombre, liste          |

- Un article se trouve comme vous le dites : `oeufs` trouve `Œufs`, `tomates`
  trouve `Tomate`. Une liste se trouve par son nom, ou par son début (`cour`
  pour `Courses`).
- Une recette se trouve par son nom ou une partie, comme dans la recherche de
  Mealie.
- Un article déjà sur la liste n'est pas ajouté à nouveau : le résultat
  **Article ajouté** vaut alors « non ». Un article absent de la liste n'est pas
  une erreur : **Article coché** vaut « non ».
- Les résultats passent aux actions suivantes de la scène, par exemple un
  message `Ce soir : {{0.0.dinner}}` (`0.0` : la position de l'action dans la
  scène ; l'éditeur du message liste les résultats).
- Les repas goûter, boisson et dessert demandent Mealie 3.7 ou plus récent ; un
  Mealie plus ancien connaît petit-déjeuner, déjeuner, dîner et
  accompagnement.

### Déclencheurs

Aucun. Ce qui change dans Mealie (un repas prévu, une liste qui s'allonge) est
un état de l'appareil : une scène démarre sur un changement de
`À acheter : Courses` ou de `Dîner aujourd'hui` avec le déclencheur habituel
« changement d'état d'un appareil ».

### Idées de scènes

- **« Le lait est fini »** : un bouton (ou un assistant vocal) lance **Ajouter à
  la liste de courses** avec `Lait`.
- **Le menu du matin** : chaque jour à 7 h 30, **Lire les repas d'un jour**
  (aujourd'hui), puis envoyer `Midi : {{0.0.lunch}}, soir : {{0.0.dinner}}`
  sur Telegram.
- **En route pour les courses** : quand quelqu'un quitte le travail, **Lire une
  liste de courses**, puis envoyer ses articles s'il y en a.
- **Pas encore de dîner prévu** : à 17 h, si `Dîner aujourd'hui` vaut « Rien de
  prévu », **Ajouter une recette au planning des repas** sans recette (Mealie
  en choisit une), puis l'annoncer.

## Rafraîchissement et usage de l'API de Mealie

L'intégration lit Mealie avec son propre minuteur (Gladys ne l'interroge pas),
à l'intervalle de la configuration, et juste après minuit. Une lecture compte
quatre requêtes : le planning des sept prochains jours, les listes de courses,
les articles à acheter de toutes les listes (une requête), les statistiques ;
« qui suis-je » (version et foyer) est relu une fois par heure. Mealie ne fixe
aucun quota d'API. Une action de scène ou un widget relit Mealie quand la
dernière lecture date de plus de 30 secondes ; ce que l'intégration modifie est
relu tout de suite.

Seules les valeurs qui changent sont envoyées à Gladys, et toutes à nouveau
toutes les 6 heures.

## Dépannage

- **« jeton d'API refusé »** : le jeton a été supprimé ou appartient à un autre
  Mealie. Créez-en un nouveau (étape 1).
- **« Mealie ne répond pas »** : vérifiez l'adresse et le port depuis la
  machine de Gladys (`http://<adresse>:9925/api/app/about` doit répondre). La
  pastille de l'appareil indique alors « injoignable », et ses valeurs restent
  les dernières lues.
- **« certificat refusé »** : cochez **Accepter les certificats auto-signés**,
  ou utilisez l'adresse en `http://` sur le réseau local.
- **« Mealie 2.0 ou plus récent est nécessaire »** : mettez Mealie à jour.
- **« aucun Mealie à cette adresse »** : l'adresse répond par une autre page
  web (page de connexion d'un proxy inverse…). Utilisez l'adresse de Mealie
  lui-même.
- **Une liste n'a pas de compteur** : ouvrez l'onglet Découverte et cliquez sur
  **Mettre à jour** sur l'appareil Mealie.
- **Plus de détails** : mettez la variable d'environnement `LOG_LEVEL` à
  `debug` ; les journaux ne contiennent jamais le jeton d'API.

## Limites

- Un seul foyer Mealie par intégration : le foyer de l'utilisateur du jeton.
- L'appareil montre le petit-déjeuner, le déjeuner et le dîner d'aujourd'hui et
  de demain ; les autres repas (accompagnement, goûter, boisson, dessert) et le
  reste de la semaine sont dans le widget et dans **Lire les repas d'un jour**.
- Les articles sont ajoutés en texte libre (Mealie n'en lit pas la quantité),
  et jamais supprimés : les articles cochés restent dans Mealie jusqu'à ce que
  vous les effaciez là-bas.
- Le formulaire **Cocher** liste les 50 premiers articles ; le widget montre
  7 articles et le nombre des autres.
- **Ouvrir Mealie** n'apparaît que pour une adresse en `https://`.
- Pas encore testée sur une vraie installation de Gladys ; testée avec de vrais
  serveurs Mealie 2.0.0 et 3.28.
