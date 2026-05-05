/* platforms.js — platform detection & role resolution */
"use strict";

var PLATFORM_HOST = location.hostname.replace(/^www\./, "");

var PLATFORM_CONFIGS = {
  "chatgpt.com": {
    name: "ChatGPT",
    msgSelector: '[data-message-author-role]',
    roleAttr: "data-message-author-role",
    idAttr: "data-message-id",
    userValue: "user",
    assistantValue: "assistant",
    scrollSelector: '[class*="react-scroll-to-bottom"]',
  },
  "chat.openai.com": {
    name: "ChatGPT",
    msgSelector: '[data-message-author-role]',
    roleAttr: "data-message-author-role",
    idAttr: "data-message-id",
    userValue: "user",
    assistantValue: "assistant",
    scrollSelector: '[class*="react-scroll-to-bottom"]',
  },
  "chat.deepseek.com": {
    name: "DeepSeek",
    msgSelector: null,
    roleAttr: null,
    idAttr: null,
    userValue: null,
    assistantValue: null,
    scrollSelector: '[class*="scroll"]',
  },
  "kimi.moonshot.cn": {
    name: "Kimi",
    msgSelector: null,
    roleAttr: null,
    idAttr: null,
    userValue: null,
    assistantValue: null,
    scrollSelector: null,
  },
  "gemini.google.com": {
    name: "Gemini",
    msgSelector: '[class*="user-query"], [class*="model-response"]',
    roleAttr: null,
    idAttr: null,
    userValue: null,
    assistantValue: null,
    scrollSelector: null,
  },
  "claude.ai": {
    name: "Claude",
    msgSelector: null,
    roleAttr: null,
    idAttr: null,
    userValue: null,
    assistantValue: null,
    scrollSelector: '[class*="scroll"]',
  },
  "yuanbao.tencent.com": {
    name: "元宝",
    msgSelector: null,
    roleAttr: null,
    idAttr: null,
    userValue: null,
    assistantValue: null,
    scrollSelector: null,
  },
  "tongyi.aliyun.com": {
    name: "通义千问",
    msgSelector: null,
    roleAttr: null,
    idAttr: null,
    userValue: null,
    assistantValue: null,
    scrollSelector: null,
  },
};

function getConfig() {
  return PLATFORM_CONFIGS[PLATFORM_HOST] || null;
}

function getPlatformName() {
  var c = getConfig();
  return c ? c.name : PLATFORM_HOST;
}

function detectRole(node) {
  var cfg = getConfig();

  if (cfg && cfg.roleAttr && cfg.userValue) {
    var v = node.getAttribute(cfg.roleAttr);
    if (v === cfg.userValue) return "user";
    if (v === cfg.assistantValue) return "assistant";
  }

  var dmRole = node.getAttribute("data-message-author-role");
  if (dmRole) return dmRole;

  var dRole = node.getAttribute("data-role");
  if (dRole === "user" || dRole === "human") return "user";
  if (dRole === "assistant" || dRole === "model" || dRole === "ai" || dRole === "bot") return "assistant";

  var cls = (node.getAttribute("class") || "").toLowerCase();
  if (/\buser\b/.test(cls) || /\bhuman\b/.test(cls) || /\bquestion\b/.test(cls)) return "user";
  if (/\bassistant\b/.test(cls) || /\bmodel\b/.test(cls) || /\bresponse\b/.test(cls) || /\banswer\b/.test(cls) || /\breply\b/.test(cls)) return "assistant";

  return "unknown";
}

function getMessageId(node, idx) {
  var cfg = getConfig();
  if (cfg && cfg.idAttr) {
    var id = node.getAttribute(cfg.idAttr);
    if (id) return id;
  }
  return node.getAttribute("data-message-id") || "msg-" + idx;
}
