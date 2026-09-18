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

  var MONDE_L = 1400;          // largeur du champ de bataille
  var MONDE_H = 950;           // profondeur
  var ESPACEMENT = 5.6;        // distance entre deux hommes
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
    this.rangs = def.rangs;
    this.colonnes = Math.ceil(this.hommesMax / this.rangs);
    this.largeur = this.colonnes * ESPACEMENT;
    this.profondeur = this.rangs * ESPACEMENT;
    this.rayon = Math.max(this.largeur, this.profondeur) / 2;

    /* Position locale de chaque homme, puis la liste de ceux qui tiennent
       encore debout — on retire au hasard pour que la ligne se troue. */
    this.places = [];
    for (var i = 0; i < this.hommesMax; i++) {
      var col = i % this.colonnes;
      var rang = Math.floor(i / this.colonnes);
      this.places.push([
        (col - (this.colonnes - 1) / 2) * ESPACEMENT,
        (rang - (this.rangs - 1) / 2) * ESPACEMENT
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
    this.messages = [];
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

      var total = 0;
      centre.forEach(function (u) { total += D.UNITES[u.type].hommes / D.UNITES[u.type].rangs * ESPACEMENT + 30; });

      var x = MONDE_L / 2 - total / 2;
      centre.forEach(function (u) {
        var unite = new Unite(++id, camp, u.type, u.hommes, self.factions[camp]);
        unite.largeur = unite.colonnes * ESPACEMENT;
        x += unite.largeur / 2;
        unite.x = U.borne(x, 70, MONDE_L - 70);
        unite.y = y;
        unite.angle = angle;
        self.unites.push(unite);
        x += unite.largeur / 2 + 30;
      });

      /* Les canons se placent en retrait, répartis sur la largeur. */
      art.forEach(function (u, i) {
        var unite = new Unite(++id, camp, u.type, u.hommes, self.factions[camp]);
        unite.x = MONDE_L / 2 + (i - (art.length - 1) / 2) * 190;
        unite.y = y + (camp === 'joueur' ? 95 : -95);
        unite.angle = angle;
        self.unites.push(unite);
      });
    }

    ligneDeBataille(forces.joueur, 'joueur', MONDE_H - 200, -Math.PI / 2);
    ligneDeBataille(forces.ennemi, 'ennemi', 200, Math.PI / 2);
  };

  /* Terrain pré-rendu une fois dans un canevas hors écran. */
  Bataille.prototype.dessinerTerrain = function () {
    var ech = 0.5;
    var c = document.createElement('canvas');
    c.width = MONDE_L * ech;
    c.height = MONDE_H * ech;
    var g = c.getContext('2d');
    var r = U.generateur(7331);

    var fond = g.createLinearGradient(0, 0, 0, c.height);
    fond.addColorStop(0, '#5d6b45');
    fond.addColorStop(0.5, '#6d7a4c');
    fond.addColorStop(1, '#5a6742');
    g.fillStyle = fond;
    g.fillRect(0, 0, c.width, c.height);

    /* Taches de prairie et de labour : petites et nombreuses, sinon
       elles se lisent comme de grosses auréoles une fois zoomées. */
    for (var i = 0; i < 260; i++) {
      var x = r() * c.width, y = r() * c.height;
      var rx = 10 + r() * 42, ry = 6 + r() * 22;
      g.globalAlpha = 0.05 + r() * 0.07;
      g.fillStyle = r() > 0.5 ? '#7d8a56' : '#4f5b39';
      g.beginPath();
      g.ellipse(x, y, rx, ry, r() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    /* Un ruisseau en travers du champ. */
    g.strokeStyle = 'rgba(96,126,140,.55)';
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(-10, c.height * 0.52);
    for (var t = 0; t <= 1.01; t += 0.1) {
      g.lineTo(t * c.width, c.height * (0.5 + Math.sin(t * 5.5) * 0.035));
    }
    g.stroke();

    /* Bosquets : un tronc, une masse de feuillage. */
    function arbre(ax, ay, taille) {
      g.fillStyle = 'rgba(28,34,20,.35)';
      g.beginPath();
      g.ellipse(ax + taille * 0.35, ay + taille * 0.3, taille * 0.9, taille * 0.45, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#3c4a28';
      g.beginPath();
      g.arc(ax, ay, taille, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#49592f';
      g.beginPath();
      g.arc(ax - taille * 0.25, ay - taille * 0.28, taille * 0.62, 0, Math.PI * 2);
      g.fill();
    }

    for (var b = 0; b < 14; b++) {
      var bx = r() * c.width, by = r() * c.height;
      /* On dégage le centre du champ pour ne pas gêner la manœuvre. */
      if (by > c.height * 0.28 && by < c.height * 0.72 && bx > c.width * 0.12 && bx < c.width * 0.88) continue;
      var n = 3 + Math.floor(r() * 6);
      for (var k = 0; k < n; k++) {
        arbre(bx + (r() - 0.5) * 70, by + (r() - 0.5) * 50, 7 + r() * 6);
      }
    }

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

    var avant = u.angle;
    this.fumer(
      u.x + Math.cos(avant) * u.profondeur * 0.6,
      u.y + Math.sin(avant) * u.profondeur * 0.6,
      artillerie ? 26 : 15,
      artillerie ? 5 : 3
    );
    if (artillerie) this.fumer(v.x + (this.alea() - 0.5) * u.largeur, v.y, 20, 2);
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

  Bataille.prototype.fumer = function (x, y, taille, n) {
    if (this.fumees.length > 220) return;
    for (var i = 0; i < n; i++) {
      this.fumees.push({
        x: x + (this.alea() - 0.5) * taille,
        y: y + (this.alea() - 0.5) * taille,
        r: taille * (0.5 + this.alea() * 0.6),
        vie: 1,
        vy: -4 - this.alea() * 8,
        vx: (this.alea() - 0.5) * 8
      });
    }
  };

  Bataille.prototype.majFumees = function (dt) {
    for (var i = this.fumees.length - 1; i >= 0; i--) {
      var f = this.fumees[i];
      f.vie -= dt * 0.5;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.r += 14 * dt;
      if (f.vie <= 0) this.fumees.splice(i, 1);
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

  Bataille.prototype.dessinerUnite = function (g, u) {
    if (!u.estVivante()) return;
    var D_ = JEU.D.FACTIONS[u.faction] || { couleur: '#888', clair: '#bbb' };
    var couleur = u.camp === 'joueur' ? D_.couleur : D_.couleur;
    var clair = D_.clair;

    g.save();
    g.translate(u.x, u.y);
    g.rotate(u.angle + Math.PI / 2);      // les places sont définies « vers le haut »

    if (u.selectionne) {
      g.strokeStyle = '#e8c96a';
      g.lineWidth = 2.5 / this.cam.zoom;
      g.strokeRect(-u.largeur / 2 - 7, -u.profondeur / 2 - 7, u.largeur + 14, u.profondeur + 14);
    }

    /* Ombre portée de la troupe. */
    g.fillStyle = 'rgba(20,24,16,.28)';
    g.fillRect(-u.largeur / 2 + 2, -u.profondeur / 2 + 3, u.largeur, u.profondeur);

    var taille = u.def.cat === 'cav' ? 4.4 : 3.4;
    var deroute = u.etat === 'déroute';

    for (var i = 0; i < u.vivants.length; i++) {
      var p = u.places[u.vivants[i]];
      var dx = deroute ? Math.sin((this.temps * 4) + u.vivants[i]) * 2.6 : 0;
      g.fillStyle = (u.vivants[i] % 5 === 0) ? clair : couleur;
      g.fillRect(p[0] - taille / 2 + dx, p[1] - taille / 2, taille, taille);
    }

    /* Canons : on matérialise les pièces devant les servants. */
    if (u.def.cat === 'art') {
      g.fillStyle = '#2c2a26';
      var n = Math.max(1, Math.round(u.hommes / 6));
      for (var k = 0; k < n; k++) {
        var cx = (k - (n - 1) / 2) * 22;
        g.fillRect(cx - 5, -u.profondeur / 2 - 9, 10, 7);
      }
    }

    g.restore();

    /* Fanion + barre de moral, toujours à l'endroit. */
    var haut = u.y - u.profondeur / 2 - 20;
    g.save();
    g.translate(u.x, haut);
    var ech = 1 / Math.max(this.cam.zoom, 0.55);
    g.scale(ech, ech);

    g.strokeStyle = 'rgba(15,20,12,.65)';
    g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(0, 2); g.lineTo(0, 16); g.stroke();

    g.fillStyle = deroute ? '#6b6b6b' : couleur;
    g.strokeStyle = 'rgba(12,16,10,.75)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, 2); g.lineTo(17, 6); g.lineTo(0, 11); g.closePath();
    g.fill(); g.stroke();

    var largeurBarre = 26;
    g.fillStyle = 'rgba(12,16,10,.6)';
    g.fillRect(-largeurBarre / 2, -6, largeurBarre, 3.6);
    var part = U.borne(u.moral / u.moralMax, 0, 1);
    g.fillStyle = deroute ? '#9c4b3f' : (part > 0.55 ? '#7fb069' : (part > 0.28 ? '#d8a740' : '#c05a45'));
    g.fillRect(-largeurBarre / 2, -6, largeurBarre * part, 3.6);
    g.restore();
  };

  Bataille.prototype.dessinerFumees = function (g) {
    for (var i = 0; i < this.fumees.length; i++) {
      var f = this.fumees[i];
      g.globalAlpha = U.borne(f.vie, 0, 1) * 0.42;
      g.fillStyle = '#e6e6df';
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
