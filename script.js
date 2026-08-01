const form = document.getElementById("skipForm");
const urlInput = document.getElementById("urlInput");
const urlField = document.getElementById("urlField");
const formMessage = document.getElementById("formMessage");
const submitButton = document.getElementById("submitButton");
const clearButton = document.getElementById("clearButton");
const resultBox = document.getElementById("resultBox");
const resultTitle = document.getElementById("resultTitle");
const resultUrl = document.getElementById("resultUrl");
const resultIcon = document.getElementById("resultIcon");
const openButton = document.getElementById("openButton");
const copyButton = document.getElementById("copyButton");
const resetButton = document.getElementById("resetButton");
const toast = document.getElementById("toast");

const DEFAULT_MESSAGE = "Masukkan URL safelink yang ingin dilewati.";
let finalUrl = "";
let toastTimer;

function normalizeUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

function comparableUrl(value) {
  try {
    const parsed = new URL(value);
    return `${parsed.hostname}${parsed.pathname}${parsed.search}`.replace(/\/$/, "");
  } catch {
    return value;
  }
}

function extractDestination(payload, submittedUrl) {
  const preferredKeys = [
    "result", "destination", "destination_url", "destinationUrl", "final_url",
    "finalUrl", "direct_url", "directUrl", "link", "url", "data",
    "output", "response", "message"
  ];

  const candidates = [];
  const seen = new Set();
  const submittedComparable = comparableUrl(submittedUrl);

  function collect(value, score = 0) {
    if (typeof value !== "string") return;
    const urls = value.match(/https?:\/\/[^\s"'<>]+/gi) || [];

    urls.forEach((url) => {
      const clean = url.replace(/[),.;\]}]+$/, "");
      if (!isValidHttpUrl(clean) || seen.has(clean)) return;
      seen.add(clean);
      candidates.push({
        url: clean,
        score: score + (comparableUrl(clean) !== submittedComparable ? 20 : 0)
      });
    });
  }

  function walk(value, depth = 0, score = 0) {
    if (value == null || depth > 7) return;

    if (typeof value === "string") {
      collect(value, score - depth);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, depth + 1, score));
      return;
    }

    if (typeof value === "object") {
      Object.entries(value).forEach(([key, child]) => {
        const keyIndex = preferredKeys.indexOf(key);
        const keyScore = keyIndex === -1 ? 0 : 120 - keyIndex * 5;
        walk(child, depth + 1, score + keyScore);
      });
    }
  }

  walk(payload);
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.url || "";
}

function setLoading(loading) {
  submitButton.disabled = loading;
  submitButton.classList.toggle("loading", loading);
  urlInput.disabled = loading;
  clearButton.disabled = loading;
}

function setMessage(message = DEFAULT_MESSAGE, isError = false) {
  formMessage.textContent = message;
  formMessage.classList.toggle("error", isError);
  urlField.classList.toggle("error", isError);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2100);
}

function renderResult({ success, title, value }) {
  finalUrl = success ? value : "";
  resultBox.hidden = false;
  resultBox.classList.toggle("error-state", !success);
  resultTitle.textContent = title;
  resultUrl.textContent = value;
  resultUrl.title = value;

  resultIcon.innerHTML = success
    ? '<svg viewBox="0 0 24 24"><path d="m6.5 12.5 3.2 3.2 7.8-8" /></svg>'
    : '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16.5h.01"/></svg>';

  copyButton.hidden = !success;
  openButton.classList.toggle("disabled", !success);
  openButton.href = success ? value : "#";
  openButton.setAttribute("aria-disabled", String(!success));
}

async function requestSkip(targetUrl) {
  const response = await fetch(`/api/skip?url=${encodeURIComponent(targetUrl)}`, {
    headers: { Accept: "application/json, text/plain;q=0.9, */*;q=0.8" }
  });

  const type = response.headers.get("content-type") || "";
  const data = type.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof data === "object"
      ? data?.message || data?.error || "Permintaan gagal diproses."
      : data;
    throw new Error(message || "Permintaan gagal diproses.");
  }

  return data;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const targetUrl = normalizeUrl(urlInput.value);

  if (!targetUrl || !isValidHttpUrl(targetUrl)) {
    setMessage("URL tidak valid. Periksa kembali link yang kamu masukkan.", true);
    urlInput.focus();
    return;
  }

  urlInput.value = targetUrl;
  setMessage("Sedang mencari link tujuan...");
  setLoading(true);
  resultBox.hidden = true;

  try {
    const payload = await requestSkip(targetUrl);
    const destination = extractDestination(payload, targetUrl);

    if (!destination) {
      renderResult({
        success: false,
        title: "Link belum ditemukan",
        value: "Safelink tidak dapat diproses. Coba link lainnya."
      });
      setMessage("Tidak ada link tujuan yang ditemukan.", true);
      return;
    }

    renderResult({ success: true, title: "Berhasil ditemukan", value: destination });
    setMessage("Selesai. Link tujuan siap dibuka.");
  } catch (error) {
    renderResult({
      success: false,
      title: "Gagal memproses",
      value: error.message || "Terjadi kesalahan saat memproses link."
    });
    setMessage("Terjadi kesalahan. Silakan coba lagi.", true);
  } finally {
    setLoading(false);
  }
});

urlInput.addEventListener("input", () => {
  clearButton.hidden = !urlInput.value;
  if (urlField.classList.contains("error")) setMessage();
});

urlInput.addEventListener("paste", () => {
  setTimeout(() => {
    const normalized = normalizeUrl(urlInput.value);
    if (isValidHttpUrl(normalized)) urlInput.value = normalized;
    clearButton.hidden = !urlInput.value;
  }, 0);
});

clearButton.addEventListener("click", () => {
  urlInput.value = "";
  clearButton.hidden = true;
  resultBox.hidden = true;
  setMessage();
  urlInput.focus();
});

copyButton.addEventListener("click", async () => {
  if (!finalUrl) return;

  try {
    await navigator.clipboard.writeText(finalUrl);
  } catch {
    const temp = document.createElement("textarea");
    temp.value = finalUrl;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand("copy");
    temp.remove();
  }

  showToast("Link berhasil disalin");
});

resetButton.addEventListener("click", () => {
  resultBox.hidden = true;
  urlInput.value = "";
  clearButton.hidden = true;
  setMessage();
  urlInput.focus();
});
