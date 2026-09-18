# Napoléon — Grande Campagne

Un jeu de stratégie napoléonien qui tourne dans le navigateur, sans rien installer,
accompagné de la page de présentation du dépôt.

- **`jeu/`** — le jeu : campagne au tour par tour sur l'Europe + batailles tactiques
  en temps réel.
- **`index.html`** — page de présentation (bande-annonce, galerie, contenu inclus).

## Le jeu

Deux couches, à la manière du genre.

**La campagne**, au tour par tour. 28 provinces de Lisbonne à Moscou, sept puissances
jouables (France, Grande-Bretagne, Prusse, Autriche, Russie, Espagne, Empire ottoman).
Chaque tour rapporte le revenu des provinces, moins la solde des régiments ; un trésor
à sec dissout des unités. On lève des troupes chez soi, on fait marcher une armée sur
une province voisine, et l'on tient 20 des 28 provinces pour gagner.

**La bataille**, en temps réel. Elle s'ouvre en pause : on dispose ses lignes, puis on
engage. Sept types d'unités — ligne, légère, grenadiers, Garde impériale (réservée à la
France), chasseurs à cheval, cuirassiers, artillerie à pied.

Ce qui décide d'une bataille, c'est le **moral**, pas le décompte des morts :

- une unité prise de flanc ou de dos s'effondre bien plus vite ;
- l'artillerie brise les nerfs bien au-delà de ce qu'elle tue ;
- la cavalerie ne vaut que lancée, et sa charge ne dure que quelques secondes ;
- une unité qui rompt fuit, mais peut se rallier si on l'éloigne de l'ennemi ;
- une armée qui a perdu les quatre cinquièmes de son monde décroche.

Toutes les commandes sont tactiles : on touche un régiment pour le choisir, le sol pour
l'y envoyer, une unité ennemie pour l'attaquer. Plusieurs régiments choisis se déploient
côte à côte sur une même ligne. On glisse pour déplacer la vue, on pince pour zoomer.

## Les graphismes

Tout est peint au canevas, sans une seule image importée.

- **Les hommes sont des figurines**, pas des points : shako, habit à la couleur de la
  faction, buffleterie, mousquet ; cavalier et monture ; servants et pièces d'artillerie
  avec leurs roues à rayons. Le bloc d'un régiment est peint dans son propre canevas et
  n'est refait que lorsque les rangs changent — sans quoi mille figurines redessinées
  soixante fois par seconde mettraient le jeu à genoux.
- **Le champ de bataille** a son relief (calculé en bruit fractal puis adouci), ses
  parcelles cultivées, ses haies, son ruisseau et ses bosquets. Les salves allument des
  lueurs de bouche sur toute la ligne de feu, et la poudre dérive au vent.
- **La carte de campagne** a la silhouette de l'Europe, pas celle d'un assemblage de
  polygones : le trait de côte est donné en longitude et latitude réelles, sur quelque
  deux cent trente points, mers intérieures percées. Les grands fleuves suivent leur
  cours — Rhin, Danube, Loire, Vistule, Dniepr — et les massifs sont à leur place :
  Alpes, Pyrénées, Carpates, Apennins, Caucase. Par-dessus : hauts-fonds, relief ombré,
  forêts. La teinte de faction est une glaçure, pas un aplat — le relief reste visible
  dessous.
- **Les provinces ne sont pas dessinées à la main.** Chaque province a une capitale, à
  ses vraies coordonnées ; le territoire lui est attribué par la partition de Voronoï
  du continent, déformée par un bruit fractal pour que les frontières serpentent au
  lieu d'être des segments de droite. Les frontières sont donc jointives par
  construction, et le voisinage des provinces — qui commande tout le jeu de campagne —
  se déduit de la carte au lieu d'être déclaré.
- **Les noms de provinces** sont des plaques bordées d'or, bleues chez nous, rouges chez
  l'adversaire, ambrées ailleurs. Elles s'effacent d'elles-mêmes quand elles se
  recouvriraient, en servant d'abord la province ouverte et les capitales.
- **L'interface** reprend le même vocabulaire : portrait du général dans un ovale doré,
  jauge d'armée verte et rouge, portraits d'unité ovales avec leur plaque d'effectif,
  minicarte encadrée où l'on peut toucher pour se déplacer.

## Jouer

```sh
python3 -m http.server 8000
```

Puis <http://localhost:8000/jeu/>. Le jeu est écrit en scripts classiques, sans module
ES : un double-clic sur `jeu/index.html` fonctionne donc aussi, sans serveur.

La partie est enregistrée dans le navigateur (`localStorage`) à chaque action. Le
stockage peut échouer — navigation privée, quota, site bloqué — et le jeu continue de
fonctionner sans, seule la reprise est perdue.

## Structure

```
index.html               page de présentation
assets/                  ses styles, sa galerie, sa bande-annonce

jeu/index.html           le jeu
jeu/css/jeu.css          interface, pensée pour le pouce
jeu/js/geographie.js     côtes, fleuves et massifs en longitude/latitude
jeu/js/donnees.js        factions, provinces, types d'unités
jeu/js/util.js           maths, aléatoire reproductible, DOM, sauvegarde
jeu/js/deco.js           ornements, plaques, figurines, bruit fractal
jeu/js/partition.js      découpage du continent, frontières et voisinage
jeu/js/audio.js          sons synthétisés par WebAudio (aucun fichier)
jeu/js/carte.js          rendu de la carte de campagne
jeu/js/bataille.js       moteur de bataille temps réel
jeu/js/campagne.js       économie, mouvements, conquêtes, IA de campagne
jeu/js/main.js           écrans et enchaînement des tours
```

Aucune dépendance, aucune étape de construction. Le son est synthétisé à la volée et
coupé par défaut ; les cartes et le champ de bataille sont dessinés au canevas.

`JEU.debug` expose `etat()`, `carte()` et `bataille()` pour inspecter une partie depuis
la console ou un test de bout en bout ; rien dans le jeu n'en dépend.

## La page de présentation

Page statique en français : héros, bande-annonce, campagnes, galerie de neuf captures et
contenu inclus. Lien d'évitement, visionneuse pilotable au clavier (`←`, `→`, `Échap`),
focus renvoyé sur la vignette d'origine, textes alternatifs descriptifs,
`prefers-reduced-motion` respecté.

Les captures sont des enregistrements d'écran sur iPhone, rognés (bordures, barre d'état,
cartes voisines du carrousel), remis à l'horizontale et réencodés en JPEG progressif de
1600 px de large. La bande-annonce passe de HEVC 1180×2556 (29 Mo) à H.264 1280×592
(3,8 Mo), recadrée au cadre utile.

## Mentions

Jeu original, inspiré du genre. La page de présentation reprend les visuels et le texte
de présentation du jeu commercial : elle n'est pas officielle. Total War et NAPOLEON sont
des marques de leurs détenteurs respectifs.
