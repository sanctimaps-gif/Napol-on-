/* Données du jeu : factions, provinces d'Europe, types d'unités.
   Tout est exposé sous JEU.D — scripts classiques, pour que le jeu
   fonctionne aussi bien depuis un serveur que par double-clic (file://). */

(function (global) {
  'use strict';

  var JEU = global.JEU = global.JEU || {};

  /* ------------------------------------------------------------------ */
  /* Factions                                                            */
  /* ------------------------------------------------------------------ */

  var FACTIONS = {
    fr: { nom: 'France',          gentile: 'français',    couleur: '#2f5fa8', clair: '#6f9ae0', capitale: 'paris' },
    gb: { nom: 'Grande-Bretagne', gentile: 'britannique', couleur: '#ab3330', clair: '#d9706d', capitale: 'angleterre' },
    pr: { nom: 'Prusse',          gentile: 'prussien',    couleur: '#3c4250', clair: '#7d8598', capitale: 'prusse' },
    au: { nom: 'Autriche',        gentile: 'autrichien',  couleur: '#cfc8b6', clair: '#ece7db', capitale: 'autriche' },
    ru: { nom: 'Russie',          gentile: 'russe',       couleur: '#3d7a49', clair: '#75b283', capitale: 'moscou' },
    es: { nom: 'Espagne',         gentile: 'espagnol',    couleur: '#c8941f', clair: '#e9bd53', capitale: 'castille' },
    ot: { nom: 'Empire ottoman',  gentile: 'ottoman',     couleur: '#7c2f6d', clair: '#b166a2', capitale: 'balkans' }
  };

  /* Factions que le joueur peut incarner, dans l'ordre du menu. */
  var JOUABLES = ['fr', 'gb', 'pr', 'au', 'ru', 'es', 'ot'];

  /* ------------------------------------------------------------------ */
  /* Provinces                                                           */
  /* ------------------------------------------------------------------ */
  /* Carte stylisée de l'Europe dans un repère de 1200 × 820.
     `poly` : contour de la province. `ville` : position du marqueur. */

  var PROVINCES = [
    { id: 'ecosse',    nom: 'Écosse',            ville: 'Édimbourg',      rev: 70,  depart: 'gb',
      poly: [[230,110],[298,104],[314,164],[272,202],[226,180]] },
    { id: 'angleterre',nom: 'Angleterre',        ville: 'Londres',        rev: 150, depart: 'gb', port: true,
      poly: [[226,188],[274,200],[316,236],[300,302],[248,320],[216,264]] },
    { id: 'irlande',   nom: 'Irlande',           ville: 'Dublin',         rev: 70,  depart: 'gb',
      poly: [[118,200],[186,194],[202,250],[168,292],[122,276]] },

    { id: 'portugal',  nom: 'Portugal',          ville: 'Lisbonne',       rev: 80,  depart: 'gb', port: true,
      poly: [[108,528],[152,522],[162,602],[140,662],[102,640]] },
    { id: 'castille',  nom: 'Castille',          ville: 'Madrid',         rev: 120, depart: 'es',
      poly: [[152,522],[256,512],[292,560],[276,642],[194,668],[158,606]] },
    { id: 'catalogne', nom: 'Catalogne',         ville: 'Barcelone',      rev: 100, depart: 'es', port: true,
      poly: [[256,512],[322,498],[348,546],[300,574],[286,556]] },

    { id: 'bretagne',  nom: 'Bretagne',          ville: 'Rennes',         rev: 90,  depart: 'fr', port: true,
      poly: [[193,374],[246,362],[272,396],[250,428],[198,422]] },
    { id: 'paris',     nom: 'Île-de-France',     ville: 'Paris',          rev: 160, depart: 'fr',
      poly: [[270,348],[342,338],[376,380],[346,422],[284,416],[260,384]] },
    { id: 'aquitaine', nom: 'Aquitaine',         ville: 'Bordeaux',       rev: 110, depart: 'fr', port: true,
      poly: [[248,430],[332,424],[352,470],[320,516],[260,512],[238,464]] },
    { id: 'provence',  nom: 'Provence',          ville: 'Marseille',      rev: 110, depart: 'fr', port: true,
      poly: [[332,424],[402,434],[422,486],[380,522],[330,510]] },
    { id: 'flandre',   nom: 'Flandre',           ville: 'Bruxelles',      rev: 130, depart: 'fr', port: true,
      poly: [[354,304],[422,298],[436,346],[394,362],[356,346]] },

    { id: 'piemont',   nom: 'Piémont',           ville: 'Turin',          rev: 100, depart: 'fr',
      poly: [[408,478],[466,472],[486,520],[454,556],[413,540]] },
    { id: 'rome',      nom: 'États pontificaux', ville: 'Rome',           rev: 100, depart: 'au', port: true,
      poly: [[458,544],[506,538],[526,596],[494,636],[460,600]] },
    { id: 'naples',    nom: 'Naples',            ville: 'Naples',         rev: 100, depart: 'es', port: true,
      poly: [[498,618],[546,613],[572,666],[534,702],[496,668]] },

    { id: 'rhenanie',  nom: 'Rhénanie',          ville: 'Cologne',        rev: 120, depart: 'pr',
      poly: [[423,338],[486,332],[506,386],[470,416],[428,400]] },
    { id: 'baviere',   nom: 'Bavière',           ville: 'Munich',         rev: 110, depart: 'au',
      poly: [[484,394],[552,388],[572,442],[526,472],[487,444]] },
    { id: 'saxe',      nom: 'Saxe',              ville: 'Dresde',         rev: 110, depart: 'pr',
      poly: [[493,318],[562,313],[582,362],[540,392],[498,370]] },
    { id: 'prusse',    nom: 'Prusse',            ville: 'Berlin',         rev: 150, depart: 'pr',
      poly: [[553,263],[642,258],[668,312],[616,348],[558,320]] },
    { id: 'danemark',  nom: 'Danemark',          ville: 'Copenhague',     rev: 90,  depart: 'pr', port: true,
      poly: [[493,203],[552,198],[567,252],[526,278],[494,250]] },
    { id: 'autriche',  nom: 'Autriche',          ville: 'Vienne',         rev: 150, depart: 'au',
      poly: [[563,393],[632,386],[658,436],[616,472],[568,450]] },
    { id: 'hongrie',   nom: 'Hongrie',           ville: 'Budapest',       rev: 110, depart: 'au',
      poly: [[648,403],[727,398],[753,456],[701,492],[650,460]] },

    { id: 'suede',     nom: 'Suède',             ville: 'Stockholm',      rev: 90,  depart: 'ru', port: true,
      poly: [[578,78],[662,68],[692,140],[650,202],[588,176],[568,120]] },

    { id: 'pologne',   nom: 'Pologne',           ville: 'Varsovie',       rev: 120, depart: 'ru',
      poly: [[663,278],[747,270],[777,326],[727,372],[666,340]] },
    { id: 'baltique',  nom: 'Provinces baltes',  ville: 'Riga',           rev: 100, depart: 'ru', port: true,
      poly: [[743,188],[827,178],[852,242],[802,287],[746,256]] },
    { id: 'moscou',    nom: 'Moscovie',          ville: 'Moscou',         rev: 160, depart: 'ru',
      poly: [[858,158],[982,148],[1032,232],[962,302],[873,272],[843,210]] },
    { id: 'ukraine',   nom: 'Ukraine',           ville: 'Kiev',           rev: 110, depart: 'ru',
      poly: [[808,328],[907,318],[957,382],[902,442],[818,417]] },

    { id: 'balkans',   nom: 'Roumélie',          ville: 'Constantinople', rev: 150, depart: 'ot', port: true,
      poly: [[718,493],[802,483],[842,542],[792,592],[723,567]] },
    { id: 'grece',     nom: 'Grèce',             ville: 'Athènes',        rev: 90,  depart: 'ot', port: true,
      poly: [[723,608],[792,598],[812,657],[767,697],[720,662]] }
  ];

  /* Frontières et liaisons maritimes. Les liens sont déclarés une fois
     puis rendus symétriques au chargement. */
  var LIENS = [
    ['ecosse', 'angleterre'], ['ecosse', 'irlande'], ['angleterre', 'irlande'],
    ['angleterre', 'flandre', 'mer'], ['angleterre', 'bretagne', 'mer'],
    ['angleterre', 'portugal', 'mer'], ['angleterre', 'danemark', 'mer'],

    ['portugal', 'castille'], ['castille', 'catalogne'], ['castille', 'aquitaine'],
    ['catalogne', 'aquitaine'], ['catalogne', 'provence'],

    ['bretagne', 'paris'], ['bretagne', 'aquitaine'],
    ['paris', 'flandre'], ['paris', 'aquitaine'], ['paris', 'provence'], ['paris', 'rhenanie'],
    ['aquitaine', 'provence'],
    ['provence', 'piemont'], ['provence', 'rome', 'mer'],
    ['flandre', 'rhenanie'],

    ['piemont', 'rome'], ['piemont', 'baviere'], ['piemont', 'autriche'],
    ['rome', 'naples'], ['naples', 'grece', 'mer'], ['naples', 'balkans', 'mer'],

    ['rhenanie', 'saxe'], ['rhenanie', 'baviere'],
    ['saxe', 'prusse'], ['saxe', 'baviere'], ['saxe', 'pologne'], ['saxe', 'autriche'],
    ['baviere', 'autriche'],
    ['prusse', 'danemark'], ['prusse', 'pologne'], ['prusse', 'baltique'],
    ['danemark', 'suede', 'mer'],
    ['autriche', 'hongrie'], ['autriche', 'pologne'],
    ['hongrie', 'balkans'], ['hongrie', 'pologne'], ['hongrie', 'ukraine'],

    ['suede', 'baltique', 'mer'],
    ['pologne', 'baltique'], ['pologne', 'ukraine'],
    ['baltique', 'moscou'], ['moscou', 'ukraine'],
    ['ukraine', 'balkans'], ['balkans', 'grece']
  ];

  /* ------------------------------------------------------------------ */
  /* Types d'unités                                                      */
  /* ------------------------------------------------------------------ */
  /* portee/vitesse en unités du champ de bataille ; cadence en ms.
     `precision` = fraction des hommes qui touchent à bout portant.
     `melee` = pertes infligées par homme et par seconde au contact. */

  var UNITES = {
    ligne: {
      nom: 'Infanterie de ligne', court: 'Ligne', cat: 'inf',
      hommes: 120, cout: 300, entretien: 28,
      portee: 95, precision: 0.055, cadence: 3400, melee: 0.30,
      bravoure: 70, vitesse: 22, rangs: 3,
      desc: "L'ossature de toute armée. Solide en ligne, redoutable en salve."
    },
    legere: {
      nom: 'Infanterie légère', court: 'Légère', cat: 'inf',
      hommes: 90, cout: 340, entretien: 30,
      portee: 135, precision: 0.070, cadence: 3000, melee: 0.20,
      bravoure: 66, vitesse: 27, rangs: 2,
      desc: 'Tire de plus loin et plus juste, mais cède vite au corps à corps.'
    },
    grenadiers: {
      nom: 'Grenadiers', court: 'Grenadiers', cat: 'inf',
      hommes: 100, cout: 520, entretien: 46,
      portee: 95, precision: 0.062, cadence: 3200, melee: 0.46,
      bravoure: 88, vitesse: 22, rangs: 3,
      desc: 'Troupe d’élite. Tient là où la ligne rompt.'
    },
    garde: {
      nom: 'Garde impériale', court: 'Garde', cat: 'inf',
      hommes: 120, cout: 820, entretien: 72,
      portee: 100, precision: 0.072, cadence: 3000, melee: 0.54,
      bravoure: 100, vitesse: 23, rangs: 3, reserve: 'fr',
      desc: "La Garde ne se rend pas. Réservée à l'Empereur."
    },
    cavalerie: {
      nom: 'Chasseurs à cheval', court: 'Chasseurs', cat: 'cav',
      hommes: 48, cout: 450, entretien: 44,
      portee: 0, precision: 0, cadence: 0, melee: 0.70,
      bravoure: 74, vitesse: 58, rangs: 2, charge: 2.6,
      desc: 'Rapide. Tourne les flancs et achève les fuyards.'
    },
    cuirassiers: {
      nom: 'Cuirassiers', court: 'Cuirassiers', cat: 'cav',
      hommes: 40, cout: 640, entretien: 58,
      portee: 0, precision: 0, cadence: 0, melee: 1.05,
      bravoure: 86, vitesse: 48, rangs: 2, charge: 3.4,
      desc: 'Cavalerie lourde. Une charge bien menée brise une ligne.'
    },
    artillerie: {
      nom: 'Artillerie à pied', court: 'Canons', cat: 'art',
      hommes: 18, cout: 560, entretien: 50,
      portee: 330, precision: 0.34, cadence: 5200, melee: 0.10,
      bravoure: 52, vitesse: 12, rangs: 2,
      desc: "L'argument de l'Empereur. Portée immense, moral dévastateur."
    }
  };

  /* Ordre d'affichage dans le panneau de recrutement. */
  var ORDRE_UNITES = ['ligne', 'legere', 'grenadiers', 'garde', 'cavalerie', 'cuirassiers', 'artillerie'];

  /* ------------------------------------------------------------------ */
  /* Index dérivés                                                       */
  /* ------------------------------------------------------------------ */

  var parId = {};
  PROVINCES.forEach(function (p) {
    p.voisins = [];
    p.mers = {};
    /* Centre = barycentre du contour, utilisé pour les marqueurs. */
    var sx = 0, sy = 0;
    p.poly.forEach(function (pt) { sx += pt[0]; sy += pt[1]; });
    p.cx = sx / p.poly.length;
    p.cy = sy / p.poly.length;
    parId[p.id] = p;
  });

  LIENS.forEach(function (lien) {
    var a = parId[lien[0]], b = parId[lien[1]], mer = lien[2] === 'mer';
    if (!a || !b) throw new Error('Lien invalide : ' + lien.join('-'));
    if (a.voisins.indexOf(b.id) === -1) a.voisins.push(b.id);
    if (b.voisins.indexOf(a.id) === -1) b.voisins.push(a.id);
    if (mer) { a.mers[b.id] = true; b.mers[a.id] = true; }
  });

  JEU.D = {
    FACTIONS: FACTIONS,
    JOUABLES: JOUABLES,
    PROVINCES: PROVINCES,
    PROV: parId,
    UNITES: UNITES,
    ORDRE_UNITES: ORDRE_UNITES,
    LARGEUR_CARTE: 1200,
    HAUTEUR_CARTE: 820,
    /* Un joueur l'emporte en tenant cette part des provinces. */
    PROVINCES_VICTOIRE: 20
  };
})(window);
