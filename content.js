/* content.js — main entry, init orchestration, active-item sync */
"use strict";

(function () {
  var initialized = false;
  var scrollSyncTimer = null;
  var bridgeInjected = false;
  var requestToken = "";
  var navigationVersion = 0;

  function injectChatGPTBridge() {
    if (!isChatGPTHost() || bridgeInjected) return;
    bridgeInjected = true;

    var script = document.createElement("script");
    script.src = chrome.runtime.getURL("page-bridge.js");
    script.async = false;
    script.dataset.ctocBridge = "true";
    (document.documentElement || document.head || document.body).appendChild(script);
    script.onload = function () {
      script.remove();
    };
  }

  async function requestChatGPTConversationData() {
    if (!isChatGPTHost()) return;

    var conversationId = getConversationIdFromLocation();
    if (!conversationId) return;
    if (getCachedConversationGroups(conversationId).length > 0) return;
    if (requestToken === conversationId) return;
    requestToken = conversationId;
    var requestVersion = navigationVersion;

    var candidates = [
      location.origin + "/backend-api/conversation/" + conversationId,
      location.origin + "/backend-api/conversation/" + conversationId + "?tree=false&rendering_mode=raw",
      location.origin + "/backend-api/conversation/" + conversationId + "?history_and_training_disabled=false",
    ];

    try {
      for (var i = 0; i < candidates.length; i++) {
        try {
          var res = await fetch(candidates[i], {
            credentials: "include",
            headers: { accept: "application/json" },
          });
          if (!res.ok) continue;
          var data = await res.json();
          if (ingestConversationPayload(data, candidates[i])) {
            if (requestVersion !== navigationVersion) break;
            if (getConversationIdFromLocation() !== conversationId) break;
            buildTOC();
            break;
          }
        } catch (_) {}
      }
    } finally {
      if (requestToken === conversationId) requestToken = "";
    }
  }

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
    requestChatGPTConversationData();
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
    var conversationId = getConversationIdFromLocation();
    if (findAllMessages().length > 0 || getCachedConversationGroups(conversationId).length > 0) { init(); return; }

    var attempts = 0;
    var timer = setInterval(function () {
      attempts++;
      if (location.href !== lastUrl) {
        clearInterval(timer);
        return;
      }
      if (findAllMessages().length > 0 || getCachedConversationGroups(getConversationIdFromLocation()).length > 0) {
        clearInterval(timer);
        init();
      } else if (attempts >= 60) {
        clearInterval(timer);
        createSidebar();
      }
    }, 500);
  }

  window.addEventListener("ctoc:conversation-data", function (event) {
    var detail = event.detail || {};
    var sourceUrl = detail.url || "";
    var payload = detail.payload || detail.data || detail;
    var targetConversationId = getConversationIdFromPayload(payload, sourceUrl);
    if (ingestConversationPayload(payload, sourceUrl) && targetConversationId === getConversationIdFromLocation()) {
      buildTOC();
    }
  });

  // ---- entry ----
  injectChatGPTBridge();
  requestChatGPTConversationData();
  if (document.readyState === "complete") waitForChat();
  else window.addEventListener("load", waitForChat);

  // SPA navigation
  var lastUrl = location.href;
  new MutationObserver(function () {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      navigationVersion++;
      requestToken = "";
      resetConversationState();
      layoutEl = null;
      injectChatGPTBridge();
      requestChatGPTConversationData();
      setTimeout(waitForChat, 1500);
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
