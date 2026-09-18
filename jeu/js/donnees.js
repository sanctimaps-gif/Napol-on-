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
  /* Une province n'est plus un contour dessiné à vue : elle est définie
     par sa capitale, à ses coordonnées réelles. Le territoire lui est
     attribué par la partition du continent (voir partition.js), ce qui
     donne des frontières plausibles et, surtout, jointives. */

  var PROVINCES = [
    { id: 'ecosse',    nom: 'Écosse',            ville: 'Édimbourg',      lon: -3.19, lat: 55.95, rev: 70,  depart: 'gb' },
    { id: 'angleterre',nom: 'Angleterre',        ville: 'Londres',        lon: -0.13, lat: 51.51, rev: 150, depart: 'gb', port: true },
    { id: 'irlande',   nom: 'Irlande',           ville: 'Dublin',         lon: -6.26, lat: 53.35, rev: 70,  depart: 'gb' },

    { id: 'portugal',  nom: 'Portugal',          ville: 'Lisbonne',       lon: -9.14, lat: 38.72, rev: 80,  depart: 'gb', port: true },
    { id: 'castille',  nom: 'Castille',          ville: 'Madrid',         lon: -3.70, lat: 40.42, rev: 120, depart: 'es' },
    { id: 'catalogne', nom: 'Catalogne',         ville: 'Barcelone',      lon: 2.17,  lat: 41.39, rev: 100, depart: 'es', port: true },

    { id: 'bretagne',  nom: 'Bretagne',          ville: 'Rennes',         lon: -1.68, lat: 48.11, rev: 90,  depart: 'fr', port: true },
    { id: 'paris',     nom: 'Île-de-France',     ville: 'Paris',          lon: 2.35,  lat: 48.86, rev: 160, depart: 'fr' },
    { id: 'aquitaine', nom: 'Aquitaine',         ville: 'Bordeaux',       lon: -0.58, lat: 44.84, rev: 110, depart: 'fr', port: true },
    { id: 'provence',  nom: 'Provence',          ville: 'Marseille',      lon: 5.37,  lat: 43.30, rev: 110, depart: 'fr', port: true },
    { id: 'flandre',   nom: 'Flandre',           ville: 'Bruxelles',      lon: 4.35,  lat: 50.85, rev: 130, depart: 'fr', port: true },

    { id: 'piemont',   nom: 'Piémont',           ville: 'Turin',          lon: 7.69,  lat: 45.07, rev: 100, depart: 'fr' },
    { id: 'rome',      nom: 'États pontificaux', ville: 'Rome',           lon: 12.50, lat: 41.90, rev: 100, depart: 'au', port: true },
    { id: 'naples',    nom: 'Naples',            ville: 'Naples',         lon: 14.27, lat: 40.85, rev: 100, depart: 'es', port: true },

    { id: 'rhenanie',  nom: 'Rhénanie',          ville: 'Cologne',        lon: 6.96,  lat: 50.94, rev: 120, depart: 'pr' },
    { id: 'baviere',   nom: 'Bavière',           ville: 'Munich',         lon: 11.58, lat: 48.14, rev: 110, depart: 'au' },
    { id: 'saxe',      nom: 'Saxe',              ville: 'Dresde',         lon: 13.74, lat: 51.05, rev: 110, depart: 'pr' },
    { id: 'prusse',    nom: 'Prusse',            ville: 'Berlin',         lon: 13.40, lat: 52.52, rev: 150, depart: 'pr' },
    { id: 'danemark',  nom: 'Danemark',          ville: 'Copenhague',     lon: 12.57, lat: 55.68, rev: 90,  depart: 'pr', port: true },
    { id: 'autriche',  nom: 'Autriche',          ville: 'Vienne',         lon: 16.37, lat: 48.21, rev: 150, depart: 'au' },
    { id: 'hongrie',   nom: 'Hongrie',           ville: 'Budapest',       lon: 19.04, lat: 47.50, rev: 110, depart: 'au' },

    { id: 'suede',     nom: 'Suède',             ville: 'Stockholm',      lon: 18.07, lat: 59.33, rev: 90,  depart: 'ru', port: true },
    { id: 'pologne',   nom: 'Pologne',           ville: 'Varsovie',       lon: 21.01, lat: 52.23, rev: 120, depart: 'ru' },
    { id: 'baltique',  nom: 'Provinces baltes',  ville: 'Riga',           lon: 24.11, lat: 56.95, rev: 100, depart: 'ru', port: true },
    { id: 'moscou',    nom: 'Moscovie',          ville: 'Moscou',         lon: 37.62, lat: 55.75, rev: 160, depart: 'ru' },
    { id: 'ukraine',   nom: 'Ukraine',           ville: 'Kiev',           lon: 30.52, lat: 50.45, rev: 110, depart: 'ru' },

    { id: 'balkans',   nom: 'Roumélie',          ville: 'Constantinople', lon: 28.98, lat: 41.01, rev: 150, depart: 'ot', port: true },
    { id: 'grece',     nom: 'Grèce',             ville: 'Athènes',        lon: 23.73, lat: 37.98, rev: 90,  depart: 'ot', port: true }
  ];


  /* Les frontières terrestres sont déduites de la partition du continent
     (voir partition.js) : deux provinces qui se touchent sur la carte
     sont voisines, sans qu'on ait à le déclarer. Restent les routes
     maritimes, qui, elles, relèvent d'un choix. */
  var ROUTES_MARITIMES = [
    ['angleterre', 'flandre'],    /* le Pas de Calais */
    ['angleterre', 'bretagne'],   /* la Manche */
    ['angleterre', 'irlande'],
    ['ecosse', 'irlande'],
    ['angleterre', 'danemark'],   /* la mer du Nord */
    ['angleterre', 'portugal'],   /* la vieille alliance */
    ['danemark', 'suede'],        /* le Sund */
    ['suede', 'baltique'],
    ['provence', 'rome'],         /* la mer Tyrrhénienne */
    ['naples', 'grece'],          /* la mer Ionienne */
    ['naples', 'balkans'],
    ['catalogne', 'naples']       /* la route des Baléares */
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
  PROVINCES.forEach(function (p, i) {
    p.index = i;
    p.voisins = [];
    p.mers = {};
    /* Position de la capitale sur la carte. Le centre du territoire,
       lui, sera calculé par la partition. */
    var xy = JEU.Geo.geo(p.lon, p.lat);
    p.vx = xy[0];
    p.vy = xy[1];
    p.cx = xy[0];
    p.cy = xy[1];
    parId[p.id] = p;
  });

  /* Les routes maritimes sont des voisinages au même titre que les
     frontières, mais marquées comme tels. */
  ROUTES_MARITIMES.forEach(function (lien) {
    var a = parId[lien[0]], b = parId[lien[1]];
    if (!a || !b) throw new Error('Route maritime invalide : ' + lien.join('-'));
    if (a.voisins.indexOf(b.id) === -1) a.voisins.push(b.id);
    if (b.voisins.indexOf(a.id) === -1) b.voisins.push(a.id);
    a.mers[b.id] = true;
    b.mers[a.id] = true;
  });

  JEU.D = {
    FACTIONS: FACTIONS,
    JOUABLES: JOUABLES,
    PROVINCES: PROVINCES,
    PROV: parId,
    UNITES: UNITES,
    ORDRE_UNITES: ORDRE_UNITES,
    LARGEUR_CARTE: JEU.Geo.LARGEUR,
    HAUTEUR_CARTE: JEU.Geo.HAUTEUR,
    /* Un joueur l'emporte en tenant cette part des provinces. */
    PROVINCES_VICTOIRE: 20
  };
})(window);
