/* renderer.js — TOC DOM rendering & active-item tracking */
"use strict";

var tocList = null;
var lastActiveGroupEl = null;
var navigationNoticeTimer = null;

function getGroupSearchText(group) {
  return group.assistantText || group.assistantSearchText || group.assistantExcerpt || "";
}

function setNavigationNotice(text, type) {
  if (!tocList) return;

  var notice = tocList.querySelector(".ctoc-status");
  if (!notice) {
    notice = document.createElement("div");
    notice.className = "ctoc-status";
    tocList.insertBefore(notice, tocList.firstChild);
  }

  notice.textContent = text;
  notice.className = "ctoc-status " + (type || "");

  clearTimeout(navigationNoticeTimer);
  if (type !== "ctoc-status-loading") {
    navigationNoticeTimer = setTimeout(function () {
      if (notice && notice.parentElement) notice.remove();
    }, 2600);
  }
}

function clearNavigationNoticeSoon() {
  clearTimeout(navigationNoticeTimer);
  navigationNoticeTimer = setTimeout(function () {
    var notice = tocList && tocList.querySelector(".ctoc-status");
    if (notice) notice.remove();
  }, 800);
}

function setNavigationItemState(item, state) {
  if (!item) return;
  item.classList.remove("ctoc-locating", "ctoc-nav-failed");
  item.removeAttribute("aria-busy");

  if (state === "loading") {
    item.classList.add("ctoc-locating");
    item.setAttribute("aria-busy", "true");
  } else if (state === "failed") {
    item.classList.add("ctoc-nav-failed");
    setTimeout(function () {
      if (item && item.classList) item.classList.remove("ctoc-nav-failed");
    }, 2600);
  }
}

function textLooksSimilar(expected, actual) {
  if (!expected || !actual) return false;
  var normalizedExpected = normalizeComparableText(expected);
  var normalizedActual = normalizeComparableText(actual);
  if (!normalizedExpected || !normalizedActual) return false;
  if (normalizedActual === normalizedExpected) return true;
  if (normalizedActual.indexOf(normalizedExpected) === 0 || normalizedExpected.indexOf(normalizedActual) === 0) return true;
  return normalizedActual.indexOf(normalizedExpected.slice(0, Math.min(normalizedExpected.length, 24))) !== -1;
}

function findMatchingMessage(group, role) {
  var messages = findAllMessages();
  var targetIndex = role === "assistant" ? group.assistantIndex : group.userIndex;
  var targetId = role === "assistant" ? group.assistantId : group.id;
  var targetText = role === "assistant"
    ? (group.assistantExcerpt || truncate(group.assistantText || "", 80))
    : group.title;
  var best = null;
  var bestScore = Infinity;

  for (var i = 0; i < messages.length; i++) {
    var node = messages[i];
    if (detectRole(node) !== role) continue;

    if (targetId && getMessageId(node, i, role) === targetId) return node;

    var text = truncate((node.textContent || "").trim(), role === "assistant" ? 80 : 50);
    if (!textLooksSimilar(targetText, text)) continue;

    var score = Math.abs(i - (targetIndex >= 0 ? targetIndex : i));
    if (score < bestScore) {
      best = node;
      bestScore = score;
    }
  }

  return best;
}

function resolveGroupEl(group) {
  if (group.el && group.el.isConnected) return group.el;
  var el = findMatchingMessage(group, "user");
  if (el) group.el = el;
  return el;
}

function resolveAssistantEl(group) {
  if (group.assistantEl && group.assistantEl.isConnected) return group.assistantEl;
  var el = findMatchingMessage(group, "assistant");
  if (el) group.assistantEl = el;
  return el;
}

function resolveSubEl(group, sub, options) {
  if (sub.el && sub.el.isConnected) return sub.el;

  var assistantEl = resolveAssistantEl(group);
  var groupEl = resolveGroupEl(group);
  var container = assistantEl || groupEl || document;

  var headings = container.querySelectorAll("h1, h2, h3, h4");
  for (var i = 0; i < headings.length; i++) {
    var headingText = (headings[i].textContent || "").trim();
    if (headingText === sub.title || textLooksSimilar(sub.title, headingText)) {
      sub.el = headings[i];
      return headings[i];
    }
  }

  var fallback = findBestTextMatch(container, sub.title) || findTextContainer(container, sub.title);
  if (fallback) {
    sub.el = fallback;
    return fallback;
  }
  if (options && options.allowMessageFallback === false) return null;
  return assistantEl || groupEl || null;
}

function getNavigationScrollEl() {
  return getScrollRoot();
}

function isDocumentScrollEl(scrollEl) {
  return (
    scrollEl === document.body ||
    scrollEl === document.documentElement ||
    scrollEl === document.scrollingElement
  );
}

function getScrollTopValue(scrollEl) {
  return isDocumentScrollEl(scrollEl) ? window.scrollY : scrollEl.scrollTop;
}

function getMaxScrollTopValue(scrollEl) {
  if (isDocumentScrollEl(scrollEl)) {
    var doc = document.scrollingElement || document.documentElement;
    return Math.max(0, doc.scrollHeight - window.innerHeight);
  }
  return Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
}

function getViewportHeightValue(scrollEl) {
  return isDocumentScrollEl(scrollEl) ? window.innerHeight : scrollEl.clientHeight;
}

function setScrollTopValue(scrollEl, top, behavior) {
  var targetTop = Math.max(0, Math.min(top, getMaxScrollTopValue(scrollEl)));
  var options = { top: targetTop, behavior: behavior || "auto" };
  if (isDocumentScrollEl(scrollEl)) window.scrollTo(options);
  else if (scrollEl && typeof scrollEl.scrollTo === "function") scrollEl.scrollTo(options);
  else if (scrollEl) scrollEl.scrollTop = targetTop;
}

function getGroupIndex(group) {
  var groups = window._groups || [];
  return groups.indexOf(group);
}

function findCurrentGroup(group) {
  var groups = window._groups || [];
  var exactIndex = groups.indexOf(group);
  if (exactIndex >= 0) return groups[exactIndex];

  for (var i = 0; i < groups.length; i++) {
    if (group.id && groups[i].id === group.id) return groups[i];
  }

  for (var j = 0; j < groups.length; j++) {
    if (groups[j].title === group.title) return groups[j];
  }

  return group;
}

function findCurrentSub(group, sub) {
  var currentGroup = findCurrentGroup(group);
  var subs = currentGroup.subs || [];
  for (var i = 0; i < subs.length; i++) {
    if (subs[i] === sub || subs[i].title === sub.title) return subs[i];
  }
  return sub;
}

function getCurrentVisibleGroupIndex() {
  var groups = window._groups || [];
  var viewCenter = window.innerHeight / 2;
  var bestIndex = -1;
  var bestDist = Infinity;

  for (var i = 0; i < groups.length; i++) {
    var el = resolveGroupEl(groups[i]);
    if (!el) continue;
    var rect = el.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
    var dist = Math.abs(rect.top + rect.height / 2 - viewCenter);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function waitForNavigationScroll(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

async function revealGroupForNavigation(group) {
  group = findCurrentGroup(group);
  var existing = resolveGroupEl(group);
  if (existing) return existing;

  var groups = window._groups || [];
  var targetIndex = getGroupIndex(group);
  var scrollEl = getNavigationScrollEl();
  if (!scrollEl || targetIndex < 0 || groups.length <= 1) return null;

  var maxScroll = getMaxScrollTopValue(scrollEl);
  var viewportHeight = getViewportHeightValue(scrollEl);
  var currentIndex = getCurrentVisibleGroupIndex();
  var direction = currentIndex >= 0 && targetIndex < currentIndex ? -1 : 1;

  setScrollTopValue(scrollEl, maxScroll * (targetIndex / Math.max(1, groups.length - 1)), "auto");
  await waitForNavigationScroll(350);

  existing = resolveGroupEl(group);
  if (existing) return existing;

  for (var i = 0; i < 18; i++) {
    var before = getScrollTopValue(scrollEl);
    setScrollTopValue(scrollEl, before + direction * viewportHeight * 0.85, "auto");
    await waitForNavigationScroll(260);

    existing = resolveGroupEl(group);
    if (existing) return existing;

    var after = getScrollTopValue(scrollEl);
    if (Math.abs(after - before) < 2) break;
  }

  return resolveGroupEl(group);
}

async function refreshForNavigation() {
  if (typeof window.ctocRefresh !== "function") return false;
  try {
    await window.ctocRefresh();
    await waitForNavigationScroll(350);
    return true;
  } catch (_) {
    return false;
  }
}

async function navigateToGroup(group, item, options) {
  rememberCurrentPosition();
  setNavigationItemState(item, "loading");
  setNavigationNotice("正在定位目录位置…", "ctoc-status-loading");

  var currentGroup = findCurrentGroup(group);
  var target = resolveGroupEl(currentGroup) || await revealGroupForNavigation(currentGroup);
  if (!target && !(options && options.skipRefresh)) {
    setNavigationNotice("未找到目标，正在刷新后重试…", "ctoc-status-loading");
    if (await refreshForNavigation()) {
      currentGroup = findCurrentGroup(group);
      target = resolveGroupEl(currentGroup) || await revealGroupForNavigation(currentGroup);
    }
  }

  if (target) {
    scrollToEl(target);
    setNavigationItemState(item, "");
    setNavigationNotice("已定位", "ctoc-status-success");
    clearNavigationNoticeSoon();
    return true;
  }

  setNavigationItemState(item, "failed");
  setNavigationNotice("未找到目标，请稍后刷新页面再试", "ctoc-status-error");
  return false;
}

async function navigateToSub(group, sub, item, options) {
  rememberCurrentPosition();
  setNavigationItemState(item, "loading");
  setNavigationNotice("正在定位标题…", "ctoc-status-loading");

  var currentGroup = findCurrentGroup(group);
  var currentSub = findCurrentSub(currentGroup, sub);
  var target = resolveSubEl(currentGroup, currentSub, { allowMessageFallback: false });
  if (!target) {
    await revealGroupForNavigation(currentGroup);
    currentGroup = findCurrentGroup(group);
    currentSub = findCurrentSub(currentGroup, sub);
    target = resolveSubEl(currentGroup, currentSub, { allowMessageFallback: false }) || resolveAssistantEl(currentGroup) || resolveGroupEl(currentGroup);
  }

  if (!target && !(options && options.skipRefresh)) {
    setNavigationNotice("未找到标题，正在刷新后重试…", "ctoc-status-loading");
    if (await refreshForNavigation()) {
      currentGroup = findCurrentGroup(group);
      currentSub = findCurrentSub(currentGroup, sub);
      await revealGroupForNavigation(currentGroup);
      target = resolveSubEl(currentGroup, currentSub, { allowMessageFallback: false }) || resolveAssistantEl(currentGroup) || resolveGroupEl(currentGroup);
    }
  }

  if (target) {
    scrollToEl(target);
    setNavigationItemState(item, "");
    setNavigationNotice("已定位", "ctoc-status-success");
    clearNavigationNoticeSoon();
    return true;
  }

  setNavigationItemState(item, "failed");
  setNavigationNotice("未找到目标，请稍后刷新页面再试", "ctoc-status-error");
  return false;
}

function renderTOC(groups) {
  if (!tocList) return;
  var list = tocList;
  list.innerHTML = "";

  var query = (window._filterText || "").trim().toLowerCase();
  var visibleGroups = groups.filter(function (g) {
    var assistantSearchText = getGroupSearchText(g).toLowerCase();
    if (!query) return true;
    if (g.title.toLowerCase().indexOf(query) !== -1) return true;
    if (assistantSearchText.indexOf(query) !== -1) return true;
    return g.subs.some(function (s) { return s.title.toLowerCase().indexOf(query) !== -1; });
  });

  if (visibleGroups.length === 0) {
    var empty = document.createElement("div");
    empty.className = "ctoc-empty";
    empty.textContent = query ? "无匹配结果" : "暂无目录";
    list.appendChild(empty);
    return;
  }

  visibleGroups.forEach(function (group) {
    var row = document.createElement("div");
    row.className = "ctoc-group";

    var header = document.createElement("div");
    header.className = "ctoc-item ctoc-user";

    var arrow = document.createElement("span");
    arrow.className = "ctoc-arrow";
    if (group.subs.length > 0) {
      arrow.textContent = "▶";
      arrow.addEventListener("click", function (e) {
        e.stopPropagation();
        var subsEl = row.querySelector(".ctoc-subs");
        if (!subsEl) return;
        var isOpen = subsEl.classList.contains("ctoc-open");
        if (isOpen) { subsEl.classList.remove("ctoc-open"); arrow.textContent = "▶"; }
        else { subsEl.classList.add("ctoc-open"); arrow.textContent = "▼"; }
      });
    }
    header.appendChild(arrow);

    var label = document.createElement("span");
    label.className = "ctoc-label";
    label.textContent = group.title;
    label.title = group.title;
    label.addEventListener("click", function (e) {
      e.stopPropagation();
      navigateToGroup(group, header);
    });
    header.appendChild(label);

    header._group = group;
    row.appendChild(header);

    var subsEl = document.createElement("div");
    subsEl.className = "ctoc-subs";

    if (query) { subsEl.classList.add("ctoc-open"); arrow.textContent = "▼"; }

    group.subs.forEach(function (sub) {
      if (query && sub.title.toLowerCase().indexOf(query) === -1) return;
      var subItem = document.createElement("div");
      subItem.className = "ctoc-item ctoc-sub";
      subItem.style.paddingLeft = 20 + sub.depth * 12 + "px";
      subItem.textContent = sub.title;
      subItem.title = sub.title;
      subItem.addEventListener("click", function (e) {
        e.stopPropagation();
        navigateToSub(group, sub, subItem);
      });
      subsEl.appendChild(subItem);
    });

    var searchableAssistantText = getGroupSearchText(group);
    if (query && searchableAssistantText) {
      var textMatch = searchableAssistantText.toLowerCase().indexOf(query) !== -1;
      var noHeadingMatch = !group.subs.some(function (s) { return s.title.toLowerCase().indexOf(query) !== -1; });
      if (textMatch && noHeadingMatch) {
        (function () {
          var capturedQuery = query;
          var capturedGroup = group;
          var snippet = extractSnippet(searchableAssistantText, capturedQuery);
          var snipItem = document.createElement("div");
          snipItem.className = "ctoc-item ctoc-snippet";
          snipItem.style.paddingLeft = "20px";
          snipItem.textContent = snippet;
          snipItem.title = "在 AI 回复中";
          snipItem.addEventListener("click", function (e) {
            e.stopPropagation();
            var assistantEl = resolveAssistantEl(capturedGroup);
            var gEl = resolveGroupEl(capturedGroup);
            var target = assistantEl ? findTextContainer(assistantEl, capturedQuery) || assistantEl : gEl;
            if (target) navigateToEl(target);
            else navigateToGroup(capturedGroup, snipItem);
          });
          subsEl.appendChild(snipItem);
        })();
      }
    }

    row.appendChild(subsEl);
    list.appendChild(row);
  });
}

function syncActiveItem() {
  var groups = window._groups;
  if (!groups || groups.length === 0) return;

  var viewCenter = window.innerHeight / 2;
  var bestGroup = null;
  var bestDist = Infinity;

  for (var i = 0; i < groups.length; i++) {
    var el = resolveGroupEl(groups[i]);
    if (!el) continue;
    var rect = el.getBoundingClientRect();
    var dist = Math.abs(rect.top + rect.height / 2 - viewCenter);
    if (rect.top < viewCenter + 200 && dist < bestDist) {
      bestDist = dist;
      bestGroup = groups[i];
    }
  }

  if (!bestGroup || !tocList) return;

  var items = tocList.querySelectorAll(".ctoc-user");
  var targetItem = null;
  for (var j = 0; j < items.length; j++) {
    if (items[j]._group === bestGroup) { targetItem = items[j]; break; }
  }

  if (targetItem && targetItem !== lastActiveGroupEl) {
    if (lastActiveGroupEl) lastActiveGroupEl.classList.remove("ctoc-active");
    targetItem.classList.add("ctoc-active");
    lastActiveGroupEl = targetItem;
    targetItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}
