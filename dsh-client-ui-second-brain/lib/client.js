window.__ModuleLoader__.load({
	id: "dsh-client-ui-second-brain",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		const {
			useState,
			useEffect,
			useRef,
			useCallback,
			useMemo
		} = react;

		//#region styles
		const css = [
			/* ---- panel scaffolding ---- */
			".sb2b{font-family:var(--dsw-font-sans,-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif);color:var(--dsw-alias-label-primary,#1f2329);max-width:760px}",
			".sb2b h3{margin:0 0 4px;font-size:15px;font-weight:600}",
			".sb2b .sb2b-sub{color:var(--dsw-alias-label-caption,#9aa3ad);font-size:12px;line-height:1.6;margin:0 0 14px}",
			".sb2b .sb2b-card{border:1px solid var(--dsw-alias-divider,rgba(31,35,41,.08));border-radius:12px;padding:14px;margin-bottom:14px;background:var(--dsw-alias-container-bg,#fff)}",
			".sb2b .sb2b-card-title{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;margin:0 0 10px}",
			".sb2b .sb2b-sec{padding:10px 12px;border:1px solid var(--dsw-alias-divider,rgba(31,35,41,.12));border-radius:10px;margin-bottom:10px}",
			".sb2b .sb2b-sec-title{font-size:12px;font-weight:600;margin:0 0 8px;color:var(--dsw-alias-label-primary,#1f2329)}",
			".sb2b .sb2b-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}",
			".sb2b .sb2b-field{display:flex;flex-direction:column;gap:4px;min-width:0}",
			".sb2b .sb2b-field.sb2b-wide{grid-column:1/-1}",
			".sb2b label{font-size:12px;color:var(--dsw-alias-label-secondary,#5c6270)}",
			".sb2b input[type=text],.sb2b input[type=password],.sb2b select,.sb2b textarea{box-sizing:border-box;width:100%;font-size:13px;color:inherit;background:var(--dsw-alias-input-bg,#fff);border:1px solid var(--dsw-alias-divider-strong,rgba(31,35,41,.14));border-radius:8px;padding:7px 9px;outline:none}",
			".sb2b input:focus,.sb2b select:focus,.sb2b textarea:focus{border-color:#4e6ef2;box-shadow:0 0 0 2px rgba(78,110,242,.15)}",
			".sb2b textarea{resize:vertical;min-height:150px;line-height:1.55;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}",
			".sb2b .sb2b-tabs{display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap}",
			".sb2b .sb2b-tab{border:1px solid var(--dsw-alias-divider-strong,rgba(31,35,41,.14));background:transparent;color:var(--dsw-alias-label-secondary,#5c6270);font-size:12px;border-radius:999px;padding:4px 12px;cursor:pointer}",
			".sb2b .sb2b-tab.sb2b-active{background:#4e6ef2;border-color:#4e6ef2;color:#fff}",
			".sb2b .sb2b-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}",
			".sb2b .sb2b-btn{border:1px solid var(--dsw-alias-divider-strong,rgba(31,35,41,.14));background:var(--dsw-alias-interactive-bg,#fff);color:var(--dsw-alias-label-primary,#1f2329);font-size:13px;border-radius:8px;padding:7px 14px;cursor:pointer;font-weight:500}",
			".sb2b .sb2b-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}",
			".sb2b .sb2b-btn:disabled{opacity:.5;cursor:not-allowed}",
			".sb2b .sb2b-btn.sb2b-primary{background:#4e6ef2;border-color:#4e6ef2;color:#fff}",
			".sb2b .sb2b-btn.sb2b-primary:hover{background:#3d5ce6}",
			".sb2b .sb2b-btn.sb2b-ghost{background:transparent}",
			".sb2b .sb2b-save{display:flex;align-items:center;gap:10px;margin-top:10px;padding-top:10px;border-top:1px dashed var(--dsw-alias-divider-strong,rgba(31,35,41,.12))}",
			".sb2b .sb2b-meta{font-size:12px;color:var(--dsw-alias-label-caption,#9aa3ad)}",
			".sb2b .sb2b-status{font-size:12.5px;line-height:1.5;margin-top:10px;padding:8px 10px;border-radius:8px;white-space:pre-wrap}",
			".sb2b .sb2b-status.sb2b-ok{background:rgba(61,154,80,.1);color:#2f7d3e}",
			".sb2b .sb2b-status.sb2b-err{background:rgba(214,69,64,.09);color:#c0392b}",
			".sb2b .sb2b-status.sb2b-info{background:rgba(78,110,242,.08);color:#3d5ce6}",
			".sb2b .sb2b-history{list-style:none;margin:0;padding:0;max-height:220px;overflow:auto}",
			".sb2b .sb2b-history li{display:flex;align-items:center;gap:8px;padding:7px 2px;border-bottom:1px solid var(--dsw-alias-divider,rgba(31,35,41,.06));font-size:12.5px}",
			".sb2b .sb2b-history li:last-child{border-bottom:none}",
			".sb2b .sb2b-history .sb2b-h-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".sb2b .sb2b-h-del{border:none;background:transparent;color:var(--dsw-alias-label-caption,#9aa3ad);cursor:pointer;font-size:12px;padding:2px 6px;border-radius:6px}",
			".sb2b .sb2b-h-del:hover{background:rgba(214,69,64,.1);color:#c0392b}",
			".sb2b .sb2b-file{font-size:12px;color:var(--dsw-alias-label-caption,#9aa3ad)}",
			".sb2b .sb2b-vault{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px}",
			".sb2b .sb2b-badge{display:inline-block;font-size:11px;padding:2px 8px;border-radius:999px;background:rgba(78,110,242,.1);color:#3d5ce6}",
			".sb2b .sb2b-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:4px}",
			".sb2b-header-btn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:none;background:transparent;color:var(--dsw-alias-label-secondary,#5c6270);border-radius:8px;cursor:pointer;font-size:14px;line-height:1}",
			".sb2b-header-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#1f2329)}",
			".sb2b-header-btn:disabled{opacity:.5;cursor:wait}",
			".sb2b-list{max-height:300px;overflow:auto;display:flex;flex-direction:column;gap:6px;margin-top:2px}",
			".sb2b-list-item{display:flex;align-items:center;gap:8px;padding:7px 9px;border:1px solid var(--dsw-alias-divider,rgba(31,35,41,.08));border-radius:9px;font-size:12.5px;min-width:0}",
			".sb2b-list-item .sb2b-h-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".sb2b-mini-btn{border:1px solid var(--dsw-alias-divider-strong,rgba(31,35,41,.14));background:var(--dsw-alias-interactive-bg,#fff);color:var(--dsw-alias-label-secondary,#5c6270);font-size:12px;border-radius:7px;padding:3px 9px;cursor:pointer;flex:none}",
			".sb2b-mini-btn:hover{border-color:#4e6ef2;color:#4e6ef2}",
			".sb2b-mini-btn:disabled{opacity:.5;cursor:wait}",
			"@media (prefers-color-scheme:dark){.sb2b .sb2b-card{background:var(--dsw-alias-container-bg,#16181d);border-color:var(--dsw-alias-divider,rgba(255,255,255,.08))}.sb2b input[type=text],.sb2b input[type=password],.sb2b select,.sb2b textarea{background:var(--dsw-alias-input-bg,#1c1f26);border-color:var(--dsw-alias-divider-strong,rgba(255,255,255,.14))}.sb2b .sb2b-status.sb2b-ok{background:rgba(61,154,80,.15);color:#6fcf8a}.sb2b .sb2b-status.sb2b-err{background:rgba(214,69,64,.15);color:#ff8a85}.sb2b .sb2b-status.sb2b-info{background:rgba(78,110,242,.15);color:#8fa8ff}}"
		].join("");
		const tagId = "dsh-client-ui-second-brain/styles.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-client-ui-second-brain";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion

		//#region constants & storage helpers
		/**
		 * Built-in OpenAI-compatible providers. `base` is the OpenAI-compatible
		 * root (the plugin appends /chat/completions); `defaultModel` is a
		 * suggestion shown as the placeholder and used when no model is stored.
		 * The "custom" entry lets the user point at any OpenAI-compatible API.
		 */
		const PROVIDERS = [
			{ id: "ark", label: "火山方舟（豆包）", base: "https://ark.cn-beijing.volces.com/api/v3", defaultModel: "doubao-seed-1-6-flash-250828" },
			{ id: "deepseek", label: "DeepSeek", base: "https://api.deepseek.com", defaultModel: "deepseek-v4-flash" },
			{ id: "moonshot", label: "Kimi（Moonshot）", base: "https://api.moonshot.cn/v1", defaultModel: "moonshot-v1-8k" },
			{ id: "dashscope", label: "通义千问（DashScope）", base: "https://dashscope.aliyuncs.com/compatible-mode/v1", defaultModel: "qwen-plus" },
			{ id: "custom", label: "自定义（OpenAI 兼容）", base: "", defaultModel: "" }
		];
		const LS_PROVIDER = "sb2b:provider";
		const LS_KEYS = "sb2b:keys";
		const LS_MODELS = "sb2b:models";
		const LS_BASE_CUSTOM = "sb2b:baseCustom";
		// Legacy keys (v0.1.0) — migrated into the per-provider stores on first use.
		const LS_KEY = "sb2b:arkKey";
		const LS_MODEL = "sb2b:model";
		const LS_FOLDER = "sb2b:folder";
		const LS_LAYOUT = "sb2b:layout";
		const LS_SELFCHECK = "sb2b:selfCheck";
		const LS_DETAIL = "sb2b:detail";
		const LS_TAGS = "sb2b:tags";
		const LS_HISTORY = "sb2b:history";
		const LS_VAULT = "sb2b:vaultPath";
		const LS_VISION = "sb2b:visionModel";
		const LS_VISIONKEY = "sb2b:visionKey";
		const LS_VISIONPROV = "sb2b:visionProvider";
		const LS_VISIONBASE = "sb2b:visionBase";
		const LS_MAXIMG = "sb2b:maxImages";
		const LS_REQ = "sb2b:customReq";
		const LS_MULTIMODAL = "sb2b:multimodal";
		const IDB_DB = "dsh-second-brain";
		const IDB_STORE = "vault";
		const IDB_HANDLE = "vault-handle";
		const IDB_NAME = "vault-name";

		function lsGet(key, fallback) {
			try {
				const raw = localStorage.getItem(key);
				return raw === null ? fallback : JSON.parse(raw);
			} catch {
				return fallback;
			}
		}
		function lsSet(key, value) {
			try {
				localStorage.setItem(key, JSON.stringify(value));
			} catch {
				/* ignore */
			}
		}
		function idbGet() {
			return new Promise((resolve) => {
				try {
					if (!("indexedDB" in window)) return resolve(null);
					const req = indexedDB.open(IDB_DB, 1);
					req.onupgradeneeded = () => {
						if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE);
					};
					req.onsuccess = () => {
						const db = req.result;
						const tx = db.transaction(IDB_STORE, "readonly");
						const get = tx.objectStore(IDB_STORE).get(IDB_HANDLE);
						get.onsuccess = () => resolve(get.result || null);
						get.onerror = () => resolve(null);
					};
					req.onerror = () => resolve(null);
				} catch {
					resolve(null);
				}
			});
		}
		function idbPut(value) {
			return new Promise((resolve) => {
				try {
					const req = indexedDB.open(IDB_DB, 1);
					req.onupgradeneeded = () => {
						if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE);
					};
					req.onsuccess = () => {
						const db = req.result;
						const tx = db.transaction(IDB_STORE, "readwrite");
						tx.objectStore(IDB_STORE).put(value, IDB_HANDLE);
						tx.oncomplete = () => resolve(true);
						tx.onerror = () => resolve(false);
					};
					req.onerror = () => resolve(false);
				} catch {
					resolve(false);
				}
			});
		}
		function formatDate(ts) {
			const d = new Date(ts || Date.now());
			const p = (n) => String(n).padStart(2, "0");
			return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
		}
		function slugify(text) {
			const s = String(text || "").trim().replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
			return s || "note";
		}
		function extractTitle(markdown, fallback) {
			const m = String(markdown || "").match(/^#\s+(.+)$/m);
			return m ? m[1].trim().slice(0, 80) : fallback || "未命名笔记";
		}
		//#endregion

		//#region LLM API — 已统一走服务端 /distill（统一管线 A）：
		// 提示词/分篇/续写/自检的单一事实源在 lib/index.js，浏览器端不再维护重复的提示词与直连逻辑。

		//#region share link import (doubao / chatgpt, same-origin proxies)
		async function fetchDoubaoShare(url) {
			const res = await fetch("/api/second-brain/doubao-share", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ url })
			});
			const json = await res.json().catch(() => ({ ok: false, error: "代理返回了无法解析的响应" }));
			return json;
		}

		async function fetchChatGptShare(url) {
			const res = await fetch("/api/second-brain/chatgpt-share", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ url })
			});
			const json = await res.json().catch(() => ({ ok: false, error: "代理返回了无法解析的响应" }));
			return json;
		}

		/** Route a share URL to the right adapter; returns { ok, ... } like the proxies. */
		async function fetchShareByUrl(url) {
			const trimmed = (url || "").trim();
			if (/doubao\.com\/thread\//i.test(trimmed)) return fetchDoubaoShare(trimmed);
			if (/chatgpt\.com\/share\/|chat\.openai\.com\/share\//i.test(trimmed)) return fetchChatGptShare(trimmed);
			if (/kimi\.com\/share\/|kimi\.moonshot\.(cn|ai)\/share\//i.test(trimmed)) return fetchKimiShareClient(trimmed);
			if (/chat\.deepseek\.com\/(share|s)\//i.test(trimmed)) return genericShareClient(trimmed, "deepseek-share");
			if (/tongyi|qianwen|aliyun/i.test(trimmed)) return genericShareClient(trimmed, "tongyi-share");
			if (/chatglm|bigmodel|zhipu/i.test(trimmed)) return genericShareClient(trimmed, "zhipu-share");
			if (/yiyan|wenxin|chat\.baidu|mr\.baidu\.com\/r\//i.test(trimmed)) return genericShareClient(trimmed, "wenxin-share");
			return { ok: false, error: "暂不支持这个链接。目前支持的分享链接：豆包、ChatGPT、Kimi、DeepSeek、通义千问、智谱、文心一言。其它平台请装「通用提炼」浏览器扩展，点网页右下角 ✨ 一键提炼。" };
		}

		async function genericShareClient(url, route) {
			const res = await fetch(`/api/second-brain/${route}`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ url })
			});
			return await res.json().catch(() => ({ ok: false, error: "本地代理响应无法解析" }));
		}

		async function fetchKimiShareClient(url) {
			const res = await fetch("/api/second-brain/kimi-share", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ url })
			});
			return await res.json().catch(() => ({ ok: false, error: "本地代理响应无法解析" }));
		}

		function transcriptFromMessages(messages, title, bot) {
			const lines = [];
			if (title) lines.push(`【对话标题】${title}`);
			if (bot) lines.push(`【对话助手】${bot}`);
			lines.push("");
			for (const m of messages) {
				const content = String(m.content || "").trim();
				if (!content) continue;
				if (m.role === "tool") {
					lines.push("🔧 " + content);
				} else {
					const who = m.role === "user" ? "用户" : bot || "AI";
					lines.push(who + "：" + content);
				}
				lines.push("");
			}
			return lines.join("\n").trim();
		}
		//#endregion

		//#region harness sessions + shared distill pipeline + toast
		async function fetchHarnessSessionList() {
			const res = await fetch("/api/second-brain/harness-sessions");
			return await res.json().catch(() => ({ ok: false, error: "本地代理响应无法解析" }));
		}

		async function fetchHarnessSession(sessionId) {
			const res = await fetch("/api/second-brain/harness-session", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ sessionId })
			});
			return await res.json().catch(() => ({ ok: false, error: "本地代理响应无法解析" }));
		}

		/** Read the current provider config from localStorage (with legacy migration). */
		function readConfig() {
			const provider = lsGet(LS_PROVIDER, "ark");
			const keys = lsGet(LS_KEYS, {});
			const models = lsGet(LS_MODELS, {});
			const baseCustom = lsGet(LS_BASE_CUSTOM, "");
			const legacyKey = lsGet(LS_KEY, "");
			const legacyModel = lsGet(LS_MODEL, "");
			if (legacyKey && !keys.ark) keys.ark = legacyKey;
			if (legacyModel && !models.ark) models.ark = legacyModel;
			const providerInfo = PROVIDERS.find((p) => p.id === provider) || PROVIDERS[0];
			return {
				provider,
				providerInfo,
				effectiveBase: provider === "custom" ? baseCustom.trim() : providerInfo.base,
				currentKey: (keys[provider] || "").trim(),
				currentModel: (models[provider] || "").trim(),
				folder: lsGet(LS_FOLDER, "AI 第二大脑"),
				layout: lsGet(LS_LAYOUT, "auto"),
				detail: lsGet(LS_DETAIL, "brief"),
				selfCheck: lsGet(LS_SELFCHECK, true),
				tags: lsGet(LS_TAGS, "AI对话"),
				vaultPath: lsGet(LS_VAULT, "")
			};
		}

		/** Write a note through the harness host (needs a synced vault path). */
		async function serverWriteNote({ vaultPath, folder, fileName, content }) {
			const res = await fetch("/api/second-brain/write-note", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ vaultPath, folder, fileName, content })
			});
			const json = await res.json().catch(() => ({ ok: false, error: "本地代理响应无法解析" }));
			return json;
		}

		/** Push the current config to the host so the browser extension can use it. */
		async function syncConfigToServer(cfg) {
			const res = await fetch("/api/second-brain/config", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					vaultPath: cfg.vaultPath || "",
					folder: cfg.folder || "AI 第二大脑",
					provider: cfg.provider || "ark",
					apiKey: cfg.currentKey || "",
					model: cfg.currentModel || "",
					baseCustom: cfg.effectiveBase && cfg.provider === "custom" ? cfg.effectiveBase : "",
					layout: cfg.layout || "auto",
					selfCheck: cfg.selfCheck ? "true" : "false",
					tags: cfg.tags || "AI对话",
					visionModel: cfg.visionModel || "",
					visionKey: cfg.visionKey || "",
					visionProvider: cfg.visionProvider || "ark",
					visionBase: cfg.visionBase || "",
					multimodal: cfg.multimodal ? "true" : "false",
					maxImages: String(Math.max(0, Number(cfg.maxImages) || 0))
				})
			});
			return await res.json().catch(() => ({ ok: false, error: "本地代理响应无法解析" }));
		}

		/**
		 * One-click pipeline shared by the header「✨提炼」button and the panel:
		 * harness session → 服务端 /distill（统一管线 A：同一套提示词/分篇/续写/
		 * 自检，与扩展、粘贴入口完全一致）→ markdown note → Obsidian。
		 * @param sessionId - full harness session id.
		 * @param cfg - optional config (defaults to localStorage).
		 * @returns { title, fileName, markdown, saved, multiple?, paths? } —
		 *   saved 为 null 表示未配置库路径（服务端只返回 markdown，未写库）。
		 */
		async function distillHarnessSession(sessionId, cfg) {
			const c = cfg || readConfig();
			if (!c.currentKey) throw new Error(`请先在「设置 → AI 第二大脑」里为「${c.providerInfo.label}」填写 API Key`);
			if (!c.currentModel) throw new Error(`请为「${c.providerInfo.label}」填写模型 ID（如 ${c.providerInfo.defaultModel || "你的模型 ID"}）`);
			if (c.provider === "custom" && !c.effectiveBase) throw new Error("请填写自定义服务的 Base URL");

			// 以服务端共享配置为准：只有服务端已保存库路径时才写库（本地输入框可能
			// 填了但没点「保存到本机」）；否则降级为只返回 markdown（预览/复制/下载）。
			const srv = await fetch("/api/second-brain/config").then((r) => r.json().catch(() => null)).catch(() => null);
			const vaultPath = srv && srv.ok && srv.config && srv.config.vaultPath ? String(srv.config.vaultPath).trim() : "";
			const write = !!vaultPath;
			const resp = await fetch("/api/second-brain/distill", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					sessionId,
					layout: c.layout || "auto",
					detail: c.detail || "brief",
					selfCheck: c.selfCheck !== false,
					customReq: lsGet(LS_REQ, ""),
					write
				})
			});
			const json = await resp.json().catch(() => ({ ok: false, error: "本地代理响应无法解析" }));
			if (!json.ok) throw new Error("提炼失败：" + (json.error || "未知错误"));

			if (json.multiple && json.multiple > 1 && Array.isArray(json.paths)) {
				// 多篇：已按课题拆分成独立文件（仅写库路径）。
				return {
					title: json.title,
					fileName: json.fileName,
					markdown: "",
					multiple: json.multiple,
					paths: json.paths,
					saved: write ? { rootName: vaultPath, fileName: json.fileName, server: true } : null
				};
			}
			return {
				title: json.title,
				fileName: json.fileName,
				markdown: json.markdown || "",
				saved: write ? { rootName: vaultPath, fileName: json.fileName, server: true } : null
			};
		}

		/** Floating toast for feedback outside the settings panel (header button). */
		function showToast(text, kind) {
			try {
				const el = document.createElement("div");
				el.className = "sb2b sb2b-toast";
				el.textContent = text;
				const dark = document.documentElement && document.documentElement.classList.contains("dark");
				el.style.cssText = [
					"position:fixed", "right:18px", "bottom:18px", "z-index:9999", "max-width:400px",
					"padding:11px 15px", "border-radius:11px", "font-size:13px", "line-height:1.55",
					"white-space:pre-wrap", "box-shadow:0 10px 34px rgba(0,0,0,.2)",
					"background:" + (dark ? "#1c1f26" : "#ffffff"),
					"color:" + (dark ? "#e8eaed" : "#1f2329"),
					"border-left:3px solid " + (kind === "ok" ? "#3d9a50" : kind === "err" ? "#d64540" : "#4e6ef2")
				].join(";");
				document.body.appendChild(el);
				setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .3s"; }, 4200);
				setTimeout(() => { el.remove(); }, 4600);
			} catch {
				/* ignore */
			}
		}
		//#endregion

		//#region file system access (Obsidian vault)
		function supportsFsAccess() {
			return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
		}

		async function pickVault() {
			if (!supportsFsAccess()) throw new Error("当前浏览器不支持「选择目录」（需要 Chrome / Edge），请改用「复制笔记」或「下载 .md」按钮。");
			const handle = await window.showDirectoryPicker({ id: "sb2b-vault", mode: "readwrite" });
			return handle;
		}

		async function writeNoteToVault(handle, folderName, fileName, content) {
			const root = folderName && folderName.trim().length > 0
				? await handle.getDirectoryHandle(folderName.trim(), { create: true })
				: handle;
			const fileHandle = await root.getFileHandle(fileName, { create: true });
			const writable = await fileHandle.createWritable();
			await writable.write(content);
			await writable.close();
			return { rootName: root.name, fileName };
		}
		//#endregion

		//#region main panel component
		/**
		 * 「AI 第二大脑」settings section. Self-contained: config, input,
		 * summarize via Ark, write into the Obsidian vault, archive history.
		 */
		function SecondBrainPanel() {
			// Provider selection + per-provider stores (legacy sb2b:arkKey /
			// sb2b:model values are migrated into the "ark" bucket on first use).
			const [provider, setProvider] = useState(() => lsGet(LS_PROVIDER, "ark"));
			const [keys, setKeys] = useState(() => {
				const legacy = lsGet(LS_KEY, "");
				const stored = lsGet(LS_KEYS, {});
				if (legacy && !stored.ark) stored.ark = legacy;
				return stored;
			});
			const [models, setModels] = useState(() => {
				const legacy = lsGet(LS_MODEL, "");
				const stored = lsGet(LS_MODELS, {});
				if (legacy && !stored.ark) stored.ark = legacy;
				return stored;
			});
			const [baseCustom, setBaseCustom] = useState(() => lsGet(LS_BASE_CUSTOM, ""));
			const [folder, setFolder] = useState(() => lsGet(LS_FOLDER, "AI 第二大脑"));
			const [layout, setLayout] = useState(() => lsGet(LS_LAYOUT, "auto"));
			const [detail, setDetail] = useState(() => lsGet(LS_DETAIL, "brief"));
			const [selfCheck, setSelfCheck] = useState(() => lsGet(LS_SELFCHECK, true));
			const [tags, setTags] = useState(() => lsGet(LS_TAGS, "AI对话"));
			const [tab, setTab] = useState("paste");
			const [pasteText, setPasteText] = useState("");
			const [doubaoUrl, setDoubaoUrl] = useState("");
			const [fileText, setFileText] = useState("");
			const [fileName, setFileName] = useState("");
			const [meta, setMeta] = useState({ title: "", bot: "", source: "" });
			const [vaultName, setVaultName] = useState(() => lsGet("sb2b:vaultName", ""));
			const [vaultPath, setVaultPath] = useState(() => lsGet(LS_VAULT, ""));
			const [visionModel, setVisionModel] = useState(() => lsGet(LS_VISION, ""));
			const [visionKey, setVisionKey] = useState(() => lsGet(LS_VISIONKEY, ""));
			const [visionProvider, setVisionProvider] = useState(() => lsGet(LS_VISIONPROV, "ark"));
			const [visionBase, setVisionBase] = useState(() => lsGet(LS_VISIONBASE, ""));
			const [visionEnabled, setVisionEnabled] = useState(() => !!lsGet(LS_VISION, ""));
			const useVisionText = visionEnabled
				? "已开启：含图片的对话会用视觉模型识别图片内容"
				: "未开启（默认）：有图则只保存图片、不识别内容（纯文字对话无影响）";
			const [maxImages, setMaxImages] = useState(() => lsGet(LS_MAXIMG, 50));
			const [customReq, setCustomReq] = useState(() => lsGet(LS_REQ, ""));
			const [serverSynced, setServerSynced] = useState(false);
			const [importImages, setImportImages] = useState([]);
			const [importedMessages, setImportedMessages] = useState(null);
			const [busy, setBusy] = useState("");
			const [status, setStatus] = useState({ kind: "info", text: "选择一个模型服务商并填写 API Key，然后粘贴 / 导入 / 用豆包分享链接录入对话，点击「总结并归档」。笔记会写入你选择的 Obsidian 目录。" });
			const [history, setHistory] = useState(() => lsGet(LS_HISTORY, []));
			const [harnessSessions, setHarnessSessions] = useState([]);
			const [harnessLoading, setHarnessLoading] = useState(false);
			const [harnessBusyId, setHarnessBusyId] = useState("");
			const vaultHandleRef = useRef(null);

			// Derive the selected provider's effective config.
			const providerInfo = PROVIDERS.find((p) => p.id === provider) || PROVIDERS[0];
			const effectiveBase = provider === "custom" ? baseCustom.trim() : providerInfo.base;
			const currentKey = keys[provider] || "";
			const currentModel = models[provider] || "";

			// Persist settings.
			useEffect(() => { lsSet(LS_PROVIDER, provider); }, [provider]);
			useEffect(() => { lsSet(LS_KEYS, keys); }, [keys]);
			useEffect(() => { lsSet(LS_MODELS, models); }, [models]);
			useEffect(() => { lsSet(LS_BASE_CUSTOM, baseCustom); }, [baseCustom]);
			useEffect(() => { lsSet(LS_FOLDER, folder); }, [folder]);
			useEffect(() => { lsSet(LS_LAYOUT, layout); }, [layout]);
			useEffect(() => { lsSet(LS_DETAIL, detail); }, [detail]);
			useEffect(() => { lsSet(LS_SELFCHECK, selfCheck); }, [selfCheck]);
			useEffect(() => { lsSet(LS_TAGS, tags); }, [tags]);
			useEffect(() => { lsSet(LS_HISTORY, history); }, [history]);
			useEffect(() => { lsSet(LS_VAULT, vaultPath); }, [vaultPath]);
			useEffect(() => { lsSet(LS_VISION, visionModel); }, [visionModel]);
			useEffect(() => { lsSet(LS_VISIONKEY, visionKey); }, [visionKey]);
			useEffect(() => { lsSet(LS_VISIONPROV, visionProvider); }, [visionProvider]);
			useEffect(() => { lsSet(LS_VISIONBASE, visionBase); }, [visionBase]);
			useEffect(() => { lsSet(LS_MAXIMG, maxImages); }, [maxImages]);
			useEffect(() => { lsSet(LS_REQ, customReq); }, [customReq]);

			// Restore a previously granted vault handle.
			useEffect(() => {
				let alive = true;
				idbGet().then((handle) => {
					if (!alive || !handle) return;
					vaultHandleRef.current = handle;
					setVaultName(lsGet("sb2b:vaultName", handle.name || ""));
				});
				return () => { alive = false; };
			}, []);

			// Pull the host-side shared config once (vault path etc.).
			useEffect(() => {
				let alive = true;
				fetch("/api/second-brain/config").then((res) => res.json().catch(() => null)).then((result) => {
					if (!alive || !result || !result.ok || !result.config) return;
					const cfg = result.config;
					if (cfg.vaultPath) setVaultPath(cfg.vaultPath);
					if (cfg.folder) setFolder(cfg.folder);
					if (cfg.provider) setProvider(cfg.provider);
					if (cfg.layout) setLayout(cfg.layout);
					if (cfg.selfCheck !== undefined) setSelfCheck(cfg.selfCheck === "true" || cfg.selfCheck === true);
					if (cfg.tags) setTags(cfg.tags);
					if (cfg.visionModel) setVisionModel(cfg.visionModel);
					if (cfg.visionKey) setVisionKey(cfg.visionKey);
					if (cfg.visionProvider) setVisionProvider(cfg.visionProvider);
					if (cfg.visionBase) setVisionBase(cfg.visionBase);
					if (cfg.visionModel) setVisionEnabled(true);
					if (cfg.maxImages !== undefined && cfg.maxImages !== "") setMaxImages(Number(cfg.maxImages) || 0);
					if (cfg.model && !lsGet(LS_MODELS, {})[cfg.provider || "ark"]) {
						setModels((prev) => ({ ...prev, [cfg.provider || "ark"]: cfg.model }));
					}
					if (cfg.apiKey && !lsGet(LS_KEYS, {})[cfg.provider || "ark"]) {
						setKeys((prev) => ({ ...prev, [cfg.provider || "ark"]: cfg.apiKey }));
					}
					setServerSynced(true);
				});
				return () => { alive = false; };
			}, []);

			// Load the harness session list once.
			useEffect(() => {
				let alive = true;
				setHarnessLoading(true);
				fetchHarnessSessionList().then((result) => {
					if (!alive) return;
					if (result.ok && Array.isArray(result.sessions)) setHarnessSessions(result.sessions);
					else if (result.error) setStatusErr("读取 Harness 会话列表失败：" + result.error);
				}).finally(() => { if (alive) setHarnessLoading(false); });
				return () => { alive = false; };
			}, []);

			const currentContent = useMemo(() => {
				if (tab === "paste") return pasteText;
				if (tab === "file") return fileText;
				return pasteText; // doubao import lands in the paste area
			}, [tab, pasteText, fileText]);

			const setStatusOk = (text) => setStatus({ kind: "ok", text });
			const setStatusErr = (text) => setStatus({ kind: "err", text });
			const setStatusInfo = (text) => setStatus({ kind: "info", text });

			const onImportShare = useCallback(async () => {
				const url = doubaoUrl.trim();
				if (!url) { setStatusErr("请先粘贴分享链接。"); return; }
				setBusy("fetching");
				setStatusInfo("正在通过本地代理获取分享内容…");
				try {
					const result = await fetchShareByUrl(url);
					if (!result.ok) { setStatusErr("获取失败：" + (result.error || "未知错误")); return; }
					const realBot = result.bot || "AI";
					let source = "分享链接";
					if (/chatgpt/i.test(realBot)) source = "ChatGPT 分享链接";
					else if (/kimi/i.test(realBot)) source = "Kimi 分享链接";
					else if (/deepseek/i.test(realBot)) source = "DeepSeek 分享链接";
					else if (/通义|qianwen|tongyi/i.test(realBot)) source = "通义分享链接";
					else if (/智谱|glm|chatglm/i.test(realBot)) source = "智谱分享链接";
					else if (/文心|wenxin|yiyan/i.test(realBot)) source = "文心分享链接";
					const t = transcriptFromMessages(result.messages, result.title, realBot);
					setPasteText(t);
					setImportedMessages(result.messages || null);
					setImportImages((result.images || []).filter((u) => typeof u === "string" && u.length > 0));
					setMeta({ title: result.title || "", bot: realBot, source });
					setTab("paste");
					const imgCap = Math.max(0, Number(lsGet(LS_MAXIMG, 50)) || 0);
					const imgCount = (result.images && result.images.length) || 0;
					const imgNote = imgCount
						? (imgCap === 0
							? `，已抓取 ${imgCount} 张图片，但「图片保存上限」设为 0（不保存图片），仅总结文字`
							: `，已抓取 ${imgCount} 张图片；按「图片保存上限 ${imgCap}」，归档时将嵌入前 ${Math.min(imgCount, imgCap)} 张（多图对话如需全部保留，请先在设置里调高上限）`)
						: (result.imageCount ? `，该对话含 ${result.imageCount} 张图片，但本机抓取图片失败（需本机装有 Edge/Chrome 且能访问 ChatGPT 分享页），本次仅总结文字` : "");
					setStatusOk(`已获取《${result.title}》，共 ${result.messageCount} 条消息（${t.length} 字符）${imgNote}。可编辑后总结。`);
				} catch (error) {
					setStatusErr("获取失败：" + String(error && error.message ? error.message : error));
				} finally {
					setBusy("");
				}
			}, [doubaoUrl]);

			const onImportFile = useCallback((file) => {
				if (!file) return;
				const reader = new FileReader();
				reader.onload = () => {
					const raw = String(reader.result || "");
					setFileName(file.name);
					// Best effort: if the file is JSON shaped like a messages array, prettify it.
					let text = raw;
					try {
						const parsed = JSON.parse(raw);
						if (parsed && Array.isArray(parsed.messages)) {
							text = parsed.messages.map((m) => (m.role === "user" ? "用户" : "AI") + "：" + (m.content || "")).join("\n\n");
						} else if (parsed && parsed.data && parsed.data.message_snapshot && Array.isArray(parsed.data.message_snapshot.message_list)) {
							const list = parsed.data.message_snapshot.message_list;
							text = list.map((m) => {
								let c = m.content || "";
								if (m.content_type === 1) { try { c = JSON.parse(c).text || c; } catch { /* keep */ } }
								return (Number(m.user_type) === 1 ? "用户" : "AI") + "：" + c;
							}).join("\n\n");
							const info = parsed.data.share_info || {};
							setMeta((prev) => ({ ...prev, title: prev.title || info.share_name || "" }));
						} else {
							text = raw;
						}
					} catch {
						text = raw;
					}
					setFileText(text);
					setTab("file");
					setStatusOk(`已导入 ${file.name}（${text.length} 字符）。`);
				};
				reader.readAsText(file);
			}, []);

			const selectVault = useCallback(async () => {
				try {
					const handle = await pickVault();
					vaultHandleRef.current = handle;
					setVaultName(handle.name);
					lsSet("sb2b:vaultName", handle.name);
					await idbPut(handle);
					setStatusOk(`已选择 Obsidian 目录：${handle.name}，笔记将写入其下的「${folder || "AI 第二大脑"}」子目录。`);
				} catch (error) {
					if (error && error.name === "AbortError") return;
					setStatusErr("选择目录失败：" + String(error && error.message ? error.message : error));
				}
			}, [folder]);

			const onSyncConfig = useCallback(async () => {
				if (!vaultPath.trim()) { setStatusErr("请先填写 Obsidian 库的绝对路径（如 /Users/你的用户名/Documents/Obsidian 库）。"); return; }
				setBusy("syncing");
				setStatusInfo("正在保存配置到本机（供豆包浏览器扩展使用）…");
				try {
					const cfg = readConfig();
					cfg.vaultPath = vaultPath.trim();
					cfg.visionModel = visionEnabled ? visionModel.trim() : "";
					cfg.visionKey = visionKey.trim();
					cfg.visionProvider = visionProvider.trim();
					cfg.visionBase = visionBase.trim();
					cfg.multimodal = "false";
					cfg.maxImages = String(Math.max(0, Number(maxImages) || 0));
					const result = await syncConfigToServer(cfg);
					if (!result.ok) { setStatusErr("保存失败：" + (result.error || "未知错误")); return; }
					setServerSynced(true);
					lsSet(LS_VAULT, vaultPath.trim());
					const imgMode = visionEnabled
						? (visionModel.trim() ? `视觉模型 ${visionModel.trim()}` : "已开启视觉但未填模型 ID")
						: "未开启视觉识别（有图则仅保存图片）";
					setStatusOk(`已保存到本机：${vaultPath.trim()}（${cfg.providerInfo.label} / ${cfg.currentModel || cfg.providerInfo.defaultModel}；${imgMode}）。`);
				} catch (error) {
					setStatusErr("保存失败：" + String(error && error.message ? error.message : error));
				} finally {
					setBusy("");
				}
			}, [vaultPath, visionModel, visionKey, visionProvider, visionBase, visionEnabled, maxImages]);

			const [showManual, setShowManual] = useState(null);

			const doArchive = useCallback(async () => {
				const content = currentContent.trim();
				if (!content) { setStatusErr("请先录入对话内容（粘贴 / 导入文件 / 豆包分享链接）。"); return; }
				if (!vaultPath.trim()) { setStatusErr("请先填写 Obsidian 库绝对路径并「保存到本机」，当前默认走服务端直写。"); return; }

				// 统一走服务端 /distill（统一管线）：多课题对话自动按课题拆成独立文件，
				// 单主题对话照常单篇；提示词/分篇/续写/自检都在服务端同一套逻辑里完成。
				const messages = importedMessages && importedMessages.length
					? importedMessages
					: [{ role: "user", content }];
				setBusy("summarizing");
				setStatusInfo("正在分析对话并提炼（多课题会自动分篇）…");
				try {
					const resp = await fetch("/api/second-brain/distill", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							title: meta.title || "未命名对话",
							source: meta.source || "手动录入",
							bot: meta.bot || "AI",
							messages,
							images: importImages && importImages.length ? importImages : [],
							customReq: customReq ? customReq.trim() : "",
							layout: layout || "auto",
							detail: detail || "brief",
							selfCheck: selfCheck !== false
						})
					});
					const json = await resp.json().catch(() => ({ ok: false, error: "本地代理响应无法解析" }));
					if (!json.ok) { setStatusErr("提炼失败：" + (json.error || "未知错误")); return; }
					if (json.multiple && json.multiple > 1 && Array.isArray(json.paths)) {
						const entry = { fileName: json.multiple + " 篇", title: `已分篇 ${json.multiple} 课`, date: formatDate(Date.now()), source: meta.source || "手动录入", savedAt: Date.now() };
						setHistory((prev) => [entry, ...prev].slice(0, 80));
						const imgHint = json.savedImages ? `\n📷 附图 ${json.savedImages} 张已集中保存在 00-索引.md` : "";
						setStatusOk(`✅ 已归档为 ${json.multiple} 篇独立笔记：\n${json.paths.map((p) => "· " + p).join("\n")}${imgHint}`);
					} else {
						const entry = { fileName: json.fileName, title: json.title, date: formatDate(Date.now()), source: meta.source || "手动录入", savedAt: Date.now() };
						setHistory((prev) => [entry, ...prev].slice(0, 80));
						setStatusOk(`已归档（服务端直写）→ ${json.path}\n标题：《${json.title}》`);
					}
				} catch (error) {
					setStatusErr("提炼失败：" + String(error && error.message ? error.message : error));
				} finally {
					setBusy("");
				}
			}, [vaultPath, currentContent, importedMessages, importImages, meta, customReq, layout, detail, selfCheck]);

			const copyNote = useCallback(() => {
				if (!showManual) return;
				navigator.clipboard.writeText(showManual)
					.then(() => setStatusOk("笔记已复制到剪贴板。"))
					.catch(() => setStatusErr("复制失败，请手动选择文本复制。"));
			}, [showManual]);

			const downloadNote = useCallback(() => {
				if (!showManual) return;
				const title = extractTitle(showManual, "note");
				const blob = new Blob([showManual], { type: "text/markdown;charset=utf-8" });
				const a = document.createElement("a");
				a.href = URL.createObjectURL(blob);
				a.download = `${formatDate(Date.now())}-${slugify(title)}.md`;
				document.body.appendChild(a);
				a.click();
				setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
				setStatusOk("笔记已下载。");
			}, [showManual]);

			const removeHistory = useCallback(async (index, entry) => {
				// 联动删除 Obsidian 里的对应笔记文件。
				try {
					const cfg = readConfig();
					const vault = (vaultPath && vaultPath.trim()) || cfg.vaultPath || "";
					if (vault && entry && entry.fileName) {
						await fetch("/api/second-brain/delete-note", {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({ vaultPath: vault, folder: cfg.folder || "AI 第二大脑", fileName: entry.fileName })
						}).catch(() => null);
					}
				} catch {
					/* 尽力而为，删不了文件也先从列表移除 */
				}
				setHistory((prev) => prev.filter((_, i) => i !== index));
			}, [vaultPath]);

			const onImportHarness = useCallback(async (sessionId) => {
				if (!sessionId) return;
				setBusy("fetching");
				setStatusInfo("正在读取 Harness 会话…");
				try {
					const result = await fetchHarnessSession(sessionId);
					if (!result.ok) { setStatusErr("读取失败：" + (result.error || "未知错误")); return; }
					const t = transcriptFromMessages(result.messages, result.title, "DeepSeek Harness");
					if (!t) { setStatusErr("该会话没有可提炼的文字内容。"); return; }
					setPasteText(t);
					setMeta({ title: result.title || "", bot: "DeepSeek Harness", source: "DeepSeek Harness 会话" });
					setTab("paste");
					setStatusOk(`已载入《${result.title}》，共 ${result.messageCount} 条消息${result.truncated ? "（较长，已截取最近部分）" : ""}，${t.length} 字符。可编辑后总结。`);
				} catch (error) {
					setStatusErr("读取失败：" + String(error && error.message ? error.message : error));
				} finally {
					setBusy("");
				}
			}, []);

			const onDistillHarness = useCallback(async (sessionId) => {
				if (!sessionId) return;
				setHarnessBusyId(sessionId);
				setStatusInfo("正在提炼该 Harness 会话并归档…");
				try {
					const cfg = readConfig();
					const result = await distillHarnessSession(sessionId, cfg);
					if (result.multiple && result.multiple > 1 && Array.isArray(result.paths)) {
						setShowManual("");
						setStatusOk(`✅ 已归档为 ${result.multiple} 篇独立笔记：\n${result.paths.map((p) => "· " + p).join("\n")}`);
						return;
					}
					if (result.saved) {
						const entry = { fileName: result.fileName, title: result.title, date: formatDate(Date.now()), source: "DeepSeek Harness 会话", savedAt: Date.now() };
						setHistory((prev) => [entry, ...prev].slice(0, 80));
						setShowManual(result.markdown);
						setStatusOk(`已归档 → ${result.saved.rootName}/${result.fileName}\n标题：《${result.title}》`);
					} else {
						setShowManual(result.markdown);
						setStatusOk(`已生成《${result.title}》笔记（未配置 Obsidian 库路径，未写盘）。可用「复制笔记」或「下载 .md」保存；或在设置里填好库路径后重试。`);
					}
				} catch (error) {
					setStatusErr(String(error && error.message ? error.message : error));
				} finally {
					setHarnessBusyId("");
				}
			}, []);

			const tabs = [
				["paste", "📋 粘贴文本"],
				["file", "📄 导入文件"],
				["doubao", "🔗 分享链接"],
				["harness", "📚 Harness 会话"]
			];

			return react.createElement("div", { className: "sb2b" },
				react.createElement("h3", null, "🧠 AI 第二大脑"),
				react.createElement("p", { className: "sb2b-sub" }, "把每天和各种 AI 的对话提炼成可复盘的 Markdown 笔记，写入 Obsidian 库。"),
				// ---- config ----
				react.createElement("div", { className: "sb2b-card" },
					react.createElement("p", { className: "sb2b-card-title" }, "⚙️ 模型设置"),
					react.createElement("p", { className: "sb2b-meta", style: { marginBottom: 10 } }, "总结时用「①主模型」写笔记文字。只有在对话里含有图片、且开启了「②视觉模型」时，才会额外用视觉模型识别图片内容可加入笔记——纯文字对话不需要视觉模型。"),
					// ---- ① 主模型（必填） ----
					react.createElement("div", { className: "sb2b-sec" },
						react.createElement("p", { className: "sb2b-sec-title" }, "① 主模型 · 写笔记（必填）"),
						react.createElement("div", { className: "sb2b-grid" },
							react.createElement("div", { className: "sb2b-field" },
								react.createElement("label", null, "服务商"),
								react.createElement("select", { value: provider, onChange: (e) => setProvider(e.target.value) },
									PROVIDERS.map((p) =>
										react.createElement("option", { key: p.id, value: p.id }, p.label)
									)
								)
							),
							react.createElement("div", { className: "sb2b-field" },
								react.createElement("label", null, "模型 ID"),
								react.createElement("input", {
									type: "text",
									value: currentModel,
									onChange: (e) => setModels((prev) => ({ ...prev, [provider]: e.target.value })),
									placeholder: providerInfo.defaultModel || "例如 deepseek-v4-flash",
									spellCheck: false
								})
							),
							provider === "custom" && react.createElement("div", { className: "sb2b-field sb2b-wide" },
								react.createElement("label", null, "Base URL（OpenAI 兼容根地址，插件自动拼 /chat/completions）"),
								react.createElement("input", {
									type: "text",
									value: baseCustom,
									onChange: (e) => setBaseCustom(e.target.value),
									placeholder: "https://api.deepseek.com 或 https://api.moonshot.cn/v1",
									spellCheck: false
								})
							),
							react.createElement("div", { className: "sb2b-field sb2b-wide" },
								react.createElement("label", null, `${providerInfo.label} API Key`),
								react.createElement("input", {
									type: "password",
									value: currentKey,
									onChange: (e) => setKeys((prev) => ({ ...prev, [provider]: e.target.value })),
									placeholder: "sk-...",
									spellCheck: false
								})
							)
						)
					),
					// ---- ② 视觉模型（选填） ----
					react.createElement("div", { className: "sb2b-sec" },
						react.createElement("p", { className: "sb2b-sec-title" }, "② 视觉模型 · 看图（选填，仅含图对话用）"),
						react.createElement("div", { className: "sb2b-field sb2b-wide" },
							react.createElement("label", { style: { display: "flex", alignItems: "center", gap: 8, cursor: "pointer" } },
								react.createElement("input", { type: "checkbox", checked: visionEnabled, onChange: (e) => setVisionEnabled(e.target.checked) }),
								useVisionText
							)
						),
						visionEnabled && react.createElement("div", { className: "sb2b-grid" },
							react.createElement("div", { className: "sb2b-field" },
								react.createElement("label", null, "视觉模型服务商（不限定豆包，可任选）"),
								react.createElement("select", { value: visionProvider, onChange: (e) => setVisionProvider(e.target.value) },
									react.createElement("option", { value: "ark" }, "火山方舟（豆包）"),
									react.createElement("option", { value: "deepseek" }, "DeepSeek"),
									react.createElement("option", { value: "dashscope" }, "通义千问（DashScope）"),
									react.createElement("option", { value: "openai" }, "OpenAI"),
									react.createElement("option", { value: "zhipu" }, "智谱（ChatGLM）"),
									react.createElement("option", { value: "moonshot" }, "Kimi（Moonshot）"),
									react.createElement("option", { value: "custom" }, "自定义（OpenAI 兼容）")
								)
							),
							react.createElement("div", { className: "sb2b-field" },
								react.createElement("label", null, "视觉模型 ID"),
								react.createElement("input", { type: "text", value: visionModel, onChange: (e) => setVisionModel(e.target.value), placeholder: "如 deepseek-v4-flash-vision-exp / doubao-seed-1-6-vision-250815 / qwen3-vl-plus", spellCheck: false })
							),
							react.createElement("div", { className: "sb2b-field" },
								react.createElement("label", null, visionProvider === "custom" ? "视觉模型 Base URL（必须填）" : "视觉模型 API Key（不同服务商时必填，留空用主模型 Key）"),
								visionProvider === "custom"
									? react.createElement("input", { type: "text", value: visionBase, onChange: (e) => setVisionBase(e.target.value), placeholder: "https://…/v1（OpenAI 兼容地址）", spellCheck: false })
									: react.createElement("input", { type: "password", value: visionKey, onChange: (e) => setVisionKey(e.target.value), placeholder: "留空则用主模型 Key", spellCheck: false })
							),
							visionProvider === "custom" && react.createElement("div", { className: "sb2b-field" },
								react.createElement("label", null, "视觉模型 API Key"),
								react.createElement("input", { type: "password", value: visionKey, onChange: (e) => setVisionKey(e.target.value), placeholder: "key…", spellCheck: false })
							)
						)
					),
					// ---- 公共设置 ----
					react.createElement("div", { className: "sb2b-sec" },
						react.createElement("p", { className: "sb2b-sec-title" }, "笔记与图片设置"),
						react.createElement("div", { className: "sb2b-grid" },
							react.createElement("div", { className: "sb2b-field" },
								react.createElement("label", null, "版式偏好（默认，auto=自动识别）"),
								react.createElement("select", { value: layout, onChange: (e) => setLayout(e.target.value) },
									react.createElement("option", { value: "auto" }, "自动识别（推荐）"),
									react.createElement("option", { value: "vocab" }, "生词卡片式"),
									react.createElement("option", { value: "concept" }, "概念分层式"),
									react.createElement("option", { value: "task" }, "目标·过程·成效式"),
									react.createElement("option", { value: "artifact" }, "产物归档式"),
									react.createElement("option", { value: "review" }, "复盘式"),
									react.createElement("option", { value: "study" }, "学习笔记")
								)
							),
							react.createElement("div", { className: "sb2b-field" },
								react.createElement("label", null, "笔记版本"),
								react.createElement("select", { value: detail, onChange: (e) => setDetail(e.target.value) },
									react.createElement("option", { value: "brief" }, "精简版（只留结论）"),
									react.createElement("option", { value: "full" }, "完整版（加注意点/关键步骤）")
								)
							),
							react.createElement("div", { className: "sb2b-field" },
								react.createElement("label", { style: { display: "flex", alignItems: "center", gap: 8, cursor: "pointer" } },
									react.createElement("input", { type: "checkbox", checked: selfCheck, onChange: (e) => setSelfCheck(e.target.checked) }),
									"提炼后自检（对照原文查漏，发现遗漏自动重提炼一次）"
								)
							),
							react.createElement("div", { className: "sb2b-field" },
								react.createElement("label", null, "Obsidian 子目录名"),
								react.createElement("input", { type: "text", value: folder, onChange: (e) => setFolder(e.target.value), spellCheck: false })
							),
							react.createElement("div", { className: "sb2b-field" },
								react.createElement("label", null, "标签（逗号分隔）"),
								react.createElement("input", { type: "text", value: tags, onChange: (e) => setTags(e.target.value), spellCheck: false })
							),
							react.createElement("div", { className: "sb2b-field" },
								react.createElement("label", null, "来源标注（可选）"),
								react.createElement("input", { type: "text", value: meta.source, onChange: (e) => setMeta((prev) => ({ ...prev, source: e.target.value })), placeholder: "如：豆包 / ChatGPT / DeepSeek", spellCheck: false })
							),
							react.createElement("div", { className: "sb2b-field" },
								react.createElement("label", null, "图片保存上限（默认 50，0=不保存）"),
								react.createElement("input", { type: "text", value: String(maxImages), onChange: (e) => setMaxImages(e.target.value === "" ? "" : Number(e.target.value) || 0), placeholder: "50", spellCheck: false })
							)
						)
					),
					react.createElement("p", { className: "sb2b-meta", style: { marginTop: 8 } }, "提示：DeepSeek 写笔记用 deepseek-v4-flash（默认，快）或 deepseek-v4-pro；识别图片可用 deepseek-v4-flash-vision-exp。Kimi 用 moonshot-v1-8k 等；通义千问用 qwen-plus / qwen3-vl-plus 等。自定义服务可填任意 OpenAI 兼容地址。"),
					react.createElement("div", { className: "sb2b-save" },
						react.createElement("button", { type: "button", className: "sb2b-btn sb2b-primary", onClick: onSyncConfig, disabled: busy !== "" || !vaultPath.trim() }, busy === "syncing" ? "保存中…" : serverSynced ? "✓ 已保存到本机" : "💾 保存到本机（保存选择）"),
						react.createElement("span", { className: "sb2b-meta" }, serverSynced ? "配置已写入服务器，立即生效" : "切换模型 / 填 KEY / 选视觉模型后点这里写入服务器")
					)
				),
				// ---- vault ----
				react.createElement("div", { className: "sb2b-card" },
					react.createElement("p", { className: "sb2b-card-title" }, "📁 Obsidian 笔记目录"),
					react.createElement("div", { className: "sb2b-vault" },
						react.createElement("span", null, vaultName ? react.createElement("span", { className: "sb2b-badge" }, vaultName) : react.createElement("span", { className: "sb2b-meta" }, "尚未选择目录")),
						react.createElement("button", { type: "button", className: "sb2b-btn sb2b-ghost", onClick: selectVault, disabled: busy !== "" }, vaultName ? "更换目录" : "选择目录（浏览器授权）"),
						react.createElement("span", { className: "sb2b-meta" }, supportsFsAccess() ? "选择一次后浏览器会记住授权（Chrome / Edge）。" : "当前浏览器不支持目录授权，将提供复制 / 下载。")
					),
					react.createElement("div", { className: "sb2b-field sb2b-wide", style: { marginTop: 10 } },
						react.createElement("label", null, "Obsidian 库绝对路径（服务端直写，豆包网页扩展也用这个）"),
						react.createElement("input", { type: "text", value: vaultPath, onChange: (e) => { setVaultPath(e.target.value); setServerSynced(false); }, placeholder: "如 /Users/你的用户名/Documents/Obsidian 库", spellCheck: false, style: { flex: 1, minWidth: 240 } })
					)
				),
				// ---- input ----
				react.createElement("div", { className: "sb2b-card" },
					react.createElement("p", { className: "sb2b-card-title" }, "✍️ 录入对话记录"),
					react.createElement("div", { className: "sb2b-tabs" },
						tabs.map(([id, label]) =>
							react.createElement("button", { key: id, type: "button", className: "sb2b-tab" + (tab === id ? " sb2b-active" : ""), onClick: () => setTab(id) }, label)
						)
					),
					tab === "doubao" && react.createElement("div", { className: "sb2b-field sb2b-wide" },
						react.createElement("label", null, "粘贴分享链接（支持豆包 / ChatGPT / Kimi / DeepSeek / 通义千问 / 智谱 / 文心一言）"),
						react.createElement("div", { className: "sb2b-row" },
							react.createElement("input", { type: "text", value: doubaoUrl, onChange: (e) => setDoubaoUrl(e.target.value), placeholder: "doubao / chatgpt / kimi / deepseek / tongyi / glm / yiyan 分享链接", spellCheck: false, style: { flex: 1, minWidth: 240 } }),
							react.createElement("button", { type: "button", className: "sb2b-btn", onClick: onImportShare, disabled: busy !== "" }, busy === "fetching" ? "获取中…" : "获取对话")
						),
						react.createElement("p", { className: "sb2b-meta", style: { marginTop: 6 } }, "Work Buddy 等其它平台暂无公开分享接口、无法用链接抓取；请装「通用提炼」浏览器扩展，点网页右下角 ✨ 一键提炼。ChatGPT 需开启代理。")
					),
					tab === "file" && react.createElement("div", { className: "sb2b-field sb2b-wide" },
						react.createElement("label", null, "选择对话导出文件（.txt / .md / .json）"),
						react.createElement("input", { type: "file", accept: ".txt,.md,.json,text/plain,application/json", onChange: (e) => onImportFile(e.target.files && e.target.files[0]) }),
						fileText.length > 0 && react.createElement("span", { className: "sb2b-file" }, `${fileName}：已载入 ${fileText.length} 字符`)
					),
					tab === "harness" && react.createElement("div", { className: "sb2b-field sb2b-wide" },
						react.createElement("label", null, "选择 DeepSeek Harness 会话（最近 40 个，按最后活动时间排序）"),
						harnessLoading
							? react.createElement("p", { className: "sb2b-meta" }, "正在加载会话列表…")
							: harnessSessions.length === 0
								? react.createElement("p", { className: "sb2b-meta" }, "没有找到 Harness 会话（本地代理可能未加载）。")
								: react.createElement("div", { className: "sb2b-list" },
									harnessSessions.map((s) =>
										react.createElement("div", { key: s.id, className: "sb2b-list-item" },
											react.createElement("span", { className: "sb2b-h-title", title: s.id }, s.title || "未命名会话"),
											react.createElement("span", { className: "sb2b-meta" }, `${new Date(s.lastPromptAt || s.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })} · ${s.turns} 轮`),
											react.createElement("button", { type: "button", className: "sb2b-mini-btn", disabled: busy !== "" || harnessBusyId !== "", onClick: () => onImportHarness(s.id) }, "导入"),
											react.createElement("button", { type: "button", className: "sb2b-mini-btn", disabled: busy !== "" || harnessBusyId !== "", onClick: () => onDistillHarness(s.id) }, harnessBusyId === s.id ? "提炼中…" : "✨提炼")
										)
									)
								),
						react.createElement("p", { className: "sb2b-meta", style: { marginTop: 6 } }, "「导入」把会话载入编辑器（可先编辑再总结）；「✨提炼」直接生成笔记并写入 Obsidian。超长会话自动截取最近部分。")
					),
					react.createElement("textarea", {
						value: currentContent,
						onChange: (e) => {
							if (tab === "paste") setPasteText(e.target.value);
							else setFileText(e.target.value);
						},
						placeholder: "在这里粘贴 AI 对话内容…\n\n提示：可以先去豆包 / ChatGPT / DeepSeek 页面复制对话，再粘贴到这里。",
						disabled: busy !== ""
					}),
					react.createElement("div", { className: "sb2b-row", style: { marginTop: 8 } },
						react.createElement("span", { className: "sb2b-meta" }, `当前内容 ${currentContent.length} 字符`),
						react.createElement("span", { className: "sb2b-meta" }, meta.title ? `主题：${meta.title}` : "")
					),
					// 自定义整理要求（优先于默认类型体系）
					react.createElement("div", { className: "sb2b-field sb2b-wide", style: { marginTop: 10 } },
						react.createElement("label", null, "📝 自定义整理要求（可选，填写后优先据此整理）"),
						react.createElement("textarea", {
							value: customReq,
							onChange: (e) => setCustomReq(e.target.value),
							placeholder: "例如：只整理【教学目标】【教学重难点】【教学过程】【板书设计】四个部分，每个部分用中文概括要点，不要英文原文。\n\n留空则按对话内容自动判断类型整理（知识/方法/分析/创作/排障）。",
							disabled: busy !== "",
							style: { minHeight: 90 }
						}),
						react.createElement("p", { className: "sb2b-meta", style: { marginTop: 4 } }, customReq ? "已启用：整理时将优先按你写的要求执行。" : "未填写：将按对话内容自动识别类型并整理。")
					)
				),
				// ---- actions ----
				react.createElement("div", { className: "sb2b-actions" },
					react.createElement("button", { type: "button", className: "sb2b-btn sb2b-primary", onClick: doArchive, disabled: busy !== "" },
						busy === "summarizing" ? "⏳ 正在提炼…" : busy === "saving" ? "💾 正在写入…" : "📝 总结并归档到 Obsidian"
					),
					showManual && react.createElement(react.Fragment, null,
						react.createElement("button", { type: "button", className: "sb2b-btn", onClick: copyNote }, "复制笔记"),
						react.createElement("button", { type: "button", className: "sb2b-btn", onClick: downloadNote }, "下载 .md")
					)
				),
				status.text && react.createElement("div", { className: "sb2b-status sb2b-" + status.kind }, status.text),
				// ---- manual note preview ----
				showManual && react.createElement("div", { className: "sb2b-card" },
					react.createElement("p", { className: "sb2b-card-title" }, "📄 生成的笔记预览"),
					react.createElement("textarea", { value: showManual, readOnly: true, style: { minHeight: 180 } })
				),
				// ---- history ----
				react.createElement("div", { className: "sb2b-card" },
					react.createElement("p", { className: "sb2b-card-title" }, `🗂️ 归档记录（${history.length}）`),
					history.length === 0
						? react.createElement("p", { className: "sb2b-meta" }, "还没有归档记录。")
						: react.createElement("ul", { className: "sb2b-history" },
							history.map((entry, i) =>
								react.createElement("li", { key: entry.savedAt + "-" + i },
									react.createElement("span", { className: "sb2b-h-title" }, `《${entry.title}》`),
									react.createElement("span", { className: "sb2b-meta" }, `${entry.date} · ${entry.source}`),
									react.createElement("span", { className: "sb2b-file" }, entry.fileName),
									react.createElement("button", { type: "button", className: "sb2b-h-del", title: "删除并同步移除 Obsidian 里的笔记文件", onClick: () => removeHistory(i, entry) }, "删除")
								)
							)
						)
				)
			);
		}
		//#endregion

		//#region plugin body
		/** Services required by the client plugin. */
		const inject = ["slots"];

		/**
		 * 「✨ 提炼」button in the open conversation's header actions. One click
		 * distills the current harness session into an Obsidian note.
		 * @param props - slot props (sessionId is provided by the session scope).
		 */
		function DistillSessionButton({ sessionId }) {
			const [busy, setBusy] = useState(false);
			if (!sessionId) return null;
			return react.createElement("button", {
				type: "button",
				className: "sb2b-header-btn",
				title: "提炼本会话为笔记并归档到 Obsidian",
				"aria-label": "提炼本会话",
				disabled: busy,
				onClick: async (e) => {
					e.stopPropagation();
					setBusy(true);
					showToast("正在提炼本会话…", "info");
					try {
						const result = await distillHarnessSession(sessionId);
						if (result.multiple && result.multiple > 1 && Array.isArray(result.paths)) {
							showToast(`已归档为 ${result.multiple} 篇独立笔记\n《${result.title}》`, "ok");
						} else if (result.saved) {
							showToast(`已归档 → ${result.saved.rootName}/${result.fileName}\n《${result.title}》`, "ok");
						} else {
							showToast(`已生成《${result.title}》笔记（未配置库路径，未写盘）\n请到设置页复制/下载`, "info");
						}
					} catch (error) {
						showToast(String(error && error.message ? error.message : error), "err");
					} finally {
						setBusy(false);
					}
				}
			}, busy ? "⏳" : "✨");
		}

		/**
		 * Client plugin body: register the「AI 第二大脑」section in Settings and
		 * the「✨ 提炼」action in the open conversation's header.
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "second-brain",
				order: 20,
				label: () => "AI 第二大脑"
			}, SecondBrainPanel));
			ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
				name: "conversation.session.header.actions",
				id: "second-brain-distill",
				order: 20
			}, DistillSessionButton));
		}
		//#endregion

		exports.SecondBrainPanel = SecondBrainPanel;
		exports.DistillSessionButton = DistillSessionButton;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
