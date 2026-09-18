/* Son entièrement synthétisé par WebAudio : aucun fichier à télécharger.
   Coupé par défaut — l'AudioContext n'est créé qu'au premier geste du
   joueur, comme l'exigent les navigateurs mobiles. */

(function (global) {
  'use strict';

  var JEU = global.JEU = global.JEU || {};

  var ctx = null;
  var maitre = null;
  var actif = false;
  var dernierTir = 0;

  function init() {
    if (ctx) return true;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
      maitre = ctx.createGain();
      maitre.gain.value = 0.35;
      maitre.connect(ctx.destination);
      return true;
    } catch (e) {
      ctx = null;
      return false;
    }
  }

  /* Bruit blanc filtré : sert de base aux détonations. */
  function bruit(duree) {
    var n = Math.max(1, Math.floor(ctx.sampleRate * duree));
    var tampon = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = tampon.getChannelData(0);
    for (var i = 0; i < n; i++) {
      /* Décroissance exponentielle : attaque sèche, traîne courte. */
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.2);
    }
    var src = ctx.createBufferSource();
    src.buffer = tampon;
    return src;
  }

  function jouer(config) {
    if (!actif || !ctx) return;
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* ignoré */ } }

    var src = bruit(config.duree);
    var filtre = ctx.createBiquadFilter();
    filtre.type = config.type || 'lowpass';
    filtre.frequency.value = config.freq;
    filtre.Q.value = config.q || 1;

    var gain = ctx.createGain();
    var t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(config.volume, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0008, t + config.duree);

    src.connect(filtre);
    filtre.connect(gain);
    gain.connect(maitre);
    src.start(t);
    src.stop(t + config.duree + 0.02);
  }

  var API = {
    /* Appelé au premier geste : autorise et amorce le contexte. */
    eveiller: function () {
      if (!actif) return;
      if (init() && ctx.state === 'suspended') {
        try { ctx.resume(); } catch (e) { /* ignoré */ }
      }
    },

    estActif: function () { return actif; },

    basculer: function () {
      actif = !actif;
      if (actif) { init(); API.eveiller(); }
      return actif;
    },

    /* Salve de mousqueterie — limitée pour ne pas saturer quand dix
       bataillons tirent dans la même seconde. */
    salve: function () {
      var maintenant = (global.performance ? performance.now() : Date.now());
      if (maintenant - dernierTir < 70) return;
      dernierTir = maintenant;
      jouer({ duree: 0.22, freq: 1900, q: 0.7, volume: 0.30 });
    },

    canon: function () {
      jouer({ duree: 0.75, freq: 180, q: 1.2, volume: 0.85 });
      jouer({ duree: 0.20, freq: 900, q: 0.6, volume: 0.25 });
    },

    charge: function () {
      jouer({ duree: 0.55, freq: 420, q: 2.5, volume: 0.45 });
    },

    deroute: function () {
      jouer({ duree: 0.9, freq: 300, type: 'bandpass', q: 3, volume: 0.4 });
    }
  };

  JEU.Audio = API;
})(window);
