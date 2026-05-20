/* scanner.js — DOM scanning & TOC data extraction */
"use strict";

var scanTimer = null;
var isBuildingTOC = false;
var pendingTOCBuild = false;
var hydratedHistoryUrl = "";
var isHydratingHistory = false;
var cachedConversationGroups = null;
var cachedConversationKey = "";
var CONVERSATION_CACHE_INDEX_KEY = "ctoc-chatgpt-cache-index";
var MAX_CONVERSATION_CACHE_ENTRIES = 15;

function resetConversationState() {
  hydratedHistoryUrl = "";
  cachedConversationKey = "";
  cachedConversationGroups = null;
  window._groups = [];
  if (typeof clearNavigationHistory === "function") clearNavigationHistory();
  if (typeof renderTOC === "function") renderTOC([]);
}

function readConversationCacheIndex() {
  var index = safeJsonParse(localStorage.getItem(CONVERSATION_CACHE_INDEX_KEY), []);
  if (!Array.isArray(index)) return [];
  return index.filter(function (entry) {
    return entry && typeof entry.key === "string" && entry.key;
  });
}

function writeConversationCacheIndex(index) {
  try {
    localStorage.setItem(CONVERSATION_CACHE_INDEX_KEY, JSON.stringify(index));
  } catch (_) {}
}

function trackConversationCacheKey(key) {
  if (!key) return;
  var index = readConversationCacheIndex().filter(function (entry) {
    return entry.key !== key;
  });

  index.push({ key: key });

  while (index.length > MAX_CONVERSATION_CACHE_ENTRIES) {
    var removed = index.shift();
    if (removed && removed.key) {
      try {
        localStorage.removeItem(removed.key);
      } catch (_) {}
    }
  }

  writeConversationCacheIndex(index);
}

function compactGroupForCache(group) {
  return {
    id: group.id || "",
    title: group.title || "",
    text: "",
    el: null,
    userIndex: typeof group.userIndex === "number" ? group.userIndex : -1,
    subs: (group.subs || []).map(function (sub) {
      return {
        title: sub.title || "",
        depth: typeof sub.depth === "number" ? sub.depth : 0,
        el: null,
      };
    }),
    assistantText: "",
    assistantSearchText: group.assistantExcerpt || "",
    assistantEl: null,
    assistantId: group.assistantId || "",
    assistantIndex: typeof group.assistantIndex === "number" ? group.assistantIndex : -1,
    assistantExcerpt: group.assistantExcerpt || "",
  };
}

function compactGroupsForCache(groups) {
  return (groups || []).map(compactGroupForCache);
}

function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

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

function hasMultipleExplicitRoleDescendants(node) {
  if (!node || typeof node.querySelectorAll !== "function") return false;
  var nested = node.querySelectorAll(
    '[data-message-author-role], [data-role="user"], [data-role="assistant"], [data-role="model"], [data-role="human"], [data-role="ai"], [data-role="bot"]'
  );
  return nested.length > 1;
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
    if (hasMultipleExplicitRoleDescendants(other)) continue;

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
    if (hasMultipleExplicitRoleDescendants(n)) return false;
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

function shouldHydrateHistory() {
  return (PLATFORM_HOST === "chatgpt.com" || PLATFORM_HOST === "chat.openai.com") && hydratedHistoryUrl !== location.href;
}

async function hydrateHistoryForTOC() {
  if (!shouldHydrateHistory() || isHydratingHistory) return null;

  var scrollEl = getScrollRoot();
  if (!scrollEl) return null;

  var snapshot = captureNavigationSnapshot();
  var stagnantRounds = 0;
  isHydratingHistory = true;

  try {
    for (var i = 0; i < 8; i++) {
      var beforeCount = findAllMessages().length;
      var beforeHeight = scrollEl.scrollHeight;
      var beforeTop = scrollEl === document.scrollingElement || scrollEl === document.documentElement
        ? window.scrollY
        : scrollEl.scrollTop;

      if (scrollEl === document.scrollingElement || scrollEl === document.documentElement) {
        window.scrollTo({ top: 0, behavior: "auto" });
      } else if (typeof scrollEl.scrollTo === "function") {
        scrollEl.scrollTo({ top: 0, behavior: "auto" });
      } else {
        scrollEl.scrollTop = 0;
      }

      await delay(350);

      var afterCount = findAllMessages().length;
      var afterHeight = scrollEl.scrollHeight;
      var afterTop = scrollEl === document.scrollingElement || scrollEl === document.documentElement
        ? window.scrollY
        : scrollEl.scrollTop;

      var changed = afterCount > beforeCount || afterHeight !== beforeHeight || afterTop !== beforeTop;
      if (changed) stagnantRounds = 0;
      else stagnantRounds++;

      if (afterTop <= 2 && stagnantRounds >= 2) break;
    }

    hydratedHistoryUrl = location.href;
    return snapshot;
  } finally {
    isHydratingHistory = false;
  }
}

function mergeGroupsForHydratedHistory(oldGroups, newGroups) {
  if (!oldGroups || oldGroups.length === 0) return newGroups;
  if (hydratedHistoryUrl !== location.href || newGroups.length >= oldGroups.length) return newGroups;
  return mergeGroupsPreservingExisting(oldGroups, newGroups);
}

function mergeGroupsPreservingExisting(oldGroups, newGroups) {
  if (!oldGroups || oldGroups.length === 0) return newGroups;
  if (!newGroups || newGroups.length === 0) return oldGroups;
  if (newGroups.length >= oldGroups.length) return newGroups;

  var merged = [];
  var seen = {};
  var freshByKey = {};

  function idTitleKey(group) {
    return (group.id || "") + "::" + group.title;
  }

  function titleKey(group) {
    return "title::" + group.title;
  }

  newGroups.forEach(function (group) {
    freshByKey[idTitleKey(group)] = group;
    if (!freshByKey[titleKey(group)]) freshByKey[titleKey(group)] = group;
  });

  oldGroups.forEach(function (group) {
    var key = idTitleKey(group);
    var fallbackKey = titleKey(group);
    var fresh = freshByKey[key] || freshByKey[fallbackKey];
    merged.push(fresh || group);
    seen[key] = true;
    seen[fallbackKey] = true;
  });

  newGroups.forEach(function (group) {
    var key = idTitleKey(group);
    var fallbackKey = titleKey(group);
    if (!seen[key] && !seen[fallbackKey]) merged.push(group);
  });

  return merged;
}

function extractTextFromMessagePart(part) {
  if (!part) return "";
  if (typeof part === "string") return part;
  if (Array.isArray(part)) {
    return part.map(extractTextFromMessagePart).filter(Boolean).join("\n");
  }
  if (typeof part.text === "string") return part.text;
  if (typeof part.result === "string") return part.result;
  if (typeof part.content === "string") return part.content;
  if (Array.isArray(part.content)) {
    return part.content.map(extractTextFromMessagePart).filter(Boolean).join("\n");
  }
  if (Array.isArray(part.parts)) {
    return part.parts.map(extractTextFromMessagePart).filter(Boolean).join("\n");
  }
  if (typeof part.value === "string") return part.value;
  return "";
}

function extractTextFromConversationMessage(message) {
  if (!message || !message.content) return "";
  var content = message.content;
  if (typeof content === "string") return content.trim();
  if (typeof content.text === "string") return content.text.trim();
  if (Array.isArray(content.parts)) {
    return content.parts.map(extractTextFromMessagePart).filter(Boolean).join("\n").trim();
  }
  return extractTextFromMessagePart(content).trim();
}

function appendHeadingsFromText(group, text) {
  if (!text) return;
  var seenTitles = {};
  for (var i = 0; i < group.subs.length; i++) {
    seenTitles[group.subs[i].title] = true;
  }

  var lines = text.split(/\r?\n/);
  lines.forEach(function (line) {
    var match = line.match(/^(#{1,4})\s+(.+)$/);
    if (!match) return;
    var title = match[2].trim();
    if (!title || seenTitles[title]) return;
    group.subs.push({
      title: title,
      depth: Math.max(0, match[1].length - 1),
      el: null,
    });
    seenTitles[title] = true;
  });
}

function buildGroupsFromConversationData(data) {
  if (!data || !data.mapping) return [];

  var entries = [];
  var activeKeys = [];
  var currentKey = data.current_node || "";
  var seenKeys = {};

  while (currentKey && data.mapping[currentKey] && !seenKeys[currentKey]) {
    activeKeys.push(currentKey);
    seenKeys[currentKey] = true;
    currentKey = data.mapping[currentKey].parent || "";
  }
  activeKeys.reverse();

  var keys = activeKeys.length > 0 ? activeKeys : Object.keys(data.mapping);
  keys.forEach(function (key) {
    var item = data.mapping[key];
    var message = item && item.message;
    if (!message || !message.author) return;

    var role = message.author.role;
    if (role !== "user" && role !== "assistant") return;

    var text = extractTextFromConversationMessage(message);
    if (!text) return;

    entries.push({
      id: message.id || key,
      role: role,
      text: text,
      createTime: typeof message.create_time === "number" ? message.create_time : 0,
    });
  });

  if (activeKeys.length === 0) {
    entries.sort(function (a, b) {
      if (a.createTime === b.createTime) return 0;
      return a.createTime - b.createTime;
    });
  }

  var groups = [];
  var currentGroup = null;
  entries.forEach(function (entry, idx) {
    if (entry.role === "user") {
      var title = truncate(entry.text, 50);
      if (!title) return;
      var prev = groups[groups.length - 1];
      if (prev && prev.id === entry.id) return;

      currentGroup = {
        id: entry.id,
        title: title,
        text: entry.text,
        el: null,
        userIndex: idx,
        subs: [],
        assistantText: "",
        assistantEl: null,
        assistantId: "",
        assistantIndex: -1,
        assistantExcerpt: "",
      };
      groups.push(currentGroup);
      return;
    }

    if (!currentGroup) return;
    if (!currentGroup.assistantId) {
      currentGroup.assistantId = entry.id;
      currentGroup.assistantIndex = idx;
      currentGroup.assistantExcerpt = truncate(entry.text, 80);
    }
    currentGroup.assistantText = currentGroup.assistantText
      ? currentGroup.assistantText + "\n\n" + entry.text
      : entry.text;
    appendHeadingsFromText(currentGroup, entry.text);
  });

  return groups;
}

function getCachedConversationGroups(conversationId) {
  var key = getConversationCacheKey(conversationId);
  if (!key) {
    cachedConversationKey = "";
    cachedConversationGroups = null;
    return [];
  }

  if (cachedConversationKey === key && cachedConversationGroups) {
    return cachedConversationGroups;
  }

  cachedConversationKey = key;
  cachedConversationGroups = safeJsonParse(localStorage.getItem(key), []) || [];
  return cachedConversationGroups;
}

function setCachedConversationGroups(groups, conversationId) {
  var key = getConversationCacheKey(conversationId);
  if (!key || !groups || groups.length === 0) return false;

  cachedConversationKey = key;
  cachedConversationGroups = groups;
  try {
    localStorage.setItem(key, JSON.stringify(compactGroupsForCache(groups)));
    trackConversationCacheKey(key);
  } catch (_) {}
  return true;
}

function clearCachedConversationGroups(conversationId) {
  var key = getConversationCacheKey(conversationId);
  if (!key) return false;

  try {
    localStorage.removeItem(key);
    writeConversationCacheIndex(readConversationCacheIndex().filter(function (entry) {
      return entry.key !== key;
    }));
  } catch (_) {}

  if (cachedConversationKey === key) {
    cachedConversationKey = "";
    cachedConversationGroups = null;
  }
  return true;
}

function getConversationIdFromPayload(data, sourceUrl) {
  return (
    extractConversationIdFromUrl(sourceUrl) ||
    data.conversation_id ||
    data.id ||
    ""
  );
}

function ingestConversationPayload(data, sourceUrl) {
  if (!isChatGPTHost() || !data || !data.mapping) return false;
  var conversationId = getConversationIdFromPayload(data, sourceUrl);
  if (!conversationId) return false;
  var groups = buildGroupsFromConversationData(data);
  if (groups.length === 0) return false;
  return setCachedConversationGroups(groups, conversationId);
}

function buildGroupsFromDOMMessages(allMsgs) {
  if (!allMsgs || allMsgs.length === 0) return [];

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

  return newGroups;
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

async function buildTOC(options) {
  if (isBuildingTOC) {
    pendingTOCBuild = true;
    return;
  }

  isBuildingTOC = true;
  var restoreSnapshot = null;
  var force = options && options.force === true;

  try {
    var cachedGroups = force ? [] : getCachedConversationGroups();
    var baseGroups = window._groups || [];
    if (cachedGroups.length > 0) {
      baseGroups = cachedGroups;
      if (!groupsEqual(window._groups || [], cachedGroups)) {
        window._groups = cachedGroups;
        renderTOC(cachedGroups);
      }
    }

    restoreSnapshot = cachedGroups.length > 0 ? null : await hydrateHistoryForTOC();
    var allMsgs = findAllMessages();
    if (allMsgs.length === 0) {
      if (cachedGroups.length === 0) scheduleScan();
      return;
    }

    var newGroups = buildGroupsFromDOMMessages(allMsgs);
    var mergedGroups = mergeGroupsPreservingExisting(baseGroups, mergeGroupsForHydratedHistory(baseGroups, newGroups));
    if (groupsEqual(window._groups || [], mergedGroups)) return;
    window._groups = mergedGroups;
    renderTOC(mergedGroups);
    if (isChatGPTHost() && (cachedGroups.length === 0 || mergedGroups.length > cachedGroups.length)) {
      setCachedConversationGroups(mergedGroups, getConversationIdFromLocation());
    }
  } finally {
    if (restoreSnapshot) restoreNavigationSnapshot(restoreSnapshot, "auto");
    isBuildingTOC = false;
    if (pendingTOCBuild) {
      pendingTOCBuild = false;
      scheduleScan();
    }
  }
}

function scheduleScan() {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(buildTOC, 500);
}
