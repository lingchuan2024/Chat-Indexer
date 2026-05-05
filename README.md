# AI Chat 目录导航

为 AI 聊天页面生成右侧目录，帮助你整理较长回答的文章结构，并在长对话里快速回看问题、跳转上下文、搜索重点内容。

适合这些场景：

- 整理较长回答的文章结构（快速看到章节层级）
- 你经常和 ChatGPT、DeepSeek、Gemini、Kimi 长对话
- 你想快速回到某一轮提问或某一段回答
- 你不想在一整页聊天记录里反复滚动查找

## 效果展示

![AI Chat TOC 效果展示](./image.png)

## 下载

请从 GitHub Releases 下载最新版安装包：

- [下载最新版本](https://github.com/lingchuan2024/-AI-Chat-/releases/latest)

## 功能

- 自动按对话生成目录
- 点击目录快速跳转到对应位置
- 支持目录搜索
- 支持当前阅读位置高亮
- 支持折叠 / 展开目录
- 支持调整面板宽度和位置
- 自动记住面板状态

## 支持平台

当前兼容情况：

| 平台     | 地址                                                                 | 状态       |
| -------- | -------------------------------------------------------------------- | ---------- |
| ChatGPT  | `chatgpt.com` / `chat.openai.com`                                | 较稳定     |
| DeepSeek | `chat.deepseek.com`                                                | 持续优化中 |
| Gemini   | `gemini.google.com`                                                | 持续优化中 |
| Kimi     | `www.kimi.com` / `kimi.com` / `kimi.ai` / `kimi.moonshot.cn` | 持续优化中 |

说明：

- ChatGPT 目前相对稳定
- DeepSeek、Gemini、Kimi 仍在持续适配页面结构变化
- 如果某个平台显示异常，欢迎提 Issue 或附截图反馈

## 安装方法

### Chrome / Edge

1. 打开 [最新 Release](https://github.com/lingchuan2024/-AI-Chat-/releases/latest)
2. 下载最新的扩展安装包 `zip`
3. 解压 `zip`
4. 打开浏览器扩展页面
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
5. 打开右上角 **开发者模式**
6. 点击 **加载已解压的扩展程序**
7. 选择刚才解压后的文件夹
8. 打开支持的 AI 对话页面，右侧会出现目录面板

## 使用说明

安装成功后，页面右侧会出现目录面板。

你可以这样用：

- 点击目录项：跳转到对应提问
- 点击左侧箭头：展开或折叠该轮回答里的标题
- 使用搜索框：筛选问题、标题和回答内容
- 拖动左边缘：调整目录宽度
- 拖动顶部：调整目录位置
- 点击折叠按钮：临时隐藏目录

## 常见问题

### 安装后没有看到目录

请先检查：

- 你打开的是支持的网站
- 扩展已经成功加载
- 页面已经刷新过一次
- 你加载的是解压后的扩展文件夹，而不是 zip 文件本身

### 某个平台目录不准确、重复，或者显示异常

这是因为不同网站的页面结构变化较快。

目前：

- ChatGPT 较稳定
- DeepSeek、Gemini、Kimi 仍在持续优化

如果你愿意反馈，请尽量附上：

- 浏览器截图
- 出问题的网址
- 浏览器版本
- 对应消息节点的 HTML 或开发者工具截图

### 更新版本后怎么升级

1. 下载最新 Release
2. 删除旧版本 zip 并解压新版本
3. 在扩展页面重新加载，或移除旧版本后重新添加

## 反馈

如果你遇到兼容问题，欢迎提交 Issue：

- [提交 Issue](https://github.com/lingchuan2024/-AI-Chat-/issues)

建议附带：

- 出问题的平台
- 问题截图
- 出问题页面的网址
- 复现步骤

## 版本发布

所有可下载版本请查看：

- [Releases](https://github.com/lingchuan2024/-AI-Chat-/releases)

## 开发说明

如果你希望本地开发或参与贡献，可以查看项目文件：

```text
├── manifest.json
├── content.js
├── platforms.js
├── scanner.js
├── renderer.js
├── layout.js
├── utils.js
├── content.css
└── icons/
```
