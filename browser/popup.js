const status = document.querySelector("#status");
const connection = document.querySelector("#connection");
const capture = document.querySelector("#auto-capture");

chrome.storage.local.get({ autoCapture: true }).then(settings => {
  capture.checked = settings.autoCapture;
  capture.disabled = false;
}, error => { status.textContent = error.message; });

capture.addEventListener("change", async () => {
  capture.disabled = true;
  try {
    await chrome.storage.local.set({ autoCapture: capture.checked });
    status.textContent = capture.checked ? "New downloads will be captured by KDM." : "New downloads will stay in your browser.";
  } catch (error) { capture.checked = !capture.checked; status.textContent = error.message; }
  finally { capture.disabled = false; }
});

function showConnection(result) {
  connection.textContent = result?.ok ? "Desktop connected" : "Desktop unavailable";
  connection.dataset.connected = String(!!result?.ok);
  connection.title = result?.message || "Run Install-Browser.cmd from the KDM folder.";
}

chrome.runtime.sendMessage({ action: "ping" }).then(showConnection,
  error => showConnection({ ok: false, message: error.message }));

document.querySelector("#open-app").addEventListener("click", async event => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ action: "activate" });
    showConnection(result);
    status.textContent = result?.ok ? "KDM opened." : result?.message || "KDM did not respond.";
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});

async function download(url, button) {
  button.disabled = true;
  status.textContent = "Sending to KDM…";
  try {
    const result = await chrome.runtime.sendMessage({ action: "download", url });
    showConnection(result);
    status.textContent = result?.message || "KDM did not respond.";
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
}

document.querySelector("#form").addEventListener("submit", event => {
  event.preventDefault();
  download(document.querySelector("#url").value, event.submitter);
});

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const key = `media:${tab.id}`;
  const stored = await chrome.storage.session.get([key, "lastMessage"]);
  if (stored.lastMessage) status.textContent = stored.lastMessage;
  const media = stored[key] || [];
  if (!media.length) return;
  const list = document.querySelector("#media");
  list.replaceChildren();
  for (const item of media) {
    const card = document.createElement("article");
    const title = document.createElement("p");
    const url = new URL(item.url);
    try { title.textContent = decodeURIComponent(url.pathname.split("/").pop()) || url.host; }
    catch { title.textContent = url.pathname; }
    title.title = item.url;
    const type = document.createElement("small");
    type.textContent = item.adaptive ? "Adaptive manifest · not a complete video file" : item.type;
    const button = document.createElement("button");
    button.textContent = item.adaptive ? "Copy manifest URL" : "Download";
    button.addEventListener("click", async () => {
      if (!item.adaptive) return download(item.url, button);
      try { await navigator.clipboard.writeText(item.url); status.textContent = "Manifest URL copied."; }
      catch (error) { status.textContent = error.message; }
    });
    card.append(title, type, button);
    list.append(card);
  }
})().catch(error => { status.textContent = error.message; });
