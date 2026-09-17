# Total War: NAPOLEON — page de présentation mobile

Page web statique en français présentant la version mobile de *Total War: NAPOLEON* :
bande-annonce, campagnes, galerie de captures et contenu inclus.

## Aperçu

- **Statique** — aucun build, aucune dépendance. Ouvrez `index.html`.
- **Mobile d'abord** — galerie à défilement par accroche sur téléphone, grille sur
  écrans larges.
- **Accessible** — lien d'évitement, navigation clavier dans la visionneuse
  (`←`, `→`, `Échap`), focus renvoyé sur la vignette d'origine, textes alternatifs
  descriptifs, `prefers-reduced-motion` respecté.

## Structure

```
index.html
assets/
  css/styles.css       feuille de style unique
  js/main.js           visionneuse de la galerie (JS natif, sans bibliothèque)
  img/
    trailer-poster.jpg image d'affiche de la bande-annonce
    screens/*.jpg      9 captures, détourées et remises à l'horizontale
  video/trailer.mp4    bande-annonce, 15 s, 1280×592, H.264 + AAC
```

## Consulter la page

```sh
python3 -m http.server 8000
```

Puis ouvrez <http://localhost:8000>. Un simple double-clic sur `index.html`
fonctionne aussi ; passer par un serveur évite seulement les restrictions
`file://` de certains navigateurs sur la lecture vidéo.

## Origine des médias

Les captures sont des enregistrements d'écran de la fiche du jeu sur iPhone. Elles
ont été rognées (bordures noires, barre d'état, cartes voisines du carrousel) puis
pivotées à l'horizontale, et réencodées en JPEG progressif d'une largeur de 1600 px.
La bande-annonce a été rognée au cadre utile puis réencodée de HEVC 1180×2556
(29 Mo) en H.264 1280×592 (3,8 Mo) pour la lecture web.

## Mentions

Page de présentation non officielle, réalisée à partir des visuels et du texte de
présentation du jeu. Total War et NAPOLEON sont des marques de leurs détenteurs
respectifs.
