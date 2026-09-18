/* Enchaînement des écrans et interface. C'est ici que la campagne, la
   carte et le champ de bataille se parlent. */

(function (global) {
  'use strict';

  var JEU = global.JEU;
  var U = JEU.U;
  var D = JEU.D;
  var C = JEU.Campagne;

  var etat = null;            // état de campagne
  var carte = null;           // instance de carte
  var bataille = null;        // bataille en cours
  var contexte = null;        // ce que la bataille en cours représente
  var file = [];              // batailles à livrer après le tour de l'IA
  var marche = null;          // { armeeId } quand on désigne une destination
  var provinceOuverte = null;
  var factionChoisie = 'fr';
  var rafraichisseur = null;

  /* ------------------------------------------------------------------ */
  /* Écrans et fenêtres                                                  */
  /* ------------------------------------------------------------------ */

  function montrer(id) {
    U.els('.ecran').forEach(function (e) { e.classList.toggle('actif', e.id === id); });
  }

  function fenetre(titre, corps, boutons) {
    var voile = U.el('#voile');
    U.el('#fenetre-titre').textContent = titre;
    var zone = U.vider(U.el('#fenetre-corps'));
    if (typeof corps === 'string') zone.innerHTML = corps;
    else zone.appendChild(corps);

    var pied = U.vider(U.el('#fenetre-pied'));
    (boutons || [{ texte: 'Fermer' }]).forEach(function (b) {
      var bt = U.creer('button', 'btn' + (b.principal ? ' btn-or' : ''), b.texte);
      bt.addEventListener('click', function () {
        if (!b.garder) fermerFenetre();
        if (b.action) b.action();
      });
      pied.appendChild(bt);
    });
    voile.hidden = false;
  }

  function fermerFenetre() { U.el('#voile').hidden = true; }

  /* ------------------------------------------------------------------ */
  /* Menu                                                                */
  /* ------------------------------------------------------------------ */

  var PITCHS = {
    fr: "L'Empire au centre de l'Europe : riche, encerclé, et seul à pouvoir lever la Garde.",
    gb: "Maîtresse des mers et des îles. À l'abri, mais il faudra bien débarquer un jour.",
    pr: "Une armée dure au mal, coincée entre la France et la Russie. Frapper le premier.",
    au: "L'empire des Habsbourg : vaste, divisé, et sur tous les fronts à la fois.",
    ru: "L'immensité pour alliée. Reculez, laissez venir, puis écrasez.",
    es: "L'Espagne et Naples. Peu de moyens, mais un terrain qui use les envahisseurs.",
    ot: "Aux portes de l'Europe, avec une artillerie redoutable et peu d'amis."
  };

  function construireMenu() {
    var grille = U.vider(U.el('#factions'));
    D.JOUABLES.forEach(function (id) {
      var f = D.FACTIONS[id];
      var b = U.creer('button', 'faction' + (id === factionChoisie ? ' actif' : ''));
      b.type = 'button';
      var ecu = U.creer('span', 'faction-ecu');
      ecu.style.background = f.couleur;
      b.appendChild(ecu);
      b.appendChild(U.creer('span', 'faction-nom', f.nom));
      b.addEventListener('click', function () {
        factionChoisie = id;
        U.els('.faction', grille).forEach(function (n, i) {
          n.classList.toggle('actif', D.JOUABLES[i] === id);
        });
        U.el('#faction-desc').textContent = PITCHS[id];
      });
      grille.appendChild(b);
    });
    U.el('#faction-desc').textContent = PITCHS[factionChoisie];
    U.el('#btn-reprendre').hidden = !U.charger();
  }

  /* ------------------------------------------------------------------ */
  /* Campagne                                                            */
  /* ------------------------------------------------------------------ */

  function ouvrirCampagne(nouveau) {
    if (nouveau) etat = C.nouvelle(factionChoisie);
    if (!etat) return;

    montrer('ecran-campagne');
    if (carte) carte.detruire();
    carte = JEU.Carte.creer({
      toile: U.el('#carte'),
      etat: etat,
      surProvince: choisirProvince
    });
    carte.centrerSur(D.FACTIONS[etat.joueur].capitale);
    provinceOuverte = D.FACTIONS[etat.joueur].capitale;
    majBarre();
    majFeuille();
  }

  function majBarre() {
    var f = D.FACTIONS[etat.joueur];
    U.el('#camp-faction').textContent = f.nom;
    U.el('#camp-saison').textContent = C.saison(etat);
    U.el('#camp-tresor').textContent = U.nb(etat.tresors[etat.joueur]);
    var solde = C.revenus(etat, etat.joueur) - C.entretien(etat, etat.joueur);
    var n = U.el('#camp-solde');
    n.textContent = (solde >= 0 ? '+' : '') + U.nb(solde);
    n.className = 'barre-val ' + (solde >= 0 ? 'bleu' : 'rouge');
    U.el('#num-tour').textContent = etat.tour;
  }

  function choisirProvince(id) {
    if (!id) { provinceOuverte = null; majFeuille(); return; }

    if (marche) {
      var res = C.deplacer(etat, marche.armeeId, id);
      if (res.type === 'refus') {
        signalBref(res.raison);
        return;
      }
      quitterMarche();

      if (res.type === 'bataille') {
        proposerBataille(res.attaquant, res.defenseur, res.province, true);
        return;
      }
      provinceOuverte = id;
      carte.selection = id;
      majBarre();
      majFeuille();
      verifierIssue();
      return;
    }

    provinceOuverte = id;
    carte.selection = id;
    majFeuille();
  }

  function signalBref(texte) {
    var b = U.el('#mode-marche');
    var ancien = b.firstChild ? b.firstChild.nodeValue : '';
    b.hidden = false;
    b.firstChild.nodeValue = texte + ' ';
    clearTimeout(signalBref.t);
    signalBref.t = setTimeout(function () {
      if (marche) b.firstChild.nodeValue = ancien;
      else b.hidden = true;
    }, 1600);
  }

  function entrerMarche(armeeId) {
    var armee = C.armeeParId(etat, armeeId);
    if (!armee) return;
    marche = { armeeId: armeeId };
    carte.surlignees = {};
    D.PROV[armee.province].voisins.forEach(function (v) { carte.surlignees[v] = true; });
    U.el('#mode-marche').hidden = false;
    U.el('#mode-marche').firstChild.nodeValue = 'Touchez une province voisine pour y marcher ';
    majFeuille();
  }

  function quitterMarche() {
    marche = null;
    if (carte) carte.surlignees = {};
    U.el('#mode-marche').hidden = true;
  }

  /* --- Feuille du bas ------------------------------------------------- */

  function majFeuille() {
    var corps = U.vider(U.el('#feuille-corps'));
    if (!provinceOuverte) {
      corps.appendChild(U.creer('p', 'prov-ligne',
        'Touchez une province pour l’inspecter. Pincez pour zoomer, glissez pour déplacer la carte.'));
      return;
    }

    var p = D.PROV[provinceOuverte];
    var prop = etat.provinces[p.id];
    var f = D.FACTIONS[prop.faction];
    var armee = C.armeeSur(etat, p.id);
    var aMoi = prop.faction === etat.joueur;

    var tete = U.creer('div', 'prov-tete');
    tete.appendChild(U.creer('h2', 'prov-nom', p.nom));
    var puce = U.creer('span', 'puce');
    var ecu = U.creer('span', 'puce-ecu');
    ecu.style.background = f.couleur;
    puce.appendChild(ecu);
    puce.appendChild(document.createTextNode(f.nom));
    tete.appendChild(puce);
    if (f.capitale === p.id) tete.appendChild(U.creer('span', 'puce', 'Capitale'));
    corps.appendChild(tete);

    corps.appendChild(U.creer('p', 'prov-ligne',
      p.ville + ' · ' + p.rev + ' écus par tour · ' + p.voisins.length + ' provinces limitrophes'));

    if (armee) {
      var titre = armee.faction === etat.joueur ? 'Votre armée' : 'Armée ' + D.FACTIONS[armee.faction].gentile;
      corps.appendChild(U.creer('h3', 'sous-titre',
        titre + ' — ' + U.nb(C.effectif(armee)) + ' hommes'));

      var liste = U.creer('div', 'liste-unites');
      armee.unites.forEach(function (u) {
        var def = D.UNITES[u.type];
        var rang = U.creer('div', 'rang');
        var e = U.creer('span', 'rang-ecu');
        e.style.background = D.FACTIONS[armee.faction].couleur;
        rang.appendChild(e);
        rang.appendChild(U.creer('span', 'rang-nom', def.nom));
        rang.appendChild(U.creer('span', 'rang-val', U.nb(u.hommes) + '/' + def.hommes));
        liste.appendChild(rang);
      });
      corps.appendChild(liste);

      if (armee.faction === etat.joueur) {
        var actions = U.creer('div', 'actions-prov');
        if (marche && marche.armeeId === armee.id) {
          var annuler = U.creer('button', 'btn btn-fin', 'Annuler la marche');
          annuler.addEventListener('click', quitterMarche);
          actions.appendChild(annuler);
        } else {
          var bouger = U.creer('button', 'btn btn-or' + (armee.deplacee ? '' : ''), 'Marcher');
          bouger.disabled = armee.deplacee;
          bouger.textContent = armee.deplacee ? 'A déjà marché' : 'Marcher';
          bouger.addEventListener('click', function () { entrerMarche(armee.id); });
          actions.appendChild(bouger);
        }
        corps.appendChild(actions);
      }
    }

    if (aMoi) {
      corps.appendChild(U.creer('h3', 'sous-titre',
        prop.recrute ? 'Levée — déjà faite ce tour' : 'Lever des troupes'));
      var grille = U.creer('div', 'grille-recrue');
      D.ORDRE_UNITES.forEach(function (type) {
        var def = D.UNITES[type];
        if (def.reserve && def.reserve !== etat.joueur) return;
        var refus = C.peutRecruter(etat, etat.joueur, p.id, type);
        var b = U.creer('button', 'recrue');
        b.disabled = !!refus;

        var e2 = U.creer('span', 'rang-ecu');
        e2.style.background = f.couleur;
        b.appendChild(e2);

        var bloc = U.creer('div', 'recrue-corps');
        bloc.appendChild(U.creer('div', 'recrue-nom', def.nom));
        bloc.appendChild(U.creer('div', 'recrue-desc', refus || def.desc));
        b.appendChild(bloc);
        b.appendChild(U.creer('span', 'recrue-cout', U.nb(def.cout)));

        b.addEventListener('click', function () {
          var r = C.recruter(etat, etat.joueur, p.id, type);
          if (r.ok) { majBarre(); majFeuille(); sauver(); }
        });
        grille.appendChild(b);
      });
      corps.appendChild(grille);
    }
  }

  /* --- Fin du tour ----------------------------------------------------- */

  function finDuTour() {
    quitterMarche();
    file = C.finDeTour(etat).slice();
    majBarre();
    majFeuille();
    sauver();
    traiterFile();
  }

  function traiterFile() {
    if (!file.length) { verifierIssue(); return; }
    var item = file.shift();
    var att = C.armeeParId(etat, item.attaquantId);
    var def = C.armeeParId(etat, item.defenseurId);
    if (!att || !def) { traiterFile(); return; }
    proposerBataille(att, def, item.province, false);
  }

  /* --- Batailles de campagne -------------------------------------------- */

  function proposerBataille(attaquant, defenseur, provinceId, joueurAttaque) {
    var nous = joueurAttaque ? attaquant : defenseur;
    var eux = joueurAttaque ? defenseur : attaquant;
    var p = D.PROV[provinceId];

    var corps = U.creer('div');
    corps.appendChild(U.creer('p', null, joueurAttaque
      ? 'Vos troupes abordent ' + p.nom + '. L’armée ' + D.FACTIONS[eux.faction].gentile + ' s’est déployée.'
      : 'Une armée ' + D.FACTIONS[eux.faction].gentile + ' marche sur ' + p.nom + '. Il faut la recevoir.'));

    var bilan = U.creer('div', 'bilan');
    [['Vos forces', C.effectif(nous)], ['En face', C.effectif(eux)]].forEach(function (c) {
      var caseB = U.creer('div', 'bilan-case');
      caseB.appendChild(U.creer('div', 'bilan-cle', c[0]));
      caseB.appendChild(U.creer('div', 'bilan-val', U.nb(c[1])));
      bilan.appendChild(caseB);
    });
    corps.appendChild(bilan);

    fenetre('Bataille de ' + p.ville, corps, [
      {
        texte: 'Livrer bataille', principal: true, action: function () {
          lancerBataille({
            mode: 'campagne',
            attaquantId: attaquant.id,
            defenseurId: defenseur.id,
            province: provinceId,
            joueurAttaque: joueurAttaque
          });
        }
      },
      {
        texte: 'Résolution auto', action: function () {
          var issue = C.autoResoudre(etat, attaquant, defenseur);
          var gagneAttaquant = issue.vainqueur === attaquant;
          C.conclureBataille(etat, attaquant, defenseur, provinceId, gagneAttaquant, null);
          var gagne = (gagneAttaquant === joueurAttaque);
          majBarre(); majFeuille(); sauver();
          bilanFin(gagne, issue.pertesVainqueur, issue.pertesVaincu, gagne, p, traiterFile);
        }
      }
    ]);
  }

  function lancerBataille(ctx) {
    contexte = ctx;
    var att = ctx.mode === 'campagne' ? C.armeeParId(etat, ctx.attaquantId) : null;
    var def = ctx.mode === 'campagne' ? C.armeeParId(etat, ctx.defenseurId) : null;

    var nous, eux, factionNous, factionEux;
    if (ctx.mode === 'campagne') {
      nous = ctx.joueurAttaque ? att : def;
      eux = ctx.joueurAttaque ? def : att;
      factionNous = nous.faction;
      factionEux = eux.faction;
      nous = nous.unites;
      eux = eux.unites;
    } else {
      factionNous = ctx.factionJoueur;
      factionEux = ctx.factionEnnemi;
      nous = ctx.forceJoueur;
      eux = ctx.forceEnnemi;
    }

    montrer('ecran-bataille');
    U.el('#depart').hidden = false;
    U.el('#bat-nous-nom').textContent = D.FACTIONS[factionNous].nom;
    U.el('#bat-eux-nom').textContent = D.FACTIONS[factionEux].nom;

    if (bataille) bataille.arreter();
    bataille = JEU.Bataille.creer({
      toile: U.el('#champ'),
      factionJoueur: factionNous,
      factionEnnemi: factionEux,
      forces: { joueur: nous.map(copie), ennemi: eux.map(copie) },
      graine: (etat ? etat.graine + etat.tour : 1) + Date.now() % 1000,
      surFin: finBataille,
      surEtat: function () { bandeauSale = true; }
    });
    bataille.lancer();
    majVitesses(0);
    bandeau();
    if (rafraichisseur) clearInterval(rafraichisseur);
    rafraichisseur = setInterval(bandeau, 260);
  }

  function copie(u) { return { type: u.type, hommes: u.hommes }; }

  var bandeauSale = false;

  function bandeau() {
    if (!bataille) return;
    var zone = U.el('#bandeau-unites');
    var nous = bataille.unites.filter(function (u) { return u.camp === 'joueur'; });

    /* On reconstruit seulement si la composition a changé, pour ne pas
       casser le défilement pendant que le joueur fait glisser la barre. */
    if (zone.childElementCount !== nous.length) {
      U.vider(zone);
      nous.forEach(function (u) {
        var c = U.creer('button', 'carte-unite');
        c.dataset.id = u.id;
        var e = U.creer('span', 'cu-ecu');
        e.style.background = D.FACTIONS[u.faction].couleur;
        c.appendChild(e);
        c.appendChild(U.creer('span', 'cu-nom', D.UNITES[u.type].court));
        c.appendChild(U.creer('span', 'cu-nb', ''));
        var m = U.creer('span', 'cu-moral');
        m.appendChild(U.creer('i'));
        c.appendChild(m);
        c.addEventListener('click', function () { bataille.selectionnerUne(u.id); bandeau(); });
        zone.appendChild(c);
      });
    }

    var totalNous = 0, totalEux = 0;
    bataille.unites.forEach(function (u) {
      if (u.camp === 'joueur') totalNous += u.hommes; else totalEux += u.hommes;
    });
    U.el('#bat-nous').textContent = U.nb(totalNous);
    U.el('#bat-eux').textContent = U.nb(totalEux);

    U.els('.carte-unite', zone).forEach(function (c, i) {
      var u = nous[i];
      if (!u) return;
      c.classList.toggle('choisie', !!u.selectionne);
      c.classList.toggle('rompue', u.etat !== 'formé');
      c.querySelector('.cu-nb').textContent = u.hommes;
      var part = Math.max(0, Math.min(1, u.moral / u.moralMax));
      var barre = c.querySelector('.cu-moral i');
      barre.style.width = (part * 100) + '%';
      barre.style.background = u.etat === 'déroute' ? '#9c4b3f'
        : (part > 0.55 ? '#7fb069' : (part > 0.28 ? '#d8a740' : '#c05a45'));
    });
    bandeauSale = false;
  }

  function majVitesses(v) {
    U.els('#vitesses .pastille').forEach(function (b) {
      b.classList.toggle('actif', Number(b.dataset.v) === v);
    });
    if (bataille) bataille.vitesse = v;
  }

  function finBataille(res) {
    if (rafraichisseur) { clearInterval(rafraichisseur); rafraichisseur = null; }
    var gagne = res.vainqueur === 'joueur';

    if (contexte.mode === 'escarmouche') {
      bilanFin(gagne, res.pertesJoueur, res.pertesEnnemi, gagne, null, function () {
        montrer('ecran-menu');
        construireMenu();
      });
      return;
    }

    var att = C.armeeParId(etat, contexte.attaquantId);
    var def = C.armeeParId(etat, contexte.defenseurId);
    var p = D.PROV[contexte.province];

    if (att && def) {
      /* Le vainqueur du champ de bataille repart avec ses survivants. */
      var gagneAttaquant = contexte.joueurAttaque ? gagne : !gagne;
      var survivants = gagne
        ? res.survivantsJoueur
        : res.survivantsEnnemi;
      C.conclureBataille(etat, att, def, contexte.province, gagneAttaquant, survivants);
    }

    majBarre();
    sauver();
    bilanFin(gagne, res.pertesJoueur, res.pertesEnnemi, gagne, p, function () {
      montrer('ecran-campagne');
      provinceOuverte = contexte.province;
      if (carte) { carte.selection = contexte.province; carte.centrerSur(contexte.province); }
      majFeuille();
      traiterFile();
    });
  }

  function bilanFin(gagne, pertesNous, pertesEux, aussi, province, suite) {
    if (bataille) { bataille.arreter(); bataille = null; }

    var corps = U.creer('div');
    corps.appendChild(U.creer('p', null, gagne
      ? 'Le terrain est à nous. ' + (province ? province.nom + ' change de main.' : 'L’ennemi est en fuite.')
      : 'La ligne a cédé. ' + (province ? 'Il faudra revenir devant ' + province.nom + '.' : 'L’armée se replie.')));

    var bilan = U.creer('div', 'bilan');
    [['Nos pertes', pertesNous], ['Pertes ennemies', pertesEux]].forEach(function (c) {
      var caseB = U.creer('div', 'bilan-case');
      caseB.appendChild(U.creer('div', 'bilan-cle', c[0]));
      caseB.appendChild(U.creer('div', 'bilan-val', U.nb(c[1])));
      bilan.appendChild(caseB);
    });
    corps.appendChild(bilan);

    fenetre(gagne ? 'Victoire' : 'Défaite', corps, [
      { texte: 'Continuer', principal: true, action: suite }
    ]);
  }

  function verifierIssue() {
    var issue = C.verifierFin(etat);
    if (!issue) { sauver(); return; }

    var gagne = issue === 'victoire';
    var corps = U.creer('div');
    corps.appendChild(U.creer('p', null, gagne
      ? 'L’Europe est à vous. ' + D.FACTIONS[etat.joueur].nom + ' tient ' +
        C.provincesDe(etat, etat.joueur).length + ' provinces sur ' + D.PROVINCES.length + '.'
      : 'Votre dernière province est tombée. La campagne s’achève ici.'));
    corps.appendChild(U.creer('p', null, 'Campagne menée en ' + (etat.tour - 1) + ' tours.'));

    U.effacer();
    fenetre(gagne ? 'La campagne est gagnée' : 'La campagne est perdue', corps, [
      { texte: 'Retour au menu', principal: true, action: function () {
          etat = null;
          if (carte) { carte.detruire(); carte = null; }
          montrer('ecran-menu');
          construireMenu();
        } }
    ]);
  }

  function sauver() {
    if (etat && !etat.fini) U.sauver(etat);
  }

  /* ------------------------------------------------------------------ */
  /* Bataille rapide                                                     */
  /* ------------------------------------------------------------------ */

  function escarmouche() {
    var autres = D.JOUABLES.filter(function (f) { return f !== factionChoisie; });
    var adversaire = autres[Math.floor(Math.random() * autres.length)];

    function force(faction) {
      var liste = [
        { type: 'ligne', hommes: D.UNITES.ligne.hommes },
        { type: 'ligne', hommes: D.UNITES.ligne.hommes },
        { type: 'ligne', hommes: D.UNITES.ligne.hommes },
        { type: 'legere', hommes: D.UNITES.legere.hommes },
        { type: 'grenadiers', hommes: D.UNITES.grenadiers.hommes },
        { type: 'cavalerie', hommes: D.UNITES.cavalerie.hommes },
        { type: 'cuirassiers', hommes: D.UNITES.cuirassiers.hommes },
        { type: 'artillerie', hommes: D.UNITES.artillerie.hommes },
        { type: 'artillerie', hommes: D.UNITES.artillerie.hommes }
      ];
      if (faction === 'fr') liste.push({ type: 'garde', hommes: D.UNITES.garde.hommes });
      else liste.push({ type: 'ligne', hommes: D.UNITES.ligne.hommes });
      return liste;
    }

    lancerBataille({
      mode: 'escarmouche',
      factionJoueur: factionChoisie,
      factionEnnemi: adversaire,
      forceJoueur: force(factionChoisie),
      forceEnnemi: force(adversaire)
    });
  }

  /* ------------------------------------------------------------------ */
  /* Aide                                                                */
  /* ------------------------------------------------------------------ */

  var REGLES =
    '<p><strong>La campagne.</strong> Chaque tour vous rapporte des écus : le revenu de vos ' +
    'provinces, moins la solde de vos régiments. Touchez une province pour l’inspecter, ' +
    'levez des troupes chez vous, puis faites marcher une armée sur une province voisine.</p>' +
    '<ul>' +
    '<li>Une armée ne marche qu’une fois par tour.</li>' +
    '<li>Une province ne peut lever qu’un régiment par tour.</li>' +
    '<li>Entrer chez l’ennemi déclenche une bataille, ou une occupation si la province est vide.</li>' +
    '<li>Si le trésor tombe à zéro, des régiments sont dissous faute de solde.</li>' +
    '</ul>' +
    '<p><strong>La bataille.</strong> Elle commence en pause : placez vos lignes avant d’engager.</p>' +
    '<ul>' +
    '<li>Touchez un régiment pour le choisir, le sol pour l’y envoyer, une unité ennemie pour l’attaquer.</li>' +
    '<li>Glissez pour déplacer la vue, pincez pour zoomer.</li>' +
    '<li>Plusieurs régiments choisis se déploient côte à côte sur une même ligne.</li>' +
    '</ul>' +
    '<p><strong>Ce qui gagne une bataille.</strong> Le moral, pas les pertes. Une unité prise de ' +
    'flanc ou de dos s’effondre bien plus vite ; l’artillerie brise les nerfs à distance ; ' +
    'la cavalerie ne vaut que lancée, et il faut la garder pour les canons et les ailes. ' +
    'Une unité qui rompt peut se reformer si vous l’éloignez de l’ennemi.</p>' +
    '<p><strong>Victoire.</strong> Tenez ' + D.PROVINCES_VICTOIRE + ' des ' + D.PROVINCES.length +
    ' provinces. Vous êtes défait si vous n’en tenez plus aucune.</p>';

  /* ------------------------------------------------------------------ */
  /* Branchements                                                        */
  /* ------------------------------------------------------------------ */

  function brancher() {
    U.el('#btn-nouvelle').addEventListener('click', function () {
      JEU.Audio.eveiller();
      ouvrirCampagne(true);
      sauver();
    });

    U.el('#btn-reprendre').addEventListener('click', function () {
      var sauvegarde = U.charger();
      if (!sauvegarde) return;
      etat = sauvegarde;
      /* Une sauvegarde d'une version antérieure peut manquer de champs. */
      etat.enAttente = etat.enAttente || [];
      etat.journal = etat.journal || [];
      JEU.Audio.eveiller();
      ouvrirCampagne(false);
    });

    U.el('#btn-escarmouche').addEventListener('click', function () {
      JEU.Audio.eveiller();
      escarmouche();
    });

    U.el('#btn-regles').addEventListener('click', function () {
      fenetre('Comment jouer', REGLES, [{ texte: 'Compris', principal: true }]);
    });

    U.el('#btn-fin-tour').addEventListener('click', finDuTour);
    U.el('#btn-annuler-marche').addEventListener('click', quitterMarche);

    U.el('#btn-journal').addEventListener('click', function () {
      var corps = U.creer('div');
      if (!etat.journal.length) corps.appendChild(U.creer('p', null, 'Rien à signaler pour l’instant.'));
      etat.journal.forEach(function (j) {
        var l = U.creer('div', 'journal-ligne');
        l.appendChild(U.creer('div', 'journal-tour', 'Tour ' + j.tour));
        l.appendChild(document.createTextNode(j.texte));
        corps.appendChild(l);
      });
      fenetre('Journal de campagne', corps, [{ texte: 'Fermer', principal: true }]);
    });

    U.el('#btn-menu').addEventListener('click', function () {
      fenetre('Campagne', '<p>La partie est enregistrée dans ce navigateur à chaque action.</p>', [
        { texte: 'Reprendre', principal: true },
        { texte: 'Règles', action: function () { fenetre('Comment jouer', REGLES, [{ texte: 'Compris', principal: true }]); } },
        { texte: 'Quitter', action: function () {
            if (carte) { carte.detruire(); carte = null; }
            montrer('ecran-menu');
            construireMenu();
          } }
      ]);
    });

    /* --- Bataille --- */
    U.el('#vitesses').addEventListener('click', function (e) {
      var b = e.target.closest('.pastille');
      if (!b) return;
      JEU.Audio.eveiller();
      majVitesses(Number(b.dataset.v));
    });

    U.el('#btn-engager').addEventListener('click', function () {
      U.el('#depart').hidden = true;
      JEU.Audio.eveiller();
      majVitesses(1);
    });

    U.el('#btn-tout').addEventListener('click', function () {
      if (bataille) { bataille.selectionnerTout(); bataille.recentrer(); bandeau(); }
    });

    U.el('#btn-vue').addEventListener('click', function () {
      if (bataille) bataille.recentrer();
    });

    U.el('#btn-tenir').addEventListener('click', function () {
      if (bataille) { bataille.tenirPosition(); bandeau(); }
    });

    U.el('#btn-son').addEventListener('click', function (e) {
      var on = JEU.Audio.basculer();
      e.currentTarget.classList.toggle('btn-or', on);
      e.currentTarget.textContent = on ? 'Son ✓' : 'Son';
    });

    U.el('#btn-retraite').addEventListener('click', function () {
      if (!bataille) return;
      fenetre('Battre en retraite ?', '<p>L’armée abandonne le terrain. Elle est perdue pour cette campagne.</p>', [
        { texte: 'Tenir encore', principal: true },
        { texte: 'Se retirer', action: function () { if (bataille) bataille.battreEnRetraite(); } }
      ]);
    });

    /* Fermeture de la fenêtre en touchant le voile, hors des boutons. */
    U.el('#voile').addEventListener('click', function (e) {
      if (e.target === e.currentTarget) return;   // décision toujours explicite
    });
  }

  /* Poignée d'inspection : sert à sonder la partie depuis la console ou
     un test de bout en bout. Lecture seule, rien ne dépend d'elle. */
  JEU.debug = {
    etat: function () { return etat; },
    carte: function () { return carte; },
    bataille: function () { return bataille; }
  };

  construireMenu();
  brancher();
})(window);
