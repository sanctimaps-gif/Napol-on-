/* Carte de campagne : parchemin, provinces, armées.
   Rendu au canevas, avec déplacement au doigt et pincement pour zoomer. */

(function (global) {
  'use strict';

  var JEU = global.JEU = global.JEU || {};
  var U = JEU.U;
  var D = JEU.D;

  function Carte(config) {
    this.toile = config.toile;
    this.ctx = this.toile.getContext('2d');
    this.etat = config.etat;
    this.surProvince = config.surProvince || function () {};

    this.cam = { x: D.LARGEUR_CARTE / 2, y: D.HAUTEUR_CARTE / 2, zoom: 1 };
    this.surlignees = {};
    this.selection = null;
    this.pulsation = 0;

    this.fond = this.dessinerFond();
    this.brancherEntrees();
    this.redimensionner();
    this.animer();
  }

  /* Le décor complet de la carte, peint une fois : mer, côtes, relief,
     forêts, fleuves. Les provinces ne sont qu'une teinte posée dessus. */
  Carte.prototype.dessinerFond = function () {
    var L = D.LARGEUR_CARTE, H = D.HAUTEUR_CARTE;
    var c = document.createElement('canvas');
    c.width = L;
    c.height = H;
    var g = c.getContext('2d');
    var r = U.generateur(4242);
    var bruit = JEU.Deco.bruit2D(2024);

    /* --- Masque des terres : l'union de toutes les provinces. C'est lui
       qui donne un vrai trait de côte plutôt que des polygones posés
       sur un fond bleu. --- */
    var masque = document.createElement('canvas');
    masque.width = L; masque.height = H;
    var gm = masque.getContext('2d');
    gm.fillStyle = '#fff';
    gm.strokeStyle = '#fff';
    gm.lineJoin = 'round';
    gm.lineCap = 'round';

    /* Les contours sont dessinés à la main et ne se touchent pas tout à
       fait : on relie d'abord les provinces frontalières par un isthme,
       pour que la mer ne s'infiltre pas au milieu des terres. Les
       liaisons maritimes, elles, restent de l'eau. */
    D.PROVINCES.forEach(function (p) {
      p.voisins.forEach(function (v) {
        if (p.mers[v]) return;
        var q = D.PROV[v];
        gm.lineWidth = 34;
        gm.beginPath();
        gm.moveTo(p.cx, p.cy);
        gm.lineTo(q.cx, q.cy);
        gm.stroke();
      });
    });

    D.PROVINCES.forEach(function (p) {
      gm.beginPath();
      p.poly.forEach(function (pt, i) { i ? gm.lineTo(pt[0], pt[1]) : gm.moveTo(pt[0], pt[1]); });
      gm.closePath();
      gm.fill();
      gm.lineWidth = 6;             /* léger épaississement des côtes */
      gm.stroke();
    });

    /* --- La mer --- */
    var mer = g.createLinearGradient(0, 0, L * 0.5, H);
    mer.addColorStop(0, '#5f8296');
    mer.addColorStop(0.5, '#6f93a4');
    mer.addColorStop(1, '#5a7c90');
    g.fillStyle = mer;
    g.fillRect(0, 0, L, H);

    for (var i = 0; i < 160; i++) {          /* veinage des flots */
      var vy = r() * H, vx = r() * L;
      g.strokeStyle = 'rgba(226,240,246,' + (0.05 + r() * 0.09) + ')';
      g.lineWidth = 1 + r();
      g.beginPath();
      g.moveTo(vx, vy);
      g.bezierCurveTo(vx + 30, vy + 7, vx + 60, vy - 7, vx + 95, vy);
      g.stroke();
    }

    /* --- Halo côtier : le masque redessiné de plus en plus flou donne
       les hauts-fonds autour des terres. --- */
    if (typeof g.filter === 'string') {
      [[22, 0.30], [13, 0.30], [6, 0.34]].forEach(function (pas) {
        g.save();
        g.filter = 'blur(' + pas[0] + 'px)';
        g.globalAlpha = pas[1];
        g.drawImage(masque, 0, 0);
        g.restore();
      });
      g.save();
      g.globalCompositeOperation = 'source-atop';
      g.restore();
    }

    /* --- Les terres, peintes à l'intérieur du masque --- */
    var terre = document.createElement('canvas');
    terre.width = L; terre.height = H;
    var gt = terre.getContext('2d');

    var sol = gt.createLinearGradient(0, 0, 0, H);
    sol.addColorStop(0, '#77864f');
    sol.addColorStop(0.4, '#8b9459');
    sol.addColorStop(0.75, '#9a9a5f');
    sol.addColorStop(1, '#888c52');
    gt.fillStyle = sol;
    gt.fillRect(0, 0, L, H);

    /* Relief, calculé sur une grille grossière puis agrandi. */
    var GR = 2;
    var rel = document.createElement('canvas');
    rel.width = Math.ceil(L / GR); rel.height = Math.ceil(H / GR);
    var grl = rel.getContext('2d');
    var img = grl.createImageData(rel.width, rel.height);
    var e = 0.028;
    for (var ry = 0; ry < rel.height; ry++) {
      for (var rx = 0; rx < rel.width; rx++) {
        var h0 = JEU.Deco.fbm(bruit, rx * e, ry * e, 5);
        var hx = JEU.Deco.fbm(bruit, (rx + 1) * e, ry * e, 5);
        var hy = JEU.Deco.fbm(bruit, rx * e, (ry + 1) * e, 5);
        var pente = ((h0 - hx) + (h0 - hy)) * 6;
        var o = (ry * rel.width + rx) * 4;
        if (pente > 0) {
          img.data[o] = 252; img.data[o + 1] = 248; img.data[o + 2] = 218;
          img.data[o + 3] = Math.min(140, pente * 320);
        } else {
          img.data[o] = 38; img.data[o + 1] = 38; img.data[o + 2] = 22;
          img.data[o + 3] = Math.min(150, -pente * 340);
        }
        /* Les hauteurs se teintent : montagnes ocre, plaines vertes. */
        if (h0 > 0.58) {
          img.data[o] = 172; img.data[o + 1] = 148; img.data[o + 2] = 104;
          img.data[o + 3] = Math.max(img.data[o + 3], Math.min(190, (h0 - 0.58) * 620));
        }
      }
    }
    grl.putImageData(img, 0, 0);
    gt.drawImage(rel, 0, 0, L, H);

    /* Fleuves d'abord : les forêts doivent pouvoir border leurs rives. */
    gt.lineCap = 'round';
    gt.lineJoin = 'round';
    for (var riv = 0; riv < 22; riv++) {
      var x = r() * L, y = r() * H;
      var cap = r() * Math.PI * 2;
      gt.strokeStyle = 'rgba(70,96,110,.35)';     /* lit encaissé */
      gt.lineWidth = 4.5;
      var pts = [[x, y]];
      for (var s = 0; s < 30; s++) {
        cap += (r() - 0.5) * 0.9;
        x += Math.cos(cap) * 9;
        y += Math.sin(cap) * 9;
        pts.push([x, y]);
      }
      gt.beginPath();
      pts.forEach(function (pt, i) { i ? gt.lineTo(pt[0], pt[1]) : gt.moveTo(pt[0], pt[1]); });
      gt.stroke();
      gt.strokeStyle = '#7ba3b8';
      gt.lineWidth = 1.8;
      gt.beginPath();
      pts.forEach(function (pt, i) { i ? gt.lineTo(pt[0], pt[1]) : gt.moveTo(pt[0], pt[1]); });
      gt.stroke();
    }

    /* Forêts : des grappes de couronnes sur les terres basses. */
    for (var f = 0; f < 520; f++) {
      var fx = r() * L, fy = r() * H;
      if (JEU.Deco.fbm(bruit, fx / GR * e, fy / GR * e, 5) > 0.56) continue;
      var n = 4 + Math.floor(r() * 6);
      for (var k = 0; k < n; k++) {
        var ax = fx + (r() - 0.5) * 24, ay = fy + (r() - 0.5) * 17, t = 2.2 + r() * 2.6;
        gt.fillStyle = 'rgba(26,36,18,.42)';
        gt.beginPath(); gt.ellipse(ax + t * 0.6, ay + t * 0.45, t * 1.15, t * 0.5, 0, 0, Math.PI * 2); gt.fill();
        gt.fillStyle = '#2c3d1c';
        gt.beginPath(); gt.arc(ax, ay, t, 0, Math.PI * 2); gt.fill();
        gt.fillStyle = '#41562a';
        gt.beginPath(); gt.arc(ax - t * 0.26, ay - t * 0.3, t * 0.66, 0, Math.PI * 2); gt.fill();
        gt.fillStyle = '#57703a';
        gt.beginPath(); gt.arc(ax - t * 0.4, ay - t * 0.44, t * 0.34, 0, Math.PI * 2); gt.fill();
      }
    }

    /* On ne garde des terres que ce qui tombe dans le masque. */
    gt.globalCompositeOperation = 'destination-in';
    gt.drawImage(masque, 0, 0);
    gt.globalCompositeOperation = 'source-over';

    g.drawImage(terre, 0, 0);

    /* Grain de papier ancien sur l'ensemble. */
    for (var j = 0; j < 4200; j++) {
      g.globalAlpha = 0.03 + r() * 0.05;
      g.fillStyle = r() > 0.5 ? '#f5ead0' : '#4a4736';
      g.fillRect(r() * L, r() * H, 2, 2);
    }
    g.globalAlpha = 1;

    this.masque = masque;
    return c;
  };

  Carte.prototype.brancherEntrees = function () {
    var self = this;
    var toile = this.toile;
    var pointeurs = {};
    var depart = null, aBouge = false, ecart = 0;

    function pos(e) {
      var r = toile.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function distance() {
      var k = Object.keys(pointeurs);
      if (k.length < 2) return 0;
      return U.dist(pointeurs[k[0]].x, pointeurs[k[0]].y, pointeurs[k[1]].x, pointeurs[k[1]].y);
    }

    this.gestes = {
      down: function (e) {
        toile.setPointerCapture && toile.setPointerCapture(e.pointerId);
        pointeurs[e.pointerId] = pos(e);
        var k = Object.keys(pointeurs);
        if (k.length === 1) {
          depart = { p: pointeurs[e.pointerId], cam: { x: self.cam.x, y: self.cam.y }, t: Date.now() };
          aBouge = false;
        } else if (k.length === 2) ecart = distance();
      },
      move: function (e) {
        if (!(e.pointerId in pointeurs)) return;
        pointeurs[e.pointerId] = pos(e);
        if (Object.keys(pointeurs).length >= 2) {
          var n = distance();
          if (ecart > 0) { self.zoomer(self.cam.zoom * (n / ecart)); ecart = n; }
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
        if (Object.keys(pointeurs).length < 2) ecart = 0;
        if (p && depart && !aBouge && Date.now() - depart.t < 600) {
          var mini = self.boiteMini;
          if (mini && p.x >= mini.x && p.x <= mini.x + mini.l &&
                      p.y >= mini.y && p.y <= mini.y + mini.h) {
            /* Toucher la minicarte déplace la vue, il ne choisit rien. */
            self.cam.x = (p.x - mini.x) / mini.ech;
            self.cam.y = (p.y - mini.y) / mini.ech;
            self.caler();
          } else {
            var m = self.versMonde(p.x, p.y);
            var prov = self.provinceEn(m.x, m.y);
            self.surProvince(prov ? prov.id : null);
          }
        }
        if (Object.keys(pointeurs).length === 0) depart = null;
      },
      annule: function (e) {
        delete pointeurs[e.pointerId];
        if (Object.keys(pointeurs).length === 0) { depart = null; ecart = 0; }
      }
    };

    toile.addEventListener('pointerdown', this.gestes.down);
    toile.addEventListener('pointermove', this.gestes.move);
    toile.addEventListener('pointerup', this.gestes.up);
    toile.addEventListener('pointercancel', this.gestes.annule);

    this.surRedim = function () { self.redimensionner(); };
    global.addEventListener('resize', this.surRedim);
    global.addEventListener('orientationchange', this.surRedim);

    /* La feuille du bas change de hauteur selon la province ouverte :
       on suit la boîte réelle du canevas. */
    if (global.ResizeObserver) {
      this.observateur = new ResizeObserver(this.surRedim);
      this.observateur.observe(toile);
    }
  };

  Carte.prototype.detruire = function () {
    this.arretee = true;
    if (this.trame) cancelAnimationFrame(this.trame);
    var t = this.toile;
    t.removeEventListener('pointerdown', this.gestes.down);
    t.removeEventListener('pointermove', this.gestes.move);
    t.removeEventListener('pointerup', this.gestes.up);
    t.removeEventListener('pointercancel', this.gestes.annule);
    global.removeEventListener('resize', this.surRedim);
    global.removeEventListener('orientationchange', this.surRedim);
    if (this.observateur) this.observateur.disconnect();
  };

  Carte.prototype.zoomer = function (z) {
    this.cam.zoom = U.borne(z, this.zoomMin || 0.3, 3);
    this.caler();
  };

  Carte.prototype.caler = function () {
    var vueL = this.toile.clientWidth / this.cam.zoom;
    var vueH = this.toile.clientHeight / this.cam.zoom;
    var minX = Math.min(D.LARGEUR_CARTE / 2, vueL / 2);
    var maxX = Math.max(D.LARGEUR_CARTE / 2, D.LARGEUR_CARTE - vueL / 2);
    var minY = Math.min(D.HAUTEUR_CARTE / 2, vueH / 2);
    var maxY = Math.max(D.HAUTEUR_CARTE / 2, D.HAUTEUR_CARTE - vueH / 2);
    this.cam.x = U.borne(this.cam.x, minX, maxX);
    this.cam.y = U.borne(this.cam.y, minY, maxY);
  };

  Carte.prototype.redimensionner = function () {
    var l = this.toile.clientWidth || 320;
    var h = this.toile.clientHeight || 240;
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var L = Math.round(l * dpr), H = Math.round(h * dpr);
    if (this.toile.width !== L || this.toile.height !== H) {
      this.toile.width = L;
      this.toile.height = H;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* On peut toujours dézoomer jusqu'à voir toute l'Europe… */
    this.zoomMin = Math.min(l / (D.LARGEUR_CARTE + 60), h / (D.HAUTEUR_CARTE + 60));
    if (!this.cadre) {
      /* …mais on ouvre sur une échelle lisible : la carte remplit la
         hauteur disponible, et l'on fait défiler d'est en ouest. */
      this.cam.zoom = U.borne(
        Math.max(l / D.LARGEUR_CARTE, h / D.HAUTEUR_CARTE), this.zoomMin, 1.3);
      this.cadre = true;
    }
    this.zoomer(this.cam.zoom);
  };

  Carte.prototype.versMonde = function (sx, sy) {
    return {
      x: (sx - this.toile.clientWidth / 2) / this.cam.zoom + this.cam.x,
      y: (sy - this.toile.clientHeight / 2) / this.cam.zoom + this.cam.y
    };
  };

  Carte.prototype.provinceEn = function (x, y) {
    for (var i = 0; i < D.PROVINCES.length; i++) {
      if (U.pointDansPolygone(x, y, D.PROVINCES[i].poly)) return D.PROVINCES[i];
    }
    return null;
  };

  Carte.prototype.centrerSur = function (id) {
    var p = D.PROV[id];
    if (!p) return;
    this.cam.x = p.cx;
    this.cam.y = p.cy;
    this.caler();
  };

  /* --- Rendu ---------------------------------------------------------- */

  Carte.prototype.animer = function () {
    var self = this;
    function trame() {
      if (self.arretee) return;
      self.pulsation += 0.04;
      self.dessiner();
      self.trame = requestAnimationFrame(trame);
    }
    this.trame = requestAnimationFrame(trame);
  };

  Carte.prototype.dessiner = function () {
    var g = this.ctx;
    var L = this.toile.clientWidth, H = this.toile.clientHeight;
    var etat = this.etat;

    g.clearRect(0, 0, L, H);
    g.save();
    g.translate(L / 2, H / 2);
    g.scale(this.cam.zoom, this.cam.zoom);
    g.translate(-this.cam.x, -this.cam.y);

    g.fillStyle = '#4d6b7d';
    g.fillRect(-400, -400, D.LARGEUR_CARTE + 800, D.HAUTEUR_CARTE + 800);
    g.drawImage(this.fond, 0, 0);

    var self = this;

    /* Teinte de faction : une glaçure, pas un aplat — le relief peint
       doit rester visible dessous. */
    D.PROVINCES.forEach(function (p) {
      var prop = etat.provinces[p.id];
      var f = D.FACTIONS[prop.faction];
      g.save();
      g.beginPath();
      p.poly.forEach(function (pt, i) { i ? g.lineTo(pt[0], pt[1]) : g.moveTo(pt[0], pt[1]); });
      g.closePath();
      g.clip();

      /* Deux passes : une glaçure qui garde le relief, puis un voile
         coloré qui rend l'appartenance lisible d'un coup d'œil. */
      g.globalCompositeOperation = 'multiply';
      g.globalAlpha = 0.5;
      g.fillStyle = f.couleur;
      g.fillRect(p.cx - 400, p.cy - 400, 800, 800);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 0.16;
      g.fillStyle = f.clair;
      g.fillRect(p.cx - 400, p.cy - 400, 800, 800);
      g.restore();
    });

    /* Frontières, puis surlignages. */
    D.PROVINCES.forEach(function (p) {
      g.beginPath();
      p.poly.forEach(function (pt, i) { i ? g.lineTo(pt[0], pt[1]) : g.moveTo(pt[0], pt[1]); });
      g.closePath();
      g.lineJoin = 'round';
      g.strokeStyle = 'rgba(46,34,18,.55)';
      g.lineWidth = 2.4;
      g.stroke();
      g.strokeStyle = 'rgba(245,232,200,.28)';
      g.lineWidth = 0.9;
      g.stroke();

      if (self.surlignees[p.id]) {
        g.fillStyle = 'rgba(240,213,133,' + (0.20 + Math.sin(self.pulsation * 2) * 0.12) + ')';
        g.fill();
        g.strokeStyle = '#f0d585';
        g.lineWidth = 2.6;
        g.stroke();
      }
      if (self.selection === p.id) {
        g.strokeStyle = '#f0d585';
        g.lineWidth = 3.4;
        g.stroke();
      }
    });

    /* Armées d'abord, plaques ensuite : les noms doivent rester lisibles. */
    D.PROVINCES.forEach(function (p) { self.dessinerArmee(g, p); });

    /* Les plaques se disputent la place : on sert d'abord la province
       ouverte, puis les capitales, puis le reste, et l'on écarte celles
       qui recouvriraient une plaque déjà posée. */
    /* La minicarte occupe un coin de l'écran : on interdit d'avance cet
       espace aux plaques, en le ramenant en coordonnées de carte. */
    this.boitesPlaques = [];
    var mini = this.boiteMini;
    if (mini) {
      var hg = this.versMonde(mini.x - 6, mini.y - 6);
      var bd = this.versMonde(mini.x + mini.l + 6, mini.y + mini.h + 6);
      this.boitesPlaques.push({ x: hg.x, y: hg.y, l: bd.x - hg.x, h: bd.y - hg.y });
    }

    var ordre = D.PROVINCES.slice().sort(function (a, b) {
      return rangPlaque(etat, self.selection, a) - rangPlaque(etat, self.selection, b);
    });
    ordre.forEach(function (p) { self.dessinerPlaque(g, p); });

    g.restore();
    this.dessinerMiniCarte(g, L, H);
  };

  /* Priorité d'affichage d'une plaque : la province ouverte, puis les
     capitales, puis les provinces avec une armée, puis le reste. */
  function rangPlaque(etat, selection, p) {
    var prop = etat.provinces[p.id];
    if (selection === p.id) return 0;
    if (D.FACTIONS[prop.faction].capitale === p.id) return 1;
    for (var i = 0; i < etat.armees.length; i++) {
      if (etat.armees[i].province === p.id) return 2;
    }
    return 3;
  }

  /* Plaque de nom : « Paris (France) », teintée selon qu'il s'agit de
     nous, d'une puissance hostile ou d'un tiers. */
  Carte.prototype.dessinerPlaque = function (g, p) {
    var etat = this.etat;
    var prop = etat.provinces[p.id];
    var capitale = D.FACTIONS[prop.faction].capitale === p.id;
    var ech = 1 / Math.max(this.cam.zoom, 0.45);

    var taille = (capitale ? 12 : 10.5);
    var texte = p.ville + ' (' + D.FACTIONS[prop.faction].nom + ')';

    /* Mesure avant de peindre, pour savoir si la place est libre. */
    g.save();
    g.font = '500 ' + taille + 'px Cinzel, Georgia, serif';
    var l = (g.measureText(texte).width + taille * 2.49) * ech;
    var h = taille * 1.72 * ech;
    g.restore();

    var x = p.cx, y = p.cy - 16 * ech;
    var boite = { x: x - l / 2, y: y - h / 2, l: l, h: h };

    for (var i = 0; i < this.boitesPlaques.length; i++) {
      var b = this.boitesPlaques[i];
      if (boite.x < b.x + b.l && boite.x + boite.l > b.x &&
          boite.y < b.y + b.h && boite.y + boite.h > b.y) {
        return;                       /* la place est prise */
      }
    }
    this.boitesPlaques.push(boite);

    g.save();
    g.translate(x, y);
    g.scale(ech, ech);
    JEU.Deco.plaque(g, 0, 0, texte, {
      teinte: prop.faction === etat.joueur ? 'nous' : (capitale ? 'ennemi' : 'autre'),
      taille: taille
    });
    g.restore();
  };

  /* Marqueur d'armée : un porte-drapeau planté sur la province. */
  Carte.prototype.dessinerArmee = function (g, p) {
    var etat = this.etat;
    var armee = etat.armees.filter(function (a) { return a.province === p.id; })[0];
    if (!armee || !armee.unites.length) return;

    var f = D.FACTIONS[armee.faction];
    var joueur = armee.faction === etat.joueur;
    var hommes = armee.unites.reduce(function (s, u) { return s + u.hommes; }, 0);
    var ech = 1 / Math.max(this.cam.zoom, 0.45);

    g.save();
    g.translate(p.cx, p.cy + 14 * ech);
    g.scale(ech, ech);

    /* Une armée du joueur qui n'a pas encore marché bat du pavillon. */
    if (joueur && !armee.deplacee) {
      var halo = 0.30 + Math.sin(this.pulsation * 2.4) * 0.22;
      g.fillStyle = 'rgba(240,213,133,' + halo + ')';
      g.beginPath();
      g.ellipse(0, 4, 20, 9, 0, 0, Math.PI * 2);
      g.fill();
    }

    g.fillStyle = 'rgba(24,20,10,.4)';                 /* ombre au sol */
    g.beginPath();
    g.ellipse(1, 4, 11, 4, 0, 0, Math.PI * 2);
    g.fill();

    /* La figurine du chef, puis son drapeau. */
    var sprite = JEU.Deco.spriteSoldat('cav', f.couleur, f.clair);
    var s = 2.1;
    g.drawImage(sprite, -sprite.mondeL * s / 2, -sprite.mondeH * s + 5,
      sprite.mondeL * s, sprite.mondeH * s);
    JEU.Deco.drapeau(g, 8, -6, 15, f.couleur, f.clair, this.pulsation * 1.6);

    /* Effectif, sur une pastille sombre bordée d'or. */
    var texte = U.nb(hommes);
    g.font = '700 10px Cinzel, Georgia, serif';
    var l = g.measureText(texte).width + 12;
    JEU.Deco.cheminArrondi(g, -l / 2, 6, l, 14, 7);
    g.fillStyle = 'rgba(12,20,36,.92)';
    g.fill();
    g.strokeStyle = joueur ? JEU.Deco.OR_VIF : 'rgba(200,163,73,.5)';
    g.lineWidth = 1.2;
    g.stroke();
    g.fillStyle = '#f4ecd8';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(texte, 0, 13.6);

    g.restore();
  };

  /* Minicarte : les factions en aplats, plus le cadre de la vue. */
  Carte.prototype.dessinerMiniCarte = function (g, L, H) {
    var etat = this.etat;
    var large = Math.min(132, L * 0.36);
    var ech = large / D.LARGEUR_CARTE;
    var haut = D.HAUTEUR_CARTE * ech;
    var x = L - large - 10, y = 10;

    g.save();
    g.translate(x, y);

    g.fillStyle = 'rgba(10,18,32,.9)';
    JEU.Deco.cheminArrondi(g, -3, -3, large + 6, haut + 6, 3);
    g.fill();

    g.save();
    JEU.Deco.cheminArrondi(g, 0, 0, large, haut, 2);
    g.clip();
    g.fillStyle = '#e8dcc0';
    g.fillRect(0, 0, large, haut);

    D.PROVINCES.forEach(function (p) {
      g.beginPath();
      p.poly.forEach(function (pt, i) {
        var mx = pt[0] * ech, my = pt[1] * ech;
        i ? g.lineTo(mx, my) : g.moveTo(mx, my);
      });
      g.closePath();
      /* Rempli *et* contourné de la même teinte : à cette échelle les
         contours ne se touchent pas, et le trait referme les interstices. */
      g.fillStyle = g.strokeStyle = D.FACTIONS[etat.provinces[p.id].faction].couleur;
      g.lineWidth = 2.4;
      g.lineJoin = 'round';
      g.fill();
      g.stroke();
    });

    /* Rectangle de la vue courante. */
    var vueL = (L / this.cam.zoom) * ech;
    var vueH = (H / this.cam.zoom) * ech;
    g.strokeStyle = 'rgba(255,255,255,.9)';
    g.lineWidth = 1.4;
    g.strokeRect(this.cam.x * ech - vueL / 2, this.cam.y * ech - vueH / 2, vueL, vueH);
    g.restore();

    JEU.Deco.cadre(g, 0, 0, large, haut, 2, 2.4);
    g.restore();

    this.boiteMini = { x: x, y: y, l: large, h: haut, ech: ech };
  };

  JEU.Carte = {
    creer: function (config) { return new Carte(config); }
  };
})(window);
