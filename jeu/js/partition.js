/* Partition du continent en provinces.

   Plutôt que de dessiner chaque frontière à la main — ce qui donne des
   polygones qui ne se touchent jamais tout à fait — on attribue chaque
   point de terre à la capitale la plus proche. C'est la partition de
   Voronoï. Les frontières sont alors jointives par construction.

   Deux précautions donnent le résultat attendu :
   — la distance est mesurée depuis un point déformé par un bruit
     fractal, ce qui fait serpenter les frontières au lieu de les laisser
     rectilignes ;
   — chaque masse continentale est traitée à part, pour qu'une province
     anglaise ne déborde pas sur la Bretagne.

   De la carte ainsi obtenue on tire tout le reste : le voisinage des
   provinces, leur superficie, et le centre où poser leur étiquette. */

(function (global) {
  'use strict';

  var JEU = global.JEU = global.JEU || {};
  var U = JEU.U;
  var D = JEU.D;
  var Geo = JEU.Geo;

  var L = Geo.LARGEUR, H = Geo.HAUTEUR;
  var AUCUNE = 255;                 /* code de la mer */
  var AMPLEUR = 26;                 /* ampleur de la déformation, en pixels */

  function tracerAnneau(g, poly) {
    g.beginPath();
    poly.forEach(function (pt, i) { i ? g.lineTo(pt[0], pt[1]) : g.moveTo(pt[0], pt[1]); });
    g.closePath();
  }

  /* Carte des masses continentales : 0 = mer, sinon numéro de la masse.

     On ne peint pas chaque terre d'une couleur différente pour les
     distinguer : le canevas lisse les bords, et un pixel de côte
     irlandaise prend alors une teinte intermédiaire que l'on relirait
     comme « continent ». On peint donc toutes les terres de la même
     couleur, puis on identifie les masses par composantes connexes —
     ce qui ne dépend d'aucune valeur de pixel. */
  function rasterTerres() {
    var c = document.createElement('canvas');
    c.width = L; c.height = H;
    var g = c.getContext('2d');

    Geo.TERRES.forEach(function (t) {
      /* Le remplissage est « nonzero » et non « evenodd » : un trait de
         côte tracé à la main se recoupe fatalement — une ria, un fjord,
         un golfe qu'on longe dans les deux sens — et evenodd évide alors
         ces régions au lieu de les remplir. Les mers intérieures sont
         ensuite percées explicitement, ce qui ne dépend d'aucun sens de
         parcours. */
      g.save();
      g.beginPath();
      tracerAnneau(g, t.poly);
      g.fillStyle = '#fff';
      g.fill();

      t.trous.forEach(function (trou) {
        g.globalCompositeOperation = 'destination-out';
        g.beginPath();
        tracerAnneau(g, trou);
        g.fill();
      });
      g.restore();
    });

    var img = g.getImageData(0, 0, L, H).data;
    var n = L * H;
    var estTerre = new Uint8Array(n);
    for (var i = 0; i < n; i++) estTerre[i] = img[i * 4 + 3] > 128 ? 1 : 0;

    /* Étiquetage des composantes connexes, à quatre voisins. */
    var masses = new Uint16Array(n);
    var pile = new Int32Array(n);
    var suivante = 0;

    for (var depart = 0; depart < n; depart++) {
      if (!estTerre[depart] || masses[depart]) continue;
      suivante++;
      var sommet = 0;
      pile[sommet++] = depart;
      masses[depart] = suivante;
      while (sommet > 0) {
        var o = pile[--sommet];
        var x = o % L, y = (o - x) / L;
        if (x > 0     && estTerre[o - 1] && !masses[o - 1]) { masses[o - 1] = suivante; pile[sommet++] = o - 1; }
        if (x < L - 1 && estTerre[o + 1] && !masses[o + 1]) { masses[o + 1] = suivante; pile[sommet++] = o + 1; }
        if (y > 0     && estTerre[o - L] && !masses[o - L]) { masses[o - L] = suivante; pile[sommet++] = o - L; }
        if (y < H - 1 && estTerre[o + L] && !masses[o + L]) { masses[o + L] = suivante; pile[sommet++] = o + L; }
      }
    }

    return { carte: masses, canvas: c, nombre: suivante };
  }

  function construire() {
    var t0 = (global.performance ? performance.now() : Date.now());
    var terres = rasterTerres();
    var masseDe = terres.carte;

    /* Deux champs de bruit indépendants : l'un déplace en x, l'autre en y. */
    var bx = JEU.Deco.bruit2D(1789);
    var by = JEU.Deco.bruit2D(1815);
    var ECH = 0.012;

    /* À quelle masse appartient chaque capitale ? */
    var graines = D.PROVINCES.map(function (p) {
      var x = Math.round(U.borne(p.vx, 0, L - 1));
      var y = Math.round(U.borne(p.vy, 0, H - 1));
      var masse = masseDe[y * L + x];
      if (!masse) {
        /* Une capitale tombée juste à côté du trait de côte : on cherche
           la terre la plus proche plutôt que de l'abandonner à la mer. */
        for (var r = 1; r < 40 && !masse; r++) {
          for (var a = 0; a < 16; a++) {
            var ax = Math.round(U.borne(x + Math.cos(a * 0.3927) * r, 0, L - 1));
            var ay = Math.round(U.borne(y + Math.sin(a * 0.3927) * r, 0, H - 1));
            if (masseDe[ay * L + ax]) { masse = masseDe[ay * L + ax]; x = ax; y = ay; break; }
          }
        }
      }
      return { index: p.index, x: x, y: y, masse: masse };
    });

    /* Les masses sans capitale — Sicile, Sardaigne, Corse, Crète — sont
       rattachées à la province dont la capitale est la plus proche. */
    var masseVersGraines = {};
    graines.forEach(function (s) {
      (masseVersGraines[s.masse] = masseVersGraines[s.masse] || []).push(s);
    });

    function grainesPour(masse, x, y) {
      if (masseVersGraines[masse]) return masseVersGraines[masse];
      /* Rattachement d'une île : la capitale la plus proche à vol d'oiseau. */
      var meilleure = null, dmin = Infinity;
      graines.forEach(function (s) {
        var d = U.dist2(x, y, s.x, s.y);
        if (d < dmin) { dmin = d; meilleure = s; }
      });
      masseVersGraines[masse] = [meilleure];
      return masseVersGraines[masse];
    }

    /* --- Attribution --- */
    var provinceDe = new Uint8Array(L * H);
    provinceDe.fill(AUCUNE);

    for (var y2 = 0; y2 < H; y2++) {
      for (var x2 = 0; x2 < L; x2++) {
        var o = y2 * L + x2;
        var masse = masseDe[o];
        if (!masse) continue;

        var wx = x2 + (bx(x2 * ECH, y2 * ECH) - 0.5) * 2 * AMPLEUR;
        var wy = y2 + (by(x2 * ECH, y2 * ECH) - 0.5) * 2 * AMPLEUR;

        var candidates = grainesPour(masse, x2, y2);
        var meilleur = candidates[0], best = Infinity;
        for (var k = 0; k < candidates.length; k++) {
          var s = candidates[k];
          var dx = wx - s.x, dy = wy - s.y;
          var d = dx * dx + dy * dy;
          if (d < best) { best = d; meilleur = s; }
        }
        provinceDe[o] = meilleur.index;
      }
    }

    /* --- Superficie, centre de masse et voisinage --- */
    var n = D.PROVINCES.length;
    var aire = new Float64Array(n);
    var sx = new Float64Array(n), sy = new Float64Array(n);
    var contacts = {};

    function noter(a, b) {
      if (a === b || a === AUCUNE || b === AUCUNE) return;
      var cle = a < b ? a + ':' + b : b + ':' + a;
      contacts[cle] = (contacts[cle] || 0) + 1;
    }

    for (var y3 = 0; y3 < H; y3++) {
      for (var x3 = 0; x3 < L; x3++) {
        var o3 = y3 * L + x3;
        var p3 = provinceDe[o3];
        if (p3 === AUCUNE) continue;
        aire[p3]++;
        sx[p3] += x3;
        sy[p3] += y3;
        if (x3 + 1 < L) noter(p3, provinceDe[o3 + 1]);
        if (y3 + 1 < H) noter(p3, provinceDe[o3 + L]);
      }
    }

    D.PROVINCES.forEach(function (p, i) {
      p.aire = aire[i];
      if (aire[i] > 0) {
        p.cx = sx[i] / aire[i];
        p.cy = sy[i] / aire[i];
      }
    });

    /* Un contact d'un pixel ou deux n'est pas une frontière : on exige
       une longueur commune franche pour déclarer deux provinces voisines. */
    var SEUIL = 22;
    Object.keys(contacts).forEach(function (cle) {
      if (contacts[cle] < SEUIL) return;
      var parts = cle.split(':');
      var a = D.PROVINCES[+parts[0]], b = D.PROVINCES[+parts[1]];
      if (a.voisins.indexOf(b.id) === -1) a.voisins.push(b.id);
      if (b.voisins.indexOf(a.id) === -1) b.voisins.push(a.id);
    });

    /* --- Calque des frontières, peint une fois --- */
    var bords = document.createElement('canvas');
    bords.width = L; bords.height = H;
    var gb = bords.getContext('2d');
    var imgB = gb.createImageData(L, H);
    for (var y4 = 1; y4 < H; y4++) {
      for (var x4 = 1; x4 < L; x4++) {
        var o4 = y4 * L + x4;
        var ici = provinceDe[o4];
        if (ici === AUCUNE) continue;
        var gauche = provinceDe[o4 - 1], haut = provinceDe[o4 - L];
        if (ici === gauche && ici === haut) continue;
        var q = o4 * 4;
        if (gauche === AUCUNE || haut === AUCUNE) continue;   /* la côte a son propre trait */
        imgB.data[q] = 44; imgB.data[q + 1] = 32; imgB.data[q + 2] = 16;
        imgB.data[q + 3] = 150;
      }
    }
    gb.putImageData(imgB, 0, 0);

    var duree = Math.round((global.performance ? performance.now() : Date.now()) - t0);

    return {
      L: L, H: H,
      AUCUNE: AUCUNE,
      provinceDe: provinceDe,
      masseDe: masseDe,
      masqueTerres: terres.canvas,
      bords: bords,
      duree: duree
    };
  }

  var cache = null;

  JEU.Partition = {
    /* Construite une seule fois : le calcul est lourd et le résultat ne
       dépend que de la géographie, jamais de la partie en cours. */
    obtenir: function () {
      if (!cache) cache = construire();
      return cache;
    },
    AUCUNE: AUCUNE
  };
})(window);
