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

  /* Parchemin + mers, rendus une fois. */
  Carte.prototype.dessinerFond = function () {
    var c = document.createElement('canvas');
    c.width = D.LARGEUR_CARTE;
    c.height = D.HAUTEUR_CARTE;
    var g = c.getContext('2d');
    var r = U.generateur(4242);

    g.fillStyle = '#9fb6bd';
    g.fillRect(0, 0, c.width, c.height);

    /* Veinage de la mer. */
    g.strokeStyle = 'rgba(255,255,255,.16)';
    g.lineWidth = 1.2;
    for (var i = 0; i < 90; i++) {
      var y = r() * c.height;
      g.beginPath();
      g.moveTo(r() * c.width, y);
      g.bezierCurveTo(r() * c.width, y + 14, r() * c.width, y - 14, r() * c.width, y);
      g.stroke();
    }

    /* Grain de papier. */
    for (var j = 0; j < 2600; j++) {
      g.globalAlpha = 0.05 + r() * 0.06;
      g.fillStyle = r() > 0.5 ? '#f3e6c8' : '#6d7f86';
      g.fillRect(r() * c.width, r() * c.height, 2, 2);
    }
    g.globalAlpha = 1;
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
          var m = self.versMonde(p.x, p.y);
          var prov = self.provinceEn(m.x, m.y);
          self.surProvince(prov ? prov.id : null);
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

    g.fillStyle = '#8ea6ae';
    g.fillRect(-200, -200, D.LARGEUR_CARTE + 400, D.HAUTEUR_CARTE + 400);
    g.drawImage(this.fond, 0, 0);

    var self = this;

    /* Provinces. */
    D.PROVINCES.forEach(function (p) {
      var prop = etat.provinces[p.id];
      var f = D.FACTIONS[prop.faction];
      g.beginPath();
      p.poly.forEach(function (pt, i) { i ? g.lineTo(pt[0], pt[1]) : g.moveTo(pt[0], pt[1]); });
      g.closePath();

      g.fillStyle = f.couleur;
      g.fill();
      /* Voile clair pour garder la teinte parchemin. */
      g.fillStyle = 'rgba(243,232,205,.24)';
      g.fill();

      if (self.surlignees[p.id]) {
        g.fillStyle = 'rgba(232,201,106,' + (0.22 + Math.sin(self.pulsation * 2) * 0.10) + ')';
        g.fill();
      }

      g.lineJoin = 'round';
      g.strokeStyle = 'rgba(58,44,26,.75)';
      g.lineWidth = 1.6;
      g.stroke();

      if (self.selection === p.id) {
        g.strokeStyle = '#e8c96a';
        g.lineWidth = 3.4;
        g.stroke();
      }
    });

    /* Marqueurs : capitale, ville, armée. */
    D.PROVINCES.forEach(function (p) { self.dessinerMarqueur(g, p); });

    g.restore();
  };

  Carte.prototype.dessinerMarqueur = function (g, p) {
    var etat = this.etat;
    var prop = etat.provinces[p.id];
    var f = D.FACTIONS[prop.faction];
    var armee = etat.armees.filter(function (a) { return a.province === p.id; })[0];
    var capitale = D.FACTIONS[prop.faction] && D.FACTIONS[prop.faction].capitale === p.id;

    var ech = 1 / Math.max(this.cam.zoom, 0.42);

    g.save();
    g.translate(p.cx, p.cy);
    g.scale(ech, ech);

    /* Nom de la ville. */
    g.font = '600 10px Georgia, serif';
    g.textAlign = 'center';
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(245,238,220,.85)';
    g.fillStyle = '#39301f';
    g.strokeText(p.ville, 0, 26);
    g.fillText(p.ville, 0, 26);

    if (capitale) {
      /* Étoile impériale pour la capitale. */
      g.fillStyle = '#e8c96a';
      g.strokeStyle = '#4a3a12';
      g.lineWidth = 1;
      g.beginPath();
      for (var i = 0; i < 10; i++) {
        var a = (Math.PI / 5) * i - Math.PI / 2;
        var r = i % 2 ? 3.4 : 7.6;
        i ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r - 14) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r - 14);
      }
      g.closePath();
      g.fill();
      g.stroke();
    }

    if (armee && armee.unites.length) {
      var hommes = armee.unites.reduce(function (s, u) { return s + u.hommes; }, 0);
      var joueur = armee.faction === etat.joueur;

      g.fillStyle = f.couleur;
      g.strokeStyle = joueur ? '#e8c96a' : 'rgba(30,24,14,.8)';
      g.lineWidth = joueur ? 2 : 1.2;
      g.beginPath();
      g.arc(0, 4, 10.5, 0, Math.PI * 2);
      g.fill();
      g.stroke();

      g.fillStyle = 'rgba(245,240,225,.95)';
      g.font = '700 9px Georgia, serif';
      g.fillText(Math.round(hommes / 100) / 10 + 'k', 0, 7.5);

      if (!armee.deplacee && joueur) {
        g.strokeStyle = 'rgba(232,201,106,' + (0.45 + Math.sin(this.pulsation * 2.4) * 0.35) + ')';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(0, 4, 14.5, 0, Math.PI * 2);
        g.stroke();
      }
    }

    g.restore();
  };

  JEU.Carte = {
    creer: function (config) { return new Carte(config); }
  };
})(window);
