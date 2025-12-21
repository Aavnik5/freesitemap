addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request))
})

// ============================================================
// CONFIGURATION
// ============================================================
const GDRIVE_API_KEY = "AIzaSyDRdALy4oYz3LWiGuaQ5jB7P6pCYTrvRhA";
// ============================================================

async function handleRequest(request) {
  const url = new URL(request.url)
  const path = url.pathname

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Range",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range",
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  // --- PART A: REDGIFS API (No Changes) ---
  if (path === "/redgifs/niches") {
    // ... (Existing Redgifs code same as before) ...
    try {
      const response = await fetch("https://api.redgifs.com/v2/niches", {
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      const data = await response.json();
      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: true }), { status: 200, headers: corsHeaders });
    }
  }
  
  if (path.startsWith("/redgifs/feed/")) {
    let rawQuery = decodeURIComponent(path.split("/")[3]);
    let cleanQuery = rawQuery.replace(/^(niche:|tag:|user:)/, "");
    const page = url.searchParams.get("page") || "1";

    try {
      const headers = { "User-Agent": "Mozilla/5.0", "Referer": "https://www.redgifs.com/" };
      const authRes = await fetch("https://api.redgifs.com/v2/auth/temporary", { headers });
      const token = (await authRes.json()).token;

      let apiUrl = "";
      const baseParams = `count=20&page=${page}`;

      if (rawQuery === "trending") {
        apiUrl = `https://api.redgifs.com/v2/gifs/search?order=trending&${baseParams}`;
      } else if (rawQuery === "new") {
        apiUrl = `https://api.redgifs.com/v2/gifs/search?order=latest&${baseParams}`;
      } else if (rawQuery.startsWith("user:")) {
        apiUrl = `https://api.redgifs.com/v2/users/${cleanQuery}/search?order=latest&${baseParams}`;
      } else {
        apiUrl = `https://api.redgifs.com/v2/gifs/search?search_text=${encodeURIComponent(cleanQuery)}&order=latest&${baseParams}`;
      }

      const apiResponse = await fetch(apiUrl, { headers: { "Authorization": `Bearer ${token}`, ...headers } });
      const data = await apiResponse.json();

      return new Response(JSON.stringify(data), {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
          "Cache-Control": "public, max-age=60"
        }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: true, message: err.message, gifs: [] }), {
        status: 200,
        headers: corsHeaders
      });
    }
  }

  // --- PART B: VIDEO PROXY ---
  if (path.startsWith("/proxy/video")) {
    const videoUrl = url.searchParams.get("url");
    if (!videoUrl) return new Response("No URL", { status: 400 });

    const range = request.headers.get("Range");
    const fetchHeaders = { "User-Agent": "Mozilla/5.0", "Referer": "https://www.redgifs.com/" };
    if (range) fetchHeaders["Range"] = range;

    const response = await fetch(videoUrl, { headers: fetchHeaders });

    const newHeaders = new Headers(response.headers);
    newHeaders.set("Access-Control-Allow-Origin", "*");
    newHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Range");

    return new Response(response.body, { status: response.status, headers: newHeaders });
  }

// --- NEW: SINGLE REDGIF ---
const gifIdMatch = path.match(/^\/redgifs\/gif\/(.+)/);
if (gifIdMatch) {
    const gifId = gifIdMatch[1];
    try {
        const headers = { "User-Agent": "Mozilla/5.0" };
        const authRes = await fetch("https://api.redgifs.com/v2/auth/temporary", { headers });
        const token = (await authRes.json()).token;

        const apiUrl = `https://api.redgifs.com/v2/gifs/${gifId}`;
        const apiResponse = await fetch(apiUrl, {
            headers: {
                "Authorization": `Bearer ${token}`,
                ...headers
            }
        });
        const data = await apiResponse.json();

        return new Response(JSON.stringify(data), {
            headers: {
                "Content-Type": "application/json",
                ...corsHeaders,
                "Cache-Control": "public, max-age=3600"
            }
        });
    } catch (err) {
        return new Response(JSON.stringify({
            error: true,
            message: err.message
        }), {
            status: 500,
            headers: corsHeaders
        });
    }
}
  if (path.startsWith("/proxy/image")) {
    const imageUrl = url.searchParams.get("url");
    if (!imageUrl) return new Response("No URL", { status: 400 });

    const response = await fetch(imageUrl, {
        headers: { "User-Agent": "Mozilla/5.0" }
    });

    const newHeaders = new Headers(response.headers);
    newHeaders.set("Access-Control-Allow-Origin", "*");
    newHeaders.set("Cache-Control", "public, max-age=86400");

    return new Response(response.body, {
        status: response.status,
        headers: newHeaders
    });
  }

  // --- PART C: GOOGLE DRIVE LIST (UPDATED FOR LOAD MORE) ---
  if (path.startsWith("/gdrive/list")) {
    const folderId = url.searchParams.get("folderId");
    const pageToken = url.searchParams.get("pageToken"); // Load More ke liye token

    if (!folderId) return new Response(JSON.stringify({ error: "Folder ID is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });

    // PageToken logic add kiya hai
    let gdriveUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&key=${GDRIVE_API_KEY}&fields=nextPageToken,files(id,name,mimeType,thumbnailLink,createdTime)&orderBy=createdTime desc&pageSize=50`;
    
    if (pageToken) {
      gdriveUrl += `&pageToken=${pageToken}`;
    }

    try {
      const response = await fetch(gdriveUrl);
      const data = await response.json();
      
      if (data.error) throw new Error(data.error.message);

      // Ab ye files aur nextPageToken dono return karega
      return new Response(JSON.stringify({
        files: data.files || [],
        nextPageToken: data.nextPageToken || null 
      }), {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
          "Cache-Control": "public, max-age=300"
        }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: true, message: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }
  }

  // --- PART C: GOOGLE DRIVE FILE PROXY (UPDATED) ---
  const fileIdMatch = path.match(/^\/gdrive\/file\/(.+)/);
  if (fileIdMatch) {
    const fileId = fileIdMatch[1];
    
    // URL direct content serve karne ke liye
    const driveUrl = `https://drive.google.com/uc?id=${fileId}&export=download`;
    
    try {
        const dRes = await fetch(driveUrl, {
            method: "GET",
            headers: {
                "User-Agent": "Mozilla/5.0" // Browser ban ke request bhejna zaroori hai
            }
        });

        const dResContentType = dRes.headers.get("content-type");

        // Agar Google "Virus Scan" wala HTML page bhej raha hai, toh error show karo
        if (dResContentType && dResContentType.includes("text/html")) {
             const text = await dRes.text();
             if(text.includes("Google Drive - Virus scan warning")) {
                 return new Response("File too large (Google Virus Scan Block)", { status: 403, headers: corsHeaders });
             }
             return new Response("Access Denied or File Not Found on Google Drive (Make sure folder is Public)", { status: 404, headers: corsHeaders });
        }

        const newHeaders = new Headers(corsHeaders);
        newHeaders.set("Content-Type", dRes.headers.get("content-type") || "application/octet-stream");
        newHeaders.set("Content-Length", dRes.headers.get("content-length") || "");
        newHeaders.set("Cache-Control", "public, max-age=2592000"); // 30 Days cache
        newHeaders.set("Content-Disposition", "inline"); // Force browser to show, not download

        return new Response(dRes.body, {
        status: dRes.status,
        headers: newHeaders
        });
    } catch (e) {
        return new Response("Proxy Error", { status: 500, headers: corsHeaders });
    }
  }
  
  return new Response("Invalid Request", { status: 400, headers: corsHeaders });
}