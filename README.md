# 🧠 AI 第二大脑（AI Second Brain）

把每天和各种 AI 的对话（豆包 / ChatGPT / DeepSeek / Kimi / 通义千问 / 文心一言…）**提炼成结构化 Markdown 笔记，写入你的 Obsidian 库**。提炼引擎跑在本机 DeepSeek Harness 里，模型服务商、版式、视觉识别均可配置。

## 功能特性

- **三种录入方式**：粘贴文本 / 导入对话文件 / 分享链接（豆包、ChatGPT、Kimi、DeepSeek、通义千问、智谱、文心一言）
- **浏览器扩展「通用提炼」**：任意 AI 网页右下角悬浮按钮一键提炼当前对话
- **Harness 会话直接提炼**：在设置页「📚 Harness 会话」或会话头部 ✨ 按钮，一键把本机 Harness 会话归档为笔记
- **服务端统一提炼管线**（单一事实源）：
  - 内容类型自动识别（知识 / 方法流程 / 分析讨论 / 创作产物 / 问题解决）
  - **版式偏好**：自动识别 / 生词卡片式 / 概念分层式 / 目标·过程·成效式 / 产物归档式 / 复盘式 / 学习笔记
  - **多课题自动分篇**：一个对话含多份独立内容产物时，自动拆成「一课题一篇」+ 索引页
  - **无限续写**防截断（长对话/长产物不再被 max_tokens 截断）
  - **提炼后自检**：对照原文查漏，发现问题自动带反馈重提炼一次（可开关）
- **图片处理**：
  - ChatGPT 分享链接的图片可抓取保存（依赖本机 Edge/Chrome + puppeteer-core，可选）
  - 配置视觉模型（豆包 / 通义 / 任意 OpenAI 兼容）后，图片内容会被识别并写入笔记 / 索引附图说明
  - 图片保存上限可配置（默认 50）
- **自定义整理要求**：填写后优先按你的规则整理，覆盖默认类型体系

## 项目结构

```
second-brain/
├── dsh-client-ui-second-brain/   # DSH 插件（本仓库主体）
│   ├── package.json              # 插件清单（node 半端 + 浏览器半端入口）
│   └── lib/
│       ├── index.js              # node 半端：同源代理路由 + 提炼管线 + Obsidian 写入
│       └── client.js             # 浏览器半端：设置面板 + 录入界面 + 归档记录
├── doubao-extension/             # 浏览器扩展（无构建，直接加载解压目录）
│   ├── manifest.json
│   ├── content.js                # 任意 AI 网页的对话抓取
│   ├── background.js             # 转发到本机 /api/second-brain/distill
│   └── popup.html / popup.js     # 状态检查
└── config.example.json           # 共享配置模板（真实配置在本机 ~/.dsh/plugins/second-brain/config.json）
```

## 安装

### 前置条件

- 本机运行 DeepSeek Harness（Web 界面，默认 http://127.0.0.1:3080）
- Node.js ≥ 18

### 方式 A：本地源码安装（开发 / 自用）

1. 克隆或复制仓库，例如放到 `~/deepseek harness/second-brain`
2. 建立软链，让 Harness 的 profile 能解析到插件：
   ```bash
   mkdir -p ~/.dsh/profiles/node_modules
   ln -s /absolute/path/to/second-brain/dsh-client-ui-second-brain ~/.dsh/profiles/node_modules/dsh-client-ui-second-brain
   ```
3. 在 profile 补丁层注册插件（`~/.dsh/profiles/web/cordis.patch.yml`）：
   ```yaml
   - insert:
       - id: second-brain
         name: 'dsh-client-ui-second-brain'
   ```
4. 重启 Harness，浏览器打开设置 ⚙️ → **AI 第二大脑**

### 方式 B：npm 安装（发布后可用）

```bash
dsh plugin add dsh-client-ui-second-brain
```

### 浏览器扩展安装

1. 打开 `edge://extensions`（Chrome 用 `chrome://extensions`）
2. 开启「开发人员模式」
3. 「加载解压缩的扩展」→ 选择 `doubao-extension` 目录
4. 在任意 AI 对话页右下角点 **「✨ 提炼本对话」**

## 配置（设置 → AI 第二大脑）

| 配置项 | 说明 |
| --- | --- |
| ① 主模型 | 写笔记用的服务商 / 模型 / API Key（豆包、DeepSeek、Kimi、通义、自定义 OpenAI 兼容） |
| ② 视觉模型 | 可选；含图对话用视觉模型识别图片内容（可独立服务商） |
| 版式偏好 | 默认笔记版式；`自动识别` 让模型按内容自行选择 |
| 笔记版本 | 精简版 / 完整版（完整版多加「需要注意的点」一节） |
| 提炼后自检 | 对照原文查漏，发现问题自动重提炼一次 |
| Obsidian 库路径 | 绝对路径；点「💾 保存到本机」后浏览器扩展与服务端共用 |
| 图片保存上限 | 默认 50；`0` 表示不保存图片 |
| 自定义整理要求 | 填写后优先按其整理 |

## 隐私与安全

- **API 密钥仅保存在本机** `~/.dsh/plugins/second-brain/config.json`，**不在仓库内**（见 `.gitignore`）；请勿把你的真实配置提交到任何仓库
- 所有本地路由**仅监听 127.0.0.1**，浏览器扩展也仅请求 `http://127.0.0.1:3080`
- 对话内容**只在本机处理**后写入你的 Obsidian 库；唯一的外发请求是发给你在设置里配置的模型服务商（提炼 / 视觉识别）
- ChatGPT 分享图片抓取需要本机安装 Edge/Chrome 与 `puppeteer-core`（可选能力，缺失时自动降级为纯文字总结）

## 开发

- 改 node 半端（`lib/index.js`）后需**重启 Harness** 生效
- 改浏览器半端（`lib/client.js`）后**硬刷新页面**即可
- 插件通过软链直接指向工作区源码，改完无需拷贝

## License

[MIT](./LICENSE)
