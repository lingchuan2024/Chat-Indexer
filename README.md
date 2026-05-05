# AI Chat 目录导航

为 AI 对话页面自动生成可折叠目录，支持搜索、快速跳转和阅读位置追踪。

## 支持的平台

对已列入支持范围的平台，插件会优先使用平台专用选择器；当专用规则失效时，回退到通用 DOM 结构进行自动适配。

| 平台 | 适配方式 | 说明 |
|------|----------|------|
| ChatGPT | 专用适配 | chatgpt.com / chat.openai.com |
| DeepSeek | 通用适配 | chat.deepseek.com |
| Kimi | 通用适配 | kimi.moonshot.cn |
| Gemini | 通用适配 | gemini.google.com |
| Claude | 通用适配 | claude.ai |
| 腾讯元宝 | 通用适配 | yuanbao.tencent.com |
| 通义千问 | 通用适配 | tongyi.aliyun.com |
| Poe | 通用适配 | poe.com |
| Perplexity | 通用适配 | perplexity.ai |

- **专用适配**：代码中有该平台的专属选择器配置，识别精度最高
- **通用适配**：通过 `data-role`、CSS 类名、DOM 结构启发式识别用户/AI 消息，大多数情况下能正常工作

不在列表中的平台不会被注入，因为 Chrome 扩展的 `manifest.json` 需要显式声明 URL 匹配规则。

## 安装

### Edge / Chrome（Chromium 内核）

1. 打开浏览器，地址栏输入 `edge://extensions/` 或 `chrome://extensions/`
2. 右上角开启 **「开发人员模式」**
3. 点击 **「加载解压缩的扩展」**
4. 选择本插件目录（包含 `manifest.json` 的文件夹）
5. 打开任意支持的 AI 对话页面，右侧即出现目录面板

### Firefox

1. 将 `manifest.json` 中的 `"manifest_version": 3` 改为 `2`
2. 地址栏输入 `about:debugging`
3. 点击 **「临时载入附加组件」**
4. 选择 `manifest.json` 文件

## 使用

### 目录面板

- 每个**用户提问**自动成为一个目录项
- 如果 AI 回复中包含 Markdown 标题（`##`、`###` 等），点击问题左侧的 `▶` 可展开查看
- 点击目录项平滑跳转到对应位置，目标会有绿色高亮
- **双击**问题行可直接跳转到该提问

### 阅读位置追踪

- 滚动对话时，目录中当前正在阅读的问题会自动高亮（紫色左边框 + 深色背景）
- 目录列表也会自动滚动，确保当前项始终在可见范围内

### 搜索

- 顶部搜索框输入关键词，实时过滤目录
- 搜索范围覆盖用户提问、AI 回复中的标题、以及 AI 回复正文
- 匹配到正文时显示上下文片段（斜体），点击跳转到对应段落

### 面板操作

| 操作 | 方式 |
|------|------|
| 折叠/展开 | 点击右上角 `>` 按钮 |
| 调宽度 | 鼠标移到面板左边缘拖拽（140px ~ 420px） |
| 拖位置 | 按住面板顶部标题栏上下拖动 |
| 恢复面板 | 折叠后右下角出现圆形按钮，点击展开 |

面板宽度、位置、折叠状态会自动保存，刷新页面后恢复。

## 项目结构

```
├── manifest.json     # Chrome 扩展配置
├── content.js        # 入口：初始化、SPA 导航、位置同步
├── platforms.js      # 平台检测与角色识别
├── scanner.js        # DOM 扫描与目录数据提取
├── renderer.js       # 目录渲染与当前阅读项高亮
├── layout.js         # 侧边栏 UI、拖拽、缩放、设置持久化
├── utils.js          # 工具函数
├── content.css       # 样式
└── icons/            # 图标
```
