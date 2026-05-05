/* content.js — main entry, init orchestration, active-item sync */
"use strict";

(function () {
  var initialized = false;
  var scrollSyncTimer = null;

  function init() {
    if (initialized) {
      // re-scan only — sidebar already exists
      buildTOC();
      return;
    }
    initialized = true;
    log("init on " + getPlatformName());

    loadSettings();

    createSidebar();

    if (window._isVisible !== false) {
      applyLayoutMargin();
    } else {
      sidebar.classList.add("ctoc-hidden");
      toggleBtn.classList.add("ctoc-visible");
    }

    startObserver();
    buildTOC();

    // lazy scroll → re-scan
    var lazyTimer;
    window.addEventListener("scroll", function () {
      clearTimeout(lazyTimer);
      lazyTimer = setTimeout(buildTOC, 600);
    }, { passive: true });

    // scroll → sync active TOC item
    window.addEventListener("scroll", function () {
      clearTimeout(scrollSyncTimer);
      scrollSyncTimer = setTimeout(syncActiveItem, 200);
    }, { passive: true });

    window.addEventListener("resize", function () {
      layoutEl = null;
      if (isVisible) applyLayoutMargin();
    });
  }

  function waitForChat() {
    if (findAllMessages().length > 0) { init(); return; }

    var attempts = 0;
    var timer = setInterval(function () {
      attempts++;
      if (findAllMessages().length > 0) {
        clearInterval(timer);
        init();
      } else if (attempts >= 60) {
        clearInterval(timer);
        createSidebar();
      }
    }, 500);
  }

  // ---- entry ----
  if (document.readyState === "complete") waitForChat();
  else window.addEventListener("load", waitForChat);

  // SPA navigation
  var lastUrl = location.href;
  new MutationObserver(function () {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      layoutEl = null;
      setTimeout(waitForChat, 1500);
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
