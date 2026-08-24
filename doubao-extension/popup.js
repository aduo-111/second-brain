// AI 第二大脑 · 通用提炼 — popup status check.
(async () => {
  const statusEl = document.getElementById("status");
  try {
    const resp = await chrome.runtime.sendMessage({ type: "ping" });
    if (resp && resp.ok) {
      const cfg = resp.config || {};
      if (cfg.vaultPath) {
        statusEl.className = "status ok";
        statusEl.textContent = `✅ Harness 在线，Obsidian 库已配置：${cfg.vaultPath}`;
      } else {
        statusEl.className = "status ok";
        statusEl.textContent = "✅ Harness 在线。但还没配置 Obsidian 库路径，请先到 设置 → AI 第二大脑 里填写并「保存到本机」。";
      }
    } else {
      statusEl.className = "status err";
      statusEl.textContent = "❌ " + ((resp && resp.error) || "无法连接本机服务");
    }
  } catch (error) {
    statusEl.className = "status err";
    statusEl.textContent = "❌ " + String(error && error.message ? error.message : error);
  }
})();
