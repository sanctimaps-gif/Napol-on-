/* Carte de campagne.

   Le décor — mers, côtes, relief, forêts, fleuves, massifs — est peint
   une fois dans un canevas hors écran. Les provinces ne sont pas des
   polygones posés dessus : elles viennent de la partition du continent
   (partition.js), et leur appartenance est une glaçure de couleur
   appliquée par-dessus le terrain. */

(function (global) {
  'use strict';

  var JEU = global.JEU = global.JEU || {};
  var U = JEU.U;
  var D = JEU.D;
  var Geo = JEU.Geo;
  var Deco = JEU.Deco;

  function Carte(config) {
    this.toile = config.toile;
    this.ctx = this.toile.getContext('2d');
    this.etat = config.etat;
    this.surProvince = config.surProvince || function () {};

    this.part = JEU.Partition.obtenir();
    this.cam = { x: D.LARGEUR_CARTE / 2, y: D.HAUTEUR_CARTE / 2, zoom: 1 };
    this.surlignees = {};
    this.selection = null;
    this.pulsation = 0;

    this.fond = this.peindreDecor();
    this.brancherEntrees();
    this.redimensionner();
    this.animer();
  }

  /* ------------------------------------------------------------------ */
  /* Le décor                                                            */
  /* ------------------------------------------------------------------ */

  Carte.prototype.peindreDecor = function () {
    var L = D.LARGEUR_CARTE, H = D.HAUTEUR_CARTE;
    var part = this.part;
    var c = document.createElement('canvas');
    c.width = L; c.height = H;
    var g = c.getContext('2d');
    var r = U.generateur(4242);
    var bruit = Deco.bruit2D(2024);
    var masque = part.masqueTerres;

    /* --- La mer --- */
    var mer = g.createLinearGradient(0, 0, L * 0.4, H);
    mer.addColorStop(0, '#41677e');
    mer.addColorStop(0.45, '#4e7791');
    mer.addColorStop(1, '#3e6579');
    g.fillStyle = mer;
    g.fillRect(0, 0, L, H);

    for (var i = 0; i < 260; i++) {              /* houle */
      var vx = r() * L, vy = r() * H;
      g.strokeStyle = 'rgba(206,230,240,' + (0.04 + r() * 0.07) + ')';
      g.lineWidth = 0.8 + r();
      g.beginPath();
      g.moveTo(vx, vy);
      g.bezierCurveTo(vx + 26, vy + 6, vx + 54, vy - 6, vx + 88, vy);
      g.stroke();
    }

    /* --- Hauts-fonds : le trait de côte redessiné de plus en plus flou --- */
    if (typeof g.filter === 'string') {
      [[26, 0.22], [15, 0.24], [7, 0.28], [3, 0.30]].forEach(function (pas) {
        g.save();
        g.filter = 'blur(' + pas[0] + 'px)';
        g.globalAlpha = pas[1];
        g.drawImage(masque, 0, 0);
        g.restore();
      });
    }

    /* --- Les terres, peintes puis découpées au trait de côte --- */
    var terre = document.createElement('canvas');
    terre.width = L; terre.height = H;
    var gt = terre.getContext('2d');

    var sol = gt.createLinearGradient(0, 0, 0, H);
    sol.addColorStop(0, '#6f7c4c');
    sol.addColorStop(0.35, '#87904f');
    sol.addColorStop(0.7, '#9a9a5c');
    sol.addColorStop(1, '#8e8c4f');
    gt.fillStyle = sol;
    gt.fillRect(0, 0, L, H);

    /* Relief, calculé sur une grille grossière puis agrandi. */
    var GR = 2;
    var rel = document.createElement('canvas');
    rel.width = Math.ceil(L / GR); rel.height = Math.ceil(H / GR);
    var grl = rel.getContext('2d');
    var img = grl.createImageData(rel.width, rel.height);
    var e = 0.026;
    for (var ry = 0; ry < rel.height; ry++) {
      for (var rx = 0; rx < rel.width; rx++) {
        var h0 = Deco.fbm(bruit, rx * e, ry * e, 5);
        var hx = Deco.fbm(bruit, (rx + 1) * e, ry * e, 5);
        var hy = Deco.fbm(bruit, rx * e, (ry + 1) * e, 5);
        var pente = ((h0 - hx) + (h0 - hy)) * 6;
        var o = (ry * rel.width + rx) * 4;
        if (pente > 0) {
          img.data[o] = 250; img.data[o + 1] = 246; img.data[o + 2] = 216;
          img.data[o + 3] = Math.min(120, pente * 280);
        } else {
          img.data[o] = 42; img.data[o + 1] = 40; img.data[o + 2] = 24;
          img.data[o + 3] = Math.min(130, -pente * 300);
        }
      }
    }
    grl.putImageData(img, 0, 0);
    gt.drawImage(rel, 0, 0, L, H);

    this.peindreFleuves(gt);
    this.peindreForets(gt, r, bruit, e / GR);
    this.peindreMassifs(gt);

    /* On ne garde des terres que ce qui tombe dans le trait de côte. */
    gt.globalCompositeOperation = 'destination-in';
    gt.drawImage(masque, 0, 0);
    gt.globalCompositeOperation = 'source-over';
    g.drawImage(terre, 0, 0);

    /* --- Le trait de côte --- */
    g.lineJoin = 'round';
    Geo.TERRES.forEach(function (t) {
      g.beginPath();
      t.poly.forEach(function (pt, k) { k ? g.lineTo(pt[0], pt[1]) : g.moveTo(pt[0], pt[1]); });
      g.closePath();
      g.strokeStyle = 'rgba(30,24,12,.55)';
      g.lineWidth = 1.6;
      g.stroke();
      t.trous.forEach(function (trou) {
        g.beginPath();
        trou.forEach(function (pt, k) { k ? g.lineTo(pt[0], pt[1]) : g.moveTo(pt[0], pt[1]); });
        g.closePath();
        g.stroke();
      });
    });

    /* --- Grain de papier ancien --- */
    for (var j = 0; j < 5200; j++) {
      g.globalAlpha = 0.03 + r() * 0.05;
      g.fillStyle = r() > 0.5 ? '#f5ead0' : '#42402e';
      g.fillRect(r() * L, r() * H, 2, 2);
    }
    g.globalAlpha = 1;

    return c;
  };

  /* Les grands fleuves, à leur cours réel. */
  Carte.prototype.peindreFleuves = function (g) {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    Geo.FLEUVES.forEach(function (f) {
      var pts = Geo.projeter(f.pts);
      function tracer(largeur, style) {
        g.strokeStyle = style;
        g.lineWidth = largeur;
        g.beginPath();
        /* Courbe passant par les points, pour un cours qui serpente. */
        g.moveTo(pts[0][0], pts[0][1]);
        for (var i = 0; i < pts.length - 1; i++) {
          var mx = (pts[i][0] + pts[i + 1][0]) / 2;
          var my = (pts[i][1] + pts[i + 1][1]) / 2;
          g.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
        }
        g.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
        g.stroke();
      }
      tracer(f.rang * 2.2 + 3, 'rgba(66,84,58,.45)');     /* vallée */
      tracer(f.rang * 0.9 + 0.8, '#4e7f95');              /* eau */
      tracer(f.rang * 0.4 + 0.3, '#86b3c6');              /* reflet */
    });
  };

  /* Les forêts, sur les terres basses. */
  Carte.prototype.peindreForets = function (g, r, bruit, ech) {
    var L = D.LARGEUR_CARTE, H = D.HAUTEUR_CARTE;
    for (var f = 0; f < 900; f++) {
      var fx = r() * L, fy = r() * H;
      if (Deco.fbm(bruit, fx * ech, fy * ech, 5) > 0.54) continue;
      var n = 4 + Math.floor(r() * 7);
      for (var k = 0; k < n; k++) {
        var ax = fx + (r() - 0.5) * 26, ay = fy + (r() - 0.5) * 18, t = 2.1 + r() * 2.4;
        g.fillStyle = 'rgba(26,36,18,.4)';
        g.beginPath(); g.ellipse(ax + t * 0.6, ay + t * 0.45, t * 1.1, t * 0.48, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#2b3b1b';
        g.beginPath(); g.arc(ax, ay, t, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#3f5429';
        g.beginPath(); g.arc(ax - t * 0.26, ay - t * 0.3, t * 0.64, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#556e38';
        g.beginPath(); g.arc(ax - t * 0.4, ay - t * 0.44, t * 0.32, 0, Math.PI * 2); g.fill();
      }
    }
  };

  /* Les massifs : de petits reliefs alignés le long des chaînes réelles. */
  Carte.prototype.peindreMassifs = function (g) {
    Geo.MASSIFS.forEach(function (m) {
      var pts = Geo.projeter(m.pts);
      for (var i = 0; i < pts.length - 1; i++) {
        var a = pts[i], b = pts[i + 1];
        var d = U.dist(a[0], a[1], b[0], b[1]);
        var pas = 9;
        var n = Math.max(1, Math.round(d / pas));
        for (var k = 0; k <= n; k++) {
          var t = k / n;
          var x = a[0] + (b[0] - a[0]) * t;
          var y = a[1] + (b[1] - a[1]) * t;
          /* On étale la chaîne sur quelques rangs, pour lui donner du corps. */
          for (var rang = -1; rang <= 1; rang++) {
            var dx = x + rang * 5 + (k % 2) * 3;
            var dy = y + rang * 6 + ((k + rang) % 2) * 2;
            var taille = 5.5 - Math.abs(rang) * 1.4;
            g.fillStyle = 'rgba(38,32,18,.4)';        /* ombre */
            g.beginPath();
            g.moveTo(dx - taille, dy + taille * 0.55);
            g.lineTo(dx + taille * 1.3, dy + taille * 0.55);
            g.lineTo(dx + taille * 0.3, dy - taille * 0.9);
            g.closePath();
            g.fill();
            g.fillStyle = '#8e7f5e';                  /* versant éclairé */
            g.beginPath();
            g.moveTo(dx - taille, dy + taille * 0.5);
            g.lineTo(dx, dy + taille * 0.5);
            g.lineTo(dx, dy - taille);
            g.closePath();
            g.fill();
            g.fillStyle = '#5f5539';                  /* versant à l'ombre */
            g.beginPath();
            g.moveTo(dx, dy + taille * 0.5);
            g.lineTo(dx + taille, dy + taille * 0.5);
            g.lineTo(dx, dy - taille);
            g.closePath();
            g.fill();
            g.fillStyle = 'rgba(246,244,230,.75)';    /* neige au sommet */
            g.beginPath();
            g.moveTo(dx - taille * 0.3, dy - taille * 0.45);
            g.lineTo(dx + taille * 0.3, dy - taille * 0.45);
            g.lineTo(dx, dy - taille);
            g.closePath();
            g.fill();
          }
        }
      }
    });
  };

  /* ------------------------------------------------------------------ */
  /* Calque des appartenances                                            */
  /* ------------------------------------------------------------------ */

  /* Une image où chaque point de terre porte la couleur de son maître.
     Elle n'est refaite qu'au changement de propriétaire — pas à chaque
     image, ce qui coûterait un million d'écritures soixante fois par
     seconde. */
  Carte.prototype.majTeintes = function () {
    var etat = this.etat;
    var signature = D.PROVINCES.map(function (p) { return etat.provinces[p.id].faction; }).join('');
    if (this.signatureTeintes === signature) return;
    this.signatureTeintes = signature;

    var part = this.part, L = part.L, H = part.H;
    if (!this.teintes) {
      this.teintes = document.createElement('canvas');
      this.teintes.width = L;
      this.teintes.height = H;
    }
    var g = this.teintes.getContext('2d');
    var img = g.createImageData(L, H);

    /* Couleur de chaque province, décomposée une fois. */
    var rouges = [], verts = [], bleus = [];
    D.PROVINCES.forEach(function (p, i) {
      var hex = D.FACTIONS[etat.provinces[p.id].faction].couleur;
      rouges[i] = parseInt(hex.substr(1, 2), 16);
      verts[i] = parseInt(hex.substr(3, 2), 16);
      bleus[i] = parseInt(hex.substr(5, 2), 16);
    });

    var src = part.provinceDe, AUCUNE = part.AUCUNE;
    for (var o = 0, n = L * H; o < n; o++) {
      var p = src[o];
      if (p === AUCUNE) continue;
      var q = o * 4;
      img.data[q] = rouges[p];
      img.data[q + 1] = verts[p];
      img.data[q + 2] = bleus[p];
      img.data[q + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.miniSale = true;
  };

  /* Calque doré des provinces mises en avant, refait seulement quand la
     liste change. */
  Carte.prototype.majSurbrillance = function () {
    var cles = Object.keys(this.surlignees).sort().join(',') + '|' + this.selection;
    if (this.signatureSurbrillance === cles) return;
    this.signatureSurbrillance = cles;

    var part = this.part, L = part.L, H = part.H;
    if (!this.halo) {
      this.halo = document.createElement('canvas');
      this.halo.width = L; this.halo.height = H;
    }
    var g = this.halo.getContext('2d');
    g.clearRect(0, 0, L, H);

    var actives = {};
    var self = this;
    var aucune = true;
    D.PROVINCES.forEach(function (p, i) {
      if (self.surlignees[p.id]) { actives[i] = 1; aucune = false; }
      else if (self.selection === p.id) { actives[i] = 2; aucune = false; }
    });
    if (aucune) return;

    var img = g.createImageData(L, H);
    var src = part.provinceDe;
    for (var o = 0, n = L * H; o < n; o++) {
      var a = actives[src[o]];
      if (!a) continue;
      var q = o * 4;
      img.data[q] = 240; img.data[q + 1] = 213; img.data[q + 2] = 133;
      img.data[q + 3] = a === 1 ? 92 : 58;
    }
    g.putImageData(img, 0, 0);
  };

  /* ------------------------------------------------------------------ */
  /* Entrées                                                             */
  /* ------------------------------------------------------------------ */

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

    this.zoomMin = Math.min(l / (D.LARGEUR_CARTE + 60), h / (D.HAUTEUR_CARTE + 60));
    if (!this.cadre) {
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

  /* La province sous un point : une simple lecture dans la partition. */
  Carte.prototype.provinceEn = function (x, y) {
    var part = this.part;
    var ix = Math.round(x), iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= part.L || iy >= part.H) return null;
    var p = part.provinceDe[iy * part.L + ix];
    return p === part.AUCUNE ? null : D.PROVINCES[p];
  };

  Carte.prototype.centrerSur = function (id) {
    var p = D.PROV[id];
    if (!p) return;
    this.cam.x = p.cx;
    this.cam.y = p.cy;
    this.caler();
  };

  /* ------------------------------------------------------------------ */
  /* Rendu                                                               */
  /* ------------------------------------------------------------------ */

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
    var self = this;

    this.majTeintes();
    this.majSurbrillance();

    g.clearRect(0, 0, L, H);
    g.fillStyle = '#31536a';
    g.fillRect(0, 0, L, H);

    g.save();
    g.translate(L / 2, H / 2);
    g.scale(this.cam.zoom, this.cam.zoom);
    g.translate(-this.cam.x, -this.cam.y);

    g.imageSmoothingEnabled = true;
    g.drawImage(this.fond, 0, 0);

    /* Appartenance : une glaçure, puis un voile clair pour la saturation. */
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = 0.5;
    g.drawImage(this.teintes, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 0.12;
    g.drawImage(this.teintes, 0, 0);
    g.globalAlpha = 1;

    g.drawImage(this.part.bords, 0, 0);

    if (this.halo) {
      g.globalAlpha = 0.6 + Math.sin(this.pulsation * 2) * 0.3;
      g.drawImage(this.halo, 0, 0);
      g.globalAlpha = 1;
    }

    /* Routes maritimes : un pointillé entre les ports reliés. */
    this.dessinerRoutes(g);

    D.PROVINCES.forEach(function (p) { self.dessinerArmee(g, p); });

    /* Les plaques se disputent la place : on sert d'abord la province
       ouverte, puis les capitales, puis le reste, et l'on écarte celles
       qui recouvriraient une plaque déjà posée. */
    this.boitesPlaques = [];
    var mini = this.boiteMini;
    if (mini) {
      var hg = this.versMonde(mini.x - 6, mini.y - 6);
      var bd = this.versMonde(mini.x + mini.l + 6, mini.y + mini.h + 6);
      this.boitesPlaques.push({ x: hg.x, y: hg.y, l: bd.x - hg.x, h: bd.y - hg.y });
    }
    D.PROVINCES.slice().sort(function (a, b) {
      return rangPlaque(etat, self.selection, a) - rangPlaque(etat, self.selection, b);
    }).forEach(function (p) { self.dessinerPlaque(g, p); });

    g.restore();
    this.dessinerMiniCarte(g, L, H);
  };

  /* Liaisons maritimes, visibles seulement de près. */
  Carte.prototype.dessinerRoutes = function (g) {
    if (this.cam.zoom < 0.55) return;
    g.save();
    g.strokeStyle = 'rgba(244,236,216,.32)';
    g.lineWidth = 1.6 / this.cam.zoom;
    g.setLineDash([5 / this.cam.zoom, 6 / this.cam.zoom]);
    var vus = {};
    D.PROVINCES.forEach(function (p) {
      Object.keys(p.mers).forEach(function (v) {
        var cle = p.id < v ? p.id + v : v + p.id;
        if (vus[cle]) return;
        vus[cle] = true;
        var q = D.PROV[v];
        g.beginPath();
        g.moveTo(p.vx, p.vy);
        g.lineTo(q.vx, q.vy);
        g.stroke();
      });
    });
    g.setLineDash([]);
    g.restore();
  };

  function rangPlaque(etat, selection, p) {
    var prop = etat.provinces[p.id];
    if (selection === p.id) return 0;
    if (D.FACTIONS[prop.faction].capitale === p.id) return 1;
    for (var i = 0; i < etat.armees.length; i++) {
      if (etat.armees[i].province === p.id) return 2;
    }
    return 3;
  }

  Carte.prototype.dessinerPlaque = function (g, p) {
    var etat = this.etat;
    var prop = etat.provinces[p.id];
    var capitale = D.FACTIONS[prop.faction].capitale === p.id;
    var ech = 1 / Math.max(this.cam.zoom, 0.45);

    var taille = capitale ? 12 : 10.5;
    var texte = p.ville + ' (' + D.FACTIONS[prop.faction].nom + ')';

    g.save();
    g.font = '500 ' + taille + 'px Cinzel, Georgia, serif';
    var l = (g.measureText(texte).width + taille * 2.49) * ech;
    var h = taille * 1.72 * ech;
    g.restore();

    /* La plaque se pose sur la capitale, non sur le centre du territoire :
       c'est la ville qu'elle nomme. */
    var x = p.vx, y = p.vy - 17 * ech;
    var boite = { x: x - l / 2, y: y - h / 2, l: l, h: h };

    for (var i = 0; i < this.boitesPlaques.length; i++) {
      var b = this.boitesPlaques[i];
      if (boite.x < b.x + b.l && boite.x + boite.l > b.x &&
          boite.y < b.y + b.h && boite.y + boite.h > b.y) return;
    }
    this.boitesPlaques.push(boite);

    g.save();
    g.translate(x, y);
    g.scale(ech, ech);
    Deco.plaque(g, 0, 0, texte, {
      teinte: prop.faction === etat.joueur ? 'nous' : (capitale ? 'ennemi' : 'autre'),
      taille: taille
    });
    g.restore();
  };

  Carte.prototype.dessinerArmee = function (g, p) {
    var etat = this.etat;
    var armee = etat.armees.filter(function (a) { return a.province === p.id; })[0];
    if (!armee || !armee.unites.length) return;

    var f = D.FACTIONS[armee.faction];
    var joueur = armee.faction === etat.joueur;
    var hommes = armee.unites.reduce(function (s, u) { return s + u.hommes; }, 0);
    var ech = 1 / Math.max(this.cam.zoom, 0.45);

    g.save();
    g.translate(p.vx, p.vy + 13 * ech);
    g.scale(ech, ech);

    if (joueur && !armee.deplacee) {
      var halo = 0.30 + Math.sin(this.pulsation * 2.4) * 0.22;
      g.fillStyle = 'rgba(240,213,133,' + halo + ')';
      g.beginPath();
      g.ellipse(0, 4, 20, 9, 0, 0, Math.PI * 2);
      g.fill();
    }

    g.fillStyle = 'rgba(24,20,10,.42)';
    g.beginPath();
    g.ellipse(1, 4, 11, 4, 0, 0, Math.PI * 2);
    g.fill();

    var sprite = Deco.spriteSoldat('cav', f.couleur, f.clair);
    var s = 2.1;
    g.drawImage(sprite, -sprite.mondeL * s / 2, -sprite.mondeH * s + 5,
      sprite.mondeL * s, sprite.mondeH * s);
    Deco.drapeau(g, 8, -6, 15, f.couleur, f.clair, this.pulsation * 1.6);

    var texte = U.nb(hommes);
    g.font = '700 10px Cinzel, Georgia, serif';
    var l = g.measureText(texte).width + 12;
    Deco.cheminArrondi(g, -l / 2, 6, l, 14, 7);
    g.fillStyle = 'rgba(12,20,36,.92)';
    g.fill();
    g.strokeStyle = joueur ? Deco.OR_VIF : 'rgba(200,163,73,.5)';
    g.lineWidth = 1.2;
    g.stroke();
    g.fillStyle = '#f4ecd8';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(texte, 0, 13.6);

    g.restore();
  };

  /* La minicarte reprend le calque des appartenances, réduit. */
  Carte.prototype.dessinerMiniCarte = function (g, L, H) {
    var large = Math.min(132, L * 0.36);
    var ech = large / D.LARGEUR_CARTE;
    var haut = D.HAUTEUR_CARTE * ech;
    var x = L - large - 10, y = 10;

    g.save();
    g.translate(x, y);

    g.fillStyle = 'rgba(10,18,32,.9)';
    Deco.cheminArrondi(g, -3, -3, large + 6, haut + 6, 3);
    g.fill();

    g.save();
    Deco.cheminArrondi(g, 0, 0, large, haut, 2);
    g.clip();
    g.fillStyle = '#e8dcc0';
    g.fillRect(0, 0, large, haut);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.teintes, 0, 0, large, haut);

    var vueL = (L / this.cam.zoom) * ech;
    var vueH = (H / this.cam.zoom) * ech;
    g.strokeStyle = 'rgba(255,255,255,.92)';
    g.lineWidth = 1.4;
    g.strokeRect(this.cam.x * ech - vueL / 2, this.cam.y * ech - vueH / 2, vueL, vueH);
    g.restore();

    Deco.cadre(g, 0, 0, large, haut, 2, 2.4);
    g.restore();

    this.boiteMini = { x: x, y: y, l: large, h: haut, ech: ech };
  };

  JEU.Carte = {
    creer: function (config) { return new Carte(config); }
  };
})(window);
