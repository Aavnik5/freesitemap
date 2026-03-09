/**
 * telegram-dood-worker.js
 * Cloudflare Worker — ES Module Format
 *
 * Pipeline:
 *   Telegram Video Post → Download → SeekStreaming Upload → Groq SEO Title → Turso → Reply to Channel
 *
 * Required Secrets (Cloudflare Worker Environment Variables):
 *   TELEGRAM_BOT_TOKEN        — Bot token from @BotFather
 *   SEEKSTREAMING_EMAIL       — seekstreaming.com login email
 *   SEEKSTREAMING_PASSWORD    — seekstreaming.com login password
 *   TURSO_DB_URL              — e.g. your-db-name.turso.io  (NO https://)
 *   TURSO_AUTH_TOKEN          — Turso database auth token
 *   GROQ_API_KEY              — Groq AI API key (https://console.groq.com)
 *
 * Deploy:
 *   wrangler secret put TELEGRAM_BOT_TOKEN
 *   wrangler secret put SEEKSTREAMING_EMAIL
 *   wrangler secret put SEEKSTREAMING_PASSWORD
 *   wrangler secret put TURSO_DB_URL
 *   wrangler secret put TURSO_AUTH_TOKEN
 *   wrangler secret put GROQ_API_KEY
 *
 *   Set Telegram webhook:
 *   https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<WORKER_URL>/webhook
 */

// ─── CORS Headers ─────────────────────────────────────────────────────────────
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function jsonRes(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

// ─── Turso LibSQL REST Helper ─────────────────────────────────────────────────
async function tursoQuery(sql, args, env) {
  const res = await fetch(`https://${env.TURSO_DB_URL}/v2/pipeline`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.TURSO_AUTH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        { type: "execute", stmt: { sql, args: args || [] } },
        { type: "close" },
      ],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Turso HTTP ${res.status}: ${errText}`);
  }
  return await res.json();
}

/** Initialize the videos table if it doesn't exist */
async function ensureTable(env) {
  await tursoQuery(`
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      title TEXT,
      seo_title TEXT,
      category TEXT DEFAULT 'Amateur',
      seek_id TEXT,
      seek_url TEXT,
      embed_url TEXT,
      thumbnail TEXT,
      duration INTEGER DEFAULT 0,
      views INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `, [], env);
}

/** Parse a Turso row array into a plain video object */
function tursoRowToVideo(cols, row) {
  const get = (name) => {
    const idx = cols.indexOf(name);
    return idx >= 0 ? (row[idx]?.value ?? row[idx] ?? null) : null;
  };
  const seekId = String(get("seek_id") || get("id") || "");
  return {
    id: seekId,
    seekId,
    title: String(get("title") || ""),
    seoTitle: String(get("seo_title") || get("title") || "Untitled Video"),
    seekUrl: String(get("seek_url") || `https://seekstreaming.com/${seekId}`),
    embedUrl: String(get("embed_url") || `https://seekstreaming.com/embed/${seekId}`),
    thumbnail: String(get("thumbnail") || ""),
    duration: parseInt(get("duration") || "0") || 0,
    views: parseInt(get("views") || "0") || 0,
    category: String(get("category") || "Amateur"),
    createdAt: String(get("created_at") || ""),
    source: "seekstreaming",
  };
}

/** Extract columns + rows from Turso pipeline response */
function parseTursoResult(data) {
  const result = data?.results?.[0]?.response?.result;
  if (!result) return { cols: [], rows: [] };
  const cols = (result.cols || []).map((c) => (typeof c === "string" ? c : c.name));
  const rows = result.rows || [];
  return { cols, rows };
}

// ─── Groq AI SEO Title Generator ─────────────────────────────────────────────
/**
 * Generate a long-tail SEO optimized title using Groq's Llama 3.3 70B.
 * Falls back to the original title on any error.
 */
async function generateSEOTitle(originalTitle, env) {
  try {
    if (!env.GROQ_API_KEY) return originalTitle;
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 100,
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content:
              "You are an adult video SEO expert. Generate ONE long-tail SEO optimized title for adult videos. Use explicit keywords naturally. Include category keywords. Max 80 chars. Return ONLY the title, nothing else.",
          },
          {
            role: "user",
            content: `Original title: "${originalTitle}"\nGenerate SEO title with long-tail keywords:`,
          },
        ],
      }),
    });
    if (!res.ok) return originalTitle;
    const data = await res.json();
    const aiTitle = data.choices?.[0]?.message?.content?.trim();
    return aiTitle && aiTitle.length > 5 ? aiTitle : originalTitle;
  } catch (err) {
    console.error("Groq SEO title error:", err.message);
    return originalTitle;
  }
}

// ─── Fallback SEO Title Generator (no AI) ────────────────────────────────────
function generateSeoTitleFallback(rawCaption, fileName) {
  let base = rawCaption || fileName || "Untitled Video";
  base = base.replace(/\.(mp4|avi|mkv|mov|webm|flv|wmv)$/i, "");
  base = base.replace(/@\w+/g, "").replace(/https?:\/\/\S+/g, "");
  base = base.replace(/[_\-]+/g, " ");
  base = base.replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  const capitalized = base
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
  return capitalized
    ? `${capitalized} | Free HD Video | FreePornX`
    : "Free HD Video | FreePornX";
}

// ─── Category auto-detection ─────────────────────────────────────────────────
function detectCategory(text) {
  if (!text) return "Amateur";
  const t = text.toLowerCase();
  if (/desi|indian|hindi|punjabi|bengali|tamil|telugu|marathi/i.test(t)) return "Desi";
  if (/bhabhi/i.test(t)) return "Bhabhi";
  if (/milf|mature|aunty|cougar/i.test(t)) return "Milf";
  if (/teen|18\+|college/i.test(t)) return "Teen";
  if (/lesbian|girl.?girl/i.test(t)) return "Lesbian";
  if (/anal/i.test(t)) return "Anal";
  if (/asian|chinese|japanese|korean|thai/i.test(t)) return "Asian";
  if (/blowjob|oral|deepthroat/i.test(t)) return "Blowjob";
  if (/hardcore|rough|bdsm/i.test(t)) return "Hardcore";
  return "Amateur";
}

// ─── Telegram API helpers ─────────────────────────────────────────────────────
async function tgGetFileInfo(fileId, botToken) {
  const url = `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`tgGetFileInfo HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram getFile: ${data.description}`);
  return data.result;
}

function tgFileUrl(filePath, botToken) {
  return `https://api.telegram.org/file/bot${botToken}/${filePath}`;
}

async function tgSendMessage(chatId, text, botToken) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    }),
  });
  return res.json();
}

// ─── SeekStreaming Auth — Login (body token OR Set-Cookie) ────────────────────
/**
 * Login to SeekStreaming.
 * Returns { type: "bearer"|"cookie", token: string }
 * Tries body token first; falls back to Set-Cookie header.
 */
async function seekLogin(env) {
  const res = await fetch("https://seekstreaming.com/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: env.SEEKSTREAMING_EMAIL,
      password: env.SEEKSTREAMING_PASSWORD,
    }),
  });

  // Read cookie header BEFORE consuming body
  const setCookie = res.headers.get("set-cookie");
  let data = {};
  try { data = await res.json(); } catch { /* body may not be JSON */ }

  // 1️⃣ Try body token
  const bodyToken = data?.data?.token || data?.token || data?.access_token || null;
  if (bodyToken) return { type: "bearer", token: bodyToken };

  // 2️⃣ Try Set-Cookie header
  if (setCookie) return { type: "cookie", token: setCookie };

  // No auth found
  if (res.ok) throw new Error(`SeekStreaming login: no token or cookie in response — ${JSON.stringify(data)}`);
  throw new Error(`SeekStreaming login HTTP ${res.status}: ${JSON.stringify(data)}`);
}

/** Build request headers for SeekStreaming based on auth type */
function seekAuthHeaders(auth) {
  if (auth.type === "cookie") {
    return { "Cookie": auth.token, "Content-Type": "application/json" };
  }
  return { "Authorization": `Bearer ${auth.token}`, "Content-Type": "application/json" };
}

// ─── SeekStreaming API helpers ─────────────────────────────────────────────────
/**
 * Upload a video from URL to SeekStreaming.
 * POST https://seekstreaming.com/api/v1/video/advance-upload
 */
async function seekUploadFromUrl(videoUrl, title, auth) {
  const res = await fetch("https://seekstreaming.com/api/v1/video/advance-upload", {
    method: "POST",
    headers: seekAuthHeaders(auth),
    body: JSON.stringify({ url: videoUrl, name: title }),
  });
  if (!res.ok) throw new Error(`SeekStreaming upload HTTP ${res.status}`);
  const data = await res.json();
  // API may return id at root level {"id":"xxx"} or nested {"data":{"id":"xxx"}}
  const seekId = data?.id || data?.data?.id || data?.file_id || data?.data?.file_id || null;
  if (!seekId) throw new Error(`SeekStreaming did not return an ID: ${JSON.stringify(data)}`);
  return String(seekId);
}

/**
 * Get video info from SeekStreaming by video id.
 * GET https://seekstreaming.com/api/v1/video/manage/{id}
 */
async function seekGetVideoInfo(seekId, auth) {
  const res = await fetch(`https://seekstreaming.com/api/v1/video/manage/${seekId}`, {
    headers: seekAuthHeaders(auth),
  });
  if (!res.ok) throw new Error(`SeekStreaming file info HTTP ${res.status}`);
  return res.json();
}

// ─── Turso: Save video ────────────────────────────────────────────────────────
async function tursoSaveVideo(doc, env) {
  await ensureTable(env);
  await tursoQuery(
    `INSERT OR REPLACE INTO videos
      (id, title, seo_title, category, seek_id, seek_url, embed_url, thumbnail, duration, views, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, unixepoch())`,
    [
      { type: "text", value: doc.seekId },
      { type: "text", value: doc.title },
      { type: "text", value: doc.seoTitle },
      { type: "text", value: doc.category },
      { type: "text", value: doc.seekId },
      { type: "text", value: doc.seekUrl },
      { type: "text", value: doc.embedUrl },
      { type: "text", value: doc.thumbnail },
      { type: "integer", value: String(doc.duration || 0) },
    ],
    env
  );
}

// ─── Turso: List videos ───────────────────────────────────────────────────────
async function tursoListVideos(env, category = "", limit = 12, page = 0) {
  await ensureTable(env);
  const offset = page * limit;
  let sql, args;
  if (category && category !== "All") {
    sql = `SELECT * FROM videos WHERE category = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    args = [
      { type: "text", value: category },
      { type: "integer", value: String(limit) },
      { type: "integer", value: String(offset) },
    ];
  } else {
    sql = `SELECT * FROM videos ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    args = [
      { type: "integer", value: String(limit) },
      { type: "integer", value: String(offset) },
    ];
  }
  const data = await tursoQuery(sql, args, env);
  const { cols, rows } = parseTursoResult(data);
  return rows.map((row) => tursoRowToVideo(cols, row));
}

// ─── Turso: Get single video ──────────────────────────────────────────────────
async function tursoGetVideo(seekId, env) {
  await ensureTable(env);
  const data = await tursoQuery(
    `SELECT * FROM videos WHERE seek_id = ? LIMIT 1`,
    [{ type: "text", value: seekId }],
    env
  );
  const { cols, rows } = parseTursoResult(data);
  if (rows.length === 0) throw new Error("Video not found");
  return tursoRowToVideo(cols, rows[0]);
}

// ─── Eporner API ──────────────────────────────────────────────────────────────
const EPORNER_CACHE_TTL = 1800; // 30 minutes

/**
 * Fetch videos from Eporner public API and normalize to our format.
 */
async function fetchEpornerVideos(category = "desi", page = 1, limit = 12) {
  const query = encodeURIComponent(category || "desi");
  const apiUrl =
    `https://www.eporner.com/api/v2/video/search/?query=${query}&per_page=${limit}&page=${page}&thumbsize=big&order=top-weekly&gay=0&format=json`;

  const res = await fetch(apiUrl, {
    headers: { "Accept": "application/json" },
    cf: { cacheTtl: EPORNER_CACHE_TTL },
  });
  if (!res.ok) throw new Error(`Eporner API HTTP ${res.status}`);
  const data = await res.json();

  const videos = data.videos || [];
  return videos.map((v) => {
    const thumb =
      v.thumbs?.find((t) => t.width >= 320)?.src ||
      v.thumbs?.[0]?.src ||
      v.thumb ||
      "";
    return {
      id: String(v.id || ""),
      seekId: null,
      title: String(v.title || ""),
      seoTitle: String(v.title || ""),
      embedUrl: `https://www.eporner.com/embed/${v.id}/`,
      seekUrl: null,
      thumbnail: thumb,
      duration: parseInt(v.length_sec || v.duration || "0") || 0,
      views: parseInt(v.views || "0") || 0,
      category: category,
      createdAt: String(v.added || ""),
      source: "eporner",
    };
  });
}

// ─── Mixed Feed (SeekStreaming + Eporner interleaved) ─────────────────────────
function interleave(arrA, arrB) {
  const result = [];
  const maxLen = Math.max(arrA.length, arrB.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < arrA.length) result.push(arrA[i]);
    if (i < arrB.length) result.push(arrB[i]);
  }
  return result;
}

// ─── Cache helpers ────────────────────────────────────────────────────────────
const VIDEO_CACHE_KEY = "https://freepornx.site/__video_list_cache__";
const VIDEO_CACHE_TTL_SECONDS = 300; // 5 minutes

async function getCachedVideoList(cacheStorage) {
  try {
    const cached = await cacheStorage.match(VIDEO_CACHE_KEY);
    if (cached) return cached.clone();
    return null;
  } catch {
    return null;
  }
}

async function setCachedVideoList(cacheStorage, data) {
  try {
    const res = new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${VIDEO_CACHE_TTL_SECONDS}`,
      },
    });
    await cacheStorage.put(VIDEO_CACHE_KEY, res);
  } catch {
    // Cache write failure is non-fatal
  }
}

// ─── Main video processing pipeline ──────────────────────────────────────────
async function processVideo(message, env) {
  const botToken = env.TELEGRAM_BOT_TOKEN;

  const videoObj = message.video || message.document;
  if (!videoObj) return { skipped: true, reason: "no video or document" };

  const chatId = message.chat?.id;
  const caption = message.caption || "";
  const fileName = videoObj.file_name || `video_${Date.now()}`;
  const mimeType = videoObj.mime_type || "video/mp4";

  if (!mimeType.startsWith("video/")) {
    return { skipped: true, reason: "not a video mime type" };
  }

  console.log(`Processing video: ${fileName}, caption: ${caption}`);

  // 1️⃣ Get Telegram file path
  const fileInfo = await tgGetFileInfo(videoObj.file_id, botToken);
  const directVideoUrl = tgFileUrl(fileInfo.file_path, botToken);

  // 2️⃣ Detect category
  const category = detectCategory(caption || fileName);

  // 3️⃣ Generate SEO title — try Groq AI first, fallback to regex method
  const rawTitle = caption || fileName;
  const fallbackTitle = generateSeoTitleFallback(rawTitle, fileName);
  const seoTitle = await generateSEOTitle(fallbackTitle, env);

  // 4️⃣ Login to SeekStreaming → get auth (bearer token or cookie)
  let seekAuth;
  try {
    seekAuth = await seekLogin(env);
  } catch (err) {
    console.error("SeekStreaming login failed:", err.message);
    if (chatId && botToken) {
      await tgSendMessage(chatId, `❌ SeekStreaming login failed: ${err.message}`, botToken);
    }
    return { error: err.message };
  }

  // 5️⃣ Upload to SeekStreaming via URL
  let seekId;
  try {
    seekId = await seekUploadFromUrl(directVideoUrl, seoTitle, seekAuth);
  } catch (err) {
    console.error("SeekStreaming upload failed:", err.message);
    if (chatId && botToken) {
      await tgSendMessage(chatId, `❌ Upload failed: ${err.message}`, botToken);
    }
    return { error: err.message };
  }

  // 6️⃣ Build URLs
  const seekUrl  = `https://seekstreaming.com/${seekId}`;
  const embedUrl = `https://seekstreaming.com/embed/${seekId}`;
  const watchUrl = `https://freepornx.site/video-viewer.html?type=seekstreaming&id=${seekId}`;

  // Try to get thumbnail from SeekStreaming video info (best-effort, reuse same auth)
  let thumbnail = "";
  try {
    const info = await seekGetVideoInfo(seekId, seekAuth);
    thumbnail = info?.data?.poster || info?.data?.thumbnail || "";
  } catch {
    // Non-fatal — thumbnail stays empty
  }

  // 6️⃣ Save to Turso
  const videoDoc = {
    seekId,
    title: rawTitle,
    seoTitle,
    seekUrl,
    embedUrl,
    thumbnail,
    duration: videoObj.duration || 0,
    category,
  };

  try {
    await tursoSaveVideo(videoDoc, env);
    console.log(`Saved to Turso: ${seekId}`);
  } catch (err) {
    console.error("Turso save failed:", err.message);
  }

  // 7️⃣ Post back to Telegram channel
  if (chatId && botToken) {
    const tgCaption =
      `✅ <b>New Video:</b> ${seoTitle}\n\n` +
      `▶️ <b>Watch:</b> ${watchUrl}\n\n` +
      `👉 <a href="https://freepornx.site">freepornx.site</a>`;
    await tgSendMessage(chatId, tgCaption, botToken);
  }

  return { success: true, seekId, seoTitle, watchUrl };
}

// ─── Main Worker Export ───────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // ── POST /webhook — Telegram webhook handler ──────────────────────────────
    if (path === "/webhook" && request.method === "POST") {
      try {
        const secretHeader = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
        if (env.WEBHOOK_SECRET && secretHeader !== env.WEBHOOK_SECRET) {
          return new Response("Unauthorized", { status: 401 });
        }
        const body = await request.json();
        const message = body.message || body.channel_post;
        if (
          message &&
          (message.video ||
            (message.document && message.document.mime_type?.startsWith("video/")))
        ) {
          ctx.waitUntil(processVideo(message, env));
        }
        return new Response("OK", { status: 200 });
      } catch (err) {
        console.error("Webhook error:", err);
        return new Response("OK", { status: 200 });
      }
    }

    // ── GET /videos — SeekStreaming videos from Turso (with cache) ────────────
    if (path === "/videos" && request.method === "GET") {
      const category = url.searchParams.get("category") || "";
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "12"), 50);
      const page = Math.max(parseInt(url.searchParams.get("page") || "0"), 0);

      const useCache = !category && page === 0;
      if (useCache) {
        const cached = await getCachedVideoList(caches.default);
        if (cached) {
          const data = await cached.json();
          return jsonRes({ ok: true, cached: true, videos: data });
        }
      }

      try {
        const videos = await tursoListVideos(env, category, limit, page);
        if (useCache && videos.length > 0) {
          ctx.waitUntil(setCachedVideoList(caches.default, videos));
        }
        return jsonRes({ ok: true, cached: false, videos });
      } catch (err) {
        console.error("List videos error:", err);
        return jsonRes({ ok: false, error: err.message }, 500);
      }
    }

    // ── GET /eporner/feed — Eporner videos (cached 30 min) ───────────────────
    if (path === "/eporner/feed" && request.method === "GET") {
      const category = url.searchParams.get("category") || "desi";
      const page = Math.max(parseInt(url.searchParams.get("page") || "1"), 1);
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "12"), 24);

      const cacheKey = `https://freepornx.site/__eporner_${category}_p${page}__`;
      try {
        const cached = await caches.default.match(cacheKey);
        if (cached) {
          const data = await cached.json();
          return jsonRes({ ok: true, cached: true, videos: data });
        }
      } catch { /* non-fatal */ }

      try {
        const videos = await fetchEpornerVideos(category, page, limit);

        ctx.waitUntil((async () => {
          try {
            const r = new Response(JSON.stringify(videos), {
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": `public, max-age=${EPORNER_CACHE_TTL}`,
              },
            });
            await caches.default.put(cacheKey, r);
          } catch { /* non-fatal */ }
        })());

        return jsonRes({ ok: true, cached: false, videos });
      } catch (err) {
        console.error("Eporner feed error:", err);
        return jsonRes({ ok: false, error: err.message, videos: [] }, 500);
      }
    }

    // ── GET /mixed/feed — Interleaved SeekStreaming + Eporner ────────────────
    if (path === "/mixed/feed" && request.method === "GET") {
      const category = url.searchParams.get("category") || "";
      const page = Math.max(parseInt(url.searchParams.get("page") || "0"), 0);
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "12"), 24);

      const epornerPage = page + 1;
      const epornerCategory = category || "desi";

      try {
        const [swVideos, epVideos] = await Promise.allSettled([
          tursoListVideos(env, category, limit, page),
          fetchEpornerVideos(epornerCategory, epornerPage, limit),
        ]);

        const sw = swVideos.status === "fulfilled" ? swVideos.value : [];
        const ep = epVideos.status === "fulfilled" ? epVideos.value : [];

        const mixed = interleave(sw, ep);

        return jsonRes({ ok: true, videos: mixed, counts: { seekstreaming: sw.length, eporner: ep.length } });
      } catch (err) {
        console.error("Mixed feed error:", err);
        return jsonRes({ ok: false, error: err.message, videos: [] }, 500);
      }
    }

    // ── GET /video/:id — Single SeekStreaming video from Turso ───────────────
    if (path.startsWith("/video/") && request.method === "GET") {
      const seekId = path.split("/")[2];
      if (!seekId) return jsonRes({ ok: false, error: "Missing video ID" }, 400);
      try {
        const video = await tursoGetVideo(seekId, env);
        return jsonRes({ ok: true, video });
      } catch (err) {
        return jsonRes({ ok: false, error: err.message }, 404);
      }
    }

    // ── GET /setWebhook — Helper to register Telegram webhook ────────────────
    if (path === "/setWebhook" && request.method === "GET") {
      const workerUrl = `${url.origin}/webhook`;
      const apiUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`;
      const res = await fetch(`${apiUrl}?url=${encodeURIComponent(workerUrl)}`);
      const data = await res.json();
      return jsonRes({ ok: data.ok, description: data.description, webhook_url: workerUrl });
    }

    // ── GET /initdb — DROP + recreate table with seek_id/seek_url columns ─────
    if (path === "/initdb" && request.method === "GET") {
      try {
        await tursoQuery(`DROP TABLE IF EXISTS videos`, [], env);
        await tursoQuery(`
          CREATE TABLE IF NOT EXISTS videos (
            id TEXT PRIMARY KEY,
            title TEXT,
            seo_title TEXT,
            category TEXT DEFAULT 'desi',
            seek_id TEXT,
            seek_url TEXT,
            embed_url TEXT,
            thumbnail TEXT,
            duration INTEGER DEFAULT 0,
            views INTEGER DEFAULT 0,
            created_at INTEGER DEFAULT (unixepoch())
          )
        `, [], env);
        return jsonRes({ ok: true, message: "Table dropped and recreated with seek_id/seek_url columns" });
      } catch (err) {
        return jsonRes({ ok: false, error: err.message }, 500);
      }
    }

    // ── GET /test-sw — Debug SeekStreaming login + account ───────────────────
    if (path === "/test-sw" && request.method === "GET") {
      try {
        // Step 1: Login
        let seekAuth = null;
        let loginError = null;
        try {
          seekAuth = await seekLogin(env);
        } catch (err) {
          loginError = err.message;
        }

        if (!seekAuth) {
          return jsonRes({
            ok: false,
            login_error: loginError,
            email_set: !!env.SEEKSTREAMING_EMAIL,
            password_set: !!env.SEEKSTREAMING_PASSWORD,
          }, 401);
        }

        // Step 2: Fetch user info using resolved auth
        const infoRes = await fetch("https://seekstreaming.com/api/v1/user/information", {
          headers: seekAuthHeaders(seekAuth),
        });
        const infoText = await infoRes.text();
        let parsed;
        try { parsed = JSON.parse(infoText); } catch { parsed = infoText; }

        return jsonRes({
          ok: true,
          auth_type: seekAuth.type,
          token_prefix: seekAuth.token.slice(0, 30) + "...",
          http_status: infoRes.status,
          seekstreaming_response: parsed,
          email_set: !!env.SEEKSTREAMING_EMAIL,
          password_set: !!env.SEEKSTREAMING_PASSWORD,
        });
      } catch (err) {
        return jsonRes({ ok: false, error: err.message }, 500);
      }
    }

    // ── GET / — Health check ──────────────────────────────────────────────────
    if (path === "/" || path === "") {
      return jsonRes({
        ok: true,
        service: "FreePornX Telegram → SeekStreaming → Turso Pipeline",
        version: "2026-03-09",
        db: "Turso LibSQL",
        upload: "SeekStreaming (JWT auth)",
        ai: "Groq (llama-3.3-70b)",
        secrets_needed: [
          "TELEGRAM_BOT_TOKEN",
          "SEEKSTREAMING_EMAIL",
          "SEEKSTREAMING_PASSWORD",
          "TURSO_DB_URL",
          "TURSO_AUTH_TOKEN",
          "GROQ_API_KEY",
        ],
        endpoints: [
          "POST /webhook (Telegram webhook)",
          "GET /videos?category=&limit=12&page=0 (SeekStreaming only)",
          "GET /eporner/feed?category=desi&page=1 (Eporner only, 30min cache)",
          "GET /mixed/feed?category=desi&page=0 (Interleaved 50/50)",
          "GET /video/:seekId (single video from Turso)",
          "GET /setWebhook",
          "GET /initdb (drops & recreates table — run once)",
          "GET /test-sw (debug SeekStreaming login)",
        ],
      });
    }

    return jsonRes({ ok: false, error: "Not Found" }, 404);
  },
};
