/* Visionneuse de la galerie : ouverture au clic, navigation clavier,
   retour du focus sur la vignette d'origine à la fermeture. */

(function () {
  "use strict";

  var gallery = document.getElementById("gallery");
  var lightbox = document.getElementById("lightbox");
  if (!gallery || !lightbox) return;

  var lbImg = document.getElementById("lb-img");
  var lbCaption = document.getElementById("lb-caption");
  var btnClose = document.getElementById("lb-close");
  var btnPrev = document.getElementById("lb-prev");
  var btnNext = document.getElementById("lb-next");

  var shots = Array.prototype.slice.call(gallery.querySelectorAll(".shot"));
  var current = 0;
  var lastFocused = null;

  function show(index) {
    current = (index + shots.length) % shots.length;
    var shot = shots[current];
    var img = shot.querySelector("img");
    lbImg.src = img.currentSrc || img.src;
    lbImg.alt = img.alt;
    lbCaption.textContent = shot.dataset.caption || "";
  }

  function open(index) {
    lastFocused = document.activeElement;
    show(index);
    lightbox.hidden = false;
    document.body.style.overflow = "hidden";
    btnClose.focus();
  }

  function close() {
    lightbox.hidden = true;
    // removeAttribute, et non src = "" : une source vide relancerait une
    // requête vers la page elle-même.
    lbImg.removeAttribute("src");
    document.body.style.overflow = "";
    if (lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus();
    }
  }

  shots.forEach(function (shot, index) {
    shot.addEventListener("click", function () { open(index); });
  });

  btnClose.addEventListener("click", close);
  btnPrev.addEventListener("click", function () { show(current - 1); });
  btnNext.addEventListener("click", function () { show(current + 1); });

  lightbox.addEventListener("click", function (event) {
    if (event.target === lightbox) close();
  });

  document.addEventListener("keydown", function (event) {
    if (lightbox.hidden) return;

    if (event.key === "Escape") {
      close();
    } else if (event.key === "ArrowLeft") {
      show(current - 1);
    } else if (event.key === "ArrowRight") {
      show(current + 1);
    } else if (event.key === "Tab") {
      // Maintient le focus à l'intérieur de la visionneuse.
      var focusables = [btnClose, btnPrev, btnNext];
      var index = focusables.indexOf(document.activeElement);
      var next = event.shiftKey ? index - 1 : index + 1;
      event.preventDefault();
      focusables[(next + focusables.length) % focusables.length].focus();
    }
  });

  // Balayage horizontal sur mobile.
  var touchStartX = null;
  lightbox.addEventListener("touchstart", function (event) {
    touchStartX = event.changedTouches[0].clientX;
  }, { passive: true });

  lightbox.addEventListener("touchend", function (event) {
    if (touchStartX === null) return;
    var delta = event.changedTouches[0].clientX - touchStartX;
    if (Math.abs(delta) > 50) show(current + (delta < 0 ? 1 : -1));
    touchStartX = null;
  }, { passive: true });
})();
