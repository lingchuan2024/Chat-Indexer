(function () {
  "use strict";

  if (window.__ctocFetchBridgeInstalled) return;
  window.__ctocFetchBridgeInstalled = true;

  function toUrl(input) {
    if (typeof input === "string") return input;
    if (input && typeof input.url === "string") return input.url;
    return "";
  }

  function isConversationPayload(url, data) {
    if (!data || !data.mapping) return false;
    return /conversation/i.test(url || "");
  }

  function emitConversationData(url, data) {
    try {
      window.dispatchEvent(new CustomEvent("ctoc:conversation-data", {
        detail: {
          url: url || "",
          payload: data,
        },
      }));
    } catch (_) {}
  }

  var originalFetch = window.fetch;
  if (typeof originalFetch !== "function") return;

  window.fetch = function () {
    var fetchArgs = arguments;
    var requestUrl = toUrl(fetchArgs[0]);
    return originalFetch.apply(this, fetchArgs).then(function (response) {
      try {
        if (!/conversation/i.test(requestUrl)) return response;
        response.clone().json().then(function (data) {
          if (isConversationPayload(requestUrl, data)) {
            emitConversationData(requestUrl, data);
          }
        }).catch(function () {});
      } catch (_) {}
      return response;
    });
  };
})();
