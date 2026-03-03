export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const TARGET_SITE = "https://porngif.xxx"; 

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

    // 1. PROXY MODE
    if (url.pathname === '/proxy') {
      let targetUrl = url.searchParams.get('url');
      if (!targetUrl) return new Response('Missing URL', { status: 400 });

      // Relative URL Fix
      if (!targetUrl.startsWith('http')) {
         if (!targetUrl.startsWith('/')) targetUrl = '/' + targetUrl;
         targetUrl = TARGET_SITE + targetUrl;
      }

      try {
        const mediaRes = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Referer': TARGET_SITE
          }
        });

        const newHeaders = new Headers(mediaRes.headers);
        newHeaders.set('Access-Control-Allow-Origin', '*');
        return new Response(mediaRes.body, {
          status: mediaRes.status,
          headers: newHeaders
        });
      } catch (e) {
        return new Response("Proxy Error", { status: 500, headers: corsHeaders });
      }
    }

    // 2. SCRAPER MODE
    if (url.pathname === '/feed' || url.pathname === '/') {
      const page = url.searchParams.get('page') || '1';
      let fetchUrl = page === '1' ? TARGET_SITE : `${TARGET_SITE}/page/${page}`;

      try {
        const response = await fetch(fetchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36'
          }
        });

        const links = [];
        const scraper = new HTMLRewriter()
          .on('img', new ElementHandler(links)) 
          .on('video source', new ElementHandler(links));

        await scraper.transform(response).text();

        // Unique Links Filter
        const uniqueLinks = [...new Set(links)].filter(link => link);

        return new Response(JSON.stringify({
          page: page,
          total: uniqueLinks.length,
          data: uniqueLinks
        }), { headers: corsHeaders });

      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { headers: corsHeaders });
      }
    }

    return new Response("Not Found. Use /feed or /proxy", { status: 404 });
  }
};

// --- HTML Parser Class ---
class ElementHandler {
  constructor(linksArray) {
    this.links = linksArray;
  }

  element(element) {
    let src = element.getAttribute('src');
    if (!src) src = element.getAttribute('data-src');

    if (src) {
      // 1. URL Fix: Relative path ko Full path banana
      if (!src.startsWith('http')) {
        if (!src.startsWith('/')) {
             src = '/' + src;
        }
        src = "https://porngif.xxx" + src;
      }
      
      // 2. FILTER: Sirf GIF, MP4, WEBM (No JPG/PNG)
      // Yahan maine change kiya hai
      if (src.match(/\.(gif|mp4|webm)$/i)) {
        this.links.push(src);
      }
    }
  }
}