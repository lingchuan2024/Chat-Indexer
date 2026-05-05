/* scanner.js — DOM scanning & TOC data extraction */
"use strict";

var scanTimer = null;

function findAllMessages() {
  var cfg = getConfig();
  var hostLow = PLATFORM_HOST.toLowerCase();

  if (cfg && cfg.msgSelector) {
    var msgs = document.querySelectorAll(cfg.msgSelector);
    if (msgs.length >= 2) return Array.from(msgs);
  }

  var generic = [
    '[data-message-author-role]',
    '[data-role="user"], [data-role="assistant"], [data-role="model"]',
    '[class*="user-message"], [class*="assistant-message"]',
    '[class*="user-query"], [class*="model-response"]',
  ];
  for (var i = 0; i < generic.length; i++) {
    try {
      var g = document.querySelectorAll(generic[i]);
      if (g.length >= 2) return Array.from(g);
    } catch (_) {}
  }

  if (hostLow.indexOf("deepseek") !== -1) {
    var turns = document.querySelectorAll('[class*="f9dcf8"], [class*="turn"], [class*="dialogue"]');
    if (turns.length >= 2) return Array.from(turns);
  }
  if (hostLow.indexOf("kimi") !== -1 || hostLow.indexOf("moonshot") !== -1) {
    var items = document.querySelectorAll('[class*="chat-item"], [class*="conversation-item"]');
    if (items.length >= 2) return Array.from(items);
  }
  if (hostLow.indexOf("claude") !== -1) {
    var cu = document.querySelectorAll('[data-testid="user-message"], [data-testid="assistant-message"]');
    if (cu.length >= 2) return Array.from(cu);
  }

  return findMessagesHeuristically();
}

function findMessagesHeuristically() {
  var candidates = [];
  (function walk(node, depth) {
    if (depth > 12) return;
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    var children = Array.from(node.children);
    if (children.length >= 3 && children.length <= 200) {
      var textCounts = children.map(function (c) { return (c.textContent || "").trim().length; });
      var nonEmpty = textCounts.filter(function (l) { return l > 10; });
      if (nonEmpty.length >= 2 && nonEmpty.length >= children.length * 0.6) {
        candidates.push({ el: node, count: children.length, depth: depth });
      }
    }
    for (var i = 0; i < children.length; i++) walk(children[i], depth + 1);
  })(document.body, 0);

  candidates.sort(function (a, b) { return b.count - a.count || a.depth - b.depth; });
  if (candidates.length > 0) {
    log("heuristic: found " + candidates[0].count + " children in " + candidates[0].el.tagName);
    return Array.from(candidates[0].el.children);
  }
  return [];
}

function buildTOC() {
  var allMsgs = findAllMessages();
  if (allMsgs.length === 0) { scheduleScan(); return; }

  var newGroups = [];
  var currentGroup = null;
  var lastRole = null;

  allMsgs.forEach(function (node, idx) {
    var role = detectRole(node);
    if (role === "unknown") {
      role = lastRole === "user" ? "assistant" : (lastRole === "assistant" ? "user" : "user");
    }
    lastRole = role;

    if (role === "user") {
      var text = (node.textContent || "").trim();
      var title = truncate(text, 50);
      if (title) {
        currentGroup = {
          id: getMessageId(node, idx),
          title: title,
          el: node,
          subs: [],
          assistantText: "",
          assistantEl: null,
        };
        newGroups.push(currentGroup);
      }
    } else if (role === "assistant" && currentGroup) {
      currentGroup.assistantText = (node.textContent || "").trim();
      currentGroup.assistantEl = node;
      var headings = node.querySelectorAll("h1, h2, h3, h4");
      headings.forEach(function (h) {
        var lvl = parseInt(h.tagName.charAt(1), 10);
        var hTitle = (h.textContent || "").trim();
        if (hTitle) {
          currentGroup.subs.push({ title: hTitle, depth: Math.max(0, lvl - 1), el: h });
        }
      });
    }
  });

  if (groupsEqual(window._groups || [], newGroups)) return;
  window._groups = newGroups;
  renderTOC(newGroups);
}

function scheduleScan() {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(buildTOC, 500);
}
