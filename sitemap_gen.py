import requests
import xml.etree.ElementTree as ET
from datetime import datetime
import time

# --- CONFIGURATION ---
MY_DOMAIN = "https://freepornx.site"
API_URL = "https://sfwalbum.hikeapp-pvtltd.workers.dev/feed" 
MAX_PAGES = 500 

def main():
    video_urls = set()
    print(f"🚀 Scraping started for {MAX_PAGES} pages...")
    
    for p in range(1, MAX_PAGES + 1):
        try:
            # Flexible query parameters
            res = requests.get(f"{API_URL}?page={p}", timeout=15)
            if res.status_code != 200:
                continue
                
            data = res.json().get('data', [])
            if not data: break
            
            new_added = 0
            for item in data:
                # 🔍 Sabse zaroori fix: Multiple keys check karna
                v_url = item.get('url') or item.get('video_page_url')
                
                if v_url:
                    # Slug nikalne ka flexible tarika
                    if '/videos/' in v_url:
                        slug = v_url.split('/videos/')[1].strip('/')
                    elif '/video/' in v_url:
                        slug = v_url.split('/video/')[1].strip('/')
                    else:
                        continue # Skip if not a video link
                        
                    full_viewer_url = f"{MY_DOMAIN}/video-viewer.html?view={slug}"
                    
                    if full_viewer_url not in video_urls:
                        video_urls.add(full_viewer_url)
                        new_added += 1
            
            print(f"✅ Page {p}: Added {new_added} unique videos (Total: {len(video_urls)})")
            
            # Agar 10 pages tak ek bhi naya video na mile, toh ruk jao
            if new_added == 0 and p > 10:
                print("⏭️ No more new content found. Stopping scan.")
                break
                
        except Exception as e:
            print(f"❌ Error at Page {p}: {e}")
            continue

    # Generate XML
    urlset = ET.Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    for link in video_urls:
        u = ET.SubElement(urlset, "url")
        ET.SubElement(u, "loc").text = link
        ET.SubElement(u, "lastmod").text = datetime.now().strftime("%Y-%m-%d")

    ET.ElementTree(urlset).write("sitemap_1.xml", encoding="utf-8", xml_declaration=True)
    print(f"🏁 DONE! Total unique videos saved: {len(video_urls)}")

if __name__ == "__main__":
    main()
