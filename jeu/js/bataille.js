/* Moteur de bataille en temps réel.

   Chaque unité est un bloc d'hommes qui marche, tire, se bat au contact et
   finit par rompre quand son moral cède. Le joueur donne des ordres au
   doigt : on touche une unité pour la sélectionner, le sol pour l'y
   envoyer, une unité ennemie pour l'attaquer. */

(function (global) {
  'use strict';

  var JEU = global.JEU = global.JEU || {};
  var U = JEU.U;
  var D = JEU.D;

  var Deco = JEU.Deco;

  var MONDE_L = 1150;          // largeur du champ de bataille
  var MONDE_H = 780;           // profondeur
  /* Distance entre deux hommes : serrée d'épaule à épaule, plus lâche
     d'un rang à l'autre pour que les rangs arrière restent visibles
     derrière le premier. */
  var ECARTS = {
    inf: { x: 4.8, y: 6.2 },
    cav: { x: 7.2, y: 8.4 },
    art: { x: 6.6, y: 7.5 }
  };
  var ESPACEMENT = ECARTS.inf.x; // référence pour le placement des unités
  var MARGE_CAM = 90;

  /* ------------------------------------------------------------------ */
  /* Unité                                                               */
  /* ------------------------------------------------------------------ */

  function Unite(id, camp, type, hommes, faction) {
    var def = D.UNITES[type];
    this.id = id;
    this.camp = camp;                  // 'joueur' | 'ennemi'
    this.faction = faction;
    this.type = type;
    this.def = def;
    this.nom = def.nom;

    this.hommesMax = def.hommes;
    this.hommes = Math.min(hommes || def.hommes, def.hommes);
    this.moralMax = def.bravoure;
    this.moral = def.bravoure;

    this.x = 0;
    this.y = 0;
    this.angle = 0;                    // 0 = vers la droite
    this.ordre = null;                 // { x, y, angle }
    this.cible = null;                 // id d'unité
    this.etat = 'formé';               // 'formé' | 'déroute' | 'mort'
    this.rechargement = def.cadence ? Math.random() * def.cadence : 0;
    this.contactDepuis = -1;           // ms écoulées au contact (charge)
    this.calmeDepuis = 0;
    this.selectionne = false;
    this.tenir = false;                // ordre « tenir la position »

    /* Géométrie de la formation. */
    this.ecart = ECARTS[def.cat] || ECARTS.inf;
    this.rangs = def.rangs;
    this.colonnes = Math.ceil(this.hommesMax / this.rangs);
    this.largeur = this.colonnes * this.ecart.x;
    this.profondeur = this.rangs * this.ecart.y;
    this.rayon = Math.max(this.largeur, this.profondeur) / 2;

    /* Position locale de chaque homme, puis la liste de ceux qui tiennent
       encore debout — on retire au hasard pour que la ligne se troue. */
    this.places = [];
    for (var i = 0; i < this.hommesMax; i++) {
      var col = i % this.colonnes;
      var rang = Math.floor(i / this.colonnes);
      this.places.push([
        (col - (this.colonnes - 1) / 2) * this.ecart.x,
        (rang - (this.rangs - 1) / 2) * this.ecart.y
      ]);
    }
    this.vivants = [];
    for (var j = 0; j < this.hommes; j++) this.vivants.push(j);

    /* Le corps à corps inflige des fractions d'homme à chaque image :
       on les accumule ici et l'on ne retire que des hommes entiers. */
    this.blessures = 0;
  }

  Unite.prototype.estVivante = function () {
    return this.etat !== 'mort' && this.hommes > 0;
  };

  Unite.prototype.combattante = function () {
    return this.estVivante() && this.etat !== 'déroute';
  };

  Unite.prototype.subir = function (pertes, moralSup) {
    if (!this.estVivante() || pertes <= 0) return 0;

    /* Le moral suit les dégâts réels, même fractionnaires : la barre
       descend régulièrement au lieu de sauter d'un homme à l'autre. */
    this.moral -= (pertes / this.hommesMax) * 140 + (moralSup || 0);
    this.calmeDepuis = 0;

    this.blessures += pertes;
    var tombes = Math.min(Math.floor(this.blessures), this.hommes);
    if (tombes <= 0) return 0;
    this.blessures -= tombes;
    this.hommes -= tombes;

    for (var i = 0; i < tombes && this.vivants.length; i++) {
      this.vivants.splice(Math.floor(Math.random() * this.vivants.length), 1);
    }

    if (this.hommes <= 0) { this.hommes = 0; this.etat = 'mort'; }
    return tombes;
  };

  /* ------------------------------------------------------------------ */
  /* Partie                                                              */
  /* ------------------------------------------------------------------ */

  function Bataille(config) {
    this.toile = config.toile;
    this.ctx = this.toile.getContext('2d');
    this.surFin = config.surFin || function () {};
    this.surEtat = config.surEtat || function () {};

    this.factions = { joueur: config.factionJoueur, ennemi: config.factionEnnemi };
    this.alea = U.generateur(config.graine || 1);

    this.unites = [];
    this.fumees = [];
    this.flashes = [];
    this.messages = [];
    /* Un vent constant : la fumée traîne dans un sens, ce qui donne au
       champ de bataille sa lisibilité et son atmosphère. */
    this.vent = { x: 16, y: -9 };
    this.vitesse = 0;                  // départ en pause : on prépare
    this.terminee = false;
    this.temps = 0;
    this.horloge = 0;
    this.derniereIA = 0;
    this.boucle = null;

    this.cam = { x: MONDE_L / 2, y: MONDE_H / 2, zoom: 1 };
    this.deployer(config.forces);

    this.depart = { joueur: this.hommesDe('joueur'), ennemi: this.hommesDe('ennemi') };
    this.dernierTotal = this.depart.joueur + this.depart.ennemi;
    this.dernierSang = 0;

    this.terrain = this.dessinerTerrain();
    this.brancherEntrees();
    this.redimensionner();
  }

  /* --- Mise en place ------------------------------------------------- */

  Bataille.prototype.deployer = function (forces) {
    var self = this, id = 0;

    function ligneDeBataille(liste, camp, y, angle) {
      /* L'artillerie derrière, la cavalerie aux ailes, l'infanterie au
         centre — un ordre de bataille classique. */
      var art = liste.filter(function (u) { return D.UNITES[u.type].cat === 'art'; });
      var cav = liste.filter(function (u) { return D.UNITES[u.type].cat === 'cav'; });
      var inf = liste.filter(function (u) { return D.UNITES[u.type].cat === 'inf'; });

      var gauche = cav.slice(0, Math.ceil(cav.length / 2));
      var droite = cav.slice(Math.ceil(cav.length / 2));
      var centre = gauche.concat(inf, droite);

      function largeurDe(u) {
        var def = D.UNITES[u.type];
        return Math.ceil(def.hommes / def.rangs) * (ECARTS[def.cat] || ECARTS.inf).x;
      }

      /* Le front disponible est limité : au-delà, on forme une seconde
         ligne derrière la première plutôt que d'empiler les bataillons. */
      var frontMax = MONDE_L - 120;
      var total = 0;
      centre.forEach(function (u) { total += largeurDe(u) + 26; });
      var lignes = Math.min(2, Math.max(1, Math.ceil(total / frontMax)));
      var parLigne = Math.ceil(centre.length / lignes);
      var recul = camp === 'joueur' ? 1 : -1;

      for (var n = 0; n < lignes; n++) {
        var lot = centre.slice(n * parLigne, (n + 1) * parLigne);
        if (!lot.length) continue;
        var largeurLot = 0;
        lot.forEach(function (u) { largeurLot += largeurDe(u) + 26; });
        var x = MONDE_L / 2 - largeurLot / 2;
        var yLigne = y + n * 46 * recul;

        lot.forEach(function (u) {
          var unite = new Unite(++id, camp, u.type, u.hommes, self.factions[camp]);
          x += unite.largeur / 2;
          unite.x = U.borne(x, 60, MONDE_L - 60);
          unite.y = yLigne;
          unite.angle = angle;
          self.unites.push(unite);
          x += unite.largeur / 2 + 26;
        });
      }

      /* Les canons se placent en retrait, répartis sur la largeur. */
      art.forEach(function (u, i) {
        var unite = new Unite(++id, camp, u.type, u.hommes, self.factions[camp]);
        unite.x = U.borne(MONDE_L / 2 + (i - (art.length - 1) / 2) * 170, 60, MONDE_L - 60);
        unite.y = y + (lignes > 1 ? 105 : 78) * recul;
        unite.angle = angle;
        self.unites.push(unite);
      });
    }

    ligneDeBataille(forces.joueur, 'joueur', MONDE_H - 190, -Math.PI / 2);
    ligneDeBataille(forces.ennemi, 'ennemi', 190, Math.PI / 2);
  };

  /* Terrain peint une fois dans un canevas hors écran : relief ombré,
     cultures, haies, ruisseau et bosquets. */
  Bataille.prototype.dessinerTerrain = function () {
    var ech = 1;
    var c = document.createElement('canvas');
    c.width = MONDE_L * ech;
    c.height = MONDE_H * ech;
    var g = c.getContext('2d');
    var r = U.generateur(7331);
    var bruit = Deco.bruit2D(9173);
    var L = c.width, H = c.height;

    var fond = g.createLinearGradient(0, 0, 0, H);
    fond.addColorStop(0, '#59663f');
    fond.addColorStop(0.45, '#6b7749');
    fond.addColorStop(1, '#5b6740');
    g.fillStyle = fond;
    g.fillRect(0, 0, L, H);

    /* Grandes plages de couleur : sans elles le pré reste une nappe
       uniforme dès qu'on prend du recul. */
    var teinteLarge = Deco.bruit2D(5521);
    for (var gy = 0; gy < H; gy += 24) {
      for (var gx = 0; gx < L; gx += 24) {
        var t0 = Deco.fbm(teinteLarge, gx * 0.006, gy * 0.006, 3);
        g.fillStyle = t0 > 0.5
          ? 'rgba(150,160,92,' + ((t0 - 0.5) * 0.55) + ')'
          : 'rgba(58,72,38,' + ((0.5 - t0) * 0.55) + ')';
        g.fillRect(gx - 12, gy - 12, 48, 48);
      }
    }

    /* --- Relief : on éclaire les pentes tournées vers le nord-ouest,
       comme une carte d'état-major. Le calcul se fait sur une petite
       grille que l'on agrandit ensuite : l'interpolation du navigateur
       adoucit les pentes, là où un rendu pixel par pixel donnerait un
       damier. --- */
    var GR = 2;                                  /* un point pour deux pixels */
    var rel = document.createElement('canvas');
    rel.width = Math.ceil(L / GR);
    rel.height = Math.ceil(H / GR);
    var gr = rel.getContext('2d');
    var img = gr.createImageData(rel.width, rel.height);
    var ech2 = 0.055;

    for (var ry = 0; ry < rel.height; ry++) {
      for (var rx = 0; rx < rel.width; rx++) {
        var h0 = Deco.fbm(bruit, rx * ech2, ry * ech2, 4);
        var hx = Deco.fbm(bruit, (rx + 1) * ech2, ry * ech2, 4);
        var hy = Deco.fbm(bruit, rx * ech2, (ry + 1) * ech2, 4);
        var pente = ((h0 - hx) + (h0 - hy)) * 6;
        var o = (ry * rel.width + rx) * 4;
        if (pente > 0) {
          img.data[o] = 234; img.data[o + 1] = 242; img.data[o + 2] = 206;
          img.data[o + 3] = Math.min(76, pente * 170);
        } else {
          img.data[o] = 24; img.data[o + 1] = 32; img.data[o + 2] = 16;
          img.data[o + 3] = Math.min(84, -pente * 190);
        }
      }
    }
    gr.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(rel, 0, 0, L, H);

    /* --- Parcelles cultivées : rectangles orientés, teintes de labour --- */
    var TEINTES = ['#7f8b55', '#6c7a46', '#8b8f5c', '#5f6c3d', '#96945f'];
    for (var p = 0; p < 26; p++) {
      var px = r() * L, py = r() * H;
      var pl = 70 + r() * 190, ph = 45 + r() * 120;
      var a = (r() - 0.5) * 0.5;
      g.save();
      g.translate(px, py);
      g.rotate(a);
      /* Assez discrètes pour rester un fond, pas un quadrillage. */
      g.globalAlpha = 0.10 + r() * 0.08;
      g.fillStyle = TEINTES[Math.floor(r() * TEINTES.length)];
      g.fillRect(-pl / 2, -ph / 2, pl, ph);
      g.globalAlpha = 0.045;                      /* sillons */
      g.strokeStyle = '#2f3a1e';
      g.lineWidth = 1;
      for (var s = -pl / 2; s < pl / 2; s += 8) {
        g.beginPath(); g.moveTo(s, -ph / 2); g.lineTo(s, ph / 2); g.stroke();
      }
      g.globalAlpha = 0.16;                       /* haie bordière */
      g.strokeStyle = '#3a4a26';
      g.lineWidth = 2;
      g.strokeRect(-pl / 2, -ph / 2, pl, ph);
      g.restore();
    }
    g.globalAlpha = 1;

    /* --- Ruisseau, avec ses berges --- */
    function trace(largeur, style) {
      g.strokeStyle = style;
      g.lineWidth = largeur;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(-10, H * 0.52);
      for (var t = 0; t <= 1.01; t += 0.08) {
        g.lineTo(t * L, H * (0.5 + Math.sin(t * 5.5) * 0.045));
      }
      g.stroke();
    }
    trace(22, 'rgba(62,76,44,.6)');     /* berges */
    trace(12, '#4f6c79');               /* eau profonde */
    trace(6, '#7fa0ad');                /* reflet */

    /* --- Bosquets : couronne, éclairage, ombre portée --- */
    function arbre(ax, ay, taille) {
      g.fillStyle = 'rgba(22,28,14,.42)';
      g.beginPath();
      g.ellipse(ax + taille * 0.75, ay + taille * 0.55, taille * 1.05, taille * 0.42, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#2f3d1f';
      g.beginPath();
      g.arc(ax, ay, taille, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#42552a';
      g.beginPath();
      g.arc(ax - taille * 0.2, ay - taille * 0.22, taille * 0.76, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#566c36';
      g.beginPath();
      g.arc(ax - taille * 0.34, ay - taille * 0.38, taille * 0.42, 0, Math.PI * 2);
      g.fill();
    }

    for (var b = 0; b < 30; b++) {
      var bx = r() * L, by = r() * H;
      /* L'axe central reste dégagé — c'est là que se joue la manœuvre —
         mais quelques bouquets isolés y poussent quand même, sans quoi
         le milieu du champ paraît tondu. */
      var centre = by > H * 0.26 && by < H * 0.74 && bx > L * 0.1 && bx < L * 0.9;
      if (centre && r() > 0.28) continue;
      var n = centre ? 2 + Math.floor(r() * 3) : 4 + Math.floor(r() * 8);
      for (var k = 0; k < n; k++) {
        arbre(bx + (r() - 0.5) * 90, by + (r() - 0.5) * 62, 7 + r() * 7);
      }
    }

    /* --- Grain d'herbe : de fines mouchetures, sans quoi le relief
       adouci donne une nappe de peinture lisse. On peint une petite
       tuile puis on la répète. --- */
    var tuile = document.createElement('canvas');
    tuile.width = tuile.height = 64;
    var gt = tuile.getContext('2d');
    for (var m = 0; m < 1500; m++) {
      gt.fillStyle = r() > 0.5
        ? 'rgba(146,162,98,' + (0.05 + r() * 0.13) + ')'
        : 'rgba(46,58,28,' + (0.05 + r() * 0.13) + ')';
      gt.fillRect(r() * 64, r() * 64, 1, r() > 0.7 ? 2 : 1);
    }
    var motif = g.createPattern(tuile, 'repeat');
    g.fillStyle = motif;
    g.fillRect(0, 0, L, H);

    /* Vignettage : les bords du champ s'assombrissent. */
    var v = g.createRadialGradient(L / 2, H / 2, Math.min(L, H) * 0.32, L / 2, H / 2, Math.max(L, H) * 0.72);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(12,18,8,.42)');
    g.fillStyle = v;
    g.fillRect(0, 0, L, H);

    return c;
  };

  /* --- Entrées tactiles et souris ------------------------------------ */

  Bataille.prototype.brancherEntrees = function () {
    var self = this;
    var toile = this.toile;
    var pointeurs = {};
    var depart = null;
    var aBouge = false;
    var ecartPincee = 0;

    function pos(e) {
      var r = toile.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    this.gestes = {
      down: function (e) {
        toile.setPointerCapture && toile.setPointerCapture(e.pointerId);
        pointeurs[e.pointerId] = pos(e);
        var n = Object.keys(pointeurs);
        if (n.length === 1) {
          depart = { p: pointeurs[e.pointerId], cam: { x: self.cam.x, y: self.cam.y }, t: Date.now() };
          aBouge = false;
        } else if (n.length === 2) {
          ecartPincee = self.ecartPointeurs(pointeurs);
        }
      },

      move: function (e) {
        if (!(e.pointerId in pointeurs)) return;
        pointeurs[e.pointerId] = pos(e);
        var cles = Object.keys(pointeurs);

        if (cles.length >= 2) {
          var nouvel = self.ecartPointeurs(pointeurs);
          if (ecartPincee > 0) {
            self.zoomer(self.cam.zoom * (nouvel / ecartPincee));
            ecartPincee = nouvel;
          }
          aBouge = true;
          return;
        }

        if (!depart) return;
        var p = pointeurs[e.pointerId];
        var dx = p.x - depart.p.x, dy = p.y - depart.p.y;
        if (!aBouge && Math.abs(dx) + Math.abs(dy) > 12) aBouge = true;
        if (aBouge) {
          self.cam.x = depart.cam.x - dx / self.cam.zoom;
          self.cam.y = depart.cam.y - dy / self.cam.zoom;
          self.caler();
        }
      },

      up: function (e) {
        var p = pointeurs[e.pointerId];
        delete pointeurs[e.pointerId];
        if (Object.keys(pointeurs).length < 2) ecartPincee = 0;
        if (!p || !depart) { depart = null; return; }
        /* Un appui bref et immobile vaut un ordre, pas un déplacement. */
        if (!aBouge && Date.now() - depart.t < 600) self.toucher(p.x, p.y);
        if (Object.keys(pointeurs).length === 0) depart = null;
      },

      annule: function (e) {
        delete pointeurs[e.pointerId];
        if (Object.keys(pointeurs).length === 0) { depart = null; ecartPincee = 0; }
      }
    };

    toile.addEventListener('pointerdown', this.gestes.down);
    toile.addEventListener('pointermove', this.gestes.move);
    toile.addEventListener('pointerup', this.gestes.up);
    toile.addEventListener('pointercancel', this.gestes.annule);

    this.surRedim = function () { self.redimensionner(); };
    global.addEventListener('resize', this.surRedim);
    global.addEventListener('orientationchange', this.surRedim);

    /* La zone de jeu change de taille quand le bandeau d'unités se
       remplit : on suit la boîte réelle plutôt que de la mesurer une fois. */
    if (global.ResizeObserver) {
      this.observateur = new ResizeObserver(this.surRedim);
      this.observateur.observe(toile);
    }
  };

  Bataille.prototype.ecartPointeurs = function (pointeurs) {
    var cles = Object.keys(pointeurs);
    if (cles.length < 2) return 0;
    var a = pointeurs[cles[0]], b = pointeurs[cles[1]];
    return U.dist(a.x, a.y, b.x, b.y);
  };

  Bataille.prototype.zoomer = function (z) {
    this.cam.zoom = U.borne(z, this.zoomMin || 0.3, 2.4);
    this.caler();
  };

  Bataille.prototype.caler = function () {
    var vueL = this.toile.clientWidth / this.cam.zoom;
    var vueH = this.toile.clientHeight / this.cam.zoom;
    /* Aucun débord : tant que la vue tient dans le champ, on ne laisse
       pas apparaître de bande hors terrain sur les bords. */
    var minX = Math.min(MONDE_L / 2, vueL / 2);
    var maxX = Math.max(MONDE_L / 2, MONDE_L - vueL / 2);
    var minY = Math.min(MONDE_H / 2, vueH / 2);
    var maxY = Math.max(MONDE_H / 2, MONDE_H - vueH / 2);
    this.cam.x = U.borne(this.cam.x, minX, maxX);
    this.cam.y = U.borne(this.cam.y, minY, maxY);
  };

  Bataille.prototype.redimensionner = function () {
    var toile = this.toile;
    var l = toile.clientWidth || 320;
    var h = toile.clientHeight || 240;
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var L = Math.round(l * dpr), H = Math.round(h * dpr);
    if (toile.width !== L || toile.height !== H) {
      toile.width = L;
      toile.height = H;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* On peut dézoomer jusqu'à embrasser tout le champ… */
    this.zoomMin = Math.min(l / (MONDE_L + MARGE_CAM * 2), h / (MONDE_H + MARGE_CAM * 2));
    if (!this.zoomFait) {
      /* …mais on ouvre à l'échelle qui *couvre* la vue : à l'échelle
         « contenir », le terrain ne remplirait pas l'écran en hauteur. */
      var couvre = Math.max(l / MONDE_L, h / MONDE_H);
      this.cam.zoom = U.borne(couvre, this.zoomMin, 1.6);
      this.cam.y = MONDE_H - 260;
      this.zoomFait = true;
    }
    this.zoomer(this.cam.zoom);
  };

  Bataille.prototype.versMonde = function (sx, sy) {
    return {
      x: (sx - this.toile.clientWidth / 2) / this.cam.zoom + this.cam.x,
      y: (sy - this.toile.clientHeight / 2) / this.cam.zoom + this.cam.y
    };
  };

  /* --- Sélection et ordres ------------------------------------------- */

  Bataille.prototype.toucher = function (sx, sy) {
    var m = this.versMonde(sx, sy);
    var cible = this.uniteEn(m.x, m.y);

    if (cible && cible.camp === 'joueur') {
      if (cible.selectionne && this.selection().length === 1) this.deselectionner();
      else { this.deselectionner(); cible.selectionne = true; }
      this.surEtat();
      return;
    }

    var choisies = this.selection();
    if (!choisies.length) { this.deselectionner(); this.surEtat(); return; }

    if (cible && cible.camp === 'ennemi') {
      choisies.forEach(function (u) { u.cible = cible.id; u.ordre = null; u.tenir = false; });
      this.signal('Attaque sur ' + cible.nom);
    } else {
      this.ordonnerDeplacement(choisies, m.x, m.y);
    }
    this.surEtat();
  };

  /* Plusieurs unités envoyées au même endroit se rangent côte à côte,
     perpendiculairement à leur axe de marche. */
  Bataille.prototype.ordonnerDeplacement = function (unites, x, y) {
    var cx = 0, cy = 0;
    unites.forEach(function (u) { cx += u.x; cy += u.y; });
    cx /= unites.length; cy /= unites.length;

    var cap = Math.atan2(y - cy, x - cx);
    var perp = cap + Math.PI / 2;

    /* On garde l'ordre gauche-droite actuel de la ligne. */
    var triees = unites.slice().sort(function (a, b) {
      return (a.x * Math.cos(perp) + a.y * Math.sin(perp)) - (b.x * Math.cos(perp) + b.y * Math.sin(perp));
    });

    var total = 0;
    triees.forEach(function (u) { total += u.largeur + 26; });
    var pas = -total / 2;

    triees.forEach(function (u) {
      pas += u.largeur / 2;
      u.ordre = {
        x: U.borne(x + Math.cos(perp) * pas, 40, MONDE_L - 40),
        y: U.borne(y + Math.sin(perp) * pas, 40, MONDE_H - 40),
        angle: cap
      };
      u.cible = null;
      u.tenir = false;
      pas += u.largeur / 2 + 26;
    });
  };

  Bataille.prototype.uniteEn = function (x, y) {
    var trouvee = null, meilleure = Infinity;
    this.unites.forEach(function (u) {
      if (!u.estVivante()) return;
      /* Tolérance généreuse : on joue au doigt. */
      var marge = 18;
      var dx = x - u.x, dy = y - u.y;
      var c = Math.cos(-u.angle), s = Math.sin(-u.angle);
      var lx = dx * c - dy * s, ly = dx * s + dy * c;
      if (Math.abs(lx) <= u.largeur / 2 + marge && Math.abs(ly) <= u.profondeur / 2 + marge) {
        var d = lx * lx + ly * ly;
        if (d < meilleure) { meilleure = d; trouvee = u; }
      }
    });
    return trouvee;
  };

  Bataille.prototype.selection = function () {
    return this.unites.filter(function (u) { return u.selectionne && u.combattante(); });
  };

  Bataille.prototype.deselectionner = function () {
    this.unites.forEach(function (u) { u.selectionne = false; });
  };

  Bataille.prototype.selectionnerTout = function () {
    this.unites.forEach(function (u) {
      u.selectionne = (u.camp === 'joueur' && u.combattante());
    });
    this.surEtat();
  };

  Bataille.prototype.selectionnerUne = function (id) {
    this.deselectionner();
    var u = this.parId(id);
    if (u && u.combattante()) {
      u.selectionne = true;
      this.cam.x = u.x;
      this.cam.y = u.y;
      this.caler();
    }
    this.surEtat();
  };

  /* Ramène la vue sur nos troupes — sans quoi la ligne avance et sort
     du cadre au premier assaut. */
  Bataille.prototype.recentrer = function () {
    var nous = this.debout('joueur');
    if (!nous.length) nous = this.unites.filter(function (u) { return u.estVivante(); });
    if (!nous.length) return;
    var x = 0, y = 0;
    nous.forEach(function (u) { x += u.x; y += u.y; });
    this.cam.x = x / nous.length;
    this.cam.y = y / nous.length;
    this.caler();
  };

  Bataille.prototype.parId = function (id) {
    for (var i = 0; i < this.unites.length; i++) if (this.unites[i].id === id) return this.unites[i];
    return null;
  };

  Bataille.prototype.tenirPosition = function () {
    this.selection().forEach(function (u) { u.ordre = null; u.cible = null; u.tenir = true; });
    this.signal('Tenir la position');
    this.surEtat();
  };

  /* --- Boucle de jeu -------------------------------------------------- */

  Bataille.prototype.lancer = function () {
    var self = this;
    this.horloge = performance.now();
    function trame(t) {
      if (self.arretee) return;
      var dt = Math.min((t - self.horloge) / 1000, 0.05);
      self.horloge = t;
      if (!self.terminee && self.vitesse > 0) {
        /* À vitesse accélérée on refait plusieurs petits pas : la
           physique reste stable au lieu de sauter. */
        var pas = self.vitesse;
        while (pas > 0) {
          self.majr(dt * Math.min(pas, 1));
          pas -= 1;
        }
      }
      self.dessiner();
      self.boucle = requestAnimationFrame(trame);
    }
    this.boucle = requestAnimationFrame(trame);
  };

  Bataille.prototype.arreter = function () {
    this.arretee = true;
    if (this.boucle) cancelAnimationFrame(this.boucle);
    var t = this.toile;
    t.removeEventListener('pointerdown', this.gestes.down);
    t.removeEventListener('pointermove', this.gestes.move);
    t.removeEventListener('pointerup', this.gestes.up);
    t.removeEventListener('pointercancel', this.gestes.annule);
    global.removeEventListener('resize', this.surRedim);
    global.removeEventListener('orientationchange', this.surRedim);
    if (this.observateur) this.observateur.disconnect();
  };

  Bataille.prototype.majr = function (dt) {
    this.temps += dt;
    var self = this;

    if (this.temps - this.derniereIA > 1.2) {
      this.derniereIA = this.temps;
      this.penserIA();
    }

    this.unites.forEach(function (u) { self.majUnite(u, dt); });
    this.separer();
    this.majFumees(dt);
    this.verifierFin();
  };

  Bataille.prototype.majUnite = function (u, dt) {
    if (!u.estVivante()) return;

    if (u.etat === 'déroute') { this.majDeroute(u, dt); return; }

    var cible = u.cible ? this.parId(u.cible) : null;
    if (cible && !cible.estVivante()) { cible = null; u.cible = null; }

    var def = u.def;
    var auContact = false;

    /* -- Déplacement -- */
    var but = null;
    if (cible) {
      var d = U.dist(u.x, u.y, cible.x, cible.y);
      var portee = def.portee;
      var arret = portee > 0 ? portee * 0.82 + cible.rayon * 0.3 : u.rayon + cible.rayon - 4;
      if (d > arret) but = { x: cible.x, y: cible.y, angle: Math.atan2(cible.y - u.y, cible.x - u.x) };
      else but = { x: u.x, y: u.y, angle: Math.atan2(cible.y - u.y, cible.x - u.x) };
    } else if (u.ordre) {
      but = u.ordre;
    }

    if (but) {
      var dx = but.x - u.x, dy = but.y - u.y;
      var reste = Math.sqrt(dx * dx + dy * dy);
      if (reste > 3) {
        var vitesse = def.vitesse;
        /* Élan de charge : la cavalerie accélère sur les derniers mètres. */
        if (def.charge && cible && reste < 230) vitesse *= 1.55;
        var avance = Math.min(vitesse * dt, reste);
        u.x += (dx / reste) * avance;
        u.y += (dy / reste) * avance;
        this.orienter(u, Math.atan2(dy, dx), dt, 2.4);
      } else {
        if (but.angle != null) this.orienter(u, but.angle, dt, 2.0);
        if (u.ordre && !cible) u.ordre = null;
      }
    }

    u.x = U.borne(u.x, 30, MONDE_L - 30);
    u.y = U.borne(u.y, 30, MONDE_H - 30);

    /* -- Corps à corps -- */
    var self = this;
    this.unites.forEach(function (v) {
      if (v.camp === u.camp || !v.estVivante()) return;
      var d = U.dist(u.x, u.y, v.x, v.y);
      if (d < u.rayon * 0.55 + v.rayon * 0.55 + 10) {
        auContact = true;
        self.melee(u, v, dt);
      }
    });

    if (auContact) {
      if (u.contactDepuis < 0) {
        u.contactDepuis = 0;
        if (def.charge) JEU.Audio.charge();
      } else u.contactDepuis += dt;
    } else {
      u.contactDepuis = -1;
    }

    /* -- Feu -- */
    if (def.portee > 0 && !auContact) {
      u.rechargement -= dt * 1000;
      if (u.rechargement <= 0) {
        var proie = cible && this.aPortee(u, cible) ? cible : this.chercherProie(u);
        if (proie) {
          this.tirer(u, proie);
          u.rechargement = def.cadence * (0.85 + this.alea() * 0.3);
        } else {
          u.rechargement = 400;
        }
      }
    }

    /* -- Moral -- */
    if (!auContact) {
      u.calmeDepuis += dt;
      if (u.calmeDepuis > 3) {
        u.moral = Math.min(u.moral + 2.2 * dt, u.moralMax * 0.9);
      }
    } else {
      u.calmeDepuis = 0;
    }

    /* La panique est contagieuse : un voisin qui rompt entame le moral. */
    this.unites.forEach(function (v) {
      if (v.camp !== u.camp || v === u || v.etat !== 'déroute') return;
      if (U.dist(u.x, u.y, v.x, v.y) < 170) u.moral -= 2.4 * dt;
    });

    if (u.moral <= 0) this.rompre(u);
  };

  Bataille.prototype.orienter = function (u, vise, dt, vitesse) {
    var ecart = U.ecartAngle(u.angle, vise);
    var pas = vitesse * dt;
    u.angle += U.borne(ecart, -pas, pas);
  };

  Bataille.prototype.aPortee = function (u, v) {
    if (!v.estVivante()) return false;
    var d = U.dist(u.x, u.y, v.x, v.y);
    if (d > u.def.portee) return false;
    var vers = Math.atan2(v.y - u.y, v.x - u.x);
    return Math.abs(U.ecartAngle(u.angle, vers)) < 1.05;   // ± 60°
  };

  Bataille.prototype.chercherProie = function (u) {
    var meilleure = null, plusProche = Infinity;
    for (var i = 0; i < this.unites.length; i++) {
      var v = this.unites[i];
      if (v.camp === u.camp || !v.estVivante()) continue;
      if (!this.aPortee(u, v)) continue;
      var d = U.dist2(u.x, u.y, v.x, v.y);
      if (d < plusProche) { plusProche = d; meilleure = v; }
    }
    return meilleure;
  };

  Bataille.prototype.tirer = function (u, v) {
    var d = U.dist(u.x, u.y, v.x, v.y);
    var facteur = U.borne(1 - (d / u.def.portee) * 0.55, 0.3, 1);
    var pertes = u.hommes * u.def.precision * facteur * (0.75 + this.alea() * 0.5);

    var artillerie = u.def.cat === 'art';
    if (artillerie) {
      pertes *= 1 + v.hommes / v.hommesMax;          // les blocs denses souffrent
      JEU.Audio.canon();
    } else {
      JEU.Audio.salve();
    }

    v.subir(Math.round(pertes), artillerie ? 4 : 0);

    /* La fumée et la lueur naissent sur toute la ligne de feu, pas en un
       point : c'est ce qui donne l'impression d'une salve. */
    var avant = u.angle;
    var perp = avant + Math.PI / 2;
    var bouches = artillerie ? Math.max(1, Math.round(u.hommes / 6)) : 5;

    for (var i = 0; i < bouches; i++) {
      var t = bouches === 1 ? 0 : (i / (bouches - 1) - 0.5);
      var bx = u.x + Math.cos(perp) * t * u.largeur * 0.9 + Math.cos(avant) * u.profondeur * 0.55;
      var by = u.y + Math.sin(perp) * t * u.largeur * 0.9 + Math.sin(avant) * u.profondeur * 0.55;
      this.fumer(bx, by, artillerie ? 22 : 13, artillerie ? 4 : 2, avant);
      this.flashes.push({ x: bx, y: by, a: avant, vie: 1, taille: artillerie ? 17 : 8 });
    }

    /* Impacts au but. */
    if (artillerie) {
      for (var k = 0; k < 3; k++) {
        this.fumer(v.x + (this.alea() - 0.5) * v.largeur, v.y + (this.alea() - 0.5) * v.profondeur, 16, 2, 0);
      }
    }
  };

  Bataille.prototype.melee = function (u, v, dt) {
    var force = u.def.melee;
    /* La charge ne vaut que les premières secondes du choc. */
    if (u.def.charge && u.contactDepuis >= 0 && u.contactDepuis < 3.5) force *= u.def.charge;

    /* Être pris de flanc ou de dos coûte cher. */
    var vers = Math.atan2(u.y - v.y, u.x - v.x);
    var ecart = Math.abs(U.ecartAngle(v.angle, vers));
    if (ecart > 1.9) force *= 1.7;
    else if (ecart > 1.0) force *= 1.3;

    var pertes = u.hommes * force * 0.055 * dt;
    v.subir(pertes, ecart > 1.9 ? 6 * dt : 0);
  };

  Bataille.prototype.rompre = function (u) {
    if (u.etat === 'déroute' || !u.estVivante()) return;
    u.etat = 'déroute';
    u.moral = 0;
    u.cible = null;
    u.ordre = null;
    u.selectionne = false;
    JEU.Audio.deroute();
    this.signal((u.camp === 'joueur' ? '' : 'Ennemi — ') + u.nom + ' : rompu !');
    this.surEtat();
  };

  Bataille.prototype.majDeroute = function (u, dt) {
    var fuite = u.camp === 'joueur' ? MONDE_H + 60 : -60;
    var dy = fuite - u.y;
    var sens = dy > 0 ? 1 : -1;
    u.y += sens * u.def.vitesse * 1.35 * dt;
    u.x += Math.sin(this.temps * 1.7 + u.id) * 9 * dt;
    this.orienter(u, sens > 0 ? Math.PI / 2 : -Math.PI / 2, dt, 3);

    /* Sortie du champ : l'unité est perdue pour cette bataille. */
    if (u.y < -40 || u.y > MONDE_H + 40) { u.etat = 'mort'; this.surEtat(); return; }

    /* On peut se ressaisir loin de l'ennemi. */
    u.moral += 3.4 * dt;
    var proche = false, self = this;
    this.unites.forEach(function (v) {
      if (v.camp !== u.camp && v.combattante() && U.dist(u.x, u.y, v.x, v.y) < 230) proche = true;
    });
    /* On rallie au-dessus d'un seuil franc, et l'on rend un peu de
       moral : sinon l'unité rompt de nouveau à la première salve. */
    if (!proche && u.moral > 34) {
      u.etat = 'formé';
      u.moral = Math.max(u.moral, u.moralMax * 0.45);
      u.contactDepuis = -1;
      if (u.camp === 'joueur') this.signal(u.nom + ' : ralliés');
      this.surEtat();
    }
  };

  /* Deux unités du même camp ne doivent pas se traverser. */
  Bataille.prototype.separer = function () {
    for (var i = 0; i < this.unites.length; i++) {
      var a = this.unites[i];
      if (!a.estVivante()) continue;
      for (var j = i + 1; j < this.unites.length; j++) {
        var b = this.unites[j];
        if (!b.estVivante() || b.camp !== a.camp) continue;
        var dx = b.x - a.x, dy = b.y - a.y;
        var d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        var mini = (a.profondeur + b.profondeur) * 0.5 + 8;
        if (d < mini) {
          var poussee = (mini - d) / 2;
          a.x -= (dx / d) * poussee; a.y -= (dy / d) * poussee;
          b.x += (dx / d) * poussee; b.y += (dy / d) * poussee;
        }
      }
    }
  };

  /* --- Fumée ---------------------------------------------------------- */

  Bataille.prototype.fumer = function (x, y, taille, n, direction) {
    if (this.fumees.length > 340) return;
    for (var i = 0; i < n; i++) {
      /* La fumée part vers l'avant puis dérive avec le vent. */
      var pousse = 14 + this.alea() * 22;
      this.fumees.push({
        x: x + (this.alea() - 0.5) * taille,
        y: y + (this.alea() - 0.5) * taille,
        r: taille * (0.45 + this.alea() * 0.5),
        vie: 1,
        teinte: 226 + Math.floor(this.alea() * 22),
        vx: Math.cos(direction || 0) * pousse + this.vent.x + (this.alea() - 0.5) * 10,
        vy: Math.sin(direction || 0) * pousse + this.vent.y + (this.alea() - 0.5) * 10
      });
    }
  };

  Bataille.prototype.majFumees = function (dt) {
    var f;
    for (var i = this.fumees.length - 1; i >= 0; i--) {
      f = this.fumees[i];
      f.vie -= dt * 0.42;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vx *= 0.94;                 /* la poussée retombe, le vent reste */
      f.vy *= 0.94;
      f.vx += this.vent.x * dt * 0.6;
      f.vy += this.vent.y * dt * 0.6;
      f.r += 17 * dt;
      if (f.vie <= 0) this.fumees.splice(i, 1);
    }
    for (var j = this.flashes.length - 1; j >= 0; j--) {
      this.flashes[j].vie -= dt * 9;
      if (this.flashes[j].vie <= 0) this.flashes.splice(j, 1);
    }
  };

  Bataille.prototype.signal = function (texte) {
    this.messages.push({ texte: texte, vie: 3.4 });
    if (this.messages.length > 4) this.messages.shift();
  };

  /* --- Intelligence adverse ------------------------------------------- */

  Bataille.prototype.penserIA = function () {
    var self = this;
    var nous = this.unites.filter(function (u) { return u.camp === 'ennemi' && u.combattante(); });
    var eux = this.unites.filter(function (u) { return u.camp === 'joueur' && u.combattante(); });
    if (!eux.length) return;

    nous.forEach(function (u) {
      var courante = u.cible ? self.parId(u.cible) : null;
      if (courante && courante.combattante()) {
        /* On garde sa cible tant qu'elle tient — sauf pour la cavalerie,
           qui redirige vers les canons ou les unités ébranlées. */
        if (u.def.cat !== 'cav') return;
        if (courante.moral < courante.moralMax * 0.55) return;
      }

      if (u.def.cat === 'art') {
        u.ordre = null;
        var proie = null, meilleur = Infinity, plusProche = null, dProche = Infinity;
        eux.forEach(function (v) {
          var d = U.dist(u.x, u.y, v.x, v.y);
          if (d < dProche) { dProche = d; plusProche = v; }
          if (d < u.def.portee && d < meilleur) { meilleur = d; proie = v; }
        });
        if (proie) { u.cible = proie.id; return; }
        /* Plus rien à portée : la batterie se déplace au lieu de rester
           plantée là — sans quoi la bataille ne se conclut jamais. */
        u.cible = null;
        if (plusProche) {
          u.ordre = {
            x: u.x + (plusProche.x - u.x) * 0.5,
            y: u.y + (plusProche.y - u.y) * 0.5,
            angle: Math.atan2(plusProche.y - u.y, plusProche.x - u.x)
          };
        }
        return;
      }

      if (u.def.cat === 'cav') {
        /* Priorité : l'artillerie, puis l'unité la plus entamée. */
        var canons = eux.filter(function (v) { return v.def.cat === 'art'; });
        var liste = canons.length ? canons : eux;
        var choix = liste.reduce(function (a, b) {
          var sa = a.moral / a.moralMax + U.dist(u.x, u.y, a.x, a.y) / 1600;
          var sb = b.moral / b.moralMax + U.dist(u.x, u.y, b.x, b.y) / 1600;
          return sb < sa ? b : a;
        });
        u.cible = choix.id;
        u.ordre = null;
        return;
      }

      /* Infanterie : droit sur l'adversaire le plus proche. */
      var plus = null, dmin = Infinity;
      eux.forEach(function (v) {
        var d = U.dist2(u.x, u.y, v.x, v.y);
        if (d < dmin) { dmin = d; plus = v; }
      });
      if (plus) { u.cible = plus.id; u.ordre = null; }
    });
  };

  /* --- Fin de partie --------------------------------------------------- */

  Bataille.prototype.debout = function (camp) {
    return this.unites.filter(function (u) { return u.camp === camp && u.combattante(); });
  };

  Bataille.prototype.hommesDe = function (camp) {
    var n = 0;
    this.unites.forEach(function (u) { if (u.camp === camp) n += u.hommes; });
    return n;
  };

  Bataille.prototype.verifierFin = function () {
    if (this.terminee) return;

    if (!this.debout('joueur').length) { this.conclure('ennemi'); return; }
    if (!this.debout('ennemi').length) { this.conclure('joueur'); return; }

    /* Une armée ne se bat pas jusqu'au dernier homme : passé les quatre
       cinquièmes de pertes, elle décroche. */
    var hj = this.hommesDe('joueur'), he = this.hommesDe('ennemi');
    if (he < this.depart.ennemi * 0.2) { this.conclure('joueur'); return; }
    if (hj < this.depart.joueur * 0.2) { this.conclure('ennemi'); return; }

    /* Garde-fou : si plus personne ne tombe pendant une minute, les deux
       lignes se regardent — on tranche au nombre plutôt que d'attendre. */
    var total = hj + he;
    if (total !== this.dernierTotal) {
      this.dernierTotal = total;
      this.dernierSang = this.temps;
    } else if (this.temps - this.dernierSang > 60) {
      this.conclure(hj >= he ? 'joueur' : 'ennemi');
    }
  };

  Bataille.prototype.survivants = function (camp) {
    return this.unites
      .filter(function (u) { return u.camp === camp && u.hommes > 0 && u.etat !== 'mort'; })
      .map(function (u) { return { type: u.type, hommes: u.hommes }; });
  };

  Bataille.prototype.conclure = function (vainqueur, retraite) {
    if (this.terminee) return;
    this.terminee = true;
    this.vitesse = 0;
    var self = this;
    var pertes = function (camp) {
      var p = 0;
      self.unites.forEach(function (u) {
        if (u.camp === camp) p += u.hommesMax - u.hommes;
      });
      return p;
    };
    this.surFin({
      vainqueur: vainqueur,
      retraite: !!retraite,
      survivantsJoueur: vainqueur === 'joueur' ? this.survivants('joueur') : [],
      survivantsEnnemi: vainqueur === 'ennemi' ? this.survivants('ennemi') : [],
      pertesJoueur: pertes('joueur'),
      pertesEnnemi: pertes('ennemi')
    });
  };

  Bataille.prototype.battreEnRetraite = function () {
    this.conclure('ennemi', true);
  };

  /* --- Rendu ----------------------------------------------------------- */

  Bataille.prototype.dessiner = function () {
    var g = this.ctx;
    var L = this.toile.clientWidth, H = this.toile.clientHeight;
    /* Hors-champ peint en coordonnées écran : quel que soit le zoom,
       aucune bande de fond ne peut apparaître sur les bords. */
    g.fillStyle = '#2b3320';
    g.fillRect(0, 0, L, H);

    g.save();
    g.translate(L / 2, H / 2);
    g.scale(this.cam.zoom, this.cam.zoom);
    g.translate(-this.cam.x, -this.cam.y);

    g.drawImage(this.terrain, 0, 0, MONDE_L, MONDE_H);

    this.dessinerOrdres(g);
    var self = this;
    /* Les unités mortes d'abord, pour que les vivantes passent dessus. */
    this.unites.forEach(function (u) { if (u.etat === 'déroute') self.dessinerUnite(g, u); });
    this.unites.forEach(function (u) { if (u.etat === 'formé') self.dessinerUnite(g, u); });
    this.dessinerFumees(g);

    g.restore();
    this.dessinerMessages(g, L, H);
  };

  Bataille.prototype.dessinerOrdres = function (g) {
    var self = this;
    g.lineWidth = 2 / this.cam.zoom;
    this.unites.forEach(function (u) {
      if (!u.selectionne || !u.combattante()) return;
      var but = u.cible ? self.parId(u.cible) : u.ordre;
      if (!but) return;
      g.strokeStyle = u.cible ? 'rgba(220,90,70,.85)' : 'rgba(232,201,106,.85)';
      g.setLineDash(u.cible ? [] : [9, 7]);
      g.beginPath();
      g.moveTo(u.x, u.y);
      g.lineTo(but.x, but.y);
      g.stroke();
      g.setLineDash([]);
      g.beginPath();
      g.arc(but.x, but.y, 7, 0, Math.PI * 2);
      g.stroke();
    });
  };

  /* Le bloc d'une unité est peint dans son propre canevas et n'est
     refait que lorsque les rangs changent : sans cela, mille figurines
     redessinées soixante fois par seconde mettraient le jeu à genoux. */
  Bataille.prototype.blocDe = function (u) {
    if (u.bloc && u.blocPour === u.hommes) return u.bloc;

    var D_ = JEU.D.FACTIONS[u.faction];
    var sprite = Deco.spriteSoldat(u.def.cat, D_.couleur, D_.clair);
    var marge = Math.max(sprite.mondeL, sprite.mondeH) + 6;
    var S = 2;                                   /* finesse du bloc */

    var c = u.bloc || document.createElement('canvas');
    var l = u.largeur + marge * 2, h = u.profondeur + marge * 2;
    c.width = Math.ceil(l * S);
    c.height = Math.ceil(h * S);
    var g = c.getContext('2d');
    g.setTransform(S, 0, 0, S, 0, 0);
    g.clearRect(0, 0, l, h);
    g.translate(l / 2, h / 2);

    /* Les canons, devant les servants. */
    if (u.def.cat === 'art') {
      var n = Math.max(1, Math.round(u.hommes / 6));
      for (var k = 0; k < n; k++) {
        var cx = (k - (n - 1) / 2) * 24;
        var cy = -u.profondeur / 2 - 8;
        g.fillStyle = 'rgba(18,22,14,.42)';      /* ombre portée */
        g.beginPath();
        g.ellipse(cx + 2.5, cy + 6, 8.5, 2.8, 0, 0, Math.PI * 2);
        g.fill();

        g.strokeStyle = '#4a3c22';               /* flasques de l'affût */
        g.lineWidth = 2.2;
        g.beginPath();
        g.moveTo(cx - 1, cy + 1); g.lineTo(cx + 7, cy + 5);
        g.stroke();

        g.fillStyle = '#24272c';                 /* tube, vers l'ennemi */
        g.save();
        g.translate(cx, cy);
        g.beginPath();
        g.moveTo(-1.7, 1.5); g.lineTo(1.7, 1.5); g.lineTo(1.2, -9); g.lineTo(-1.2, -9);
        g.closePath();
        g.fill();
        g.fillStyle = '#3a3e45';                 /* bourrelet de bouche */
        g.fillRect(-1.6, -10, 3.2, 1.4);
        g.restore();

        g.strokeStyle = '#6b5836';               /* roues, avec rayons */
        g.lineWidth = 1.1;
        [[-5, 3], [5, 3]].forEach(function (roue) {
          g.beginPath();
          g.arc(cx + roue[0], cy + roue[1], 3.4, 0, Math.PI * 2);
          g.stroke();
          for (var a = 0; a < 3; a++) {
            var ang = a * Math.PI / 3;
            g.beginPath();
            g.moveTo(cx + roue[0] - Math.cos(ang) * 3.2, cy + roue[1] - Math.sin(ang) * 3.2);
            g.lineTo(cx + roue[0] + Math.cos(ang) * 3.2, cy + roue[1] + Math.sin(ang) * 3.2);
            g.stroke();
          }
        });
      }
    }

    /* Les hommes, du fond vers l'avant, pour que les rangs se chevauchent
       dans le bon ordre. */
    var places = [];
    for (var i = 0; i < u.vivants.length; i++) places.push(u.places[u.vivants[i]]);
    places.sort(function (a, b) { return a[1] - b[1]; });

    var sl = sprite.mondeL, sh = sprite.mondeH;
    for (var j = 0; j < places.length; j++) {
      g.drawImage(sprite, places[j][0] - sl / 2, places[j][1] - sh * 0.72, sl, sh);
    }

    u.bloc = c;
    u.blocPour = u.hommes;
    u.blocL = l;
    u.blocH = h;
    return c;
  };

  Bataille.prototype.dessinerUnite = function (g, u) {
    if (!u.estVivante()) return;
    var D_ = JEU.D.FACTIONS[u.faction] || { couleur: '#888', clair: '#bbb' };
    var deroute = u.etat === 'déroute';
    var bloc = this.blocDe(u);

    g.save();
    g.translate(u.x, u.y);
    /* Une troupe qui rompt se disloque : le bloc tangue. */
    if (deroute) g.rotate(u.angle + Math.PI / 2 + Math.sin(this.temps * 3 + u.id) * 0.07);
    else g.rotate(u.angle + Math.PI / 2);

    if (u.selectionne) {
      /* Liseré doré au sol, comme un cordeau de placement. */
      g.strokeStyle = 'rgba(232,201,106,.95)';
      g.lineWidth = 2.2 / this.cam.zoom;
      Deco.cheminArrondi(g, -u.largeur / 2 - 5, -u.profondeur / 2 - 5,
        u.largeur + 10, u.profondeur + 10, 4);
      g.stroke();
      g.fillStyle = 'rgba(232,201,106,.10)';
      g.fill();
    }

    g.globalAlpha = deroute ? 0.82 : 1;
    g.drawImage(bloc, -u.blocL / 2, -u.blocH / 2, u.blocL, u.blocH);
    g.globalAlpha = 1;

    /* Drapeau régimentaire planté au centre de l'infanterie. */
    if (u.def.cat !== 'art' && u.hommes > 0) {
      Deco.drapeau(g, 0, -u.profondeur * 0.1, 15, D_.couleur, D_.clair,
        this.temps * 2.4 + u.id);
    }
    g.restore();

    this.dessinerEnseigne(g, u, D_, deroute);
  };

  /* Marqueur au-dessus de la troupe : un petit drapeau sur sa hampe et
     une jauge de moral. Il garde une taille constante à l'écran pour
     rester lisible, sans écraser les figurines. */
  Bataille.prototype.dessinerEnseigne = function (g, u, D_, deroute) {
    var ech = 1 / Math.max(this.cam.zoom, 0.8);
    g.save();
    g.translate(u.x, u.y - u.profondeur / 2 - 7);
    g.scale(ech, ech);

    var l = 13, h = 8.5, hampe = 17;

    g.strokeStyle = 'rgba(28,24,14,.85)';          /* hampe */
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(0, 2); g.lineTo(0, -hampe); g.stroke();

    g.fillStyle = deroute ? '#6a6a6a' : D_.couleur;
    g.fillRect(0.6, -hampe, l, h);
    g.fillStyle = deroute ? '#8a8a8a' : D_.clair;
    g.fillRect(0.6, -hampe, l / 3, h);
    g.strokeStyle = u.selectionne ? '#f0d585' : 'rgba(20,18,12,.7)';
    g.lineWidth = u.selectionne ? 1.5 : 0.8;
    g.strokeRect(0.6, -hampe, l, h);

    var part = U.borne(u.moral / u.moralMax, 0, 1);
    g.fillStyle = 'rgba(10,14,8,.8)';
    g.fillRect(0.6, -hampe + h + 1, l, 2.6);
    g.fillStyle = deroute ? '#9c4b3f'
      : (part > 0.55 ? '#6fae5c' : (part > 0.28 ? '#d8a740' : '#c05a45'));
    g.fillRect(0.6, -hampe + h + 1, l * part, 2.6);

    if (u.selectionne) {                            /* chevron de sélection */
      g.fillStyle = '#f0d585';
      g.beginPath();
      g.moveTo(-4, 4); g.lineTo(4, 4); g.lineTo(0, 9);
      g.closePath();
      g.fill();
    }
    g.restore();
  };

  Bataille.prototype.dessinerFumees = function (g) {
    var i, f;

    /* Lueurs de bouche : brèves, orangées, orientées vers l'ennemi. */
    for (i = 0; i < this.flashes.length; i++) {
      var fl = this.flashes[i];
      g.save();
      g.globalAlpha = U.borne(fl.vie, 0, 1);
      g.globalCompositeOperation = 'lighter';
      g.translate(fl.x, fl.y);
      g.rotate(fl.a);
      var lueur = g.createRadialGradient(0, 0, 0, 0, 0, fl.taille);
      lueur.addColorStop(0, 'rgba(255,244,214,.95)');
      lueur.addColorStop(0.35, 'rgba(255,186,92,.6)');
      lueur.addColorStop(1, 'rgba(255,140,40,0)');
      g.fillStyle = lueur;
      g.beginPath();
      g.ellipse(fl.taille * 0.4, 0, fl.taille, fl.taille * 0.6, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    /* Nuages de poudre : plusieurs disques mous qui se recouvrent. */
    for (i = 0; i < this.fumees.length; i++) {
      f = this.fumees[i];
      var a = U.borne(f.vie, 0, 1);
      var d = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
      var t = f.teinte;
      d.addColorStop(0, 'rgba(' + t + ',' + t + ',' + (t - 8) + ',' + (a * 0.5) + ')');
      d.addColorStop(0.6, 'rgba(' + t + ',' + t + ',' + (t - 8) + ',' + (a * 0.26) + ')');
      d.addColorStop(1, 'rgba(' + t + ',' + t + ',' + (t - 8) + ',0)');
      g.fillStyle = d;
      g.beginPath();
      g.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  };

  Bataille.prototype.dessinerMessages = function (g, L, H) {
    var y = 24;
    g.font = '600 13px Georgia, serif';
    g.textAlign = 'center';
    for (var i = 0; i < this.messages.length; i++) {
      var m = this.messages[i];
      m.vie -= 1 / 60;
      if (m.vie <= 0) continue;
      g.globalAlpha = U.borne(m.vie, 0, 1);
      g.fillStyle = 'rgba(8,13,22,.72)';
      var larg = g.measureText(m.texte).width + 22;
      g.fillRect(L / 2 - larg / 2, y - 14, larg, 21);
      g.fillStyle = '#e8c96a';
      g.fillText(m.texte, L / 2, y);
      y += 26;
    }
    g.globalAlpha = 1;
    this.messages = this.messages.filter(function (m) { return m.vie > 0; });
  };

  /* ------------------------------------------------------------------ */

  JEU.Bataille = {
    creer: function (config) { return new Bataille(config); },
    MONDE_L: MONDE_L,
    MONDE_H: MONDE_H
  };
})(window);
