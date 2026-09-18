/* Ornements et figurines.

   Tout le vocabulaire visuel du jeu est ici : les dorures, les plaques de
   nom, les cadres ovales, et les petites figurines de soldats. Les motifs
   coûteux sont dessinés une fois dans des canevas hors écran puis réutilisés. */

(function (global) {
  'use strict';

  var JEU = global.JEU = global.JEU || {};
  var U = JEU.U;

  var OR_SOMBRE = '#7a5f1c';
  var OR = '#c8a349';
  var OR_VIF = '#f0d585';
  var NAVY = '#0e1e3a';
  var NAVY_HAUT = '#1d3358';

  /* ------------------------------------------------------------------ */
  /* Bruit de valeur, pour le relief et les textures                     */
  /* ------------------------------------------------------------------ */

  function bruit2D(graine) {
    var r = U.generateur(graine);
    var N = 256;
    var table = new Float32Array(N * N);
    for (var i = 0; i < N * N; i++) table[i] = r();

    function val(ix, iy) {
      return table[((iy & (N - 1)) * N) + (ix & (N - 1))];
    }
    /* Interpolation lisse : sans elle, le relief serait en damier. */
    function lisse(t) { return t * t * (3 - 2 * t); }

    return function (x, y) {
      var x0 = Math.floor(x), y0 = Math.floor(y);
      var fx = lisse(x - x0), fy = lisse(y - y0);
      var a = val(x0, y0), b = val(x0 + 1, y0);
      var c = val(x0, y0 + 1), d = val(x0 + 1, y0 + 1);
      return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
    };
  }

  function fbm(bruit, x, y, octaves) {
    var somme = 0, amplitude = 0.5, total = 0;
    for (var i = 0; i < octaves; i++) {
      somme += bruit(x, y) * amplitude;
      total += amplitude;
      x *= 2; y *= 2;
      amplitude *= 0.5;
    }
    return somme / total;
  }

  /* ------------------------------------------------------------------ */
  /* Dorures                                                             */
  /* ------------------------------------------------------------------ */

  /* Un filet d'or n'est jamais uni : il passe du bronze au clair. */
  function degradeOr(g, x0, y0, x1, y1) {
    var d = g.createLinearGradient(x0, y0, x1, y1);
    d.addColorStop(0, OR_SOMBRE);
    d.addColorStop(0.28, OR_VIF);
    d.addColorStop(0.55, OR);
    d.addColorStop(0.8, OR_VIF);
    d.addColorStop(1, OR_SOMBRE);
    return d;
  }

  function cheminArrondi(g, x, y, l, h, r) {
    r = Math.min(r, l / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + l - r, y);
    g.quadraticCurveTo(x + l, y, x + l, y + r);
    g.lineTo(x + l, y + h - r);
    g.quadraticCurveTo(x + l, y + h, x + l - r, y + h);
    g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r);
    g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }

  /* Cadre doré autour d'un panneau : double filet, comme sur les
     bandeaux du jeu. */
  function cadre(g, x, y, l, h, r, epaisseur) {
    r = r == null ? 4 : r;
    epaisseur = epaisseur || 2;
    g.save();
    cheminArrondi(g, x, y, l, h, r);
    g.strokeStyle = degradeOr(g, x, y, x, y + h);
    g.lineWidth = epaisseur;
    g.stroke();
    cheminArrondi(g, x + epaisseur, y + epaisseur, l - epaisseur * 2, h - epaisseur * 2, Math.max(0, r - 1));
    g.strokeStyle = 'rgba(12,20,36,.55)';
    g.lineWidth = 1;
    g.stroke();
    g.restore();
  }

  /* ------------------------------------------------------------------ */
  /* Plaque de nom (« Paris (France) »)                                  */
  /* ------------------------------------------------------------------ */

  var TEINTES = {
    nous:   { fond: '#12254a', haut: '#22407a' },   /* nos provinces */
    ennemi: { fond: '#5d1a1c', haut: '#8c2b2b' },   /* puissance hostile */
    autre:  { fond: '#7a5a12', haut: '#a8822a' }    /* le reste du monde */
  };

  /* Petit fronton à colonnes : le pictogramme de ville du jeu. */
  function glypheVille(g, x, y, t) {
    g.save();
    g.translate(x, y);
    g.fillStyle = OR_VIF;
    g.strokeStyle = 'rgba(40,28,6,.8)';
    g.lineWidth = t * 0.07;

    g.beginPath();                       /* fronton triangulaire */
    g.moveTo(-t * 0.5, -t * 0.12);
    g.lineTo(0, -t * 0.5);
    g.lineTo(t * 0.5, -t * 0.12);
    g.closePath();
    g.fill(); g.stroke();

    for (var i = -1; i <= 1; i++) {      /* colonnes */
      g.fillRect(i * t * 0.28 - t * 0.06, -t * 0.08, t * 0.12, t * 0.42);
    }
    g.fillRect(-t * 0.5, t * 0.34, t, t * 0.14);   /* stylobate */
    g.strokeRect(-t * 0.5, t * 0.34, t, t * 0.14);
    g.restore();
  }

  /* Dessine la plaque centrée en (x, y). Renvoie sa largeur. */
  function plaque(g, x, y, texte, options) {
    options = options || {};
    var teinte = TEINTES[options.teinte] || TEINTES.autre;
    var taille = options.taille || 12;
    var avecVille = options.ville !== false;

    g.save();
    g.font = '500 ' + taille + 'px Cinzel, Georgia, serif';
    var largeurTexte = g.measureText(texte).width;
    var padX = taille * 0.62;
    var iconeL = avecVille ? taille * 1.25 : 0;
    var l = largeurTexte + padX * 2 + iconeL;
    var h = taille * 1.72;
    var gx = x - l / 2, gy = y - h / 2;

    /* Ombre portée : la plaque doit décoller du terrain. */
    g.shadowColor = 'rgba(0,0,0,.5)';
    g.shadowBlur = taille * 0.5;
    g.shadowOffsetY = taille * 0.12;

    var fond = g.createLinearGradient(0, gy, 0, gy + h);
    fond.addColorStop(0, teinte.haut);
    fond.addColorStop(1, teinte.fond);
    cheminArrondi(g, gx, gy, l, h, h * 0.28);
    g.fillStyle = fond;
    g.fill();
    g.shadowColor = 'transparent';
    g.shadowBlur = 0;
    g.shadowOffsetY = 0;

    g.strokeStyle = degradeOr(g, gx, gy, gx + l, gy + h);
    g.lineWidth = Math.max(1, taille * 0.13);
    g.stroke();

    if (avecVille) glypheVille(g, gx + padX + taille * 0.34, y, taille * 0.94);

    g.fillStyle = '#f4ecd8';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(texte, gx + padX + iconeL, y + taille * 0.06);
    g.restore();
    return l;
  }

  /* ------------------------------------------------------------------ */
  /* Figurines                                                           */
  /* ------------------------------------------------------------------ */

  var cacheSoldats = {};

  /* Un fantassin vu de trois quarts. À la taille où il est réellement
     affiché — quatre ou cinq pixels — c'est la masse de l'habit qui
     porte la couleur de la faction : le blanc du pantalon et les
     buffleteries restent minoritaires, sinon toute la ligne blanchit. */
  function dessinerFantassin(g, S, couleur, clair) {
    g.save();
    g.scale(S, S);

    g.fillStyle = 'rgba(18,22,14,.38)';           /* ombre au sol */
    g.beginPath();
    g.ellipse(2.6, 6.5, 2.2, 0.75, 0, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = '#c3bca8';                       /* jambes, en retrait */
    g.fillRect(1.6, 4.9, 1, 1.6);
    g.fillRect(2.8, 4.9, 1, 1.6);

    g.fillStyle = couleur;                         /* habit, bien large */
    g.fillRect(1.05, 1.7, 3.1, 3.3);
    g.fillStyle = clair;                           /* côté éclairé */
    g.fillRect(1.05, 1.7, 0.85, 3.3);
    g.fillStyle = 'rgba(0,0,0,.22)';               /* côté à l'ombre */
    g.fillRect(3.6, 1.7, 0.55, 3.3);

    g.strokeStyle = 'rgba(248,246,238,.55)';       /* buffleterie, une seule */
    g.lineWidth = 0.3;
    g.beginPath();
    g.moveTo(1.3, 2.2); g.lineTo(3.6, 4.4);
    g.stroke();

    g.strokeStyle = '#332818';                     /* mousquet */
    g.lineWidth = 0.32;
    g.beginPath();
    g.moveTo(0.6, 3.5); g.lineTo(4.5, 1.4);
    g.stroke();

    g.fillStyle = '#d8a87e';                       /* visage */
    g.fillRect(1.95, 1.05, 1.3, 0.85);
    g.fillStyle = '#15161a';                       /* shako */
    g.fillRect(1.75, -0.25, 1.75, 1.4);
    g.fillStyle = OR;                              /* plaque du shako */
    g.fillRect(2.3, 0.15, 0.6, 0.35);

    g.restore();
  }

  /* Un cavalier : cheval bai, buste à la couleur, sabre levé. */
  function dessinerCavalier(g, S, couleur, clair) {
    g.save();
    g.scale(S, S);

    g.fillStyle = 'rgba(18,22,14,.34)';
    g.beginPath();
    g.ellipse(3.4, 7.6, 3, 1.1, 0, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = '#5a3a24';                       /* cheval */
    g.beginPath();
    g.ellipse(3.4, 5.6, 2.7, 1.6, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#6f4a2e';
    g.beginPath();
    g.ellipse(2.6, 5.1, 2, 1.1, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#42291a';                       /* jambes */
    g.fillRect(1.4, 6.3, 0.7, 1.5);
    g.fillRect(5, 6.3, 0.7, 1.5);
    g.fillStyle = '#2f1d12';                       /* encolure */
    g.fillRect(5.4, 3.6, 1.1, 2.3);
    g.fillRect(5.9, 3.1, 1.4, 0.9);

    g.fillStyle = couleur;                         /* cavalier */
    g.fillRect(2.5, 2.4, 2.4, 2.8);
    g.fillStyle = clair;
    g.fillRect(2.5, 2.4, 0.6, 2.8);

    g.fillStyle = '#e0b48c';
    g.fillRect(3, 1.5, 1.4, 1);
    g.fillStyle = '#16171c';
    g.fillRect(2.8, 0.1, 1.8, 1.5);

    g.strokeStyle = '#cfd4dc';                     /* sabre */
    g.lineWidth = 0.32;
    g.beginPath();
    g.moveTo(4.7, 2.6); g.lineTo(6.4, 0.2);
    g.stroke();

    g.restore();
  }

  /* Un servant d'artillerie : même habit, sans mousquet. */
  function dessinerServant(g, S, couleur, clair) {
    g.save();
    g.scale(S, S);
    g.fillStyle = 'rgba(18,22,14,.34)';
    g.beginPath();
    g.ellipse(2.6, 6.4, 2, 0.8, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#d9d2c0';
    g.fillRect(1.6, 4.2, 1, 2.2);
    g.fillRect(3, 4.2, 1, 2.2);
    g.fillStyle = couleur;
    g.fillRect(1.4, 1.9, 2.8, 2.6);
    g.fillStyle = clair;
    g.fillRect(1.4, 1.9, 0.7, 2.6);
    g.fillStyle = '#e0b48c';
    g.fillRect(2, 1.1, 1.5, 1);
    g.fillStyle = '#16171c';
    g.fillRect(1.8, -0.1, 1.9, 1.3);
    g.restore();
  }

  var TAILLES = {
    inf: [5.2, 7],
    cav: [7.6, 8.6],
    art: [5.2, 7]
  };

  /* Renvoie (et met en cache) la figurine d'un type d'unité. */
  function spriteSoldat(cat, couleur, clair) {
    var cle = cat + '|' + couleur;
    if (cacheSoldats[cle]) return cacheSoldats[cle];

    var S = 5;                                   /* sur-échantillonnage */
    var dim = TAILLES[cat] || TAILLES.inf;
    var c = document.createElement('canvas');
    c.width = Math.ceil(dim[0] * S);
    c.height = Math.ceil(dim[1] * S);
    var g = c.getContext('2d');

    if (cat === 'cav') dessinerCavalier(g, S, couleur, clair);
    else if (cat === 'art') dessinerServant(g, S, couleur, clair);
    else dessinerFantassin(g, S, couleur, clair);

    c.mondeL = dim[0];
    c.mondeH = dim[1];
    cacheSoldats[cle] = c;
    return c;
  }

  /* ------------------------------------------------------------------ */
  /* Drapeaux et enseignes                                               */
  /* ------------------------------------------------------------------ */

  /* Drapeau régimentaire planté dans le rang, agité par le temps. */
  function drapeau(g, x, y, taille, couleur, clair, phase) {
    g.save();
    g.translate(x, y);

    g.strokeStyle = '#4a3a22';                   /* hampe */
    g.lineWidth = taille * 0.09;
    g.beginPath();
    g.moveTo(0, taille * 0.5);
    g.lineTo(0, -taille);
    g.stroke();

    g.fillStyle = OR_VIF;                        /* aigle au sommet */
    g.beginPath();
    g.arc(0, -taille * 1.08, taille * 0.11, 0, Math.PI * 2);
    g.fill();

    /* L'étoffe ondule : deux lobes décalés dans le temps. */
    var onde = Math.sin(phase) * taille * 0.14;
    g.beginPath();
    g.moveTo(0, -taille);
    g.quadraticCurveTo(taille * 0.35, -taille + onde, taille * 0.72, -taille * 0.86 + onde);
    g.lineTo(taille * 0.72, -taille * 0.36 + onde);
    g.quadraticCurveTo(taille * 0.35, -taille * 0.5 - onde, 0, -taille * 0.42);
    g.closePath();
    g.fillStyle = couleur;
    g.fill();
    g.strokeStyle = 'rgba(20,16,8,.55)';
    g.lineWidth = taille * 0.05;
    g.stroke();

    g.beginPath();                               /* bande claire */
    g.moveTo(0, -taille * 0.78);
    g.quadraticCurveTo(taille * 0.35, -taille * 0.72 + onde, taille * 0.72, -taille * 0.62 + onde);
    g.lineTo(taille * 0.72, -taille * 0.48 + onde);
    g.quadraticCurveTo(taille * 0.35, -taille * 0.56 - onde, 0, -taille * 0.62);
    g.closePath();
    g.fillStyle = clair;
    g.globalAlpha = 0.85;
    g.fill();
    g.restore();
  }

  /* ------------------------------------------------------------------ */
  /* Portraits d'unité pour le bandeau                                   */
  /* ------------------------------------------------------------------ */

  /* Une vignette ovale cerclée d'or, avec la figurine au centre. */
  function portraitUnite(cat, couleur, clair, l, h) {
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var c = document.createElement('canvas');
    c.width = Math.round(l * dpr);
    c.height = Math.round(h * dpr);
    var g = c.getContext('2d');
    g.scale(dpr, dpr);

    var rx = l / 2 - 1.5, ry = h / 2 - 1.5;

    g.save();
    g.beginPath();
    g.ellipse(l / 2, h / 2, rx, ry, 0, 0, Math.PI * 2);
    g.clip();

    var ciel = g.createLinearGradient(0, 0, 0, h);   /* fond de vignette */
    ciel.addColorStop(0, '#c9d2dc');
    ciel.addColorStop(0.62, '#8d9aa6');
    ciel.addColorStop(1, '#5f6a52');
    g.fillStyle = ciel;
    g.fillRect(0, 0, l, h);

    /* La figurine entière tient dans l'ovale, posée sur le tiers bas :
       cadrée plus serré, on ne verrait qu'un shako et un pan d'habit. */
    var sprite = spriteSoldat(cat, couleur, clair);
    var ech = (h * 0.64) / sprite.mondeH;
    g.drawImage(sprite,
      l / 2 - (sprite.mondeL * ech) / 2,
      h * 0.86 - sprite.mondeH * ech,
      sprite.mondeL * ech, sprite.mondeH * ech);
    g.restore();

    g.beginPath();
    g.ellipse(l / 2, h / 2, rx, ry, 0, 0, Math.PI * 2);
    g.strokeStyle = degradeOr(g, 0, 0, l, h);
    g.lineWidth = 2.2;
    g.stroke();

    return c;
  }

  JEU.Deco = {
    OR: OR,
    OR_VIF: OR_VIF,
    OR_SOMBRE: OR_SOMBRE,
    NAVY: NAVY,
    NAVY_HAUT: NAVY_HAUT,
    bruit2D: bruit2D,
    fbm: fbm,
    degradeOr: degradeOr,
    cheminArrondi: cheminArrondi,
    cadre: cadre,
    plaque: plaque,
    glypheVille: glypheVille,
    spriteSoldat: spriteSoldat,
    drapeau: drapeau,
    portraitUnite: portraitUnite
  };
})(window);
