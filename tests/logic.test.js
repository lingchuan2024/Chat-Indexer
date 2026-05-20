const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function makeContext() {
  const storage = new Map();
  const context = {
    console,
    setTimeout,
    clearTimeout,
    window: { _groups: [] },
    location: {
      hostname: "chatgpt.com",
      pathname: "/c/current",
      href: "https://chatgpt.com/c/current",
      origin: "https://chatgpt.com",
    },
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
      removeItem(key) {
        storage.delete(key);
      },
    },
    document: {
      title: "Example Chat",
      body: {},
      documentElement: {},
      scrollingElement: null,
    },
    Node: {
      ELEMENT_NODE: 1,
      DOCUMENT_POSITION_FOLLOWING: 4,
      DOCUMENT_POSITION_PRECEDING: 2,
    },
    PLATFORM_HOST: "chatgpt.com",
  };

  vm.createContext(context);
  ["utils.js", "scanner.js"].forEach((file) => {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  });
  return context;
}

function loadRenderer(context) {
  context.document.querySelectorAll = function () {
    return [];
  };
  context.findAllMessages = function () {
    return [];
  };
  context.detectRole = function () {
    return "unknown";
  };
  vm.runInContext(fs.readFileSync(path.join(root, "renderer.js"), "utf8"), context, { filename: "renderer.js" });
}

function loadExporter(context) {
  context.getPlatformName = function () {
    return "ChatGPT";
  };
  vm.runInContext(fs.readFileSync(path.join(root, "exporter.js"), "utf8"), context, { filename: "exporter.js" });
}

function textNode(text) {
  return {
    nodeType: 3,
    nodeValue: text,
    textContent: text,
  };
}

function elementNode(tagName, children = [], attrs = {}) {
  const node = {
    nodeType: 1,
    tagName,
    childNodes: children,
    children: children.filter((child) => child.nodeType === 1),
    isConnected: true,
    parentElement: null,
    getAttribute(name) {
      return attrs[name] || "";
    },
  };

  children.forEach((child) => {
    child.parentElement = node;
  });

  Object.defineProperty(node, "textContent", {
    get() {
      return children.map((child) => child.textContent || child.nodeValue || "").join("");
    },
  });

  return node;
}

function mappingItem(id, role, text, parent, createTime) {
  return {
    parent,
    message: {
      id,
      author: { role },
      content: { parts: [text] },
      create_time: createTime || 0,
    },
  };
}

test("conversation data follows the active current_node path", () => {
  const context = makeContext();
  const groups = context.buildGroupsFromConversationData({
    current_node: "a2",
    mapping: {
      root: { parent: null, message: null },
      u1: mappingItem("u1", "user", "First question", "root", 1),
      a1: mappingItem("a1", "assistant", "# First answer", "u1", 2),
      u2: mappingItem("u2", "user", "Second question", "a1", 3),
      a2: mappingItem("a2", "assistant", "# Second answer", "u2", 4),
      branchUser: mappingItem("branchUser", "user", "Inactive branch", "a1", 5),
      branchAnswer: mappingItem("branchAnswer", "assistant", "# Hidden answer", "branchUser", 6),
    },
  });

  assert.deepEqual(Array.from(groups, (group) => group.title), ["First question", "Second question"]);
  assert.deepEqual(
    Array.from(groups).flatMap((group) => Array.from(group.subs, (sub) => sub.title)),
    ["First answer", "Second answer"]
  );
});

test("conversation data keeps metadata for the first assistant after a user", () => {
  const context = makeContext();
  const groups = context.buildGroupsFromConversationData({
    current_node: "a2",
    mapping: {
      u1: mappingItem("u1", "user", "Question", null, 1),
      a1: mappingItem("a1", "assistant", "First assistant chunk", "u1", 2),
      a2: mappingItem("a2", "assistant", "Second assistant chunk", "a1", 3),
    },
  });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].assistantId, "a1");
  assert.equal(groups[0].assistantExcerpt, "First assistant chunk");
  assert.match(groups[0].assistantText, /First assistant chunk/);
  assert.match(groups[0].assistantText, /Second assistant chunk/);
});

test("cached ChatGPT groups do not block DOM updates", async () => {
  const context = makeContext();
  const cacheKey = "ctoc-chatgpt-cache::current";
  context.localStorage.setItem(cacheKey, JSON.stringify([
    {
      id: "api-u1",
      title: "Old question",
      text: "",
      el: null,
      userIndex: 0,
      subs: [],
      assistantText: "",
      assistantSearchText: "Old answer",
      assistantEl: null,
      assistantId: "api-a1",
      assistantIndex: 1,
      assistantExcerpt: "Old answer",
    },
  ]));

  context.__messages = [
    { id: "u1", role: "user", text: "Old question" },
    { id: "a1", role: "assistant", text: "Old answer" },
    { id: "u2", role: "user", text: "New question" },
    { id: "a2", role: "assistant", text: "# New heading\nNew answer" },
  ];
  context.__renders = [];

  vm.runInContext(`
    renderTOC = function (groups) { __renders.push(groups.map(function (group) { return group.title; })); };
    hydrateHistoryForTOC = async function () { return null; };
    findAllMessages = function () { return __messages; };
    detectRole = function (node) { return node.role; };
    getMessageText = function (node) { return node.text; };
    getMessageId = function (node) { return node.id; };
    getMessageBodyNode = function (node) {
      return {
        querySelectorAll: function () { return []; },
      };
    };
  `, context);

  await context.buildTOC();

  assert.deepEqual(Array.from(context.window._groups, (group) => group.title), ["Old question", "New question"]);
  assert.deepEqual(Array.from(context.__renders.at(-1)), ["Old question", "New question"]);
  assert.match(context.localStorage.getItem(cacheKey), /New question/);
});

test("partial DOM refresh replaces cached groups by title when ids differ", () => {
  const context = makeContext();
  const merged = context.mergeGroupsPreservingExisting(
    [
      { id: "api-u1", title: "Visible question", subs: [], assistantText: "" },
      { id: "api-u2", title: "Cached question", subs: [], assistantText: "" },
    ],
    [
      { id: "dom-u1", title: "Visible question", subs: [], assistantText: "fresh" },
    ]
  );

  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, "dom-u1");
  assert.equal(merged[1].id, "api-u2");
});

test("manual refresh can clear only the current conversation cache", () => {
  const context = makeContext();
  context.localStorage.setItem("ctoc-chatgpt-cache::current", JSON.stringify([{ title: "Current" }]));
  context.localStorage.setItem("ctoc-chatgpt-cache::other", JSON.stringify([{ title: "Other" }]));
  context.localStorage.setItem("ctoc-chatgpt-cache-index", JSON.stringify([
    { key: "ctoc-chatgpt-cache::current" },
    { key: "ctoc-chatgpt-cache::other" },
  ]));

  assert.equal(context.clearCachedConversationGroups("current"), true);

  assert.equal(context.localStorage.getItem("ctoc-chatgpt-cache::current"), null);
  assert.match(context.localStorage.getItem("ctoc-chatgpt-cache::other"), /Other/);
  assert.deepEqual(
    JSON.parse(context.localStorage.getItem("ctoc-chatgpt-cache-index")),
    [{ key: "ctoc-chatgpt-cache::other" }]
  );
});

test("markdown export includes conversation metadata and turns", () => {
  const context = makeContext();
  loadExporter(context);
  context.window._groups = [
    {
      title: "How to test export?",
      text: "How to test export?",
      assistantText: "# Steps\nRun the tests.",
      subs: [{ title: "Steps", depth: 0 }],
    },
  ];

  const markdown = context.buildMarkdownExport(context.collectExportItems());

  assert.match(markdown, /^# How to test export/);
  assert.match(markdown, /- 平台：ChatGPT/);
  assert.match(markdown, /## 1\. 用户/);
  assert.match(markdown, /How to test export\?/);
  assert.match(markdown, /## 1\. AI/);
  assert.match(markdown, /# Steps\nRun the tests\./);
});

test("markdown export preserves unordered and ordered list markers from DOM", () => {
  const context = makeContext();
  loadExporter(context);

  const assistantEl = elementNode("DIV", [
    elementNode("P", [textNode("并列内容：")]),
    elementNode("UL", [
      elementNode("LI", [textNode("第一项")]),
      elementNode("LI", [textNode("第二项")]),
    ]),
    elementNode("OL", [
      elementNode("LI", [textNode("步骤一")]),
      elementNode("LI", [textNode("步骤二")]),
    ]),
  ]);

  context.window._groups = [
    {
      title: "请列出内容",
      text: "请列出内容",
      assistantEl,
      assistantText: "并列内容：\n第一项\n第二项\n步骤一\n步骤二",
      subs: [],
    },
  ];

  const markdown = context.buildMarkdownExport(context.collectExportItems());

  assert.match(markdown, /并列内容：/);
  assert.match(markdown, /- 第一项/);
  assert.match(markdown, /- 第二项/);
  assert.match(markdown, /1\. 步骤一/);
  assert.match(markdown, /2\. 步骤二/);
});

test("sub navigation can distinguish real heading miss from message fallback", () => {
  const context = makeContext();
  loadRenderer(context);

  const messageEl = {
    isConnected: true,
    querySelectorAll() {
      return [];
    },
  };
  const group = {
    el: messageEl,
    assistantEl: null,
    subs: [],
    title: "Question",
  };
  const sub = {
    title: "Missing heading",
    el: null,
  };

  context.findBestTextMatch = function () {
    return null;
  };
  context.findTextContainer = function () {
    return null;
  };

  assert.equal(context.resolveSubEl(group, sub), messageEl);
  assert.equal(context.resolveSubEl(group, sub, { allowMessageFallback: false }), null);
});

test("conversation reset clears stale return-position history", () => {
  const context = makeContext();
  let buttonUpdates = 0;
  context.navigationHistory.push({ scrollTop: 100, isDocumentScroll: true });
  context.isRestoringNavigation = true;
  context.updateReturnButtonState = function () {
    buttonUpdates++;
  };

  context.resetConversationState();

  assert.equal(context.navigationHistory.length, 0);
  assert.equal(context.isRestoringNavigation, false);
  assert.equal(buttonUpdates > 0, true);
});
