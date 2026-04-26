const APP_URL_KEY = "app_url";
const TOKEN_KEY = "api_token";
const DEFAULT_APP_URL = "https://your-app.vercel.app";

async function init() {
  const { [TOKEN_KEY]: token, [APP_URL_KEY]: appUrl } = await chrome.storage.local.get([TOKEN_KEY, APP_URL_KEY]);

  if (token) {
    document.getElementById("api-token").value = token;
  }

  // Extract profile from the active LinkedIn tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isLinkedIn = tab?.url?.includes("linkedin.com/in/");

  if (!isLinkedIn) {
    showStatus("Open a LinkedIn profile page to capture a contact.", "error");
    document.getElementById("save-btn").disabled = true;
    return;
  }

  try {
    const profile = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_PROFILE" });
    if (profile?.name) {
      document.getElementById("name").value = profile.name;
      document.getElementById("title").value = profile.title ?? "";
      document.getElementById("company").value = profile.company ?? "";
    } else {
      showStatus("Could not read profile data. Try refreshing the LinkedIn page.", "error");
      document.getElementById("save-btn").disabled = true;
    }
  } catch {
    showStatus("Could not connect to page. Reload the LinkedIn tab and try again.", "error");
    document.getElementById("save-btn").disabled = true;
  }
}

document.getElementById("save-btn").addEventListener("click", async () => {
  const { [TOKEN_KEY]: token, [APP_URL_KEY]: storedAppUrl } = await chrome.storage.local.get([TOKEN_KEY, APP_URL_KEY]);
  const appUrl = storedAppUrl ?? DEFAULT_APP_URL;

  if (!token) {
    showStatus("No API token saved. Paste your token below and click Save Token first.", "error");
    return;
  }

  const name = document.getElementById("name").value.trim();
  const title = document.getElementById("title").value.trim();
  const company = document.getElementById("company").value.trim();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const linkedinUrl = tab?.url?.split("?")[0];

  document.getElementById("save-btn").disabled = true;
  document.getElementById("save-btn").textContent = "Saving…";

  try {
    const res = await fetch(`${appUrl}/api/contacts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Origin: chrome.runtime.getURL(""),
      },
      body: JSON.stringify({ name, title, company, linkedinUrl }),
    });

    if (res.status === 401) {
      showStatus("Unauthorized — check your API token in Settings.", "error");
    } else if (!res.ok) {
      showStatus(`Failed to save contact (${res.status}). Is the app running?`, "error");
    } else {
      const data = await res.json();
      showStatus(
        data.status === "duplicate" ? "Contact already saved." : "Contact saved!",
        "success",
      );
    }
  } catch {
    showStatus("Failed to save contact. Is the app running?", "error");
  } finally {
    document.getElementById("save-btn").disabled = false;
    document.getElementById("save-btn").textContent = "Save Contact";
  }
});

document.getElementById("save-token-btn").addEventListener("click", async () => {
  const token = document.getElementById("api-token").value.trim();
  if (!token) return;
  await chrome.storage.local.set({ [TOKEN_KEY]: token });
  showStatus("Token saved.", "success");
  setTimeout(() => document.getElementById("status").style.display = "none", 2000);
});

function showStatus(msg, type) {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.className = `status ${type}`;
}

init();
