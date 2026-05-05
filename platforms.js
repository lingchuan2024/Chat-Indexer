/* platforms.js — platform detection & adapter helpers */
"use strict";

var PLATFORM_HOST = location.hostname.replace(/^www\./, "");

var DEFAULT_PLATFORM_CONFIG = {
  name: "AI Chat",
  msgSelectors: [
    '[data-message-author-role]',
    '[data-role="user"], [data-role="assistant"], [data-role="model"], [data-role="human"], [data-role="ai"], [data-role="bot"]',
    '[class*="conversation-turn"]',
    '[class*="user-message"], [class*="assistant-message"]',
    '[class*="user-query"], [class*="model-response"]',
    '[class*="prompt"], [class*="response"]',
    '[class*="turn"], [class*="dialogue"]',
    "article",
  ],
  idAttrs: ["data-message-id", "data-testid", "id"],
  roleAttr: null,
  roleMap: {},
  userSelectors: [],
  assistantSelectors: [],
  scrollSelectors: [],
  excludeSelectors: [
    "#ctoc-sidebar",
    "#ctoc-toggle-btn",
    "nav",
    "aside",
    "header",
    "footer",
    '[role="navigation"]',
    '[role="complementary"]',
  ],
};

var PLATFORM_CONFIGS = {
  "chatgpt.com": {
    name: "ChatGPT",
    msgSelectors: ['[data-message-author-role]'],
    idAttrs: ["data-message-id", "data-testid", "id"],
    roleAttr: "data-message-author-role",
    roleMap: {
      user: "user",
      assistant: "assistant",
    },
    scrollSelectors: ['[class*="react-scroll-to-bottom"]'],
  },
  "chat.openai.com": {
    name: "ChatGPT",
    msgSelectors: ['[data-message-author-role]'],
    idAttrs: ["data-message-id", "data-testid", "id"],
    roleAttr: "data-message-author-role",
    roleMap: {
      user: "user",
      assistant: "assistant",
    },
    scrollSelectors: ['[class*="react-scroll-to-bottom"]'],
  },
  "chat.deepseek.com": {
    name: "DeepSeek",
    msgSelectors: [
      '[data-virtual-list-item-key]',
      '[data-role="user"], [data-role="assistant"], [data-role="model"]',
      '[class*="message-row"]',
      '[class*="chat-message"]',
      '[class*="message"][class*="user"], [class*="message"][class*="assistant"]',
      '[class*="turn"], [class*="dialogue"]',
    ],
    idAttrs: ["data-message-id", "data-testid", "id"],
    userSelectors: ['[data-role="user"]'],
    assistantSelectors: ['[data-role="assistant"]', '[data-role="model"]'],
    scrollSelectors: ["main", '[class*="scroll"]'],
  },
  "kimi.com": {
    name: "Kimi",
    msgSelectors: [
      '[data-role="user"], [data-role="assistant"], [data-role="model"]',
      '[class*="message"][class*="user"], [class*="message"][class*="assistant"]',
      '[class*="chat"], [class*="message"], [class*="bubble"]',
      '[class*="turn"], article',
    ],
    idAttrs: ["data-message-id", "data-testid", "id"],
    userSelectors: ['[data-role="user"]'],
    assistantSelectors: ['[data-role="assistant"]', '[data-role="model"]'],
    scrollSelectors: ["main", '[class*="scroll"]'],
  },
  "kimi.ai": {
    name: "Kimi",
    msgSelectors: [
      '[data-role="user"], [data-role="assistant"], [data-role="model"]',
      '[class*="message"][class*="user"], [class*="message"][class*="assistant"]',
      '[class*="chat"], [class*="message"], [class*="bubble"]',
      '[class*="turn"], article',
    ],
    idAttrs: ["data-message-id", "data-testid", "id"],
    userSelectors: ['[data-role="user"]'],
    assistantSelectors: ['[data-role="assistant"]', '[data-role="model"]'],
    scrollSelectors: ["main", '[class*="scroll"]'],
  },
  "kimi.moonshot.cn": {
    name: "Kimi",
    msgSelectors: [
      '[data-role="user"], [data-role="assistant"], [data-role="model"]',
      '[class*="message"][class*="user"], [class*="message"][class*="assistant"]',
      '[class*="chat"], [class*="message"], [class*="bubble"]',
      '[class*="turn"], article',
    ],
    idAttrs: ["data-message-id", "data-testid", "id"],
    userSelectors: ['[data-role="user"]'],
    assistantSelectors: ['[data-role="assistant"]', '[data-role="model"]'],
    scrollSelectors: ["main", '[class*="scroll"]'],
  },
  "gemini.google.com": {
    name: "Gemini",
    msgSelectors: [
      '.user-query-bubble-with-background',
      'message-content',
    ],
    idAttrs: ["data-message-id", "data-testid", "id"],
    userSelectors: ['[data-role="user"]', '.user-query-bubble-with-background', '.query-text', '.query-text-line'],
    assistantSelectors: ['[data-role="assistant"]', '[data-role="model"]', '[class*="model-response"]', '[class*="response-container"]', 'message-content'],
    scrollSelectors: ["main", '[class*="scroll"]'],
  },
};

function mergeConfig(base, extra) {
  var merged = {};
  Object.keys(base).forEach(function (key) {
    var value = base[key];
    merged[key] = Array.isArray(value) ? value.slice() : value;
  });
  if (!extra) return merged;

  Object.keys(extra).forEach(function (key) {
    var value = extra[key];
    if (Array.isArray(value)) {
      merged[key] = value.slice();
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      merged[key] = Object.assign({}, merged[key] || {}, value);
    } else {
      merged[key] = value;
    }
  });
  return merged;
}

function uniqueList(items) {
  var seen = {};
  return items.filter(function (item) {
    if (!item || seen[item]) return false;
    seen[item] = true;
    return true;
  });
}

var PLATFORM_CONFIG = mergeConfig(DEFAULT_PLATFORM_CONFIG, PLATFORM_CONFIGS[PLATFORM_HOST]);

function getConfig() {
  return PLATFORM_CONFIG;
}

function getPlatformName() {
  return PLATFORM_CONFIG.name || PLATFORM_HOST;
}

function getMessageSelectors() {
  return uniqueList((PLATFORM_CONFIG.msgSelectors || []).concat(DEFAULT_PLATFORM_CONFIG.msgSelectors));
}

function getScrollSelectors() {
  return uniqueList((PLATFORM_CONFIG.scrollSelectors || []).concat(DEFAULT_PLATFORM_CONFIG.scrollSelectors));
}

function getExcludeSelectors() {
  return uniqueList((PLATFORM_CONFIG.excludeSelectors || []).concat(DEFAULT_PLATFORM_CONFIG.excludeSelectors));
}

function matchesSelectorList(node, selectors) {
  if (!node || !selectors || selectors.length === 0) return false;
  for (var i = 0; i < selectors.length; i++) {
    try {
      if (node.matches(selectors[i]) || node.querySelector(selectors[i])) return true;
    } catch (_) {}
  }
  return false;
}

function detectRole(node) {
  if (!node) return "unknown";

  var cfg = getConfig();
  if (PLATFORM_HOST === "chat.deepseek.com" && node.hasAttribute("data-virtual-list-item-key")) {
    var styleText = (node.getAttribute("style") || "").toLowerCase();
    if (styleText.indexOf("assistant-last-padding-bottom") !== -1) return "assistant";
    if (node.querySelector(".fbb737a4")) return "user";
    if (node.querySelector("h1, h2, h3, h4, ul, ol, table, pre, blockquote")) return "assistant";
  }
  if (PLATFORM_HOST === "gemini.google.com") {
    if (node.matches(".user-query-bubble-with-background, .query-text, .query-text-line") || node.querySelector(".user-query-bubble-with-background, .query-text-line")) {
      return "user";
    }
    if (
      node.matches('message-content, [class*="model-response"], [class*="response-container"], [class*="response-content"]') ||
      node.querySelector('message-content, [class*="model-response"], [class*="response-content"]')
    ) {
      return "assistant";
    }
  }

  if (cfg.roleAttr) {
    var attrValue = (node.getAttribute(cfg.roleAttr) || "").toLowerCase();
    if (attrValue) {
      if (attrValue === (cfg.roleMap.user || "").toLowerCase()) return "user";
      if (attrValue === (cfg.roleMap.assistant || "").toLowerCase()) return "assistant";
    }
  }

  if (matchesSelectorList(node, cfg.userSelectors)) return "user";
  if (matchesSelectorList(node, cfg.assistantSelectors)) return "assistant";

  var attrCandidates = [
    node.getAttribute("data-message-author-role"),
    node.getAttribute("data-role"),
    node.getAttribute("aria-label"),
    node.getAttribute("data-testid"),
    node.getAttribute("class"),
  ];
  var combined = attrCandidates
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\b(user|human|question|query|prompt)\b/.test(combined)) return "user";
  if (/\b(assistant|model|response|answer|reply|bot|ai|gemini|kimi|deepseek)\b/.test(combined)) return "assistant";

  var rect = typeof node.getBoundingClientRect === "function" ? node.getBoundingClientRect() : null;
  if (rect && rect.width > 80 && window.innerWidth > 0) {
    if (rect.left > window.innerWidth * 0.5 && rect.width < window.innerWidth * 0.42) return "user";
    if (rect.left < window.innerWidth * 0.5 && rect.width > window.innerWidth * 0.22) return "assistant";
  }

  return "unknown";
}

function getMessageId(node, idx, role) {
  if (!node) return "msg-" + idx;

  var cfg = getConfig();
  var attrs = uniqueList((cfg.idAttrs || []).concat(DEFAULT_PLATFORM_CONFIG.idAttrs));
  for (var i = 0; i < attrs.length; i++) {
    var id = node.getAttribute(attrs[i]);
    if (id) return id;
  }

  var cachedId = node.getAttribute("data-ctoc-message-id");
  if (cachedId) return cachedId;

  var generated = (role || "msg") + "-" + idx;
  node.setAttribute("data-ctoc-message-id", generated);
  return generated;
}
