export default {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      const path = url.pathname;
      const TARGET_HOST = "https://spankbang.com";
  
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json"
      };
  
      if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  
      // --- 1. FEED SCRAPER (List of Videos) ---
      if (path === '/desi-feed') {
        const page = url.searchParams.get('page') || '1';
        const filter = url.searchParams.get('filter') || 'latest'; 
        const category = url.searchParams.get('category') || 'mixed'; 
        
        let sortParam = "o=new";
        if (filter === 'top' || filter === 'popular') sortParam = "o=all"; 
        else if (filter === 'trending') sortParam = "o=views"; 
        
        const urlDesi = `${TARGET_HOST}/s/desi/${page}/?${sortParam}`;
        const urlIndian = `${TARGET_HOST}/s/indian/${page}/?${sortParam}`;
  
        try {
          let videos = [];
          if (category === 'desi') {
              const html = await fetchHTML(urlDesi);
              videos = extractVideosFromHTML(html, "Desi");
          } else if (category === 'indian') {
              const html = await fetchHTML(urlIndian);
              videos = extractVideosFromHTML(html, "Indian");
          } else {
              const [resDesi, resIndian] = await Promise.all([fetchHTML(urlDesi), fetchHTML(urlIndian)]);
              const all = [...extractVideosFromHTML(resDesi, "Desi"), ...extractVideosFromHTML(resIndian, "Indian")];
              const seen = new Set();
              videos = all.filter(v => {
                  const duplicate = seen.has(v.video_page_url);
                  seen.add(v.video_page_url);
                  return !duplicate;
              });
          }
          // Fallback logic
          if (videos.length === 0 && page === '1') {
               const fallbackHtml = await fetchHTML(`${TARGET_HOST}/s/desi/1/?o=new`);
               videos = extractVideosFromHTML(fallbackHtml, "Fallback");
          }
          return new Response(JSON.stringify({ success: true, page, filter, count: videos.length, data: videos }), { headers: corsHeaders });
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), { headers: corsHeaders });
        }
      }
  
      // --- 2. VIDEO DETAILS (Duration & Views Extraction) ---
      if (path === '/video-details') {
          const videoUrl = url.searchParams.get('url');
          if (!videoUrl) return new Response(JSON.stringify({ error: "URL Missing" }), { headers: corsHeaders });
  
          try {
              const response = await fetch(videoUrl, {
                  headers: {
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
                      'Referer': TARGET_HOST
                  }
              });
              const html = await response.text();
  
              const title = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]?.trim() || "Video";
              
              // ⏱️ EXTRACT TIME (DURATION)
              // Pattern: <span class="i-length"></span> 10 min 23 sec
              const durationMatch = html.match(/class=["']i-length["'][^>]*><\/span>\s*([^<]+)/i);
              const duration = durationMatch ? durationMatch[1].trim() : "Unknown";

              // 👁️ EXTRACT VIEWS
              // Pattern: <span class="i-view"></span> 25k
              const viewsMatch = html.match(/class=["']i-view["'][^>]*><\/span>\s*([\d,kKmM\.]+)/i);
              const views = viewsMatch ? viewsMatch[1].trim() : "Hot";

              // SEO Data
              const ogImage = html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i);
              const thumbnail = ogImage ? ogImage[1] : null;
              const descMatch = html.match(/name=["']description["']\s+content=["']([^"']+)["']/i);
              const description = descMatch ? descMatch[1] : `Watch ${title}`;

              // Streams Extraction
              let streams = {};
              let defaultStream = null;
              const streamDataMatch = html.match(/stream_data\s*=\s*({.*?});/s);
              
              if (streamDataMatch) {
                  try {
                      const jsonStr = streamDataMatch[1];
                      const q4k = jsonStr.match(/(?:['"]?)4k(?:['"]?)\s*:\s*\[\s*['"]([^'"]+)['"]/);
                      const q1080 = jsonStr.match(/(?:['"]?)1080p(?:['"]?)\s*:\s*\[\s*['"]([^'"]+)['"]/);
                      const q720 = jsonStr.match(/(?:['"]?)720p(?:['"]?)\s*:\s*\[\s*['"]([^'"]+)['"]/);
                      const q480 = jsonStr.match(/(?:['"]?)480p(?:['"]?)\s*:\s*\[\s*['"]([^'"]+)['"]/);
                      const q320 = jsonStr.match(/(?:['"]?)320p(?:['"]?)\s*:\s*\[\s*['"]([^'"]+)['"]/);
                      
                      if (q4k) streams['4k'] = q4k[1];
                      if (q1080) streams['1080p'] = q1080[1];
                      if (q720) streams['720p'] = q720[1];
                      if (q480) streams['480p'] = q480[1];
                      if (q320) streams['320p'] = q320[1];
  
                      // Default Priority: 720p > 480p > 1080p
                      if (streams['720p']) defaultStream = streams['720p'];
                      else if (streams['480p']) defaultStream = streams['480p'];
                      else if (streams['1080p']) defaultStream = streams['1080p'];
                      else defaultStream = Object.values(streams)[0];
                  } catch(e) {}
              }
              
              if (!defaultStream) {
                  const simpleStream = html.match(/var\s+stream_url\s*=\s*['"]([^'"]+)['"]/i);
                  if (simpleStream) { defaultStream = simpleStream[1]; streams['default'] = defaultStream; }
              }
              
              if (!defaultStream) {
                  const og = html.match(/property=["']og:video["']\s+content=["']([^"']+)["']/i);
                  if (og) { defaultStream = og[1]; streams['default'] = defaultStream; }
              }
  
              const tags = [];
              const tagsRegex = /<a[^>]+href=["']\/[\w\d]+\/[^"']+["'][^>]*class=["']n["'][^>]*>([^<]+)<\/a>/g;
              let tagMatch;
              while ((tagMatch = tagsRegex.exec(html)) !== null) { if(tagMatch[1]) tags.push(tagMatch[1].trim()); }
  
              const relatedVideos = extractVideosFromHTML(html, "Related").filter(v => v.video_page_url !== videoUrl).slice(0, 12);
  
              return new Response(JSON.stringify({ 
                  success: true, 
                  title, 
                  duration, // ✅ Time Added
                  views,    // ✅ Views Added
                  thumbnail, 
                  description, 
                  stream_url: defaultStream, 
                  streams: streams,          
                  tags, 
                  related_videos: relatedVideos 
              }), { headers: corsHeaders });
  
          } catch (e) {
              return new Response(JSON.stringify({ error: e.message }), { headers: corsHeaders });
          }
      }
  
      // Proxy
      if (path === '/proxy') {
         const imgUrl = url.searchParams.get('url');
         if (!imgUrl) return new Response("No URL", { status: 400, headers: corsHeaders });
         const imgRes = await fetch(imgUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
         return new Response(imgRes.body, { headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "image/jpeg" } });
      }
  
      return new Response("Worker Ready", { status: 200, headers: corsHeaders });
    }
};

async function fetchHTML(url) {
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' } });
        return await res.text();
    } catch (e) { return ""; }
}

function extractVideosFromHTML(html, sourceName) {
    const videos = [];
    const regex = /<div[^>]+class=["']video-item[^"']*["'][^>]*>([\s\S]*?)<\/div\s*>\s*<\/div>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
        const block = match[1];
        const linkMatch = block.match(/<a[^>]+href=["'](\/[^"']+)["'][^>]*title=["']([^"']+)["']/i);
        const imgMatch = block.match(/data-src=["']([^"']+)["']/i) || block.match(/src=["']([^"']+)["']/i);
        
        // ⏱️ LIST PAGE DURATION
        const durMatch = block.match(/class=["']l["']>([^<]+)</i);
        // 👁️ LIST PAGE VIEWS
        const viewsMatch = block.match(/class=["']v["']>([^<]+)</i);

        if (linkMatch && imgMatch) {
            let thumb = imgMatch[1].startsWith('//') ? 'https:' + imgMatch[1] : imgMatch[1];
            videos.push({
                title: linkMatch[2], 
                thumbnail: thumb,
                video_page_url: `https://spankbang.com${linkMatch[1]}`,
                duration: durMatch ? durMatch[1] : "HD", // ✅ Duration
                views: viewsMatch ? viewsMatch[1] : "Hot", // ✅ Views
                source: sourceName
            });
        }
    }
    return videos;
}