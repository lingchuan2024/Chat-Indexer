/* utils.js — shared helpers, no side effects */
"use strict";

const DEBUG = false;
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

function truncate(text, maxLen) {
  var clean = stripMarkdown(text);
  var line = clean.split("\n")[0].trim();
  if (!line) line = clean;
  if (line.length <= maxLen) return line;
  return line.slice(0, maxLen).trimEnd() + "…";
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

function scrollToEl(el) {
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.style.transition = "box-shadow 0.3s";
  el.style.boxShadow = "0 0 0 3px rgba(16,163,127,0.5)";
  setTimeout(function () { el.style.boxShadow = ""; }, 2000);
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
