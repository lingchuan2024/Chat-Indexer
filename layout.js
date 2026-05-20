/* layout.js — sidebar DOM, resize, drag, layout margin, observer */
"use strict";

var SIDEBAR_MIN_WIDTH = 160;
var SIDEBAR_MAX_WIDTH = 420;
var SIDEBAR_DEFAULT_WIDTH = 220;
var SIDEBAR_GAP = 8;

var sidebar = null;
var toggleBtn = null;
var returnBtn = null;
var refreshBtn = null;
var exportBtn = null;
var exportMenu = null;
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

  refreshBtn = document.createElement("button");
  refreshBtn.className = "ctoc-btn";
  refreshBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-15.3 6.4"/><path d="M3 12A9 9 0 0 1 18.3 5.6"/><polyline points="21 5 21 12 14 12"/><polyline points="3 19 3 12 10 12"/></svg>';
  refreshBtn.title = "刷新目录";
  refreshBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    if (refreshBtn.disabled) return;

    refreshBtn.disabled = true;
    refreshBtn.classList.add("ctoc-refreshing");

    var done = function () {
      refreshBtn.disabled = false;
      refreshBtn.classList.remove("ctoc-refreshing");
    };

    try {
      var result = typeof window.ctocRefresh === "function"
        ? window.ctocRefresh()
        : buildTOC({ force: true });
      if (result && typeof result.finally === "function") result.finally(done);
      else done();
    } catch (_) {
      done();
    }
  });
  hdr.appendChild(refreshBtn);

  var exportWrap = document.createElement("div");
  exportWrap.className = "ctoc-export-wrap";

  exportBtn = document.createElement("button");
  exportBtn.className = "ctoc-btn";
  exportBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
  exportBtn.title = "导出聊天";
  exportBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    exportMenu.classList.toggle("ctoc-open");
  });
  exportWrap.appendChild(exportBtn);

  exportMenu = document.createElement("div");
  exportMenu.className = "ctoc-export-menu";

  function addExportOption(label, format) {
    var option = document.createElement("button");
    option.type = "button";
    option.textContent = label;
    option.addEventListener("click", function (e) {
      e.stopPropagation();
      exportMenu.classList.remove("ctoc-open");
      if (typeof window.ctocExport === "function") window.ctocExport(format);
    });
    exportMenu.appendChild(option);
  }

  addExportOption("Markdown", "markdown");
  addExportOption("PDF", "pdf");
  exportWrap.appendChild(exportMenu);
  hdr.appendChild(exportWrap);

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

  document.addEventListener("click", function () {
    if (exportMenu) exportMenu.classList.remove("ctoc-open");
  });

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
