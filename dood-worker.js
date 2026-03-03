const KAHANI_BASE = "https://www.freesexkahani.com";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Expose-Headers": "Content-Type, Content-Length"
  };
}

function json(payload, status = 200, cache = "public, max-age=120") {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": cache,
      ...corsHeaders()
    }
  });
}

function absUrl(origin, pathOrUrl) {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (pathOrUrl.startsWith("//")) return `https:${pathOrUrl}`;
  if (pathOrUrl.startsWith("/")) return `${origin}${pathOrUrl}`;
  return `${origin}/${pathOrUrl}`;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9"
    }
  });
  if (!res.ok) {
    throw new Error(`Upstream status ${res.status}`);
  }
  return res.text();
}

async function fetchReaderMirror(url) {
  const mirrorUrl = `https://r.jina.ai/http://${url.replace(/^https?:\/\//i, "")}`;
  const res = await fetch(mirrorUrl, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/plain,text/markdown;q=0.9,*/*;q=0.8"
    }
  });
  if (!res.ok) {
    throw new Error(`Reader mirror status ${res.status}`);
  }
  return res.text();
}

function safeCodePoint(num) {
  if (!Number.isFinite(num) || num <= 0 || num > 0x10ffff) return "";
  try {
    return String.fromCodePoint(num);
  } catch {
    return "";
  }
}

function decodeEntities(input) {
  if (!input) return "";
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&(apos|#039);/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtml(input) {
  return String(input || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ");
}

function cleanText(input) {
  return decodeEntities(stripHtml(input)).replace(/\s+/g, " ").trim();
}

function escapeHtml(input) {
  return String(input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isChallengePage(html) {
  const sample = String(html || "").slice(0, 3000);
  return /just a moment|challenge-platform|cf-browser-verification|attention required/i.test(sample);
}

function kahaniPageUrl(page) {
  if (page <= 1) return `${KAHANI_BASE}/`;
  return `${KAHANI_BASE}/page/${page}/`;
}

function extractStories(html, perPage = 24) {
  const stories = [];
  const articleRegex = /<article\b[\s\S]*?<\/article>/gi;
  let match;
  while ((match = articleRegex.exec(html)) !== null && stories.length < perPage) {
    const block = match[0];

    const titleMatch = block.match(
      /<h2[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>\s*<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i
    );
    if (!titleMatch) continue;

    const url = absUrl(KAHANI_BASE, titleMatch[1] || "").trim();
    const title = cleanText(titleMatch[2] || "");
    if (!url || !title) continue;

    const excerptMatch = block.match(
      /<div[^>]*class=["'][^"']*entry-content[^"']*["'][^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i
    );
    const excerpt = cleanText(excerptMatch ? excerptMatch[1] : "");

    const thumbMatch = block.match(/<img[^>]+(?:data-src|data-lazy-src|src)=["']([^"']+)["'][^>]*>/i);
    const thumbnail = thumbMatch ? absUrl(KAHANI_BASE, thumbMatch[1]) : "";

    const dateMatch = block.match(/<time[^>]*datetime=["']([^"']+)["']/i);
    const categoryMatch = block.match(/rel=["'][^"']*category tag[^"']*["'][^>]*>([^<]+)<\/a>/i);

    stories.push({
      title,
      url,
      excerpt: excerpt || "Read full story.",
      thumbnail,
      date: dateMatch ? cleanText(dateMatch[1]) : "",
      category: categoryMatch ? cleanText(categoryMatch[1]) : ""
    });
  }
  return stories;
}

function extractNextUrl(html) {
  const relNext = html.match(/<link[^>]+rel=["']next["'][^>]+href=["']([^"']+)["']/i);
  if (relNext && relNext[1]) return absUrl(KAHANI_BASE, relNext[1]);

  const navNext = html.match(/<a[^>]+class=["'][^"']*next[^"']*["'][^>]+href=["']([^"']+)["']/i);
  if (navNext && navNext[1]) return absUrl(KAHANI_BASE, navNext[1]);

  return "";
}

function isAllowedStoryUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    return /^https?:$/i.test(u.protocol) && /(^|\.)freesexkahani\.com$/i.test(u.hostname);
  } catch {
    return false;
  }
}

function buildStoryParagraphs(articleHtml) {
  const paras = [];
  const paraRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let p;
  while ((p = paraRegex.exec(articleHtml)) !== null) {
    const text = cleanText(p[1]);
    if (text && text.length >= 20) {
      paras.push(text);
    }
  }
  return paras;
}

function extractStoryDetail(html, storyUrl) {
  const articleMatch = html.match(/<article\b[\s\S]*?<\/article>/i);
  const article = articleMatch ? articleMatch[0] : html;

  const titleMatch =
    article.match(/<h1[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i) ||
    article.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const dateMatch = article.match(/<time[^>]*datetime=["']([^"']+)["']/i);
  const catMatch = article.match(/rel=["'][^"']*category tag[^"']*["'][^>]*>([^<]+)<\/a>/i);
  const ogImgMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  const inlineImgMatch = article.match(/<img[^>]+(?:data-src|data-lazy-src|src)=["']([^"']+)["'][^>]*>/i);

  const title = cleanText(titleMatch ? titleMatch[1] : "");
  const date = cleanText(dateMatch ? dateMatch[1] : "");
  const category = cleanText(catMatch ? catMatch[1] : "");
  const thumbnail = absUrl(
    KAHANI_BASE,
    (ogImgMatch && ogImgMatch[1]) || (inlineImgMatch && inlineImgMatch[1]) || ""
  );
  const paragraphs = buildStoryParagraphs(article);
  const content_html = paragraphs.map((line) => `<p>${escapeHtml(line)}</p>`).join("");

  return {
    url: storyUrl,
    title: title || "Story",
    date,
    category,
    thumbnail,
    paragraphs,
    content_html
  };
}

function extractStoryFromReaderMirror(raw, storyUrl) {
  const text = String(raw || "");
  const titleMatch = text.match(/(?:^|\n)Title:\s*(.+)\n/i);
  const publishedMatch = text.match(/(?:^|\n)Published Time:\s*(.+)\n/i);
  const markdownStart = text.search(/\nMarkdown Content:\s*\n/i);
  const markdownBody = markdownStart >= 0 ? text.slice(markdownStart).replace(/^[\s\S]*?Markdown Content:\s*\n/i, "") : "";

  const paragraphs = markdownBody
    .split(/\n{2,}/)
    .map((line) => cleanText(line.replace(/^#+\s*/g, "")))
    .filter((line) => line.length >= 20);

  const content_html = paragraphs.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
  const title = cleanText(titleMatch ? titleMatch[1] : "");
  const date = cleanText(publishedMatch ? publishedMatch[1] : "");

  return {
    url: storyUrl,
    title: title || "Story",
    date,
    category: "",
    thumbnail: "",
    paragraphs,
    content_html
  };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (path === "/" || path === "") {
      return json(
        {
          ok: true,
          message: "Stories worker is running",
          endpoints: [
            "/kahani-feed?page=1&per_page=24",
            "/stories-feed?page=1&per_page=24",
            "/story-detail?url=ENCODED_STORY_URL",
            "/kahani-detail?url=ENCODED_STORY_URL"
          ]
        },
        200,
        "public, max-age=300"
      );
    }

    if (path === "/story-detail" || path === "/kahani-detail") {
      const rawStoryUrl = (url.searchParams.get("url") || "").trim();
      if (!rawStoryUrl || !isAllowedStoryUrl(rawStoryUrl)) {
        return json({ status: 400, msg: "Invalid story URL" }, 400, "no-store");
      }

      let directError = "";
      try {
        const html = await fetchText(rawStoryUrl);
        if (!isChallengePage(html)) {
          const detail = extractStoryDetail(html, rawStoryUrl);
          if (detail.title && detail.paragraphs.length > 0) {
            return json({ status: 200, msg: "OK", result: detail }, 200, "no-store");
          }
        } else {
          directError = "Source challenge page returned";
        }
      } catch (err) {
        directError = err && err.message ? err.message : "Direct fetch failed";
      }

      try {
        const mirrorRaw = await fetchReaderMirror(rawStoryUrl);
        const mirrorDetail = extractStoryFromReaderMirror(mirrorRaw, rawStoryUrl);
        if (!mirrorDetail.title || mirrorDetail.paragraphs.length === 0) {
          return json({ status: 404, msg: "Story detail not found" }, 404, "no-store");
        }
        return json(
          {
            status: 200,
            msg: "OK",
            result: mirrorDetail,
            source_mode: "reader_mirror"
          },
          200,
          "no-store"
        );
      } catch (err) {
        const mirrorError = err && err.message ? err.message : "Mirror fetch failed";
        return json(
          { status: 502, msg: `Story detail failed. direct=${directError || "na"} mirror=${mirrorError}` },
          502,
          "no-store"
        );
      }
    }

    if (path !== "/kahani-feed" && path !== "/stories-feed") {
      return json({ ok: false, error: "Not Found" }, 404, "no-store");
    }

    const rawPage = parseInt(url.searchParams.get("page") || "1", 10);
    const rawPerPage = parseInt(url.searchParams.get("per_page") || "24", 10);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const perPage = Number.isFinite(rawPerPage) && rawPerPage > 0 ? Math.min(rawPerPage, 50) : 24;

    try {
      const html = await fetchText(kahaniPageUrl(page));
      if (isChallengePage(html)) {
        return json(
          { status: 503, msg: "Source site challenge page returned. Retry after some time." },
          503,
          "no-store"
        );
      }

      const stories = extractStories(html, perPage);
      const nextUrl = extractNextUrl(html);

      return json(
        {
          status: 200,
          msg: "OK",
          result: {
            source: KAHANI_BASE,
            page,
            per_page: perPage,
            total: stories.length,
            has_next: Boolean(nextUrl),
            next_page: nextUrl ? page + 1 : null,
            next_url: nextUrl,
            stories
          }
        },
        200,
        "public, max-age=180"
      );
    } catch (err) {
      return json({ status: 502, msg: err.message || "Kahani feed failed" }, 502, "no-store");
    }
  }
};
