/* scanner.js — DOM scanning & TOC data extraction */
"use strict";

var scanTimer = null;

function getMessageBodyNode(node, role) {
  if (!node) return null;
  if (PLATFORM_HOST === "chat.deepseek.com" && node.hasAttribute("data-virtual-list-item-key")) {
    if (role === "user") {
      return node.querySelector(".fbb737a4") || node.querySelector(".ds-message") || node;
    }
    return node.querySelector(".ds-message") || node;
  }
  if (PLATFORM_HOST === "gemini.google.com") {
    if (role === "user") {
      return node.querySelector(".query-text-line, .query-text, .user-query-bubble-with-background") || node;
    }
    return node.querySelector('message-content, [class*="model-response"], [class*="response-content"]') || node;
  }
  return node;
}

function getMessageText(node, role) {
  var body = getMessageBodyNode(node, role) || node;
  return (body.textContent || "").trim();
}

function compareDomOrder(a, b) {
  if (a === b) return 0;
  var pos = a.compareDocumentPosition(b);
  if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  return 0;
}

function findGeminiMessages() {
  var userNodes = Array.from(document.querySelectorAll(".user-query-bubble-with-background"));
  var assistantNodes = Array.from(document.querySelectorAll("message-content")).map(function (node) {
    return node.closest(".container") || node;
  });

  var merged = normalizeMessages(userNodes.concat(assistantNodes));
  merged.sort(compareDomOrder);
  return merged;
}

function isExcludedNode(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return true;
  if (node.id === "ctoc-sidebar" || node.id === "ctoc-toggle-btn") return true;

  var selectors = getExcludeSelectors();
  for (var i = 0; i < selectors.length; i++) {
    try {
      if (node.matches(selectors[i]) || node.closest(selectors[i])) return true;
    } catch (_) {}
  }
  return false;
}

function isLikelySidePanelNode(node) {
  if (!node || typeof node.getBoundingClientRect !== "function") return false;
  if (PLATFORM_HOST === "chat.deepseek.com" && node.hasAttribute("data-virtual-list-item-key")) return false;
  var rect = node.getBoundingClientRect();
  var vw = window.innerWidth || document.documentElement.clientWidth || 0;
  if (vw <= 0) return false;

  var narrowLeftPanel = rect.left < vw * 0.24 && rect.width < vw * 0.34;
  var narrowRightPanel = rect.left > vw * 0.74 && rect.width < vw * 0.24;
  return narrowLeftPanel || narrowRightPanel;
}

function getNodeDepth(node) {
  var depth = 0;
  var current = node;
  while (current && current.parentElement) {
    depth++;
    current = current.parentElement;
  }
  return depth;
}

function hasPreferredAncestor(node, nodes) {
  var nodeText = (node.textContent || "").trim();
  var nodeLen = nodeText.length;
  var nodeRole = detectRole(node);
  if (!nodeLen) return false;

  for (var i = 0; i < nodes.length; i++) {
    var other = nodes[i];
    if (other === node || !other.contains(node)) continue;

    var otherText = (other.textContent || "").trim();
    var otherLen = otherText.length;
    if (!otherLen || otherLen < nodeLen * 1.2) continue;

    var otherRole = detectRole(other);
    if (otherRole === nodeRole) return true;
    if (nodeRole === "unknown" && otherRole !== "unknown") return true;
  }
  return false;
}

function scoreMessageSet(nodes) {
  if (!nodes || nodes.length === 0) return -Infinity;
  var userCount = 0;
  var assistantCount = 0;
  var unknownCount = 0;
  var central = 0;
  var transitions = 0;
  var lastRole = "";

  for (var i = 0; i < nodes.length; i++) {
    var role = detectRole(nodes[i]);
    if (role === "user") userCount++;
    else if (role === "assistant") assistantCount++;
    else unknownCount++;

    if (!isLikelySidePanelNode(nodes[i])) central++;

    if (role !== "unknown") {
      if (lastRole && lastRole !== role) transitions++;
      lastRole = role;
    }
  }

  var pairs = Math.min(userCount, assistantCount);
  var imbalance = Math.abs(userCount - assistantCount);
  var singleRolePenalty = 0;

  if ((userCount === 0 || assistantCount === 0) && nodes.length > 3) {
    singleRolePenalty = 120;
  } else if (pairs <= 1 && nodes.length > 6) {
    singleRolePenalty = 80;
  }

  return (
    userCount * 30 +
    assistantCount * 24 +
    pairs * 45 +
    transitions * 12 +
    central * 6 -
    unknownCount * 8 -
    imbalance * 10 -
    Math.max(0, nodes.length - Math.max(4, pairs * 4)) * 6 -
    singleRolePenalty
  );
}

function normalizeMessages(nodes) {
  var filtered = filterValidMessages(nodes);
  filtered.sort(function (a, b) {
    return getNodeDepth(a) - getNodeDepth(b);
  });
  filtered = filtered.filter(function (node) {
    return !hasPreferredAncestor(node, filtered);
  });
  return dedupeMessages(filtered);
}

function findMessagesBySelectors(selectors) {
  var best = [];
  var bestScore = -Infinity;

  for (var i = 0; i < selectors.length; i++) {
    try {
      var found = normalizeMessages(Array.from(document.querySelectorAll(selectors[i])));
      if (found.length < 2) continue;

      var score = scoreMessageSet(found);
      if (score > bestScore) {
        best = found;
        bestScore = score;
      }
    } catch (_) {}
  }
  return best;
}

function findAllMessages() {
  if (PLATFORM_HOST === "gemini.google.com") {
    var geminiMsgs = findGeminiMessages();
    if (geminiMsgs.length >= 2) return geminiMsgs;
  }

  var directMatches = findMessagesBySelectors(getMessageSelectors());
  if (directMatches.length >= 2) return directMatches;
  return dedupeMessages(findMessagesHeuristically());
}

// Filter out nodes that look like page chrome rather than conversation messages
function filterValidMessages(nodes) {
  return nodes.filter(function (n) {
    if (isExcludedNode(n)) return false;
    var role = detectRole(n);
    var text = getMessageText(n, role);
    if (text.length < 5) return false;
    var cls = (n.className || "").toLowerCase();
    if (/nav|sidebar|footer|header|menu|toolbar|breadcrumb/.test(cls)) return false;
    if (PLATFORM_HOST !== "chat.deepseek.com" && isLikelySidePanelNode(n)) return false;
    if (n.querySelector("textarea, input[type='text'], [contenteditable='true']")) return false;
    if (n.offsetWidth < 100 || n.offsetHeight < 20) return false;
    return true;
  });
}

function dedupeMessages(nodes) {
  var seen = new Set();
  return nodes.filter(function (node) {
    if (!node || seen.has(node)) return false;
    var role = detectRole(node);
    var key = role + "::" + truncate(getMessageText(node, role), 80);
    if (seen.has(key)) return false;
    seen.add(node);
    seen.add(key);
    return true;
  });
}

function findMessagesHeuristically() {
  var candidates = [];

  (function walk(node, depth) {
    if (depth > 12) return;
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    var children = Array.from(node.children);
    if (children.length >= 3 && children.length <= 200) {
      var validChildren = filterValidMessages(children);
      if (validChildren.length >= 2) {
        var roleKnownCount = validChildren.filter(function (child) {
          return detectRole(child) !== "unknown";
        }).length;
        candidates.push({
          el: node,
          nodes: validChildren,
          score: roleKnownCount * 20 + validChildren.length - depth,
        });
      }
    }
    for (var i = 0; i < children.length; i++) walk(children[i], depth + 1);
  })(document.body, 0);

  candidates.sort(function (a, b) { return b.score - a.score; });
  if (candidates.length > 0) {
    log("heuristic: found " + candidates[0].nodes.length + " candidate messages in " + candidates[0].el.tagName);
    return candidates[0].nodes;
  }
  return [];
}

function appendHeadings(group, node) {
  var seenTitles = {};
  for (var i = 0; i < group.subs.length; i++) {
    seenTitles[group.subs[i].title] = true;
  }

  var headings = node.querySelectorAll("h1, h2, h3, h4");
  headings.forEach(function (h) {
    var lvl = parseInt(h.tagName.charAt(1), 10);
    var title = (h.textContent || "").trim();
    if (!title || seenTitles[title]) return;

    group.subs.push({
      title: title,
      depth: Math.max(0, lvl - 1),
      el: h,
    });
    seenTitles[title] = true;
  });
}

function appendAssistantContent(group, node, idx) {
  var text = getMessageText(node, "assistant");
  if (!text) return;

  if (group.assistantText && (group.assistantText.indexOf(text) !== -1 || text.indexOf(group.assistantText) !== -1)) {
    return;
  }

  if (!group.assistantEl) {
    group.assistantEl = node;
    group.assistantId = getMessageId(node, idx, "assistant");
    group.assistantIndex = idx;
    group.assistantExcerpt = truncate(text, 80);
  }

  group.assistantText = group.assistantText
    ? group.assistantText + "\n\n" + text
    : text;

  appendHeadings(group, getMessageBodyNode(node, "assistant") || node);
}

function buildTOC() {
  var allMsgs = findAllMessages();
  if (allMsgs.length === 0) { scheduleScan(); return; }

  var newGroups = [];
  var currentGroup = null;

  allMsgs.forEach(function (node, idx) {
    var role = detectRole(node);
    if (role === "unknown") return;

    if (role === "user") {
      var text = getMessageText(node, "user");
      var title = truncate(text, 50);
      if (title) {
        var prev = newGroups[newGroups.length - 1];
        if (prev && prev.title === title) return;

        currentGroup = {
          id: getMessageId(node, idx, "user"),
          title: title,
          text: text,
          el: node,
          userIndex: idx,
          subs: [],
          assistantText: "",
          assistantEl: null,
          assistantId: "",
          assistantIndex: -1,
          assistantExcerpt: "",
        };
        newGroups.push(currentGroup);
      }
    } else if (role === "assistant" && currentGroup) {
      appendAssistantContent(currentGroup, node, idx);
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
