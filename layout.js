/* layout.js — sidebar DOM, resize, drag, layout margin, observer */
"use strict";

var SIDEBAR_MIN_WIDTH = 160;
var SIDEBAR_MAX_WIDTH = 420;
var SIDEBAR_DEFAULT_WIDTH = 220;
var SIDEBAR_GAP = 8;

var sidebar = null;
var toggleBtn = null;
var returnBtn = null;
var searchInput = null;
var isVisible = true;
var sidebarWidth = SIDEBAR_DEFAULT_WIDTH;
var layoutEl = null;
var observer = null;

function findLayoutTarget() {
  var selectors = getScrollSelectors();
  for (var i = 0; i < selectors.length; i++) {
    try {
      var el = document.querySelector(selectors[i]);
      if (el && el.clientWidth > 300) return el;
    } catch (_) {}
  }

  var allDivs = document.querySelectorAll("div");
  var best = null;
  var bestDepth = Infinity;
  for (var j = 0; j < allDivs.length; j++) {
    var div = allDivs[j];
    var style = window.getComputedStyle(div);
    if ((style.overflowY === "auto" || style.overflowY === "scroll") &&
        div.clientWidth > 300 && div.clientWidth < window.innerWidth) {
      var depth = 0;
      var p = div.parentElement;
      while (p) { depth++; p = p.parentElement; }
      if (depth < bestDepth) { best = div; bestDepth = depth; }
    }
  }
  return best;
}

function applyLayoutMargin() {
  if (!layoutEl) layoutEl = findLayoutTarget();
  if (layoutEl) {
    layoutEl.style.marginRight = (sidebarWidth + SIDEBAR_GAP) + "px";
    layoutEl.style.transition = "margin-right 0.25s";
  }
}

function resetLayoutMargin() {
  if (layoutEl) layoutEl.style.marginRight = "";
}

function toggleSidebar() {
  isVisible = !isVisible;
  window["_isVisible"] = isVisible;
  saveSettings();
  if (isVisible) {
    sidebar.classList.remove("ctoc-hidden");
    toggleBtn.classList.remove("ctoc-visible");
    applyLayoutMargin();
  } else {
    sidebar.classList.add("ctoc-hidden");
    toggleBtn.classList.add("ctoc-visible");
    resetLayoutMargin();
  }
}

function updateReturnButtonState() {
  if (!returnBtn) return;
  var disabled = !canReturnToPreviousPosition();
  returnBtn.disabled = disabled;
  returnBtn.title = disabled ? "暂无可返回位置" : "返回上一位置";
}

function createSidebar() {
  if (document.getElementById("ctoc-sidebar")) return;

  sidebar = document.createElement("div");
  sidebar.id = "ctoc-sidebar";
  sidebar.style.width = sidebarWidth + "px";

  var handle = document.createElement("div");
  handle.className = "ctoc-resize-handle";
  sidebar.appendChild(handle);
  makeResizable(handle);

  var hdr = document.createElement("div");
  hdr.className = "ctoc-header";

  searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.className = "ctoc-search";
  searchInput.placeholder = "搜索…";
  searchInput.addEventListener("input", function () {
    window._filterText = searchInput.value;
    if (window._groups) renderTOC(window._groups);
  });
  searchInput.addEventListener("mousedown", function (e) { e.stopPropagation(); });
  hdr.appendChild(searchInput);

  returnBtn = document.createElement("button");
  returnBtn.className = "ctoc-btn";
  returnBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H7"/><polyline points="12 17 7 12 12 7"/></svg>';
  returnBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    returnToPreviousPosition();
  });
  hdr.appendChild(returnBtn);

  var collapseBtn = document.createElement("button");
  collapseBtn.className = "ctoc-btn";
  collapseBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>';
  collapseBtn.title = "折叠";
  collapseBtn.addEventListener("click", toggleSidebar);
  hdr.appendChild(collapseBtn);
  sidebar.appendChild(hdr);

  tocList = document.createElement("div");
  tocList.className = "ctoc-list";
  sidebar.appendChild(tocList);

  toggleBtn = document.createElement("button");
  toggleBtn.id = "ctoc-toggle-btn";
  toggleBtn.innerHTML = '<svg viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>';
  toggleBtn.title = "展开目录";
  toggleBtn.addEventListener("click", toggleSidebar);
  document.body.appendChild(toggleBtn);

  document.body.appendChild(sidebar);
  makeDraggable(sidebar, hdr);

  // restore saved position
  var savedTop = localStorage.getItem("ctoc-top");
  if (savedTop) sidebar.style.top = savedTop;

  updateReturnButtonState();
}

function makeResizable(handle) {
  var startX, startWidth;
  handle.addEventListener("mousedown", function (e) {
    e.preventDefault();
    e.stopPropagation();
    startX = e.clientX;
    startWidth = sidebar.offsetWidth;
    handle.classList.add("ctoc-resizing");
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
  function onMove(e) {
    var dx = startX - e.clientX;
    var w = startWidth + dx;
    w = Math.max(SIDEBAR_MIN_WIDTH, Math.min(w, SIDEBAR_MAX_WIDTH));
    sidebarWidth = w;
    window["_sidebarWidth"] = w;
    sidebar.style.width = w + "px";
    if (isVisible) applyLayoutMargin();
  }
  function onUp() {
    handle.classList.remove("ctoc-resizing");
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    saveSettings();
  }
}

function makeDraggable(el, handle) {
  var startY, startTop;
  handle.style.cursor = "grab";
  handle.addEventListener("mousedown", function (e) {
    if (e.target.tagName === "BUTTON") return;
    startY = e.clientY;
    startTop = el.getBoundingClientRect().top;
    handle.style.cursor = "grabbing";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
  function onMove(e) {
    var dy = e.clientY - startY;
    var t = startTop + dy;
    t = Math.max(60, Math.min(t, window.innerHeight - 80));
    el.style.top = t + "px";
  }
  function onUp() {
    handle.style.cursor = "grab";
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    saveSettings();
  }
}

function startObserver() {
  if (observer) return;
  observer = new MutationObserver(function () { scheduleScan(); });
  observer.observe(document.body, { childList: true, subtree: true });
}

function saveSettings() {
  try {
    localStorage.setItem("ctoc-width", sidebarWidth);
    localStorage.setItem("ctoc-visible", isVisible ? "1" : "0");
    if (sidebar) localStorage.setItem("ctoc-top", sidebar.style.top || "");
  } catch (_) {}
}

function loadSettings() {
  try {
    var w = localStorage.getItem("ctoc-width");
    if (w) { sidebarWidth = parseInt(w, 10); window["_sidebarWidth"] = sidebarWidth; }
    var v = localStorage.getItem("ctoc-visible");
    if (v === "0") { isVisible = false; window["_isVisible"] = false; }
  } catch (_) {}
}
