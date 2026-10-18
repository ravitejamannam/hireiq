chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url || !tab.id) return;
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      name: document.querySelector("h1")?.textContent?.trim() ?? "",
      headline: document.querySelector("h2")?.textContent?.trim() ?? "",
    }),
  });
  const stored = await chrome.storage.local.get(["hireiqApiKey", "hireiqBase"]);
  if (!stored.hireiqApiKey || !stored.hireiqBase) return;
  await fetch(`${stored.hireiqBase}/api/extension/capture`, {
    method: "POST",
    headers: { Authorization: `Bearer ${stored.hireiqApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ profileUrl: tab.url, name: result?.name ?? "", headline: result?.headline ?? "" }),
  });
});
