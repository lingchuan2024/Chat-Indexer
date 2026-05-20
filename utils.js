/* utils.js — shared helpers, no side effects */
"use strict";

const DEBUG = false;
var navigationHistory = [];
var isRestoringNavigation = false;

function log(...args) { if (DEBUG) console.log("[AITOC]", ...args); }

function stripMarkdown(text) {
  // remove common markdown formatting, keep plain text
  return text
    .replace(/^#{1,6}\s+/gm, "")       // headings
    .replace(/\*\*(.+?)\*\*/g, "$1")    // bold
    .replace(/__(.+?)__/g, "$1")        // bold alt
    .replace(/\*(.+?)\*/g, "$1")        // italic
    .replace(/_(.+?)_/g, "$1")          // italic alt
    .replace(/`{1,3}[^`]*`{1,3}/g, "")  // inline & block code
    .replace(/\[(.+?)\]\(.+?\)/g, "$1") // links
    .replace(/!\[.*?\]\(.+?\)/g, "")    // images
    .replace(/^>\s*/gm, "")             // blockquote
    .replace(/^[*-]\s+/gm, "")          // unordered list
    .replace(/^\d+\.\s+/gm, "")         // ordered list
    .replace(/~~(.+?)~~/g, "$1")        // strikethrough
    .replace(/\|/g, " ")                // table pipes
    .replace(/---+/g, "")               // horizontal rules
    .replace(/\s+/g, " ")               // collapse whitespace
    .trim();
}

function cleanUserText(text) {
  // strip noise from user messages: file uploads, citations, search context, etc.
  return text
    // ChatGPT file upload indicators
    .replace(/^Uploaded file[s]?:[^\n]*\n*/gi, "")
    .replace(/^I uploaded:[^\n]*\n*/gi, "")
    .replace(/^Attached (file|document|image)[s]?:[^\n]*\n*/gi, "")
    .replace(/^File[s]? attached:[^\n]*\n*/gi, "")
    .replace(/^Here is (a|the) (file|document):[^\n]*\n*/gi, "")
    // citation markers
    .replace(/\[\^?\d+\]/g, "")
    .replace(/\[\d+(?:,\d+)*\]/g, "")
    // "Search:" / "Searched:" prefix from web-search mode
    .replace(/^(Search(ed)?|搜(索|了))[：:][^\n]*\n*/gi, "")
    // "You said:" / "Previous:" context prefixes
    .replace(/^(You said|Previous(ly)?|Context)[：:][^\n]*\n*/gi, "")
    // collapse whitespace
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncate(text, maxLen) {
  var clean = stripMarkdown(cleanUserText(text));
  var line = clean.split("\n")[0].trim();
  if (!line) line = clean;
  if (line.length <= maxLen) return line;
  return line.slice(0, maxLen).trimEnd() + "…";
}

function normalizeComparableText(text) {
  return stripMarkdown(String(text || ""))
    .toLowerCase()
    .replace(/^[\s#>*-]+/, "")
    .replace(/^\d+[\.\)\-:：]\s*/, "")
    .replace(/^[一二三四五六七八九十]+\s*[、.．]\s*/, "")
    .replace(/[()（）【】\[\]{}"'`‘’“”、,，.。:：;；!?！？/\\|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function groupsEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].title !== b[i].title) return false;
    if (a[i].assistantText !== b[i].assistantText) return false;
    if (a[i].subs.length !== b[i].subs.length) return false;
    for (let j = 0; j < a[i].subs.length; j++) {
      if (a[i].subs[j].title !== b[i].subs[j].title) return false;
    }
  }
  return true;
}

function isChatGPTHost() {
  return PLATFORM_HOST === "chatgpt.com" || PLATFORM_HOST === "chat.openai.com";
}

function extractConversationIdFromUrl(url) {
  if (!url) return "";
  var match = String(url).match(/\/conversation\/([a-zA-Z0-9-]+)/);
  return match ? match[1] : "";
}

function getConversationIdFromLocation() {
  var path = location.pathname || "";
  var match = path.match(/\/c\/([a-zA-Z0-9-]+)/) || path.match(/\/chat\/([a-zA-Z0-9-]+)/);
  return match ? match[1] : "";
}

function getConversationCacheKey(conversationId) {
  if (!isChatGPTHost()) return "";
  var targetConversationId = conversationId || getConversationIdFromLocation();
  if (!targetConversationId) return "";
  return "ctoc-chatgpt-cache::" + targetConversationId;
}

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return fallback;
  }
}

function getScrollRoot() {
  var selectors = typeof getScrollSelectors === "function" ? getScrollSelectors() : [];
  for (var i = 0; i < selectors.length; i++) {
    try {
      var el = document.querySelector(selectors[i]);
      if (!el) continue;
      var style = window.getComputedStyle(el);
      var canScroll = el.scrollHeight - el.clientHeight > 40;
      if (canScroll && (style.overflowY === "auto" || style.overflowY === "scroll")) return el;
    } catch (_) {}
  }
  return document.scrollingElement || document.documentElement;
}

function isScrollableElement(el) {
  if (!el || el === document.body || el === document.documentElement) return false;
  var style = window.getComputedStyle(el);
  var overflowY = style.overflowY;
  return (overflowY === "auto" || overflowY === "scroll") && el.scrollHeight - el.clientHeight > 40;
}

function getNearestScrollableAncestor(el) {
  var current = el;
  while (current && current !== document.body) {
    if (isScrollableElement(current)) return current;
    current = current.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

function isIgnoredAnchorNode(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return true;
  if (node.id === "ctoc-sidebar" || node.id === "ctoc-toggle-btn") return true;
  if (node.closest && (node.closest("#ctoc-sidebar") || node.closest("#ctoc-toggle-btn"))) return true;
  if (/^(button|input|textarea|svg|path)$/i.test(node.tagName)) return true;
  return false;
}

function findAnchorFromNode(node) {
  var current = node;
  var best = null;

  while (current && current !== document.body) {
    if (isIgnoredAnchorNode(current)) {
      current = current.parentElement;
      continue;
    }

    var text = (current.textContent || "").trim();
    if (text.length >= 20) best = current;

    if (/^(p|li|pre|blockquote|h1|h2|h3|h4|article|section)$/i.test(current.tagName)) {
      return current;
    }

    current = current.parentElement;
  }

  return best;
}

function findNavigationAnchor() {
  var x = Math.max(24, Math.floor(window.innerWidth * 0.5));
  var yCandidates = [
    Math.floor(window.innerHeight * 0.4),
    Math.floor(window.innerHeight * 0.55),
    Math.floor(window.innerHeight * 0.3),
  ];

  for (var i = 0; i < yCandidates.length; i++) {
    var y = Math.max(24, yCandidates[i]);
    var stack = [];
    if (typeof document.elementsFromPoint === "function") stack = document.elementsFromPoint(x, y);
    else {
      var single = document.elementFromPoint(x, y);
      if (single) stack = [single];
    }

    for (var j = 0; j < stack.length; j++) {
      var anchor = findAnchorFromNode(stack[j]);
      if (anchor) return anchor;
    }
  }

  return null;
}

function getAnchorOffset(anchorEl, scrollEl, isDocumentScroll) {
  var anchorRect = anchorEl.getBoundingClientRect();
  if (isDocumentScroll) return anchorRect.top;
  var containerRect = scrollEl.getBoundingClientRect();
  return anchorRect.top - containerRect.top;
}

function captureNavigationSnapshot() {
  var anchorEl = findNavigationAnchor();
  var scrollEl = anchorEl ? getNearestScrollableAncestor(anchorEl) : getScrollRoot();
  if (!scrollEl) return null;

  var isDocumentScroll =
    scrollEl === document.body ||
    scrollEl === document.documentElement ||
    scrollEl === document.scrollingElement;

  return {
    anchorEl: anchorEl,
    anchorOffset: anchorEl ? getAnchorOffset(anchorEl, scrollEl, isDocumentScroll) : 0,
    isDocumentScroll: isDocumentScroll,
    scrollEl: isDocumentScroll ? null : scrollEl,
    scrollTop: isDocumentScroll ? window.scrollY : scrollEl.scrollTop,
  };
}

function notifyNavigationHistoryChange() {
  if (typeof updateReturnButtonState === "function") updateReturnButtonState();
}

function clearNavigationHistory() {
  navigationHistory = [];
  isRestoringNavigation = false;
  notifyNavigationHistoryChange();
}

function restoreNavigationSnapshot(snapshot, behavior) {
  if (!snapshot) return;

  var scrollEl = snapshot.isDocumentScroll
    ? (document.scrollingElement || document.documentElement)
    : (snapshot.scrollEl && snapshot.scrollEl.isConnected ? snapshot.scrollEl : getScrollRoot());

  var mode = behavior || "smooth";
  if (snapshot.anchorEl && snapshot.anchorEl.isConnected) {
    var anchorScrollEl = snapshot.isDocumentScroll
      ? (document.scrollingElement || document.documentElement)
      : getNearestScrollableAncestor(snapshot.anchorEl);
    var targetScrollEl = snapshot.isDocumentScroll ? scrollEl : anchorScrollEl;
    var targetTop = snapshot.scrollTop;

    if (snapshot.isDocumentScroll) {
      targetTop = window.scrollY + snapshot.anchorEl.getBoundingClientRect().top - snapshot.anchorOffset;
      window.scrollTo({ top: Math.max(0, targetTop), behavior: mode });
    } else if (targetScrollEl && typeof targetScrollEl.scrollTo === "function") {
      targetTop =
        targetScrollEl.scrollTop +
        getAnchorOffset(snapshot.anchorEl, targetScrollEl, false) -
        snapshot.anchorOffset;
      targetScrollEl.scrollTo({ top: Math.max(0, targetTop), behavior: mode });
    }
    return;
  }

  if (snapshot.isDocumentScroll) {
    window.scrollTo({ top: snapshot.scrollTop, behavior: mode });
  } else if (scrollEl && typeof scrollEl.scrollTo === "function") {
    scrollEl.scrollTo({ top: snapshot.scrollTop, behavior: mode });
  }
}

function rememberCurrentPosition() {
  if (isRestoringNavigation) return;

  var snapshot = captureNavigationSnapshot();
  if (!snapshot) return;

  var last = navigationHistory[navigationHistory.length - 1];
  if (
    last &&
    last.isDocumentScroll === snapshot.isDocumentScroll &&
    Math.abs(last.scrollTop - snapshot.scrollTop) < 24
  ) {
    return;
  }

  navigationHistory.push(snapshot);
  if (navigationHistory.length > 20) navigationHistory.shift();
  notifyNavigationHistoryChange();
}

function canReturnToPreviousPosition() {
  return navigationHistory.length > 0;
}

function returnToPreviousPosition() {
  var snapshot = navigationHistory.pop();
  if (!snapshot) {
    notifyNavigationHistoryChange();
    return;
  }

  isRestoringNavigation = true;
  restoreNavigationSnapshot(snapshot, "smooth");

  setTimeout(function () {
    isRestoringNavigation = false;
    if (typeof syncActiveItem === "function") syncActiveItem();
  }, 450);

  notifyNavigationHistoryChange();
}

function scrollToEl(el) {
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.style.transition = "box-shadow 0.3s";
  el.style.boxShadow = "0 0 0 3px rgba(16,163,127,0.5)";
  setTimeout(function () { el.style.boxShadow = ""; }, 2000);
}

function navigateToEl(el) {
  if (!el) return;
  rememberCurrentPosition();
  scrollToEl(el);
}

function findTextContainer(el, query) {
  var lower = query.toLowerCase();
  var best = el;
  var bestDepth = 0;
  (function walk(node, depth) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    var text = (node.textContent || "").toLowerCase();
    if (text.indexOf(lower) !== -1 && depth > bestDepth) {
      var tag = node.tagName;
      if (
        tag === "P" || tag === "LI" || tag === "TD" || tag === "TH" ||
        tag === "PRE" || tag === "BLOCKQUOTE" ||
        tag === "H1" || tag === "H2" || tag === "H3" || tag === "H4" ||
        tag === "H5" || tag === "H6" || tag === "DD" || tag === "DT" ||
        (tag === "DIV" && node.children.length <= 2)
      ) { best = node; bestDepth = depth; }
    }
    for (var i = 0; i < node.children.length; i++) walk(node.children[i], depth + 1);
  })(el, 0);
  return best !== el ? best : null;
}

function findBestTextMatch(el, query) {
  if (!el || !query) return null;

  var normalizedQuery = normalizeComparableText(query);
  if (!normalizedQuery) return null;

  var best = null;
  var bestScore = -Infinity;
  var selectors = "h1, h2, h3, h4, h5, h6, p, li, blockquote, pre, div";
  var candidates = el.matches && el.matches(selectors) ? [el] : [];
  candidates = candidates.concat(Array.from(el.querySelectorAll(selectors)));

  candidates.forEach(function (node) {
    var text = normalizeComparableText((node.textContent || "").trim());
    if (!text || text.length > 300) return;

    var score = -Infinity;
    if (text === normalizedQuery) score = 1000;
    else if (text.indexOf(normalizedQuery) === 0) score = 900 - Math.min(200, text.length - normalizedQuery.length);
    else if (text.indexOf(normalizedQuery) !== -1) score = 700 - Math.min(200, text.length - normalizedQuery.length);
    else if (normalizedQuery.indexOf(text) === 0 && text.length >= 8) score = 550 - (normalizedQuery.length - text.length);
    else if (typeof textLooksSimilar === "function" && textLooksSimilar(normalizedQuery, text)) score = 400;

    if (score > bestScore) {
      best = node;
      bestScore = score;
    }
  });

  return bestScore > 0 ? best : null;
}

function extractSnippet(text, query) {
  var lower = text.toLowerCase();
  var idx = lower.indexOf(query);
  if (idx === -1) return "…";
  var start = Math.max(0, idx - 20);
  var end = Math.min(text.length, idx + query.length + 30);
  var snippet = text.slice(start, end).replace(/\n/g, " ");
  if (start > 0) snippet = "…" + snippet;
  if (end < text.length) snippet = snippet + "…";
  return snippet;
}
