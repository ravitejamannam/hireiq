const $ = (id) => document.getElementById(id);

async function load() {
  const stored = await chrome.storage.local.get(["origin", "apiKey", "jobId"]);
  if (stored.origin) $("origin").value = stored.origin;
  if (stored.apiKey) $("apiKey").value = stored.apiKey;
  if (stored.jobId) $("jobId").value = stored.jobId;
}

$("save").addEventListener("click", async () => {
  await chrome.storage.local.set({
    origin: $("origin").value.trim(),
    apiKey: $("apiKey").value.trim(),
    jobId: $("jobId").value.trim(),
  });
  $("status").textContent = "Saved.";
});

$("submit").addEventListener("click", async () => {
  const origin = $("origin").value.trim().replace(/\/$/, "");
  const apiKey = $("apiKey").value.trim();
  const jobId = Number($("jobId").value);
  const name = $("name").value.trim();
  $("status").textContent = "Submitting…";
  try {
    const res = await fetch(`${origin}/api/v1/sourced-candidates`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jobId,
        name,
        email: $("email").value.trim() || undefined,
        source: $("source").value,
      }),
    });
    const data = await res.json();
    $("status").textContent = data.ok
      ? `Added application #${data.applicationId}`
      : data.error || `HTTP ${res.status}`;
  } catch (error) {
    $("status").textContent = error instanceof Error ? error.message : String(error);
  }
});

void load();
