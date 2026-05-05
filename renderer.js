/* renderer.js — TOC DOM rendering & active-item tracking */
"use strict";

var tocList = null;
var lastActiveGroupEl = null;

// Resolve a group's DOM element at click time (refs may be stale due to SPA re-renders)
function resolveGroupEl(group) {
  // try the stored ref first
  if (group.el && group.el.isConnected) return group.el;

  // re-query by message-id
  if (group.id) {
    var el = document.querySelector('[data-message-id="' + group.id + '"]');
    if (el) { group.el = el; return el; }
  }

  // fallback: find by text match among message-author-role=user nodes
  var userNodes = document.querySelectorAll('[data-message-author-role="user"]');
  for (var i = 0; i < userNodes.length; i++) {
    var t = (userNodes[i].textContent || "").trim();
    if (t.indexOf(group.title) === 0 || group.title.indexOf(t) === 0) {
      group.el = userNodes[i];
      return userNodes[i];
    }
  }
  return null;
}

function resolveSubEl(group, sub) {
  // try stored ref
  if (sub.el && sub.el.isConnected) return sub.el;

  // re-find: get group element, then find heading by text
  var gEl = resolveGroupEl(group);
  if (!gEl) return null;

  // find the assistant message that follows this user message
  var next = gEl.nextElementSibling;
  while (next && next.getAttribute("data-message-author-role") !== "assistant") {
    next = next.nextElementSibling;
  }
  var container = next || document;

  var headings = container.querySelectorAll("h1, h2, h3, h4");
  for (var i = 0; i < headings.length; i++) {
    if ((headings[i].textContent || "").trim() === sub.title) {
      sub.el = headings[i];
      return headings[i];
    }
  }
  return null;
}

function renderTOC(groups) {
  if (!tocList) return;
  var list = tocList;
  list.innerHTML = "";

  var query = (window._filterText || "").trim().toLowerCase();
  var visibleGroups = groups.filter(function (g) {
    if (!query) return true;
    if (g.title.toLowerCase().indexOf(query) !== -1) return true;
    if (g.assistantText.toLowerCase().indexOf(query) !== -1) return true;
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
      var gEl = resolveGroupEl(group);
      if (gEl) scrollToEl(gEl);
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
        var sEl = resolveSubEl(group, sub);
        if (sEl) scrollToEl(sEl);
      });
      subsEl.appendChild(subItem);
    });

    if (query && group.assistantText) {
      var textMatch = group.assistantText.toLowerCase().indexOf(query) !== -1;
      var noHeadingMatch = !group.subs.some(function (s) { return s.title.toLowerCase().indexOf(query) !== -1; });
      if (textMatch && noHeadingMatch) {
        (function () {
          var capturedQuery = query;
          var capturedGroup = group;
          var snippet = extractSnippet(group.assistantText, capturedQuery);
          var snipItem = document.createElement("div");
          snipItem.className = "ctoc-item ctoc-snippet";
          snipItem.style.paddingLeft = "20px";
          snipItem.textContent = snippet;
          snipItem.title = "在 AI 回复中";
          snipItem.addEventListener("click", function (e) {
            e.stopPropagation();
            var gEl = resolveGroupEl(capturedGroup);
            if (!gEl) return;
            // find assistant message sibling
            var next = gEl.nextElementSibling;
            while (next && next.getAttribute("data-message-author-role") !== "assistant") {
              next = next.nextElementSibling;
            }
            var target = next ? findTextContainer(next, capturedQuery) || next : gEl;
            scrollToEl(target);
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
