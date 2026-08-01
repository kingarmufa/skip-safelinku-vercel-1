const API_ENDPOINT = "https://api.ikyyxd.my.id/tools/skiplink/sfl";

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Metode tidak diizinkan. Gunakan GET."
    });
  }

  const targetUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;

  if (!targetUrl || !isValidHttpUrl(targetUrl)) {
    return res.status(400).json({
      success: false,
      message: "Parameter url wajib berupa URL http/https yang valid."
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const upstreamUrl = `${API_ENDPOINT}?url=${encodeURIComponent(targetUrl)}`;
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json, text/plain;q=0.9, */*;q=0.8",
        "User-Agent": "SKIP-SAFELINKU/1.0"
      },
      signal: controller.signal,
      redirect: "follow"
    });

    const responseText = await upstream.text();
    let responseBody;

    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = responseText;
    }

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        success: false,
        message: "API upstream mengembalikan respons gagal.",
        upstreamStatus: upstream.status,
        data: responseBody
      });
    }

    // Respons diteruskan apa adanya agar frontend dapat membaca berbagai format API.
    if (typeof responseBody === "string") {
      return res.status(200).json({
        success: true,
        data: responseBody
      });
    }

    return res.status(200).json(responseBody);
  } catch (error) {
    const timedOut = error?.name === "AbortError";
    return res.status(timedOut ? 504 : 502).json({
      success: false,
      message: timedOut
        ? "API membutuhkan waktu terlalu lama untuk merespons."
        : "Tidak dapat terhubung ke API upstream.",
      error: error?.message || "Unknown error"
    });
  } finally {
    clearTimeout(timeout);
  }
}
