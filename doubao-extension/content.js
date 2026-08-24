/**
 * AI 第二大脑 · 通用提炼 — content script running on any site.
 *
 * Two entry points:
 *  1. Floating「✨ 提炼本对话」button (bottom-right) — works on any AI
 *     conversation page: scrolls to the top to load history, captures the
 *     message bubbles from the DOM (role guessed from left/right alignment),
 *     then asks the harness host to distill it into an Obsidian note.
 *  2. Conversation-list row buttons — best-effort: rows that look like chat
 *     links get a small ✨ button; clicking it records a "pending distill"
 *     intent, opens the conversation, and auto-distills once loaded.
 *  3. A 🧩 debug button copies a DOM-structure report to the clipboard so
 *     selectors can be calibrated against the real page.
 */

// ---- small UI helpers ----
function toast(text, kind) {
  const el = document.createElement("div");
  el.textContent = text;
  el.style.cssText = [
    "position:fixed", "right:18px", "bottom:96px", "z-index:2147483647", "max-width:420px",
    "padding:12px 16px", "border-radius:12px", "font-size:13px", "line-height:1.55",
    "white-space:pre-wrap", "box-shadow:0 10px 34px rgba(0,0,0,.22)",
    "background:#ffffff", "color:#1f2329",
    "border-left:4px solid " + (kind === "ok" ? "#3d9a50" : kind === "err" ? "#d64540" : "#4e6ef2"),
    "font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif"
  ].join(";");
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .3s"; }, 5200);
  setTimeout(() => el.remove(), 5600);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendToBackground(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
        else resolve(response || { ok: false, error: "无响应" });
      });
    } catch (error) {
      resolve({ ok: false, error: String(error && error.message ? error.message : error) });
    }
  });
}

// ---- capture: find the scrollable message container ----
function findMessageContainer() {
  const candidates = [];
  const all = document.querySelectorAll("div, main, section, [class*='chat'], [class*='message']");
  for (const el of all) {
    if (el.children.length < 2) continue;
    let st;
    try { st = getComputedStyle(el); } catch { continue; }
    const scrollable = (st.overflowY === "auto" || st.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 100;
    const textLen = (el.innerText || "").length;
    if (textLen > 60) candidates.push({ el, scrollable, textLen });
  }
  candidates.sort((a, b) => {
    if (a.scrollable !== b.scrollable) return a.scrollable ? -1 : 1;
    // 都是可滚动的：优先选滚动内容最多（scrollHeight 最大）的容器，那通常是整个会话区
    const aH = a.el.scrollHeight, bH = b.el.scrollHeight;
    if (aH !== bH) return bH - aH;
    return b.textLen - a.textLen;
  });
  return candidates.length > 0 ? candidates[0].el : (document.scrollingElement || document.body);
}

// ---- capture: collect message-like nodes with a guessed role + images ----
async function imgToDataUrl(img) {
  try {
    const src = img.currentSrc || img.src;
    if (!src) return null;
    if (src.startsWith("data:image/")) return src;
    if (src.startsWith("blob:") || src.startsWith("http")) {
      const res = await fetch(src);
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!/^image\//.test(blob.type)) return null;
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    }
    return null;
  } catch {
    return null;
  }
}

async function collectMessageNodes(container) {
  const rect = container.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  // 收集所有有文本的元素，挑出“叶子消息块”：不被其它更大文本块完全包含。
  const all = container.querySelectorAll("*");
  const withText = [];
  for (const el of all) {
    try {
      const text = (el.innerText || "").trim();
      if (text.length < 2) continue;
      if (el.closest("button, input, textarea, script, style, [contenteditable], [role='button']")) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.height > 5000) continue;
      withText.push({ el, text, r });
    } catch { /* skip */ }
  }
  // 保留“最小的”文本块：如果某元素文本被另一个元素文本包含且那个更大，跳过这个更小的（除非它本身是唯一要的）。
  // 但聊天里每条消息是独立气泡，气泡之间不互相包含。这里关键是避免“气泡 + 内层段落”都被收。
  // 策略：按文本长度升序，保留一个文本块，若其完整包含在已保留的更大块里则跳过；否则并入。
  withText.sort((a, b) => a.text.length - b.text.length);
  const kept = [];
  for (const item of withText) {
    let isInner = false;
    for (const other of kept) {
      if (other.text.includes(item.text) && other.text.length > item.text.length) { isInner = true; break; }
    }
    if (isInner) continue;
    kept.push(item);
  }
  // 用文本去重（相同文本只留一个）
  const byText = new Map();
  for (const item of kept) byText.set(item.text, item);

  const nodes = [];
  for (const item of byText.values()) {
    const top = item.r.top + (container && container.scrollTop || 0);
    const elCx = item.r.left + item.r.width / 2;
    const role = elCx > cx + 12 ? "user" : "assistant";
    const images = [];
    for (const img of item.el.querySelectorAll("img")) {
      if (img.width < 50 && img.height < 50) continue;
      const dataUrl = await imgToDataUrl(img);
      if (dataUrl) images.push(dataUrl);
    }
    nodes.push({ text: item.text, top, role, images });
  }
  nodes.sort((a, b) => a.top - b.top);
  return nodes;
}

// ---- capture: full flow ----
async function captureConversation() {
  const container = findMessageContainer();
  const report = { containerFound: !!container && container !== document.body };
  if (!report.containerFound) {
    report.error = "未找到滚动消息容器";
    return { title: "", messages: [], images: [], report };
  }

  // 兼容虚拟列表：豆包/React 会话列表可能只保留可视区附近的消息，其它会被移出 DOM。
  // 因此不能只在最后抓一次，而要在滚动过程中逐步采集、按文本去重累积。
  const allMessages = new Map();   // text -> {role, content, top}
  const allImages = new Set();
  let lastKnownHeight = -1, stableRounds = 0;
  const MAX_ROUNDS = 16;

  const snapToTop = () => { try { container.scrollTop = 0; } catch {} };
  const snapToBottom = () => { try { container.scrollTop = container.scrollHeight; } catch {} };
  const nowHeight = () => { try { return container.scrollHeight; } catch { return 0; } };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    snapToBottom();
    await sleep(900);
    snapToTop();
    await sleep(900);
    // 每轮采集当前已渲染的消息，并合并进累积集合
    const nodes = await collectMessageNodes(container);
    for (const n of nodes) {
      const t = String(n.text || "").trim();
      if (!t) continue;
      const existing = allMessages.get(t);
      if (existing) { existing.top = Math.min(existing.top, n.top); }
      else { allMessages.set(t, { role: n.role, content: t, top: n.top }); }
      for (const img of n.images || []) allImages.add(img);
    }
    const h = nowHeight();
    if (h === lastKnownHeight) stableRounds++; else stableRounds = 0;
    lastKnownHeight = h;
    report.scrollHeight = h;
    if (stableRounds >= 3) break;
  }
  report.rawCollected = allMessages.size;

  // 把累积的文本块按下述逻辑合并成消息：
  // 相邻的同类角色、垂直距离近的块合并为一条（豆包一条答案常拆成多个文本块/被虚拟列表切分）。
  const ordered = [...allMessages.values()].sort((a, b) => (a.top - b.top) || (a.content.length - b.content.length));
  const merged = [];
  for (const item of ordered) {
    const last = merged[merged.length - 1];
    if (last && last.role === item.role && (item.top - (last.top || 0) <= 300)) {
      last.content += "\n" + item.content;
    } else {
      merged.push({ role: item.role, content: item.content, top: item.top });
    }
  }
  const messages = merged;
  const images = [...allImages].slice(0, 12);
  const platform = detectPlatform();
  const title = (document.title || "").replace(/[-–—]\s*(豆包|AI|ChatGPT|Kimi).*$/i, "").trim()
    || (messages[0] ? String(messages[0].content).slice(0, 40) : `${platform}对话`);
  report.nodeCount = merged.length;
  report.imageCount = images.length;
  report.sample = merged.slice(0, 3).map((n) => ({ role: n.role, text: n.content.slice(0, 60) }));
  return { title, messages: messages.map(({ role, content }) => ({ role, content })), images, report };
}

// ---- platform detection ----
function detectPlatform() {
  const host = location.hostname.toLowerCase();
  if (host.includes("doubao")) return "豆包";
  if (host.includes("chatgpt") || host.includes("openai") || host.includes("chat.openai")) return "ChatGPT";
  if (host.includes("workbuddy") || host.includes("work-buddy") || host.includes("genie") || host.includes("codebuddy")) return "Work Buddy";
  if (host.includes("moonshot") || host.includes("kimi")) return "Kimi";
  if (host.includes("qwen") || host.includes("aliyun") || host.includes("dashscope") || host.includes("tongyi")) return "通义千问";
  if (host.includes("yiyan") || host.includes("ernie") || host.includes("baidu")) return "文心一言";
  if (host.includes("deepseek")) return "DeepSeek";
  if (host.includes("claude") || host.includes("anthropic")) return "Claude";
  const m = /\.([a-z0-9-]+)\.(com|cn|net|io|org|app)/.exec(host);
  if (m) return m[1];
  return "AI";
}

// ---- distill ----
async function distill(messages, title, images) {
  const platform = detectPlatform();
  toast(images && images.length ? `正在提炼（含 ${images.length} 张图片）…` : `正在通过 DeepSeek Harness 提炼 ${platform} 对话…`, "info");
  const resp = await sendToBackground({
    type: "distill",
    payload: { title, source: `${platform}`, bot: platform, messages, images: images || [] }
  });
  if (resp && resp.ok) {
    toast(`已归档 → ${resp.path}\n《${resp.title}》${resp.savedImages ? `（已嵌入 ${resp.savedImages} 张图片${resp.visionUsed ? "，内容已识别" : "，未配视觉模型仅存图"}）` : ""}`, "ok");
  } else {
    toast("提炼失败：" + ((resp && resp.error) || "未知错误"), "err");
  }
}

// ---- floating button stack ----
function ensureFloatUI() {
  if (document.getElementById("sb2b-float")) return;
  const wrap = document.createElement("div");
  wrap.id = "sb2b-float";
  wrap.style.cssText = "position:fixed;right:18px;bottom:84px;z-index:2147483646;display:flex;flex-direction:column;gap:8px;align-items:flex-end";
  const mk = (label, title, onClick, bg) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.title = title;
    b.style.cssText = [
      "border:none", "border-radius:999px", "padding:9px 15px", "cursor:pointer",
      "font-size:13px", "font-weight:600", "color:#fff", "background:" + bg,
      "box-shadow:0 6px 20px rgba(0,0,0,.18)",
      "font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif"
    ].join(";");
    b.addEventListener("click", onClick);
    return b;
  };
  const distillBtn = mk("✨ 提炼本对话", "抓取当前对话并提炼为 Obsidian 笔记", async () => {
    distillBtn.disabled = true;
    distillBtn.textContent = "⏳ 提炼中…";
    try {
      const { title, messages, images, report } = await captureConversation();
      if (messages.length === 0) {
        toast("没有识别到对话消息（抓到 " + report.nodeCount + " 个节点）。点「🧩 调试」把报告发给我校准。", "err");
        return;
      }
      toast(`已抓到 ${messages.length} 条消息（标题：${title.slice(0, 30)}），开始提炼…`, "info");
      await distill(messages, title, images);
    } catch (error) {
      toast("抓取失败：" + String(error && error.message ? error.message : error), "err");
    } finally {
      distillBtn.disabled = false;
      distillBtn.textContent = "✨ 提炼本对话";
    }
  }, "#4e6ef2");
  const debugBtn = mk("🧩 调试", "把页面结构报告复制到剪贴板，方便校准选择器", async () => {
    const { title, messages, report } = await captureConversation();
    const dump = {
      url: location.href,
      title,
      report,
      firstMessages: messages.slice(0, 5)
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(dump, null, 2));
      toast("调试报告已复制到剪贴板，粘贴发给我即可校准。" + (messages.length ? `（识别到 ${messages.length} 条消息）` : "（未识别到消息）"), "info");
    } catch {
      toast("复制失败，请手动查看控制台", "err");
    }
  }, "#5c6270");
  wrap.appendChild(distillBtn);
  wrap.appendChild(debugBtn);
  document.body.appendChild(wrap);
}

// ---- conversation-list row buttons (best-effort) ----
const ROW_SELECTOR_HINTS = [
  'a[href*="/chat/"]',
  'a[href*="/thread/"]',
  '[class*="conversation-list"] [class*="item"]',
  '[class*="chat-list"] [class*="item"]'
];

function rowTitleOf(row) {
  const t = (row.innerText || "").trim().split("\n")[0].slice(0, 60);
  return t || `${detectPlatform()}对话`;
}

function injectRowButtons() {
  for (const selector of ROW_SELECTOR_HINTS) {
    let rows;
    try { rows = document.querySelectorAll(selector); } catch { continue; }
    for (const row of rows) {
      if (row.dataset.sb2bDone) continue;
      row.dataset.sb2bDone = "1";
      row.style.position = row.style.position || "relative";
      const btn = document.createElement("button");
      btn.textContent = "✨";
      btn.title = "提炼这个对话为笔记（会打开该对话并自动提炼）";
      btn.style.cssText = [
        "position:absolute", "right:6px", "top:50%", "transform:translateY(-50%)",
        "z-index:99", "border:none", "border-radius:8px", "width:26px", "height:26px",
        "cursor:pointer", "font-size:13px", "background:rgba(78,110,242,.12)", "color:#4e6ef2",
        "display:none", "align-items:center", "justify-content:center"
      ].join(";");
      row.addEventListener("mouseenter", () => { btn.style.display = "flex"; });
      row.addEventListener("mouseleave", () => { btn.style.display = "none"; });
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.textContent = "⏳";
        const title = rowTitleOf(row);
        try { sessionStorage.setItem("sb2b:pendingDistill", title); } catch { /* ignore */ }
        // Open the conversation (same tab for best capture reliability).
        const href = row.tagName === "A" ? row.href : (row.querySelector("a[href]") || {}).href;
        if (href) location.href = href;
        else row.click();
      });
      row.appendChild(btn);
    }
  }
}

// ---- auto-run after navigation from a list-row click ----
async function autoRunPending() {
  let pending = null;
  try { pending = sessionStorage.getItem("sb2b:pendingDistill"); } catch { /* ignore */ }
  if (!pending) return;
  try { sessionStorage.removeItem("sb2b:pendingDistill"); } catch { /* ignore */ }
  await sleep(2500); // let messages render
  const { title, messages, images, report } = await captureConversation();
  if (messages.length === 0) {
    toast("打开后未识别到消息（" + report.nodeCount + " 个节点）。可点「🧩 调试」发我校准。", "err");
    return;
  }
  await distill(messages, pending || title, images);
}

// ---- init ----
function init() {
  ensureFloatUI();
  injectRowButtons();
  new MutationObserver(() => injectRowButtons()).observe(document.body, { childList: true, subtree: true });
  autoRunPending();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
