/* exporter.js — chat export to Markdown and printable PDF */
"use strict";

function getExportTimestamp() {
  var d = new Date();
  function pad(n) { return String(n).padStart(2, "0"); }
  return (
    d.getFullYear() + "-" +
    pad(d.getMonth() + 1) + "-" +
    pad(d.getDate()) + "_" +
    pad(d.getHours()) + "-" +
    pad(d.getMinutes())
  );
}

function sanitizeFilename(name) {
  return String(name || "chat")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "chat";
}

function getExportTitle() {
  var firstGroup = window._groups && window._groups[0];
  var title = firstGroup && firstGroup.title ? firstGroup.title : document.title;
  return sanitizeFilename(title || getPlatformName() || "chat");
}

function getExportFilename(ext) {
  return getExportTitle() + "-" + getExportTimestamp() + "." + ext;
}

function normalizeExportText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function getNodeChildren(node) {
  return Array.from((node && (node.childNodes || node.children)) || []);
}

function isTextNode(node) {
  return node && node.nodeType === 3;
}

function isElementNode(node) {
  return node && node.nodeType === 1;
}

function getNodeTag(node) {
  return isElementNode(node) ? String(node.tagName || "").toUpperCase() : "";
}

function getNodeText(node) {
  return String((node && (node.textContent || node.nodeValue)) || "");
}

function hasElementChildren(node) {
  return getNodeChildren(node).some(isElementNode);
}

function serializeInlineMarkdown(node) {
  if (!node) return "";
  if (isTextNode(node)) return getNodeText(node).replace(/\s+/g, " ");

  var tag = getNodeTag(node);
  if (tag === "BR") return "\n";
  if (tag === "SCRIPT" || tag === "STYLE" || tag === "BUTTON" || tag === "SVG") return "";
  if (tag === "CODE" && getNodeTag(node.parentElement) !== "PRE") return "`" + getNodeText(node).trim() + "`";
  if (tag === "STRONG" || tag === "B") return "**" + serializeChildrenInline(node).trim() + "**";
  if (tag === "EM" || tag === "I") return "*" + serializeChildrenInline(node).trim() + "*";
  if (tag === "A") {
    var label = serializeChildrenInline(node).trim() || getNodeText(node).trim();
    var href = node.getAttribute && node.getAttribute("href");
    return href ? "[" + label + "](" + href + ")" : label;
  }
  if (tag === "UL" || tag === "OL" || tag === "PRE" || /^H[1-6]$/.test(tag) || tag === "P" || tag === "DIV" || tag === "SECTION" || tag === "ARTICLE" || tag === "BLOCKQUOTE") {
    return serializeNodeToMarkdown(node);
  }

  return serializeChildrenInline(node) || getNodeText(node);
}

function serializeChildrenInline(node) {
  return getNodeChildren(node).map(serializeInlineMarkdown).join("").replace(/[ \t]{2,}/g, " ");
}

function serializeListItem(li, marker) {
  var childBlocks = [];
  var inlineParts = [];

  getNodeChildren(li).forEach(function (child) {
    var tag = getNodeTag(child);
    if (tag === "UL" || tag === "OL") {
      childBlocks.push(serializeNodeToMarkdown(child));
      return;
    }
    inlineParts.push(serializeInlineMarkdown(child));
  });

  var inline = normalizeExportText(inlineParts.join("").replace(/\n{2,}/g, "\n"));
  if (!inline) inline = normalizeExportText(getNodeText(li));

  var firstLine = marker + " " + inline.replace(/\n/g, "\n  ");
  if (childBlocks.length === 0) return firstLine;

  return firstLine + "\n" + childBlocks.map(function (block) {
    return block.split("\n").map(function (line) {
      return line ? "  " + line : line;
    }).join("\n");
  }).join("\n");
}

function serializeListMarkdown(node) {
  var ordered = getNodeTag(node) === "OL";
  var index = 1;
  return getNodeChildren(node).filter(function (child) {
    return getNodeTag(child) === "LI";
  }).map(function (li) {
    var marker = ordered ? (index++) + "." : "-";
    return serializeListItem(li, marker);
  }).join("\n");
}

function serializeNodeToMarkdown(node) {
  if (!node) return "";
  if (isTextNode(node)) return getNodeText(node);

  var tag = getNodeTag(node);
  if (tag === "SCRIPT" || tag === "STYLE" || tag === "BUTTON" || tag === "SVG") return "";
  if (tag === "BR") return "\n";
  if (tag === "UL" || tag === "OL") return serializeListMarkdown(node);
  if (tag === "LI") return serializeListItem(node, "-");
  if (tag === "PRE") return "```\n" + getNodeText(node).trim() + "\n```";
  if (/^H[1-6]$/.test(tag)) {
    var level = parseInt(tag.charAt(1), 10);
    return "#".repeat(level) + " " + serializeChildrenInline(node).trim();
  }
  if (tag === "BLOCKQUOTE") {
    return serializeNodeChildrenToMarkdown(node).split("\n").map(function (line) {
      return line ? "> " + line : ">";
    }).join("\n");
  }

  if (!hasElementChildren(node)) return getNodeText(node);
  return serializeNodeChildrenToMarkdown(node);
}

function serializeNodeChildrenToMarkdown(node) {
  var blocks = getNodeChildren(node).map(function (child) {
    return serializeNodeToMarkdown(child);
  }).map(normalizeExportText).filter(Boolean);

  return blocks.join("\n\n");
}

function serializeMessageNodeToMarkdown(node, role) {
  if (!node || !node.isConnected) return "";
  var body = typeof getMessageBodyNode === "function" ? getMessageBodyNode(node, role) : node;
  return normalizeExportText(serializeNodeToMarkdown(body || node));
}

function getGroupAssistantText(group) {
  var domText = serializeMessageNodeToMarkdown(group.assistantEl, "assistant");
  if (domText) return domText;

  return normalizeExportText(
    group.assistantText ||
    group.assistantSearchText ||
    group.assistantExcerpt ||
    ""
  );
}

function collectExportFromGroups() {
  var groups = window._groups || [];
  return groups.map(function (group, index) {
    var userDomText = serializeMessageNodeToMarkdown(group.el, "user");
    return {
      index: index + 1,
      user: userDomText || normalizeExportText(group.text || group.title || ""),
      assistant: getGroupAssistantText(group),
      headings: (group.subs || []).map(function (sub) {
        return {
          title: sub.title || "",
          depth: typeof sub.depth === "number" ? sub.depth : 0,
        };
      }),
    };
  }).filter(function (item) {
    return item.user || item.assistant;
  });
}

function collectExportFromDOM() {
  var messages = typeof findAllMessages === "function" ? findAllMessages() : [];
  var items = [];
  var current = null;

  messages.forEach(function (node) {
    var role = detectRole(node);
    if (role !== "user" && role !== "assistant") return;

    var text = serializeMessageNodeToMarkdown(node, role) || normalizeExportText(getMessageText(node, role));
    if (!text) return;

    if (role === "user") {
      current = {
        index: items.length + 1,
        user: text,
        assistant: "",
        headings: [],
      };
      items.push(current);
      return;
    }

    if (!current) {
      current = {
        index: items.length + 1,
        user: "",
        assistant: "",
        headings: [],
      };
      items.push(current);
    }
    current.assistant = current.assistant ? current.assistant + "\n\n" + text : text;
  });

  return items;
}

function collectExportItems() {
  var groupItems = collectExportFromGroups();
  if (groupItems.length > 0) return groupItems;
  return collectExportFromDOM();
}

function escapeMarkdownHeading(text) {
  return String(text || "").replace(/^#+\s*/gm, "").trim();
}

function buildMarkdownExport(items) {
  var title = getExportTitle();
  var lines = [
    "# " + escapeMarkdownHeading(title),
    "",
    "- 平台：" + getPlatformName(),
    "- 来源：" + location.href,
    "- 导出时间：" + new Date().toLocaleString(),
    "",
  ];

  items.forEach(function (item) {
    lines.push("## " + item.index + ". 用户");
    lines.push("");
    lines.push(item.user || "_空消息_");
    lines.push("");
    lines.push("## " + item.index + ". AI");
    lines.push("");
    lines.push(item.assistant || "_暂无回答内容_");
    lines.push("");
  });

  return lines.join("\n").replace(/\n{4,}/g, "\n\n\n");
}

function downloadTextFile(filename, content, mimeType) {
  var blob = new Blob([content], { type: mimeType });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(function () {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function markdownToExportHtml(text) {
  var escaped = escapeHtml(text);
  escaped = escaped.replace(/^#### (.*)$/gm, "<h5>$1</h5>");
  escaped = escaped.replace(/^### (.*)$/gm, "<h4>$1</h4>");
  escaped = escaped.replace(/^## (.*)$/gm, "<h3>$1</h3>");
  escaped = escaped.replace(/^# (.*)$/gm, "<h2>$1</h2>");
  escaped = escaped.replace(/```([\s\S]*?)```/g, function (_, code) {
    return "<pre><code>" + code.trim() + "</code></pre>";
  });
  return escaped
    .split(/\n{2,}/)
    .map(function (block) {
      if (/^<h[2-5]>/.test(block) || /^<pre>/.test(block)) return block;
      return "<p>" + block.replace(/\n/g, "<br>") + "</p>";
    })
    .join("\n");
}

function buildPrintableHtml(items) {
  var title = getExportTitle();
  var body = items.map(function (item) {
    return [
      '<section class="turn">',
      '<h2>' + item.index + ". 用户</h2>",
      '<div class="message user">' + markdownToExportHtml(item.user || "空消息") + "</div>",
      '<h2>' + item.index + ". AI</h2>",
      '<div class="message assistant">' + markdownToExportHtml(item.assistant || "暂无回答内容") + "</div>",
      "</section>",
    ].join("");
  }).join("");

  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8">',
    "<title>" + escapeHtml(title) + "</title>",
    "<style>",
    "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#111827;line-height:1.65;margin:32px;}",
    "h1{font-size:24px;margin:0 0 8px;} h2{font-size:16px;margin:24px 0 8px;color:#111827;} h3,h4,h5{margin:16px 0 8px;}",
    ".meta{color:#6b7280;font-size:12px;margin-bottom:24px;border-bottom:1px solid #e5e7eb;padding-bottom:12px;}",
    ".turn{break-inside:avoid;margin-bottom:28px;} .message{border-left:3px solid #d1d5db;padding:8px 12px;background:#f9fafb;}",
    ".assistant{border-left-color:#10a37f;} .user{border-left-color:#6366f1;} pre{white-space:pre-wrap;background:#111827;color:#f9fafb;padding:12px;border-radius:6px;}",
    "p{margin:0 0 10px;} @media print{body{margin:18mm;} .turn{break-inside:auto;}}",
    "</style>",
    "</head>",
    "<body>",
    "<h1>" + escapeHtml(title) + "</h1>",
    '<div class="meta">平台：' + escapeHtml(getPlatformName()) + "<br>来源：" + escapeHtml(location.href) + "<br>导出时间：" + escapeHtml(new Date().toLocaleString()) + "</div>",
    body,
    "</body></html>",
  ].join("");
}

function openPdfPrintWindow(items, printWindow) {
  printWindow = printWindow || window.open("", "_blank");
  if (!printWindow) {
    alert("无法打开 PDF 导出窗口，请允许此网站弹出窗口后重试。");
    return false;
  }

  printWindow.document.open();
  printWindow.document.write(buildPrintableHtml(items));
  printWindow.document.close();
  printWindow.focus();
  setTimeout(function () {
    printWindow.print();
  }, 300);
  return true;
}

async function exportChat(format) {
  var printWindow = null;
  if (format === "pdf") {
    printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("无法打开 PDF 导出窗口，请允许此网站弹出窗口后重试。");
      return false;
    }
    printWindow.document.write("<!doctype html><meta charset=\"utf-8\"><title>准备导出</title><body>正在准备 PDF…</body>");
  }

  if (typeof window.ctocRefresh === "function") {
    try {
      await window.ctocRefresh();
    } catch (_) {}
  } else if (typeof buildTOC === "function") {
    await buildTOC();
  }

  var items = collectExportItems();
  if (items.length === 0) {
    if (printWindow && typeof printWindow.close === "function") printWindow.close();
    alert("暂无可导出的聊天内容。");
    return false;
  }

  if (format === "markdown") {
    downloadTextFile(getExportFilename("md"), buildMarkdownExport(items), "text/markdown;charset=utf-8");
    return true;
  }

  if (format === "pdf") {
    return openPdfPrintWindow(items, printWindow);
  }

  if (printWindow && typeof printWindow.close === "function") printWindow.close();
  return false;
}

window.ctocExport = exportChat;
