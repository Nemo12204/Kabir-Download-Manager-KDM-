const host = "com.kabir.kdm";
let updates = Promise.resolve();

function serializeUpdate(action) {
  updates = updates.then(action).catch(error => console.error("KDM media storage:", error.message));
  return updates;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "kdm-download", title: "Download with KDM", contexts: ["link", "video", "audio"], targetUrlPatterns: ["http://*/*", "https://*/*"] });
  });
});

async function desktopMessage(message) {
  try {
    return await chrome.runtime.sendNativeMessage(host, message) || { ok: false, message: "KDM did not respond." };
  } catch (error) {
    return { ok: false, message: "Desktop connection failed. Run Install-Browser.cmd in your KDM folder, then retry. " + error.message };
  }
}

function sendToKdm(url, fileName) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error("KDM needs an HTTP or HTTPS URL.");
  return desktopMessage({ action: "add", url: parsed.href, fileName });
}

// DownloadItem does not expose the HTTP method. Retain only recent non-GET URLs
// so form exports keep their original browser request/body instead of being replayed as GET.
chrome.webRequest.onBeforeRequest.addListener(details => {
  if (["GET", "HEAD"].includes(details.method)) return;
  serializeUpdate(async () => {
    const { browserOnly = [] } = await chrome.storage.session.get("browserOnly");
    const recent = browserOnly.filter(item => item.until > Date.now() && item.url !== details.url);
    recent.push({ url: details.url, until: Date.now() + 120000 });
    await chrome.storage.session.set({ browserOnly: recent.slice(-200) });
  });
}, { urls: ["http://*/*", "https://*/*"] });

async function captureDownload(item) {
  const url = item.finalUrl || item.url;
  if (!/^https?:\/\//i.test(url) || item.byExtensionId || item.state !== "in_progress" || item.paused) return;
  if (item.danger !== "safe" && item.danger !== "accepted") return;
  if (/mpegurl|dash\+xml/i.test(item.mime) || /\.(m3u8|mpd)(?:\?|$)/i.test(url)) return;
  const { autoCapture = true } = await chrome.storage.local.get("autoCapture");
  if (!autoCapture) return;
  await updates;
  const { browserOnly = [] } = await chrome.storage.session.get("browserOnly");
  if (browserOnly.some(entry => entry.until > Date.now() && [item.url, url].includes(entry.url))) return;

  // onDeterminingFilename holds completion until suggest() below, including one-byte files.
  // Never send unless we successfully own a paused, still-active browser download.
  try { await chrome.downloads.pause(item.id); }
  catch { return; }
  let accepted = false;
  try {
    const [current] = await chrome.downloads.search({ id: item.id });
    if (!current || current.state !== "in_progress" || !current.paused) return;
    const fileName = item.filename?.split(/[\\/]/).pop() || undefined;
    const result = await sendToKdm(url, fileName);
    if (!result.ok) throw new Error(result.message);
    accepted = true; // KDM has persisted this queue entry; never automatically replay the add.
    await chrome.downloads.cancel(item.id);
    await chrome.storage.session.set({ lastMessage: "Captured in KDM: " + (fileName || "download") });
    await chrome.action.setBadgeBackgroundColor({ color: "#FFA500" });
    await chrome.action.setBadgeText({ text: "✓" });
  } catch (error) {
    let message = accepted ? "Added to KDM. Check the browser download if it is still paused." : "KDM handoff failed; continuing in the browser.";
    if (!accepted) {
      try { await chrome.downloads.resume(item.id); }
      catch { message = "KDM handoff failed. Resume or retry the download from your browser's Downloads page."; }
    }
    await chrome.storage.session.set({ lastMessage: message + " " + error.message });
    await chrome.action.setBadgeText({ text: "!" });
  }
}

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  captureDownload(item)
    .catch(error => console.error("KDM capture:", error.message))
    .finally(() => suggest());
  return true;
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    const result = await sendToKdm(info.linkUrl || info.srcUrl);
    if (!result.ok) throw new Error(result.message);
    await chrome.action.setBadgeText({ tabId: tab.id, text: "✓" });
    await chrome.storage.session.set({ lastMessage: result.message });
  } catch (error) {
    await chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
    await chrome.storage.session.set({ lastMessage: error.message });
  }
});

chrome.webRequest.onHeadersReceived.addListener(details => {
  if (details.tabId < 0 || ![200, 206].includes(details.statusCode)) return;
  const type = (details.responseHeaders?.find(h => h.name.toLowerCase() === "content-type")?.value || "").split(";")[0].trim().toLowerCase();
  const adaptive = /mpegurl|dash\+xml/.test(type) || /\.(m3u8|mpd)(?:\?|$)/i.test(details.url);
  if (!type.startsWith("video/") && !type.startsWith("audio/") && !adaptive) return;
  serializeUpdate(async () => {
    const key = `media:${details.tabId}`;
    const stored = await chrome.storage.session.get(key);
    const media = stored[key] || [];
    if (media.some(item => item.url === details.url)) return;
    media.unshift({ url: details.url, type, adaptive });
    await chrome.storage.session.set({ [key]: media.slice(0, 50) });
    await chrome.action.setBadgeBackgroundColor({ tabId: details.tabId, color: "#FFA500" });
    await chrome.action.setBadgeText({ tabId: details.tabId, text: String(Math.min(media.length, 50)) });
  });
}, { urls: ["http://*/*", "https://*/*"] }, ["responseHeaders"]);

chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === "loading") serializeUpdate(async () => {
    await chrome.storage.session.remove(`media:${tabId}`);
    await chrome.action.setBadgeText({ tabId, text: "" });
  });
});
chrome.tabs.onRemoved.addListener(tabId => serializeUpdate(() => chrome.storage.session.remove(`media:${tabId}`)));

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !["download", "ping", "activate"].includes(message?.action)) return false;
  Promise.resolve().then(() => message.action === "download" ? sendToKdm(message.url) : desktopMessage({ action: message.action }))
    .then(respond, error => respond({ ok: false, message: error.message }));
  return true;
});
