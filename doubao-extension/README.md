# AI 第二大脑 · 通用提炼（浏览器扩展）

在**任意 AI 网页**（豆包 / ChatGPT / Work Buddy / Kimi / 通义千问 / 文心一言…）一键把当前对话提炼成 Markdown 笔记，写入你的 Obsidian 库。
「提炼引擎」由本机 DeepSeek Harness 提供（`/api/second-brain/distill`）。

## 前置条件

1. 本机 DeepSeek Harness 正在运行（http://127.0.0.1:3080）。
2. 在 Harness 里完成配置：
   - 打开 http://127.0.0.1:3080 → 左下角 **设置 ⚙️** → **AI 第二大脑**
   - 填好 **模型服务商 + API Key**（火山方舟 / DeepSeek / Kimi / 通义 / 自定义均可）
   - 在「📁 Obsidian 笔记目录」里填 **Obsidian 库绝对路径**（如 `/Users/你的用户名/Documents/Obsidian库`）
   - 点 **「💾 保存到本机」**（按钮变绿 = 已保存，扩展即可使用）

## 安装（Edge / Chrome 通用）

1. 打开 `edge://extensions`（Chrome 用 `chrome://extensions`）
2. 打开右上角「开发人员模式」
3. 点「**加载解压缩的扩展**」，选择本目录：`second-brain/doubao-extension`
4. 扩展在所有网站生效，无需逐个站点设置

## 使用

- **悬浮按钮（推荐）**：打开任意 AI 对话页，右下角有 **「✨ 提炼本对话」**。
  点击后自动滚到顶部加载历史、抓取消息、提炼并写入 Obsidian（右下角有进度提示）。
  扩展会自动识别当前站点（豆包 / ChatGPT / Work Buddy / Kimi / 通义…），作为笔记 `source/bot` 标注。
- **会话列表行按钮**：列表里鼠标悬停某条会话，右侧出现 **✨** 小按钮（对站点 DOM 结构敏感，若未出现请用悬浮按钮）。
- **🧩 调试按钮**：抓取失败时点击，会把页面结构报告复制到剪贴板，粘贴发给我即可校准。

## 常见问题

- 「无法连接本机 DeepSeek Harness」→ 确认 3080 端口服务在运行。
- 「尚未配置 Obsidian 库路径」→ 按上面第 2 步配置并「保存到本机」。
- 「没有识别到对话消息」→ 该站点页面结构特殊，点 🧩 调试，把报告发我适配。
- 含图对话：图片会被保存并嵌入笔记；若配了视觉模型（如方舟 `doubao-seed-1-6-flash` / 通义 qwen3-vl-plus），图片内容也会被识别进总结。
