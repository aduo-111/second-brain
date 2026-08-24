/**
 * AI 第二大脑 · 豆包提炼 — background service worker.
 * All localhost fetches happen here: with host_permissions for
 * http://127.0.0.1:3080/* the extension bypasses CORS entirely.
 */

const HARNESS = "http://127.0.0.1:3080";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message && message.type === "ping") {
      try {
        const res = await fetch(`${HARNESS}/api/second-brain/config`, { signal: AbortSignal.timeout(3000) });
        const json = await res.json().catch(() => null);
        sendResponse({ ok: res.ok && json && json.ok, config: (json && json.config) || null });
      } catch {
        sendResponse({ ok: false, error: "无法连接本机 DeepSeek Harness（http://127.0.0.1:3080），请确认服务在运行。" });
      }
      return;
    }
    if (message && message.type === "distill") {
      try {
        const res = await fetch(`${HARNESS}/api/second-brain/distill`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(message.payload || {})
        });
        const json = await res.json().catch(() => ({ ok: false, error: "本机服务响应无法解析" }));
        sendResponse(json);
      } catch (error) {
        sendResponse({ ok: false, error: "连接本机 DeepSeek Harness 失败：" + String(error && error.message ? error.message : error) });
      }
      return;
    }
    sendResponse({ ok: false, error: "未知消息类型" });
  })();
  return true; // keep the message channel open for async sendResponse
});
