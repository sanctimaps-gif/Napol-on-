/* Petits outils partagés : maths, aléatoire reproductible, DOM, sauvegarde. */

(function (global) {
  'use strict';

  var JEU = global.JEU = global.JEU || {};

  function borne(v, min, max) { return v < min ? min : (v > max ? max : v); }

  function dist(ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function dist2(ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    return dx * dx + dy * dy;
  }

  /* Plus petit écart angulaire signé entre deux angles, dans ]-π, π]. */
  function ecartAngle(a, b) {
    var d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d <= -Math.PI) d += Math.PI * 2;
    return d;
  }

  /* Générateur reproductible (mulberry32) : une même graine rejoue la
     même campagne, ce qui rend les bugs reproductibles. */
  function generateur(graine) {
    var a = graine >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pointDansPolygone(x, y, poly) {
    var dedans = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) dedans = !dedans;
    }
    return dedans;
  }

  /* Formate un nombre à la française : 12404 → « 12 404 ». */
  function nb(n) {
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  /* --- DOM ---------------------------------------------------------- */

  function el(sel, racine) { return (racine || document).querySelector(sel); }
  function els(sel, racine) {
    return Array.prototype.slice.call((racine || document).querySelectorAll(sel));
  }

  function creer(balise, classe, texte) {
    var n = document.createElement(balise);
    if (classe) n.className = classe;
    if (texte != null) n.textContent = texte;
    return n;
  }

  function vider(noeud) {
    while (noeud.firstChild) noeud.removeChild(noeud.firstChild);
    return noeud;
  }

  /* --- Sauvegarde ---------------------------------------------------- */
  /* Le stockage peut échouer (navigation privée, quota, site bloqué) :
     on n'en dépend jamais pour jouer. */

  var CLE = 'napoleon.campagne.v1';

  function sauver(donnees) {
    try {
      localStorage.setItem(CLE, JSON.stringify(donnees));
      return true;
    } catch (e) {
      return false;
    }
  }

  function charger() {
    try {
      var brut = localStorage.getItem(CLE);
      return brut ? JSON.parse(brut) : null;
    } catch (e) {
      return null;
    }
  }

  function effacer() {
    try { localStorage.removeItem(CLE); } catch (e) { /* sans effet */ }
  }

  JEU.U = {
    borne: borne,
    dist: dist,
    dist2: dist2,
    ecartAngle: ecartAngle,
    generateur: generateur,
    pointDansPolygone: pointDansPolygone,
    nb: nb,
    el: el,
    els: els,
    creer: creer,
    vider: vider,
    sauver: sauver,
    charger: charger,
    effacer: effacer
  };
})(window);
