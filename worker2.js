export default {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      const TARGET_HOST = "https://freshporno.net"; 
      const MY_DOMAIN = "https://freepornx.site"; // Isse check kar lena
      const limit = parseInt(url.searchParams.get('limit')) || 40; 
  
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Range",
        "Access-Control-Expose-Headers": "Content-Length, Content-Range, Content-Type",
        "Content-Type": "application/json"
      };
  
      if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
      let pathname = url.pathname.replace(/\/+/g, '/');

      // ================================================================
      // 1. SEO INJECTION (For Googlebot/Indexing)
      // ================================================================
      const videoSlug = url.searchParams.get("view");
      if (videoSlug && request.headers.get("accept")?.includes("text/html") && pathname === "/") {
        try {
          const sourceVideoUrl = `${TARGET_HOST}/videos/${videoSlug}/`; 
          const sourceRes = await fetch(sourceVideoUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' }
          });
          const sourceHtml = await sourceRes.text();
          const titleMatch = sourceHtml.match(/<title>(.*?)<\/title>/);
          const thumbMatch = sourceHtml.match(/property="og:image" content="(.*?)"/);
          let videoTitle = titleMatch ? titleMatch[1].replace("- FreshPorno", "").trim() : "Watch Video";
          let videoThumb = thumbMatch ? thumbMatch[1] : "";

          const netlifyRes = await fetch(`${MY_DOMAIN}/video-viewer.html`);
          return new HTMLRewriter()
            .on("title", { element(e) { e.setInnerContent(`${videoTitle} - FreePornX`); } })
            .on('meta[name="description"]', { element(e) { e.setAttribute("content", `Watch ${videoTitle} in HD on FreePornX. Best viral videos updated daily.`); } })
            .on('meta[property="og:title"]', { element(e) { e.setAttribute("content", videoTitle); } })
            .on('meta[property="og:image"]', { element(e) { e.setAttribute("content", videoThumb); } })
            .on('link[rel="canonical"]', { element(e) { e.setAttribute("href", request.url); } })
            .transform(netlifyRes);
        } catch (e) { }
      }

      // ================================================================
      // 2. PROXY MODE
      // ================================================================
      if (pathname === '/proxy') {
        let targetUrl = url.searchParams.get('url');
        if (!targetUrl) return new Response(JSON.stringify({ error: 'Invalid URL' }), { status: 400, headers: corsHeaders });
        if (!targetUrl.startsWith('http')) {
            if (targetUrl.startsWith('//')) targetUrl = 'https:' + targetUrl;
            else if (targetUrl.startsWith('/')) targetUrl = TARGET_HOST + targetUrl;
            else targetUrl = TARGET_HOST + '/' + targetUrl;
        }
        try {
          let headers = {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
              'Referer': TARGET_HOST + '/',
              'Range': request.headers.get("Range") || 'bytes=0-'
          };
          let response = await fetch(targetUrl, { headers: headers, redirect: 'follow' });
          const newHeaders = new Headers(response.headers);
          newHeaders.set('Access-Control-Allow-Origin', '*');
          return new Response(response.body, { status: response.status, headers: newHeaders });
        } catch (e) { return new Response(JSON.stringify({ error: "Stream Error" }), { status: 500, headers: corsHeaders }); }
      }
  
      // ================================================================
      // 3. FEED MODE
      // ================================================================
      if (pathname === '/feed') {
        const page = parseInt(url.searchParams.get('page')) || 1;
        const category = url.searchParams.get('cat') || 'new'; 
        const query = url.searchParams.get('q');
        let customPath = url.searchParams.get('path'); 
        let fetchUrl;
        if (customPath) {
            if (customPath.startsWith('http')) { try { const tempUrl = new URL(customPath); customPath = tempUrl.pathname; } catch (e) { } }
            if (customPath.startsWith('/')) customPath = customPath.substring(1);
            if (customPath.endsWith('/')) customPath = customPath.slice(0, -1);
            fetchUrl = (page === 1) ? `${TARGET_HOST}/${customPath}/` : `${TARGET_HOST}/${customPath}/${page}/`;
        } 
        else if (query) {
            const encodedQuery = encodeURIComponent(query).replace(/%20/g, '+');
            fetchUrl = (page === 1) ? `${TARGET_HOST}/search/${encodedQuery}/` : `${TARGET_HOST}/search/${encodedQuery}/${page}/`;
        } else {
            let path = "";
            if (category === 'top') path = "top-rated/";
            else if (category === 'popular') path = "most-popular/";
            if (page === 1) fetchUrl = `${TARGET_HOST}/${path}`;
            else fetchUrl = (path === "") ? `${TARGET_HOST}/${page}/` : `${TARGET_HOST}/${path}${page}/`;
        }
        try {
          const response = await fetch(fetchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          const html = await response.text();
          const items = [];
          const universalLinkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
          const imgRegex = /<img[^>]+(?:data-src|data-original|src)=["']([^"']+)["']/i;
          let match;
          while ((match = universalLinkRegex.exec(html)) !== null) {
              let href = match[1]; const innerContent = match[2];
              if (!href || (!href.includes('/video') && !href.match(/\/\d+\//))) continue;
              const thumbMatch = innerContent.match(imgRegex);
              if (!thumbMatch) continue; 
              let thumb = thumbMatch[1];
              if (!href.startsWith('http')) href = TARGET_HOST + (href.startsWith('/') ? href : '/' + href);
              if (!thumb.startsWith('http')) thumb = thumb.startsWith('/') ? TARGET_HOST + thumb : TARGET_HOST + '/' + thumb;
              let title = ""; const tAttr = innerContent.match(/(?:title=["']([^"']+)["']|alt=["']([^"']+)["'])/i);
              if (tAttr) title = tAttr[1] || tAttr[2];
              items.push({ title: title || "Video", thumbnail: thumb, video_page_url: href });
          }
          const uniqueItems = [...new Map(items.map(item => [item['video_page_url'], item])).values()];
          return new Response(JSON.stringify({ data: uniqueItems.slice(0, limit) }), { headers: corsHeaders });
        } catch (err) { return new Response(JSON.stringify({ error: err.message }), { headers: corsHeaders }); }
      }
  
      // ================================================================
      // 4. EXTRACT MODE (Restored Full Logic)
      // ================================================================
      if (pathname === '/extract') {
          const videoPageUrl = url.searchParams.get('url');
          if (!videoPageUrl) return new Response(JSON.stringify({ error: "Missing Page URL" }), { headers: corsHeaders });
          try {
              const response = await fetch(videoPageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
              const html = await response.text();
              
              // 1. MP4 URL extraction
              let mp4Link = "";
              const getFileMatch = html.match(/(https?:\/\/[^"']+\/get_file\/[^"']*)/i);
              if (getFileMatch) mp4Link = getFileMatch[1];
              if (!mp4Link) { const varMatch = html.match(/(?:video_url|video_src|file)\s*[:=]\s*["'](https?:\/\/[^"']+)["']/i); if (varMatch) mp4Link = varMatch[1]; }
              
              // 2. Metadata extraction
              let title = "", thumbnail = "", tags = "";
              const titleM = html.match(/<meta property="og:title" content="([^"]+)"/i); if(titleM) title = titleM[1];
              const thumbM = html.match(/<meta property="og:image" content="([^"]+)"/i); if(thumbM) thumbnail = thumbM[1];
              const tagsM = html.match(/<meta name="keywords" content="([^"]+)"/i); if(tagsM) tags = tagsM[1];
              
              // 3. DESCRIPTION (RESTORED FALLBACK)
              let description = ""; 
              const descMatch = html.match(/<div class=["']text["'][^>]*>([\s\S]*?)<\/div>/i) || html.match(/<meta property="og:description" content="([^"]+)"/i);
              if(descMatch) description = descMatch[1].replace(/<[^>]+>/g, '').trim();

              // 4. MODELS & CHANNELS (RESTORED FULL FILTERS)
              const models = [], channels = [];
              const entityLinkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
              let m;
              while ((m = entityLinkRegex.exec(html)) !== null) {
                  const href = m[1], name = m[2].replace(/<[^>]+>/g, '').trim();
                  if (!name || m[2].includes('<img')) continue;
                  if (href.includes('/models/') || href.includes('/pornstars/')) {
                      if (!models.some(x => x.url === href)) models.push({ name, url: href });
                  }
                  if (href.includes('/channels/') || href.includes('/sites/')) {
                      if (!channels.some(x => x.url === href)) channels.push({ name, url: href });
                  }
              }

              // 5. RELATED VIDEOS (RESTORED SECTION MATCH)
              const relatedItems = [];
              let relatedHTML = html;
              const relatedSectionMatch = html.match(/class=["'][^"']*(related|recommend)[^"']*["'][\s\S]*?<\/ul>/i);
              if (relatedSectionMatch) { relatedHTML = relatedSectionMatch[0]; }

              const relVideoRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
              let rMatch;
              while ((rMatch = relVideoRegex.exec(relatedHTML)) !== null) {
                  let href = rMatch[1]; const innerContent = rMatch[2];
                  if (!href.includes('/video') && !href.match(/\/\d+\//)) continue;
                  const thumbMatch = innerContent.match(/<img[^>]+(?:data-src|data-original|src)=["']([^"']+)["']/i);
                  if (thumbMatch && relatedItems.length < 16) {
                      let thumb = thumbMatch[1];
                      if (!href.startsWith('http')) href = TARGET_HOST + href;
                      if (!thumb.startsWith('http')) thumb = thumb.startsWith('/') ? TARGET_HOST + thumb : TARGET_HOST + '/' + thumb;
                      relatedItems.push({ title: "Related", video_page_url: href, thumbnail: thumb });
                  }
              }

              return new Response(JSON.stringify({ success: true, title, description, models, channels, thumbnail, tags, mp4_url: mp4Link, related: relatedItems }), { headers: corsHeaders });
          } catch (err) { return new Response(JSON.stringify({ error: "Extract Failed" }), { headers: corsHeaders }); }
      }
  
      return fetch(request); 
    }
};