/**
 * AI 第二大脑 plugin, node half.
 *
 * Jobs:
 * 1. Qualify the loader entry so client-modules serves the browser bundle
 *    (exports["./client"], discovered via the package.json dsh.client field).
 * 2. Host-side proxy for Doubao share links: the Doubao public share API
 *    answers cross-origin requests from curl but not from the browser (no
 *    CORS preflight on www.doubao.com), so the browser half calls this
 *    same-origin route and it does the server-side fetch.
 * 3. Same-origin proxy for OpenAI-compatible LLM providers (Ark / DeepSeek /
 *    Kimi / DashScope / custom), so the browser never fights provider CORS.
 * 4. DeepSeek Harness session access: list sessions from the projection
 *    cache and read message content from the zstd-compressed session logs,
 *    so the plugin can distill the user's own harness conversations.
 * 5. Shared config + server-side Obsidian write + a one-shot distill route:
 *    the Doubao browser extension (and the GUI panel) POST a conversation and
 *    this host does LLM → markdown → write into the user's Obsidian vault,
 *    driven by a config file the GUI panel keeps in sync.
 */

import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { access, mkdir, readFile, readdir, rm, rmdir, unlink, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
// 图片去留的确定性执行层（纯逻辑，见 lib/judge.js）
import { applyKeepDropRules, computeReplacementMap } from "./judge.js";

const execFileAsync = promisify(execFile);
const ZSTD_CANDIDATES = ["zstd", "/opt/homebrew/bin/zstd", "/usr/local/bin/zstd"];

/** Shared plugin config (vault path, provider, key, …) kept on disk so the
 *  GUI panel and the browser extension use the same settings. */
const CONFIG_FILE = join(dshHome(), "plugins", "second-brain", "config.json");

async function readSharedConfig() {
	try {
		const raw = await readFile(CONFIG_FILE, "utf8");
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch {
		return {};
	}
}

async function writeSharedConfig(config) {
	await mkdir(dirname(CONFIG_FILE), { recursive: true });
	await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
}

//#region server-side note pipeline (mirrors the browser half)
function sb2bFormatDate(ts) {
	const d = new Date(ts || Date.now());
	const p = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function sb2bSlugify(text) {
	// 转成安全文件名：去掉 Windows/markdown/Obsidian 里容易出问题的字符，
	// 包括中文全角括号、冒号、逗号、单引号、井号、加号等，统一替换为 -。
	const s = String(text || "").trim()
		.replace(/[\\/:*?"<>|\s（）()：:，,、’'“”"'#+&]+/g, "-")
		.replace(/-{2,}/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
	return s || "note";
}
function sb2bExtractTitle(markdown, fallback) {
	const m = String(markdown || "").match(/^#\s+(.+)$/m);
	return m ? m[1].trim().slice(0, 80) : fallback || "未命名笔记";
}
// 锁定的版式偏好（设置页「版式偏好」下拉）：不填/auto=自动识别（默认）；
// 其余选项让用户固定默认版式。若对话明显属于「产物归档类」，仍按产物归档式
// 原样保留完整产物（见 sb2bSystemPrompt 里的说明）。
const SB2B_LAYOUT_PROMPTS = {
	vocab: [
		"**A. 生词卡片式**（语言学习 / 查词 / 翻译类）：",
		"   · 每个词/短语用 `### 单词` 独立成块，块与块之间用空行隔开，不挤在一起；",
		"   · 每词块第一行：`单词（+英/美音标，若有）`，音标用 /斜杠/ 标出；",
		"   · 分行列出：**词性·词义 → 搭配/用法 → 例句 → 易混/易错 → 记忆提示**（没有的项省略）；",
		"   · 中文释义为主，先核心义再引申义；讲拼写则标注 `✏️ 易拼错：xxx❌ → xxx✅`；",
		"   · 末尾可加 `## 高频背诵清单` 把核心词集中列出便于快速过。"
	].join("\n"),
	concept: [
		"**B. 概念分层式**（知识学习 / 概念讲解类）：",
		"   · 用 `## 核心概念`、`## 要点`、`## 易错点`、`## 复习提问` 组织，每个概念独立小节；",
		"   · 概念之间用空行分块，方便扫读与复习。"
	].join("\n"),
	task: [
		"**C. 目标·过程·成效式**（方案 / 记录 / 解决一个问题类）：",
		"   · 用 `## 目标`、`## 解答过程`、`## 最终成效` 三节组织；",
		"   · 目标一句话说清要解决什么问题；解答过程讲清关键事实、判断与来龙去脉（删路径/代码/命令/参数数值等实现噪音）；",
		"   · 最终成效总结做成什么样、怎么用、达到什么效果。"
	].join("\n"),
	artifact: [
		"**E. 产物归档式**（教案 / 讲稿 / 文稿 / 创作产物类）：",
		"   · **保留每一份完整产物原样**，用 `## 课题` 分节归档，不压缩、不概括正文；",
		"   · 开头一句说明这批产物是什么，可用 `## 分类索引` 列课题清单；",
		"   · 内容照抄原文，不删减教学过程/正文/板书设计；结尾可加 `## 使用说明`。"
	].join("\n"),
	review: [
		"**复盘式**：用以下结构组织正文：`## 问答脉络（关键问题与回答）`、`## 重要结论`、`## 值得记住的洞察`、`## 可复用的方法 / 模板`、`## 行动项`。",
		"重点沉淀这段对话里的经验、判断与最终成果，让复盘一看就懂。"
	].join("\n"),
	study: [
		"**学习笔记**：用以下结构组织正文：`## 核心概念`、`## 术语表`、`## 示例 / 例句`、`## 易错点`、`## 复习问答（Q&A）`。",
		"目标是形成方便快速回顾与自测的知识笔记，不是记录 AI 讲解过程。"
	].join("\n")
};
// 笔记组织思路（默认）：按用途选版式，保留关键事实，删除实现噪音。
const SB2B_BRIEF_RULE = [
	"🔸 **先判断这段对话的用途，再选择最合适的版式，并在排版上多换行、多空行、分块，避免一大段挤在一起**：",
	"",
	"**A. 语言学习 / 查词 / 翻译类**（在讲单词、短语、语法、发音、表达）→【生词卡片式】：",
	"   · 每词用 `### 单词` 独立成块，块间空行；第一行写 `单词 /英音标/ /美音标/`；",
	"   · 分行列出：**词性·词义 → 搭配/用法 → 例句 → 易混/易错 → 记忆提示**（缺的省略）；",
	"   · 中文释义为主，先核心义再引申义；讲解拼写则标注 `✏️ 易拼错 xxx❌→xxx✅`；",
	"   · 末尾可加 `## 高频背诵清单` 把核心词集中列出。",
	"",
	"**B. 知识/概念讲解类** → `## 核心概念`、`## 要点`、`## 易错点`、`## 复习提问`，每概念独立小节。",
	"",
	"**C. 方案/记录/解决问题类** → `## 目标`、`## 解答过程`、`## 最终成效`（保留做的叫什么、为什么、效果、怎么用；删路径/代码/命令/数值/验证步骤）。",
	"",
	"**D. 提问应答类** → 一问一答对应清晰，结论突出。",
	"",
	"**E. 教案 / 讲稿 / 文稿 / 创作产物类**（AI 在生成可直接使用的完整内容：教案、试讲稿、文章、文案、提示词、策划案等）→【产物归档式】：",
	"   · **保留每一份完整产物原样**，用 `## 课题` 分节归档，不压缩、不概括正文；",
	"   · 开头一句说明这批产物是什么，可用 `## 分类索引` 列课题清单；",
	"   · 内容照抄原文，不删减教学过程/正文/板书设计；",
	"   · 结尾可加 `## 使用说明` 写一句怎么用。",
	"",
	"**排版总原则**：常用换行、空行、列表、分块；独立知识点独立成块；标题 `# 一行` 自拟概括主题。"
].join("\n");

function sb2bSystemPrompt(style) {
	const typeGuide = [
		"# 笔记整理核心原则",
		"根据聊天内容**自动判断笔记类型**并选择合适的整理方式。不同类型的 AI 会话，其目标和价值不同，**不应强制套用固定模板**；输出结构应**根据原始聊天内容灵活调整**，只提供整理方向，不要求每类笔记必须包含固定字段。",
		"核心原则：**不是总结聊天过程，而是将聊天中具有复用价值的信息重新组织成适合 Obsidian 保存的结构化笔记。**",
		"",
		"## 知识整理类（Knowledge）",
		"适用于用户通过学习、理解某个概念/原理/知识点的聊天（技术概念、专业知识、理论解释、背景知识等）。",
		"- 提炼核心概念和核心结论；要点整理成**关键知识点**；",
		"- 保留重要的解释、逻辑关系和理解方式；",
		"- 如有案例、类比、应用场景可保留；可补充概念之间的关系（不超出原文）；",
		"- 目标是形成方便快速回顾的知识笔记，不是记录 AI 讲解过程。",
		"",
		"## 方法流程类（How-to / Workflow）",
		"适用于用户希望 AI 帮忙完成某事的聊天（软件使用、工具配置、操作流程、学习方法、工作步骤等）。",
		"- 明确**目标和要解决的问题**；",
		"- 提取**实际执行步骤**，保留关键操作细节；",
		"- 整理过程中遇到的问题和对应解决方式、注意事项；",
		"- 重点保存「以后遇到类似问题可直接参考的方法」，不是复述交流过程。",
		"",
		"## 分析讨论类（Analysis）",
		"适用于用户向 AI 寻求分析、比较、研究或观点讨论（方案选择、产品比较、问题分析、观点梳理等）。",
		"- 提炼讨论主题和背景，总结核心观点；",
		"- 梳理分析中涉及的重要因素；",
		"- 如有多个方案/观点/判断依据，做结构化整理；保留最终结论或建议；",
		"- **不要强行套用**“优点、缺点、案例、评分”结构，按实际讨论内容决定。",
		"",
		"## 创作产物类（Creation Asset）",
		"适用于用户通过 AI 生成或优化内容的聊天（Prompt、文案、图片提示词、视频脚本、代码、设计方案等）。",
		"整理时**按三段式讲清脉络**，而不是把对话片段零散堆在一起：",
		"1. **需求背景**：这一段最初想要什么、给谁用、为什么做（依据原文概括，不臆造）。",
		"2. **迭代过程**：用户提了什么修改要求 → AI 因此改了什么 → 最终效果如何。只保留真实、重要的版本演进，用简短脉络串起来；没有迭代就跳过。",
		"3. **最终产出**：把 AI 最终交付的、可直接复用的结果**原样完整保留**（完整提示词 / 最终方案 / 成稿内容），这是笔记核心，绝不省略、不精简。",
		"- 若同一会话融入了多个项目/任务，**每个项目/任务都要按上面三段式整理**，一个都不能漏。",
		"",
		"## 问题解决类（Troubleshooting）",
		"适用于用户通过 AI 排查和解决问题的聊天（故障、报错、配置异常、工具无法使用等）。",
		"- 描述问题，记录环境信息（若提供）；",
		"- 整理原因分析过程，保存**最终有效解决方案**；",
		"- 保留避免再次出现问题的方法，形成可检索的个人排障记录。",
		"",
		"## 通用要求",
		"- 基于原始聊天提炼重组，**不要扩展聊天之外的信息**；",
		"- 不要复述聊天流程；",
		"- 删除低价值内容（寒暄、重复确认、无意义讨论、未采用的中间方案）；",
		"- 优先保留：最终答案、关键结论、可复用方法、最终产物、重要思考过程；",
		"- **@生图提示词 忠实保留：若对话中 AI 亲口给出面向图像/绘画生成的提示词、关键词列表、`whimsical children's book illustration, loose black ink…` 这类英文 prompt，或对应的中文概括——无论中英文，都必须原样、逐字完整保留在笔记里，禁止精简、改写、翻译或省略。**若对话同时给了英文版和中文版，两版都要原样保留（可分别用小标题标出「英文提示词」「中文提示词」）。",
		"- 输出结构服务于内容本身，灵活调整，不机械套模板；",
		"- 若聊天含多种类型，可综合整理（如知识+操作步骤融合成一份更易读的笔记）；",
		"- 最终内容适合 Obsidian 长期管理：清晰、简洁、易搜索、可复用。",
		"",
		"技术实现：正文第一行以 `# 标题` 开头（自拟概括主题）；用中文输出；不要输出 YAML frontmatter（插件会自动加）。"
	].join("\n");
	return [
		typeGuide,
		"",
		"## 版式选择（根据内容类型选合适的排版，便于 Obsidian 阅读与复用）",
		sb2bLayoutNote(style)
	].join("\n");
}

/** 根据版式偏好生成版式指令：锁定版式 → 优先用该版式；auto/未设置 → A-E 自动识别。 */
function sb2bLayoutNote(style) {
	const layout = SB2B_LAYOUT_PROMPTS[style];
	if (!layout) return SB2B_BRIEF_RULE;
	return [
		"本次整理请**优先采用**以下版式（仅当对话明显属于「产物归档类」——AI 在生成可直接使用的完整内容——时，仍按【产物归档式】原样保留完整产物）：",
		"",
		layout,
		"",
		"**排版总原则**：常用换行、空行、列表、分块；独立知识点独立成块；标题 `# 一行` 自拟概括主题。"
	].join("\n");
}

/**
 * 提炼后自检（C）：让模型对照原文检查笔记是否遗漏关键内容 / 与原文不符 /
 * 排版是否清晰。返回 { needsFix, feedback }；模型判定无问题或检查失败时
 * needsFix=false（不阻断归档）。
 * @param callChat - (messages) => Promise<string>，用主模型做一次廉价检查调用。
 */
async function selfCheckNote({ transcript, title, bot, llmBody, callChat }) {
	// 质检只看对话的最近部分（与提炼时截取策略一致），控制成本。
	const checkTranscript = String(transcript || "").slice(-20000);
	const checkPrompt = [
		"你是笔记质检员。下面给出【原始对话】和【整理后的笔记】。请对照原文检查：",
		"1. 是否遗漏了重要内容（关键结论、关键事实、最终产物、可复用的方法）？",
		"2. 是否有与原文不符的编造、错误，或把重要信息删过头了？",
		"3. 排版是否清晰（分块、列表、标题、空行，而不是一大段挤在一起）？",
		"",
		"若没有实质问题，只输出一行：OK",
		"若有问题，第一行输出：问题",
		"然后逐条列出具体问题（每条一行，指出漏了什么 / 哪里不符 / 排版哪里有问题），供重新整理时修正。不要给重写稿，不要解释。",
		"",
		`----- 原始对话（标题：${title || ""}，助手：${bot || ""}）-----`,
		checkTranscript,
		"----- 原始对话结束 -----",
		"",
		"----- 整理后的笔记 -----",
		String(llmBody || ""),
		"----- 笔记结束 -----"
	].join("\n");
	try {
		const out = String(await callChat([
			{ role: "system", content: "你是笔记质检员。只输出检查结论：OK 或 问题清单，不加多余内容。" },
			{ role: "user", content: checkPrompt }
		]) || "").trim();
		if (/^OK\b/i.test(out)) return { needsFix: false, feedback: "" };
		const feedback = out.replace(/^问题[：:\s]*/i, "").trim().slice(0, 1200);
		return { needsFix: feedback.length > 0, feedback };
	} catch {
		return { needsFix: false, feedback: "" };
	}
}
function sb2bBuildNote(llmBody, meta) {
	const title = sb2bExtractTitle(llmBody, meta.title || "未命名笔记");
	const body = String(llmBody || "").trim();
	const tags = (meta.tags || "AI对话").split(/[,，]/).map((t) => t.trim()).filter(Boolean);
	const tagLine = tags.length ? "tags: [" + tags.map((t) => JSON.stringify(t)).join(", ") + "]" : "tags: []";
	const frontmatter = [
		"---",
		`title: ${JSON.stringify(title)}`,
		`date: ${sb2bFormatDate(Date.now())}`,
		meta.source ? `source: ${JSON.stringify(meta.source)}` : "",
		meta.bot ? `bot: ${JSON.stringify(meta.bot)}` : "",
		`style: ${meta.layout || meta.style || "auto"}`,
		`model: ${JSON.stringify(meta.model || "")}`,
		tagLine,
		"---",
		""
	].filter((l) => l !== null).join("\n");
	return frontmatter + body + "\n";
}
//#endregion

/**
 * Download an image URL and return it as a base64 data URL (plus mime/ext),
 * so vision calls never depend on the provider being able to reach the URL.
 * @returns { dataUrl, mime, ext, bytes } or null on failure.
 */
async function downloadImageDataUrl(url) {
	try {
		const response = await fetch(url, {
			headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36" },
			signal: AbortSignal.timeout(30000)
		});
		if (!response.ok) return null;
		const buf = Buffer.from(await response.arrayBuffer());
		if (buf.length === 0 || buf.length > 12 * 1024 * 1024) return null;
		const contentType = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
		const mime = /^image\/(png|jpe?g|webp|gif|bmp)$/.test(contentType) ? contentType.replace("jpeg", "jpg") : guessImageMime(buf);
		if (mime === null) return null;
		const ext = mime === "image/jpeg" ? "jpg" : mime.split("/")[1];
		return { dataUrl: `data:${mime};base64,${buf.toString("base64")}`, mime, ext, bytes: buf.length };
	} catch {
		return null;
	}
}

/** Sniff an image mime from its magic bytes (fallback when no content-type). */
function guessImageMime(buf) {
	if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
	if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
	if (buf.length >= 4 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return "image/webp";
	if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
	return null;
}

/** Parse the vision model's `- 图N：说明` lines into alt text by image index. */
function parseImageAltList(llmBody) {
	const alts = {};
	const re = /图\s*(\d+)\s*[:：]\s*(.+)/g;
	let m;
	while ((m = re.exec(String(llmBody || ""))) !== null) {
		alts[Number(m[1])] = m[2].trim().slice(0, 200);
	}
	return alts;
}

/**
 * One-shot distill pipeline for the browser extension (and GUI): read the
 * shared config, summarize the given conversation with the configured
 * provider, then write the note into the configured Obsidian vault.
 * When the payload carries images and a vision model is configured, the
 * images are downloaded, described by the vision model, saved next to the
 * note under `attachments/`, and embedded into the note.
 * @param payload - { title, source, bot, messages, images: [{url} | string] }.
 * @returns { title, fileName, path, savedImages }.
 */

/**
 * Split an artifact-oriented note into per-topic sections.
 * Topic markers detected:
 *   - `## 课题：xxx`  /  `## 课题 xxx`  (Chinese)
 *   - `## Topic: xxx` / `## 课题标题`   (English fallback)
 *   - `# Teaching Plan for …` / `# <something> …教案` as the artifact title
 * When ≥2 distinct topic sections exist, this returns one {title, markdown}
 * per topic so the caller can write one file per topic.
 * Returns an empty array when the note is a single block (no topics).
 */
function splitNoteByTopic(noteMarkdown, fallbackTitle) {
	// Separate frontmatter (--- ... ---) from the body.
	const fmM = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(noteMarkdown);
	const frontmatter = fmM ? fmM[0] : "";
	const body = fmM ? noteMarkdown.slice(fmM[0].length) : noteMarkdown;

	// 真正的课题边界。优先用 `## 课题/## Topic/## Lesson` 这类二级标题；
	// 若全文没有任何这类标题，才退回用 `# Teaching Plan…` 一级标题当边界。
	const headingRe = /^\s*(#{1,2})\s+(.+?)\s*$/gm;
	const allHeads = [];
	let hm;
	while ((hm = headingRe.exec(body)) !== null) {
		allHeads.push({ level: hm[1].length, title: hm[2].trim(), index: hm.index });
	}
	const topicMarks = allHeads.filter((h) => h.level === 2 && /(课题|Topic|Lesson|Unit)\s*[:：]?\s*/.test(h.title));
	const marks = topicMarks.length > 0
		? topicMarks
		: allHeads.filter((h) => h.level === 1 && /Teaching Plan|Lesson Plan|教案|试讲稿|Script|Presentation/i.test(h.title));
	if (marks.length === 0) return [];
	marks.sort((a, b) => a.index - b.index);
	// Dedup consecutive identical positions.
	const unique = [];
	for (const mk of marks) {
		const last = unique[unique.length - 1];
		if (!last || last.index !== mk.index) unique.push(mk);
	}
	if (unique.length < 2) return []; // only one topic → keep as one note

	const sections = [];
	for (let i = 0; i < unique.length; i++) {
		const start = unique[i].index;
		const end = i + 1 < unique.length ? unique[i + 1].index : body.length;
		const segBody = body.slice(start, end).trimEnd();
		// Re-synthesize a small title by stripping leading #s.
		const title = unique[i].title.replace(/[#\s]+/g, " ").trim() || `${fallbackTitle || "课题"} ${i + 1}`;
		// Rebuild frontmatter with a per-topic title.
		let segFm = frontmatter;
		if (frontmatter) {
			// Replace the `title:` line inside frontmatter with the segment's title.
			segFm = frontmatter.replace(/^(title:\s*).*$/m, `$1${JSON.stringify(title)}`);
		}
		const markdown = (segFm && segFm.trim() ? segFm + "\n" : "") + "# " + title + "\n\n" + segBody + "\n";
		sections.push({ title, markdown });
	}
	return sections;
}

/**
 * Phase 1 of artifact-split distillation: ask the model to list every distinct
 * artifact topic (教案/讲稿/文章/提示词/文案…) present in the conversation.
 * Returns an array of topic title strings, or [] if this isn't an artifact-like
 * (multi-topic) conversation so the caller falls back to normal summarization.
 */
async function planArtifactTopics({ sys, baseUserText, transcript, bot, callChat }) {
	// 只要对话里明显存在“AI 生成了可独立使用的成稿内容”（教案/文案/文章/翻译/
	// 提示词/方案等，可能多类任务混在一个对话），就让模型列出所有独立成篇的产物。
	// 返回每个产物对应的主题名；≥2 才触发分篇，1 个就退回普通总结。
	// 注意：不再绑死“教案/试讲”关键词，而是交给模型判断“是不是批量产出内容”。
	const artifactHint = /教案|试讲|提示词|prompt|文案|文章|宣传|方案|教学设计|lesson plan|teaching plan|试讲稿|演讲|演讲稿|翻译|作文|大纲|产品介绍|简介|报告|总结|写/;
	if (!artifactHint.test(baseUserText + transcript)) return [];

	const prompt = [
		"下面是一段用户与 AI 助手的对话。对话里可能包含了 **多个独立的、可以单独取出来使用的“内容产物”**（例如：多篇教案、几篇文案/广告、几段翻译、几段文章/介绍/方案、多组提示词等）。可能多个不同任务混在了同一个对话里。",
		"请判断这段对话里一共产生了 **几份独立成篇的内容产物**，并为每一份给出**简短的课题/主题名**（能区分不同产物即可）。",
		"要求：",
		"· 只要确实产生了多于一份可独立成篇的内容，就要全部列出来；如果整个对话只有一份内容或没有成稿内容，就写“无”。",
		"· 只列名称，不要任何解释。",
		"输出格式：",
		"```",
		"1. <产物1的主题/课题名>",
		"2. <产物2的主题/课题名>",
		"...",
		"```",
		`\n----- 对话记录开始 -----\n${transcript}\n----- 对话记录结束 -----`
	].join("\n");

	let out;
	try {
		out = await callChat([
			{ role: "system", content: "你是文档整理助手。只按用户要求的格式输出清单，不加多余解释；若对话里没有多份独立成稿内容，就只回“无”。" },
			{ role: "user", content: prompt }
		]);
	} catch {
		return [];
	}
	const raw = String(out || "").trim();
	if (/^\s*无\s*$/.test(raw)) return [];
	const topics = String(raw)
		.split(/\n/)
		.map((l) => l.replace(/^\s*\d+[\.\、\)]\s*/, "").replace(/^[-*]\s*/, "").trim())
		.filter(Boolean)
		.filter((t) => /^\s*(无|好的|好的,|收到)\s*$/i.test(t) === false);
	// Require at least 2 real topics to trigger splitting.
	return topics.length >= 2 ? topics : [];
}

/**
 * Phase 2: build ONE complete, unabridged artifact note for a single topic,
 * using the full transcript but asking the model to cover only this topic so
 * the output fits and is not truncated.
 */
/**
 * 用视觉模型描述所有附图（分篇路径用）。返回的 altTexts 供索引页做
 * alt 文本，block 是可直接注入分篇生成提示词的图片描述文本。
 * 图片太多时**分批**调用（一次发给视觉模型太多图会挂死/超时，实测 3–6 张
 * 正常、12 张无响应），每批用全局连续编号，模型不按格式输出时按行兜底。
 * 视觉未配置 / 全部调用失败时静默降级：altTexts={}、block=""，不阻断分篇。
 */
async function describeDownloadedImages(downloaded, { visionModel, resolvedVisionBase, visionKey }) {
	const BATCH = 5;
	const BATCH_TIMEOUT = 120000; // 每批硬超时：方舟等视觉 API 偶发极慢/挂起，不能拖垮整个分篇
	if (!visionModel || !Array.isArray(downloaded) || downloaded.length === 0) return { altTexts: {}, block: "" };
	const altTexts = {};
	let anyOk = false;
	for (let start = 0; start < downloaded.length; start += BATCH) {
		const chunk = downloaded.slice(start, start + BATCH);
		const from = start + 1;
		const to = start + chunk.length;
		try {
			const visionUser = [
				{ type: "text", text: `以下有 ${chunk.length} 张图片（一组 AI 对话附图的第 ${from}~${to} 张）。请依次为每张图写一句中文内容说明（画面主体、风格、关键元素）。编号必须从 ${from} 到 ${to}，严格按以下格式输出：\n` + chunk.map((_, i) => `- 图${from + i}：<一句话说明>`).join("\n") },
				...chunk.map((img) => ({ type: "image_url", image_url: { url: img.dataUrl } }))
			];
			const desc = await Promise.race([
				forwardChatCompletion({
					base: resolvedVisionBase,
					apiKey: visionKey,
					model: visionModel,
					temperature: 0,
					messages: [
						{ role: "system", content: "你是图片描述助手。只按指定格式输出每张图的描述清单，不要多余内容。" },
						{ role: "user", content: visionUser }
					]
				}),
				new Promise((_, rej) => setTimeout(() => rej(new Error("视觉批处理超时")), BATCH_TIMEOUT))
			]);
			const parsed = parseImageAltList(desc);
			// 模型偶尔不严格按「图N：」格式输出：退化为按行拆分描述（按该批起始编号）。
			if (Object.keys(parsed).length === 0) {
				String(desc).split(/\n+/)
					.map((l) => l.replace(/^[-*\d.\s]+/, "").trim())
					.filter(Boolean)
					.forEach((line, idx) => { const num = from + idx; if (!parsed[num]) parsed[num] = line.slice(0, 200); });
			}
			for (const [k, v] of Object.entries(parsed)) altTexts[Number(k)] = v;
			anyOk = true;
		} catch {
			/* 该批失败不阻断，继续下一批 */
		}
	}
	if (!anyOk) return { altTexts: {}, block: "" };
	const descLines = downloaded.map((_, i) => `- 图${i + 1}：${altTexts[i + 1] || "（未识别）"}`);
	return { altTexts, block: "对话附图描述（由视觉模型识别）：\n" + descLines.join("\n") };
}

async function generateOneArtifact({ sys, baseUserText, transcript, bot, title, source, topic, index, total, allTopics, callChat, imageBlock }) {
	const listBlock = Array.isArray(allTopics) && allTopics.length
		? `对话中的课题清单：\n${allTopics.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n`
		: "";
	// 判断该课题是不是「成品全文型」——用户要的就是那份原封不动的完整产物本身
	// （教案、讲稿/逐字稿、完整文章/文案/翻译成稿等），这类必须逐字复制、保留原语言。
	const verbatimRe = /教案|教学设计|lesson plan|teaching plan|试讲|讲稿|逐字稿|演讲稿|speech|全文翻译|翻译全文|作文|作文范文|范文|完整文章|逐字/;
	const isVerbatim = verbatimRe.test(topic || "") || verbatimRe.test(transcript);
	if (isVerbatim) {
		const userPrompt = [
			listBlock,
			`这组对话共包含 ${total} 份独立内容。现在请只处理编号为 ${index + 1}、课题名为「${topic}」的那一份。`,
			"【最高优先级要求】：**原样、逐字地复制 AI 助手在该对话里对这一课题输出的那一整段原创成品**（教案就复制完整教案，逐字稿/演讲稿就复制完整稿）。",
			"- 必须保留 AI 原文使用的语言：英文写的就输出英文，中文写的就输出中文；**严禁翻译、改写、扩写、缩写、重新组织、增删**。",
			"- 若同一课题有多个版本（如先中文、后用户要求英文重写），只采用用户最后要求的那一版并原样输出。",
			"- 正文就是那份成品本身，不要加总结、批注、标签。",
			`\n----- 对话记录开始 -----\n${transcript}\n----- 对话记录结束 -----`
		].join("\n");
		try {
			return await callChat([
				{ role: "system", content: "你是内容复制工具。你的唯一职责是从对话中找出指定课题那一段 AI 的原创成品，逐字原样复制，语言与内容都不改；禁止翻译、改写、总结。" },
				{ role: "user", content: userPrompt }
			]);
		} catch {
			return "";
		}
	}

	// 非成品全文型（设计/创作迭代、知识讨论、方案对比等）：用统一规则 sys 做「分析 + 选格式」整理。
	const imageNote = imageBlock
		? ["", imageBlock, "", "若笔记内容与某张附图相关，请在正文中适当引用（如「（附图见索引 · 图2：果汁喷溅效果）」）；只引用确实相关的图，不要凭空编造图片内容。"].join("\n")
		: "";
	const userPrompt = [
		listBlock,
		`这组对话共包含 ${total} 份独立内容。现在请只处理编号为 ${index + 1}、课题名为「${topic}」的那一份。`,
		`请遵循下面【整理规则】，结合这段对话，分析并输出这一份的笔记（讲清需求、迭代、最终可复用产出，而不是机械堆砌对话）。`,
		"",
		"【整理规则】",
		sys,
		imageNote,
		"",
		`\n----- 对话记录开始 -----\n${transcript}\n----- 对话记录结束 -----`
	].join("\n");
	try {
		return await callChat([
			{ role: "system", content: "你是文档整理助手。根据给定的整理规则，从对话中提炼指定课题，做结构化、可复用的笔记；忠于原文，不臆造。" },
			{ role: "user", content: userPrompt }
		]);
	} catch {
		return "";
	}
}

async function serverDistill(payload) {
	const cfg = await readSharedConfig();
	const provider = cfg.provider || "ark";
	const providerInfo = {
		ark: { label: "火山方舟（豆包）", base: "https://ark.cn-beijing.volces.com/api/v3", defaultModel: "doubao-seed-1-6-flash-250828" },
		deepseek: { label: "DeepSeek", base: "https://api.deepseek.com", defaultModel: "deepseek-v4-flash" },
		moonshot: { label: "Kimi（Moonshot）", base: "https://api.moonshot.cn/v1", defaultModel: "moonshot-v1-8k" },
		dashscope: { label: "通义千问（DashScope）", base: "https://dashscope.aliyuncs.com/compatible-mode/v1", defaultModel: "qwen-plus" },
		custom: { label: "自定义（OpenAI 兼容）", base: cfg.baseCustom || "", defaultModel: "" }
	}[provider] || { label: "火山方舟（豆包）", base: "https://ark.cn-beijing.volces.com/api/v3", defaultModel: "doubao-seed-1-6-flash-250828" };

	const vaultPath = String(cfg.vaultPath || "").trim();
	const apiKey = String(cfg.apiKey || "").trim();
	const model = String(cfg.model || "").trim() || providerInfo.defaultModel;
	const cfgVision = String(cfg.visionModel || "").trim();
	const multimodal = cfg.multimodal === true || cfg.multimodal === "true";
	// A multimodal current model can serve as the vision model directly.
	const visionModel = cfgVision || ((multimodal || payload.useCurrentAsVision) ? model : "");
	// 独立的视觉模型连接信息：视觉模型通常与主模型不同服务商（如主=DeepSeek、
	// 视觉=方舟豆包），需要自己的 API Key 与 Base URL。若未单独配置 visionKey，
	// 则回落到主模型 apiKey。
	const visionKey = String(cfg.visionKey || "").trim() || apiKey;
	// 视觉模型 Base URL：优先级 = 显式 visionBase(自定义) > visionProvider(内置厂商) > 自动推断。
	// 不在代码里硬编码"只能豆包"——通义/智谱/OpenAI 等任意 OpenAI 兼容厂商都可以。
	const visionProviders = {
		ark: "https://ark.cn-beijing.volces.com/api/v3",
		deepseek: "https://api.deepseek.com",
		moonshot: "https://api.moonshot.cn/v1",
		dashscope: "https://dashscope.aliyuncs.com/compatible-mode/v1",
		openai: "https://api.openai.com/v1",
		zhipu: "https://open.bigmodel.cn/api/paas/v4"
	};
	const visionProviderId = String(cfg.visionProvider || "").trim();
	const visionBase = String(cfg.visionBase || "").trim();
	const resolvedVisionBase = visionBase
		|| (visionProviders[visionProviderId] || "")
		|| (/^(doubao|doubao-seed|seed)/i.test(visionModel) ? visionProviders.ark : providerInfo.base);
	const maxImages = Number.isFinite(Number(cfg.maxImages)) ? Math.max(0, Number(cfg.maxImages)) : 50;
	const folder = String(cfg.folder || "").trim() || "AI 第二大脑";
	// write=false 时只返回 markdown、不写库（预览/下载路径），此时不要求配置库路径。
	const write = payload.write !== false;
	if (write && !vaultPath) throw new Error("尚未配置 Obsidian 库路径，请先在「设置 → AI 第二大脑 → Obsidian 笔记目录」里填写并保存。");
	if (!apiKey) throw new Error(`尚未配置「${providerInfo.label}」的 API Key，请先在插件设置里保存。`);
	if (provider === "custom" && !providerInfo.base) throw new Error("自定义服务商需要填写 Base URL。");

	// —— 统一管线（A）：允许服务端直接读取 Harness 会话，浏览器端不再自己拼提示词 ——
	let messages = Array.isArray(payload.messages) ? payload.messages : [];
	let title = String(payload.title || "未命名对话");
	let source = String(payload.source || "豆包");
	let bot = String(payload.bot || "豆包");
	if (payload.sessionId && typeof payload.sessionId === "string") {
		const session = await readHarnessSession(payload.sessionId);
		messages = Array.isArray(session.messages) ? session.messages : [];
		title = session.title || "未命名会话";
		source = "DeepSeek Harness 会话";
		bot = "DeepSeek Harness";
	}
	const lines = [`【对话标题】${title}`, `【对话助手】${bot}`, ""];
	for (const m of messages) {
		const content = String(m.content || "").trim();
		if (!content) continue;
		lines.push(m.role === "user" ? `用户：${content}` : `${bot}：${content}`);
		lines.push("");
	}
	const transcript = lines.join("\n").trim();
	if (!transcript) throw new Error("对话内容为空");

	// 版式偏好（B）：设置页「版式偏好」下拉，auto=自动识别；detail=精简/完整版；
	// selfCheck=提炼后自检开关（C）。
	const layout = String(payload.layout || cfg.layout || "auto");
	const detail = payload.detail === "full" ? "full" : "brief";
	const selfCheck = payload.selfCheck !== false && cfg.selfCheck !== "false";
	// 自定义整理要求：若用户填写了 customReq，则它拥有最高优先级，覆盖默认的类型体系。
	const customReq = String(payload.customReq || "").trim();
	const sysBase = customReq
		? [
			"以下是用户针对本次整理写的【自定义要求】，请**严格按照它整理**，它优先于其它一切默认规则：",
			customReq,
			"",
			"补充通用要求：基于原始聊天提炼，不要扩展聊天之外的信息；删除寒暄、重复、未采用的中间方案；输出适合 Obsidian 保存的 Markdown；正文第一行以 `# 标题` 开头（自拟概括）；不要输出 YAML frontmatter。"
		].join("\n")
		: sb2bSystemPrompt(layout);
	const sys = detail === "full"
		? sysBase + "\n\n这是「完整版」整理：在保留关键事实与判断的基础上，可适当展开关键转折与注意点，并在正文末尾增加一节 `## 需要注意的点`，把对话中提到的重要前提、注意点、容易踩的坑用人话列出来。"
		: sysBase;
	const baseUserText = `对话标题：${title}\n对话助手：${bot}\n来源：${source}\n\n----- 对话记录开始 -----\n${transcript}\n----- 对话记录结束 -----`;

	// Resolve candidate images (URLs or data URLs) up to the configured cap.
	const rawImages = (Array.isArray(payload.images) ? payload.images : [])
		.map((img) => (typeof img === "string" ? img : img && img.url))
		.filter((u) => typeof u === "string" && u.length > 0)
		.slice(0, maxImages);

	const downloaded = [];
	for (const url of rawImages) {
		if (url.startsWith("data:image/")) {
			const m = /^data:(image\/[a-z+]+);base64,/.exec(url);
			if (!m) continue;
			downloaded.push({ url, dataUrl: url, mime: m[1], ext: m[1].split("/")[1].replace("jpeg", "jpg"), bytes: 0 });
			continue;
		}
		const img = await downloadImageDataUrl(url);
		if (img) downloaded.push({ url, ...img });
	}
	if (rawImages.length > 0 && downloaded.length === 0) {
		throw new Error("对话中的图片全部下载失败（链接可能已过期或不可访问），已停止归档。可去掉图片重试。");
	}

	// —— 方案A：多份内容产物（可能多个任务混在一个对话）→ «一产物一篇» ——
	// 仅当内容较长、一篇装不下时才分篇；内容短则回复普通单篇总结。
	// 若用户填写了自定义整理要求（customReq），则按用户指定格式整理成单篇，跳过自动分篇。
	const dir = resolve(vaultPath, folder);
	if (write) await mkdir(dir, { recursive: true });
	const callChat = async (messages) => forwardChatCompletion({ base: providerInfo.base, apiKey, model, messages });
	if (write && !customReq) {
		const artifactTopics = await planArtifactTopics({ sys, transcript, baseUserText, bot, callChat });
		const topics = Array.isArray(artifactTopics) ? artifactTopics.filter(Boolean) : [];
		const MAX_TOPICS = 40;
		// 内容短时不分篇：只有「一篇装不下」才分篇。
		// 粗略估算：单篇约能输出 11000 字符；若整段产物总长明显小于上限，一篇就够。
		const singleNoteBudget = 11000;
		const tooLongForOne = (transcript ? transcript.length : 0) > singleNoteBudget * 1.6;
		if (topics.length >= 2 && topics.length <= MAX_TOPICS && tooLongForOne) {
			// 独立分篇文件夹 + 索引页。
			// 先清掉旧的同名子目录，避免重复提炼时新旧文件叠加、文件名不一致导致
			// 有些篇目没有导航、索引错位。
			const subDirName = sb2bSlugify(title || "分篇笔记") || "分篇笔记";
			const subDir = join(dir, subDirName);
			try { await rm(subDir, { recursive: true, force: true }); } catch { /* ignore */ }
			await mkdir(subDir, { recursive: true });

			// 先一次性让视觉模型描述所有附图（若有），供每篇分篇正文引用 + 索引页共用；
			// 未配视觉模型或调用失败时静默降级（block=""，不影响分篇）。
			const visionInfo = await describeDownloadedImages(downloaded, { visionModel, resolvedVisionBase, visionKey });

			const outFiles = [];
			for (let i = 0; i < topics.length; i++) {
				const topic = topics[i];
				// 单课完整生成（用 completeLongOutput 兜底防截断），失败/为空则重试一次
				let one = "";
				for (let attempt = 0; attempt < 2; attempt++) {
					one = await generateOneArtifact({
						sys,
						transcript,
						bot,
						title,
						source,
						topic,
						index: i,
						total: topics.length,
						allTopics: topics,
						imageBlock: visionInfo.block,
						callChat: async (msgs) => {
							const r = await completeLongOutput({ base: providerInfo.base, apiKey, model, messages: msgs, max_tokens: 8192, maxRounds: 4 });
							return r.content;
						}
					});
					if (one && one.trim().length > 0) break;
				}
				if (!one || one.trim().length === 0) continue;
				const oneTitle = sb2bExtractTitle(one, topic || `${title} ${i + 1}`);
				const oneFile = `${String(i + 1).padStart(2, "0")}-${sb2bSlugify(oneTitle)}.md`;
				// 每篇追加导航（返回索引 + 上一篇/下一篇）
				const oneNote = sb2bBuildNote(one, {
					title: oneTitle,
					source,
					bot,
					tags: cfg.tags || "AI对话",
					layout,
					model: `${providerInfo.label} / ${model}`
				}) + `\n\n---\n\n[🔝 返回《${title}》索引](./00-索引.md)`;
				await writeFile(resolve(subDir, oneFile), oneNote, "utf8");
				outFiles.push({ title: oneTitle, fileName: oneFile, path: resolve(subDir, oneFile), index: i });
			}

			// 补写上一篇/下一篇导航（需要先全部生成，再回填）
			for (let k = 0; k < outFiles.length; k++) {
				const cur = outFiles[k];
				const prev = k > 0 ? outFiles[k - 1] : null;
				const next = k < outFiles.length - 1 ? outFiles[k + 1] : null;
				// 重写该文件：去掉首次写的占位导航再补正式的上一篇/下一篇+索引导航。
				// 用相对 Markdown 链接（Obsidian 按路径解析，避免特殊字符/重名导致错跳）。
				const raw = await readFile(cur.path, "utf8");
				const bodyOnly = raw.replace(/\n---\n\n\[🔝 返回.*\]\(\.\/00-索引\.md\)$/s, "");
				const esc = (n) => encodeURIComponent(n).replace(/\(/g, "%28").replace(/\)/g, "%29");
				const prevLink = k > 0 ? `[⬅️ 上一篇](./${esc(prev.fileName)})` : "⬅️ 无上一篇";
				const nextLink = k < outFiles.length - 1 ? `[下一篇 ➡️](./${esc(next.fileName)})` : "下一篇 ➡️ 无";
				const nav = `${prevLink}　·　[🔝 返回索引（含附图）](./00-索引.md)　·　${nextLink}`;
				await writeFile(cur.path, bodyOnly.trimEnd() + `\n\n---\n\n${nav}\n`, "utf8");
			}

			// 索引页
			if (outFiles.length > 0) {
				// 把确认的图片保存到分篇文件夹的 attachments/ 并嵌入索引导航，避免分篇时丢图。
				let savedImages = 0;
				let attachmentsBlock = "";
				const visionUsed = !!visionInfo.block;
				if (downloaded.length > 0) {
					const attDir = join(subDir, "attachments");
					await mkdir(attDir, { recursive: true });
					// 视觉描述已在生成分篇前用 describeDownloadedImages 调过一次，
					// 这里直接复用（altTexts 做 alt、block 做附图说明），不再重复调用。
					const altTexts = visionInfo.altTexts;
					const visionDescs = visionUsed
						? "\n\n**👁️ 视觉模型识别结果（豆包）：**\n" + downloaded.map((_, i) => `- **图 ${i + 1}**：${altTexts[i + 1] || "（未识别）"}`).join("\n")
						: "";
					const lines = [];
					for (let i = 0; i < downloaded.length; i++) {
						const img = downloaded[i];
						const name = `img-${i + 1}-${Date.now()}-${i}.${img.ext || "png"}`;
						try {
							await writeFile(join(attDir, name), Buffer.from(img.dataUrl.split(",")[1], "base64"));
							lines.push(`![${altTexts[i + 1] || `图片 ${i + 1}`}](attachments/${name})`);
							savedImages++;
						} catch { /* skip */ }
					}
					if (lines.length) {
						attachmentsBlock = "\n\n---\n\n## 🖼️ 附图\n\n> 本对话的图片已集中保存在此索引页（分篇笔记里不重复嵌入）；共 "
							+ lines.length + " 张" + (visionUsed ? "，已用视觉模型识别内容。" : "。") + "\n\n"
							+ lines.join("\n\n") + (visionDescs || "");
					}
				}
				const indexMd = [
					`# ${title} · 分篇索引`,
					"",
					`共 **${outFiles.length}** 篇，点击标题跳转对应笔记。`,
					"",
					outFiles.map((f) => `- [${f.title}](./${encodeURIComponent(f.fileName)})`).join("\n"),
					attachmentsBlock || ""
				].join("\n");
				await writeFile(resolve(subDir, "00-索引.md"), indexMd, "utf8");
				return {
					title,
					fileName: "00-索引.md",
					path: resolve(subDir, "00-索引.md"),
					multiple: outFiles.length,
					paths: outFiles.map((f) => f.path),
					savedImages,
					visionUsed
				};
			}
		}
	}

	// Summarize: vision model when images exist and are configured, else text model.
	// 文本路径用「无限续写」(completeLongOutput) 防截断（D）；空输出时回退
	// forwardChatCompletion（处理 reasoning_content 等边缘情况）。
	const summarizeMessages = (sysText, forceText = false) => {
		if (!forceText && downloaded.length > 0 && visionModel) {
			const content = [
				{
					type: "text",
					text: baseUserText
						+ `\n\n对话中包含 ${downloaded.length} 张图片，已按出现顺序编号 1..${downloaded.length}。`
						+ "请结合图片内容总结。整理完正文后，在笔记末尾用以下格式为每张图写一句内容说明（不要省略）：\n"
						+ downloaded.map((_, i) => `- 图${i + 1}：<一句话说明这张图的内容>`).join("\n")
				},
				...downloaded.map((img) => ({ type: "image_url", image_url: { url: img.dataUrl } }))
			];
			return { mode: "vision", messages: [{ role: "system", content: sysText }, { role: "user", content }] };
		}
		const note = downloaded.length > 0
			? baseUserText + `\n\n（注：该对话还包含 ${downloaded.length} 张图片，但视觉识别失败或未配置视觉模型，图片内容未纳入总结；图片仍会随笔记保存。）`
			: baseUserText;
		return { mode: "text", messages: [{ role: "system", content: sysText }, { role: "user", content: note }] };
	};
	const runSummarize = async (sysText) => {
		const req = summarizeMessages(sysText);
		if (req.mode === "vision") {
			try {
				return { body: await forwardChatCompletion({ base: resolvedVisionBase, apiKey: visionKey, model: visionModel, messages: req.messages }), vision: true };
			} catch {
				// 图太多/太大导致视觉调用失败 → 降级为纯文本总结（图片仍保存为附件），避免整体失败
				const textReq = summarizeMessages(sysText, true);
				const long = await completeLongOutput({ base: providerInfo.base, apiKey, model, messages: textReq.messages, max_tokens: 8192, maxRounds: 4 });
				let body = long && long.content ? long.content : "";
				if (!body.trim()) {
					body = await forwardChatCompletion({ base: providerInfo.base, apiKey, model, messages: textReq.messages });
				}
				return { body, vision: false };
			}
		}
		const long = await completeLongOutput({ base: providerInfo.base, apiKey, model, messages: req.messages, max_tokens: 8192, maxRounds: 4 });
		let body = long && long.content ? long.content : "";
		if (!body.trim()) {
			body = await forwardChatCompletion({ base: providerInfo.base, apiKey, model, messages: req.messages });
		}
		return { body, vision: false };
	};

	let llmBody = "";
	let visionUsed = false;
	const firstRun = await runSummarize(sys);
	llmBody = firstRun.body;
	visionUsed = firstRun.vision;

	// —— 提炼后自检（C）：对照原文查漏，发现问题则带反馈重提炼一次 ——
	if (selfCheck && llmBody && llmBody.trim()) {
		const check = await selfCheckNote({ transcript, title, bot, llmBody, callChat });
		if (check.needsFix && check.feedback) {
			const sys2 = sys + "\n\n【上一次整理被质检发现以下问题，请在本次输出中修正。正文仍输出完整的最终笔记，不要夹带质检说明。】\n" + check.feedback;
			const retry = await runSummarize(sys2);
			if (retry.body && retry.body.trim()) {
				llmBody = retry.body;
				if (retry.vision) visionUsed = true;
			}
		}
	}

	// Save images next to the note and embed them into the markdown.
	let savedImages = [];
	let attachmentsSection = "";
	if (write && downloaded.length > 0) {
		await mkdir(dir, { recursive: true });
		const attachmentsDir = join(dir, "attachments");
		await mkdir(attachmentsDir, { recursive: true });
		const alts = parseImageAltList(llmBody);
		const files = [];
		for (let i = 0; i < downloaded.length; i++) {
			const img = downloaded[i];
			const name = `img-${i + 1}-${Date.now()}-${i}.${img.ext}`;
			await writeFile(join(attachmentsDir, name), Buffer.from(img.dataUrl.split(",")[1], "base64"));
			files.push({ name, alt: alts[i + 1] || `图片 ${i + 1}` });
		}
		savedImages = files.map((f) => `attachments/${f.name}`);
		attachmentsSection = "\n\n## 🖼️ 附图\n\n"
			+ files.map((f, i) => `![${f.alt}](attachments/${f.name})`).join("\n\n")
			+ (visionUsed ? "" : "\n\n> 提示：当时未配置视觉模型，图片内容未纳入总结；可在设置里配置视觉模型后重新提炼。");
	}

	const note = sb2bBuildNote(llmBody, {
		title,
		source,
		bot,
		tags: cfg.tags || "AI对话",
		layout,
		model: `${providerInfo.label} / ${visionUsed ? visionModel : model}`
	}) + attachmentsSection;

	// —— 按课题拆分 ——
	// 对「教案/文稿/创作产物类」的多课题内容，输出可能包含多个 `## 课题：xxx`
	// 小节约在一起。若确实含多个课题，就拆成「一课题一篇」分别写入 Obsidian，
	// 避免单篇过长被截断、也方便按课题直接学习。
	const topicSections = splitNoteByTopic(note, title);
	const noteTitle = sb2bExtractTitle(llmBody, title);

	if (write && topicSections.length > 1) {
		const paths = [];
		for (let i = 0; i < topicSections.length; i++) {
			const seg = topicSections[i];
			const segFile = `${sb2bFormatDate(Date.now())}-${sb2bSlugify(seg.title || `${noteTitle}-${i + 1}`)}.md`;
			const segPath = resolve(dir, segFile);
			await writeFile(segPath, seg.markdown, "utf8");
			paths.push({ title: seg.title || noteTitle, fileName: segFile, path: segPath });
		}
		return {
			title: noteTitle,
			fileName: paths.length > 0 ? paths[0].fileName : `${noteTitle}.md`,
			path: paths.length > 0 ? paths[0].path : noteTitle,
			multiple: paths.length,
			paths,
			savedImages: savedImages.length,
			visionUsed
		};
	}

	const fileName = `${sb2bFormatDate(Date.now())}-${sb2bSlugify(noteTitle)}.md`;

	const path = resolve(dir, fileName);
	if (write) {
		await writeFile(path, note, "utf8");
		return { title: noteTitle, fileName, path, markdown: note, savedImages: savedImages.length, visionUsed };
	}
	return { title: noteTitle, fileName, markdown: note, savedImages: savedImages.length, visionUsed, written: false };
}

/** Write an arbitrary markdown note into the vault (GUI panel server mode). */
async function serverWriteNote({ vaultPath, folder, fileName, content }) {
	const vault = String(vaultPath || "").trim();
	const dirName = String(folder || "").trim() || "AI 第二大脑";
	if (!vault) throw new Error("未提供 Obsidian 库路径");
	const dir = resolve(vault, dirName);
	await mkdir(dir, { recursive: true });
	const path = resolve(dir, String(fileName || "note.md"));
	await writeFile(path, content, "utf8");
	return { path };
}

/**
 * Delete a note .md from the Obsidian vault, plus any shared attachments
 * directory if it exists next to it. Used when the user removes an archive
 * record, so the file on disk is removed too.
 * @returns { deleted, path } — deleted false if the file was already absent.
 */
async function serverDeleteNote({ vaultPath, folder, fileName }) {
	const vault = String(vaultPath || "").trim();
	const dirName = String(folder || "").trim() || "AI 第二大脑";
	if (!vault) throw new Error("未提供 Obsidian 库路径");
	const dir = resolve(vault, dirName);
	const path = resolve(dir, String(fileName || ""));
	let deleted = false;
	try {
		await access(path);
		await unlink(path);
		deleted = true;
	} catch {
		deleted = false; // already gone
	}
	// Best-effort: remove the attachments folder (it holds images imported
	// for this and other notes; only remove if empty to avoid dropping others').
	try {
		const att = join(dir, "attachments");
		await access(att);
		const files = await readdir(att);
		if (files.length === 0) await rmdir(att);
	} catch {
		/* non-empty or absent — leave it */
	}
	return { deleted, path };
}

/** The harness home (honors DSH_HOME like the harness itself). */
function dshHome() {
	return process.env.DSH_HOME || join(homedir(), ".dsh");
}

/** Locate a usable zstd binary (the session logs are zstd-compressed JSONL). */
async function findZstd() {
	for (const candidate of ZSTD_CANDIDATES) {
		try {
			await execFileAsync(candidate, ["--version"]);
			return candidate;
		} catch {
			/* try next */
		}
	}
	return null;
}

/** List recent harness sessions from the projection cache (titles + timestamps). */
async function listHarnessSessions() {
	const cachePath = join(dshHome(), "storages", "session_projcache.json");
	const raw = await readFile(cachePath, "utf8");
	const cache = JSON.parse(raw);
	const table = (cache.tables && cache.tables.sessions) || {};
	const list = Object.entries(table).map(([id, info]) => {
		const rows = (info && info.rows) || {};
		const identity = (info && info.identity) || {};
		const value = (key) => (rows[key] && rows[key].val) || undefined;
		const title = value("title") || "未命名会话";
		const createdAt = Number(identity.createdAt) || 0;
		const listMeta = value("sessionListMetadata");
		const lastPromptAt = Number(listMeta && listMeta.lastPromptAt) || createdAt;
		const stats = value("sessionStats");
		return {
			id,
			title,
			createdAt,
			lastPromptAt,
			turns: (stats && stats.turns) || 0,
			cwd: identity.cwd || ""
		};
	});
	list.sort((a, b) => b.lastPromptAt - a.lastPromptAt);
	return list.slice(0, 40);
}

/** Locate the zstd session log for a session id, scanning all workspace dirs. */
async function findSessionLog(sessionId) {
	const root = join(dshHome(), "sessions");
	let entries;
	try {
		entries = await readdir(root, { withFileTypes: true });
	} catch {
		return null;
	}
	for (const dir of entries) {
		if (!dir.isDirectory()) continue;
		// sessionId from the projection cache already carries the "session-" prefix.
		const candidate = join(root, dir.name, sessionId, "session.jsonl.zstd");
		try {
			await access(candidate);
			return candidate;
		} catch {
			/* keep looking */
		}
	}
	return null;
}

/** Join the plain-text blocks of an OpenAI-style content array. */
function extractTextBlocks(content) {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((block) => block && block.type === "text" && typeof block.text === "string")
		.map((block) => block.text)
		.join("\n");
}

/** Extract the short text of a tool result message. */
function extractToolResultText(content) {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const parts = [];
	for (const block of content) {
		if (!block) continue;
		if (block.type === "text" && typeof block.text === "string") parts.push(block.text);
		else if (block.type === "tool-result" && Array.isArray(block.content)) {
			const inner = extractToolResultText(block.content);
			if (inner) parts.push(inner);
		}
	}
	return parts.join("\n");
}

/**
 * Read one harness session's conversation: decompress its JSONL log and
 * reduce it to { title, messages, truncated }. Messages keep the original
 * order (seq). Tool calls/results become compact 🔧 markers so the
 * summarizing model understands what was done without flooding the context.
 */
async function readHarnessSession(sessionId) {
	const logPath = await findSessionLog(sessionId);
	if (logPath === null) throw new Error(`找不到会话 ${sessionId} 的日志文件`);
	const zstd = await findZstd();
	if (zstd === null) throw new Error("读取会话需要 zstd 解压工具，请先运行 brew install zstd");
	const { stdout } = await execFileAsync(zstd, ["-d", "-c", logPath], {
		maxBuffer: 512 * 1024 * 1024
	});

	let title = "";
	const parts = [];
	for (const line of stdout.split("\n")) {
		const trimmed = line.trim();
		if (trimmed.length === 0) continue;
		let ev;
		try {
			ev = JSON.parse(trimmed);
		} catch {
			continue;
		}
		if (!ev || typeof ev.type !== "string") continue;
		const seq = Number(ev.seq ?? ev.seq0 ?? 0);
		if (ev.type === "session/title" && ev.data && ev.data.title && !title) {
			title = ev.data.title;
		} else if (ev.type === "user/message") {
			const text = extractTextBlocks(ev.data && ev.data.content).trim();
			if (text) parts.push({ seq, role: "user", content: text });
		} else if (ev.type === "assistant/message") {
			const text = extractTextBlocks(ev.data && ev.data.message && ev.data.message.content).trim();
			if (text) parts.push({ seq, role: "assistant", content: text });
		} else if (ev.type === "tool/call") {
			const args = ev.data && typeof ev.data.arguments === "string" ? ev.data.arguments.replace(/\s+/g, " ").trim() : "";
			const brief = args.slice(0, 140);
			parts.push({ seq, role: "tool", content: `[工具调用] ${ev.data.name || "tool"}${brief ? "：" + brief : ""}` });
		} else if (ev.type === "tool/result") {
			const text = extractToolResultText(ev.data && ev.data.message && ev.data.message.content).replace(/\s+/g, " ").trim();
			if (text) parts.push({ seq, role: "tool", content: `[工具结果] ${text.slice(0, 320)}` });
		}
	}
	parts.sort((a, b) => a.seq - b.seq);
	const messages = parts.map(({ role, content }) => ({ role, content }));

	// Cap the transcript at ~40k chars, keeping the most recent portion.
	let total = 0;
	let start = messages.length;
	for (let i = messages.length - 1; i >= 0; i--) {
		total += messages[i].content.length;
		if (total > 40000) break;
		start = i;
	}
	const truncated = start > 0;
	const kept = messages.slice(Math.max(0, start));
	if (truncated && kept.length > 0) {
		kept[0] = { ...kept[0], content: "…（会话较长，已截取最近部分）\n" + kept[0].content };
	}
	return { title: title || "未命名会话", messages: kept, truncated, messageCount: messages.length };
}

/**
 * Read a JSON request body as text then parse it.
 * @param req - node:http IncomingMessage.
 * @returns the parsed JSON payload.
 */
function readJsonBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		req.on("data", (chunk) => chunks.push(chunk));
		req.on("end", () => {
			try {
				const raw = Buffer.concat(chunks).toString("utf8");
				resolve(raw.length > 0 ? JSON.parse(raw) : {});
			} catch (error) {
				reject(error);
			}
		});
		req.on("error", reject);
	});
}

/** Write a small JSON response with the shared headers. */
function sendJson(res, status, payload) {
	const body = JSON.stringify(payload);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": Buffer.byteLength(body),
		"cache-control": "no-store",
		// The browser extension fetches these routes from a chrome-extension://
		// origin; allow it (this server only listens on loopback).
		"access-control-allow-origin": "*"
	});
	res.end(body);
}

/**
 * Normalize a Doubao share URL to its share id: accept "https://www.doubao.com/thread/<id>",
 * "/thread/<id>", or the bare id.
 * @param input - user-provided URL or id.
 * @returns the share id, or null when nothing looks like one.
 */
function extractShareId(input) {
	if (typeof input !== "string") return null;
	const trimmed = input.trim();
	if (trimmed.length === 0) return null;
	const match = trimmed.match(/\/thread\/([A-Za-z0-9_-]+)/);
	if (match) return match[1];
	// Bare id: a reasonable share id is alphanumeric (plus - _), 6..64 chars.
	if (/^[A-Za-z0-9_-]{6,64}$/.test(trimmed)) return trimmed;
	return null;
}

/**
 * Parse a Doubao message snapshot item into { role, content, images }.
 * content_type 1 means the content field is JSON like {"text":"..."}.
 * user_type 1 = human, 2 = assistant (豆包).
 * Images are collected best-effort from the content JSON and content_block
 * (fields whose names/values look like image URLs or uri pointers).
 */
function normalizeMessage(item) {
	let text = typeof item.content === "string" ? item.content : "";
	const images = [];
	if (item.content_type === 1) {
		try {
			const parsed = JSON.parse(text);
			if (parsed && typeof parsed.text === "string") text = parsed.text;
			collectImageUrls(parsed, images);
		} catch {
			/* keep raw text */
		}
	}
	for (const block of Array.isArray(item.content_block) ? item.content_block : []) {
		collectImageUrls(block, images);
	}
	const role = Number(item.user_type) === 1 ? "user" : "assistant";
	return { role, content: text.trim(), images };
}

/** Recursively collect http(s) image URLs from a Doubao content structure. */
function collectImageUrls(node, out) {
	if (node === null || typeof node !== "object") return;
	if (Array.isArray(node)) {
		for (const item of node) collectImageUrls(item, out);
		return;
	}
	for (const [key, value] of Object.entries(node)) {
		const k = String(key).toLowerCase();
		if (typeof value === "string" && /^https?:\/\/.+\.(png|jpe?g|webp|gif|bmp)(\?|$)/i.test(value)) {
			out.push(value);
		} else if (typeof value === "string" && k.includes("uri") && /^https?:\/\//.test(value) && /image/i.test(k + node.mime_type || "")) {
			out.push(value);
		} else if (typeof value === "object") {
			collectImageUrls(value, out);
		}
	}
}

/**
 * Fetch a Doubao share snapshot and reduce it to { title, bot, messages }.
 * share ids starting with "x" are IM message shares (im/message/share/get);
 * everything else goes to the thread snapshot endpoint.
 * @param shareId - the Doubao share id.
 * @returns the normalized snapshot.
 */
async function fetchDoubaoShare(shareId) {
	const base = "https://www.doubao.com";
	const isImShare = shareId.startsWith("x");
	const url = isImShare
		? `${base}/im/message/share/get`
		: `${base}/samantha/thread/share/snapshot/get`;
	const body = isImShare
		? { share_id: shareId, need_bot_info: true }
		: { share_id: shareId, need_bot: false };

	const response = await fetch(url, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body)
	});
	if (!response.ok) {
		throw new Error(`豆包接口返回 HTTP ${response.status}`);
	}
	const json = await response.json();
	if (json.code !== undefined && Number(json.code) !== 0 && !json.data) {
		throw new Error(json.message || json.msg || "豆包接口返回错误");
	}
	const data = json.data;
	if (!data) throw new Error("豆包接口返回为空");

	const shareInfo = data.share_info || {};
	const snapshot = data.message_snapshot || {};
	const rawMessages = Array.isArray(snapshot.message_list) ? snapshot.message_list : [];

	const normalized = rawMessages
		.map((item) => ({
			...normalizeMessage(item),
			index: Number(item.index_in_conv) || 0
		}))
		.filter((m) => m.content.length > 0)
		.sort((a, b) => a.index - b.index);
	const messages = normalized.map(({ role, content }) => ({ role, content }));
	const images = [...new Set(normalized.flatMap((m) => m.images || []))];

	return {
		title: shareInfo.share_name || "未命名对话",
		bot: (shareInfo.bot && shareInfo.bot.name) || "豆包",
		user: (shareInfo.user && shareInfo.user.nick_name) || "",
		shareTime: shareInfo.share_time ? Number(shareInfo.share_time) : 0,
		messageCount: messages.length,
		messages,
		images
	};
}

/**
 * Forward a chat-completions request to any OpenAI-compatible provider
 * (Ark/Doubao, DeepSeek, Moonshot/Kimi, DashScope, or a custom base URL).
 * The browser half always calls this same-origin route so provider CORS
 * policies never block the request.
 */
async function forwardChatCompletion(payload) {
	const { base, apiKey, model, messages, temperature, max_tokens } = payload;
	if (!base || !apiKey || !model) throw new Error("模型服务配置不完整（base / apiKey / model 缺失）");
	if (!Array.isArray(messages) || messages.length === 0) throw new Error("没有可发送的消息");
	const url = String(base).replace(/\/+$/, "") + "/chat/completions";
	const isDeepSeek = /deepseek\.com/i.test(base);
	// 输出上限放宽到 8192，单篇长内容（完整教案/试讲稿）一次即可写完。
	const body = {
		model,
		messages,
		temperature: temperature ?? 0.3,
		max_tokens: max_tokens ?? (isDeepSeek ? 8192 : 4096)
	};
	const response = await fetch(url, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"authorization": "Bearer " + apiKey
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(240000)
	});
	const json = await response.json().catch(() => null);
	if (!response.ok || !json) {
		const detail = (json && json.error && (json.error.message || json.error.code))
			|| (json && json.message)
			|| `HTTP ${response.status}`;
		throw new Error(`模型服务返回错误：${String(detail)}`);
	}
	const message = json.choices && json.choices[0] && json.choices[0].message;
	const content = message && message.content;
	// 有些 providers 在 thinking 模式下只返回推理、content 为空；若如此，回退到 reasoning_content。
	if (typeof content !== "string" || content.length === 0) {
		const reasoning = message && message.reasoning_content;
		if (typeof reasoning === "string" && reasoning.length > 0) return reasoning;
		const finish = json.choices && json.choices[0] && json.choices[0].finish_reason;
		throw new Error(`模型返回内容为空（finish_reason=${finish || "unknown"}）；这可能是因为对话过长被推理吃光了输出配额，或该模型不支持当前输入。` +
			(isDeepSeek ? " DeepSeek 已尝试关闭思考模式，若仍为空请缩短对话或改用它模型。" : ""));
	}
	return content;
}

/**
 * 「无限续写」式调用：像 Codex 一样不设单条输出上限。
 * 每次请求，若 finish_reason 为 "length"（达到 max_tokens 被截断），就用
 * “请从未写完处继续”续写并追加，直到模型正常结束（finish_reason 非 length）
 * 或达到最大轮数，最后把所有片段拼接成完整内容返回。
 * @returns { content, truncated } — content 为完整拼接文本。
 */
async function completeLongOutput({ base, apiKey, model, messages, max_tokens = 8192, maxRounds = 12 }) {
	const url = String(base).replace(/\/+$/, "") + "/chat/completions";
	const all = [];
	let working = messages.slice();
	let truncated = false;
	let safetyRounds = 0;
	while (safetyRounds < maxRounds) {
		safetyRounds++;
		const body = {
			model,
			messages: working,
			temperature: 0.3,
			max_tokens
		};
		const resp = await fetch(url, {
			method: "POST",
			headers: { "content-type": "application/json", "authorization": "Bearer " + apiKey },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(240000)
		});
		const json = await resp.json().catch(() => null);
		if (!resp.ok || !json) {
			const detail = (json && json.error && (json.error.message || json.error.code))
				|| (json && json.message) || `HTTP ${resp.status}`;
			throw new Error(`模型服务返回错误：${String(detail)}`);
		}
		const choice = json.choices && json.choices[0];
		const piece = choice && choice.message && choice.message.content;
		if (typeof piece === "string" && piece.length > 0) all.push(piece);
		const finish = choice && choice.finish_reason;
		if (finish !== "length") break; // 正常结束
		truncated = true;
		// 续写：保留最初的完整指令 messages(含 system+user 的原始任务描述)，
		// 再追加 已生成的全部内容 + 继续提示。这样模型能始终看到"要写什么"，
		// 不会因丢掉用户指令而失忆输出"抱歉，我这边没有看到…"。
		const tail = all.join("").slice(-600);
		const baseCount = messages.length;
		working = messages.slice(0, baseCount)
			.concat([{ role: "assistant", content: all.join("") }])
			.concat([{ role: "user", content: `你上面已经写到了这里：\n${tail}\n\n请从这里**无缝继续往下写**，把后面剩余的课题/内容完整写完（每个课题写完整再进入下一个），不要重复上文，不要提前结束，直到所有内容都写完为止。` }]);
	}
	return { content: all.join(""), truncated, rounds: safetyRounds };
}

//#region Kimi (moonshot) share adapter
/**
 * Kimi share pages (kimi.com/share/… and moonshot versions) are React + the
 * conversation is hydrated into an inline `window.HYDRATION_INIT_STATE`
 * object (Protobuf-flavoured JSON): `data.messages[]` each has a `role` and a
 * list of `content` blocks; the human/AI text lives in
 * `{case:"text", value:{content:"…"}}`, while think/tool/file blocks carry
 * auxiliary content. This adapter extracts ordered text blocks best-effort.
 */

const KIMI_BROWSER_HEADERS = {
	"user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
	accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
	"accept-language": "zh-CN,zh;q=0.9,en;q=0.8"
};

/** Extract the share id from a kimi.com / moonshot share URL. */
function extractKimiShareId(input) {
	if (typeof input !== "string") return null;
	let url;
	try {
		url = new URL(input.trim());
	} catch {
		return null;
	}
	if (!/kimi\.com|moonshot\.(ai|cn)|kimi\.moonshot\.cn/i.test(url.hostname)) return null;
	const m = url.pathname.match(/\/share\/([A-Za-z0-9-]+)/);
	return m ? m[1] : null;
}

/**
 * Parse a `content` block value (a flat object possibly nested) and return the
 * human/assistant text, ignoring think/tool/debug noise when possible.
 */
function kimiBlockText(value) {
	if (typeof value === "string") return value;
	if (value && typeof value === "object") {
		if (typeof value.content === "string") return value.content;
		if (typeof value.text === "string") return value.text;
		if (Array.isArray(value.content)) {
			return value.content.map((c) => (typeof c === "string" ? c : kimiBlockText(c))).filter(Boolean).join("\n");
		}
	}
	return "";
}

/**
 * Parse a Kimi share page's hydrated init-state JSON blob into ordered
 * messages. Each ChatMessage has:
 *   - "role": N (2 = user, 3 = assistant/agent)
 *   - "blocks": [ { content: { case: "text"|"think"|"tool"|…, value: { content: "…" } } } ]
 * We keep only `text` blocks (the human prompt and the assistant's real
 * replies), skipping think/tool/multistage noise.
 */
function parseKimiHydration(blobText) {
	const messages = [];
	let searchFrom = 0;
	while (true) {
		const idx = blobText.indexOf('"$typeName":"kimi.chat.v1.ChatMessage"', searchFrom);
		if (idx < 0) break;
		// Back up to the object's opening brace.
		let open = -1;
		{
			let depth = 0;
			for (let i = idx; i >= 0; i--) {
				const ch = blobText[i];
				if (ch === "}") depth++;
				else if (ch === "{") {
					if (depth === 0) { open = i; break; }
					depth--;
				}
			}
		}
		if (open < 0) break;
		// Find the closing brace for this message object.
		let close = -1;
		{
			let depth = 0, inStr = false, esc = false;
			for (let i = open; i < blobText.length; i++) {
				const ch = blobText[i];
				if (inStr) {
					if (esc) esc = false;
					else if (ch === "\\") esc = true;
					else if (ch === '"') inStr = false;
					continue;
				}
				if (ch === '"') inStr = true;
				else if (ch === "{") depth++;
				else if (ch === "}") { depth--; if (depth === 0) { close = i; break; } }
			}
		}
		if (close < 0) break;
		const objText = blobText.slice(open, close + 1);
		searchFrom = close + 1;

		// role: numeric enum "role":2 (user) / 3 (assistant/agent)
		const roleM = /"role"\s*:\s*(\d+)/.exec(objText);
		const roleNum = roleM ? Number(roleM[1]) : 3;
		const role = roleNum === 2 ? "user" : "assistant";

		// Collect text blocks (case "text") inside this message.
		// Text block shape: "case":"text","value":{"$typeName":"kimi.chat.v1.TextBlock","content":"..."
		const chunks = [];
		const blockRe = /"case"\s*:\s*"(text)"\s*,\s*"value"\s*:\s*\{[^{}]*?"content"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
		let t;
		while ((t = blockRe.exec(objText)) !== null) {
			let val;
			try { val = JSON.parse('"' + t[2] + '"'); } catch { val = t[2]; }
			chunks.push(val);
		}
		const joined = chunks.join("\n").trim();
		if (joined) messages.push({ role, content: joined });
	}
	return { messages };
}

/**
 * Fetch + parse a Kimi share link. Best-effort extraction of ordered text.
 */
async function fetchKimiShare(url) {
	const shareId = extractKimiShareId(url);
	if (shareId === null) throw new Error("无法识别的 Kimi 分享链接（需要 https://www.kimi.com/share/…）");
	const response = await fetch(`https://www.kimi.com/share/${shareId}`, {
		headers: KIMI_BROWSER_HEADERS,
		signal: AbortSignal.timeout(45000)
	});
	if (!response.ok) throw new Error(`Kimi 分享页返回 HTTP ${response.status}`);
	const html = await response.text();
	if (!html || html.length < 500) throw new Error("Kimi 分享页内容为空");
	const m = /window\.HYDRATION_INIT_STATE=(\{.*?\});?\s*<\/script>/s.exec(html);
	if (!m) throw new Error("Kimi 分享页未内嵌对话数据（可能已改版，可改用粘贴或扩展）");
	const { messages } = parseKimiHydration(m[1]);
	if (messages.length === 0) throw new Error("Kimi 分享数据里没有可提取的文本内容");
	// Role "user" guess: first message is usually the prompt; ChatMessage role field
	// often carries the custom agent name (e.g. 趋势预言家), so treat as assistant's
	// persona unless it equals "user".
	return {
		title: `Kimi 分享 · ${shareId.slice(0, 10)}`,
		bot: "Kimi",
		messageCount: messages.length,
		messages
	};
}
//#endregion

//#region DeepSeek / Tongyi / Zhipu share adapters (generic SPA share extraction)
/**
 * These platforms' share pages are React/SPA: conversation lives in inline
 * hydration JSON OR a JSON endpoint. Exact shape varies by platform/version,
 * so a generic best-effort extraction is used; a real share URL is needed to
 * finalize per platform. Mirrors the other adapters' return shape.
 */

function sharePageHead() {
	return {
		"user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
		accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"accept-language": "zh-CN,zh;q=0.9,en;q=0.8"
	};
}

/** Extract the id from a share URL: trailing path segment, min 4 chars. */
function shareIdFromUrl(input, must) {
	if (typeof input !== "string") return null;
	let url;
	try { url = new URL(input.trim()); } catch { return null; }
	const segs = url.pathname.split("/").filter(Boolean);
	const id = segs[segs.length - 1];
	if (!id || id.length < 4) return null;
	if (must && !must.test(id)) return null;
	return id;
}

/** Recursively collect human-readable text from a nested chat blob. */
function collectChatText(value, out) {
	if (value === null || value === undefined) return;
	if (typeof value === "string") { const t = value.trim(); if (t && !/^\s*\{/.test(t)) out.push(t); return; }
	if (Array.isArray(value)) { for (const v of value) collectChatText(v, out); return; }
	if (typeof value === "object") {
		for (const key of ["text", "content", "message", "value", "parts", "blocks", "messages", "data"]) {
			if (typeof value[key] !== "undefined") collectChatText(value[key], out);
		}
		for (const k in value) {
			if (["text", "content", "message", "value", "parts", "blocks", "messages", "data", "title", "id", "$typeName", "role", "author"].includes(k)) continue;
			if (typeof value[k] === "object" && value[k] !== null) collectChatText(value[k], out);
		}
	}
}

/** Generic: fetch a share page and pull conversation text via heuristics. */
async function fetchGenericShare(url, bot) {
	const shareId = shareIdFromUrl(url);
	if (!shareId) throw new Error(`无法识别的 ${bot} 分享链接：${url}`);
	// Resolve a canonical share page URL per platform.
	let pageUrl = url;
	try {
		const u = new URL(url);
		const h = u.hostname.toLowerCase();
		if (/chat\.deepseek\.com/i.test(h)) pageUrl = `https://chat.deepseek.com/share/${shareId}`;
		else if (/tongyi|qianwen|aliyun/i.test(h)) pageUrl = `https://www.qianwen.com/qianwen/share/${shareId}`;
		else if (/chatglm|bigmodel|zhipu/i.test(h)) pageUrl = `https://chatglm.cn/share/${shareId}`;
	} catch { /* keep as-is */ }
	const resp = await fetch(pageUrl, { headers: sharePageHead(), signal: AbortSignal.timeout(45000) });
	if (!resp.ok) throw new Error(`${bot} 分享页返回 HTTP ${resp.status}`);
	const html = await resp.text();
	if (!html || html.length < 300) throw new Error(`${bot} 分享页内容为空`);

	// Strategy 1: inline hydration JSON blob.
	let blobObj = null;
	const inlineRe = /window\.__[A-Za-z_]*STATE__\s*=\s*(\{.*?\})\s*;?\s*<\/script>|<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s;
	const im = inlineRe.exec(html);
	if (im) {
		const raw = (im[1] || im[2] || "").trim();
		try { blobObj = JSON.parse(raw); } catch { /* try next */ }
	}

	// Strategy 2: brute-scan quoted content-ish strings.
	let texts = [];
	if (blobObj) collectChatText(blobObj, texts);
	if (texts.length === 0) {
		const re = /"(?:text|content)"\s*:\s*"((?:[^"\\]|\\.){6,600})"/g;
		let m;
		while ((m = re.exec(html)) !== null) {
			try { texts.push(JSON.parse('"' + m[1] + '"')); } catch { texts.push(m[1]); }
		}
	}
	const cleaned = texts.map((t) => t.replace(/\s+/g, " ").trim()).filter((t) => t.length >= 4);
	if (cleaned.length === 0) throw new Error(`${bot} 分享页未找到可提取的对话内容（该平台分享接口可能要求登录或已改版，可改用扩展/粘贴）`);
	return {
		title: `${bot} 分享 · ${shareId.slice(0, 12)}`,
		bot,
		messageCount: cleaned.length,
		messages: cleaned.map((content) => ({ role: "assistant", content }))
	};
}

async function fetchDeepSeekShare(url) {
	const shareId = shareIdFromUrl(url);
	if (!shareId) throw new Error("无法识别的 DeepSeek 分享链接（需要 https://chat.deepseek.com/share/…）");
	const resp = await fetch(`https://chat.deepseek.com/api/v0/share/content?share_id=${encodeURIComponent(shareId)}`, {
		headers: sharePageHead(),
		signal: AbortSignal.timeout(45000)
	});
	if (!resp.ok) throw new Error(`DeepSeek 分享接口返回 HTTP ${resp.status}`);
	const json = await resp.json().catch(() => null);
	const biz = json && json.data && json.data.biz_data;
	if (!biz || !Array.isArray(biz.messages)) throw new Error("DeepSeek 分享接口未返回对话内容（链接可能已失效或需登录）");
	const messages = biz.messages
		.filter((m) => m && typeof m.content === "string" && m.content.trim().length > 0)
		.map((m) => ({ role: /USER/i.test(m.role || "") ? "user" : "assistant", content: m.content.trim() }));
	if (messages.length === 0) throw new Error("DeepSeek 分享对话内容为空");
	return {
		title: (biz.title && biz.title !== "Shared Conversation" ? biz.title : "DeepSeek 分享对话"),
		bot: "DeepSeek",
		messageCount: messages.length,
		messages
	};
}
async function fetchTongyiShare(url) {
	// 通义千问分享页是 SPA 壳，对话数据通过 chat2-api 拉取（公开分享无需登录）：
	//   POST https://chat2-api.qianwen.com/api/v1/share/info?pr=qwen&fr=mac
	//   body: {"share_id":"<id>","biz_id":"ai_qwen"}
	// 返回 data.session.record_list[]，每轮含 request_messages[].content(用户) 与
	// response_messages[].content(AI 正文，过滤 signal/post 信号)。
	const shareId = shareIdFromUrl(url);
	if (!shareId) throw new Error(`无法识别的通义千问 分享链接：${url}`);
	let json;
	try {
		const r = await fetch("https://chat2-api.qianwen.com/api/v1/share/info?pr=qwen&fr=mac", {
			method: "POST",
			headers: { "content-type": "application/json", referer: url, ...sharePageHead() },
			body: JSON.stringify({ share_id: shareId, biz_id: "ai_qwen" }),
			signal: AbortSignal.timeout(45000)
		});
		if (!r.ok) throw new Error(`通义千问 分享接口返回 HTTP ${r.status}`);
		json = await r.json().catch(() => null);
	} catch (e) {
		// 接口失败（可能被限流/反爬）回退到通用提取器
		return fetchGenericShare(url, "通义千问");
	}
	const records = json && json.data && json.data.session && Array.isArray(json.data.session.record_list)
		? json.data.session.record_list
		: null;
	if (!records || records.length === 0) return fetchGenericShare(url, "通义千问");
	const messages = [];
	for (const rec of records) {
		// 用户问题
		const reqs = Array.isArray(rec && rec.request_messages) ? rec.request_messages : [];
		for (const mq of reqs) {
			const c = mq && typeof mq.content === "string" ? mq.content.trim() : "";
			if (c && c !== "function_call") messages.push({ role: "user", content: c });
		}
		// AI 回答：过滤 signal/工具 marker，取有 content 的文本
		const resps = Array.isArray(rec && rec.response_messages) ? rec.response_messages : [];
		const ai = resps
			.map((m) => (m && typeof m.content === "string" ? m.content.trim() : ""))
			.filter((c) => c && c !== "" && c !== "complete" && !/^signal\/post/.test(c) && c !== "function_call" && !/^json:/.test(c))
			.join("\n\n")
			.trim();
		if (ai) messages.push({ role: "assistant", content: ai });
	}
	if (messages.length === 0) return fetchGenericShare(url, "通义千问");
	const title = (json.data && json.data.title && String(json.data.title).trim()) || "通义千问 分享";
	return { title, bot: "通义千问", messageCount: messages.length, messages };
}
async function fetchZhipuShare(url) {
	// 智谱清言分享页的对话接口带前端签名(x-sign/nonce/timestamp)，服务端难以伪造成签，
	// 且分享内容需浏览器渲染。故用无头浏览器打开分享页，从渲染后的 DOM(class 结构)
	// 提取用户提问(.conversation.question) 与 ChatGLM 回答(.answer-content-wrap)。
	const shareId = shareIdFromUrl(url);
	if (!shareId) throw new Error(`无法识别的 智谱清言 分享链接：${url}`);
	const puppeteer = await loadPuppeteerCore();
	const executablePath = await findBrowserExecutable();
	if (!puppeteer || !puppeteer.launch || !executablePath) {
		throw new Error("智谱清言 分享需本机无头浏览器（未找到 puppeteer/Edge/Chrome），请改用粘贴文本导入。");
	}
	let browser;
	try {
		browser = await puppeteer.launch({
			executablePath,
			headless: "new",
			args: ["--no-sandbox", "--disable-gpu", "--no-zygote", "--disable-setuid-sandbox"]
		});
		const page = await browser.newPage();
		await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 }).catch(() => {});
		await new Promise((r) => setTimeout(r, 9000));
		const msgs = await page.evaluate(() => {
			const questions = [...document.querySelectorAll(".conversation.question")].map((el) => (el.innerText || "").trim());
			const answers = [...document.querySelectorAll(".answer-content-wrap")].map((el) => (el.innerText || "").trim());
			const out = [];
			const clean = (t) => t.replace(/^用户\s*/, "").replace(/\s+\u5c55\u5f00\s*$/s, "").trim();
			const n = Math.min(questions.length, answers.length);
			for (let i = 0; i < n; i++) {
				const u = clean(questions[i]);
				const a = (answers[i] || "").trim();
				if (u) out.push({ role: "user", content: u });
				if (a) out.push({ role: "assistant", content: a });
			}
			return out;
		});
		if (!msgs || msgs.length === 0) throw new Error("未从页面提取到对话（可能需登录或页面未加载）");
		const title = await page.title().catch(() => "");
		return {
			title: (title && title.trim() ? title.trim() : "智谱清言 分享"),
			bot: "智谱清言",
			messageCount: msgs.length,
			messages: msgs
		};
	} catch (error) {
		throw new Error(`智谱清言 分享抓取失败：${error && error.message ? error.message : String(error)}`);
	} finally {
		if (browser) await browser.close().catch(() => {});
	}
}
async function fetchWenxinShare(url) {
	const resp = await fetch(url, { headers: sharePageHead(), redirect: "follow", signal: AbortSignal.timeout(45000) });
	if (!resp.ok) throw new Error(`文心一言 分享页返回 HTTP ${resp.status}`);
	const html = await resp.text();
	if (!html || html.length < 300) throw new Error("文心一言 分享页内容为空");
	// 文心分享的数据以内嵌 <script type="application/json" name="shareQAData"> 的
	// historyData 提供：每轮含 query(用户问题) + chatResponse(generator 组件) ，
	// AI 正文在 markdown 组件的 data.value 里。短链 https://mr.baidu.com/r/… 会自动重定向到该页。
	const qa = html.match(/name="shareQAData"[^>]*>\s*([\s\S]*?)<\/script>/);
	if (!qa) {
		// 不可用的分享（如要求登录的 wenxin/search/<id>）回退到通用提取器，可能失败。
		return fetchGenericShare(url, "文心一言");
	}
	let blob;
	try { blob = JSON.parse(qa[1].trim()); } catch { return fetchGenericShare(url, "文心一言"); }
	const hd = Array.isArray(blob && blob.historyData) ? blob.historyData : null;
	if (!hd) return fetchGenericShare(url, "文心一言");
	const messages = [];
	for (const item of hd) {
		// 用户 query
		const qText = (Array.isArray(item && item.query) ? item.query : [])
			.map((x) => x && x.data && x.data.text ? (x.data.text.query || x.data.text.user_query || "") : "")
			.filter((s) => s && String(s).trim());
		for (const q of qText) { const t = String(q).trim(); if (t) messages.push({ role: "user", content: t }); }
		// AI chatResponse generator：提取 markdown 正文 + 文本辅助
		const gen = (Array.isArray(item && item.chatResponse) ? item.chatResponse : [])
			.reduce((acc, r) => acc.concat((r && r.data && r.data.message && r.data.message.content && Array.isArray(r.data.message.content.generator)) ? r.data.message.content.generator : []), []);
		const mdParts = [];
		const auxParts = [];
		for (const g of gen) {
			const data = g && g.data;
			if (g && g.component === "markdown" && data && typeof data.value === "string" && data.value.trim()) {
				mdParts.push(data.value.trim());
			} else if (data) {
				if (Array.isArray(data.text)) auxParts.push(...data.text.filter((t) => typeof t === "string"));
				else if (typeof data.text === "string") auxParts.push(data.text);
			}
		}
		const aiContent = mdParts.join("\n\n").trim() || auxParts.join("\n").trim();
		if (aiContent) messages.push({ role: "assistant", content: aiContent });
	}
	if (messages.length === 0) return fetchGenericShare(url, "文心一言");
	const titleMatch = html.match(/<title>([^<]*)<\/title>/);
	return {
		title: (titleMatch && titleMatch[1] && titleMatch[1].trim() ? titleMatch[1].trim() : "百度文心助手 分享"),
		bot: "文心一言",
		messageCount: messages.length,
		messages
	};
}
//#endregion

//#region ChatGPT share adapter
/**
 * ChatGPT share pages are Remix apps: the conversation is NOT embedded in the
 * HTML. The route loader exposes it at `<share-url>.data` in Remix's flattened
 * "turbo" array format (a flat value table where `_K: V` reference pairs mean
 * `name = table[K], value = table[V]` and array elements are table indexes).
 * This adapter fetches the `.data` endpoint and decodes `linear_conversation`
 * into { role, content } messages. chatgpt.com is only reachable while the
 * user's proxy/VPN is up.
 */

const CHATGPT_BROWSER_HEADERS = {
	"user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
	accept: "application/json,text/html,*/*;q=0.8",
	"accept-language": "en-US,en;q=0.9",
	referer: "https://chatgpt.com/"
};

/** Extract the share id from a chatgpt.com / chat.openai.com share URL. */
function extractChatGptShareId(input) {
	if (typeof input !== "string") return null;
	let url;
	try {
		url = new URL(input.trim());
	} catch {
		return null;
	}
	if (!["chatgpt.com", "chat.openai.com"].includes(url.hostname)) return null;
	const segments = url.pathname.split("/").filter(Boolean);
	if (segments[0] !== "share") return null;
	return segments[1] === "e" ? segments[2] || null : segments[1] || null;
}

/**
 * Split the first JSON value off a response body that may carry a trailing
 * Remix stream chunk (e.g. an error frame after the main payload).
 */
function splitFirstJson(text) {
	let depth = 0;
	let inString = false;
	let escaped = false;
	let started = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (inString) {
			if (escaped) escaped = false;
			else if (ch === "\\") escaped = true;
			else if (ch === '"') inString = false;
			continue;
		}
		if (ch === '"') inString = true;
		else if (ch === "{" || ch === "[") {
			started = true;
			depth++;
		} else if (ch === "}" || ch === "]") {
			depth--;
			if (started && depth === 0) return text.slice(0, i + 1);
		}
	}
	return null;
}

/**
 * Decode Remix's flattened array format. Reference objects (all keys start
 * with "_") map name = table[K] to value = table[V]; array elements are table
 * indexes (non-integers pass through). Cycle-safe via identity memoization.
 * @param table - the flat value array.
 * @returns { decodeValue } - resolves one table slot.
 */
function createRemixDecoder(table) {
	const cache = new Map();
	const inProgress = new Set();
	function decodeValue(x) {
		if (x === null || typeof x !== "object") return x;
		if (cache.has(x)) return cache.get(x);
		if (inProgress.has(x)) return undefined; // cycle guard
		inProgress.add(x);
		let out;
		if (Array.isArray(x)) {
			out = x.map((e) => (typeof e === "number" && Number.isInteger(e) && e >= 0 && e < table.length ? decodeValue(table[e]) : decodeValue(e)));
		} else {
			const keys = Object.keys(x);
			if (keys.length > 0 && keys.every((k) => k.startsWith("_"))) {
				out = {};
				for (const k of keys) {
					out[table[Number(k.slice(1))]] = decodeValue(table[Number(x[k])]);
				}
			} else {
				out = x;
			}
		}
		inProgress.delete(x);
		cache.set(x, out);
		return out;
	}
	return {
		resolve: (index) => decodeValue(table[index]),
		table
	};
}

/** Fetch + parse a ChatGPT share link via its Remix loader endpoint. */
async function fetchChatGptShare(url) {
	const shareId = extractChatGptShareId(url);
	if (shareId === null) throw new Error("无法识别的 ChatGPT 分享链接（需要 https://chatgpt.com/share/… 或 chat.openai.com/share/…）");
	const response = await fetch(`https://chatgpt.com/share/${shareId}.data`, {
		headers: CHATGPT_BROWSER_HEADERS,
		signal: AbortSignal.timeout(45000)
	});
	if (response.status === 403 || response.status === 404) {
		throw new Error(`ChatGPT 分享数据返回 ${response.status}（链接可能已失效，或该地区无法访问；请确认代理/VPN 已开启）`);
	}
	if (!response.ok) throw new Error(`ChatGPT 分享数据返回 HTTP ${response.status}`);
	const body = await response.text();
	const firstJson = splitFirstJson(body);
	if (firstJson === null) throw new Error("ChatGPT 分享数据格式无法识别（可能已改版）");

	let table;
	try {
		table = JSON.parse(firstJson);
	} catch {
		throw new Error("ChatGPT 分享数据解析失败（可能已改版）");
	}
	if (!Array.isArray(table)) throw new Error("ChatGPT 分享数据格式异常");

	const lcIndex = table.indexOf("linear_conversation");
	if (lcIndex < 0) throw new Error("分享数据里没有对话内容（该会话可能被删除或未公开）");
	const decoder = createRemixDecoder(table);
	const nodes = decoder.resolve(lcIndex + 1);

	let title = "";
	const titleIndex = table.indexOf("pageTitle");
	if (titleIndex >= 0 && typeof table[titleIndex + 1] === "string") title = table[titleIndex + 1];

	const messages = [];
	const imageMsgs = []; // { role, text, hexes: [] } 记录哪些消息带了图(sediment file)
	let imageTotal = 0;
	for (const node of Array.isArray(nodes) ? nodes : []) {
		const message = node && node.message;
		if (!message) continue;
		const role = message.author && message.author.role;
		const content = message.content || {};
		const parts = Array.isArray(content.parts) ? content.parts : [];
		const textParts = [];
		const imageHexes = [];
		for (const part of parts) {
			if (typeof part === "string") textParts.push(part);
			else if (part && typeof part === "object" && typeof part.text === "string") textParts.push(part.text);
			else if (part && typeof part === "object" && Array.isArray(part.content)) {
				for (const inner of part.content) {
					if (inner && typeof inner === "object" && typeof inner.text === "string") textParts.push(inner.text);
					else if (typeof inner === "string") textParts.push(inner);
					else {
						// 图片 part：找 sediment://file_<hex>（仅当识别出 hex 才计入图片数，
						// 避免把普通 tool 调用 part 虚增成“有图”）
						const s = inner && typeof inner === "object" ? JSON.stringify(inner) : "";
						const mm = s.match(/file_([0-9a-f]{24,32})/);
						if (mm) {
							imageHexes.push(mm[1]);
							imageTotal++;
						}
					}
				}
			} else {
				const s = part && typeof part === "object" ? JSON.stringify(part) : "";
				const mm = s.match(/file_([0-9a-f]{24,32})/);
				if (mm) {
					imageHexes.push(mm[1]);
					imageTotal++;
				}
			}
		}
		const text = textParts.join("\n").trim();
		if (text || imageHexes.length) {
			messages.push({ role, content: text });
			imageMsgs.push({ role, text, hexes: imageHexes });
		}
	}
	// 过滤 ChatGPT 分享里的非 user/assistant 消息（系统/工具提示），避免把
	// “image generation cancelled”这类内部错误当对话内容、或污染后续提炼。
	// 注意：ChatGPT 现在的分享格式把 AI 生成的图片挂在 tool 消息上（DALL-E
	// 工具结果），所以带图的 tool/system 消息的 hex 必须保留进图片追踪，
	// 只是它们的文本不进对话正文。
	const systemNoiseRe = /the (?:above )?image generation task was cancelled|could not be generated|was unable to generate|is incomplete|The output of this plugin was redacted|we experienced an error/i;
	const filteredMessages = [];
	const filteredImageMsgs = [];
	for (let i = 0; i < messages.length; i++) {
		const m = messages[i];
		const role = String(m.role || "");
		const img = imageMsgs[i] || { role, text: String(m.content || ""), hexes: [] };
		if (role !== "user" && role !== "assistant") {
			// 对话正文跳过 system/tool，但带图的 tool 消息（AI 生成图）保留 hex 用于抓图
			if (img.hexes.length) filteredImageMsgs.push(img);
			continue;
		}
		const c = String(m.content || "");
		if (systemNoiseRe.test(c)) {
			// 系统错误/取消提示文本不保留，但它带的图（若有）仍应保留
			if (img.hexes.length) filteredImageMsgs.push(img);
			continue;
		}
		filteredMessages.push({ role, content: c });
		filteredImageMsgs.push(img);
	}
	messages.length = 0;
	filteredMessages.forEach((m) => messages.push(m));
	imageMsgs.length = 0;
	filteredImageMsgs.forEach((m) => imageMsgs.push(m));
	if (messages.length === 0) throw new Error("分享数据里没有可提取的文字内容");

	// 图片取舍（AI 语义分类 + 程序确定性执行）：
	// ① 抓取全部图片（临时，用于看图描述）
	// ② 豆包视觉模型逐张写内容描述
	// ③ 主模型（DeepSeek）对「每条用户反馈」做语义分类（approve/extend/modify/negate/uncertain）
	//    + 分配修改链 lineageId；只输出 图片标识+证据+置信度，不输出去留
	// ④ lib/judge.js 按四条规则确定性计算每张图 keep/drop
	// **只返回保留的图**（废图不落盘）。分类结果按对话哈希缓存，重复导入不漂移。
	let images = [];
	let imageSummary = "";
	let acceptedNone = false;
	if (imageTotal > 0) {
		let captured = [];
		try {
			captured = await captureChatGptImages(`https://chatgpt.com/share/${shareId}`, 30, null);
		} catch (error) {
			captured = []; // 抓不到图不阻断文字总结
		}
		if (captured.length > 0) {
			const cfg = await readSharedConfig();
			const visionModel = String(cfg.visionModel || "").trim();
			const visionKey = String(cfg.visionKey || "").trim() || String(cfg.apiKey || "").trim();
			const visionProviders = {
				ark: "https://ark.cn-beijing.volces.com/api/v3",
				deepseek: "https://api.deepseek.com",
				moonshot: "https://api.moonshot.cn/v1",
				dashscope: "https://dashscope.aliyuncs.com/compatible-mode/v1",
				openai: "https://api.openai.com/v1",
				zhipu: "https://open.bigmodel.cn/api/paas/v4"
			};
			const visionBase = String(cfg.visionBase || "").trim();
			const resolvedVisionBase = visionBase || visionProviders[String(cfg.visionProvider || "").trim()] || "";
			// ② 看图描述（失败则无描述，分类靠上下文）
			const hexToDesc = new Map();
			if (visionModel && resolvedVisionBase && visionKey) {
				const { altTexts } = await describeDownloadedImages(captured, { visionModel, resolvedVisionBase, visionKey });
				captured.forEach((c, i) => { if (altTexts[i + 1]) hexToDesc.set(c.hex, altTexts[i + 1]); });
			}
			// ③ AI 语义分类（带缓存）
			const contexts = buildImageContexts(imageMsgs);
			const cacheKey = createHash("sha1").update(String(body) + "|" + captured.map((c) => c.hex).join(",")).digest("hex").slice(0, 16);
			const cls = contexts.length > 0
				? await cachedClassify(contexts, hexToDesc, { title, cfg, cacheKey })
				: null;
			if (cls) {
				// ④ 程序确定性执行
				const lineageMap = new Map((cls.images || []).map((i) => [i.imageId, i.lineageId]));
				const repMap = computeReplacementMap(contexts.map((c) => ({
					imageId: c.imageId,
					msgOrder: c.msgOrder,
					lineageId: lineageMap.get(c.imageId) || `lineage-${c.imageId}`
				})));
				const inputs = contexts.map((ctx) => ({
					imageId: ctx.imageId,
					isReference: false,
					relations: (cls.feedbacks || [])
						.filter((f) => f.imageId === ctx.imageId)
						.map((f) => ({ relation: f.relation, evidence: f.evidence, confidence: f.confidence })),
					feedbackTexts: ctx.feedbackEvents.map((e) => e.userText),
					replacementImageIds: repMap.get(ctx.imageId) || []
				}));
				const verdicts = applyKeepDropRules(inputs);
				const idToHex = new Map(contexts.map((c) => [c.imageId, c.hex]));
				const keepHex = new Set(verdicts.filter((v) => v.keep).map((v) => idToHex.get(v.imageId)).filter(Boolean));
				images = captured.filter((c) => keepHex.has(c.hex)).map((c) => c.dataUrl);
				const dropCount = captured.length - images.length;
				imageSummary = `AI 按对话反馈判断：保留 ${images.length} 张、排除 ${dropCount} 张（草稿/参考图）`;
				acceptedNone = images.length === 0;
			} else {
				// 分类不可用（无模型配置/调用失败/输出无法解析）→ 保守全保留（宁可多留）
				imageSummary = `图片分类不可用，保守保留全部 ${captured.length} 张`;
				images = captured.map((c) => c.dataUrl);
			}
		}
	}

	return {
		title: title || "ChatGPT 分享对话",
		bot: "ChatGPT",
		messageCount: messages.length,
		imageCount: imageTotal,
		imageSaved: images.length,
		imageRejected: imageTotal - images.length,
		imageSummary,
		acceptedNone,
		images,
		messages
	};
}

/**
 * 根据对话消息顺序判断哪些图是最终被采纳的：
 * - 用户自己上传的参考图（role=user 且带图）默认不算生成结果，不抓。
 * - AI 生成图后，若紧接着的用户消息包含“重画/重做/调整/换/改/不要/不行/不对/不满意”
 *   等否定语义，说明这张被否掉；同一轮里反复重画的，只保留该轮最后一张。
 * 规则较宽（宁可保留也不误删），返回被采纳图片的 sediment hex 集合。
 * @param {{role:string,text:string,hexes:string[]}} imageMsgs
 * @returns {Set<string>}
 */
function pickAcceptedImageHexes(imageMsgs) {
	// 只匹配「明确否定/明确重做」语义，避免把“换背景/换口味/延伸/更可爱”这类
	// 正向迭代请求误判成否定。单字“换/改/调/再/多/少”一律不作为否定依据。
	// 注意：仅在 AI 语义分类不可用时作保守兜底（只处理强否定）。
	const rejectRe = /重画|重做|重给|重新调|重新生成|重新按指令|重来|再来一(版|张|次)|不行|还是不行|不太行|不对|不太对|感觉不对|不好|不太好|不好看|难看|不满意|不喜欢|有问题|画错了|画错|三个手|三只手|去掉|删掉|换掉|不要这个|不要这(种|版)|不要背景|这版(不行|不好|废了)|again|try again|not (this|that|one)|remove|drop (it|this)|looks? wrong|no good|ugly/i;
	const accepted = new Set();
	const thread = []; // 连续 AI 生成图划分一轮
	const order = [];
	for (const msg of imageMsgs) {
		if (msg.role === "user") {
			if (msg.hexes.length) {
				// 用户上传的都是参考输入，不视为输出
			}
			// 用户消息带否定 → 之前那轮 AI 生成的图全部作废（只留每轮最后一张已在写回时处理）
			continue;
		}
		// assistant 带图
		if (msg.hexes.length) {
			thread.push(msg);
		}
	}
	// 简化但稳妥的策略：只在没有“后续否定”的情况下保留最后一张；这里先全量标记，
	// 再在下面按“是否被后续否定”剔除。
	// 重新扫描：对每个 assistant 带图消息，检查其后是否存在用户否定消息（在它之后、下一个 assistant 带图之前）。
	const indices = [];
	imageMsgs.forEach((m, i) => { if (m.role !== "user" && m.hexes.length) indices.push(i); });
	for (let k = 0; k < indices.length; k++) {
		const i = indices[k];
		const msg = imageMsgs[i];
		// 该生成图后、下一个生成图前，是否出现用户否定
		const nextGen = k + 1 < indices.length ? indices[k + 1] : imageMsgs.length;
		let rejectedAfter = false;
		for (let j = i + 1; j < nextGen; j++) {
			if (imageMsgs[j].role === "user" && rejectRe.test(imageMsgs[j].text)) {
				rejectedAfter = true;
				break;
			}
		}
		if (!rejectedAfter) {
			msg.hexes.forEach((h) => accepted.add(h));
		}
	}
	return accepted;
}

/** 主模型厂商 Base URL（图片取舍判断用；与 serverDistill 的厂商表保持一致）。 */
const SB2B_JUDGE_BASES = {
	ark: "https://ark.cn-beijing.volces.com/api/v3",
	deepseek: "https://api.deepseek.com",
	moonshot: "https://api.moonshot.cn/v1",
	dashscope: "https://dashscope.aliyuncs.com/compatible-mode/v1",
	zhipu: "https://open.bigmodel.cn/api/paas/v4"
};

//#region AI 语义分类层（AI 只分类，去留由 lib/judge.js 确定性执行）

/** 主模型调用器（温度 0，保证分类尽量稳定）；配置不完整时返回 null。 */
function mainModelChat(cfg) {
	const provider = String((cfg && cfg.provider) || "ark");
	const apiKey = String((cfg && cfg.apiKey) || "").trim();
	const model = String((cfg && cfg.model) || "").trim();
	const base = provider === "custom"
		? String((cfg && cfg.baseCustom) || "").trim()
		: (SB2B_JUDGE_BASES[provider] || SB2B_JUDGE_BASES.ark);
	if (!apiKey || !model || !base) return null;
	return (messages, extra) => forwardChatCompletion({ base, apiKey, model, messages, temperature: 0, ...(extra || {}) });
}

/** 宽松解析 LLM 输出中的 JSON 对象（容忍 ```json 包裹 / 前后杂文字）。 */
function parseJsonLoose(raw) {
	const s = String(raw || "").trim();
	const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
	const body = fence ? fence[1] : s;
	// 从每个 { 依次尝试：括号匹配后 JSON.parse，返回第一个成功对象
	// （模型可能先输出思考文字，真正的 JSON 在后面）
	for (let start = 0; start < body.length; start++) {
		if (body[start] !== "{") continue;
		let depth = 0, inStr = false, esc = false, end = -1;
		for (let i = start; i < body.length; i++) {
			const ch = body[i];
			if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
			if (ch === '"') inStr = true;
			else if (ch === "{") depth++;
			else if (ch === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
		}
		if (end < 0) break;
		try {
			const parsed = JSON.parse(body.slice(start, end));
			if (parsed && typeof parsed === "object") return parsed;
		} catch { /* try next */ }
	}
	return null;
}

/**
 * 从解析后的消息流构建「图片上下文」（AI 分类输入）。
 * 每张 AI 生成图：prevUserText + assistText + feedbackEvents[]（按时间顺序多条）。
 * 用户上传的参考图（role=user 带图）不在此列。
 * @returns Array<{ imageId, hex, msgOrder, prevUserText, assistText, feedbackEvents:[{userText,userIdx}] }>
 */
function buildImageContexts(imageMsgs, maxFeedbackEvents = 5) {
	const contexts = [];
	let order = 0;
	for (let i = 0; i < imageMsgs.length; i++) {
		const m = imageMsgs[i];
		if (!Array.isArray(m.hexes) || !m.hexes.length) continue;
		if (m.role === "user") continue;
		order++;
		let prevUser = "";
		for (let j = i - 1; j >= 0; j--) {
			if (imageMsgs[j].role === "user" && String(imageMsgs[j].text || "").trim()) { prevUser = String(imageMsgs[j].text).trim(); break; }
		}
		let assist = "";
		for (let j = i + 1; j < imageMsgs.length; j++) {
			if (imageMsgs[j].role === "assistant" && String(imageMsgs[j].text || "").trim()) { assist = String(imageMsgs[j].text).trim(); break; }
		}
		const events = [];
		for (let j = i + 1; j < imageMsgs.length && events.length < maxFeedbackEvents; j++) {
			if (imageMsgs[j].role === "user" && String(imageMsgs[j].text || "").trim()) {
				events.push({ userText: String(imageMsgs[j].text).trim(), userIdx: j });
			}
		}
		contexts.push({
			imageId: `img-${order}`,
			hex: m.hexes[0],
			msgOrder: order,
			prevUserText: prevUser,
			assistText: assist,
			feedbackEvents: events
		});
	}
	return contexts;
}

/**
 * AI 语义分类：对每张图分配 lineageId（同一设计修改链），对每条用户反馈分类
 * （approve/extend/modify/negate/uncertain）+ 原文证据 + 置信度。不输出去留。
 * @returns { images:[{imageId,lineageId}], feedbacks:[{imageId,feedbackIdx,relation,evidence,confidence}] } | null
 */
async function classifyImages(contexts, hexToDesc, { title, cfg }) {
	const chat = mainModelChat(cfg);
	if (!chat || !Array.isArray(contexts) || contexts.length === 0) return null;
	const BATCH = 10;
	const CHAT_MAX_TOKENS = 16384; // 分类模型常先输出思考过程，需要足够配额再输出 JSON
	const imagesOut = [];
	const feedbacksOut = [];
	for (let start = 0; start < contexts.length; start += BATCH) {
		const chunk = contexts.slice(start, start + BATCH);
		const blocks = chunk.map((ctx) => {
			const desc = hexToDesc.get(ctx.hex) ? hexToDesc.get(ctx.hex) : "（无法识别）";
			const evs = ctx.feedbackEvents.length
				? ctx.feedbackEvents.map((e) => `    [反馈#${e.userIdx}] ${e.userText.slice(0, 160)}`).join("\n")
				: "    （无后续反馈）";
			return [
				`图 ${ctx.imageId}：`,
				`  内容描述：${desc}`,
				ctx.prevUserText ? `  用户此前：${ctx.prevUserText.slice(0, 120)}` : "",
				ctx.assistText ? `  助手说明：${ctx.assistText.slice(0, 120)}` : "",
				`  用户反馈：`,
				evs
			].filter(Boolean).join("\n");
		});
		const prompt = [
			`对话标题：${title || ""}`,
			`以下是这段对话中出现的 ${chunk.length} 张 AI 生成图（按出现顺序编号）。每张图给出：内容描述、生成背景、助手说明、其后的用户反馈（[反馈#N] N 为消息序号）。`,
			"",
			blocks.join("\n\n"),
			"",
			"请完成两件事：",
			"1. 【修改链】为每张图分配 lineageId（短字符串）：同一设计的连续修改版本（换背景/改颜色/重做这张）归同一 lineage；新口味、延伸设计、其他任务归不同 lineage。",
			"2. 【反馈分类】对每条用户反馈，判断它相对「它前面最近的那张图」的关系，取值：",
			"   approve=明确认可当前图（这个好/就用这个/喜欢）；",
			"   extend=基于当前图延伸/做新变体（根据这个延伸/再做一个X味的）；",
			"   modify=在认可基础上做局部调整（换背景/改颜色/更可爱/只要产品…，但没说不行）；",
			"   negate=明确否定或要求重做这张图（不要这张/这版不行/重画这张/需要和上面的设计保持风格一致/风格不一致要修正）；",
			"   uncertain=无法确定（模棱两可一律 uncertain，宁可 uncertain）；**与图片本身无关的反馈**（下载/操作/格式等技术问题）也归 uncertain",
			"   evidence 必须是用户原话的连续片段（逐字引用，不要概括）；confidence 0~1。",
			"",
			"判定示例（务必遵守）：",
			"· 用户说「需要和上面的设计保持风格一致」或「需要和这个风格保持一致，主要是口味元素颜色的调整」→ 都是 negate（要求重做/修正当前图，即使语气温和）",
			"· 用户说「可以，再根据这个延伸其他口味」/「做葡萄味的」/「再做一个草莓味的」→ extend（基于当前图延伸，当前图保留）",
			"· 用户说「我只要产品本身的图…包装更可爱一点」→ modify（在认可基础上调整，没说不行）",
			"· 用户说「为什么无法下载」等与图片内容无关的技术反馈 → uncertain（保留）",
			"",
			"**禁止输出任何思考过程/解释/推理，直接输出 JSON 结果**，不要任何其他文字：",
			'{ "images": [{"imageId":"img-1","lineageId":"A"}], "feedbacks": [{"imageId":"img-1","feedbackIdx":5,"relation":"extend","evidence":"...","confidence":0.9}] }'
		].join("\n");
		let raw = "";
		try {
			raw = String(await chat([
				{ role: "system", content: "你是图片语义分析助手。**直接输出 JSON 结果，禁止任何思考过程、解释或多余文字**，严格按用户要求的格式。" },
				{ role: "user", content: prompt }
			], { max_tokens: CHAT_MAX_TOKENS }) || "").trim();
		} catch {
			return null;
		}
		const parsed = parseJsonLoose(raw);
		if (!parsed || !Array.isArray(parsed.images) || !Array.isArray(parsed.feedbacks)) return null;
		imagesOut.push(...parsed.images);
		feedbacksOut.push(...parsed.feedbacks);
	}
	return { images: imagesOut, feedbacks: feedbacksOut };
}

/** 分类结果按「对话内容哈希」缓存到本机（重复导入同一链接不漂移；不进仓库）。 */
async function cachedClassify(contexts, hexToDesc, { title, cfg, cacheKey }) {
	const cacheDir = join(dshHome(), "plugins", "second-brain", "judge-cache");
	if (cacheKey) {
		try {
			const raw = await readFile(join(cacheDir, cacheKey + ".json"), "utf8");
			const cached = JSON.parse(raw);
			if (cached && Array.isArray(cached.images) && Array.isArray(cached.feedbacks)) return cached;
		} catch { /* miss */ }
	}
	const result = await classifyImages(contexts, hexToDesc, { title, cfg });
	if (result && cacheKey) {
		try {
			await mkdir(cacheDir, { recursive: true });
			await writeFile(join(cacheDir, cacheKey + ".json"), JSON.stringify(result), "utf8");
		} catch { /* 缓存失败不影响流程 */ }
	}
	return result;
}

//#endregion

/** 探测并加载本机可用的 puppeteer-core（不同安装目录随机替换，需动态解析）。 */
async function loadPuppeteerCore() {
	let puppeteer;
	try {
		puppeteer = (await import("puppeteer-core")).default;
	} catch { /* fall through */ }
	if (puppeteer && puppeteer.launch) return puppeteer;
	const { createRequire } = await import("node:module");
	const cur = createRequire(import.meta.url);
	const resolvers = [];
	try { resolvers.push(() => cur.resolve("puppeteer-core")); } catch { /* noop */ }
	const { glob } = await import("node:fs/promises");
	try {
		for await (const p of glob(join(homedir(), ".npm/_npx/*/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js"))) {
			resolvers.push(() => p);
		}
	} catch { /* noop */ }
	const home = process.env.HOME || homedir();
	for (const p of [
		`${home}/.dsh/profiles/web/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js`,
		`${home}/.dsh/profiles/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js`
	]) {
		try { if (await import("node:fs").then((m) => m.existsSync(p))) resolvers.push(() => p); } catch { /* noop */ }
	}
	for (const get of resolvers) {
		try {
			const resolved = get();
			const mod = await import("file://" + resolved);
			const candidate = mod.default || mod;
			if (candidate && candidate.launch) { puppeteer = candidate; break; }
		} catch { /* try next */ }
	}
	return puppeteer;
}

/** 常用本机浏览器可执行路径。 */
async function findBrowserExecutable() {
	const candidates = [
		"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/Applications/Chromium.app/Contents/MacOS/Chromium"
	];
	const { existsSync: es } = await import("node:fs");
	return candidates.find((c) => es(c));
}

/**
 * 用本机无头浏览器打开 ChatGPT 分享页，抓取对话图片（oaiusercontent.com 的
 * 带签名 URL 需要浏览器渲染生成，服务端直连拿不到），返回 base64 data URL 数组。
 * 依赖本机已安装的 Microsoft Edge/Google Chrome + puppeteer-core（dsh web 环境自带）。
 */
async function captureChatGptImages(shareUrl, maxCount = 12, acceptedHexes = null) {
	let puppeteer = await loadPuppeteerCore();
	if (!puppeteer || !puppeteer.launch) return [];
	const executablePath = await findBrowserExecutable();
	if (!executablePath) return [];

	const allowed = acceptedHexes && acceptedHexes.size ? acceptedHexes : null; // null=不限
	const seenFiles = new Set();
	const uniqUrls = new Map();
	// 每个 URL(i.currentSrc/src) 的主文件 id 用于和 sediment hex 对账去重。
	// 兼容三种形态：/files/<uuid>/(raw|…)、/file-<uuid>?、blob 存储路径。
	const fileHexOf = (u) => {
		if (typeof u !== "string") return null;
		const m = u.match(/[\/]files\/([0-9a-f-]{24,})/i)
			|| u.match(/[\/]file-([0-9a-f-]{24,})/i)
			|| u.match(/[\/](?:dalle|img|images)\/([0-9a-f-]{20,})/i);
		if (!m) return null;
		const hex = m[1].replace(/-/g, "");
		return hex.length >= 24 ? hex : null;
	};
	let browser;
	try {
		browser = await puppeteer.launch({
			executablePath,
			headless: "new",
			args: ["--no-sandbox", "--disable-gpu", "--no-zygote", "--disable-setuid-sandbox"]
		});
		const page = await browser.newPage();
		await page.goto(shareUrl, { waitUntil: "networkidle2", timeout: 60000 }).catch(() => {});
		await new Promise((r) => setTimeout(r, 6000));

		// 轮询等待对话图片真正渲染（懒加载/网络慢时可能需要一段时间），最多等 40s；
		// 有些加载只出现静态资源、没有对话图，这种算失败，稍后整体重试。
		const collectDomUrls = async () => {
			for (let y = 0; y < 12000; y += 900) {
				await page.evaluate((yy) => window.scrollTo(0, yy), y).catch(() => {});
				await new Promise((r) => setTimeout(r, 350));
			}
			await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
			return page.evaluate(() =>
				[...document.querySelectorAll("img")]
					.map((i) => i.currentSrc || i.src)
					.filter((s) => s && /^https?:/i.test(s)) || []);
		};
		let domUrls = await collectDomUrls();
		// 对话图特征：oaiusercontent 或 images.openai.com 的图片
		const looksLikeConvImg = (u) => /oaiusercontent|images\.openai\.com/i.test(u);
		if (!domUrls.some(looksLikeConvImg)) {
			// 等图片出现，最长 40s
			for (let w = 0; w < 13 && !domUrls.some(looksLikeConvImg); w++) {
				await new Promise((r) => setTimeout(r, 3000));
				domUrls = await collectDomUrls();
			}
		}
		if (!domUrls.some(looksLikeConvImg)) {
			// 仍无对话图：重新加载页面再试一次（偶发渲染失败）
			await page.goto(shareUrl, { waitUntil: "networkidle2", timeout: 60000 }).catch(() => {});
			await new Promise((r) => setTimeout(r, 10000));
			domUrls = await collectDomUrls();
		}

		// 只收集页面最终渲染出来的 <img>（已采纳/展示中的图），再按 allowlist 过滤、去重。
		// 不再硬编码 oaiusercontent 域名：收集所有 http(s) 图片，交给 fileHexOf + allowlist 判定。
		// 不用 response 拦截，避免把加载后又隐藏的被否 draft 也算进来。
		for (const u of domUrls) {
			const hex = fileHexOf(u);
			if (!hex) continue;
			if (seenFiles.has(hex)) continue;
			if (allowed && !allowed.has(hex)) continue; // 被否的图不抓
			seenFiles.add(hex);
			uniqUrls.set(u, true);
		}

		const out = [];
		for (const u of uniqUrls.keys()) {
			if (out.length >= maxCount) break;
			const hex = fileHexOf(u);
			try {
				const dataUrl = await page.evaluate(async (url) => {
					const r = await fetch(url);
					if (!r.ok) throw new Error(r.status);
					const blob = await r.blob();
					// 画布重编码压缩（最长边 1280、JPEG 0.85、白底合成防透明黑化）：
					// 1.7MB PNG → ~200-400KB JPEG，视觉调用与附件体积都大幅下降。
					// 压缩失败（非浏览器/跨域/解码异常）则退回原始 base64。
					try {
						if (typeof createImageBitmap === "function") {
							const bmp = await createImageBitmap(blob);
							const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
							const w = Math.max(1, Math.round(bmp.width * scale));
							const h = Math.max(1, Math.round(bmp.height * scale));
							const canvas = document.createElement("canvas");
							canvas.width = w;
							canvas.height = h;
							const ctx = canvas.getContext("2d");
							ctx.fillStyle = "#ffffff";
							ctx.fillRect(0, 0, w, h);
							ctx.drawImage(bmp, 0, 0, w, h);
							const jpeg = canvas.toDataURL("image/jpeg", 0.85);
							bmp.close();
							if (jpeg && jpeg.length > 0) return jpeg;
						}
					} catch { /* fall through to raw */ }
					const b = await blob.arrayBuffer();
					let bin = "";
					const arr = new Uint8Array(b);
					for (let j = 0; j < arr.length; j++) bin += String.fromCharCode(arr[j]);
					const type = r.headers.get("content-type") || "image/png";
					return `data:${type};base64,${btoa(bin)}`;
				}, u);
				if (dataUrl) out.push({ dataUrl, hex });
			} catch { /* skip this url */ }
		}
		return out;
	} catch (e) {
		console.error('[captureChatGptImages] failed:', e && e.message ? e.message : String(e));
		return [];
	} finally {
		if (browser) await browser.close().catch(() => {});
	}
}
//#endregion

/** Host plugin body: register the same-origin Doubao share proxy + LLM proxy routes. */
function apply(ctx) {
	ctx.inject(["webServer"], (httpCtx) => {
		httpCtx.effect(() => httpCtx.webServer.register({
			kind: "exact",
			path: "/api/second-brain/doubao-share",
			handler: async (req, res) => {
				if (req.method !== "POST") {
					sendJson(res, 405, { ok: false, error: "仅支持 POST" });
					return;
				}
				try {
					const payload = await readJsonBody(req);
					const shareId = extractShareId(payload.share_id ?? payload.url ?? "");
					if (shareId === null) {
						sendJson(res, 400, { ok: false, error: "无法识别豆包分享链接，请粘贴形如 https://www.doubao.com/thread/xxx 的链接" });
						return;
					}
					const result = await fetchDoubaoShare(shareId);
					sendJson(res, 200, { ok: true, ...result });
				} catch (error) {
					sendJson(res, 200, { ok: false, error: String(error && error.message ? error.message : error) });
				}
			}
		}), "second-brain: doubao share proxy");
		httpCtx.effect(() => httpCtx.webServer.register({
			kind: "exact",
			path: "/api/second-brain/llm",
			handler: async (req, res) => {
				if (req.method !== "POST") {
					sendJson(res, 405, { ok: false, error: "仅支持 POST" });
					return;
				}
				try {
					const content = await forwardChatCompletion(await readJsonBody(req));
					sendJson(res, 200, { ok: true, content });
				} catch (error) {
					sendJson(res, 200, { ok: false, error: String(error && error.message ? error.message : error) });
				}
			}
		}), "second-brain: llm proxy");
		httpCtx.effect(() => httpCtx.webServer.register({
			kind: "exact",
			path: "/api/second-brain/harness-sessions",
			handler: async (req, res) => {
				if (req.method !== "GET") {
					sendJson(res, 405, { ok: false, error: "仅支持 GET" });
					return;
				}
				try {
					const sessions = await listHarnessSessions();
					sendJson(res, 200, { ok: true, sessions });
				} catch (error) {
					sendJson(res, 200, { ok: false, error: String(error && error.message ? error.message : error) });
				}
			}
		}), "second-brain: harness sessions list");
		httpCtx.effect(() => httpCtx.webServer.register({
			kind: "exact",
			path: "/api/second-brain/harness-session",
			handler: async (req, res) => {
				if (req.method !== "POST") {
					sendJson(res, 405, { ok: false, error: "仅支持 POST" });
					return;
				}
				try {
					const { sessionId } = await readJsonBody(req);
					if (!sessionId || typeof sessionId !== "string") {
						sendJson(res, 400, { ok: false, error: "缺少 sessionId" });
						return;
					}
					const result = await readHarnessSession(sessionId);
					sendJson(res, 200, { ok: true, ...result });
				} catch (error) {
					sendJson(res, 200, { ok: false, error: String(error && error.message ? error.message : error) });
				}
			}
		}), "second-brain: harness session content");
		httpCtx.effect(() => httpCtx.webServer.register({
			kind: "exact",
			path: "/api/second-brain/chatgpt-share",
			handler: async (req, res) => {
				if (req.method !== "POST") {
					sendJson(res, 405, { ok: false, error: "仅支持 POST" });
					return;
				}
				try {
					const payload = await readJsonBody(req);
					const result = await fetchChatGptShare(payload.url ?? "");
					sendJson(res, 200, { ok: true, ...result });
				} catch (error) {
					sendJson(res, 200, { ok: false, error: String(error && error.message ? error.message : error) });
				}
			}
		}), "second-brain: chatgpt share proxy");
		httpCtx.effect(() => httpCtx.webServer.register({
			kind: "exact",
			path: "/api/second-brain/kimi-share",
			handler: async (req, res) => {
				if (req.method !== "POST") {
					sendJson(res, 405, { ok: false, error: "仅支持 POST" });
					return;
				}
				try {
					const payload = await readJsonBody(req);
					const result = await fetchKimiShare(payload.url ?? "");
					sendJson(res, 200, { ok: true, ...result });
				} catch (error) {
					sendJson(res, 200, { ok: false, error: String(error && error.message ? error.message : error) });
				}
			}
		}), "second-brain: kimi share proxy");
		// DeepSeek / 通义 / 智谱 分享适配路由（通用 SPA 提取）。
		const genericShareRoutes = [
			["/api/second-brain/deepseek-share", fetchDeepSeekShare],
			["/api/second-brain/tongyi-share", fetchTongyiShare],
			["/api/second-brain/zhipu-share", fetchZhipuShare],
			["/api/second-brain/wenxin-share", fetchWenxinShare]
		];
		for (const [path, fn] of genericShareRoutes) {
			httpCtx.effect(() => httpCtx.webServer.register({
				kind: "exact",
				path,
				handler: async (req, res) => {
					if (req.method !== "POST") { sendJson(res, 405, { ok: false, error: "仅支持 POST" }); return; }
					try {
						const payload = await readJsonBody(req);
						const result = await fn(payload.url ?? "");
						sendJson(res, 200, { ok: true, ...result });
					} catch (error) {
						sendJson(res, 200, { ok: false, error: String(error && error.message ? error.message : error) });
					}
				}
			}), "second-brain: generic share proxy");
		}
		// Shared config: the GUI panel keeps this in sync so the browser
		// extension (and the server-side distill route) uses the same settings.
		httpCtx.effect(() => httpCtx.webServer.register({
			kind: "exact",
			path: "/api/second-brain/config",
			handler: async (req, res) => {
				try {
					if (req.method === "GET") {
						sendJson(res, 200, { ok: true, config: await readSharedConfig() });
						return;
					}
					if (req.method === "POST") {
						const body = await readJsonBody(req);
						const allowed = ["vaultPath", "folder", "provider", "apiKey", "model", "baseCustom", "style", "layout", "selfCheck", "tags", "visionModel", "visionKey", "visionProvider", "visionBase", "maxImages", "multimodal"];
						const next = { ...await readSharedConfig() };
						for (const key of allowed) {
							if (typeof body[key] === "string") next[key] = body[key];
						}
						await writeSharedConfig(next);
						sendJson(res, 200, { ok: true, config: next });
						return;
					}
					sendJson(res, 405, { ok: false, error: "仅支持 GET / POST" });
				} catch (error) {
					sendJson(res, 200, { ok: false, error: String(error && error.message ? error.message : error) });
				}
			}
		}), "second-brain: shared config");
		httpCtx.effect(() => httpCtx.webServer.register({
			kind: "exact",
			path: "/api/second-brain/write-note",
			handler: async (req, res) => {
				if (req.method !== "POST") {
					sendJson(res, 405, { ok: false, error: "仅支持 POST" });
					return;
				}
				try {
					const result = await serverWriteNote(await readJsonBody(req));
					sendJson(res, 200, { ok: true, ...result });
				} catch (error) {
					sendJson(res, 200, { ok: false, error: String(error && error.message ? error.message : error) });
				}
			}
		}), "second-brain: server note write");
		httpCtx.effect(() => httpCtx.webServer.register({
			kind: "exact",
			path: "/api/second-brain/delete-note",
			handler: async (req, res) => {
				if (req.method !== "POST") {
					sendJson(res, 405, { ok: false, error: "仅支持 POST" });
					return;
				}
				try {
					const result = await serverDeleteNote(await readJsonBody(req));
					sendJson(res, 200, { ok: true, ...result });
				} catch (error) {
					sendJson(res, 200, { ok: false, error: String(error && error.message ? error.message : error) });
				}
			}
		}), "second-brain: server note delete");
		httpCtx.effect(() => httpCtx.webServer.register({
			kind: "exact",
			path: "/api/second-brain/distill",
			handler: async (req, res) => {
				if (req.method !== "POST") {
					sendJson(res, 405, { ok: false, error: "仅支持 POST" });
					return;
				}
				try {
					const result = await serverDistill(await readJsonBody(req));
					sendJson(res, 200, { ok: true, ...result });
				} catch (error) {
					sendJson(res, 200, { ok: false, error: String(error && error.message ? error.message : error) });
				}
			}
		}), "second-brain: distill");
	});
}

export { apply, extractShareId, fetchDoubaoShare, forwardChatCompletion, listHarnessSessions, readHarnessSession, extractChatGptShareId, fetchChatGptShare, extractKimiShareId, parseKimiHydration, fetchKimiShare, fetchDeepSeekShare, fetchTongyiShare, fetchZhipuShare, fetchWenxinShare, readSharedConfig, writeSharedConfig, serverDistill, serverWriteNote, serverDeleteNote, downloadImageDataUrl, parseImageAltList, splitNoteByTopic, planArtifactTopics, generateOneArtifact, completeLongOutput, captureChatGptImages, pickAcceptedImageHexes };
