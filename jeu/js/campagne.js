/* Couche de campagne : trésor, recrutement, marches, conquêtes et IA.
   Aucune dépendance au DOM — l'état est une donnée pure, sérialisable
   telle quelle dans la sauvegarde. */

(function (global) {
  'use strict';

  var JEU = global.JEU = global.JEU || {};
  var U = JEU.U;
  var D = JEU.D;

  var SAISONS = ['Printemps', 'Été', 'Automne', 'Hiver'];
  var MAX_UNITES = 12;          // taille d'une armée
  var ANNEE_DEPART = 1805;

  /* Poids de chaque type dans une résolution automatique. */
  var POIDS = {
    ligne: 1, legere: 0.9, grenadiers: 1.35, garde: 1.6,
    cavalerie: 1.6, cuirassiers: 2.0, artillerie: 2.2
  };

  /* ------------------------------------------------------------------ */
  /* Création                                                            */
  /* ------------------------------------------------------------------ */

  function nouvelle(factionJoueur) {
    var etat = {
      joueur: factionJoueur,
      tour: 1,
      graine: Math.floor(Math.random() * 1e9),
      provinces: {},
      armees: [],
      tresors: {},
      prochainId: 1,
      enAttente: [],
      journal: [],
      fini: null
    };

    D.PROVINCES.forEach(function (p) {
      etat.provinces[p.id] = { faction: p.depart, recrute: false };
    });

    Object.keys(D.FACTIONS).forEach(function (f) {
      etat.tresors[f] = f === factionJoueur ? 4200 : 3600;
    });

    /* Chaque faction ouvre avec une armée dans sa capitale et une garnison
       sur une province de frontière. */
    Object.keys(D.FACTIONS).forEach(function (f) {
      var cap = D.FACTIONS[f].capitale;
      etat.armees.push(creerArmee(etat, f, cap, armeeDeDepart(f, true)));

      var autres = D.PROVINCES.filter(function (p) {
        return p.depart === f && p.id !== cap;
      });
      if (autres.length) {
        var choix = autres[Math.floor(autres.length / 2)];
        etat.armees.push(creerArmee(etat, f, choix.id, armeeDeDepart(f, false)));
      }
    });

    journal(etat, 'La coalition se rassemble. ' + D.FACTIONS[factionJoueur].nom + ' entre en campagne.');
    return etat;
  }

  function armeeDeDepart(faction, principale) {
    var u = [
      { type: 'ligne', hommes: D.UNITES.ligne.hommes },
      { type: 'ligne', hommes: D.UNITES.ligne.hommes },
      { type: 'legere', hommes: D.UNITES.legere.hommes },
      { type: 'cavalerie', hommes: D.UNITES.cavalerie.hommes }
    ];
    if (principale) {
      u.push({ type: 'ligne', hommes: D.UNITES.ligne.hommes });
      u.push({ type: 'artillerie', hommes: D.UNITES.artillerie.hommes });
      u.push({ type: faction === 'fr' ? 'garde' : 'grenadiers',
               hommes: D.UNITES[faction === 'fr' ? 'garde' : 'grenadiers'].hommes });
    }
    return u;
  }

  function creerArmee(etat, faction, province, unites) {
    return {
      id: etat.prochainId++,
      faction: faction,
      province: province,
      unites: unites,
      deplacee: false
    };
  }

  function journal(etat, texte) {
    etat.journal.unshift({ tour: etat.tour, texte: texte });
    if (etat.journal.length > 40) etat.journal.pop();
  }

  /* ------------------------------------------------------------------ */
  /* Lectures                                                            */
  /* ------------------------------------------------------------------ */

  function provincesDe(etat, faction) {
    return D.PROVINCES.filter(function (p) { return etat.provinces[p.id].faction === faction; });
  }

  function armeeSur(etat, provinceId) {
    for (var i = 0; i < etat.armees.length; i++) {
      if (etat.armees[i].province === provinceId) return etat.armees[i];
    }
    return null;
  }

  function armeeParId(etat, id) {
    for (var i = 0; i < etat.armees.length; i++) {
      if (etat.armees[i].id === id) return etat.armees[i];
    }
    return null;
  }

  function revenus(etat, faction) {
    var total = 0;
    provincesDe(etat, faction).forEach(function (p) {
      total += p.rev + (D.FACTIONS[faction].capitale === p.id ? 90 : 0);
    });
    return total;
  }

  function entretien(etat, faction) {
    var total = 0;
    etat.armees.forEach(function (a) {
      if (a.faction !== faction) return;
      a.unites.forEach(function (u) { total += D.UNITES[u.type].entretien; });
    });
    return total;
  }

  function effectif(armee) {
    return armee.unites.reduce(function (s, u) { return s + u.hommes; }, 0);
  }

  function puissance(unites, def) {
    var p = 0;
    unites.forEach(function (u) {
      p += u.hommes * (POIDS[u.type] || 1);
    });
    return p * (def ? 1.15 : 1);
  }

  /* ------------------------------------------------------------------ */
  /* Actions du joueur                                                   */
  /* ------------------------------------------------------------------ */

  function peutRecruter(etat, faction, provinceId, type) {
    var prop = etat.provinces[provinceId];
    if (!prop || prop.faction !== faction) return 'Province étrangère.';
    if (prop.recrute) return 'Déjà recruté ici ce tour.';
    var def = D.UNITES[type];
    if (def.reserve && def.reserve !== faction) return 'Réservé à ' + D.FACTIONS[def.reserve].nom + '.';
    if (etat.tresors[faction] < def.cout) return 'Trésor insuffisant.';
    var armee = armeeSur(etat, provinceId);
    if (armee && armee.faction === faction && armee.unites.length >= MAX_UNITES) return 'Armée au complet.';
    if (armee && armee.faction !== faction) return 'Province assiégée.';
    return null;
  }

  function recruter(etat, faction, provinceId, type) {
    var refus = peutRecruter(etat, faction, provinceId, type);
    if (refus) return { ok: false, raison: refus };

    var def = D.UNITES[type];
    etat.tresors[faction] -= def.cout;
    etat.provinces[provinceId].recrute = true;

    var armee = armeeSur(etat, provinceId);
    if (!armee) {
      armee = creerArmee(etat, faction, provinceId, []);
      armee.deplacee = true;          // une recrue ne marche pas le jour de sa levée
      etat.armees.push(armee);
    }
    armee.unites.push({ type: type, hommes: def.hommes });
    return { ok: true, armee: armee };
  }

  /* Renvoie soit { type:'deplacee' }, soit { type:'conquete' },
     soit { type:'bataille', ... } à résoudre par l'appelant. */
  function deplacer(etat, armeeId, versId) {
    var armee = armeeParId(etat, armeeId);
    if (!armee) return { type: 'refus', raison: 'Armée introuvable.' };
    if (armee.deplacee) return { type: 'refus', raison: 'Cette armée a déjà marché ce tour.' };

    var depuis = D.PROV[armee.province];
    if (depuis.voisins.indexOf(versId) === -1) return { type: 'refus', raison: 'Province non limitrophe.' };

    var occupant = armeeSur(etat, versId);
    var prop = etat.provinces[versId];

    /* Renfort : on fusionne deux armées amies. */
    if (occupant && occupant.faction === armee.faction) {
      if (occupant.unites.length + armee.unites.length > MAX_UNITES) {
        return { type: 'refus', raison: 'L’armée sur place ne peut accueillir tout ce monde.' };
      }
      occupant.unites = occupant.unites.concat(armee.unites);
      occupant.deplacee = true;
      retirerArmee(etat, armee.id);
      return { type: 'fusion', province: versId };
    }

    /* Défenseur en face : bataille. */
    if (occupant) {
      return {
        type: 'bataille',
        attaquant: armee,
        defenseur: occupant,
        province: versId
      };
    }

    /* Province vide : marche ou conquête. */
    armee.province = versId;
    armee.deplacee = true;
    if (prop.faction !== armee.faction) {
      var ancien = prop.faction;
      prop.faction = armee.faction;
      journal(etat, D.FACTIONS[armee.faction].nom + ' occupe ' + D.PROV[versId].nom +
        ' sans coup férir (' + D.FACTIONS[ancien].nom + ').');
      return { type: 'conquete', province: versId, ancien: ancien };
    }
    return { type: 'deplacee', province: versId };
  }

  function retirerArmee(etat, id) {
    for (var i = etat.armees.length - 1; i >= 0; i--) {
      if (etat.armees[i].id === id) etat.armees.splice(i, 1);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Batailles                                                           */
  /* ------------------------------------------------------------------ */

  /* Résolution chiffrée, sans passer par le champ de bataille. */
  function autoResoudre(etat, attaquant, defenseur, alea) {
    var r = alea || Math.random;
    var pa = puissance(attaquant.unites, false) * (0.82 + r() * 0.36);
    var pd = puissance(defenseur.unites, true) * (0.82 + r() * 0.36);

    var vainqueur = pa >= pd ? attaquant : defenseur;
    var vaincu = pa >= pd ? defenseur : attaquant;
    var ecart = Math.max(pa, pd) / Math.max(1, Math.min(pa, pd));

    /* Le vainqueur paie d'autant plus cher que la partie fut serrée. */
    var usure = U.borne(0.55 / ecart, 0.08, 0.55);
    var pertesVainqueur = 0, pertesVaincu = 0;

    vainqueur.unites.forEach(function (u) {
      var perdu = Math.round(u.hommes * usure * (0.7 + r() * 0.6));
      perdu = Math.min(perdu, u.hommes - 1);
      u.hommes -= perdu;
      pertesVainqueur += perdu;
    });
    vaincu.unites.forEach(function (u) { pertesVaincu += u.hommes; });

    return {
      vainqueur: vainqueur,
      vaincu: vaincu,
      pertesVainqueur: pertesVainqueur,
      pertesVaincu: pertesVaincu
    };
  }

  /* Applique l'issue d'une bataille (automatique ou jouée). */
  function conclureBataille(etat, attaquant, defenseur, provinceId, gagnantEstAttaquant, survivants) {
    var vainqueur = gagnantEstAttaquant ? attaquant : defenseur;
    var vaincu = gagnantEstAttaquant ? defenseur : attaquant;

    if (survivants) {
      vainqueur.unites = survivants
        .filter(function (u) { return u.hommes > 0; })
        .map(function (u) { return { type: u.type, hommes: Math.round(u.hommes) }; });
    }
    vainqueur.unites = vainqueur.unites.filter(function (u) { return u.hommes > 0; });

    retirerArmee(etat, vaincu.id);
    if (!vainqueur.unites.length) {
      /* Victoire à la Pyrrhus : plus personne pour tenir le terrain. */
      retirerArmee(etat, vainqueur.id);
      journal(etat, 'Les deux armées se sont détruites devant ' + D.PROV[provinceId].nom + '.');
      return;
    }

    if (gagnantEstAttaquant) {
      var ancien = etat.provinces[provinceId].faction;
      vainqueur.province = provinceId;
      vainqueur.deplacee = true;
      if (ancien !== vainqueur.faction) {
        etat.provinces[provinceId].faction = vainqueur.faction;
        journal(etat, D.FACTIONS[vainqueur.faction].nom + ' enlève ' + D.PROV[provinceId].nom + '.');
      }
    } else {
      journal(etat, D.FACTIONS[vainqueur.faction].nom + ' repousse l’assaut sur ' + D.PROV[provinceId].nom + '.');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Tour de l'IA                                                        */
  /* ------------------------------------------------------------------ */

  function jouerIA(etat) {
    var alea = U.generateur(etat.graine + etat.tour * 7919);
    var factions = Object.keys(D.FACTIONS).filter(function (f) {
      return f !== etat.joueur && provincesDe(etat, f).length > 0;
    });

    factions.forEach(function (f) {
      recruterIA(etat, f, alea);
      manoeuvrerIA(etat, f, alea);
    });
  }

  function recruterIA(etat, faction, alea) {
    var possibles = provincesDe(etat, faction).filter(function (p) {
      var a = armeeSur(etat, p.id);
      return !a || (a.faction === faction && a.unites.length < MAX_UNITES);
    });
    if (!possibles.length) return;

    /* On garde de quoi payer deux tours d'entretien avant de lever. */
    var reserve = entretien(etat, faction) * 2;
    var types = ['ligne', 'ligne', 'legere', 'cavalerie', 'grenadiers', 'artillerie'];

    for (var essai = 0; essai < 3; essai++) {
      if (etat.tresors[faction] < reserve + 300) return;
      var p = possibles[Math.floor(alea() * possibles.length)];
      var type = types[Math.floor(alea() * types.length)];
      if (recruter(etat, faction, p.id, type).ok === false) continue;
    }
  }

  function manoeuvrerIA(etat, faction, alea) {
    var miennes = etat.armees.filter(function (a) { return a.faction === faction && !a.deplacee; });

    miennes.forEach(function (armee) {
      var ici = D.PROV[armee.province];
      var force = puissance(armee.unites, false);

      /* Cibles : provinces voisines qui ne sont pas à nous. */
      var cibles = ici.voisins.map(function (id) {
        var prop = etat.provinces[id];
        if (prop.faction === faction) return null;
        var def = armeeSur(etat, id);
        var forceDef = def ? puissance(def.unites, true) : 0;
        var capitale = D.FACTIONS[prop.faction].capitale === id;
        return {
          id: id,
          def: def,
          forceDef: forceDef,
          /* On préfère le faible, la capitale, et le riche. */
          score: (force - forceDef) / 1000 + (capitale ? 1.4 : 0) + D.PROV[id].rev / 400
        };
      }).filter(Boolean);

      /* Une armée n'attaque que si elle a l'ascendant. */
      var faisables = cibles.filter(function (c) { return force > c.forceDef * 1.12; });

      if (faisables.length) {
        faisables.sort(function (a, b) { return b.score - a.score; });
        var choix = faisables[0];
        var res = deplacer(etat, armee.id, choix.id);

        if (res.type === 'bataille') {
          if (res.defenseur.faction === etat.joueur) {
            /* Le joueur doit pouvoir livrer lui-même la bataille. */
            etat.enAttente.push({
              attaquantId: res.attaquant.id,
              defenseurId: res.defenseur.id,
              province: res.province,
              joueurAttaque: false
            });
            armee.deplacee = true;
          } else {
            var issue = autoResoudre(etat, res.attaquant, res.defenseur, alea);
            conclureBataille(etat, res.attaquant, res.defenseur, res.province,
              issue.vainqueur === res.attaquant, null);
            armee.deplacee = true;
          }
        }
        return;
      }

      /* Sinon : on se replie vers une province amie menacée, ou on tient. */
      var refuges = ici.voisins.filter(function (id) {
        return etat.provinces[id].faction === faction && !armeeSur(etat, id);
      });
      if (refuges.length && alea() < 0.35) {
        deplacer(etat, armee.id, refuges[Math.floor(alea() * refuges.length)]);
      } else {
        armee.deplacee = true;
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Enchaînement des tours                                              */
  /* ------------------------------------------------------------------ */

  function percevoir(etat) {
    Object.keys(D.FACTIONS).forEach(function (f) {
      if (!provincesDe(etat, f).length && !etat.armees.some(function (a) { return a.faction === f; })) return;
      etat.tresors[f] += revenus(etat, f) - entretien(etat, f);

      /* Trésor à sec : on licencie les unités les plus coûteuses. */
      while (etat.tresors[f] < 0) {
        var candidates = etat.armees.filter(function (a) { return a.faction === f && a.unites.length; });
        if (!candidates.length) { etat.tresors[f] = 0; break; }
        var armee = candidates.sort(function (a, b) { return b.unites.length - a.unites.length; })[0];
        var pire = 0;
        armee.unites.forEach(function (u, i) {
          if (D.UNITES[u.type].entretien > D.UNITES[armee.unites[pire].type].entretien) pire = i;
        });
        var licenciee = armee.unites.splice(pire, 1)[0];
        etat.tresors[f] += D.UNITES[licenciee.type].entretien * 4;
        if (f === etat.joueur) {
          journal(etat, 'Faute de solde, un régiment de ' + D.UNITES[licenciee.type].nom.toLowerCase() + ' est dissous.');
        }
        if (!armee.unites.length) retirerArmee(etat, armee.id);
      }
    });
  }

  /* Le joueur termine son tour : l'IA joue, puis on rend la main.
     Retourne la liste des batailles que le joueur doit affronter. */
  function finDeTour(etat) {
    etat.enAttente = [];
    jouerIA(etat);
    etat.tour++;
    percevoir(etat);

    Object.keys(etat.provinces).forEach(function (id) { etat.provinces[id].recrute = false; });
    etat.armees.forEach(function (a) { a.deplacee = false; });

    verifierFin(etat);
    return etat.enAttente;
  }

  function verifierFin(etat) {
    if (etat.fini) return etat.fini;
    var miennes = provincesDe(etat, etat.joueur).length;
    if (miennes === 0) etat.fini = 'defaite';
    else if (miennes >= D.PROVINCES_VICTOIRE) etat.fini = 'victoire';
    return etat.fini;
  }

  function saison(etat) {
    var i = (etat.tour - 1) % 4;
    var annee = ANNEE_DEPART + Math.floor((etat.tour - 1) / 4);
    return SAISONS[i] + ' ' + annee;
  }

  JEU.Campagne = {
    nouvelle: nouvelle,
    provincesDe: provincesDe,
    armeeSur: armeeSur,
    armeeParId: armeeParId,
    revenus: revenus,
    entretien: entretien,
    effectif: effectif,
    puissance: puissance,
    peutRecruter: peutRecruter,
    recruter: recruter,
    deplacer: deplacer,
    autoResoudre: autoResoudre,
    conclureBataille: conclureBataille,
    retirerArmee: retirerArmee,
    finDeTour: finDeTour,
    verifierFin: verifierFin,
    journal: journal,
    saison: saison,
    MAX_UNITES: MAX_UNITES
  };
})(window);
